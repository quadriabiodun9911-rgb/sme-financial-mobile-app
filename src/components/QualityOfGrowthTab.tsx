import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { Transaction, Asset, Loan } from '../types';
import { computeQualityOfGrowth, GrowthSignal, QualityBand } from '../utils/qualityOfGrowth';

interface Props {
    transactions: Transaction[];
    assets: Asset[];
    loans: Loan[];
    currency: string;
}

const BAND_COLOR: Record<QualityBand, string> = {
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

function fmtPct(n: number | null): string {
    return n === null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(0)}%`;
}

export default function QualityOfGrowthTab({ transactions, assets, loans, currency }: Props) {
    const result = useMemo(() => computeQualityOfGrowth(transactions, assets, loans), [transactions, assets, loans]);

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
                Revenue growth alone doesn't say whether a business is getting stronger. This compares revenue growth
                against profit, cash, receivables and debt over the same period — {result.periodLabel} — to tell healthy
                growth from growth that's quietly costing more than it earns.
            </Text>

            {/* Score card */}
            <View style={[s.scoreCard, { borderTopColor: bandColor }]}>
                <Text style={s.scoreLabel}>Quality of Growth</Text>
                <Text style={[s.scoreValue, { color: bandColor }]}>{result.score}</Text>
                <Text style={[s.scoreBand, { color: bandColor }]}>{result.band}</Text>
                <Text style={s.verdict}>{result.verdict}</Text>
            </View>

            {/* Flags */}
            {result.flags.length > 0 && (
                <View style={s.flagsCard}>
                    <Text style={s.cardTitle}>⚠️ What's Driving This Score</Text>
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
                <Text style={s.cardTitle}>{result.periodLabel}</Text>
                <View style={s.tableHeader}>
                    <Text style={[s.th, { flex: 1.3 }]}>Metric</Text>
                    <Text style={s.th}>Prior</Text>
                    <Text style={s.th}>Current</Text>
                    <Text style={s.th}>Growth</Text>
                </View>
                {result.signals.map(sig => <SignalRow key={sig.key} signal={sig} currency={currency} />)}
            </View>
        </View>
    );
}

function SignalRow({ signal, currency }: { signal: GrowthSignal; currency: string }) {
    const growthColor = signal.growthPct === null
        ? Colors.textMuted
        : (signal.key === 'receivables' || signal.key === 'debt')
            ? (signal.growthPct <= 0 ? Colors.income : Colors.expense) // less growth is better for these two
            : (signal.growthPct >= 0 ? Colors.income : Colors.expense);

    return (
        <View style={s.tableRow}>
            <Text style={[s.td, { flex: 1.3, color: Colors.textPrimary, fontWeight: '700' }]}>{signal.label}</Text>
            <Text style={s.td}>{fmtCompact(currency, signal.priorValue)}</Text>
            <Text style={s.td}>{fmtCompact(currency, signal.currentValue)}</Text>
            <Text style={[s.td, { color: growthColor, fontWeight: '700' }]}>{fmtPct(signal.growthPct)}</Text>
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
