import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { Transaction, InventoryItem } from '../types';
import { computeWorkingCapitalHealth, WorkingCapitalHealthBand, WorkingCapitalRiskFlag, WorkingCapitalTrendPoint } from '../utils/workingCapitalHealth';
import { fmtCompact } from './CashFlowHealthTab';
import RadialGauge from './RadialGauge';

interface Props {
    transactions: Transaction[];
    inventory: InventoryItem[];
    currency: string;
}

const BAND_COLOR: Record<WorkingCapitalHealthBand, string> = {
    Excellent: Colors.income,
    Healthy: '#10b981',
    Watchful: Colors.warning,
    Weak: '#fb923c',
    Critical: Colors.expense,
};

export default function WorkingCapitalHealthTab({ transactions, inventory, currency }: Props) {
    const result = useMemo(
        () => computeWorkingCapitalHealth(transactions, inventory, currency),
        [transactions, inventory, currency]
    );

    if (!result.available) {
        return (
            <View style={s.emptyState}>
                <Text style={s.emptyTitle}>Not enough history yet</Text>
                <Text style={s.emptySub}>{result.reason}</Text>
            </View>
        );
    }

    const bandColor = BAND_COLOR[result.band];
    const maxAbsCcc = Math.max(1, ...result.trend.points.map(p => Math.abs(p.ccc)));

    return (
        <View>
            <Text style={s.subtitle}>
                Beyond whether the business is generating cash, this looks at how much cash is structurally tied up in
                the everyday cycle of paying suppliers and collecting from customers — and whether that cycle is getting
                shorter or longer over time.
            </Text>

            {/* Score card */}
            <View style={[s.scoreCard, { borderTopColor: bandColor }]}>
                <Text style={s.scoreLabel}>Working Capital Health</Text>
                <RadialGauge displayValue={String(result.score)} label={result.band} progress={result.score / 100} color={bandColor} size={104} strokeWidth={9} />
                <Text style={s.verdict}>{result.headline}</Text>
            </View>

            {/* Cash Conversion Cycle */}
            <View style={s.card}>
                <Text style={s.cardTitle}>Cash Conversion Cycle</Text>
                <View style={s.metricRow}>
                    <Text style={s.metricLabel}>Days sales outstanding (DSO)</Text>
                    <Text style={s.metricValue}>{Math.round(result.cycle.dso)}d</Text>
                </View>
                <View style={s.metricRow}>
                    <Text style={s.metricLabel}>Days payable outstanding (DPO)</Text>
                    <Text style={s.metricValue}>{Math.round(result.cycle.dpo)}d</Text>
                </View>
                <View style={[s.metricRow, s.totalRow]}>
                    <Text style={s.totalLabel}>Cash Conversion Cycle</Text>
                    <Text style={[s.totalValue, { color: result.cycle.ccc <= 30 ? Colors.income : result.cycle.ccc <= 60 ? Colors.warning : Colors.expense }]}>
                        {Math.round(result.cycle.ccc)}d
                    </Text>
                </View>
                <Text style={s.narrative}>{result.cycle.narrative}</Text>
            </View>

            {/* Cash Trapped */}
            <View style={s.card}>
                <Text style={s.cardTitle}>Cash Trapped in Working Capital</Text>
                <View style={s.metricRow}>
                    <Text style={s.metricLabel}>Owed by customers (receivables)</Text>
                    <Text style={s.metricValue}>{fmtCompact(currency, result.cashTrapped.receivables)}</Text>
                </View>
                <View style={s.metricRow}>
                    <Text style={s.metricLabel}>Tied up in stock</Text>
                    <Text style={s.metricValue}>{fmtCompact(currency, result.cashTrapped.inventoryValue)}</Text>
                </View>
                <View style={s.metricRow}>
                    <Text style={s.metricLabel}>Owed to suppliers (payables)</Text>
                    <Text style={[s.metricValue, { color: Colors.expense }]}>-{fmtCompact(currency, result.cashTrapped.payables)}</Text>
                </View>
                <View style={[s.metricRow, s.totalRow]}>
                    <Text style={s.totalLabel}>Cash Trapped</Text>
                    <Text style={[s.totalValue, { color: result.cashTrapped.trappedCash > 0 ? Colors.warning : Colors.income }]}>
                        {fmtCompact(currency, result.cashTrapped.trappedCash)}
                    </Text>
                </View>
                <Text style={s.narrative}>{result.cashTrapped.narrative}</Text>
            </View>

            {/* Trend */}
            <View style={s.card}>
                <Text style={s.cardTitle}>Cycle Trend</Text>
                {result.trend.points.length > 0 && (
                    <View style={s.trendRow}>
                        {result.trend.points.map((p, i) => (
                            <TrendBar key={i} point={p} maxAbs={maxAbsCcc} />
                        ))}
                    </View>
                )}
                <Text style={s.narrative}>{result.trend.narrative}</Text>
            </View>

            {/* Risk signals */}
            {result.riskFlags.length > 0 && (
                <View style={s.flagsCard}>
                    <Text style={s.cardTitle}>⚠️ Working Capital Risk Signals</Text>
                    {result.riskFlags.map((flag, i) => <RiskFlagRow key={i} flag={flag} />)}
                </View>
            )}
        </View>
    );
}

function TrendBar({ point, maxAbs }: { point: WorkingCapitalTrendPoint; maxAbs: number }) {
    // Shorter is better for a cash conversion cycle -- unlike a cash-flow
    // trajectory bar (where a taller bar is unambiguously good), a shorter
    // bar here is the favorable outcome, so the fill height is inverted:
    // it grows toward the number of days tied up, not away from it.
    const heightPct = Math.max(4, (Math.abs(point.ccc) / maxAbs) * 100);
    const good = point.ccc <= 30;
    return (
        <View style={s.trendCol}>
            <Text style={s.trendValue}>{Math.round(point.ccc)}d</Text>
            <View style={s.trendBarTrack}>
                <View style={[s.trendBarFill, { height: `${heightPct}%`, backgroundColor: good ? Colors.income : Colors.warning }]} />
            </View>
            <Text style={s.trendLabel}>{point.label}</Text>
        </View>
    );
}

function RiskFlagRow({ flag }: { flag: WorkingCapitalRiskFlag }) {
    return (
        <View style={s.flagRow}>
            <Text style={s.flagBullet}>{flag.severity === 'critical' ? '🔴' : '🟠'}</Text>
            <Text style={s.flagText}>{flag.message}</Text>
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

    card: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 14 },
    cardTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginBottom: 10 },

    metricRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
    metricLabel: { fontSize: 12.5, color: Colors.textSecondary, flex: 1 },
    metricValue: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    totalRow: { borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 4, paddingTop: 10 },
    totalLabel: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary, flex: 1 },
    totalValue: { fontSize: 15, fontWeight: '800' },
    narrative: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18, marginTop: 8 },

    trendRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 130, marginBottom: 12 },
    trendCol: { alignItems: 'center', flex: 1 },
    trendValue: { fontSize: 10, color: Colors.textMuted, marginBottom: 4 },
    trendBarTrack: { width: 28, height: 80, justifyContent: 'flex-end', backgroundColor: Colors.bg, borderRadius: 4, overflow: 'hidden' },
    trendBarFill: { width: '100%', borderRadius: 4 },
    trendLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 6 },

    flagsCard: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 14, borderLeftWidth: 4, borderLeftColor: Colors.expense },
    flagRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    flagBullet: { fontSize: 12, color: Colors.textMuted },
    flagText: { flex: 1, fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },
});
