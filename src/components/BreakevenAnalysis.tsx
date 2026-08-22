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
        costStructureUpsideDown,
    } = result;

    const isAboveBreakeven = !costStructureUpsideDown && surplusOrGap >= 0;
    const contributionMarginPct = (1 - variableCostRatio) * 100;
    const contributionMargin = contributionMarginPct.toFixed(1);
    const contributionColor = contributionMarginPct >= 0 ? Colors.income : Colors.expense;

    // breakevenRevenue is Infinity when costStructureUpsideDown -- there's
    // no finite point to chart, so the bars are skipped entirely in that
    // state rather than trying to render an infinite bar.
    const maxBar = useMemo(
        () => costStructureUpsideDown ? 1 : Math.max(currentRevenue, breakevenRevenue, 1),
        [currentRevenue, breakevenRevenue, costStructureUpsideDown]
    );
    const currentBarPct  = (currentRevenue / maxBar) * 100;
    const breakevenBarPct = (breakevenRevenue / maxBar) * 100;

    const statusColor = costStructureUpsideDown ? Colors.expense : isAboveBreakeven ? Colors.income : Colors.expense;
    const statusText  = costStructureUpsideDown
        ? 'COST STRUCTURE UPSIDE DOWN ✗'
        : isAboveBreakeven ? 'ABOVE BREAKEVEN ✓' : 'BELOW BREAKEVEN ✗';

    return (
        <View style={styles.card}>
            <Text style={styles.title}>BREAKEVEN ANALYSIS — YOUR ACTUAL BUSINESS</Text>
            <Text style={styles.subtitle}>
                Based on this period's real revenue and costs. For a what-if calculator on a specific price or product, see Break-Even Calculator under Financial Ratios.
            </Text>

            {/* Status */}
            <View style={[styles.statusRow, { borderColor: statusColor }]}>
                <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
                <Text style={styles.cushionText}>
                    {costStructureUpsideDown
                        ? `Every sale loses money before fixed costs are even counted`
                        : isAboveBreakeven
                            ? `Profit Cushion: ${fmt(surplusOrGap, currency)}/month`
                            : `Shortfall: ${fmt(Math.abs(surplusOrGap), currency)}/month`}
                </Text>
            </View>

            {costStructureUpsideDown ? (
                <>
                    <View style={[styles.belowBox, { borderColor: Colors.expense, marginBottom: 12 }]}>
                        <Text style={[styles.belowTitle, { color: Colors.expense }]}>WHY THERE'S NO BREAKEVEN POINT TO SHOW</Text>
                        <Text style={styles.belowText}>
                            Variable costs alone ({fmt(variableCostRatio * currentRevenue, currency)}) already exceed revenue
                            ({fmt(currentRevenue, currency)}) this period — before fixed costs are even added. Selling more
                            doesn't help here; it loses more, since each additional sale costs more than it brings in.
                        </Text>
                        <Text style={styles.belowAdvice}>
                            Fix the cost per sale first — raise prices or cut variable costs — before volume can help.
                        </Text>
                    </View>
                </>
            ) : (
                <>
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
                </>
            )}

            {/* Cost structure */}
            <View style={styles.section}>
                <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Fixed Costs</Text>
                    <Text style={styles.detailValue}>{fmt(fixedCosts, currency)}/month</Text>
                </View>
                <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Variable Cost Ratio</Text>
                    <Text style={[styles.detailValue, { color: variableCostRatio > 1 ? Colors.expense : Colors.textPrimary }]}>
                        {(variableCostRatio * 100).toFixed(1)}%
                    </Text>
                </View>
                <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Contribution Margin</Text>
                    <Text style={[styles.detailValue, { color: contributionColor }]}>{contributionMargin}%</Text>
                </View>
                {!costStructureUpsideDown && !isAboveBreakeven && monthsToBreakeven !== null && (
                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Est. Months to Breakeven</Text>
                        <Text style={[styles.detailValue, { color: Colors.warning }]}>{monthsToBreakeven} months</Text>
                    </View>
                )}
            </View>

            {/* Paths to more profit — only meaningful while there's still a finite gap to
                close; once above breakeven, revenueIncreaseNeeded/costReductionNeeded
                are 0 and there's nothing to show here. The "sell more" framing doesn't
                apply at all when costStructureUpsideDown (that's the box above instead). */}
            {!costStructureUpsideDown && !isAboveBreakeven && (
                <>
                    <View style={styles.divider} />
                    <Text style={styles.sectionTitle}>PATHS TO BREAKEVEN</Text>
                    <View style={styles.section}>
                        <View style={styles.pathCard}>
                            <Text style={styles.pathLabel}>Option A: Revenue Only</Text>
                            <Text style={styles.pathDetail}>
                                Need {fmt(pathsToProfitability.revenueIncreaseNeeded, currency)} more revenue
                            </Text>
                        </View>
                        <View style={styles.pathCard}>
                            <Text style={styles.pathLabel}>Option B: Costs Only</Text>
                            <Text style={styles.pathDetail}>
                                Reduce costs by {fmt(pathsToProfitability.costReductionNeeded, currency)}
                            </Text>
                        </View>
                        <View style={styles.pathCard}>
                            <Text style={styles.pathLabel}>Option C: Split Evenly</Text>
                            <Text style={styles.pathDetail}>
                                +{fmt(pathsToProfitability.combinedPath.revenueIncrease, currency)} revenue
                                {' & '}−{fmt(pathsToProfitability.combinedPath.costReduction, currency)} costs
                            </Text>
                        </View>
                    </View>
                </>
            )}

            {!costStructureUpsideDown && !isAboveBreakeven && (
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
        marginBottom: 4,
    },
    subtitle: {
        color: Colors.textMuted,
        fontSize: 11,
        lineHeight: 15,
        fontStyle: 'italic',
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
