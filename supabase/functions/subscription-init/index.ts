// Supabase Edge Function: subscription-init
//
// Starts a Quad360 Pro checkout for the calling business, via Quad360's OWN
// Paystack account -- NOT a per-business connected account like payment-init
// (that function moves a business's CUSTOMER's money to that business;
// this one moves the business owner's own money to Quad360). The secret
// key and plan code below are Quad360's, set once as this function's own
// environment variables, never read from payment_provider_secrets.
//
// Uses Paystack's plan-linked initialize flow: passing `plan` to
// /transaction/initialize makes Paystack auto-create a recurring
// subscription the moment the first charge succeeds (see
// subscription-webhook, which listens for that). The plan itself
// (QUAD360_PRO_PLAN_CODE) is a one-time setup step in the Paystack
// dashboard, not created here.
//
// DEPLOYMENT (not done from this environment -- no Supabase CLI
// credentials here): from a machine with the project linked,
//   supabase functions deploy subscription-init
// Requires these function environment variables (Dashboard > Edge Functions
// > subscription-init > Settings, or `supabase secrets set`):
//   QUAD360_PAYSTACK_SECRET_KEY  -- Quad360's own Paystack secret key
//   QUAD360_PRO_PLAN_CODE        -- the Paystack Plan code for "Quad360 Pro
//                                    Monthly" (create once via Paystack
//                                    Dashboard > Payments > Plans, amount
//                                    299900 kobo = NGN 2,999, interval
//                                    "monthly")
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected
// automatically.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const { data: { user }, error: authError } = await callerClient.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
    if (authError || !user) return json({ error: 'Not authenticated' }, 401);

    // A subscription is a workspace-level decision, not a per-login one --
    // if a team member starts checkout, it should still cover (and be
    // attributed to) the workspace they belong to, same ownerUserId
    // resolution payment-init uses.
    const body = await req.json().catch(() => null);
    const ownerUserId = typeof body?.ownerUserId === 'string' && body.ownerUserId ? body.ownerUserId : user.id;

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

    // Already Pro and active -- nothing to check out for. Avoids a second
    // Paystack subscription being created for the same business if the
    // owner reaches this screen again (e.g. a stale cached page).
    const { data: existing } = await adminClient
      .from('subscriptions')
      .select('plan, status')
      .eq('owner_user_id', ownerUserId)
      .maybeSingle();
    if (existing?.plan === 'pro' && existing?.status === 'active') {
      return json({ error: 'This business is already on Quad360 Pro.' }, 400);
    }

    const secretKey = Deno.env.get('QUAD360_PAYSTACK_SECRET_KEY');
    const planCode = Deno.env.get('QUAD360_PRO_PLAN_CODE');
    if (!secretKey || !planCode) {
      console.error('[subscription-init] missing QUAD360_PAYSTACK_SECRET_KEY or QUAD360_PRO_PLAN_CODE');
      return json({ error: 'Subscriptions are not configured yet. Please try again later.' }, 503);
    }

    const email = typeof body?.email === 'string' && body.email ? body.email : user.email;
    if (!email) return json({ error: 'email is required.' }, 400);

    // ownerUserId rides along as metadata purely so subscription-webhook can
    // read it back out of the very first charge.success event -- the same
    // routing trick payment-init/payment-webhook already use, see
    // subscription-webhook's own header for why every event AFTER that one
    // is instead routed by paystack_customer_code, not metadata.
    const reference = `QD360-SUB-${Date.now()}`;
    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        plan: planCode,
        reference,
        metadata: { ownerUserId, kind: 'quad360_pro_subscription' },
      }),
    });
    const data = await res.json();
    if (!data.status) {
      console.error('[subscription-init] Paystack', data.message);
      return json({ error: data.message || 'Could not start checkout.' }, 400);
    }

    return json({
      authorization_url: data.data.authorization_url,
      reference: data.data.reference,
    }, 200);
  } catch (e) {
    console.error('[subscription-init]', e);
    return json({ error: 'Could not start checkout. Please try again shortly.' }, 502);
  }
});
