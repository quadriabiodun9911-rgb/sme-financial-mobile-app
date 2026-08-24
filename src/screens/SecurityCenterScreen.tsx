import React, { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Radius, Spacing, Shadow } from '../theme/tokens';
import Icon from '../components/ui/Icon';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { getTwoFactorStatus, TwoFactorStatus } from '../utils/twoFactorAuth';
import { countMyActiveLoanMonitoringShares } from '../utils/loanMonitoringShare';
import { computeSecurityPosture, PostureStatus } from '../utils/securityPosture';

const STATUS_META: Record<PostureStatus, { color: string; label: string; dot: string }> = {
    on:      { color: Colors.income,  label: 'Active',  dot: '🟢' },
    partial: { color: Colors.warning, label: 'Partial',  dot: '🟡' },
    off:     { color: Colors.expense, label: 'Off',      dot: '🔴' },
};

export default function SecurityCenterScreen() {
    const { setCurrentScreen, settings } = useApp();
    const currency = settings?.currency ?? '₦';
    const [twoFactorStatus, setTwoFactorStatus] = useState<TwoFactorStatus | null>(null);
    const [activeShares, setActiveShares] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;
        Promise.all([getTwoFactorStatus(), countMyActiveLoanMonitoringShares()]).then(([status, shares]) => {
            if (!cancelled) { setTwoFactorStatus(status); setActiveShares(shares); }
        });
        return () => { cancelled = true; };
    }, []);

    const loading = twoFactorStatus === null || activeShares === null;
    const posture = loading ? null : computeSecurityPosture(twoFactorStatus, activeShares, currency);

    return (
        <SafeAreaView style={styles.safe}>
            <Header />
            <ScrollView style={styles.scroll} contentContainerStyle={styles.pad}>
                <View style={styles.titleRow}>
                    <Icon name="shield" size={20} color={Colors.textPrimary} />
                    <Text style={styles.title}>Your Financial Data</Text>
                </View>
                <Text style={styles.subtitle}>
                    What's actually protecting your business's data right now — no jargon, nothing overstated.
                </Text>

                {loading || !posture ? (
                    <View style={styles.emptyCard}>
                        <ActivityIndicator color={Colors.primary} />
                    </View>
                ) : (
                    <>
                        <View style={styles.summaryCard}>
                            <Text style={styles.summaryValue}>{posture.strongCount} of {posture.items.length}</Text>
                            <Text style={styles.summaryLabel}>protections fully active</Text>
                            {posture.attentionCount > 0 && (
                                <Text style={styles.summaryAttention}>
                                    {posture.attentionCount} thing{posture.attentionCount === 1 ? '' : 's'} worth turning on below
                                </Text>
                            )}
                        </View>

                        {posture.items.map(item => (
                            <View key={item.key} style={styles.card}>
                                <View style={styles.cardHeaderRow}>
                                    <Text style={styles.dot}>{STATUS_META[item.status].dot}</Text>
                                    <Text style={styles.cardTitle}>{item.label}</Text>
                                    <View style={[styles.badge, { backgroundColor: STATUS_META[item.status].color + '22', marginLeft: 'auto' }]}>
                                        <Text style={[styles.badgeText, { color: STATUS_META[item.status].color }]}>{STATUS_META[item.status].label}</Text>
                                    </View>
                                </View>
                                <Text style={styles.cardBody}>{item.detail}</Text>
                                {item.actionScreen && (
                                    <TouchableOpacity style={styles.actionLink} onPress={() => setCurrentScreen(item.actionScreen!)}>
                                        <Text style={styles.actionLinkText}>{item.actionLabel} →</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        ))}
                    </>
                )}
            </ScrollView>
            <FooterNav />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: Spacing.lg, paddingBottom: 100, width: '100%', maxWidth: 560, alignSelf: 'center' },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    title: { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary },
    subtitle: { fontSize: 13, color: Colors.textMuted, lineHeight: 19, marginBottom: Spacing.lg },
    emptyCard: { alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.xl },

    summaryCard: {
        backgroundColor: Colors.card, borderRadius: Radius.lg, padding: Spacing.lg,
        marginBottom: Spacing.lg, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
    },
    summaryValue: { fontSize: 28, fontWeight: '800', color: Colors.textPrimary },
    summaryLabel: { fontSize: 12.5, color: Colors.textSecondary, marginTop: 2 },
    summaryAttention: { fontSize: 12, color: Colors.warning, marginTop: 8, fontWeight: '600' },

    card: {
        backgroundColor: Colors.card, borderRadius: Radius.lg, padding: Spacing.lg,
        marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
    },
    cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    dot: { fontSize: 10 },
    cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
    badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: Radius.pill },
    badgeText: { fontSize: 10.5, fontWeight: '800' },
    cardBody: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },
    actionLink: { marginTop: Spacing.sm },
    actionLinkText: { fontSize: 12.5, color: Colors.primary, fontWeight: '700' },
});
