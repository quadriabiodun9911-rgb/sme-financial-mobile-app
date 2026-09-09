import React, { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, TouchableOpacity, StyleSheet, Platform, Linking } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import Icon, { IconName } from '../components/ui/Icon';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import { getSubscriptionStatus, isProActive, startProCheckout, cancelSubscription, SubscriptionState } from '../utils/subscription';

const PRO_FEATURES: { icon: IconName; title: string; description: string }[] = [
    {
        icon: 'shield', title: 'Credit-Worthiness & Lending Capacity',
        description: 'DSCR, the Five C\'s of Credit, and an estimated lending capacity range built from your own numbers.',
    },
    {
        icon: 'briefcase', title: 'Business Passport',
        description: 'A continuously-updating, lender-ready summary of your identity, health, risk, and credit readiness — exportable in one tap.',
    },
    {
        icon: 'zap', title: 'MacroShield & Risk Management',
        description: 'Stress-test your cash position against an inflation or FX shock and see the exact month you\'d run out, before it happens.',
    },
    {
        icon: 'trending-up', title: 'Future Financial Statements',
        description: 'Multi-year projected P&L, balance sheet, and cash flow statements built from your real trends and assumptions.',
    },
    {
        icon: 'activity', title: 'Full Financial Assessment',
        description: 'Root-cause diagnosis of what\'s actually driving your numbers, SWOT analysis, and an early-warning signal feed.',
    },
];

