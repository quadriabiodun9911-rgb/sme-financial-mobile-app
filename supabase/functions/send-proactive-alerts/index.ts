// Supabase Edge Function: send-proactive-alerts
//
// Tier-2 (server-side) half of proactive alerts -- the local notifications
// in src/utils/notifications.ts only fire while the app is open; this is
// what reaches a user who hasn't opened it in days. Runs on a schedule
// (see the cron.schedule block at the bottom of
// supabase/migrations/028_proactive_alerts_push.sql), scans every user's
// cash_position_summary row for any of six conditions, and pushes via
// Expo's Push API to that user's registered device token(s).
//
// Phase 2 (029_proactive_alerts_push_v2.sql) added four alerts to the
// original two (low cash runway, rising cost category): overdue invoice
// reminders, an upcoming loan payment, payroll not yet run, and a tax
// shortfall -- picked because they're the highest-stakes "protect the
// owner's money" cases among the app's existing local-only notifications,
// and the ones most likely to matter while the app is closed (a loan
// payment or payroll date doesn't wait for someone to open the app).
//
// Deliberately reads ONLY cash_position_summary, never `transactions` /
// `loans` / `invoices` -- those are stored field-encrypted with a key
// this server never has (see the migration's header comment), so
// cash_position_summary's already-derived numbers (never a lender name,
// staff name, or invoice/customer detail) are the only thing an Edge
// Function can act on here.
//
// Not a user-facing endpoint: protected by a shared secret (CRON_SECRET)
// checked against the x-cron-secret header, since it does privileged work
// across every account using the service-role key regardless of caller
// identity -- the usual "valid Supabase JWT" gate isn't enough on its own,
// as the public anon key is itself a valid JWT.
//
// DEPLOYMENT (not done from this environment -- no Supabase CLI
// credentials here): from a machine with the project linked,
//   supabase functions deploy send-proactive-alerts
//   supabase secrets set CRON_SECRET=<random value>
// then the cron.schedule SQL in the migration file, with that same secret
// and the project's real ref filled in. SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const EXPO_PUSH_API = 'https://exp.host/--/api/v2/push/send';
const LOW_RUNWAY_THRESHOLD_DAYS = 30;
// Mirrors costExposure.ts's own MODEL.breadthThresholdPctPoints -- the same
// bar the Cost Exposure tab itself uses to flag a category, not a
// separately-tuned notification threshold.
const RISING_COST_THRESHOLD_PCT_POINTS = 2;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
// A summary older than this hasn't been refreshed by an open app in a
// while -- stale enough that pushing on it risks telling someone their
// runway is short, or a loan payment is due, when it may have already
// changed. Skip rather than push on data this old.
const MAX_SUMMARY_AGE_MS = 3 * ONE_DAY_MS;

type AlertKind = 'lowCash' | 'risingCost' | 'overdueReminders' | 'loanPayment' | 'payroll' | 'taxShortfall';

const THROTTLE_COLUMN: Record<AlertKind, string> = {
  lowCash: 'last_low_cash_notified_at',
  risingCost: 'last_rising_cost_notified_at',
  overdueReminders: 'last_overdue_reminders_notified_at',
  loanPayment: 'last_loan_payment_notified_at',
  payroll: 'last_payroll_notified_at',
  taxShortfall: 'last_tax_shortfall_notified_at',
};

const SELECT_COLUMNS = [
  'user_id', 'currency', 'updated_at',
  'runway_days', 'last_low_cash_notified_at',
  'top_cost_category', 'top_cost_pct_point_change', 'top_cost_current_pct_of_revenue', 'last_rising_cost_notified_at',
  'overdue_reminders_count', 'last_overdue_reminders_notified_at',
  'loan_payment_due_days', 'loan_payment_due_other_count', 'last_loan_payment_notified_at',
  'payroll_status', 'payroll_days_left', 'payroll_period_label', 'last_payroll_notified_at',
  'tax_shortfall', 'last_tax_shortfall_notified_at',
].join(', ');

