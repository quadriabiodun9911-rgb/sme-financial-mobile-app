import React, { useMemo } from 'react';
import { SafeAreaView, ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Spacing, Radius, Shadow } from '../theme/tokens';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import RadialGauge from '../components/RadialGauge';
import { computeProductivityAssessment, ProductivityFactor } from '../utils/productivityAssessment';
import { RiskScore } from '../utils/finance';

const BAND_COLOR: Record<RiskScore['band'], string> = {
    Excellent: Colors.income,
    Strong: '#10b981',
    Moderate: Colors.warning,
    Weak: '#fb923c',
    Critical: Colors.expense,
};

const BAND_EMOJI: Record<RiskScore['band'], string> = {
    Excellent: '🏆', Strong: '💪', Moderate: '⚖️', Weak: '⚠️', Critical: '🔴',
};

function fmtMoney(currency: string, n: number): string {
    return `${currency}${Math.round(n).toLocaleString()}`;
}

/**
 * Quad360 SME Productivity Assessment — "how much output, value and profit
 * is this business getting from the money, inventory and time it already
 * has," as its own scored view rather than scattered across Margin Watch,
 * Inventory, Cash Flow and Scoreboard. See productivityAssessment.ts's own
 * header comment for why this is a different question from, and a
 * different score than, Credit-Worthiness/Financing Readiness.
 */
export default function ProductivityAssessmentScreen() {
    const {
        transactions, assets, inventory, staff, loans,
        badDebtProvisions, receivableWriteOffs, inventoryWriteDowns,
        settings, navigate,
    } = useApp();
    const currency = settings?.currency ?? '₦';

    const assessment = useMemo(
        () => computeProductivityAssessment(transactions, assets, inventory, staff, loans, badDebtProvisions, receivableWriteOffs, inventoryWriteDowns),
        [transactions, assets, inventory, staff, loans, badDebtProvisions, receivableWriteOffs, inventoryWriteDowns],
    );

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <TouchableOpacity style={s.backLinkRow} onPress={() => navigate('dashboard')}>
                <Text style={s.backBtn}>← Dashboard</Text>
            </TouchableOpacity>
            <View style={s.headerRow}>
                <Text style={s.screenTitle}>⚙️ Productivity Assessment</Text>
            </View>
            <Text style={s.screenSub}>
                Not whether the business is bigger — whether it's getting more out of the money, inventory and time it already has.
            </Text>

            <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
                {!assessment.available ? (
                    <View style={s.emptyState}>
                        <Text style={s.emptyIcon}>📊</Text>
                        <Text style={s.emptyTitle}>Not enough data yet</Text>
                        <Text style={s.emptyBody}>{assessment.reason}</Text>
                        <TouchableOpacity style={s.emptyBtn} onPress={() => navigate('transactions')}>
                            <Text style={s.emptyBtnText}>Add Transactions →</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <>
                        <View style={[s.scoreCard, { borderTopColor: BAND_COLOR[assessment.band], borderTopWidth: 4 }]}>
                            <Text style={s.scoreEmoji}>{BAND_EMOJI[assessment.band]}</Text>
                            <Text style={s.scoreLabel}>Productivity Score</Text>
                            <RadialGauge
                                displayValue={`${assessment.score}`}
                                label="/100"
                                progress={assessment.score / 100}
                                color={BAND_COLOR[assessment.band]}
                                size={120}
                                strokeWidth={10}
                            />
                            <Text style={[s.scoreRating, { color: BAND_COLOR[assessment.band] }]}>{assessment.band}</Text>
                            <Text style={s.scoreNote}>
                                Five factors: profitability, cost efficiency, inventory efficiency, cash velocity and trajectory. Weighted across whichever of these actually apply to this business.
                            </Text>
                        </View>

                        {assessment.priorityFactor && (
                            <View style={[s.priorityBox, { borderColor: BAND_COLOR[assessment.band] }]}>
                                <Text style={s.priorityTitle}>⚡ Priority to Address</Text>
                                <Text style={s.priorityLabel}>{assessment.priorityFactor.label}</Text>
                                <Text style={s.priorityExplanation}>{assessment.priorityFactor.explanation}</Text>
                            </View>
                        )}

                        <Text style={s.sectionTitle}>Factor Breakdown</Text>
                        {assessment.factors.map(f => (
                            <FactorCard key={f.key} factor={f} />
                        ))}

                        <View style={s.laborCard}>
                            <View style={s.laborHeaderRow}>
                                <Text style={s.laborTitle}>👥 Labor Productivity</Text>
                                <Text style={s.laborInfoTag}>Informational — not scored</Text>
                            </View>
                            {assessment.laborProductivity.available ? (
                                <>
                                    <View style={s.statRow}>
                                        <View style={s.statBox}>
                                            <Text style={s.statLabel}>Revenue per Employee</Text>
                                            <Text style={s.statValue}>{fmtMoney(currency, assessment.laborProductivity.revenuePerEmployee)}/mo</Text>
                                        </View>
                                        <View style={s.statBox}>
                                            <Text style={s.statLabel}>Labor Cost % of Revenue</Text>
                                            <Text style={s.statValue}>{assessment.laborProductivity.laborCostPctOfRevenue.toFixed(1)}%</Text>
                                        </View>
                                    </View>
                                    <Text style={s.laborFootnote}>
                                        {assessment.laborProductivity.activeStaffCount} active staff · {assessment.laborProductivity.periodLabel}
                                        {assessment.laborProductivity.note ? ` · ${assessment.laborProductivity.note}` : ''}
                                    </Text>
                                </>
                            ) : (
                                <Text style={s.laborFootnote}>{assessment.laborProductivity.reason}</Text>
                            )}
                            <Text style={s.laborCaveat}>
                                Higher output per employee doesn't automatically mean better productivity — quality, wastage, customer satisfaction and working conditions matter too, and this app has no reliable way to measure those. This figure is shown for context, never scored.
                            </Text>
                        </View>
                    </>
                )}
            </ScrollView>
            <FooterNav />
        </SafeAreaView>
    );
}

