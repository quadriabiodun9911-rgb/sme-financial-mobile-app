// Supabase Edge Function: payment-secrets
//
// Save/delete/check status of a business's own payment provider secret
// keys (payment_provider_secrets table -- see
// 025_payment_provider_secrets.sql). Originally the client wrote to that
// table directly, relying on its RLS policies (owner or active admin team
// member). Those policies were verified correct -- exact ID match, no
// stale rows, no restrictive policies -- yet real users still hit "new row
// violates row-level security policy" from the client with no way to
// diagnose further (no server logs, no reliable devtools access on their
// end). Moving the write here sidesteps that mystery entirely: this
// function does its own authorization check (mirroring payment-init's
// owner/active-team-member check) and then reads/writes with the
// service-role client, which bypasses RLS altogether. The table and its
// policies are left in place (harmless -- nothing calls them anymore) in
// case direct-table access is ever wanted again.
//
// DEPLOYMENT: supabase functions deploy payment-secrets
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

const PROVIDERS = ['paystack', 'korapay', 'flutterwave'] as const;
type Provider = typeof PROVIDERS[number];

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
    // This is the actual bug the diagnostic below caught in production:
    // getUser() called with NO argument doesn't use the Authorization
    // header set on the client above at all -- it reads from the client's
    // own internal session state, which a fresh client created per-request
    // here never has. It fails with "Auth session missing!", every time,
    // regardless of whether the token itself is perfectly valid. It only
    // ever "worked" by coincidence when this function happened to run
    // moments after a call that used a completely different, correct code
    // path (ordinary RLS-protected table reads verify the JWT's signature
    // directly, no session lookup involved) -- which is exactly why a
    // business owner could see their real dashboard data load successfully
    // and then have "Connect Flutterwave" fail immediately after with the
    // same session. Passing the token explicitly is the fix.
    const { data: { user }, error: authError } = await callerClient.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
    if (authError || !user) {
      // Diagnostic only -- never logs the token itself, just enough to
      // tell "no token reached us" apart from "a token reached us but
      // Supabase rejected it," and why, without needing to guess again.
      console.error('[payment-secrets] auth check failed', {
        hasAuthHeader: !!authHeader,
        authHeaderPrefix: authHeader?.slice(0, 12),
        authErrorMessage: authError?.message,
        authErrorStatus: (authError as any)?.status,
        authErrorCode: (authError as any)?.code,
      });
      return json({ error: 'Not authenticated' }, 401);
    }

    const body = await req.json().catch(() => null);
    const action = body?.action;
    if (action !== 'save' && action !== 'delete' && action !== 'status') {
      return json({ error: 'action must be "save", "delete", or "status".' }, 400);
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
      // Checking status only needs any active team membership (same
      // audience as the "Pay with X" buttons); saving/deleting a secret
      // needs the admin role specifically (matches canManagePaymentSettings
      // in rolePermissions.ts, and the payment_secrets_* RLS policies this
      // replaces).
      if (!membership) return json({ error: 'Not authorized for this business.' }, 403);
      if (action !== 'status' && membership.role !== 'admin') {
        return json({ error: 'Only the account owner or an admin can change payment settings.' }, 403);
      }
    }

    if (action === 'status') {
      const { data, error } = await adminClient
        .from('payment_provider_secrets')
        .select('provider')
        .eq('user_id', ownerUserId);
      if (error) return json({ error: error.message }, 500);
      const connected = new Set((data ?? []).map(r => r.provider));
      const result: Record<Provider, boolean> = { paystack: false, korapay: false, flutterwave: false };
      for (const p of PROVIDERS) result[p] = connected.has(p);
      return json({ connected: result }, 200);
    }

    const provider = body?.provider;
    if (!PROVIDERS.includes(provider)) {
      return json({ error: 'provider must be "paystack", "korapay", or "flutterwave".' }, 400);
    }

    if (action === 'delete') {
      const { error } = await adminClient
        .from('payment_provider_secrets')
        .delete()
        .eq('user_id', ownerUserId)
        .eq('provider', provider);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true }, 200);
    }

    // action === 'save'
    const secretKey = typeof body?.secretKey === 'string' ? body.secretKey.trim() : '';
    if (!secretKey) return json({ error: 'secretKey is required.' }, 400);

    const { error } = await adminClient
      .from('payment_provider_secrets')
      .upsert(
        { user_id: ownerUserId, provider, secret_key: secretKey, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,provider' }
      );
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true }, 200);
  } catch (e) {
    console.error('[payment-secrets]', e);
    return json({ error: 'Could not save. Please try again shortly.' }, 502);
  }
});
