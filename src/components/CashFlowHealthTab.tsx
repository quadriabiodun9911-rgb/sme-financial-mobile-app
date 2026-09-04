import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { Radius, Shadow } from '../theme/tokens';
import { Transaction, Asset, InventoryItem, Loan } from '../types';
import { computeCashFlowHealth, CashFlowHealthBand, CashFlowRiskFlag, TrajectoryPoint } from '../utils/cashFlowHealth';
import RadialGauge from './RadialGauge';
import Icon from './ui/Icon';

interface Props {
    transactions: Transaction[];
    assets: Asset[];
    inventory: InventoryItem[];
    currency: string;
    loans?: Loan[];
}

const BAND_COLOR: Record<CashFlowHealthBand, string> = {
    Excellent: Colors.income,
    Healthy: '#10b981',
    Watchful: Colors.warning,
    Weak: '#fb923c',
    Critical: Colors.expense,
};

// Exported so WorkingCapitalHealthTab.tsx (same card-based layout, same
// need to abbreviate large currency amounts) reuses this instead of adding
// an 8th near-identical copy across the app's screens/components.
export function fmtCompact(currency: string, amount: number): string {
    const sign = amount < 0 ? '-' : '';
    const abs = Math.abs(amount);
    if (abs >= 1000000) return `${sign}${currency}${(abs / 1000000).toFixed(1)}M`;
    if (abs >= 1000) return `${sign}${currency}${(abs / 1000).toFixed(0)}K`;
    return `${sign}${currency}${Math.round(abs).toLocaleString()}`;
}