interface SummaryRow {
  user_id: string;
  currency: string | null;
  updated_at: string;
  runway_days: number | null;
  last_low_cash_notified_at: string | null;
  top_cost_category: string | null;
  top_cost_pct_point_change: number | null;
  top_cost_current_pct_of_revenue: number | null;
  last_rising_cost_notified_at: string | null;
  overdue_reminders_count: number | null;
  last_overdue_reminders_notified_at: string | null;
  loan_payment_due_days: number | null;
  loan_payment_due_other_count: number | null;
  last_loan_payment_notified_at: string | null;
  payroll_status: 'overdue' | 'due_soon' | null;
  payroll_days_left: number | null;
  payroll_period_label: string | null;
  last_payroll_notified_at: string | null;
  tax_shortfall: number | null;
  last_tax_shortfall_notified_at: string | null;
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isFresh(updatedAt: string): boolean {
  return Date.now() - new Date(updatedAt).getTime() < MAX_SUMMARY_AGE_MS;
}

function dueForThrottle(lastNotifiedAt: string | null): boolean {
  return !lastNotifiedAt || Date.now() - new Date(lastNotifiedAt).getTime() >= ONE_DAY_MS;
}

// Same copy each alert's local-notification counterpart in notifications.ts
// already uses, minus anything the server never has: loanPayment doesn't
// name a lender (loans.lenderName is field-encrypted) and payroll doesn't
// name staff -- both stay generic here on purpose.
function buildMessage(kind: AlertKind, row: SummaryRow): { title: string; body: string } | null {
  const currency = row.currency ?? '₦';
  switch (kind) {
    case 'lowCash':
      return {
        title: 'Cash runway getting short ⏳',
        body: `At your current spending, ${currency} cash on hand runs out in about ${row.runway_days} days. Worth a look before it gets tighter.`,
      };
    case 'risingCost': {
      if (!row.top_cost_category || row.top_cost_pct_point_change == null || row.top_cost_current_pct_of_revenue == null) return null;
      return {
        title: `"${row.top_cost_category}" is taking a bigger bite of revenue 📈`,
        body: `Up ${row.top_cost_pct_point_change.toFixed(1)} points to ${row.top_cost_current_pct_of_revenue.toFixed(0)}% of revenue. Check Cost Exposure in the app for the full picture.`,
      };
    }
    case 'overdueReminders': {
      const count = row.overdue_reminders_count ?? 0;
      if (count <= 0) return null;
      return {
        title: `${count} invoice${count === 1 ? '' : 's'} need${count === 1 ? 's' : ''} a reminder 📬`,
        body: 'Customers are overdue for a payment nudge — open the app to send reminders.',
      };
    }
    case 'loanPayment': {
      if (row.loan_payment_due_days == null) return null;
      const days = row.loan_payment_due_days;
      const other = row.loan_payment_due_other_count ?? 0;
      const body = other > 0
        ? `A loan payment is due in ${days} day${days === 1 ? '' : 's'}, plus ${other} more coming up.`
        : `A loan payment is due in ${days} day${days === 1 ? '' : 's'}.`;
      return { title: 'Loan payment coming up 📅', body };
    }
    case 'payroll': {
      if (!row.payroll_status) return null;
      if (row.payroll_status === 'overdue') {
        return {
          title: 'Payroll was never run 📋',
          body: `No payroll run was recorded for ${row.payroll_period_label ?? 'last period'}. Log it if staff were paid another way.`,
        };
      }
      const days = row.payroll_days_left;
      return {
        title: 'Payroll not run yet this month 📋',
        body: `${days ?? 'A few'} day${days === 1 ? '' : 's'} left in ${row.payroll_period_label ?? 'this period'} and payroll hasn't been run yet.`,
      };
    }
    case 'taxShortfall': {
      if (row.tax_shortfall == null || row.tax_shortfall <= 0) return null;
      return {
        title: 'May not cover your tax bill 💰',
        body: `You could be short by ${currency}${Math.round(row.tax_shortfall).toLocaleString()} against tax already collected. Set cash aside before it's due.`,
      };
    }
  }
}

async function sendExpoPush(tokens: string[], title: string, body: string): Promise<void> {
  if (tokens.length === 0) return;
  const messages = tokens.map(to => ({ to, title, body, sound: 'default' }));
  // Expo caps a single push request at 100 messages -- chunk defensively,
  // even though no single business's device count is likely to hit that.
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      await fetch(EXPO_PUSH_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(chunk),
      });
    } catch (e) {
      console.error('[send-proactive-alerts] Expo push request failed', e);
    }
  }
}

