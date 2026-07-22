import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { Colors } from '../theme/colors';
import { suggestSolution } from '../utils/impactChain';
import NextStepLink from './NextStepLink';
import { Invoice } from '../types';

interface Props {
    currentRevenue: number;
    currentMargin: number;
    currency: string;
    invoices?: Invoice[];
    onSeeFullPicture?: () => void;
}

export default function PricingOptimizer({ currentRevenue, currentMargin, currency, invoices = [], onSeeFullPicture }: Props) {
    const [priceIncrease, setPriceIncrease] = useState('10');
    const [volumeLoss, setVolumeLoss] = useState('5');
    const [costReduction, setCostReduction] = useState('0');

    const customerCount = useMemo(
        () => new Set(invoices.map(inv => inv.clientName || 'Unknown')).size,
        [invoices]
    );

    const scenarios = useMemo(() => {
        const priceInc = parseFloat(priceIncrease) || 0;
        // Volume loss can't reach 100% (losing every customer) without the
        // "revenue per remaining customer" math below dividing by zero —
        // that produced Infinity/NaN profit figures with no explanation.
        const volLoss = Math.max(0, Math.min(99, parseFloat(volumeLoss) || 0));
        const costRed = parseFloat(costReduction) || 0;

        const baseMargin = currentMargin;
        const baseProfit = (currentRevenue * baseMargin) / 100;

        // Scenario 1: Price increase only
        const scenario1Revenue = currentRevenue * (1 + priceInc / 100) * (1 - volLoss / 100);
        const scenario1Margin = baseMargin + (priceInc * baseMargin) / 100 / (1 - volLoss / 100);
        const scenario1Profit = (scenario1Revenue * scenario1Margin) / 100;
        const scenario1ProfitGain = scenario1Profit - baseProfit;

        // Scenario 2: Cost reduction only
        const scenario2Margin = baseMargin + costRed;
        const scenario2Profit = (currentRevenue * scenario2Margin) / 100;
        const scenario2ProfitGain = scenario2Profit - baseProfit;

        // Scenario 3: Combined
        const scenario3Revenue = currentRevenue * (1 + priceInc / 100) * (1 - volLoss / 100);
        const scenario3Margin = scenario1Margin + costRed;
        const scenario3Profit = (scenario3Revenue * scenario3Margin) / 100;
        const scenario3ProfitGain = scenario3Profit - baseProfit;

        return {
            base: {
                revenue: currentRevenue,
                margin: baseMargin,
                profit: baseProfit,
            },
            priceIncrease: {
                revenue: scenario1Revenue,
                margin: scenario1Margin,
                profit: scenario1Profit,
                profitGain: scenario1ProfitGain,
                profitGainPct: baseProfit > 0 ? (scenario1ProfitGain / baseProfit) * 100 : 0,
                customerFactor: 1 - volLoss / 100,
            },
            costReduction: {
                revenue: currentRevenue,
                margin: scenario2Margin,
                profit: scenario2Profit,
                profitGain: scenario2ProfitGain,
                profitGainPct: baseProfit > 0 ? (scenario2ProfitGain / baseProfit) * 100 : 0,
                customerFactor: 1,
            },
            combined: {
                revenue: scenario3Revenue,
                margin: scenario3Margin,
                profit: scenario3Profit,
                profitGain: scenario3ProfitGain,
                profitGainPct: baseProfit > 0 ? (scenario3ProfitGain / baseProfit) * 100 : 0,
                customerFactor: 1 - volLoss / 100,
            },
        };
    }, [currentRevenue, currentMargin, priceIncrease, volumeLoss, costReduction]);

    const bestScenario = useMemo(() => {
        const profits = [
            { name: 'Price Increase', profit: scenarios.priceIncrease.profit, gain: scenarios.priceIncrease.profitGain },
            { name: 'Cost Reduction', profit: scenarios.costReduction.profit, gain: scenarios.costReduction.profitGain },
            { name: 'Combined', profit: scenarios.combined.profit, gain: scenarios.combined.profitGain },
        ];
        return profits.reduce((best, current) => (current.profit > best.profit ? current : best));
    }, [scenarios]);

    return (
        <ScrollView style={styles.scroll}>
            {/* Current State */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>📊 Current State</Text>
                <View style={styles.currentCard}>
                    <View style={styles.currentMetric}>
                        <Text style={styles.currentLabel}>Annual Revenue</Text>
                        <Text style={[styles.currentValue, { color: Colors.income }]}>
                            {currency}{currentRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </Text>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.currentMetric}>
                        <Text style={styles.currentLabel}>Profit Margin</Text>
                        <Text style={[styles.currentValue, { color: Colors.warning }]}>
                            {currentMargin.toFixed(1)}%
                        </Text>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.currentMetric}>
                        <Text style={styles.currentLabel}>Annual Profit</Text>
                        <Text style={[styles.currentValue, { color: Colors.income }]}>
                            {currency}{((currentRevenue * currentMargin) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </Text>
                    </View>
                    {customerCount > 0 && (
                        <>
                            <View style={styles.divider} />
                            <View style={styles.currentMetric}>
                                <Text style={styles.currentLabel}>Profit Per Customer</Text>
                                <Text style={[styles.currentValue, { color: Colors.income }]}>
                                    {currency}{(((currentRevenue * currentMargin) / 100) / customerCount).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </Text>
                            </View>
                        </>
                    )}
                </View>
                {customerCount > 0 && (
                    <Text style={styles.hint}>Based on {customerCount} customer{customerCount === 1 ? '' : 's'} billed to date</Text>
                )}
            </View>

            {/* Pricing Strategy */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>💰 Pricing Strategy</Text>

                <View style={styles.inputGroup}>
                    <View style={styles.inputField}>
                        <Text style={styles.label}>Price Increase (%)</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="10"
                            placeholderTextColor={Colors.textMuted}
                            value={priceIncrease}
                            onChangeText={setPriceIncrease}
                            keyboardType="decimal-pad"
                        />
                        <Text style={styles.hint}>What if you raise prices by this %?</Text>
                    </View>

                    <View style={styles.inputField}>
                        <Text style={styles.label}>Volume Loss (%)</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="5"
                            placeholderTextColor={Colors.textMuted}
                            value={volumeLoss}
                            onChangeText={setVolumeLoss}
                            keyboardType="decimal-pad"
                        />
                        <Text style={[styles.hint, (parseFloat(volumeLoss) || 0) >= 100 && { color: Colors.expense }]}>
                            {(parseFloat(volumeLoss) || 0) >= 100
                                ? 'Capped at 99% — losing 100% of customers leaves no revenue to model'
                                : 'Expect to lose this % of customers'}
                        </Text>
                    </View>

                    <View style={styles.inputField}>
                        <Text style={styles.label}>Cost Reduction (% margin)</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="0"
                            placeholderTextColor={Colors.textMuted}
                            value={costReduction}
                            onChangeText={setCostReduction}
                            keyboardType="decimal-pad"
                        />
                        <Text style={styles.hint}>Improve margin by reducing costs</Text>
                    </View>
                </View>
            </View>

            {/* Scenario Results */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>🎯 Scenario Results</Text>

                {/* Scenario 1: Price Increase */}
                <ScenarioCard
                    title="Scenario 1: Increase Prices"
                    subtitle={`Raise prices +${priceIncrease}% (accept -${Math.min(99, Math.max(0, parseFloat(volumeLoss) || 0))}% volume loss)`}
                    revenue={scenarios.priceIncrease.revenue}
                    margin={scenarios.priceIncrease.margin}
                    profit={scenarios.priceIncrease.profit}
                    profitGain={scenarios.priceIncrease.profitGain}
                    profitGainPct={scenarios.priceIncrease.profitGainPct}
                    profitPerCustomer={customerCount > 0 ? scenarios.priceIncrease.profit / (customerCount * scenarios.priceIncrease.customerFactor) : undefined}
                    currency={currency}
                    recommendation={
                        scenarios.priceIncrease.profitGain > 0
                            ? `Profit increases by ${scenarios.priceIncrease.profitGainPct.toFixed(0)}%`
                            : 'Risky - consider lower price increase'
                    }
                />

                {/* Scenario 2: Cost Reduction */}
                <ScenarioCard
                    title="Scenario 2: Reduce Costs"
                    subtitle={`Improve margin by ${costReduction}% (keep prices & volume same)`}
                    revenue={scenarios.costReduction.revenue}
                    margin={scenarios.costReduction.margin}
                    profit={scenarios.costReduction.profit}
                    profitGain={scenarios.costReduction.profitGain}
                    profitGainPct={scenarios.costReduction.profitGainPct}
                    profitPerCustomer={customerCount > 0 ? scenarios.costReduction.profit / customerCount : undefined}
                    currency={currency}
                    recommendation={
                        scenarios.costReduction.profitGain > 0
                            ? `Profit increases by ${scenarios.costReduction.profitGainPct.toFixed(0)}%`
                            : 'Limited impact - combine with pricing'
                    }
                />

                {/* Scenario 3: Combined */}
                <ScenarioCard
                    title="Scenario 3: Combined Strategy"
                    subtitle={`Raise prices +${priceIncrease}% AND reduce costs by ${costReduction}%`}
                    revenue={scenarios.combined.revenue}
                    margin={scenarios.combined.margin}
                    profit={scenarios.combined.profit}
                    profitGain={scenarios.combined.profitGain}
                    profitGainPct={scenarios.combined.profitGainPct}
                    profitPerCustomer={customerCount > 0 ? scenarios.combined.profit / (customerCount * scenarios.combined.customerFactor) : undefined}
                    currency={currency}
                    recommendation={
                        scenarios.combined.profitGain > 0
                            ? `🚀 Profit increases by ${scenarios.combined.profitGainPct.toFixed(0)}% - Best strategy!`
                            : 'Good balanced approach'
                    }
                    highlighted={scenarios.combined.profit === bestScenario.profit}
                />

                {/* Effect on Profit -> Cash Balance for the best scenario — the
                    same "harmful effect gets a concrete fix" pattern used
                    everywhere else in the app. Profit gain here is a real
                    increase in most cases (these are improvement scenarios),
                    but a large volume-loss assumption can flip it negative. */}
                {(() => {
                    const severity = bestScenario.gain < 0
                        ? 'harmful'
                        : bestScenario.profit > 0 && bestScenario.gain / bestScenario.profit < 0.02
                            ? 'caution'
                            : 'none';
                    const color = severity === 'harmful' ? Colors.expense : severity === 'caution' ? Colors.warning : Colors.income;
                    const solution = severity !== 'none' ? suggestSolution('pricing') : null;
                    return (
                        <View style={[styles.impactCard, { borderColor: color }]}>
                            <Text style={styles.impactTitle}>Effect of "{bestScenario.name}" on Profit</Text>
                            <Text style={[styles.impactVerdict, { color }]}>
                                {severity === 'harmful'
                                    ? `⚠ This assumption set actually loses ${currency}${Math.abs(bestScenario.gain).toLocaleString(undefined, { maximumFractionDigits: 0 })} — the volume-loss estimate may be eating the gain.`
                                    : severity === 'caution'
                                        ? '⚠ The gain here is small — worth testing a bigger move or a different lever.'
                                        : `✓ Projected to add ${currency}${Math.round(bestScenario.gain).toLocaleString()} in profit.`}
                            </Text>
                            {solution && (
                                <View style={styles.solutionBox}>
                                    <Text style={styles.solutionTitle}>💡 {solution.title}</Text>
                                    <Text style={styles.solutionDetail}>{solution.detail}</Text>
                                </View>
                            )}
                            {onSeeFullPicture && (
                                <NextStepLink text="See the full profit → cash picture" onPress={onSeeFullPicture} />
                            )}
                        </View>
                    );
                })()}
            </View>

            {/* Pricing Insights */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>💡 Pricing Insights</Text>

                <View style={styles.insightCard}>
                    {(() => {
                        const insights: string[] = [];

                        // Price elasticity insights
                        const priceElasticity = -(parseFloat(volumeLoss) || 0) / (parseFloat(priceIncrease) || 1);
                        if (priceElasticity > -0.5) {
                            insights.push('✓ Low price sensitivity. You can raise prices without major volume loss.');
                        } else if (priceElasticity < -2) {
                            insights.push('⚠️ High price sensitivity. Volume loss may outweigh price gains.');
                        }

                        // Best lever
                        const costReductionLever = scenarios.costReduction.profitGain;
                        const pricingLever = scenarios.priceIncrease.profitGain;

                        if (pricingLever > costReductionLever * 1.5) {
                            insights.push('💰 Pricing is your best lever for profit growth. Test price increases.');
                        } else if (costReductionLever > pricingLever * 1.5) {
                            insights.push('⚙️ Cost reduction has bigger impact. Focus on operational efficiency.');
                        } else {
                            insights.push('⚖️ Both pricing and costs matter. Use a balanced approach.');
                        }

                        // Price positioning
                        if (currentMargin < 20) {
                            insights.push('⚠️ Low margin business. Pricing power is critical.');
                        } else if (currentMargin > 50) {
                            insights.push('✓ High margin business. You have pricing flexibility.');
                        }

                        return insights.map((insight, i) => (
                            <Text key={i} style={styles.insight}>{insight}</Text>
                        ));
                    })()}
                </View>
            </View>

            {/* Action Plan */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>✅ Recommended Action Plan</Text>

                <View style={styles.actionCard}>
                    <ActionStep
                        num={1}
                        title="Test Price Change"
                        desc={`Try a ${(parseFloat(priceIncrease) / 2).toFixed(0)}% increase with key customers first`}
                    />
                    <ActionStep
                        num={2}
                        title="Measure Volume Impact"
                        desc="Track if volume drops more or less than expected"
                    />
                    <ActionStep
                        num={3}
                        title="Optimize Costs"
                        desc={`Simultaneously reduce costs to improve margins by ${costReduction}%`}
                    />
                    <ActionStep
                        num={4}
                        title="Scale What Works"
                        desc="Roll out winning strategy to all customers"
                    />
                </View>
            </View>
        </ScrollView>
    );
}

interface ScenarioCardProps {
    title: string;
    subtitle: string;
    revenue: number;
    margin: number;
    profit: number;
    profitGain: number;
    profitGainPct: number;
    profitPerCustomer?: number;
    currency: string;
    recommendation: string;
    highlighted?: boolean;
}

function ScenarioCard({
    title,
    subtitle,
    revenue,
    margin,
    profit,
    profitGain,
    profitGainPct,
    profitPerCustomer,
    currency,
    recommendation,
    highlighted,
}: ScenarioCardProps) {
    return (
        <View style={[styles.scenarioCard, highlighted && { borderColor: Colors.income, borderWidth: 2 }]}>
            {highlighted && <View style={styles.bestBadge}><Text style={styles.bestText}>BEST</Text></View>}

            <Text style={styles.scenarioTitle}>{title}</Text>
            <Text style={styles.scenarioSubtitle}>{subtitle}</Text>

            <View style={styles.scenarioMetrics}>
                <ScenarioMetric label="Revenue" value={`${currency}${revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
                <ScenarioMetric
                    label="Margin"
                    value={`${margin.toFixed(1)}%`}
                    color={margin > 40 ? Colors.income : margin > 25 ? Colors.warning : Colors.expense}
                />
                <ScenarioMetric label="Profit" value={`${currency}${profit.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} color={Colors.income} />
                {profitPerCustomer !== undefined && (
                    <ScenarioMetric label="Profit / Customer" value={`${currency}${profitPerCustomer.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} color={Colors.income} />
                )}
            </View>

            <View style={styles.gainBanner}>
                <Text style={styles.gainLabel}>Profit Gain</Text>
                <Text style={[styles.gainValue, { color: profitGain >= 0 ? Colors.income : Colors.expense }]}>
                    {profitGain >= 0 ? '+' : ''}{currency}{profitGain.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    {' '}
                    ({profitGainPct >= 0 ? '+' : ''}{profitGainPct.toFixed(0)}%)
                </Text>
            </View>

            <Text style={styles.recommendation}>{recommendation}</Text>
        </View>
    );
}

function ScenarioMetric({ label, value, color = Colors.textPrimary }: { label: string; value: string; color?: string }) {
    return (
        <View style={styles.scenarioMetric}>
            <Text style={styles.scenarioMetricLabel}>{label}</Text>
            <Text style={[styles.scenarioMetricValue, { color }]}>{value}</Text>
        </View>
    );
}

function ActionStep({ num, title, desc }: { num: number; title: string; desc: string }) {
    return (
        <View style={styles.actionStep}>
            <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{num}</Text>
            </View>
            <View style={{ flex: 1 }}>
                <Text style={styles.stepTitle}>{title}</Text>
                <Text style={styles.stepDesc}>{desc}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    scroll: {
        flex: 1,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    section: {
        marginBottom: 20,
    },
    sectionTitle: {
        fontSize: 15,
        fontWeight: 'bold',
        color: Colors.textPrimary,
        marginBottom: 12,
    },
    currentCard: {
        backgroundColor: Colors.surface,
        borderRadius: 10,
        padding: 14,
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    currentMetric: {
        alignItems: 'center',
    },
    currentLabel: {
        fontSize: 11,
        color: Colors.textSecondary,
        marginBottom: 6,
    },
    currentValue: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    divider: {
        width: 1,
        height: 50,
        backgroundColor: Colors.border,
    },
    inputGroup: {
        gap: 12,
        marginBottom: 12,
    },
    inputField: {
        marginBottom: 4,
    },
    label: {
        fontSize: 12,
        fontWeight: '600',
        color: Colors.textPrimary,
        marginBottom: 6,
    },
    input: {
        backgroundColor: Colors.bg,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: Colors.border,
        padding: 10,
        fontSize: 14,
        color: Colors.textPrimary,
        marginBottom: 4,
    },
    hint: {
        fontSize: 10,
        color: Colors.textMuted,
    },
    scenarioCard: {
        backgroundColor: Colors.surface,
        borderRadius: 10,
        padding: 14,
        marginBottom: 12,
        borderLeftWidth: 4,
        borderLeftColor: Colors.primary,
        position: 'relative',
    },
    bestBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        backgroundColor: Colors.income,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    bestText: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#fff',
    },
    scenarioTitle: {
        fontSize: 13,
        fontWeight: 'bold',
        color: Colors.textPrimary,
        marginBottom: 4,
    },
    scenarioSubtitle: {
        fontSize: 11,
        color: Colors.textSecondary,
        marginBottom: 10,
    },
    scenarioMetrics: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 12,
    },
    scenarioMetric: {
        flex: 1,
        backgroundColor: Colors.bg,
        borderRadius: 6,
        padding: 8,
        alignItems: 'center',
    },
    scenarioMetricLabel: {
        fontSize: 10,
        color: Colors.textMuted,
        marginBottom: 4,
    },
    scenarioMetricValue: {
        fontSize: 13,
        fontWeight: '600',
    },
    gainBanner: {
        backgroundColor: Colors.primary + '15',
        borderRadius: 6,
        padding: 10,
        marginBottom: 10,
    },
    gainLabel: {
        fontSize: 11,
        color: Colors.textSecondary,
        marginBottom: 4,
    },
    gainValue: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    recommendation: {
        fontSize: 12,
        color: Colors.textSecondary,
        fontStyle: 'italic',
        lineHeight: 18,
    },
    impactCard:   { backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, padding: 14, marginTop: 4 },
    impactTitle:  { fontSize: 12, fontWeight: '800', color: Colors.textPrimary, marginBottom: 8 },
    impactVerdict:{ fontSize: 12, fontWeight: '600', lineHeight: 17 },
    solutionBox:    { marginTop: 10, backgroundColor: Colors.primary + '10', borderRadius: 8, padding: 10 },
    solutionTitle:  { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, marginBottom: 3 },
    solutionDetail: { fontSize: 11, color: Colors.textSecondary, lineHeight: 16 },
    insightCard: {
        backgroundColor: Colors.surface,
        borderRadius: 10,
        padding: 12,
        gap: 8,
    },
    insight: {
        fontSize: 12,
        color: Colors.textSecondary,
        lineHeight: 18,
    },
    actionCard: {
        backgroundColor: Colors.surface,
        borderRadius: 10,
        padding: 12,
        gap: 12,
    },
    actionStep: {
        flexDirection: 'row',
        gap: 10,
    },
    stepNum: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: Colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    stepNumText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 12,
    },
    stepTitle: {
        fontSize: 12,
        fontWeight: '600',
        color: Colors.textPrimary,
        marginBottom: 2,
    },
    stepDesc: {
        fontSize: 11,
        color: Colors.textMuted,
    },
});
