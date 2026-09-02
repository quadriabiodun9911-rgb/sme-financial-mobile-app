import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import { getWorkspaceOwnerId } from '../utils/storage';
import { claimIncomingPayments } from '../utils/incomingPayments';

// Where Flutterwave (and, via the same redirect_url, Paystack/Korapay one
// day) sends the checkout tab once a payment finishes -- see payment-init's
// redirect_url. This used to be an unhandled URL: with no route for it, the
// tab just fell through to the ordinary Dashboard with no indication
// anything had happened. This screen gives that tab a real "did it work"
// answer, and doubles as one more place claimIncomingPayments() runs from
// (see incomingPayments.ts) -- this is often the very first moment this
// device knows a payment happened, since it's a brand-new page load in the
// tab the customer just paid in.
export default function PaymentCompleteScreen() {
    const { navParams, navigate, addTransaction, markInvoiceStatus, transactions } = useApp() as any;
    const status = (navParams?.status || '').toLowerCase();
    const failed = status === 'cancelled' || status === 'failed';

    const [claiming, setClaiming] = useState(true);
    const [claimedCount, setClaimedCount] = useState(0);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const ownerUserId = await getWorkspaceOwnerId();
            if (!ownerUserId || cancelled) { setClaiming(false); return; }
            const existingRefs = new Set<string>((transactions || []).map((t: any) => t.reference).filter(Boolean));
            const count = await claimIncomingPayments(ownerUserId, existingRefs, addTransaction, markInvoiceStatus);
            if (!cancelled) { setClaimedCount(count); setClaiming(false); }
        })();
        return () => { cancelled = true; };
    }, []);

    return (
        <View style={styles.container}>
            <View style={styles.card}>
                {claiming ? (
                    <>
                        <ActivityIndicator size="large" color={Colors.primary} />
                        <Text style={styles.title}>Confirming your payment…</Text>
                        <Text style={styles.subtitle}>This only takes a moment.</Text>
                    </>
                ) : failed ? (
                    <>
                        <Text style={styles.icon}>✕</Text>
                        <Text style={styles.title}>Payment not completed</Text>
                        <Text style={styles.subtitle}>The checkout was cancelled or didn’t go through. No charge was made.</Text>
                    </>
                ) : (
                    <>
                        <Text style={styles.icon}>✓</Text>
                        <Text style={styles.title}>Payment successful</Text>
                        <Text style={styles.subtitle}>
                            {claimedCount > 0
                                ? 'It’s been recorded in your transactions.'
                                : 'It’ll appear in your transactions shortly.'}
                        </Text>
                    </>
                )}
                <TouchableOpacity style={styles.button} onPress={() => navigate('dashboard')}>
                    <Text style={styles.buttonText}>Go to Dashboard</Text>
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
    buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