async function fetchDueRows(admin: SupabaseClient, oneDayAgoIso: string, kind: AlertKind): Promise<SummaryRow[]> {
  const throttleCol = THROTTLE_COLUMN[kind];
  let query = admin.from('cash_position_summary').select(SELECT_COLUMNS)
    .or(`${throttleCol}.is.null,${throttleCol}.lt.${oneDayAgoIso}`);

  switch (kind) {
    case 'lowCash':
      query = query.not('runway_days', 'is', null).lt('runway_days', LOW_RUNWAY_THRESHOLD_DAYS);
      break;
    case 'risingCost':
      query = query.gt('top_cost_pct_point_change', RISING_COST_THRESHOLD_PCT_POINTS);
      break;
    case 'overdueReminders':
      query = query.not('overdue_reminders_count', 'is', null).gt('overdue_reminders_count', 0);
      break;
    case 'loanPayment':
      query = query.not('loan_payment_due_days', 'is', null);
      break;
    case 'payroll':
      // Only 'overdue' / 'due_soon' are ever stored -- the client writes
      // null for 'none' (see pushRegistration.ts).
      query = query.not('payroll_status', 'is', null);
      break;
    case 'taxShortfall':
      query = query.not('tax_shortfall', 'is', null).gt('tax_shortfall', 0);
      break;
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as SummaryRow[];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const oneDayAgoIso = new Date(Date.now() - ONE_DAY_MS).toISOString();
    const kinds: AlertKind[] = ['lowCash', 'risingCost', 'overdueReminders', 'loanPayment', 'payroll', 'taxShortfall'];
    const sentCounts: Record<AlertKind, number> = { lowCash: 0, risingCost: 0, overdueReminders: 0, loanPayment: 0, payroll: 0, taxShortfall: 0 };

    const dueRows = new Map<string, Partial<Record<AlertKind, SummaryRow>>>();
    for (const kind of kinds) {
      const rows = await fetchDueRows(admin, oneDayAgoIso, kind);
      for (const row of rows) {
        if (!isFresh(row.updated_at)) continue;
        const existing = dueRows.get(row.user_id) ?? {};
        existing[kind] = row;
        dueRows.set(row.user_id, existing);
      }
    }

    for (const [userId, byKind] of dueRows) {
      const { data: tokenRows, error: tokenError } = await admin
        .from('push_tokens')
        .select('expo_push_token')
        .eq('user_id', userId);
      if (tokenError || !tokenRows || tokenRows.length === 0) continue;
      const tokens = tokenRows.map(t => t.expo_push_token as string);

      const throttleUpdate: Record<string, string> = {};
      for (const kind of kinds) {
        const row = byKind[kind];
        if (!row) continue;
        const message = buildMessage(kind, row);
        if (!message) continue;
        await sendExpoPush(tokens, message.title, message.body);
        throttleUpdate[THROTTLE_COLUMN[kind]] = new Date().toISOString();
        sentCounts[kind]++;
      }

      if (Object.keys(throttleUpdate).length > 0) {
        await admin.from('cash_position_summary').update(throttleUpdate).eq('user_id', userId);
      }
    }

    return json({ sentCounts, usersChecked: dueRows.size }, 200);
  } catch (e) {
    console.error('[send-proactive-alerts]', e);
    return json({ error: 'Failed to run proactive alerts' }, 500);
  }
});
