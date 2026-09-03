// Supabase Edge Function: send-proactive-alerts
//
// Tier-2 (server-side) half of proactive alerts -- the local notifications
// in src/utils/notifications.ts only fire while the app is open; this is
// what reaches a user who hasn't opened it in days. Runs on a schedule
// (see the cron.schedule block at the bottom of
// supabase/migrations/028_proactive_alerts_push.sql), scans every user's
// cash_position_summary row for a low-runway or rising-cost-category
// condition, and pushes via Expo's Push API to that user's registered
// device token(s).
//
// Deliberately reads ONLY cash_position_summary, never `transactions` --
// transaction amounts/descriptions/categories are stored field-encrypted
// with a key this server never has (see the migration's header comment),
// so cash_position_summary's few already-derived numbers are the only
// thing an Edge Function can act on here.
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

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
// runway is short when it may have already recovered. Skip rather than
// push on data this old.
const MAX_SUMMARY_AGE_MS = 3 * ONE_DAY_MS;

interface SummaryRow {
  user_id: string;
  currency: string | null;
  runway_days: number | null;
  top_cost_category: string | null;
  top_cost_pct_point_change: number | null;
  top_cost_current_pct_of_revenue: number | null;
  updated_at: string;
  last_low_cash_notified_at: string | null;
  last_rising_cost_notified_at: string | null;
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
    let lowCashSent = 0;
    let risingCostSent = 0;

    const { data: lowCashRows, error: lowCashError } = await admin
      .from('cash_position_summary')
      .select('user_id, currency, runway_days, top_cost_category, top_cost_pct_point_change, top_cost_current_pct_of_revenue, updated_at, last_low_cash_notified_at, last_rising_cost_notified_at')
      .not('runway_days', 'is', null)
      .lt('runway_days', LOW_RUNWAY_THRESHOLD_DAYS)
      .or(`last_low_cash_notified_at.is.null,last_low_cash_notified_at.lt.${oneDayAgoIso}`);
    if (lowCashError) throw lowCashError;

    const { data: risingCostRows, error: risingCostError } = await admin
      .from('cash_position_summary')
      .select('user_id, currency, runway_days, top_cost_category, top_cost_pct_point_change, top_cost_current_pct_of_revenue, updated_at, last_low_cash_notified_at, last_rising_cost_notified_at')
      .gt('top_cost_pct_point_change', RISING_COST_THRESHOLD_PCT_POINTS)
      .or(`last_rising_cost_notified_at.is.null,last_rising_cost_notified_at.lt.${oneDayAgoIso}`);
    if (risingCostError) throw risingCostError;

    const dueRows = new Map<string, { lowCash?: SummaryRow; risingCost?: SummaryRow }>();
    for (const row of (lowCashRows ?? []) as SummaryRow[]) {
      if (!isFresh(row.updated_at) || !dueForThrottle(row.last_low_cash_notified_at)) continue;
      dueRows.set(row.user_id, { ...dueRows.get(row.user_id), lowCash: row });
    }
    for (const row of (risingCostRows ?? []) as SummaryRow[]) {
      if (!isFresh(row.updated_at) || !dueForThrottle(row.last_rising_cost_notified_at) || !row.top_cost_category) continue;
      dueRows.set(row.user_id, { ...dueRows.get(row.user_id), risingCost: row });
    }

    for (const [userId, { lowCash, risingCost }] of dueRows) {
      const { data: tokenRows, error: tokenError } = await admin
        .from('push_tokens')
        .select('expo_push_token')
        .eq('user_id', userId);
      if (tokenError || !tokenRows || tokenRows.length === 0) continue;
      const tokens = tokenRows.map(t => t.expo_push_token as string);

      if (lowCash) {
        const currency = lowCash.currency ?? '₦';
        await sendExpoPush(
          tokens,
          'Cash runway getting short ⏳',
          `At your current spending, ${currency} cash on hand runs out in about ${lowCash.runway_days} days. Worth a look before it gets tighter.`,
        );
        await admin.from('cash_position_summary').update({ last_low_cash_notified_at: new Date().toISOString() }).eq('user_id', userId);
        lowCashSent++;
      }

      if (risingCost) {
        const pct = risingCost.top_cost_pct_point_change!.toFixed(1);
        const share = risingCost.top_cost_current_pct_of_revenue!.toFixed(0);
        await sendExpoPush(
          tokens,
          `"${risingCost.top_cost_category}" is taking a bigger bite of revenue 📈`,
          `Up ${pct} points to ${share}% of revenue. Check Cost Exposure in the app for the full picture.`,
        );
        await admin.from('cash_position_summary').update({ last_rising_cost_notified_at: new Date().toISOString() }).eq('user_id', userId);
        risingCostSent++;
      }
    }

    return json({ lowCashSent, risingCostSent, usersChecked: dueRows.size }, 200);
  } catch (e) {
    console.error('[send-proactive-alerts]', e);
    return json({ error: 'Failed to run proactive alerts' }, 500);
  }
});
