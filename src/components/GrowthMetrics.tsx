import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { Colors } from '../theme/colors';
import { Transaction } from '../types';

interface Props {
    transactions: Transaction[];
    currency: string;
    finance: any;
}

interface MonthlyRevenue {
    month: string;
    revenue: number;
    date: Date;
}

export default function GrowthMetrics({ transactions, currency, finance }: Props) {
    const [targetGrowthRate, setTargetGrowthRate] = useState('15');
    const [monthsToTarget, setMonthsToTarget] = useState('12');

    // Calculate monthly revenue trend
    const monthlyRevenue = useMemo(() => {
        const months = new Map<string, number>();

        // Get last 12 months of data
        for (const tx of transactions.filter(t => t.type === 'income')) {
            const date = new Date(tx.date);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            months.set(monthKey, (months.get(monthKey) || 0) + tx.amount);
        }

        // Create chronological array
        const sorted = Array.from(months.entries())
            .map(([month, revenue]) => ({
                month,
                revenue,
                date: new Date(month + '-01'),
            }))
            .sort((a, b) => a.date.getTime() - b.date.getTime())
            .slice(-12);

        return sorted;
    }, [transactions]);

    // Calculate growth metrics
    const growthMetrics = useMemo(() => {
        if (monthlyRevenue.length < 2) {
            return {
                currentMonthRevenue: finance.income || 0,
                lastMonthRevenue: 0,
                monthlyGrowthRate: 0,
                quarterlyRevenue: finance.income || 0,
                quarterlyGrowthRate: 0,
                annualRevenue: finance.income || 0,
                annualGrowthRate: 0,
                avgMonthlyRevenue: finance.income || 0,
                trend: 'stable',
            };
        }

        const current = monthlyRevenue[monthlyRevenue.length - 1];
        const previous = monthlyRevenue[monthlyRevenue.length - 2];
        const threeMonthsAgo = monthlyRevenue.length >= 4 ? monthlyRevenue[monthlyRevenue.length - 4] : null;
        const twelveMonthsAgo = monthlyRevenue.length >= 13 ? monthlyRevenue[0] : null;

        const currentMonthRevenue = current.revenue;
        const lastMonthRevenue = previous.revenue;
        const monthlyGrowthRate = lastMonthRevenue > 0
            ? ((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
            : 0;

        const quarterlyRevenue = monthlyRevenue.slice(-3).reduce((sum, m) => sum + m.revenue, 0);
        const previousQuarterRevenue = threeMonthsAgo
            ? monthlyRevenue.slice(-6, -3).reduce((sum, m) => sum + m.revenue, 0)
            : quarterlyRevenue;
        const quarterlyGrowthRate = previousQuarterRevenue > 0
            ? ((quarterlyRevenue - previousQuarterRevenue) / previousQuarterRevenue) * 100
            : 0;

        const annualRevenue = monthlyRevenue.reduce((sum, m) => sum + m.revenue, 0);
        const previousAnnualRevenue = twelveMonthsAgo
            ? monthlyRevenue.slice(0, -12).reduce((sum, m) => sum + m.revenue, 0) + monthlyRevenue.slice(-11).reduce((sum, m) => sum + m.revenue, 0)
            : annualRevenue;
        const annualGrowthRate = previousAnnualRevenue > 0
            ? ((annualRevenue - previousAnnualRevenue) / previousAnnualRevenue) * 100
            : 0;

        const avgMonthlyRevenue = monthlyRevenue.reduce((sum, m) => sum + m.revenue, 0) / monthlyRevenue.length;

        let trend = 'stable';
        if (monthlyGrowthRate > 5) trend = 'growing';
        if (monthlyGrowthRate < -5) trend = 'declining';

        return {
            currentMonthRevenue,
            lastMonthRevenue,
            monthlyGrowthRate,
            quarterlyRevenue,
            quarterlyGrowthRate,
            annualRevenue,
            annualGrowthRate,
            avgMonthlyRevenue,
            trend,
        };
    }, [monthlyRevenue, finance.income]);

    // Scenario planning
    const scenarioMetrics = useMemo(() => {
        const targetRate = parseFloat(targetGrowthRate) || 0;
        const months = parseFloat(monthsToTarget) || 1;
        const currentRevenue = growthMetrics.currentMonthRevenue || growthMetrics.avgMonthlyRevenue;

        // Calculate target revenue
        const targetRevenue = currentRevenue * Math.pow(1 + targetRate / 100, months / 12);
        const additionalRevenueNeeded = targetRevenue - currentRevenue;
        const monthlyIncreaseNeeded = additionalRevenueNeeded / Math.max(1, months);

        // Cash impact (assuming 30% margins)
        const profitMargin = finance.margin || 0.25;
        const additionalCashGenerated = additionalRevenueNeeded * (profitMargin / 100);

        return {
            targetRevenue: Math.round(targetRevenue),
            additionalRevenueNeeded: Math.round(additionalRevenueNeeded),
            monthlyIncreaseNeeded: Math.round(monthlyIncreaseNeeded),
            additionalCashGenerated: Math.round(additionalCashGenerated),
            achievable: monthlyIncreaseNeeded < currentRevenue * 0.5, // Feasible if <50% monthly increase
        };
    }, [targetGrowthRate, monthsToTarget, growthMetrics, finance.margin]);

    const trendColor =
        growthMetrics.trend === 'growing' ? Colors.income
            : growthMetrics.trend === 'declining' ? Colors.expense
            : Colors.warning;

    if (monthlyRevenue.length === 0) {
        return (
            <View style={styles.empty}>
                <Text style={styles.emptyText}>No revenue data yet. Add income transactions to see growth metrics.</Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.scroll}>
            {/* Current Performance */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>📈 Current Performance</Text>

                <View style={styles.metricsRow}>
                    <MetricCard
                        label="This Month"
                        value={`${currency}${growthMetrics.currentMonthRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                        color={Colors.income}
                    />
                    <MetricCard
                        label="Monthly Growth"
                        value={`${growthMetrics.monthlyGrowthRate > 0 ? '+' : ''}${growthMetrics.monthlyGrowthRate.toFixed(1)}%`}
                        color={growthMetrics.monthlyGrowthRate > 0 ? Colors.income : Colors.expense}
                    />
                </View>

                <View style={styles.metricsRow}>
                    <MetricCard
                        label="Last 3 Months"
                        value={`${currency}${growthMetrics.quarterlyRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                        color={Colors.income}
                    />
                    <MetricCard
                        label="Quarterly Growth"
                        value={`${growthMetrics.quarterlyGrowthRate > 0 ? '+' : ''}${growthMetrics.quarterlyGrowthRate.toFixed(1)}%`}
                        color={growthMetrics.quarterlyGrowthRate > 0 ? Colors.income : Colors.expense}
                    />
                </View>

                {/* Trend Indicator */}
                <View style={[styles.trendCard, { borderLeftColor: trendColor }]}>
                    <Text style={[styles.trendLabel, { color: trendColor }]}>
                        {growthMetrics.trend === 'growing' ? '📈 Growing' : growthMetrics.trend === 'declining' ? '📉 Declining' : '➡️ Stable'}
                    </Text>
                    <Text style={styles.trendDescription}>
                        {growthMetrics.trend === 'growing'
                            ? `Revenue increasing at ${growthMetrics.monthlyGrowthRate.toFixed(1)}% monthly`
                            : growthMetrics.trend === 'declining'
                            ? `Revenue declining at ${Math.abs(growthMetrics.monthlyGrowthRate).toFixed(1)}% monthly`
                            : 'Revenue growth is stable'}
                    </Text>
                </View>
            </View>

            {/* Growth Target Scenario */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>🎯 Growth Scenario Planner</Text>

                <View style={styles.inputRow}>
                    <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Target Growth Rate (%/year)</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="15"
                            placeholderTextColor={Colors.textMuted}
                            value={targetGrowthRate}
                            onChangeText={setTargetGrowthRate}
                            keyboardType="decimal-pad"
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Timeline (months)</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="12"
                            placeholderTextColor={Colors.textMuted}
                            value={monthsToTarget}
                            onChangeText={setMonthsToTarget}
                            keyboardType="number-pad"
                        />
                    </View>
                </View>

                {/* Scenario Results */}
                <View
                    style={[
                        styles.scenarioCard,
                        { borderLeftColor: scenarioMetrics.achievable ? Colors.income : Colors.warning },
                    ]}
                >
                    <View style={styles.scenarioHeader}>
                        <Text style={styles.scenarioTitle}>If you grow {targetGrowthRate}% annually...</Text>
                        <Text
                            style={[
                                styles.scenarioFeasibility,
                                { color: scenarioMetrics.achievable ? Colors.income : Colors.warning },
                            ]}
                        >
                            {scenarioMetrics.achievable ? '✓ Achievable' : '⚠️ Aggressive'}
                        </Text>
                    </View>

                    <View style={styles.scenarioMetrics}>
                        <ScenarioMetric
                            label="Target Revenue"
                            value={`${currency}${scenarioMetrics.targetRevenue.toLocaleString()}`}
                        />
                        <ScenarioMetric
                            label="Need to Add"
                            value={`${currency}${scenarioMetrics.additionalRevenueNeeded.toLocaleString()}`}
                        />
                        <ScenarioMetric
                            label="Monthly Increase"
                            value={`${currency}${scenarioMetrics.monthlyIncreaseNeeded.toLocaleString()}`}
                        />
                        <ScenarioMetric
                            label="Cash Generated"
                            value={`${currency}${scenarioMetrics.additionalCashGenerated.toLocaleString()}`}
                            highlight
                        />
                    </View>
                </View>
            </View>

            {/* Growth Insights */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>💡 Growth Insights</Text>

                <View style={styles.insightCard}>
                    {(() => {
                        const insights: { text: string; type: 'success' | 'warning' | 'info' }[] = [];

                        // Momentum insights
                        if (growthMetrics.monthlyGrowthRate > 10) {
                            insights.push({
                                text: `🚀 Strong momentum! Growing ${growthMetrics.monthlyGrowthRate.toFixed(1)}% monthly. Scale operations to capitalize.`,
                                type: 'success',
                            });
                        } else if (growthMetrics.monthlyGrowthRate > 0) {
                            insights.push({
                                text: `📈 Steady growth at ${growthMetrics.monthlyGrowthRate.toFixed(1)}% monthly. Focus on consistency.`,
                                type: 'info',
                            });
                        } else if (growthMetrics.monthlyGrowthRate < -10) {
                            insights.push({
                                text: `⚠️ Revenue declining. Investigate causes and activate growth initiatives.`,
                                type: 'warning',
                            });
                        }

                        // Consistency insights
                        const revenueStdDev = monthlyRevenue.length > 1
                            ? Math.sqrt(
                                monthlyRevenue.reduce((sum, m) => sum + Math.pow(m.revenue - growthMetrics.avgMonthlyRevenue, 2), 0) /
                                monthlyRevenue.length
                            )
                            : 0;
                        const coefficientOfVariation = growthMetrics.avgMonthlyRevenue > 0
                            ? (revenueStdDev / growthMetrics.avgMonthlyRevenue) * 100
                            : 0;

                        if (coefficientOfVariation < 20) {
                            insights.push({
                                text: `✓ Revenue is predictable and stable. Good foundation for planning.`,
                                type: 'success',
                            });
                        } else {
                            insights.push({
                                text: `⚠️ Revenue is variable (${coefficientOfVariation.toFixed(0)}% volatility). Work on predictability.`,
                                type: 'warning',
                            });
                        }

                        return insights.map((insight, i) => (
                            <View key={i} style={[styles.insight, { borderLeftColor: insight.type === 'success' ? Colors.income : insight.type === 'warning' ? Colors.expense : Colors.warning }]}>
                                <Text style={styles.insightText}>{insight.text}</Text>
                            </View>
                        ));
                    })()}
                </View>
            </View>

            {/* Action Items */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>✅ Growth Action Items</Text>

                <View style={styles.actionCard}>
                    {(() => {
                        const actions: string[] = [];

                        if (growthMetrics.monthlyGrowthRate < 5) {
                            actions.push('Increase sales/marketing efforts');
                        }

                        if (scenarioMetrics.monthlyIncreaseNeeded > growthMetrics.currentMonthRevenue * 0.3) {
                            actions.push('May need to expand team or operations');
                        }

                        if (finance.cashBalance < scenarioMetrics.additionalCashGenerated) {
                            actions.push('Secure additional funding for growth investments');
                        }

                        if (actions.length === 0) {
                            actions.push('🎯 On track! Maintain current growth trajectory.');
                        }

                        return actions.map((action, i) => (
                            <View key={i} style={styles.actionItem}>
                                <Text style={styles.actionText}>• {action}</Text>
                            </View>
                        ));
                    })()}
                </View>
            </View>
        </ScrollView>
    );
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>{label}</Text>
            <Text style={[styles.metricValue, { color }]}>{value}</Text>
        </View>
    );
}

function ScenarioMetric({
    label,
    value,
    highlight,
}: {
    label: string;
    value: string;
    highlight?: boolean;
}) {
    return (
        <View
            style={[
                styles.scenarioMetric,
                highlight && { backgroundColor: Colors.primary + '15', borderLeftColor: Colors.primary, borderLeftWidth: 3 },
            ]}
        >
            <Text style={styles.scenarioMetricLabel}>{label}</Text>
            <Text style={[styles.scenarioMetricValue, highlight && { color: Colors.primary, fontWeight: '700' }]}>
                {value}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    scroll: {
        flex: 1,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    empty: {
        padding: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyText: {
        fontSize: 14,
        color: Colors.textMuted,
        textAlign: 'center',
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
    metricsRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 12,
    },
    metricCard: {
        flex: 1,
        backgroundColor: Colors.surface,
        borderRadius: 10,
        padding: 12,
    },
    metricLabel: {
        fontSize: 11,
        color: Colors.textSecondary,
        marginBottom: 6,
    },
    metricValue: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    trendCard: {
        backgroundColor: Colors.surface,
        borderRadius: 10,
        padding: 12,
        borderLeftWidth: 4,
        marginBottom: 12,
    },
    trendLabel: {
        fontSize: 13,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    trendDescription: {
        fontSize: 12,
        color: Colors.textSecondary,
        lineHeight: 18,
    },
    inputRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 12,
    },
    inputGroup: {
        flex: 1,
    },
    inputLabel: {
        fontSize: 11,
        color: Colors.textSecondary,
        marginBottom: 6,
        fontWeight: '600',
    },
    input: {
        backgroundColor: Colors.bg,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: Colors.border,
        padding: 10,
        fontSize: 14,
        color: Colors.textPrimary,
    },
    scenarioCard: {
        backgroundColor: Colors.surface,
        borderRadius: 10,
        padding: 14,
        borderLeftWidth: 4,
    },
    scenarioHeader: {
        marginBottom: 12,
    },
    scenarioTitle: {
        fontSize: 13,
        fontWeight: 'bold',
        color: Colors.textPrimary,
        marginBottom: 4,
    },
    scenarioFeasibility: {
        fontSize: 12,
        fontWeight: '600',
    },
    scenarioMetrics: {
        gap: 8,
    },
    scenarioMetric: {
        backgroundColor: Colors.bg,
        borderRadius: 6,
        padding: 10,
    },
    scenarioMetricLabel: {
        fontSize: 11,
        color: Colors.textSecondary,
        marginBottom: 4,
    },
    scenarioMetricValue: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.textPrimary,
    },
    insightCard: {
        gap: 8,
    },
    insight: {
        backgroundColor: Colors.surface,
        borderRadius: 6,
        padding: 10,
        borderLeftWidth: 3,
    },
    insightText: {
        fontSize: 12,
        color: Colors.textSecondary,
        lineHeight: 18,
    },
    actionCard: {
        backgroundColor: Colors.surface,
        borderRadius: 10,
        padding: 12,
    },
    actionItem: {
        paddingVertical: 8,
    },
    actionText: {
        fontSize: 12,
        color: Colors.textSecondary,
        lineHeight: 18,
    },
});
