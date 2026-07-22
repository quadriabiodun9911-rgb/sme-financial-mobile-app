import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { FinanceData, Loan, Transaction } from '../types';
import { computeLeverageRatios, scoreDebtToAssets, scoreDebtToEquity } from '../utils/debtRatios';
import { computeCashRunway } from '../utils/cashRunway';
import LoanROICalculator from './LoanROICalculator';
import BuyVsFinanceCalculator from './BuyVsFinanceCalculator';
import GrowthAffordabilityCalculator from './GrowthAffordabilityCalculator';

interface Props {
    finance: FinanceData;
    currency: string;
    loans?: Loan[];
    transactions?: Transaction[];
}

const RATIO_COLOR = { strong: Colors.income, stable: Colors.warning, concerning: Colors.expense };

export default function EnhancedDebtManagement({ finance, currency, loans = [], transactions = [] }: Props) {
    // Same trailing-30-day paid-expense burn rate CashFlowScreen's Runway
    // tab and the Weekly Dashboard use — one canonical "how much do we
    // spend a month" source, not a separate estimate invented here.
    const { dailyBurn } = computeCashRunway(transactions, finance.cashBalance);
    const monthlyBurn = dailyBurn * 30;

    // Leverage ratios (and the live loan balance they're built on) are
    // computed once, in debtRatios.ts, and shared with DebtAnalysis — both
    // cards render on the same Reports > Loans & Debt tab, so a ratio here
    // and there must always agree.
    const { liabilities, equity, debtToAssets, debtToEquity, profit } = computeLeverageRatios(finance, loans);
    const income = finance.income;

    const interestCoverage = profit > 0 ? profit / Math.max(1, liabilities * 0.05) : 0; // Assume 5% interest rate
    const debtServiceCapacity = income > 0 ? (profit / income) * 100 : 0;

    const debtToAssetsScore = scoreDebtToAssets(debtToAssets);
    const debtToEquityScore = scoreDebtToEquity(debtToEquity);

    // Debt health score — a composite of the SAME three tiers DebtAnalysis
    // uses for debt-to-assets/debt-to-equity (so a ratio scored "concerning"
    // there always costs this score the same deduction here), plus interest
    // coverage, which is unique to this composite.
    const getDebtHealthScore = (): { score: number; status: 'healthy' | 'moderate' | 'concerning'; color: string } => {
        let score = 100;

        score -= debtToAssetsScore === 'concerning' ? 30 : debtToAssetsScore === 'stable' ? 15 : 0;
        score -= debtToEquityScore === 'concerning' ? 25 : debtToEquityScore === 'stable' ? 10 : 0;

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

        if (debtToAssetsScore === 'concerning') {
            recs.push('High debt burden: Prioritize debt repayment or increase asset productivity');
        }

        if (debtToEquityScore === 'concerning') {
            recs.push('Leverage is high: Consider equity financing instead of debt for growth');
        }

        if (profit < liabilities * 0.1) {
            recs.push('Low profitability relative to debt: Focus on margin improvement');
        }

        if (liabilities > 0 && income === 0) {
            recs.push('No recorded income: Start generating revenue to service debt');
        }

        if (debtToAssetsScore === 'strong' && equity > 0) {
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
                    sublabel="Healthy: <30% | Warning: 30-50% | Risky: >50%"
                    color={RATIO_COLOR[debtToAssetsScore]}
                />
                <MetricRow
                    label="Debt-to-Equity Ratio"
                    value={debtToEquity === Infinity ? 'No Equity' : debtToEquity.toFixed(2)}
                    sublabel="Healthy: <0.5 | Moderate: 0.5-1.0 | High: >1.0"
                    color={RATIO_COLOR[debtToEquityScore]}
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

            {/* A different question: not "is this loan worth it" but "what
                does paying cash vs financing do to my runway either way" —
                the liquidity-preservation trade-off, not just cost vs return. */}
            <BuyVsFinanceCalculator currency={currency} currentCashBalance={finance.cashBalance} monthlyBurn={monthlyBurn} />
            <GrowthAffordabilityCalculator currency={currency} currentCashBalance={finance.cashBalance} monthlyBurn={monthlyBurn} />

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
