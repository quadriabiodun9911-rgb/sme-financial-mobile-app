// Supabase Edge Function: payment-init
//
// Replaces the /initialize endpoints in backend/routes/payments.js, which
// ran on an Express server that was never actually deployed anywhere (see
// supabase/functions/advisor/index.ts's header for the full story) --
// PaymentLinkScreen.tsx's Paystack/Korapay buttons have been failing
// against a dead https://quad360-backend.onrender.com URL. Same shape as
// advisor/financial-health: verify the caller's JWT against the anon
// client, then do the privileged work (calling the payment provider with a
// secret key) with a secret only this function's environment has.
//
// Scope: only the two /initialize calls PaymentLinkScreen.tsx actually
// makes. The old Express app also had /verify and a signed webhook
// receiver for Paystack -- neither is called from the client today (the
// app relies on the user tapping "Mark as Paid" after completing checkout,
// not an automated verify/webhook step), so they're not migrated here.
//
// DEPLOYMENT (not done from this environment -- no Supabase CLI
// credentials here): from a machine with the project linked,
//   supabase functions deploy payment-init
//   supabase secrets set PAYSTACK_SECRET_KEY=...
//   supabase secrets set KORAPAY_SECRET_KEY=...
// (set whichever provider(s) you actually use -- each call 503s with a
// clear message if its own key isn't set, the other still works)
// SUPABASE_URL / SUPABASE_ANON_KEY are injected automatically.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_AMOUNT = 10_000_000;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function initPaystack(amount: number, currency: string, email: string, name: string, description: string) {
  const secretKey = Deno.env.get('PAYSTACK_SECRET_KEY');
  if (!secretKey) return json({ error: 'Paystack is not configured yet.' }, 503);

  // Paystack requires amount in subunit (kobo for NGN, pesewas for GHS, etc.)
  const amountInSubunit = Math.round(amount * 100);

  const res = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: amountInSubunit,
      currency: currency.toUpperCase(),
      email,
      metadata: { name, description },
    }),
  });
  const data = await res.json();
  if (!data.status) {
    console.error('[payment-init] Paystack', data.message);
    return json({ error: data.message || 'Paystack initialization failed' }, 400);
  }
  return json({
    authorization_url: data.data.authorization_url,
    access_code: data.data.access_code,
    reference: data.data.reference,
  }, 200);
}

async function initKorapay(amount: number, currency: string, email: string, name: string, reference: string, narration: string) {
  const secretKey = Deno.env.get('KORAPAY_SECRET_KEY');
  if (!secretKey) return json({ error: 'Korapay is not configured yet.' }, 503);

  const res = await fetch('https://api.korapay.com/merchant/api/v1/charges/initialize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount,
      currency,
      reference: reference || `QD360-${Date.now()}`,
      narration: narration || 'Payment to business',
      customer: { email, name },
    }),
  });
  const data = await res.json();
  if (!data.status) {
    console.error('[payment-init] Korapay', data.message);
    return json({ error: data.message || 'Initialization failed' }, 400);
  }
  if (!data.data?.checkout_url) {
    return json({ error: 'Korapay did not return a checkout URL. Make sure your Korapay account is active and the secret key is correct.' }, 502);
  }
  return json({ checkoutUrl: data.data.checkout_url, reference: data.data.reference }, 200);
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
    const provider = body?.provider;
    if (provider !== 'paystack' && provider !== 'korapay') {
      return json({ error: 'provider must be "paystack" or "korapay".' }, 400);
    }

    const amount = parseFloat(body?.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
      return json({ error: `amount must be a positive number not exceeding ${MAX_AMOUNT.toLocaleString()}.` }, 400);
    }
    const currency = typeof body?.currency === 'string' && body.currency ? body.currency : 'NGN';
    const email = typeof body?.email === 'string' && body.email ? body.email : user.email;
    if (!email) return json({ error: 'email is required.' }, 400);
    const name = typeof body?.name === 'string' ? body.name : '';

    if (provider === 'paystack') {
      const description = typeof body?.description === 'string' ? body.description : '';
      return await initPaystack(amount, currency, email, name, description);
    }
    const reference = typeof body?.reference === 'string' ? body.reference : '';
    const narration = typeof body?.narration === 'string' ? body.narration : '';
    return await initKorapay(amount, currency, email, name, reference, narration);
  } catch (e) {
    console.error('[payment-init]', e);
    return json({ error: 'Could not start payment. Please try again shortly.' }, 502);
  }
});
