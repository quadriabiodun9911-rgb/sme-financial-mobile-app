// Per-business payment provider secret keys -- see
// supabase/migrations/025_payment_provider_secrets.sql for the schema, and
// supabase/functions/payment-secrets for why this goes through an edge
// function rather than writing to the table directly (that direct-RLS path
// was verified correct end-to-end -- exact ID match, correct policies, no
// stale rows -- yet still failed for real users with no further way to
// diagnose it from here; the edge function sidesteps whatever that was by
// doing its own auth check and writing with the service-role client,
// bypassing RLS entirely).

import { supabase } from './supabase';
import { getWorkspaceOwnerId } from './storage';

export type PaymentProvider = 'paystack' | 'korapay' | 'flutterwave';

// Same shape as aiAdvisor.ts / PaymentLinkScreen.tsx's invokePaymentInit --
// the edge function always replies with a JSON { error } body on failure,
// so surface that instead of a generic "Edge Function returned a non-2xx
// status code".
async function invokePaymentSecretsOnce(body: Record<string, unknown>): Promise<any> {
    const { data, error } = await supabase.functions.invoke('payment-secrets', { body });
    if (error) {
        const errResponse = (error as { context?: Response }).context;
        const errBody = errResponse && typeof errResponse.json === 'function'
            ? await errResponse.json().catch(() => null)
            : null;
        throw new Error(errBody?.error || error.message || 'Could not save.');
    }
    return data;
}

// Retries a few times before giving up -- the most common real cause of
// this call failing isn't a genuine auth problem, it's the caller's own
// Supabase auth session not having fully settled yet moments after a fresh
// sign-in (email/PIN device verification, or the multi-step password + code
// + device-confirm flow, which does several consecutive setSession/
// updateUser calls right before this screen is even reachable). Applies to
// every action here, not just 'status' -- 'save' and 'delete' hit the exact
// same class of "Not authenticated" failure, and both are safe to retry
// (the edge function's save is an upsert, delete is already idempotent).
const RETRY_DELAYS_MS = [800, 1600, 3200];

async function invokePaymentSecrets(body: Record<string, unknown>): Promise<any> {
    let lastError: any = null;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        try {
            return await invokePaymentSecretsOnce(body);
        } catch (e: any) {
            lastError = e;
            // Only worth retrying the specific "session not ready yet"
            // shape of failure -- a real validation error (e.g. a bad
            // secret key) would just fail the same way three more times,
            // wasting the user's time before showing them the same message.
            const msg = (e?.message || '').toLowerCase();
            const looksLikeAuthTiming = msg.includes('not authenticated') || msg.includes('not signed in') || msg.includes('missing authorization');
            const delay = RETRY_DELAYS_MS[attempt];
            if (!looksLikeAuthTiming || !delay) throw e;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw lastError;
}

export async function savePaymentSecret(provider: PaymentProvider, secretKey: string): Promise<void> {
    const ownerUserId = await getWorkspaceOwnerId();
    if (!ownerUserId) throw new Error('Not signed in.');
    await invokePaymentSecrets({ action: 'save', ownerUserId, provider, secretKey });
}

export async function deletePaymentSecret(provider: PaymentProvider): Promise<void> {
    const ownerUserId = await getWorkspaceOwnerId();
    if (!ownerUserId) throw new Error('Not signed in.');
    await invokePaymentSecrets({ action: 'delete', ownerUserId, provider });
}

export async function getConnectedProviders(): Promise<Record<PaymentProvider, boolean>> {
    const empty: Record<PaymentProvider, boolean> = { paystack: false, korapay: false, flutterwave: false };
    const ownerUserId = await getWorkspaceOwnerId();
    if (!ownerUserId) return empty;
    try {
        const data = await invokePaymentSecrets({ action: 'status', ownerUserId });
        return data?.connected ?? empty;
    } catch (e: any) {
        console.error('[paymentSecrets] status check failed after retries', e?.message);
        return empty;
    }
}