export default function CashFlowHealthTab({ transactions, assets, inventory, currency, loans = [] }: Props) {
    const result = useMemo(
        () => computeCashFlowHealth(transactions, assets, inventory, currency, loans),
        [transactions, assets, inventory, currency, loans]
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
    const maxAbsOCF = Math.max(1, ...result.trajectory.points.map(p => Math.abs(p.operatingCF)));

    return (
        <View>
            <Text style={s.subtitle}>
                A profitable business can still run out of cash. This walks through whether your operations are actually
                generating cash, how much of your reported profit has turned into real money in the bank, how much is
                currently tied up in receivables and stock, and where the trend is heading.
            </Text>

            {/* Score card */}
            <View style={[s.scoreCard, { borderTopColor: bandColor }]}>
                <Text style={s.scoreLabel}>Cash Flow Health</Text>
                <RadialGauge displayValue={String(result.score)} label={result.band} progress={result.score / 100} color={bandColor} size={104} strokeWidth={9} />
                <Text style={s.verdict}>{result.headline}</Text>
            </View>

            {/* Step 1 + 2: Cash Generation & Profit-to-Cash Conversion */}
            <View style={s.card}>
                <Text style={s.cardTitle}>Is the Business Generating Cash?</Text>
                <View style={s.metricRow}>
                    <Text style={s.metricLabel}>Operating cash flow (this quarter)</Text>
                    <Text style={[s.metricValue, { color: result.cashGeneration.operatingCF >= 0 ? Colors.income : Colors.expense }]}>
                        {fmtCompact(currency, result.cashGeneration.operatingCF)}
                    </Text>
                </View>
                <Text style={s.narrative}>{result.cashGeneration.narrative}</Text>

                <View style={s.divider} />

                <Text style={s.cardTitle}>Free Cash Flow</Text>
                {result.freeCashFlow.capex > 0 && (
                    <View style={s.metricRow}>
                        <Text style={s.metricLabel}>Spent on equipment / property</Text>
                        <Text style={[s.metricValue, { color: Colors.expense }]}>-{fmtCompact(currency, result.freeCashFlow.capex)}</Text>
                    </View>
                )}
                <View style={s.metricRow}>
                    <Text style={s.metricLabel}>Free cash flow</Text>
                    <Text style={[s.metricValue, { color: result.freeCashFlow.freeCashFlow >= 0 ? Colors.income : Colors.expense }]}>
                        {fmtCompact(currency, result.freeCashFlow.freeCashFlow)}
                    </Text>
                </View>
                <Text style={s.narrative}>{result.freeCashFlow.narrative}</Text>

                <View style={s.divider} />

                <Text style={s.cardTitle}>Profit-to-Cash Conversion</Text>
                <View style={s.metricRow}>
                    <Text style={s.metricLabel}>Net profit (this quarter)</Text>
                    <Text style={s.metricValue}>{fmtCompact(currency, result.profitToCash.netProfit)}</Text>
                </View>
                {result.profitToCash.conversionPct !== null && (
                    <View style={s.metricRow}>
                        <Text style={s.metricLabel}>Converted into cash</Text>
                        <Text style={s.metricValue}>{result.profitToCash.conversionPct.toFixed(0)}%</Text>
                    </View>
                )}
                <Text style={s.narrative}>{result.profitToCash.narrative}</Text>
            </View>

            {/* Step 3: Cash Trapped */}
            <View style={s.card}>
                <Text style={s.cardTitle}>Cash Trapped in the Business</Text>
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

            {/* Step 4: Trajectory */}
            <View style={s.card}>
                <Text style={s.cardTitle}>Cash Flow Trajectory</Text>
                {result.trajectory.points.length > 0 && (
                    <View style={s.trajectoryRow}>
                        {result.trajectory.points.map((p, i) => (
                            <TrajectoryBar key={i} point={p} currency={currency} maxAbs={maxAbsOCF} />
                        ))}
                    </View>
                )}
                <Text style={s.narrative}>{result.trajectory.narrative}</Text>
            </View>

            {/* Step 5: Risk signals */}
            {result.riskFlags.length > 0 && (
                <View style={s.flagsCard}>
                    <Text style={s.cardTitle}>⚠️ Cash Flow Risk Signals</Text>
                    {result.riskFlags.map((flag, i) => <RiskFlagRow key={i} flag={flag} />)}
                </View>
            )}
        </View>
    );
}

function TrajectoryBar({ point, currency, maxAbs }: { point: TrajectoryPoint; currency: string; maxAbs: number }) {
    const positive = point.operatingCF >= 0;
    const heightPct = Math.max(4, (Math.abs(point.operatingCF) / maxAbs) * 100);
    return (
        <View style={s.trajectoryCol}>
            <Text style={s.trajectoryValue}>{fmtCompact(currency, point.operatingCF)}</Text>
            <View style={s.trajectoryBarTrack}>
                <View style={[s.trajectoryBarFill, { height: `${heightPct}%`, backgroundColor: positive ? Colors.income : Colors.expense }]} />
            </View>
            <Text style={s.trajectoryLabel}>{point.label}</Text>
        </View>
    );
}

function RiskFlagRow({ flag }: { flag: CashFlowRiskFlag }) {
    return (
        <View style={s.flagRow}>
            <Icon name={flag.severity === 'critical' ? 'alert-circle' : 'alert-triangle'} size={13} color={flag.severity === 'critical' ? Colors.expense : Colors.warning} />
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

    card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    cardTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginBottom: 10 },
    divider: { height: 1, backgroundColor: Colors.border, marginVertical: 14 },

    metricRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
    metricLabel: { fontSize: 12.5, color: Colors.textSecondary, flex: 1 },
    metricValue: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    totalRow: { borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 4, paddingTop: 10 },
    totalLabel: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary, flex: 1 },
    totalValue: { fontSize: 15, fontWeight: '800' },
    narrative: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18, marginTop: 8 },

    trajectoryRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 130, marginBottom: 12 },
    trajectoryCol: { alignItems: 'center', flex: 1 },
    trajectoryValue: { fontSize: 10, color: Colors.textMuted, marginBottom: 4 },
    trajectoryBarTrack: { width: 28, height: 80, justifyContent: 'flex-end', backgroundColor: Colors.bg, borderRadius: 4, overflow: 'hidden' },
    trajectoryBarFill: { width: '100%', borderRadius: 4 },
    trajectoryLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 6 },

    flagsCard: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 14, borderLeftWidth: 4, borderLeftColor: Colors.expense },
    flagRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
    flagText: { flex: 1, fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18, marginTop: 1 },
});
