// Supabase Edge Function: subscription-manage
//
// Status check + cancellation for a workspace's Quad360 Pro subscription.
// Same shape as payment-secrets: the subscriptions table has NO client
// policies at all (see 033_subscriptions.sql), so every read/write goes
// through here with the service-role client, which bypasses RLS entirely.
// 'status' returns only plan/status/current_period_end -- never
// paystack_customer_code/paystack_subscription_code/paystack_email_token,
// which together would let any reader of the response cancel the
// subscription directly against Paystack's API, bypassing this app.
//
// DEPLOYMENT (no Supabase CLI credentials in this environment):
//   supabase functions deploy subscription-manage
// Requires QUAD360_PAYSTACK_SECRET_KEY (same as subscription-init/
// subscription-webhook) for the 'cancel' action's call to Paystack's
// /subscription/disable. SUPABASE_URL / SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY are injected automatically.

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

    const body = await req.json().catch(() => null);
    const action = body?.action;
    if (action !== 'status' && action !== 'cancel') {
      return json({ error: 'action must be "status" or "cancel".' }, 400);
    }

    const ownerUserId = typeof body?.ownerUserId === 'string' && body.ownerUserId ? body.ownerUserId : user.id;

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    if (ownerUserId !== user.id) {
      const { data: membership } = await adminClient
        .from('team_members')
        .select('status, role')
        .eq('owner_user_id', ownerUserId)
        .eq('member_user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();
      // Any active team member can check plan status (their own screens
      // need to gate correctly too); only the owner or an admin can cancel
      // the whole business's subscription.
      if (!membership) return json({ error: 'Not authorized for this business.' }, 403);
      if (action === 'cancel' && membership.role !== 'admin') {
        return json({ error: 'Only the account owner or an admin can cancel the subscription.' }, 403);
      }
    }

    const { data: row } = await adminClient
      .from('subscriptions')
      .select('plan, status, current_period_end, paystack_subscription_code, paystack_email_token')
      .eq('owner_user_id', ownerUserId)
      .maybeSingle();

    if (action === 'status') {
      return json({
        plan: row?.plan ?? 'free',
        status: row?.status ?? 'inactive',
        currentPeriodEnd: row?.current_period_end ?? null,
      }, 200);
    }

    // action === 'cancel'
    if (!row || row.plan !== 'pro' || row.status !== 'active') {
      return json({ error: 'No active Pro subscription to cancel.' }, 400);
    }
    if (!row.paystack_subscription_code || !row.paystack_email_token) {
      // subscription.create (which stores these two fields) may not have
      // landed yet if this is called moments after checkout -- ask the
      // owner to retry rather than silently doing nothing.
      return json({ error: 'Subscription is still being set up. Please try again in a minute.' }, 409);
    }

    const secretKey = Deno.env.get('QUAD360_PAYSTACK_SECRET_KEY');
    if (!secretKey) {
      console.error('[subscription-manage] missing QUAD360_PAYSTACK_SECRET_KEY');
      return json({ error: 'Could not cancel right now. Please try again later.' }, 503);
    }

    const res = await fetch('https://api.paystack.co/subscription/disable', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: row.paystack_subscription_code, token: row.paystack_email_token }),
    });
    const data = await res.json().catch(() => null);
    if (!data?.status) {
      console.error('[subscription-manage] Paystack disable failed', data?.message);
      return json({ error: data?.message || 'Could not cancel the subscription.' }, 400);
    }

    // subscription.disable's own webhook will also fire and set this same
    // status -- updating it here too means the owner sees "Canceled"
    // immediately instead of waiting on webhook delivery.
    const { error } = await adminClient
      .from('subscriptions')
      .update({ status: 'canceled', updated_at: new Date().toISOString() })
      .eq('owner_user_id', ownerUserId);
    if (error) console.error('[subscription-manage] status update after cancel failed', error);

    return json({ ok: true }, 200);
  } catch (e) {
    console.error('[subscription-manage]', e);
    return json({ error: 'Could not complete that action. Please try again shortly.' }, 502);
  }
});
