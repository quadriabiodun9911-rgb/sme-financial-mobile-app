// Supabase Edge Function: send-proactive-alerts
//
// Tier-2 (server-side) half of proactive alerts -- the local notifications
// in src/utils/notifications.ts only fire while the app is open; this is
// what reaches a user who hasn't opened it in days. Runs on a schedule
// (see the cron.schedule block at the bottom of
// supabase/migrations/028_proactive_alerts_push.sql), scans every user's
// cash_position_summary row for any of fourteen conditions, and pushes via
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
// Phase 3 (030_proactive_alerts_push_v3.sql) covers the rest of
// notifications.ts's vocabulary: overdue uninvoiced transactions, the tax
// filing deadline itself (distinct from the ability-to-pay shortfall
// above), goals, recurring transactions, a lapsed budget period, assets
// nearing replacement, stockout risk, and slow-moving stock. The goal past
// this point isn't ranking alerts by stakes anymore -- it's that nothing
// the app can warn about should only ever reach someone who happened to
// have it open.
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

type AlertKind =
  | 'lowCash' | 'risingCost' | 'overdueReminders' | 'loanPayment' | 'payroll' | 'taxShortfall'
  | 'overdueTransactions' | 'taxDeadline' | 'goalAlerts' | 'recurring' | 'budgetLapsed'
  | 'assetsReplacement' | 'stockoutRisk' | 'slowMoving';

const THROTTLE_COLUMN: Record<AlertKind, string> = {
  lowCash: 'last_low_cash_notified_at',
  risingCost: 'last_rising_cost_notified_at',
  overdueReminders: 'last_overdue_reminders_notified_at',
  loanPayment: 'last_loan_payment_notified_at',
  payroll: 'last_payroll_notified_at',
  taxShortfall: 'last_tax_shortfall_notified_at',
  overdueTransactions: 'last_overdue_transactions_notified_at',
  taxDeadline: 'last_tax_deadline_notified_at',
  goalAlerts: 'last_goal_alerts_notified_at',
  recurring: 'last_recurring_notified_at',
  budgetLapsed: 'last_budget_lapsed_notified_at',
  assetsReplacement: 'last_assets_replacement_notified_at',
  stockoutRisk: 'last_stockout_risk_notified_at',
  slowMoving: 'last_slow_moving_notified_at',
};

