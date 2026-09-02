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
async function invokePaymentSecrets(body: Record<string, unknown>): Promise<any> {
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
        console.error('[paymentSecrets] status check failed', e.message);
        return empty;
    }
}