function FactorCard({ factor }: { factor: ProductivityFactor }) {
    const color = !factor.available ? Colors.textMuted : factor.score >= 70 ? Colors.income : factor.score >= 40 ? Colors.warning : Colors.expense;
    return (
        <View style={[s.factorCard, { borderLeftColor: color }]}>
            <View style={s.factorHeaderRow}>
                <Text style={s.factorLabel}>{factor.label}</Text>
                {factor.available && <Text style={[s.factorWeight, { color }]}>{factor.weight}% weight</Text>}
            </View>
            <Text style={[s.factorValue, { color }]}>{factor.value}</Text>
            <Text style={s.factorExplanation}>{factor.explanation}</Text>
        </View>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: Spacing.lg, paddingBottom: 40 },

    backLinkRow: { paddingHorizontal: 16, paddingTop: 10 },
    backBtn: { color: Colors.primary, fontSize: 14 },
    headerRow: { paddingHorizontal: 16, paddingTop: 10 },
    screenTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary },
    screenSub: { fontSize: 12, color: Colors.textMuted, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 6 },

    emptyState: { alignItems: 'center', justifyContent: 'center', padding: 32, marginTop: 40 },
    emptyIcon: { fontSize: 56, marginBottom: 16 },
    emptyTitle: { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary, textAlign: 'center', marginBottom: 12 },
    emptyBody: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
    emptyBtn: { backgroundColor: Colors.primary, paddingVertical: 13, paddingHorizontal: 32, borderRadius: 10 },
    emptyBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },

    scoreCard: {
        backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg,
        alignItems: 'center', marginBottom: Spacing.md, ...Shadow.sm,
    },
    scoreEmoji: { fontSize: 28, marginBottom: 4 },
    scoreLabel: { fontSize: 13, color: Colors.textMuted, marginBottom: 8 },
    scoreRating: { fontSize: 16, fontWeight: '800', marginTop: Spacing.sm },
    scoreNote: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 17 },

    priorityBox: {
        backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1.5,
        padding: Spacing.md, marginBottom: Spacing.lg,
    },
    priorityTitle: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
    priorityLabel: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
    priorityExplanation: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },

    sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 10 },

    factorCard: {
        backgroundColor: Colors.surface, borderRadius: Radius.md, borderLeftWidth: 4,
        padding: Spacing.md, marginBottom: Spacing.sm, ...Shadow.sm,
    },
    factorHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    factorLabel: { fontSize: 13.5, fontWeight: '700', color: Colors.textPrimary, flexShrink: 1 },
    factorWeight: { fontSize: 11, fontWeight: '700' },
    factorValue: { fontSize: 17, fontWeight: '800', marginBottom: 4 },
    factorExplanation: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },

    laborCard: {
        backgroundColor: Colors.surfaceVariant, borderRadius: Radius.md, padding: Spacing.md,
        marginTop: Spacing.md, borderWidth: 1, borderColor: Colors.border,
    },
    laborHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    laborTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
    laborInfoTag: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
    statRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
    statBox: { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.sm, padding: 10 },
    statLabel: { fontSize: 10.5, color: Colors.textMuted, marginBottom: 2 },
    statValue: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
    laborFootnote: { fontSize: 11.5, color: Colors.textMuted, marginBottom: 8 },
    laborCaveat: { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic', lineHeight: 16 },
});
