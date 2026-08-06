import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { computeCostExposure, CostCategorySignal, ExposureBand } from '../utils/costExposure';

const BAND_COLOR: Record<ExposureBand, string> = {
    Excellent: Colors.income,
    Strong: '#10b981',
    Moderate: Colors.warning,
    Weak: '#fb923c',
    Critical: Colors.expense,
};

function fmtCompact(currency: string, amount: number): string {
    const sign = amount < 0 ? '-' : '';
    const abs = Math.abs(amount);
    if (abs >= 1000000) return `${sign}${currency}${(abs / 1000000).toFixed(1)}M`;
    if (abs >= 1000) return `${sign}${currency}${(abs / 1000).toFixed(0)}K`;
    return `${sign}${currency}${Math.round(abs).toLocaleString()}`;
}

export default function CostExposureTab() {
    const { transactions, settings, navigate } = useApp();
    const currency = settings.currency || '₦';

    const result = useMemo(() => computeCostExposure(transactions), [transactions]);

    if (!result.available) {
        return (
            <View style={s.emptyState}>
                <Text style={s.emptyTitle}>Not enough history yet</Text>
                <Text style={s.emptySub}>{result.reason}</Text>
            </View>
        );
    }

    const bandColor = BAND_COLOR[result.band];

    return (
        <View>
            <Text style={s.subtitle}>
                A rising category cost doesn't show up as a single alarming number — it shows up as a slowly growing
                share of every revenue unit. This compares each expense category's share of revenue over {result.periodLabel.toLowerCase()},
                and projects what happens to profit if the fastest-growing one keeps climbing at its own pace.
            </Text>

            {/* Score card */}
            <View style={[s.scoreCard, { borderTopColor: bandColor }]}>
                <Text style={s.scoreLabel}>Cost Exposure</Text>
                <Text style={[s.scoreValue, { color: bandColor }]}>{result.score}</Text>
                <Text style={[s.scoreBand, { color: bandColor }]}>{result.band}</Text>
                <Text style={s.verdict}>{result.verdict}</Text>
            </View>

            {/* Projected impact — the "if this keeps rising" card */}
            {result.projectedImpact && (
                <View style={s.impactCard}>
                    <Text style={s.cardTitle}>⚠️ If This Continues</Text>
                    <Text style={s.impactText}>
                        {result.projectedImpact.category} spend grew {result.projectedImpact.observedGrowthPct.toFixed(0)}%
                        over the last {result.windowMonths} months. At that same pace, the next {result.windowMonths} months
                        would push monthly {result.projectedImpact.category} spend from{' '}
                        <Text style={s.impactBold}>{fmtCompact(currency, result.projectedImpact.currentMonthlySpend)}</Text> to{' '}
                        <Text style={s.impactBold}>{fmtCompact(currency, result.projectedImpact.projectedNextPeriodMonthlySpend)}</Text>
                        {' '}— cutting monthly operating profit from{' '}
                        <Text style={s.impactBold}>{fmtCompact(currency, result.projectedImpact.currentMonthlyProfit)}</Text> to roughly{' '}
                        <Text style={[s.impactBold, { color: Colors.expense }]}>{fmtCompact(currency, result.projectedImpact.projectedMonthlyProfit)}</Text>.
                    </Text>
                    <TouchableOpacity onPress={() => navigate('budget')}>
                        <Text style={s.impactLink}>Set a budget alert for this category →</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Flags */}
            {result.flags.length > 0 && (
                <View style={s.flagsCard}>
                    <Text style={s.cardTitle}>Categories Growing Faster Than Revenue</Text>
                    {result.flags.map((flag, i) => (
                        <View key={i} style={s.flagRow}>
                            <Text style={s.flagBullet}>•</Text>
                            <Text style={s.flagText}>{flag}</Text>
                        </View>
                    ))}
                </View>
            )}

            {/* Signal comparison table */}
            <View style={s.card}>
                <Text style={s.cardTitle}>Every Category — {result.periodLabel}</Text>
                <View style={s.tableHeader}>
                    <Text style={[s.th, { flex: 1.3 }]}>Category</Text>
                    <Text style={s.th}>Prior %</Text>
                    <Text style={s.th}>Now %</Text>
                    <Text style={s.th}>Change</Text>
                </View>
                {result.signals.map(sig => <SignalRow key={sig.category} signal={sig} />)}
            </View>
        </View>
    );
}

function SignalRow({ signal }: { signal: CostCategorySignal }) {
    const changeColor = signal.pctPointChange <= 0 ? Colors.income : signal.pctPointChange < 2 ? Colors.textSecondary : Colors.expense;

    return (
        <View style={s.tableRow}>
            <Text style={[s.td, { flex: 1.3, color: Colors.textPrimary, fontWeight: '700' }]}>{signal.category}</Text>
            <Text style={s.td}>{signal.priorPctOfRevenue.toFixed(1)}%</Text>
            <Text style={s.td}>{signal.currentPctOfRevenue.toFixed(1)}%</Text>
            <Text style={[s.td, { color: changeColor, fontWeight: '700' }]}>
                {signal.pctPointChange >= 0 ? '+' : ''}{signal.pctPointChange.toFixed(1)}pp
            </Text>
        </View>
    );
}

const s = StyleSheet.create({
    subtitle: { fontSize: 12, color: Colors.textMuted, marginBottom: 16, lineHeight: 17 },

    emptyState: { alignItems: 'center', padding: 32, backgroundColor: Colors.surface, borderRadius: 14 },
    emptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
    emptySub: { fontSize: 12, color: Colors.textMuted, textAlign: 'center' },

    scoreCard: { backgroundColor: Colors.surface, borderRadius: 14, borderTopWidth: 4, padding: 20, marginBottom: 14, alignItems: 'center' },
    scoreLabel: { fontSize: 13, color: Colors.textSecondary, marginBottom: 4 },
    scoreValue: { fontSize: 44, fontWeight: '800' },
    scoreBand: { fontSize: 15, fontWeight: '700', marginBottom: 12 },
    verdict: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19 },

    impactCard: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 14, borderLeftWidth: 4, borderLeftColor: Colors.warning },
    impactText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20, marginBottom: 10 },
    impactBold: { fontWeight: '800', color: Colors.textPrimary },
    impactLink: { fontSize: 12.5, color: Colors.primary, fontWeight: '700' },

    flagsCard: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 14, borderLeftWidth: 4, borderLeftColor: Colors.expense },
    flagRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    flagBullet: { fontSize: 12, color: Colors.textMuted },
    flagText: { flex: 1, fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },

    card: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 14 },
    cardTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginBottom: 10 },

    tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border, paddingBottom: 8, marginBottom: 6 },
    th: { flex: 1, fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase' },
    tableRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
    td: { flex: 1, fontSize: 12, color: Colors.textSecondary },
});
