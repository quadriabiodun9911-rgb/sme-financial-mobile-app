// Supabase Edge Function: payment-webhook
//
// Called directly by Paystack/Korapay/Flutterwave the moment a checkout
// truly completes -- not by the app. This is what makes payments recorded
// as transactions automatic instead of depending on the merchant
// remembering to tap "Mark as Paid" in PaymentLinkScreen.tsx (see that
// screen's recordManualPayment, still kept as a manual fallback).
//
// One deploy, three webhook URLs (append the provider as a query param when
// pasting the URL into each provider's dashboard):
//   .../payment-webhook?provider=paystack
//   .../payment-webhook?provider=korapay
//   .../payment-webhook?provider=flutterwave
//
// Security model: this endpoint does NOT trust the webhook body's own
// status/amount fields, and does not attempt per-provider signature
// verification (Flutterwave's "secret hash" is an account-level setting
// with nowhere to live per-business in this multi-tenant setup; Paystack's
// and Korapay's HMAC schemes would need the same). Instead it re-verifies
// the payment by calling the provider's own "verify transaction" API using
// that business's stored secret key (the same key payment-init already
// reads server-side from payment_provider_secrets) and only trusts THAT
// response. This is safe even against a forged webhook call: verifying a
// real tx_ref against the wrong business's secret key simply fails (each
// provider scopes verification to the account that owns the transaction),
// so nobody can walk away with a fabricated "payment succeeded" by POSTing
// a fake body here.
//
// Deploy with "Enforce JWT verification" turned OFF for this function --
// providers have no Supabase session to send a JWT with.
//
// DEPLOYMENT (no Supabase CLI credentials in this environment): from a
// machine with the project linked, `supabase functions deploy
// payment-webhook --no-verify-jwt`, or paste via Dashboard > Edge Functions
// > Deploy a new function > Via Editor and uncheck "Enforce JWT
// verification" before deploying.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Always 200 (unless the request is malformed) so providers don't treat a
// business that hasn't connected an account, or a payment we can't verify,
// as a delivery failure and retry-storm this endpoint.
const ACK = { received: true };

async function verifyPaystack(secretKey: string, reference: string) {
  const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const data = await res.json().catch(() => null);
  if (data?.data?.status !== 'success') {
    console.log('[payment-webhook] paystack verify did not pass', { httpStatus: res.status, apiStatus: data?.status, message: data?.message, dataStatus: data?.data?.status });
    return null;
  }
  return { amount: data.data.amount / 100, currency: data.data.currency as string };
}

