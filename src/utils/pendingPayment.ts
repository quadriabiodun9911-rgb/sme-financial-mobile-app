import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@quad360/pendingPayment';

export interface PendingPayment {
    reference: string;
    provider: 'paystack' | 'korapay' | 'flutterwave';
    amount: number;
    description: string;
    customerName?: string;
    invoiceId?: string;
}

// Bridges a checkout across the full-page redirect to the provider and back
// -- PaymentLinkScreen now navigates the whole tab/browser away to the
// provider's own checkout page instead of opening a second tab (see its
// Pay-with-X handlers), so none of its component state survives to when
// PaymentCompleteScreen mounts fresh on the way back. This is the one thing
// carried across that gap: just enough for PaymentCompleteScreen to record
// the payment itself if payment-webhook doesn't beat it to it.
export async function savePendingPayment(p: PendingPayment): Promise<void> {
    await AsyncStorage.setItem(KEY, JSON.stringify(p));
}

export async function loadPendingPayment(): Promise<PendingPayment | null> {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    try { return JSON.parse(raw) as PendingPayment; } catch { return null; }
}

export async function clearPendingPayment(): Promise<void> {
    await AsyncStorage.removeItem(KEY);
}
