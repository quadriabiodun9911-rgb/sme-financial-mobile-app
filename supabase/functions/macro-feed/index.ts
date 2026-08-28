// Supabase Edge Function: macro-feed
//
// Real, live macro-economic data to suggest as a starting point for a
// MacroAssumption -- currently just FX (the one driver with a genuinely
// free, no-API-key, reliable public data source; fuel/diesel pump prices,
// CBN's policy rate, and NBS inflation don't have an equivalent free JSON
// feed, so those stay self-reported same as before). The owner still
// reviews and can override or discard the suggestion before saving it --
// this never writes a MacroAssumption on its own.
//
// Source: https://open.er-api.com (no API key required, rates refresh
// roughly daily). If it's ever unreachable this returns an error rather
// than a fabricated or stale-looking number.
//
// DEPLOYMENT (not done from this environment -- no Supabase CLI
// credentials here): from a machine with the project linked,
//   supabase functions deploy macro-feed
// No secrets to set -- the FX source needs no API key.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FX_API = 'https://open.er-api.com/v6/latest';
// Small, fixed allowlist -- this is a public data proxy, not a general
// fetch relay, so the base/quote the client can request is bounded to
// currencies this app's businesses actually use.
const ALLOWED_CURRENCIES = new Set([
  'USD', 'NGN', 'GBP', 'EUR', 'GHS', 'KES', 'ZAR', 'XOF', 'XAF', 'EGP', 'INR', 'CNY',
]);

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await callerClient.auth.getUser();
    if (authError || !user) return json({ error: 'Not authenticated' }, 401);

    const body = await req.json().catch(() => null);
    const base = String(body?.base ?? 'USD').toUpperCase();
    const quote = String(body?.quote ?? 'NGN').toUpperCase();
    if (!ALLOWED_CURRENCIES.has(base) || !ALLOWED_CURRENCIES.has(quote)) {
      return json({ error: 'Unsupported currency' }, 400);
    }

    const res = await fetch(`${FX_API}/${base}`);
    if (!res.ok) {
      return json({ error: 'Could not reach the exchange-rate feed right now.' }, 502);
    }
    const data = await res.json();
    const rate = data?.rates?.[quote];
    if (typeof rate !== 'number' || !isFinite(rate)) {
      return json({ error: `No rate available for ${base}/${quote}.` }, 502);
    }

    return json({
      base,
      quote,
      rate,
      asOf: data?.time_last_update_utc ?? new Date().toISOString(),
      source: 'open.er-api.com',
    }, 200);
  } catch (e) {
    console.error('[macro-feed]', e);
    return json({ error: 'Something went wrong fetching the live rate.' }, 500);
  }
});
