import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { BreakevenResult } from '../utils/profitability';

interface Props {
    result: BreakevenResult;
    currency: string;
}

function fmt(value: number, currency: string): string {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${currency}${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000)     return `${currency}${(abs / 1_000).toFixed(1)}K`;
    return `${currency}${abs.toFixed(0)}`;
}

function fmtSigned(value: number, currency: string): string {
    const sign = value >= 0 ? '+' : '-';
    return `${sign}${fmt(Math.abs(value), currency)}`;
}

export default function BreakevenAnalysis({ result, currency }: Props) {
    const {
        fixedCosts,
        variableCostRatio,
        breakevenRevenue,
        currentRevenue,
        surplusOrGap,
        monthsToBreakeven,
        pathsToProfitability,
    } = result;

    const isAboveBreakeven = surplusOrGap >= 0;
    const contributionMargin = ((1 - variableCostRatio) * 100).toFixed(1);

    const maxBar = useMemo(() => Math.max(currentRevenue, breakevenRevenue, 1), [currentRevenue, breakevenRevenue]);
    const currentBarPct  = (currentRevenue / maxBar) * 100;
    const breakevenBarPct = (breakevenRevenue / maxBar) * 100;

    const statusColor = isAboveBreakeven ? Colors.income : Colors.expense;
    const statusText  = isAboveBreakeven ? 'ABOVE BREAKEVEN ✓' : 'BELOW BREAKEVEN ✗';

    return (
        <View style={styles.card}>
            <Text style={styles.title}>BREAKEVEN ANALYSIS</Text>

            {/* Status */}
            <View style={[styles.statusRow, { borderColor: statusColor }]}>
                <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
                <Text style={styles.cushionText}>
                    {isAboveBreakeven
                        ? `Profit Cushion: ${fmt(surplusOrGap, currency)}/month`
                        : `Shortfall: ${fmt(Math.abs(surplusOrGap), currency)}/month`}
                </Text>
            </View>

            {/* Revenue vs Breakeven bars */}
            <View style={styles.section}>
                <View style={styles.barRow}>
                    <Text style={styles.barLabel}>Current Revenue</Text>
                    <View style={styles.barTrack}>
                        <View style={[styles.barFill, { width: `${currentBarPct}%`, backgroundColor: Colors.income }]} />
                    </View>
                    <Text style={[styles.barValue, { color: Colors.income }]}>{fmt(currentRevenue, currency)}</Text>
                </View>
                <View style={styles.barRow}>
                    <Text style={styles.barLabel}>Breakeven Point</Text>
                    <View style={styles.barTrack}>
                        <View style={[styles.barFill, { width: `${breakevenBarPct}%`, backgroundColor: Colors.warning }]} />
                    </View>
                    <Text style={[styles.barValue, { color: Colors.warning }]}>{fmt(breakevenRevenue, currency)}</Text>
                </View>
                <View style={styles.gapRow}>
                    <Text style={styles.gapLabel}>Gap:</Text>
                    <Text style={[styles.gapValue, { color: statusColor }]}>
                        {fmtSigned(surplusOrGap, currency)} ({isAboveBreakeven ? 'above breakeven' : 'below breakeven'})
                    </Text>
                </View>
            </View>

            <View style={styles.divider} />

            {/* Cost structure */}
            <View style={styles.section}>
                <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Fixed Costs</Text>
                    <Text style={styles.detailValue}>{fmt(fixedCosts, currency)}/month</Text>
                </View>
                <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Variable Cost Ratio</Text>
                    <Text style={styles.detailValue}>{(variableCostRatio * 100).toFixed(1)}%</Text>
                </View>
                <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Contribution Margin</Text>
                    <Text style={[styles.detailValue, { color: Colors.income }]}>{contributionMargin}%</Text>
                </View>
                {!isAboveBreakeven && monthsToBreakeven !== null && (
                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Est. Months to Breakeven</Text>
                        <Text style={[styles.detailValue, { color: Colors.warning }]}>{monthsToBreakeven} months</Text>
                    </View>
                )}
            </View>

            <View style={styles.divider} />

            {/* Paths to more profit */}
            <Text style={styles.sectionTitle}>PATHS TO MORE PROFIT</Text>
            <View style={styles.section}>
                <View style={styles.pathCard}>
                    <Text style={styles.pathLabel}>Option A: Grow Revenue 15%</Text>
                    <Text style={styles.pathDetail}>
                        Need {fmt(pathsToProfitability.revenueIncreaseNeeded, currency)} more revenue
                    </Text>
                </View>
                <View style={styles.pathCard}>
                    <Text style={styles.pathLabel}>Option B: Cut Costs 10%</Text>
                    <Text style={styles.pathDetail}>
                        Reduce costs by {fmt(pathsToProfitability.costReductionNeeded, currency)}
                    </Text>
                </View>
                <View style={styles.pathCard}>
                    <Text style={styles.pathLabel}>Option C: Both 8% each</Text>
                    <Text style={styles.pathDetail}>
                        +{fmt(pathsToProfitability.combinedPath.revenueIncrease, currency)} revenue
                        {' & '}−{fmt(pathsToProfitability.combinedPath.costReduction, currency)} costs
                    </Text>
                </View>
            </View>

            {!isAboveBreakeven && (
                <>
                    <View style={styles.divider} />
                    <View style={[styles.belowBox, { borderColor: Colors.expense }]}>
                        <Text style={[styles.belowTitle, { color: Colors.expense }]}>PRIORITY ACTIONS</Text>
                        <Text style={styles.belowText}>
                            Need {fmt(Math.abs(surplusOrGap), currency)} more revenue OR{'\n'}
                            {fmt(pathsToProfitability.costReductionNeeded, currency)} less costs each month.
                        </Text>
                        <Text style={styles.belowAdvice}>
                            Fastest path: Cut variable costs first (immediate impact on margin).
                        </Text>
                    </View>
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: Colors.surface,
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    title: {
        color: Colors.textMuted,
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 0.8,
        marginBottom: 12,
    },
    statusRow: {
        borderWidth: 1,
        borderRadius: 8,
        padding: 12,
        marginBottom: 16,
    },
    statusText: {
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 4,
    },
    cushionText: {
        color: Colors.textSecondary,
        fontSize: 12,
    },
    section: {
        marginBottom: 4,
    },
    barRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
        gap: 8,
    },
    barLabel: {
        width: 110,
        color: Colors.textSecondary,
        fontSize: 12,
    },
    barTrack: {
        flex: 1,
        height: 10,
        backgroundColor: Colors.bg,
        borderRadius: 5,
        overflow: 'hidden',
    },
    barFill: {
        height: 10,
        borderRadius: 5,
    },
    barValue: {
        width: 60,
        fontSize: 12,
        fontWeight: '600',
        textAlign: 'right',
    },
    gapRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 4,
    },
    gapLabel: {
        color: Colors.textMuted,
        fontSize: 12,
    },
    gapValue: {
        fontSize: 12,
        fontWeight: '600',
    },
    divider: {
        height: 1,
        backgroundColor: Colors.border,
        marginVertical: 12,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    detailLabel: {
        color: Colors.textSecondary,
        fontSize: 13,
    },
    detailValue: {
        color: Colors.textPrimary,
        fontSize: 13,
        fontWeight: '600',
    },
    sectionTitle: {
        color: Colors.textMuted,
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 0.8,
        marginBottom: 10,
    },
    pathCard: {
        backgroundColor: Colors.bg,
        borderRadius: 8,
        padding: 10,
        marginBottom: 8,
    },
    pathLabel: {
        color: Colors.textPrimary,
        fontSize: 13,
        fontWeight: '600',
        marginBottom: 2,
    },
    pathDetail: {
        color: Colors.textSecondary,
        fontSize: 12,
    },
    belowBox: {
        borderWidth: 1,
        borderRadius: 8,
        padding: 12,
    },
    belowTitle: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.8,
        marginBottom: 8,
    },
    belowText: {
        color: Colors.textSecondary,
        fontSize: 13,
        lineHeight: 20,
        marginBottom: 8,
    },
    belowAdvice: {
        color: Colors.warning,
        fontSize: 12,
        fontStyle: 'italic',
    },
});
