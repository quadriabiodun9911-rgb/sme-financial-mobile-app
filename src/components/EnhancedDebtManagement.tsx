import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { FinanceData, Loan } from '../types';
import LoanROICalculator from './LoanROICalculator';

interface Props {
    finance: FinanceData;
    currency: string;
    loans?: Loan[];
}

export default function EnhancedDebtManagement({ finance, currency, loans = [] }: Props) {
    // finance.liabilities only ever reflects Settings' manual "opening
    // liabilities" figure — computeFinance never folds in the live Loan
    // Register (each screen is expected to add that itself, per its own
    // comment), and this component never did. That's why this page showed
    // £0 total debt / a 100 health score with two active loans totalling
    // £598,500 sitting in the Loan Register. Mirrors the same live-balance
    // calculation ReportsScreen's own Balance Sheet tab already uses.
    const liveLoanBalance = loans
        .filter(l => l.status === 'active')
        .reduce((sum, l) => {
            const paid = (l.payments ?? []).reduce((s, p) => s + (p.amount || 0), 0);
            return sum + Math.max(0, (l.principal || 0) - paid);
        }, 0);
    const liabilities = finance.liabilities + liveLoanBalance;
    const assets = finance.assets;
    const equity = finance.equity;
    const profit = finance.profit;
    const income = finance.income;

    // Key ratios
    const debtToAssets = assets > 0 ? (liabilities / assets) * 100 : 0;
    const debtToEquity = equity > 0 ? liabilities / equity : liabilities > 0 ? Infinity : 0;
    const interestCoverage = profit > 0 ? profit / Math.max(1, liabilities * 0.05) : 0; // Assume 5% interest rate
    const debtServiceCapacity = income > 0 ? (profit / income) * 100 : 0;

    // Debt health score
    const getDebtHealthScore = (): { score: number; status: 'healthy' | 'moderate' | 'concerning'; color: string } => {
        let score = 100;

        if (debtToAssets > 70) score -= 30;
        else if (debtToAssets > 50) score -= 20;
        else if (debtToAssets > 30) score -= 10;

        if (debtToEquity > 2) score -= 25;
        else if (debtToEquity > 1) score -= 15;
        else if (debtToEquity > 0.5) score -= 5;

        if (interestCoverage < 1.5) score -= 20;
        else if (interestCoverage < 2.5) score -= 10;

        const status = score >= 70 ? 'healthy' : score >= 50 ? 'moderate' : 'concerning';
        const color = status === 'healthy' ? Colors.income : status === 'moderate' ? Colors.warning : Colors.expense;

        return { score: Math.max(0, Math.min(100, score)), status, color };
    };

    const health = getDebtHealthScore();

    // Debt management strategies
    const getRecommendations = (): string[] => {
        const recs: string[] = [];

        if (debtToAssets > 60) {
            recs.push('High debt burden: Prioritize debt repayment or increase asset productivity');
        }

        if (debtToEquity > 1.5) {
            recs.push('Leverage is high: Consider equity financing instead of debt for growth');
        }

        if (profit < liabilities * 0.1) {
            recs.push('Low profitability relative to debt: Focus on margin improvement');
        }

        if (liabilities > 0 && income === 0) {
            recs.push('No recorded income: Start generating revenue to service debt');
        }

        if (debtToAssets < 30 && equity > 0) {
            recs.push('Strong debt position: You can safely increase borrowing for growth if needed');
        }

        if (profit > 0) {
            recs.push('Positive cash flow: Allocate profits to debt reduction for faster payoff');
        }

        return recs;
    };

    const getDebtImpactOnBusiness = (): string[] => {
        const impacts: string[] = [];

        if (debtToEquity > 1) {
            impacts.push('⚠️ High debt reduces financial flexibility - limited capacity to invest in growth');
            impacts.push('⚠️ Higher debt service costs reduce profitability');
            impacts.push('⚠️ Risk of defaulting affects business reputation and future borrowing');
        } else if (debtToEquity > 0.5) {
            impacts.push('✓ Moderate debt can be healthy - leverages capital for growth');
            impacts.push('✓ Maintains financial flexibility for opportunities');
        } else {
            impacts.push('✓ Low debt indicates strong financial health');
            impacts.push('✓ High financial flexibility for strategic investments');
        }

        return impacts;
    };

    const recommendations = getRecommendations();
    const impacts = getDebtImpactOnBusiness();

    return (
        <View>
            {/* Debt Health Score Card */}
            <View style={[styles.healthCard, { borderColor: health.color }]}>
                <View style={styles.healthHeader}>
                    <Text style={styles.healthLabel}>Debt Health Score</Text>
                    <Text style={[styles.healthScore, { color: health.color }]}>{health.score.toFixed(0)}/100</Text>
                </View>
                <View style={[styles.healthBar, { backgroundColor: Colors.border }]}>
                    <View
                        style={[
                            styles.healthBarFill,
                            { width: `${health.score}%`, backgroundColor: health.color },
                        ]}
                    />
                </View>
                <Text style={[styles.healthStatus, { color: health.color }]}>
                    Status: {health.status.charAt(0).toUpperCase() + health.status.slice(1)}
                </Text>
            </View>

            {/* Key Debt Metrics */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Debt Position Overview</Text>

                <MetricRow
                    label="Total Debt"
                    value={`${currency}${liabilities.toLocaleString()}`}
                    sublabel="All liabilities and obligations"
                />
                <MetricRow
                    label="Debt-to-Assets Ratio"
                    value={`${debtToAssets.toFixed(1)}%`}
                    sublabel="Healthy: <30% | Warning: 30-60% | Risky: >60%"
                    color={debtToAssets < 30 ? Colors.income : debtToAssets < 60 ? Colors.warning : Colors.expense}
                />
                <MetricRow
                    label="Debt-to-Equity Ratio"
                    value={debtToEquity === Infinity ? 'No Equity' : debtToEquity.toFixed(2)}
                    sublabel="Healthy: <0.5 | Moderate: 0.5-1.0 | High: >1.0"
                    color={debtToEquity < 0.5 ? Colors.income : debtToEquity < 1 ? Colors.warning : Colors.expense}
                />
                <MetricRow
                    label="Interest Coverage"
                    value={`${interestCoverage.toFixed(2)}x`}
                    sublabel="Ability to pay interest. Higher is better (>2.5x is strong)"
                    color={interestCoverage > 2.5 ? Colors.income : interestCoverage > 1.5 ? Colors.warning : Colors.expense}
                />
            </View>

            {/* Impact on Business Performance */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>📊 Impact on Business Performance</Text>
                {impacts.map((impact, i) => (
                    <View key={i} style={styles.impactItem}>
                        <Text style={styles.impactText}>{impact}</Text>
                    </View>
                ))}
            </View>

            {/* Poor Debt Management Warning */}
            {health.score < 50 && (
                <View style={[styles.warningCard, { backgroundColor: Colors.expense + '15' }]}>
                    <Text style={[styles.warningTitle, { color: Colors.expense }]}>⚠️ Poor Debt Management Risks</Text>
                    <Text style={styles.warningText}>
                        • Difficulty obtaining future financing{'\n'}
                        • Reduced cash flow available for operations{'\n'}
                        • Higher stress on business relationships{'\n'}
                        • Limited ability to invest in growth{'\n'}
                        • Risk of financial distress
                    </Text>
                </View>
            )}

            {/* Debt Management Strategies */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>💡 Debt Management Strategies</Text>
                {recommendations.map((rec, i) => (
                    <View key={i} style={styles.strategyItem}>
                        <Text style={styles.strategyText}>• {rec}</Text>
                    </View>
                ))}
            </View>

            {/* Action Plan */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>🎯 Recommended Action Plan</Text>
                <View style={styles.actionPlan}>
                    <ActionStep num={1} title="Track Debt" desc="Monitor all liabilities monthly" />
                    <ActionStep num={2} title="Improve Profitability" desc="Increase margins to generate cash for debt repayment" />
                    <ActionStep num={3} title="Create Repayment Plan" desc="Prioritize high-interest debt first" />
                    <ActionStep num={4} title="Reduce Leverage" desc="Lower debt-to-equity ratio gradually" />
                    <ActionStep num={5} title="Review & Adjust" desc="Quarterly review of debt metrics and progress" />
                </View>
            </View>

            {/* Borrowing Cost vs Return calculator — turns the Key Principle
                below from an abstract rule into a number you can check
                before actually taking a loan. */}
            <LoanROICalculator currency={currency} />

            {/* Educational Tips */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>📚 Understanding Debt Management</Text>
                <Text style={styles.educationalText}>
                    <Text style={{ fontWeight: 'bold' }}>Good Debt:</Text> Investment in growth, equipment, or assets that generate revenue {'\n\n'}
                    <Text style={{ fontWeight: 'bold' }}>Bad Debt:</Text> Borrowing for operating expenses or consumption {'\n\n'}
                    <Text style={{ fontWeight: 'bold' }}>Key Principle:</Text> Only borrow if the return on investment exceeds the cost of borrowing
                </Text>
            </View>
        </View>
    );
}

function MetricRow({
    label,
    value,
    sublabel,
    color = Colors.textPrimary,
}: {
    label: string;
    value: string;
    sublabel: string;
    color?: string;
}) {
    return (
        <View style={styles.metricRow}>
            <View style={{ flex: 1 }}>
                <Text style={styles.metricLabel}>{label}</Text>
                <Text style={styles.metricSub}>{sublabel}</Text>
            </View>
            <Text style={[styles.metricValue, { color }]}>{value}</Text>
        </View>
    );
}

function ActionStep({ num, title, desc }: { num: number; title: string; desc: string }) {
    return (
        <View style={styles.step}>
            <View style={[styles.stepNum, { backgroundColor: Colors.primary }]}>
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
    card: {
        backgroundColor: Colors.surface,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
    },
    cardTitle: {
        fontSize: 15,
        fontWeight: 'bold',
        color: Colors.textPrimary,
        marginBottom: 12,
    },

    healthCard: {
        backgroundColor: Colors.surface,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 2,
    },
    healthHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    healthLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.textSecondary,
    },
    healthScore: {
        fontSize: 24,
        fontWeight: 'bold',
    },
    healthBar: {
        height: 8,
        borderRadius: 4,
        marginBottom: 8,
        overflow: 'hidden',
    },
    healthBarFill: {
        height: '100%',
        borderRadius: 4,
    },
    healthStatus: {
        fontSize: 13,
        fontWeight: '600',
    },

    metricRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    metricLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: Colors.textPrimary,
        marginBottom: 4,
    },
    metricSub: {
        fontSize: 11,
        color: Colors.textMuted,
    },
    metricValue: {
        fontSize: 14,
        fontWeight: 'bold',
    },

    impactItem: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        marginBottom: 8,
        backgroundColor: Colors.bg,
        borderRadius: 8,
    },
    impactText: {
        fontSize: 12,
        color: Colors.textSecondary,
        lineHeight: 18,
    },

    warningCard: {
        borderRadius: 12,
        padding: 14,
        marginBottom: 12,
        borderLeftWidth: 4,
        borderLeftColor: Colors.expense,
    },
    warningTitle: {
        fontSize: 13,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    warningText: {
        fontSize: 12,
        color: Colors.textSecondary,
        lineHeight: 18,
    },

    strategyItem: {
        paddingVertical: 8,
    },
    strategyText: {
        fontSize: 12,
        color: Colors.textSecondary,
        lineHeight: 18,
    },

    actionPlan: {
        gap: 10,
    },
    step: {
        flexDirection: 'row',
        gap: 12,
        paddingVertical: 10,
    },
    stepNum: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    stepNumText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14,
    },
    stepTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: Colors.textPrimary,
        marginBottom: 2,
    },
    stepDesc: {
        fontSize: 11,
        color: Colors.textMuted,
    },

    educationalText: {
        fontSize: 12,
        color: Colors.textSecondary,
        lineHeight: 20,
    },
});
