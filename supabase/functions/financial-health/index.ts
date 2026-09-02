// Supabase Edge Function: financial-health
//
// Replaces backend/routes/financial-health.js, which called the Pngme API
// from an Express server that was never actually deployed anywhere (see
// supabase/functions/advisor/index.ts's header for the same story) --
// FinancialHealthScreen.tsx's every request has been failing against a
// dead https://quad360-backend.onrender.com URL. Same shape as advisor:
// verify the caller's JWT against the anon client, then do the privileged
// work (calling Pngme with a secret key) with a secret only this
// function's environment has.
//
// DEPLOYMENT (not done from this environment -- no Supabase CLI
// credentials here): from a machine with the project linked,
//   supabase functions deploy financial-health
//   supabase secrets set PNGME_API_KEY=...
// SUPABASE_URL / SUPABASE_ANON_KEY are injected automatically.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PNGME_API = 'https://api.pngme.com/api';

// Pngme country -> API path mapping, same as the Express route it replaces.
const COUNTRY_MAP: Record<string, string> = {
  NGN: 'nigeria',
  GHS: 'ghana',
  KES: 'kenya',
  UGX: 'uganda',
  ZMW: 'zambia',
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function pngmeFetch(path: string, apiKey: string) {
  const res = await fetch(`${PNGME_API}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error('[financial-health] Pngme', path, res.status, body);
    throw new Error(`Pngme API error ${res.status}`);
  }
  return res.json();
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
    // getUser() with NO argument relies on the client's own internal
    // session state, which a freshly-created client here never has -- it
    // silently fails with "Auth session missing!" even though a perfectly
    // valid token is sitting right there in the Authorization header.
    // Passing the token explicitly is what actually verifies it.
    const { data: { user }, error: authError } = await callerClient.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
    if (authError || !user) return json({ error: 'Not authenticated' }, 401);

    const apiKey = Deno.env.get('PNGME_API_KEY');
    if (!apiKey) return json({ error: 'Financial Health scoring is not configured yet.' }, 503);

    const body = await req.json().catch(() => null);
    const rawPhone = body?.phone;
    if (typeof rawPhone !== 'string' || !rawPhone.trim()) {
      return json({ error: 'Missing phone number.' }, 400);
    }
    const phone = rawPhone.replace(/\s+/g, '');
    const currencyCode = typeof body?.currencyCode === 'string' ? body.currencyCode.toUpperCase() : 'NGN';
    const country = COUNTRY_MAP[currencyCode] || 'nigeria';

    const [features, income] = await Promise.allSettled([
      pngmeFetch(`/v1/${country}/features?phoneNumber=${encodeURIComponent(phone)}`, apiKey),
      pngmeFetch(`/v1/income?phoneNumber=${encodeURIComponent(phone)}`, apiKey),
    ]);

    return json({
      phone,
      country,
      features: features.status === 'fulfilled' ? features.value : null,
      income: income.status === 'fulfilled' ? income.value : null,
      errors: [
        features.status === 'rejected' ? 'Could not fetch features' : null,
        income.status === 'rejected' ? 'Could not fetch income' : null,
      ].filter(Boolean),
    }, 200);
  } catch (e) {
    console.error('[financial-health]', e);
    return json({ error: 'The scoring service is temporarily unavailable.' }, 502);
  }
});
