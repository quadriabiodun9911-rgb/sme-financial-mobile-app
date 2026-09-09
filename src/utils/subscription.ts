// Quad360 Pro subscription status/checkout/cancellation -- the platform
// charging a business to use Quad360 itself, distinct from
// paymentSecrets.ts (a business's own connected Paystack/Korapay/
// Flutterwave account for collecting from ITS customers). Same
// retry-on-auth-timing shape as paymentSecrets.ts's invokePaymentSecrets:
// the most common real cause of a fresh call here failing isn't a genuine
// auth problem, it's the caller's own Supabase session not having settled
// yet moments after sign-in.

import { supabase } from './supabase';
import { getWorkspaceOwnerId } from './storage';

export type SubscriptionPlan = 'free' | 'pro';
export type SubscriptionStatus = 'inactive' | 'active' | 'past_due' | 'canceled';

export interface SubscriptionState {
    plan: SubscriptionPlan;
    status: SubscriptionStatus;
    currentPeriodEnd: string | null;
}

const FREE_STATE: SubscriptionState = { plan: 'free', status: 'inactive', currentPeriodEnd: null };

// A past-due subscription (payment failed but not yet canceled) still
// counts as Pro access -- Paystack retries a failed charge automatically
// over several days before giving up, and locking a business out the
// moment one charge attempt fails (rather than when the subscription is
// actually disabled) would punish a temporarily-declined card more harshly
// than the payment provider itself does.
export function isProActive(state: SubscriptionState | null): boolean {
    return state?.plan === 'pro' && (state.status === 'active' || state.status === 'past_due');
}

const RETRY_DELAYS_MS = [800, 1600, 3200];

async function invokeSubscriptionManage(body: Record<string, unknown>): Promise<any> {
    let lastError: any = null;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        try {
            const { data, error } = await supabase.functions.invoke('subscription-manage', { body });
            if (error) {
                const errResponse = (error as { context?: Response }).context;
                const errBody = errResponse && typeof errResponse.json === 'function'
                    ? await errResponse.json().catch(() => null)
                    : null;
                throw new Error(errBody?.error || error.message || 'Could not complete that action.');
            }
            return data;
        } catch (e: any) {
            lastError = e;
            const msg = (e?.message || '').toLowerCase();
            const looksLikeAuthTiming = msg.includes('not authenticated') || msg.includes('not signed in') || msg.includes('missing authorization');
            const delay = RETRY_DELAYS_MS[attempt];
            if (!looksLikeAuthTiming || !delay) throw e;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw lastError;
}

export async function getSubscriptionStatus(): Promise<SubscriptionState> {
    try {
        const ownerUserId = await getWorkspaceOwnerId();
        if (!ownerUserId) return FREE_STATE;
        const data = await invokeSubscriptionManage({ action: 'status', ownerUserId });
        return {
            plan: data?.plan === 'pro' ? 'pro' : 'free',
            status: data?.status ?? 'inactive',
            currentPeriodEnd: data?.currentPeriodEnd ?? null,
        };
    } catch (e: any) {
        console.error('[subscription] status check failed after retries', e?.message);
        return FREE_STATE;
    }
}

export async function cancelSubscription(): Promise<void> {
    const ownerUserId = await getWorkspaceOwnerId();
    if (!ownerUserId) throw new Error('Not signed in.');
    await invokeSubscriptionManage({ action: 'cancel', ownerUserId });
}

// Returns the Paystack checkout URL to open -- the caller (UpgradeScreen)
// is responsible for actually opening it (Linking.openURL on native,
// window.open on web), same division of labor PaymentLinkScreen.tsx
// already uses for payment-init's authorization_url.
export async function startProCheckout(email: string): Promise<{ authorizationUrl: string; reference: string }> {
    const ownerUserId = await getWorkspaceOwnerId();
    if (!ownerUserId) throw new Error('Not signed in.');
    const { data, error } = await supabase.functions.invoke('subscription-init', {
        body: { ownerUserId, email },
    });
    if (error) {
        const errResponse = (error as { context?: Response }).context;
        const errBody = errResponse && typeof errResponse.json === 'function'
            ? await errResponse.json().catch(() => null)
            : null;
        throw new Error(errBody?.error || error.message || 'Could not start checkout.');
    }
    return { authorizationUrl: data.authorization_url, reference: data.reference };
}
