import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { Colors } from '../theme/colors';
import { BreakevenResult, computeDiscountImpactOnBreakeven } from '../utils/profitability';

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

    // Revenue and fixed costs both at zero means there's simply no activity
    // recorded for this period yet -- not a business that has genuinely hit
    // its exact breakeven point. Without this, that reads as a trivially
    // true "ABOVE BREAKEVEN" (0 >= 0) with every line item at zero, which
    // looks like the feature is broken rather than just waiting on data.
    if (currentRevenue === 0 && fixedCosts === 0 && variableCostRatio === 0) {
        return (
            <View style={styles.card}>
                <Text style={styles.title}>BREAKEVEN ANALYSIS — YOUR ACTUAL BUSINESS</Text>
                <View style={[styles.belowBox, { borderColor: Colors.border }]}>
                    <Text style={[styles.belowTitle, { color: Colors.textMuted }]}>NOT ENOUGH DATA YET</Text>
                    <Text style={styles.belowText}>
                        No revenue or expenses recorded for this period, so there's nothing real to compare against a breakeven point. Record some transactions and this will fill in automatically.
                    </Text>
                </View>
            </View>
        );
    }

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

    // A discount doesn't lower what a sale costs to deliver -- only what it
    // brings in -- so it raises the effective variable-cost ratio and pushes
    // breakeven further out, even though price cuts often get proposed as a
    // way to hit volume targets faster.
    const [discountPct, setDiscountPct] = useState('');
    const discountImpact = useMemo(
        () => computeDiscountImpactOnBreakeven(result, parseFloat(discountPct) || 0),
        [result, discountPct]
    );
    const showDiscountResult = discountImpact.hasRevenue && (parseFloat(discountPct) || 0) > 0;

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

            {/* Discount impact -- same real fixed/variable costs above, just
                asking what a price cut does to them instead of what a price
                change or cost change would. */}
            {discountImpact.hasRevenue && (
                <>
                    <View style={styles.divider} />
                    <Text style={styles.sectionTitle}>WHAT IF YOU DISCOUNTED?</Text>
                    <View style={styles.presetRow}>
                        {[5, 10, 15, 20, 25].map(p => (
                            <TouchableOpacity
                                key={p}
                                style={[styles.presetChip, discountPct === String(p) && styles.presetChipActive]}
                                onPress={() => setDiscountPct(String(p))}
                            >
                                <Text style={[styles.presetChipText, discountPct === String(p) && styles.presetChipTextActive]}>{p}%</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <TextInput
                        style={styles.discountInput}
                        placeholder="or type a custom discount %"
                        placeholderTextColor={Colors.textMuted}
                        keyboardType="numeric"
                        value={discountPct}
                        onChangeText={setDiscountPct}
                    />

                    {showDiscountResult && (
                        <View style={styles.discountResultBox}>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>New Breakeven Revenue Needed</Text>
                                <Text style={[styles.detailValue, { color: Colors.warning }]}>
                                    {discountImpact.costStructureUpsideDown ? 'Unreachable' : fmt(discountImpact.newBreakevenRevenue, currency)}
                                </Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Extra Revenue Needed to Still Break Even</Text>
                                <Text style={[styles.detailValue, { color: Colors.expense }]}>
                                    {!isFinite(discountImpact.breakevenRevenueIncrease) ? 'No finite point' : `+${fmt(discountImpact.breakevenRevenueIncrease, currency)}`}
                                </Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Profit Impact at Today's Sales Volume</Text>
                                <Text style={[styles.detailValue, { color: Colors.expense }]}>
                                    {fmtSigned(discountImpact.profitImpactAtCurrentVolume, currency)}/month
                                </Text>
                            </View>
                            <Text style={styles.discountNote}>
                                {discountImpact.costStructureUpsideDown
                                    ? `A ${discountPct}% discount pushes your cost structure upside down — variable costs alone would exceed the discounted revenue. Only offer this if it's paired with a real volume increase, not a way to reach one.`
                                    : `This assumes the same units sold, just at a lower price. It would only pay for itself if the discount brings in enough EXTRA volume to close the ${fmt(discountImpact.breakevenRevenueIncrease, currency)} gap above.`}
                            </Text>
                        </View>
                    )}
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
    presetRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 10,
    },
    presetChip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: Colors.border,
        backgroundColor: Colors.bg,
    },
    presetChipActive: {
        backgroundColor: Colors.primary,
        borderColor: Colors.primary,
    },
    presetChipText: {
        fontSize: 12,
        color: Colors.textSecondary,
    },
    presetChipTextActive: {
        color: '#fff',
        fontWeight: '700',
    },
    discountInput: {
        backgroundColor: Colors.bg,
        borderColor: Colors.border,
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: Colors.textPrimary,
        fontSize: 13,
        marginBottom: 10,
    },
    discountResultBox: {
        backgroundColor: Colors.bg,
        borderRadius: 8,
        padding: 12,
    },
    discountNote: {
        color: Colors.textMuted,
        fontSize: 11.5,
        lineHeight: 16,
        fontStyle: 'italic',
        marginTop: 6,
    },
});
