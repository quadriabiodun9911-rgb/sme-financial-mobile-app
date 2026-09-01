import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../theme/colors';
import { Radius, Spacing } from '../theme/tokens';
import { Transaction, Asset, Loan } from '../types';
import { computeQualityOfGrowth, GrowthSignal, QualityBand } from '../utils/qualityOfGrowth';
import { computeQualityOfGrowthIntelligence } from '../utils/metricIntelligence';
import RadialGauge from './RadialGauge';

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
    // Metric Intelligence pilot -- same Definition/Owner-confidence/Trigger
    // treatment as Business Health/Financing Readiness/Cash Runway/DSCR/
    // Cash Reserve Resilience. See metricIntelligence.ts for exactly what's
    // reused vs new.
    const intelligence = useMemo(() => computeQualityOfGrowthIntelligence(result, transactions), [result, transactions]);
    const [whyOpen, setWhyOpen] = useState(false);

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
                <RadialGauge displayValue={String(result.score)} label={result.band} progress={result.score / 100} color={bandColor} size={104} strokeWidth={9} />
                <Text style={s.verdict}>{result.verdict}</Text>

                <TouchableOpacity style={s.whyBtn} onPress={() => setWhyOpen(o => !o)}>
                    <Text style={s.whyBtnText}>Why? What is this built on?</Text>
                    <Text style={s.whyBtnText}>{whyOpen ? '▲' : '▼'}</Text>
                </TouchableOpacity>
                {whyOpen && (
                    <View style={s.whyBox}>
                        <Text style={s.whyLabel}>Definition</Text>
                        <Text style={s.whyText}>{intelligence.definition}</Text>

                        <Text style={s.whyLabel}>Data confidence</Text>
                        <Text style={s.whyText}>{intelligence.dataQuality.summary}</Text>
                        {intelligence.builtOn.map((line, i) => (
                            <Text key={i} style={s.whyBullet}>• {line}</Text>
                        ))}

                        <Text style={s.whyLabel}>Trigger</Text>
                        <Text style={[s.whyText, { color: Colors.warning, fontWeight: '700' }]}>⚠️ {intelligence.trigger}</Text>
                    </View>
                )}
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
    scoreLabel: { fontSize: 13, color: Colors.textSecondary, marginBottom: 10 },
    verdict: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, marginTop: 12 },

    whyBtn: { alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border },
    whyBtnText: { fontSize: 11.5, fontWeight: '600', color: Colors.textMuted },
    whyBox: { alignSelf: 'stretch', backgroundColor: Colors.bg, borderRadius: Radius.md, padding: Spacing.md, marginTop: 8, gap: 2 },
    whyLabel: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 8 },
    whyText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, textAlign: 'left' },
    whyBullet: { fontSize: 11, color: Colors.textMuted, lineHeight: 16, marginTop: 2, textAlign: 'left' },

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
