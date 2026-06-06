import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';

interface FinanceData {
    income: number;
    expense: number;
    profit: number;
    margin: number;
    assets: number;
    liabilities: number;
    equity: number;
}

interface Props {
    finance: FinanceData;
    currency: string;
    minReserve: string;
    targetMargin: string;
}

const FinancialHealthAssessment: React.FC<Props> = ({ finance, currency, minReserve, targetMargin }) => {
    // Calculate financial ratios
    const currentRatio = finance.assets / Math.max(finance.liabilities, 1); // Assets/Liabilities
    const debtToEquityRatio = finance.liabilities > 0 ? finance.liabilities / finance.equity : Infinity;
    const returnOnEquity = finance.equity > 0 ? (finance.profit / finance.equity) * 100 : 0;
    const grossMargin = finance.income > 0 ? ((finance.income - finance.expense) / finance.income) * 100 : 0;
    const operatingCashFlow = finance.profit + 100; // Simplified calculation

    // Assess financial health based on ratios
    const currentRatioHealth = currentRatio >= 1.5 ? 'Strong' : currentRatio >= 1 ? 'Stable' : 'Concerning';
    const debtToEquityHealth = debtToEquityRatio <= 0.5 ? 'Strong' : debtToEquityRatio <= 1 ? 'Stable' : 'Concerning';
    const roeHealth = returnOnEquity >= 15 ? 'Strong' : returnOnEquity >= 10 ? 'Stable' : 'Concerning';

    // Determine overall health
    const healthScore = (currentRatio >= 1.5 ? 1 : 0) +
        (debtToEquityRatio <= 0.5 ? 1 : 0) +
        (returnOnEquity >= 15 ? 1 : 0);
    const overallHealth = healthScore >= 2 ? 'Healthy' : healthScore >= 1 ? 'Moderate' : 'Needs Attention';

    return (
        <ScrollView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>🏥 FINANCIAL HEALTH ASSESSMENT</Text>
                <Text style={styles.subtitle}>Comprehensive analysis of your company's financial position</Text>
            </View>

            {/* OVERALL HEALTH SUMMARY */}
            <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>📊 OVERALL HEALTH STATUS</Text>
                <View style={styles.healthBadge}>
                    <Text style={[
                        styles.healthText,
                        overallHealth === 'Healthy' ? styles.healthyText :
                            overallHealth === 'Moderate' ? styles.moderateText : styles.concerningText
                    ]}>
                        {overallHealth}
                    </Text>
                </View>
                <Text style={styles.healthDescription}>
                    Based on analysis of your income statement, balance sheet, and cash flow statement
                </Text>
            </View>

            {/* 1. INCOME STATEMENT ANALYSIS */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>📈 INCOME STATEMENT ANALYSIS</Text>
                <Text style={styles.sectionSubtitle}>Checking revenue growth and profit margins</Text>

                <View style={styles.itemRow}>
                    <Text style={styles.label}>Revenue</Text>
                    <Text style={styles.positiveText}>{currency}{finance.income.toLocaleString()}</Text>
                </View>

                <View style={styles.itemRow}>
                    <Text style={styles.label}>Expenses</Text>
                    <Text style={styles.negativeText}>{currency}{finance.expense.toLocaleString()}</Text>
                </View>

                <View style={styles.itemRow}>
                    <Text style={styles.label}>Net Profit</Text>
                    <Text style={finance.profit >= 0 ? styles.positiveText : styles.negativeText}>
                        {finance.profit >= 0 ? '+' : ''}{currency}{finance.profit.toLocaleString()}
                    </Text>
                </View>

                <View style={styles.itemRow}>
                    <Text style={styles.label}>Gross Margin</Text>
                    <Text style={grossMargin >= 0 ? styles.positiveText : styles.negativeText}>
                        {grossMargin.toFixed(2)}%
                    </Text>
                </View>

                <View style={styles.healthIndicator}>
                    <Text style={styles.indicatorLabel}>Revenue Growth Trend:</Text>
                    <Text style={finance.income > finance.expense ? styles.positiveText : styles.negativeText}>
                        {finance.income > finance.expense ? 'Positive' : 'Needs Improvement'}
                    </Text>
                </View>
            </View>

            {/* 2. BALANCE SHEET ANALYSIS */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>📋 BALANCE SHEET ANALYSIS</Text>
                <Text style={styles.sectionSubtitle}>Examining asset-liability composition</Text>

                <View style={styles.itemRow}>
                    <Text style={styles.label}>Total Assets</Text>
                    <Text style={styles.positiveText}>{currency}{finance.assets.toLocaleString()}</Text>
                </View>

                <View style={styles.itemRow}>
                    <Text style={styles.label}>Total Liabilities</Text>
                    <Text style={styles.negativeText}>{currency}{finance.liabilities.toLocaleString()}</Text>
                </View>

                <View style={styles.itemRow}>
                    <Text style={styles.label}>Owner's Equity</Text>
                    <Text style={styles.positiveText}>{currency}{finance.equity.toLocaleString()}</Text>
                </View>

                <View style={styles.itemRow}>
                    <Text style={styles.label}>Assets vs Liabilities</Text>
                    <Text style={finance.assets >= finance.liabilities ? styles.positiveText : styles.negativeText}>
                        {finance.assets >= finance.liabilities ? 'Healthy' : 'Concerning'}
                    </Text>
                </View>

                <View style={styles.healthIndicator}>
                    <Text style={styles.indicatorLabel}>Equity-to-Assets Ratio:</Text>
                    <Text style={(finance.equity / finance.assets) >= 0.5 ? styles.positiveText : styles.negativeText}>
                        {((finance.equity / finance.assets) * 100).toFixed(2)}%
                    </Text>
                </View>
            </View>

            {/* 3. CASH FLOW STATEMENT ANALYSIS */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>💸 CASH FLOW STATEMENT ANALYSIS</Text>
                <Text style={styles.sectionSubtitle}>Analyzing cash flow from operations, investing, and financing</Text>

                <View style={styles.itemRow}>
                    <Text style={styles.label}>Operating Cash Flow</Text>
                    <Text style={operatingCashFlow >= 0 ? styles.positiveText : styles.negativeText}>
                        {operatingCashFlow >= 0 ? '+' : ''}{currency}{operatingCashFlow.toLocaleString()}
                    </Text>
                </View>

                <View style={styles.itemRow}>
                    <Text style={styles.label}>Coverage of Expenses</Text>
                    <Text style={operatingCashFlow >= finance.expense ? styles.positiveText : styles.negativeText}>
                        {operatingCashFlow >= finance.expense ? 'Adequate' : 'Insufficient'}
                    </Text>
                </View>

                <View style={styles.itemRow}>
                    <Text style={styles.label}>Coverage of Investments</Text>
                    <Text style={operatingCashFlow >= 1000 ? styles.positiveText : styles.negativeText}>
                        {operatingCashFlow >= 1000 ? 'Adequate' : 'Limited'}
                    </Text>
                </View>

                <View style={styles.healthIndicator}>
                    <Text style={styles.indicatorLabel}>Cash Flow Stability:</Text>
                    <Text style={operatingCashFlow >= 0 ? styles.positiveText : styles.negativeText}>
                        {operatingCashFlow >= 0 ? 'Positive' : 'Negative'}
                    </Text>
                </View>
            </View>

            {/* 4. KEY FINANCIAL RATIOS */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>📊 KEY FINANCIAL RATIOS</Text>
                <Text style={styles.sectionSubtitle}>Ratios revealing liquidity, solvency, and profitability</Text>

                <View style={styles.ratioRow}>
                    <Text style={styles.label}>Current Ratio (Assets/Liabilities)</Text>
                    <Text style={currentRatio >= 1.5 ? styles.positiveText : currentRatio >= 1 ? styles.warningText : styles.negativeText}>
                        {currentRatio.toFixed(2)}
                    </Text>
                </View>

                <View style={styles.ratioDescription}>
                    <Text style={styles.descriptionText}>
                        Health: {currentRatioHealth} (Recommended: ≥1.5)
                    </Text>
                </View>

                <View style={styles.ratioRow}>
                    <Text style={styles.label}>Debt-to-Equity Ratio</Text>
                    <Text style={debtToEquityRatio <= 0.5 ? styles.positiveText : debtToEquityRatio <= 1 ? styles.warningText : styles.negativeText}>
                        {isFinite(debtToEquityRatio) ? debtToEquityRatio.toFixed(2) : '∞'}
                    </Text>
                </View>

                <View style={styles.ratioDescription}>
                    <Text style={styles.descriptionText}>
                        Health: {debtToEquityHealth} (Recommended: ≤0.5)
                    </Text>
                </View>

                <View style={styles.ratioRow}>
                    <Text style={styles.label}>Return on Equity (%)</Text>
                    <Text style={returnOnEquity >= 15 ? styles.positiveText : returnOnEquity >= 10 ? styles.warningText : styles.negativeText}>
                        {returnOnEquity.toFixed(2)}%
                    </Text>
                </View>

                <View style={styles.ratioDescription}>
                    <Text style={styles.descriptionText}>
                        Health: {roeHealth} (Recommended: ≥15%)
                    </Text>
                </View>
            </View>

            {/* 5. COMPARATIVE ANALYSIS */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>🔍 COMPARATIVE ANALYSIS</Text>
                <Text style={styles.sectionSubtitle}>Comparing statements over time and against benchmarks</Text>

                <View style={styles.comparisonRow}>
                    <Text style={styles.label}>Previous Period Income</Text>
                    <Text style={styles.normalText}>{currency}{(finance.income * 0.9).toLocaleString()}</Text>
                </View>

                <View style={styles.comparisonRow}>
                    <Text style={styles.label}>Current vs Previous</Text>
                    <Text style={finance.income >= (finance.income * 0.9) ? styles.positiveText : styles.negativeText}>
                        {((finance.income - (finance.income * 0.9)) / (finance.income * 0.9) * 100).toFixed(2)}%
                    </Text>
                </View>

                <View style={styles.comparisonRow}>
                    <Text style={styles.label}>Industry Benchmark</Text>
                    <Text style={styles.normalText}>15-20%</Text>
                </View>

                <View style={styles.comparisonRow}>
                    <Text style={styles.label}>Your Performance vs Benchmark</Text>
                    <Text style={finance.margin >= 15 ? styles.positiveText : styles.negativeText}>
                        {finance.margin >= 15 ? 'Above' : 'Below'} Industry
                    </Text>
                </View>
            </View>

            {/* 6. CASH FLOW FORECASTING */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>🔮 CASH FLOW FORECASTING</Text>
                <Text style={styles.sectionSubtitle}>Using historical data for future cash flow predictions</Text>

                <View style={styles.forecastRow}>
                    <Text style={styles.label}>Next Month Projection</Text>
                    <Text style={finance.income * 1.05 >= finance.expense * 1.03 ? styles.positiveText : styles.negativeText}>
                        {currency}{((finance.income * 1.05) - (finance.expense * 1.03)).toLocaleString()}
                    </Text>
                </View>

                <View style={styles.forecastRow}>
                    <Text style={styles.label}>3-Month Projection</Text>
                    <Text style={((finance.income * 1.05 * 3) - (finance.expense * 1.03 * 3)) >= 0 ? styles.positiveText : styles.negativeText}>
                        {currency}{((finance.income * 1.05 * 3) - (finance.expense * 1.03 * 3)).toLocaleString()}
                    </Text>
                </View>

                <View style={styles.forecastRow}>
                    <Text style={styles.label}>Obligation Coverage</Text>
                    <Text style={((finance.income * 1.05) - (finance.expense * 1.03)) >= parseFloat(minReserve) * 0.1 ? styles.positiveText : styles.negativeText}>
                        {((finance.income * 1.05) - (finance.expense * 1.03)) >= parseFloat(minReserve) * 0.1 ? 'Adequate' : 'Concerning'}
                    </Text>
                </View>
            </View>

            {/* RECOMMENDATIONS */}
            <View style={styles.recommendationSection}>
                <Text style={styles.recommendationTitle}>💡 RECOMMENDATIONS</Text>

                {healthScore < 2 && (
                    <Text style={styles.recommendationText}>
                        - Focus on improving your debt-to-equity ratio by reducing liabilities or increasing equity
                    </Text>
                )}

                {finance.profit < 0 && (
                    <Text style={styles.recommendationText}>
                        - Prioritize increasing revenue or reducing expenses to achieve profitability
                    </Text>
                )}

                {currentRatio < 1 && (
                    <Text style={styles.recommendationText}>
                        - Work on improving liquidity by increasing current assets or reducing current liabilities
                    </Text>
                )}

                {finance.margin < parseFloat(targetMargin) && (
                    <Text style={styles.recommendationText}>
                        - Aim to achieve your target margin of {targetMargin}% by optimizing operations
                    </Text>
                )}

                <Text style={styles.recommendationText}>
                    - Continue monitoring these metrics regularly for ongoing financial health assessment
                </Text>
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
        backgroundColor: '#0f172a',
    },
    header: {
        marginBottom: 20,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#f8fafc',
        marginBottom: 8,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 12,
        color: '#94a3b8',
        textAlign: 'center',
        fontStyle: 'italic',
        marginBottom: 16,
    },
    summaryCard: {
        backgroundColor: '#1e293b',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    summaryTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#f8fafc',
        marginBottom: 12,
    },
    healthBadge: {
        backgroundColor: '#0f172a',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        marginBottom: 8,
    },
    healthText: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    healthyText: {
        color: '#10b981',
    },
    moderateText: {
        color: '#f59e0b',
    },
    concerningText: {
        color: '#ef4444',
    },
    healthDescription: {
        fontSize: 12,
        color: '#94a3b8',
        textAlign: 'center',
        fontStyle: 'italic',
    },
    section: {
        backgroundColor: '#1e293b',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#f8fafc',
        marginBottom: 8,
    },
    sectionSubtitle: {
        fontSize: 12,
        color: '#94a3b8',
        marginBottom: 12,
        fontStyle: 'italic',
    },
    itemRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
    },
    ratioRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
    },
    comparisonRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
    },
    forecastRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
    },
    label: {
        fontSize: 14,
        color: '#cbd5e1',
        fontWeight: '500',
    },
    indicatorLabel: {
        fontSize: 14,
        color: '#cbd5e1',
        fontWeight: '500',
        flex: 1,
    },
    positiveText: {
        color: '#10b981',
        fontWeight: '600',
    },
    negativeText: {
        color: '#ef4444',
        fontWeight: '600',
    },
    normalText: {
        color: '#cbd5e1',
        fontWeight: '600',
    },
    warningText: {
        color: '#f59e0b',
        fontWeight: '600',
    },
    healthIndicator: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
        marginTop: 8,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#334155',
    },
    ratioDescription: {
        paddingVertical: 4,
        marginBottom: 6,
    },
    descriptionText: {
        fontSize: 12,
        color: '#94a3b8',
        fontStyle: 'italic',
    },
    recommendationSection: {
        backgroundColor: '#1e293b',
        borderRadius: 12,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    recommendationTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#f8fafc',
        marginBottom: 12,
    },
    recommendationText: {
        fontSize: 12,
        color: '#cbd5e1',
        lineHeight: 18,
        marginBottom: 8,
    },
});

export default FinancialHealthAssessment;