export default function UpgradeScreen() {
    const { navigate, user, settings } = useApp();
    const [state, setState] = useState<SubscriptionState | null>(null);
    const [loading, setLoading] = useState(true);
    const [checkingOut, setCheckingOut] = useState(false);
    const [canceling, setCanceling] = useState(false);
    const [error, setError] = useState('');

    const refresh = () => {
        setLoading(true);
        getSubscriptionStatus().then(s => { setState(s); setLoading(false); });
    };
    useEffect(refresh, []);

    const pro = isProActive(state);

    const handleUpgrade = async () => {
        if (!user?.email) {
            setError('Add an email to your account in Settings before subscribing.');
            return;
        }
        setError('');
        setCheckingOut(true);
        try {
            const { authorizationUrl } = await startProCheckout(user.email);
            if (Platform.OS === 'web') window.location.href = authorizationUrl;
            else Linking.openURL(authorizationUrl);
        } catch (e: any) {
            setError(e.message || 'Could not start checkout. Please try again.');
            setCheckingOut(false);
        }
    };

    const handleCancel = async () => {
        setError('');
        setCanceling(true);
        try {
            await cancelSubscription();
            refresh();
        } catch (e: any) {
            setError(e.message || 'Could not cancel. Please try again.');
        } finally {
            setCanceling(false);
        }
    };

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <View style={s.headerRow}>
                <TouchableOpacity onPress={() => navigate('dashboard')}>
                    <Text style={s.backBtn}>← Dashboard</Text>
                </TouchableOpacity>
                <Text style={s.screenTitle}>Quad360 Pro</Text>
            </View>

            <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
                {pro ? (
                    <View style={s.statusCard}>
                        <View style={s.statusRow}>
                            <Icon name="check-circle" size={18} color={Colors.income} />
                            <Text style={s.statusTitle}>
                                {state?.status === 'past_due' ? "You're on Pro — payment issue" : "You're on Quad360 Pro"}
                            </Text>
                        </View>
                        {state?.status === 'past_due' && (
                            <Text style={s.statusNote}>Your last payment didn't go through. Update your card with Paystack or your access may be paused soon.</Text>
                        )}
                        {state?.currentPeriodEnd && (
                            <Text style={s.statusNote}>
                                {state.status === 'past_due' ? 'Next retry' : 'Renews'} around {new Date(state.currentPeriodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.
                            </Text>
                        )}
                        <TouchableOpacity style={s.cancelBtn} onPress={handleCancel} disabled={canceling}>
                            <Text style={s.cancelBtnText}>{canceling ? 'Canceling…' : 'Cancel subscription'}</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <>
                        <View style={s.priceCard}>
                            <Text style={s.priceLabel}>Quad360 Pro</Text>
                            <Text style={s.price}>₦2,999<Text style={s.priceUnit}>/month</Text></Text>
                            <Text style={s.priceSub}>Cancel anytime. Billed monthly via Paystack.</Text>
                            <TouchableOpacity style={s.upgradeBtn} onPress={handleUpgrade} disabled={checkingOut || loading}>
                                <Text style={s.upgradeBtnText}>{checkingOut ? 'Opening checkout…' : 'Upgrade to Pro →'}</Text>
                            </TouchableOpacity>
                            {!!error && <Text style={s.errorText}>{error}</Text>}
                        </View>

                        <Text style={s.sectionTitle}>What you get</Text>
                        {PRO_FEATURES.map(f => (
                            <View key={f.title} style={s.featureRow}>
                                <View style={s.featureIcon}><Icon name={f.icon} size={16} color={Colors.primary} /></View>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.featureTitle}>{f.title}</Text>
                                    <Text style={s.featureDesc}>{f.description}</Text>
                                </View>
                            </View>
                        ))}

                        <View style={s.freeNote}>
                            <Icon name="info" size={14} color={Colors.textMuted} />
                            <Text style={s.freeNoteText}>
                                Bookkeeping, WhatsApp/voice/receipt quick-capture, invoices, inventory, payroll, budgets and the Dashboard stay free — always. Pro only unlocks the financial-intelligence and lender-readiness tools above.
                            </Text>
                        </View>
                    </>
                )}
            </ScrollView>
            <FooterNav />
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe:        { flex: 1, backgroundColor: Colors.bg },
    scroll:      { flex: 1 },
    pad:         { padding: Spacing.lg, paddingBottom: 100 },
    headerRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, gap: Spacing.md },
    backBtn:     { color: Colors.primary, fontSize: 14 },
    screenTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary },

    priceCard: {
        backgroundColor: Colors.surface, borderRadius: 16, padding: Spacing.xl,
        alignItems: 'center', marginBottom: Spacing.xl,
        borderWidth: 2, borderColor: Colors.primary, ...Shadow.md,
    },
    priceLabel: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: Spacing.sm },
    price:      { fontSize: 34, fontWeight: '900', color: Colors.textPrimary },
    priceUnit:  { fontSize: 15, fontWeight: '600', color: Colors.textMuted },
    priceSub:   { fontSize: 12, color: Colors.textMuted, marginTop: Spacing.xs, marginBottom: Spacing.lg },
    upgradeBtn: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.xl, paddingVertical: 14, borderRadius: Radius.md, ...Shadow.sm },
    upgradeBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    errorText:  { color: Colors.expense, fontSize: 12.5, marginTop: Spacing.md, textAlign: 'center' },

    sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.md },
    featureRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.lg, alignItems: 'flex-start' },
    featureIcon: {
        width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.primary + '18',
        alignItems: 'center', justifyContent: 'center', marginTop: 2,
    },
    featureTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
    featureDesc:  { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },

    freeNote: {
        flexDirection: 'row', gap: Spacing.sm, backgroundColor: Colors.surface, borderRadius: Radius.md,
        padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, marginTop: Spacing.sm,
    },
    freeNoteText: { flex: 1, fontSize: 11.5, color: Colors.textMuted, lineHeight: 17 },

    statusCard: {
        backgroundColor: Colors.surface, borderRadius: 16, padding: Spacing.xl,
        borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
    },
    statusRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
    statusTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
    statusNote:  { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18, marginBottom: Spacing.sm },
    cancelBtn:   { marginTop: Spacing.md, alignSelf: 'flex-start' },
    cancelBtnText: { fontSize: 13, color: Colors.expense, fontWeight: '600' },
});
