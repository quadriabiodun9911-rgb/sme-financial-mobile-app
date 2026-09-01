// Per-business payment provider secret keys -- see
// supabase/migrations/025_payment_provider_secrets.sql for the full story.
// These functions are the only way the app ever touches
// payment_provider_secrets: saving/deleting write straight to the table
// (RLS lets the workspace owner or an active admin team member do that),
// and checking connection status goes through the has_payment_secret() RPC
// instead of a SELECT, since the table has no SELECT policy for anyone --
// the secret value itself is never readable from the client once saved.

import { supabase } from './supabase';
import { getWorkspaceOwnerId } from './storage';

export type PaymentProvider = 'paystack' | 'korapay' | 'flutterwave';

export async function savePaymentSecret(provider: PaymentProvider, secretKey: string): Promise<void> {
    const ownerUserId = await getWorkspaceOwnerId();
    if (!ownerUserId) throw new Error('Not signed in.');
    const { error } = await supabase
        .from('payment_provider_secrets')
        .upsert(
            { user_id: ownerUserId, provider, secret_key: secretKey, updated_at: new Date().toISOString() },
            { onConflict: 'user_id,provider' }
        );
    if (error) throw new Error(error.message);
}

export async function deletePaymentSecret(provider: PaymentProvider): Promise<void> {
    const ownerUserId = await getWorkspaceOwnerId();
    if (!ownerUserId) throw new Error('Not signed in.');
    const { error } = await supabase
        .from('payment_provider_secrets')
        .delete()
        .eq('user_id', ownerUserId)
        .eq('provider', provider);
    if (error) throw new Error(error.message);
}

export async function getConnectedProviders(): Promise<Record<PaymentProvider, boolean>> {
    const ownerUserId = await getWorkspaceOwnerId();
    const empty: Record<PaymentProvider, boolean> = { paystack: false, korapay: false, flutterwave: false };
    if (!ownerUserId) return empty;

    const providers: PaymentProvider[] = ['paystack', 'korapay', 'flutterwave'];
    const results = await Promise.all(providers.map(async provider => {
        const { data, error } = await supabase.rpc('has_payment_secret', {
            p_owner_user_id: ownerUserId,
            p_provider: provider,
        });
        if (error) {
            console.error('[paymentSecrets] has_payment_secret', provider, error.message);
            return false;
        }
        return !!data;
    }));

    return {
        paystack: results[0],
        korapay: results[1],
        flutterwave: results[2],
    };
}
