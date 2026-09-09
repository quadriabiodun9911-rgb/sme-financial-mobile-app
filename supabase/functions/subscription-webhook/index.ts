// Supabase Edge Function: subscription-webhook
//
// Paystack's webhook for Quad360's OWN account (subscription-init's
// checkout), not the per-business payment-webhook. Because this is a single
// account Quad360 controls -- not a multi-tenant "which business's secret
// key do we verify against" situation -- the signature CAN be verified
// directly (HMAC-SHA512 of the raw body with QUAD360_PAYSTACK_SECRET_KEY,
// compared to the `x-paystack-signature` header), which is the correct and
// simpler check payment-webhook's own header explains it couldn't do for
// per-business secrets. A forged request without a valid signature is
// rejected before any database write.
//
// Routing a subscription's lifecycle events back to the right workspace:
//   - charge.success (the FIRST charge only) carries our own metadata
//     ({ ownerUserId, kind: 'quad360_pro_subscription' }), set by
//     subscription-init -- used to create the row and record
//     paystack_customer_code.
//   - Every event AFTER that (recurring charge.success renewals,
//     subscription.create, subscription.disable, invoice.payment_failed)
//     is Paystack's own recurring-billing engine acting on the customer/
//     subscription directly, not our /initialize call -- it does NOT carry
//     our metadata. Those are routed by paystack_customer_code instead,
//     which every Paystack customer/subscription event reliably includes.
// This two-path design isn't guesswork: metadata is a property of the one
// transaction it was attached to, not of the customer or subscription
// record it created, so anything Paystack itself initiates later can't
// carry it forward.
//
// charge.success amounts are independently re-verified against Paystack's
// own /transaction/verify (never trusting the webhook body's own fields),
// same discipline payment-webhook already uses.
//
// DEPLOYMENT (no Supabase CLI credentials in this environment): from a
// machine with the project linked,
//   supabase functions deploy subscription-webhook --no-verify-jwt
// (or paste via Dashboard > Edge Functions > Deploy > Via Editor and
// uncheck "Enforce JWT verification" -- Paystack has no Supabase session to
// send a JWT with). Paste this function's URL into Paystack Dashboard >
// Settings > API Keys & Webhooks > Webhook URL, and set the same
// environment variables subscription-init uses
// (QUAD360_PAYSTACK_SECRET_KEY).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Always 200 for anything we understood-but-ignored, so Paystack doesn't
// retry-storm this endpoint over an event we deliberately don't act on.
const ACK = { received: true };

async function verifySignature(rawBody: string, signature: string | null, secretKey: string): Promise<boolean> {
  if (!signature) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secretKey), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(sigBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  return hex === signature;
}

async function verifyCharge(secretKey: string, reference: string): Promise<boolean> {
  const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const data = await res.json().catch(() => null);
  return data?.data?.status === 'success';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const secretKey = Deno.env.get('QUAD360_PAYSTACK_SECRET_KEY');
  if (!secretKey) {
    console.error('[subscription-webhook] missing QUAD360_PAYSTACK_SECRET_KEY');
    return json(ACK, 200);
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-paystack-signature');
  if (!(await verifySignature(rawBody, signature, secretKey))) {
    console.log('[subscription-webhook] signature mismatch, rejecting');
    return json({ error: 'Invalid signature' }, 401);
  }

  const body = JSON.parse(rawBody);
  const event = body?.event;
  const data = body?.data;
  if (!event || !data) return json(ACK, 200);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    if (event === 'charge.success') {
      const metadata = data.metadata ?? {};
      const isOurPlan = metadata.kind === 'quad360_pro_subscription';
      const reference = data.reference as string | undefined;
      const customerCode = data.customer?.customer_code as string | undefined;
      if (!reference || !customerCode) return json(ACK, 200);

      if (!(await verifyCharge(secretKey, reference))) {
        console.log('[subscription-webhook] charge.success did not verify', { reference });
        return json(ACK, 200);
      }

      const ownerUserId = typeof metadata.ownerUserId === 'string' ? metadata.ownerUserId : null;
      if (isOurPlan && ownerUserId) {
        // First charge for this subscription -- create/refresh the row and
        // record the customer_code every later event will route by.
        const { error } = await adminClient.from('subscriptions').upsert({
          owner_user_id: ownerUserId,
          plan: 'pro',
          status: 'active',
          paystack_customer_code: customerCode,
        }, { onConflict: 'owner_user_id' });
        if (error) console.error('[subscription-webhook] upsert (first charge) failed', error);
      } else {
        // A recurring renewal charge Paystack initiated itself -- no
        // metadata, route by the customer_code stored on the first charge.
        const { error } = await adminClient.from('subscriptions')
          .update({ status: 'active', updated_at: new Date().toISOString() })
          .eq('paystack_customer_code', customerCode);
        if (error) console.error('[subscription-webhook] update (renewal) failed', error);
      }
      return json(ACK, 200);
    }

    if (event === 'subscription.create') {
      const customerCode = data.customer?.customer_code as string | undefined;
      if (!customerCode) return json(ACK, 200);
      const { error } = await adminClient.from('subscriptions')
        .update({
          paystack_subscription_code: data.subscription_code ?? null,
          paystack_email_token: data.email_token ?? null,
          current_period_end: data.next_payment_date ?? null,
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('paystack_customer_code', customerCode);
      if (error) console.error('[subscription-webhook] subscription.create update failed', error);
      return json(ACK, 200);
    }

    if (event === 'subscription.disable') {
      const customerCode = data.customer?.customer_code as string | undefined;
      if (!customerCode) return json(ACK, 200);
      const { error } = await adminClient.from('subscriptions')
        .update({ status: 'canceled', updated_at: new Date().toISOString() })
        .eq('paystack_customer_code', customerCode);
      if (error) console.error('[subscription-webhook] subscription.disable update failed', error);
      return json(ACK, 200);
    }

    if (event === 'invoice.payment_failed') {
      const customerCode = data.customer?.customer_code as string | undefined;
      if (!customerCode) return json(ACK, 200);
      const { error } = await adminClient.from('subscriptions')
        .update({ status: 'past_due', updated_at: new Date().toISOString() })
        .eq('paystack_customer_code', customerCode);
      if (error) console.error('[subscription-webhook] invoice.payment_failed update failed', error);
      return json(ACK, 200);
    }

    // Every other event (invoice.create, invoice.update, etc.) -- nothing
    // in this app reacts to it yet.
    return json(ACK, 200);
  } catch (e) {
    console.error('[subscription-webhook]', event, e);
    return json(ACK, 200);
  }
});