const SELECT_COLUMNS = [
  'user_id', 'currency', 'updated_at',
  'runway_days', 'last_low_cash_notified_at',
  'top_cost_category', 'top_cost_pct_point_change', 'top_cost_current_pct_of_revenue', 'last_rising_cost_notified_at',
  'overdue_reminders_count', 'last_overdue_reminders_notified_at',
  'loan_payment_due_days', 'loan_payment_due_other_count', 'last_loan_payment_notified_at',
  'payroll_status', 'payroll_days_left', 'payroll_period_label', 'last_payroll_notified_at',
  'tax_shortfall', 'last_tax_shortfall_notified_at',
  'overdue_transactions_count', 'overdue_transactions_total', 'last_overdue_transactions_notified_at',
  'tax_deadline_status', 'tax_deadline_days', 'tax_deadline_date', 'last_tax_deadline_notified_at',
  'goals_missed_count', 'goals_off_track_count', 'last_goal_alerts_notified_at',
  'recurring_overdue_count', 'recurring_due_soon_count', 'last_recurring_notified_at',
  'budget_period_lapsed', 'budget_current_period', 'last_budget_lapsed_notified_at',
  'assets_replacement_count', 'assets_replacement_value', 'last_assets_replacement_notified_at',
  'stockout_risk_count', 'stockout_risk_value', 'last_stockout_risk_notified_at',
  'slow_moving_stock_count', 'slow_moving_stock_value', 'last_slow_moving_notified_at',
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
  overdue_transactions_count: number | null;
  overdue_transactions_total: number | null;
  last_overdue_transactions_notified_at: string | null;
  tax_deadline_status: 'overdue' | 'due_soon' | null;
  tax_deadline_days: number | null;
  tax_deadline_date: string | null;
  last_tax_deadline_notified_at: string | null;
  goals_missed_count: number | null;
  goals_off_track_count: number | null;
  last_goal_alerts_notified_at: string | null;
  recurring_overdue_count: number | null;
  recurring_due_soon_count: number | null;
  last_recurring_notified_at: string | null;
  budget_period_lapsed: boolean | null;
  budget_current_period: string | null;
  last_budget_lapsed_notified_at: string | null;
  assets_replacement_count: number | null;
  assets_replacement_value: number | null;
  last_assets_replacement_notified_at: string | null;
  stockout_risk_count: number | null;
  stockout_risk_value: number | null;
  last_stockout_risk_notified_at: string | null;
  slow_moving_stock_count: number | null;
  slow_moving_stock_value: number | null;
  last_slow_moving_notified_at: string | null;
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Plain !== on a shared secret leaks it one byte at a time via comparison
// timing. Compares every byte regardless of where the first mismatch is.
function timingSafeEqualStr(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

function isFresh(updatedAt: string): boolean {
  return Date.now() - new Date(updatedAt).getTime() < MAX_SUMMARY_AGE_MS;
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
    case 'overdueTransactions': {
      const count = row.overdue_transactions_count ?? 0;
      if (count <= 0) return null;
      return {
        title: `${count} payment${count === 1 ? '' : 's'} overdue 💰`,
        body: `${currency}${Math.round(row.overdue_transactions_total ?? 0).toLocaleString()} owed to you, logged as sales rather than invoices.`,
      };
    }
    case 'taxDeadline': {
      if (!row.tax_deadline_status) return null;
      const deadline = row.tax_deadline_date ?? 'your deadline';
      if (row.tax_deadline_status === 'overdue') {
        const days = row.tax_deadline_days ?? 0;
        return {
          title: 'Tax filing deadline overdue 🏛️',
          body: `Your tax filing deadline (${deadline}) was ${days} day${days === 1 ? '' : 's'} ago. File as soon as possible to limit penalties.`,
        };
      }
      const days = row.tax_deadline_days ?? 0;
      return {
        title: 'Tax filing deadline coming up 🏛️',
        body: `Your tax filing deadline (${deadline}) is in ${days} day${days === 1 ? '' : 's'}.`,
      };
    }
    case 'goalAlerts': {
      const missed = row.goals_missed_count ?? 0;
      const offTrack = row.goals_off_track_count ?? 0;
      if (missed <= 0 && offTrack <= 0) return null;
      const parts: string[] = [];
      if (missed > 0) parts.push(`${missed} goal${missed === 1 ? '' : 's'} past deadline`);
      if (offTrack > 0) parts.push(`${offTrack} falling behind pace`);
      return { title: 'Your goals need a check-in 🎯', body: `${parts.join(', ')}. Tap to review.` };
    }
    case 'recurring': {
      const overdue = row.recurring_overdue_count ?? 0;
      const dueSoon = row.recurring_due_soon_count ?? 0;
      if (overdue <= 0 && dueSoon <= 0) return null;
      const parts: string[] = [];
      if (overdue > 0) parts.push(`${overdue} recurring bill${overdue === 1 ? '' : 's'} overdue`);
      if (dueSoon > 0) parts.push(`${dueSoon} coming up soon`);
      return { title: 'Recurring transactions need a check 🔁', body: `${parts.join(', ')}. Tap to review.` };
    }
    case 'budgetLapsed': {
      if (!row.budget_period_lapsed) return null;
      return {
        title: 'No budget set this month 📋',
        body: `You've budgeted before, but nothing is active for ${row.budget_current_period ?? 'this period'}. Renew it to keep tracking overspending.`,
      };
    }
    case 'assetsReplacement': {
      const count = row.assets_replacement_count ?? 0;
      if (count <= 0) return null;
      return {
        title: `${count} asset${count === 1 ? '' : 's'} nearing replacement 🔧`,
        body: `${currency}${Math.round(row.assets_replacement_value ?? 0).toLocaleString()} in remaining book value. Consider a replacement-fund goal.`,
      };
    }
    case 'stockoutRisk': {
      const count = row.stockout_risk_count ?? 0;
      if (count <= 0) return null;
      return {
        title: `${count} item${count === 1 ? '' : 's'} selling out fast 📦`,
        body: `${currency}${Math.round(row.stockout_risk_value ?? 0).toLocaleString()} in stock at risk of running out. Reorder soon.`,
      };
    }
    case 'slowMoving': {
      const count = row.slow_moving_stock_count ?? 0;
      if (count <= 0) return null;
      return {
        title: `${count} item${count === 1 ? '' : 's'} not moving 🐌`,
        body: `${currency}${Math.round(row.slow_moving_stock_value ?? 0).toLocaleString()} tied up in slow-moving stock. Worth a look at Inventory.`,
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
    case 'overdueTransactions':
      query = query.not('overdue_transactions_count', 'is', null).gt('overdue_transactions_count', 0);
      break;
    case 'taxDeadline':
      // Only 'overdue' / 'due_soon' are ever stored -- the client writes
      // null for 'none'/'ok' (see pushRegistration.ts).
      query = query.not('tax_deadline_status', 'is', null);
      break;
    case 'goalAlerts':
      query = query.or('goals_missed_count.gt.0,goals_off_track_count.gt.0');
      break;
    case 'recurring':
      query = query.or('recurring_overdue_count.gt.0,recurring_due_soon_count.gt.0');
      break;
    case 'budgetLapsed':
      query = query.eq('budget_period_lapsed', true);
      break;
    case 'assetsReplacement':
      query = query.not('assets_replacement_count', 'is', null).gt('assets_replacement_count', 0);
      break;
    case 'stockoutRisk':
      query = query.not('stockout_risk_count', 'is', null).gt('stockout_risk_count', 0);
      break;
    case 'slowMoving':
      query = query.not('slow_moving_stock_count', 'is', null).gt('slow_moving_stock_count', 0);
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
  const providedSecret = req.headers.get('x-cron-secret');
  if (!cronSecret || !providedSecret || !timingSafeEqualStr(providedSecret, cronSecret)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const oneDayAgoIso = new Date(Date.now() - ONE_DAY_MS).toISOString();
    const kinds: AlertKind[] = [
      'lowCash', 'risingCost', 'overdueReminders', 'loanPayment', 'payroll', 'taxShortfall',
      'overdueTransactions', 'taxDeadline', 'goalAlerts', 'recurring', 'budgetLapsed',
      'assetsReplacement', 'stockoutRisk', 'slowMoving',
    ];
    const sentCounts: Record<AlertKind, number> = Object.fromEntries(kinds.map(k => [k, 0])) as Record<AlertKind, number>;

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
