// Supabase Edge Function: payment-init
//
// Replaces the /initialize endpoints in backend/routes/payments.js, which
// ran on an Express server that was never actually deployed anywhere (see
// supabase/functions/advisor/index.ts's header for the full story) --
// PaymentLinkScreen.tsx's Paystack/Korapay/Flutterwave buttons have been
// failing against a dead https://quad360-backend.onrender.com URL. Same
// shape as advisor/financial-health: verify the caller's JWT against the
// anon client, then do the privileged work (calling the payment provider
// with a secret key) with a secret only this function's environment has
// direct access to.
//
// Per-business secret keys (see 025_payment_provider_secrets.sql): each
// provider secret used to be one shared env var for the whole app, meaning
// every business's customer paid into the SAME merchant account. Now every
// business connects its own account (its secret key lives, write-only, in
// payment_provider_secrets), and this function looks up the calling
// workspace's own key via the service-role client -- the one client in the
// system allowed to actually read that table (RLS on it has no SELECT
// policy for anyone else). ownerUserId in the request body identifies
// which business's key to use; it's independently verified below (owner or
// active team member of that owner) so a caller can't borrow another
// business's connected account by just passing a different id.
//
// Scope: only the three /initialize calls PaymentLinkScreen.tsx actually
// makes. The old Express app also had /verify and a signed webhook
// receiver for Paystack -- neither is called from the client today (the
// app relies on the user tapping "Mark as Paid" after completing checkout,
// not an automated verify/webhook step), so they're not migrated here.
//
// DEPLOYMENT (not done from this environment -- no Supabase CLI
// credentials here): from a machine with the project linked,
//   supabase functions deploy payment-init
// No provider secrets are set as function env vars anymore -- each
// business sets its own from Settings > Payment Gateways in the app, which
// writes to payment_provider_secrets.
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected
// automatically.

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

const PROVIDER_LABEL: Record<string, string> = {
  paystack: 'Paystack',
  korapay: 'Korapay',
  flutterwave: 'Flutterwave',
};

async function initPaystack(secretKey: string, amount: number, currency: string, email: string, name: string, description: string) {
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

async function initKorapay(secretKey: string, amount: number, currency: string, email: string, name: string, reference: string, narration: string) {
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

async function initFlutterwave(secretKey: string, amount: number, currency: string, email: string, name: string, reference: string, description: string) {
  const res = await fetch('https://api.flutterwave.com/v3/payments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tx_ref: reference || `QD360-${Date.now()}`,
      amount,
      currency: currency.toUpperCase(),
      redirect_url: 'https://quad360financial.com/payment-complete',
      customer: { email, name },
      customizations: { title: name || 'Payment', description: description || 'Payment to business' },
    }),
  });
  const data = await res.json();
  if (data.status !== 'success' || !data.data?.link) {
    console.error('[payment-init] Flutterwave', data.message);
    return json({ error: data.message || 'Flutterwave initialization failed' }, 400);
  }
  return json({ checkoutUrl: data.data.link, reference: reference || undefined }, 200);
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
    if (provider !== 'paystack' && provider !== 'korapay' && provider !== 'flutterwave') {
      return json({ error: 'provider must be "paystack", "korapay", or "flutterwave".' }, 400);
    }

    const ownerUserId = typeof body?.ownerUserId === 'string' && body.ownerUserId ? body.ownerUserId : user.id;

    const amount = parseFloat(body?.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
      return json({ error: `amount must be a positive number not exceeding ${MAX_AMOUNT.toLocaleString()}.` }, 400);
    }
    const currency = typeof body?.currency === 'string' && body.currency ? body.currency : 'NGN';
    const email = typeof body?.email === 'string' && body.email ? body.email : user.email;
    if (!email) return json({ error: 'email is required.' }, 400);
    const name = typeof body?.name === 'string' ? body.name : '';

    // Service-role client: the only one allowed to read
    // payment_provider_secrets (its RLS has no SELECT policy for anyone
    // else). Used for both the membership check below and the secret
    // lookup, since both need to bypass RLS.
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    if (ownerUserId !== user.id) {
      const { data: membership } = await adminClient
        .from('team_members')
        .select('status')
        .eq('owner_user_id', ownerUserId)
        .eq('member_user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();
      if (!membership) return json({ error: 'Not authorized for this business.' }, 403);
    }

    const { data: secretRow } = await adminClient
      .from('payment_provider_secrets')
      .select('secret_key')
      .eq('user_id', ownerUserId)
      .eq('provider', provider)
      .maybeSingle();
    const secretKey = secretRow?.secret_key;
    if (!secretKey) {
      return json({ error: `Connect your ${PROVIDER_LABEL[provider]} account in Settings > Payment Gateways first.` }, 503);
    }

    if (provider === 'paystack') {
      const description = typeof body?.description === 'string' ? body.description : '';
      return await initPaystack(secretKey, amount, currency, email, name, description);
    }
    if (provider === 'flutterwave') {
      const reference = typeof body?.reference === 'string' ? body.reference : '';
      const description = typeof body?.description === 'string' ? body.description : '';
      return await initFlutterwave(secretKey, amount, currency, email, name, reference, description);
    }
    const reference = typeof body?.reference === 'string' ? body.reference : '';
    const narration = typeof body?.narration === 'string' ? body.narration : '';
    return await initKorapay(secretKey, amount, currency, email, name, reference, narration);
  } catch (e) {
    console.error('[payment-init]', e);
    return json({ error: 'Could not start payment. Please try again shortly.' }, 502);
  }
});
