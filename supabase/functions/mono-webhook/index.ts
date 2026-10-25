// Supabase Edge Function: mono-webhook
//
// Receives Mono's two Connect Link webhook events (verified against Mono's
// "Connect Link Integration Guide"):
//   mono.events.account_connected -- fires once, delivers the permanent
//     account id for a just-linked bank account.
//   mono.events.account_updated -- fires as the linked bank's data becomes
//     ready (per Mono's docs, anywhere from ~0.1s to a few minutes later),
//     delivers the real data_status/bank details, and can fire again later
//     on subsequent updates.
// Both carry meta.ref (the reference mono-connect generated at initiate
// time) but NOT an Authorization header -- this is a server-to-server call
// from Mono, not a request from the app -- so meta.ref via mono_link_requests
// is the only way to recover which Quad360 user a webhook belongs to, same
// structural problem accounting_oauth_states solves for an OAuth redirect.
//
// SECURITY NOTE: Mono's own Webhook Events documentation (which specifies
// the exact signature/secret header this should verify) was not available
// to confirm at the time this was written -- the header name checked below
// (mono-webhook-secret) is inferred from Mono's own mono-sec-key naming
// convention on its main API, NOT confirmed against their actual webhook
// docs. Verify this against Mono's Webhook Events page before relying on
// it in production, and correct the header name here if it differs. Fails
// closed either way: a request with no matching secret is rejected, never
// silently accepted.
//
// DEPLOYMENT: see migration 050's header for the full secrets/deploy
// checklist. Register this function's URL on the Mono dashboard, subscribed
// to mono.events.account_connected and mono.events.account_updated.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MONO_WEBHOOK_SECRET = Deno.env.get('MONO_WEBHOOK_SECRET') ?? '';

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

interface AccountConnectedPayload {
  event: 'mono.events.account_connected';
  data: { id: string; customer: string; meta: { ref?: string; data_status?: string } };
}

interface AccountUpdatedPayload {
  event: 'mono.events.account_updated';
  data: {
    account: { _id: string; name?: string; accountNumber?: string; institution?: { name?: string } };
    meta: { data_status?: string; ref?: string; retrieved_data?: string[] };
  };
}

function maskAccountNumber(accountNumber: unknown): string | null {
  if (typeof accountNumber !== 'string' || accountNumber.length < 4) return null;
  return `****${accountNumber.slice(-4)}`;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  if (!MONO_WEBHOOK_SECRET) {
    console.error('[SECURITY] MONO_WEBHOOK_SECRET not configured -- rejecting webhook.');
    return json({ error: 'Not configured' }, 503);
  }
  const providedSecret = req.headers.get('mono-webhook-secret');
  if (!providedSecret || providedSecret !== MONO_WEBHOOK_SECRET) {
    return json({ error: 'Invalid webhook signature' }, 401);
  }

  const payload = await req.json().catch(() => null);
  if (!payload?.event) return json({ error: 'Invalid payload' }, 400);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    if (payload.event === 'mono.events.account_connected') {
      const { data } = payload as AccountConnectedPayload;
      const ref = data?.meta?.ref;
      if (!ref) { console.error('[mono-webhook] account_connected missing meta.ref'); return json({ received: true, handled: false }, 200); }

      const { data: linkRequest } = await adminClient.from('mono_link_requests').select('user_id').eq('ref', ref).maybeSingle();
      if (!linkRequest) {
        // Unknown/expired ref -- nothing this function can usefully do.
        // Acknowledged (not an error) so Mono doesn't retry indefinitely.
        console.error('[mono-webhook] account_connected: no mono_link_requests row for ref', ref);
        return json({ received: true, handled: false }, 200);
      }

      const { error } = await adminClient.from('mono_connections').upsert({
        user_id: linkRequest.user_id, mono_account_id: data.id, mono_customer_id: data.customer,
        status: 'connected', error_message: null, connected_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (error) { console.error('[mono-webhook] failed to save connection', error.message); return json({ error: error.message }, 500); }
      return json({ received: true }, 200);
    }

    if (payload.event === 'mono.events.account_updated') {
      const { data } = payload as AccountUpdatedPayload;
      const accountId = data?.account?._id;
      const dataStatus = data?.meta?.data_status ? data.meta.data_status.toLowerCase() : null;
      const bankName = data?.account?.institution?.name ?? null;
      const accountNumber = maskAccountNumber(data?.account?.accountNumber);

      if (!accountId) return json({ received: true, handled: false }, 200);

      // Primary path: a connection row already exists for this account id
      // (account_connected already ran) -- just refresh its details.
      const { data: existing } = await adminClient.from('mono_connections').select('user_id').eq('mono_account_id', accountId).maybeSingle();
      if (existing) {
        const { error } = await adminClient.from('mono_connections').update({
          data_status: dataStatus, bank_name: bankName, account_number: accountNumber, status: 'connected',
        }).eq('user_id', existing.user_id);
        if (error) { console.error('[mono-webhook] failed to update connection', error.message); return json({ error: error.message }, 500); }
        return json({ received: true }, 200);
      }

      // Fallback: account_updated arrived before account_connected was
      // processed (or was missed) -- recover the user via the same
      // ref-based mailbox, same as account_connected does.
      const ref = data?.meta?.ref;
      if (!ref) return json({ received: true, handled: false }, 200);
      const { data: linkRequest } = await adminClient.from('mono_link_requests').select('user_id').eq('ref', ref).maybeSingle();
      if (!linkRequest) { console.error('[mono-webhook] account_updated: no connection or mono_link_requests row for ref', ref); return json({ received: true, handled: false }, 200); }

      const { error } = await adminClient.from('mono_connections').upsert({
        user_id: linkRequest.user_id, mono_account_id: accountId, data_status: dataStatus,
        bank_name: bankName, account_number: accountNumber, status: 'connected', connected_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (error) { console.error('[mono-webhook] failed to save connection (fallback)', error.message); return json({ error: error.message }, 500); }
      return json({ received: true }, 200);
    }

    // Acknowledge unhandled events without error.
    return json({ received: true, event: payload.event, handled: false }, 200);
  } catch (e) {
    console.error('[mono-webhook]', e);
    return json({ error: 'Something went wrong.' }, 500);
  }
});
