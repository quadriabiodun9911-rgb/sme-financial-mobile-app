import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import { getWorkspaceOwnerId } from '../utils/storage';
import { claimIncomingPayments } from '../utils/incomingPayments';
import { loadPendingPayment, clearPendingPayment, PendingPayment } from '../utils/pendingPayment';

const POLL_INTERVAL_MS = 5000;
const POLL_MAX_ATTEMPTS = 18; // ~90s total before offering the manual fallback

// Where Flutterwave/Paystack/Korapay send the browser once a payment
// finishes -- see payment-init's redirect_url. PaymentLinkScreen now
// navigates the whole tab here to check out (a real page redirect, not a
// second tab -- see its goToCheckout), so this screen is the one and only
// place that finds out how the payment actually went and, if payment-
// webhook hasn't recorded it yet, keeps checking rather than leaving the
// user to wonder or duplicate it themselves.
export default function PaymentCompleteScreen() {
    const { navParams, navigate, addTransaction, markInvoiceStatus, transactions } = useApp() as any;
    const status = (navParams?.status || '').toLowerCase();
    const failed = status === 'cancelled' || status === 'failed';

    const [phase, setPhase] = useState<'checking' | 'waiting' | 'recorded' | 'failed' | 'manual'>('checking');
    const [pending, setPending] = useState<PendingPayment | null>(null);
    const pollAttempts = useRef(0);

    useEffect(() => {
        let cancelled = false;
        let pollTimer: ReturnType<typeof setTimeout> | null = null;

        const tryClaim = async (): Promise<boolean> => {
            const ownerUserId = await getWorkspaceOwnerId();
            if (!ownerUserId) return false;
            const existingRefs = new Set<string>((transactions || []).map((t: any) => t.reference).filter(Boolean));
            const count = await claimIncomingPayments(ownerUserId, existingRefs, addTransaction, markInvoiceStatus);
            return count > 0;
        };

        const poll = async () => {
            if (cancelled) return;
            pollAttempts.current += 1;
            const claimed = await tryClaim();
            if (cancelled) return;
            if (claimed) {
                await clearPendingPayment();
                setPhase('recorded');
                return;
            }
            if (pollAttempts.current >= POLL_MAX_ATTEMPTS) {
                setPhase('manual');
                return;
            }
            pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
        };

        (async () => {
            if (failed) {
                await clearPendingPayment();
                if (!cancelled) setPhase('failed');
                return;
            }
            setPending(await loadPendingPayment());
            const claimed = await tryClaim();
            if (cancelled) return;
            if (claimed) {
                await clearPendingPayment();
                setPhase('recorded');
                return;
            }
            setPhase('waiting');
            pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
        })();

        return () => { cancelled = true; if (pollTimer) clearTimeout(pollTimer); };
    }, []);

    // Only reachable once polling has given up (see POLL_MAX_ATTEMPTS) --
    // recreates exactly what the old "Mark as Paid" fallback did, using
    // what PaymentLinkScreen persisted before redirecting here (see
    // pendingPayment.ts), since this is a fresh page load with none of
    // that screen's own component state left to fall back on.
    const recordManually = () => {
        if (!pending) return;
        addTransaction({
            type: 'income', amount: pending.amount,
            description: pending.description,
            category: 'Sales', date: new Date().toISOString().split('T')[0],
            vendorCustomer: pending.customerName,
            status: 'paid',
            reference: pending.reference,
            paidAt: new Date().toISOString(),
        });
        if (pending.invoiceId && markInvoiceStatus) markInvoiceStatus(pending.invoiceId, 'paid');
        clearPendingPayment();
        setPhase('recorded');
    };

    return (
        <View style={styles.container}>
            <View style={styles.card}>
                {(phase === 'checking' || phase === 'waiting') && (
                    <>
                        <ActivityIndicator size="large" color={Colors.primary} />
                        <Text style={styles.title}>Confirming your payment…</Text>
                        <Text style={styles.subtitle}>
                            {phase === 'waiting'
                                ? 'Verifying with the payment provider — this can take up to a minute or two.'
                                : 'This only takes a moment.'}
                        </Text>
                    </>
                )}
                {phase === 'failed' && (
                    <>
                        <Text style={styles.icon}>✕</Text>
                        <Text style={styles.title}>Payment not completed</Text>
                        <Text style={styles.subtitle}>The checkout was cancelled or didn’t go through. No charge was made.</Text>
                    </>
                )}
                {phase === 'recorded' && (
                    <>
                        <Text style={styles.icon}>✓</Text>
                        <Text style={styles.title}>Payment successful</Text>
                        <Text style={styles.subtitle}>It’s been recorded in your transactions.</Text>
                    </>
                )}
                {phase === 'manual' && (
                    <>
                        <Text style={styles.icon}>✓</Text>
                        <Text style={styles.title}>Payment successful</Text>
                        <Text style={styles.subtitle}>
                            {pending
                                ? 'It’s taking longer than usual to confirm automatically. You can record it yourself now — it won’t be double-counted if the automatic confirmation arrives afterward.'
                                : 'It’s taking longer than usual to confirm automatically. Check Transactions in a minute, or log it yourself if it doesn’t show up.'}
                        </Text>
                        {pending && (
                            <TouchableOpacity style={styles.button} onPress={recordManually}>
                                <Text style={styles.buttonText}>Record It Myself</Text>
                            </TouchableOpacity>
                        )}
                    </>
                )}
                <TouchableOpacity
                    style={[styles.button, phase === 'manual' && pending ? styles.buttonSecondary : null]}
                    onPress={() => navigate('dashboard')}
                >
                    <Text style={[styles.buttonText, phase === 'manual' && pending ? styles.buttonTextSecondary : null]}>
                        Go to Dashboard
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
    card: {
        width: '100%', maxWidth: 360, backgroundColor: Colors.card, borderRadius: Radius.lg,
        padding: Spacing.xl, alignItems: 'center', gap: 8, ...Shadow.md,
    },
    icon: { fontSize: 40, color: Colors.primary, marginBottom: 4 },
    title: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
    subtitle: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', marginBottom: 8 },
    button: { marginTop: 12, backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 12, paddingHorizontal: 24 },
    buttonSecondary: { marginTop: 8, backgroundColor: 'transparent' },
    buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    buttonTextSecondary: { color: Colors.primary },
});