async function verifyKorapay(secretKey: string, reference: string) {
  const res = await fetch(`https://api.korapay.com/merchant/api/v1/charges/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const data = await res.json().catch(() => null);
  if (data?.data?.status !== 'success') {
    console.log('[payment-webhook] korapay verify did not pass', { httpStatus: res.status, apiStatus: data?.status, message: data?.message, dataStatus: data?.data?.status });
    return null;
  }
  return { amount: Number(data.data.amount), currency: data.data.currency as string };
}

async function verifyFlutterwave(secretKey: string, transactionId: string, expectedTxRef: string) {
  const res = await fetch(`https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transactionId)}/verify`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const data = await res.json().catch(() => null);
  if (data?.data?.status !== 'successful' || data?.data?.tx_ref !== expectedTxRef) {
    console.log('[payment-webhook] flutterwave verify did not pass', {
      httpStatus: res.status, apiStatus: data?.status, message: data?.message,
      dataStatus: data?.data?.status, gotTxRef: data?.data?.tx_ref, expectedTxRef,
    });
    return null;
  }
  return { amount: Number(data.data.amount), currency: data.data.currency as string };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const provider = new URL(req.url).searchParams.get('provider');
  if (provider !== 'paystack' && provider !== 'korapay' && provider !== 'flutterwave') {
    return json({ error: 'Missing or invalid ?provider=' }, 400);
  }

  const body = await req.json().catch(() => null);
  if (!body) return json(ACK, 200);

  // Flutterwave has historically sent custom metadata back in more than one
  // shape depending on API version/event type: sometimes a flat object
  // (`meta: { ownerUserId: "..." }`, what we send it as in payment-init),
  // sometimes an array of key/value pairs (`meta_data: [{ metaname:
  // "ownerUserId", metavalue: "..." }]` or `[{ key, value }]`). Normalizing
  // every shape into a flat object here means the rest of this function
  // doesn't need to know which one arrived.
  function flattenMeta(raw: unknown): Record<string, unknown> {
    if (!raw) return {};
    if (Array.isArray(raw)) {
      const out: Record<string, unknown> = {};
      for (const entry of raw) {
        const key = entry?.metaname ?? entry?.key ?? entry?.name;
        const value = entry?.metavalue ?? entry?.value;
        if (typeof key === 'string') out[key] = value;
      }
      return out;
    }
    if (typeof raw === 'object') return raw as Record<string, unknown>;
    return {};
  }

  // Pull out (reference, transactionId, metadata) in whichever shape this
  // provider's webhook payload uses. Metadata is NOT trusted for the
  // payment's actual outcome -- only for routing (which business's secret
  // key to verify with, which invoice to mark paid).
  let reference: string | null = null;
  let flwTransactionId: string | null = null;
  let meta: Record<string, unknown> = {};
  if (provider === 'paystack') {
    reference = body?.data?.reference ?? null;
    meta = flattenMeta(body?.data?.metadata);
  } else if (provider === 'korapay') {
    reference = body?.data?.reference ?? null;
    meta = flattenMeta(body?.data?.metadata);
  } else {
    reference = body?.data?.tx_ref ?? null;
    flwTransactionId = body?.data?.id != null ? String(body.data.id) : null;
    meta = flattenMeta(body?.data?.meta ?? body?.data?.meta_data ?? body?.meta_data);
  }

  const ownerUserId = typeof meta?.ownerUserId === 'string' ? meta.ownerUserId : null;
  if (!reference || !ownerUserId) {
    // Dumps the raw shape of whatever Flutterwave/Paystack/Korapay actually
    // sent for the meta-ish fields -- if flattenMeta's shapes above are
    // still wrong, this shows exactly what to match instead of guessing
    // again next time.
    console.log('[payment-webhook] missing reference or ownerUserId in payload', {
      provider, hasReference: !!reference, hasOwnerUserId: !!ownerUserId, metaKeys: Object.keys(meta || {}),
      rawMeta: body?.data?.meta, rawMetaData: body?.data?.meta_data ?? body?.meta_data,
      rawMetadata: body?.data?.metadata, dataKeys: Object.keys(body?.data || {}),
    });
    return json(ACK, 200);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: secretRow } = await adminClient
    .from('payment_provider_secrets')
    .select('secret_key')
    .eq('user_id', ownerUserId)
    .eq('provider', provider)
    .maybeSingle();
  const secretKey = secretRow?.secret_key;
  if (!secretKey) {
    console.log('[payment-webhook] no stored secret key for this owner/provider', { provider, ownerUserId, reference });
    return json(ACK, 200);
  }

  try {
    let verified: { amount: number; currency: string } | null = null;
    if (provider === 'paystack') verified = await verifyPaystack(secretKey, reference);
    else if (provider === 'korapay') verified = await verifyKorapay(secretKey, reference);
    else if (flwTransactionId) verified = await verifyFlutterwave(secretKey, flwTransactionId, reference);
    else console.log('[payment-webhook] flutterwave payload had no transaction id', { reference });

    if (!verified) return json(ACK, 200);
    console.log('[payment-webhook] verified, upserting incoming_payments', { provider, ownerUserId, reference, amount: verified.amount });

    const { error } = await adminClient.from('incoming_payments').upsert({
      owner_user_id: ownerUserId,
      provider,
      tx_ref: reference,
      amount: verified.amount,
      currency: verified.currency,
      customer_name: typeof meta?.customerName === 'string' ? meta.customerName : null,
      description: typeof meta?.description === 'string' ? meta.description : null,
      invoice_id: typeof meta?.invoiceId === 'string' && meta.invoiceId ? meta.invoiceId : null,
    }, { onConflict: 'provider,tx_ref' });
    if (error) console.error('[payment-webhook] upsert failed', error);

    return json(ACK, 200);
  } catch (e) {
    console.error('[payment-webhook]', provider, e);
    return json(ACK, 200);
  }
});
