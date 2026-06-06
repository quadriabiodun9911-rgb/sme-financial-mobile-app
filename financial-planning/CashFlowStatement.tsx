import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Switch } from 'react-native';

interface FinanceData {
    income: number;
    expense: number;
    profit: number;
    margin: number;
    assets: number;
    liabilities: number;
    equity: number;
}

interface Transaction {
    id: string;
    date: string;
    description: string;
    type: 'income' | 'expense';
    category: string;
    amount: number;
    transactionCategory?: 'purchase' | 'sale' | 'expense' | 'cost' | 'other';
    reference?: string;
    vendorCustomer?: string;
}

interface Props {
    transactions: Transaction[];
    finance: FinanceData;
    currency: string;
    minReserve: string;
    targetMargin: string;
}

const CashFlowStatement: React.FC<Props> = ({ transactions, finance, currency, minReserve, targetMargin }) => {
    const [showDetails, setShowDetails] = useState(true);

    // More realistic sample data for cash flow statement based on actual financial data
    const operatingActivities = {
        netIncome: finance.profit,
        depreciation: finance.assets * 0.02, // Depreciation as 2% of assets
        accountsReceivableChange: -Math.abs(finance.income * 0.05), // Change in receivables
        accountsPayableChange: Math.abs(finance.expense * 0.03), // Change in payables
        inventoryChange: -Math.abs(finance.expense * 0.02), // Change in inventory
        otherOperatingItems: 50, // Other adjustments
        operatingCashFlow: finance.profit + (finance.assets * 0.02) + (-Math.abs(finance.income * 0.05)) + (Math.abs(finance.expense * 0.03)) + (-Math.abs(finance.expense * 0.02)) + 50
    };

    const investingActivities = {
        purchaseOfPPE: -Math.abs(finance.assets * 0.05), // Purchase of property, plant, equipment
        proceedsFromSaleOfPPE: Math.abs(finance.assets * 0.01), // Sale of property, plant, equipment
        investmentsInSecurities: -Math.abs(finance.assets * 0.02), // Investments in securities
        proceedsFromSaleOfSecurities: Math.abs(finance.assets * 0.005), // Sale of securities
        otherInvestingItems: -100, // Other investing activities
        investingCashFlow: (-Math.abs(finance.assets * 0.05)) + (Math.abs(finance.assets * 0.01)) + (-Math.abs(finance.assets * 0.02)) + (Math.abs(finance.assets * 0.005)) + (-100)
    };

    const financingActivities = {
        proceedsFromShortTermDebt: Math.abs(finance.liabilities * 0.05), // New short-term debt
        repaymentOfShortTermDebt: -Math.abs(finance.liabilities * 0.03), // Repayment of short-term debt
        proceedsFromLongTermDebt: Math.abs(finance.liabilities * 0.08), // New long-term debt
        repaymentOfLongTermDebt: -Math.abs(finance.liabilities * 0.04), // Repayment of long-term debt
        dividendsPaid: -Math.abs(finance.profit * 0.1), // Dividends paid to shareholders
        ownerContributions: 0, // Owner contributions
        ownerWithdrawals: -Math.abs(finance.profit * 0.05), // Owner withdrawals
        otherFinancingItems: -50, // Other financing activities
        financingCashFlow: (Math.abs(finance.liabilities * 0.05)) + (-Math.abs(finance.liabilities * 0.03)) + (Math.abs(finance.liabilities * 0.08)) + (-Math.abs(finance.liabilities * 0.04)) + (-Math.abs(finance.profit * 0.1)) + 0 + (-Math.abs(finance.profit * 0.05)) + (-50)
    };

    const netCashFlow = operatingActivities.operatingCashFlow +
        investingActivities.investingCashFlow +
        financingActivities.financingCashFlow;

    const beginningCash = parseFloat(minReserve) || Math.abs(finance.profit * 0.5); // Use minReserve or 50% of profit as beginning cash
    const endingCash = beginningCash + netCashFlow;

    // Calculate key cash flow metrics
    const freeCashFlow = operatingActivities.operatingCashFlow - Math.abs(investingActivities.purchaseOfPPE);
    const cashFlowMargin = finance.income > 0 ? (operatingActivities.operatingCashFlow / finance.income) * 100 : 0;
    const cashFlowToDebt = finance.liabilities > 0 ? operatingActivities.operatingCashFlow / finance.liabilities : 0;

    return (
        <ScrollView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>💵 CASH FLOW STATEMENT</Text>
                <Text style={styles.subtitle}>Tracking the inflow and outflow of cash during the reporting period</Text>

                <View style={styles.toggleContainer}>
                    <Text style={styles.toggleLabel}>Show Details</Text>
                    <Switch
                        value={showDetails}
                        onValueChange={setShowDetails}
                        trackColor={{ false: "#767577", true: "#81b0ff" }}
                        thumbColor={showDetails ? "#2563eb" : "#f4f3f4"}
                    />
                </View>
            </View>

            {/* OPERATING ACTIVITIES */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>📊 OPERATING ACTIVITIES</Text>
                <Text style={styles.sectionSubtitle}>Cash flows from core business operations</Text>

                <View style={styles.itemRow}>
                    <Text style={styles.label}>Net Income</Text>
                    <Text style={finance.profit >= 0 ? styles.positiveText : styles.negativeText}>
                        {finance.profit >= 0 ? '+' : ''}{currency}{operatingActivities.netIncome.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </Text>
                </View>

                {showDetails && (
                    <>
                        <View style={styles.itemRow}>
                            <Text style={styles.label}>Depreciation & Amortization</Text>
                            <Text style={styles.positiveText}>+{currency}{operatingActivities.depreciation.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                        </View>

                        <View style={styles.itemRow}>
                            <Text style={styles.label}>Change in Accounts Receivable</Text>
                            <Text style={operatingActivities.accountsReceivableChange >= 0 ? styles.positiveText : styles.negativeText}>
                                {operatingActivities.accountsReceivableChange >= 0 ? '+' : ''}{currency}{operatingActivities.accountsReceivableChange.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </Text>
                        </View>

                        <View style={styles.itemRow}>
                            <Text style={styles.label}>Change in Accounts Payable</Text>
                            <Text style={operatingActivities.accountsPayableChange >= 0 ? styles.positiveText : styles.negativeText}>
                                {operatingActivities.accountsPayableChange >= 0 ? '+' : ''}{currency}{operatingActivities.accountsPayableChange.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </Text>
                        </View>

                        <View style={styles.itemRow}>
                            <Text style={styles.label}>Change in Inventory</Text>
                            <Text style={operatingActivities.inventoryChange >= 0 ? styles.positiveText : styles.negativeText}>
                                {operatingActivities.inventoryChange >= 0 ? '+' : ''}{currency}{operatingActivities.inventoryChange.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </Text>
                        </View>

                        <View style={styles.itemRow}>
                            <Text style={styles.label}>Other Operating Adjustments</Text>
                            <Text style={operatingActivities.otherOperatingItems >= 0 ? styles.positiveText : styles.negativeText}>
                                {operatingActivities.otherOperatingItems >= 0 ? '+' : ''}{currency}{operatingActivities.otherOperatingItems.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </Text>
                        </View>
                    </>
                )}

                <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Net Cash from Operations</Text>
                    <Text style={operatingActivities.operatingCashFlow >= 0 ? styles.positiveText : styles.negativeText}>
                        {operatingActivities.operatingCashFlow >= 0 ? '+' : ''}{currency}{operatingActivities.operatingCashFlow.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </Text>
                </View>
            </View>

            {/* INVESTING ACTIVITIES */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>🏢 INVESTING ACTIVITIES</Text>
                <Text style={styles.sectionSubtitle}>Cash flows related to buying or selling of assets</Text>

                {showDetails && (
                    <>
                        <View style={styles.itemRow}>
                            <Text style={styles.label}>Purchase of Property, Plant & Equipment</Text>
                            <Text style={styles.negativeText}>{currency}{investingActivities.purchaseOfPPE.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                        </View>

                        <View style={styles.itemRow}>
                            <Text style={styles.label}>Proceeds from Sale of PPE</Text>
                            <Text style={styles.positiveText}>+{currency}{investingActivities.proceedsFromSaleOfPPE.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                        </View>

                        <View style={styles.itemRow}>
                            <Text style={styles.label}>Investments in Securities</Text>
                            <Text style={styles.negativeText}>{currency}{investingActivities.investmentsInSecurities.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                        </View>

                        <View style={styles.itemRow}>
                            <Text style={styles.label}>Proceeds from Sale of Securities</Text>
                            <Text style={styles.positiveText}>+{currency}{investingActivities.proceedsFromSaleOfSecurities.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                        </View>

                        <View style={styles.itemRow}>
                            <Text style={styles.label}>Other Investing Activities</Text>
                            <Text style={investingActivities.otherInvestingItems >= 0 ? styles.positiveText : styles.negativeText}>
                                {investingActivities.otherInvestingItems >= 0 ? '+' : ''}{currency}{investingActivities.otherInvestingItems.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </Text>
                        </View>
                    </>
                )}

                <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Net Cash from Investing</Text>
                    <Text style={investingActivities.investingCashFlow >= 0 ? styles.positiveText : styles.negativeText}>
                        {investingActivities.investingCashFlow >= 0 ? '+' : ''}{currency}{investingActivities.investingCashFlow.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </Text>
                </View>
            </View>

            {/* FINANCING ACTIVITIES */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>🏦 FINANCING ACTIVITIES</Text>
                <Text style={styles.sectionSubtitle}>Cash flows associated with changes in capital structure</Text>

                {showDetails && (
                    <>
                        <View style={styles.itemRow}>
                            <Text style={styles.label}>Proceeds from Short-Term Debt</Text>
                            <Text style={styles.positiveText}>+{currency}{financingActivities.proceedsFromShortTermDebt.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                        </View>

                        <View style={styles.itemRow}>
                            <Text style={styles.label}>Repayment of Short-Term Debt</Text>
                            <Text style={styles.negativeText}>{currency}{financingActivities.repaymentOfShortTermDebt.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                        </View>

                        <View style={styles.itemRow}>
                            <Text style={styles.label}>Proceeds from Long-Term Debt</Text>
                            <Text style={styles.positiveText}>+{currency}{financingActivities.proceedsFromLongTermDebt.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                        </View>

                        <View style={styles.itemRow}>
                            <Text style={styles.label}>Repayment of Long-Term Debt</Text>
                            <Text style={styles.negativeText}>{currency}{financingActivities.repaymentOfLongTermDebt.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                        </View>

                        <View style={styles.itemRow}>
                            <Text style={styles.label}>Dividends Paid</Text>
                            <Text style={styles.negativeText}>{currency}{financingActivities.dividendsPaid.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                        </View>

                        <View style={styles.itemRow}>
                            <Text style={styles.label}>Owner Contributions</Text>
                            <Text style={financingActivities.ownerContributions >= 0 ? styles.positiveText : styles.negativeText}>
                                {financingActivities.ownerContributions >= 0 ? '+' : ''}{currency}{financingActivities.ownerContributions.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </Text>
                        </View>

                        <View style={styles.itemRow}>
                            <Text style={styles.label}>Owner Withdrawals</Text>
                            <Text style={styles.negativeText}>{currency}{financingActivities.ownerWithdrawals.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                        </View>

                        <View style={styles.itemRow}>
                            <Text style={styles.label}>Other Financing Activities</Text>
                            <Text style={financingActivities.otherFinancingItems >= 0 ? styles.positiveText : styles.negativeText}>
                                {financingActivities.otherFinancingItems >= 0 ? '+' : ''}{currency}{financingActivities.otherFinancingItems.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </Text>
                        </View>
                    </>
                )}

                <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Net Cash from Financing</Text>
                    <Text style={financingActivities.financingCashFlow >= 0 ? styles.positiveText : styles.negativeText}>
                        {financingActivities.financingCashFlow >= 0 ? '+' : ''}{currency}{financingActivities.financingCashFlow.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </Text>
                </View>
            </View>

            {/* NET CASH FLOW SUMMARY */}
            <View style={styles.summarySection}>
                <Text style={styles.summaryTitle}>📈 CASH FLOW SUMMARY</Text>

                <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Net Cash Flow</Text>
                    <Text style={netCashFlow >= 0 ? styles.positiveText : styles.negativeText}>
                        {netCashFlow >= 0 ? '+' : ''}{currency}{netCashFlow.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </Text>
                </View>

                <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Beginning Cash Balance</Text>
                    <Text style={styles.normalText}>{currency}{beginningCash.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                </View>

                <View style={[styles.summaryRow, styles.totalRow]}>
                    <Text style={styles.totalLabel}>Ending Cash Balance</Text>
                    <Text style={endingCash >= 0 ? styles.positiveText : styles.negativeText}>
                        {endingCash >= 0 ? '+' : ''}{currency}{endingCash.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </Text>
                </View>
            </View>

            {/* KEY CASH FLOW METRICS */}
            <View style={styles.metricsSection}>
                <Text style={styles.metricsTitle}>📊 KEY CASH FLOW METRICS</Text>

                <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>Free Cash Flow</Text>
                    <Text style={freeCashFlow >= 0 ? styles.positiveText : styles.negativeText}>
                        {freeCashFlow >= 0 ? '+' : ''}{currency}{freeCashFlow.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </Text>
                </View>

                <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>Cash Flow Margin</Text>
                    <Text style={cashFlowMargin >= 15 ? styles.positiveText : cashFlowMargin >= 5 ? styles.warningText : styles.negativeText}>
                        {cashFlowMargin.toFixed(2)}%
                    </Text>
                </View>

                <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>Cash Flow to Debt Ratio</Text>
                    <Text style={Math.abs(cashFlowToDebt) >= 0.2 ? styles.positiveText : Math.abs(cashFlowToDebt) >= 0.1 ? styles.warningText : styles.negativeText}>
                        {cashFlowToDebt.toFixed(2)}
                    </Text>
                </View>
            </View>

            {/* CASH FLOW INSIGHTS */}
            <View style={styles.insightsSection}>
                <Text style={styles.insightsTitle}>💡 CASH FLOW INSIGHTS</Text>

                {operatingActivities.operatingCashFlow > 0 ? (
                    <Text style={styles.insightText}>✅ Positive operating cash flow indicates your core business is generating cash.</Text>
                ) : (
                    <Text style={styles.insightText}>⚠️ Negative operating cash flow suggests your core business may be consuming cash.</Text>
                )}

                {freeCashFlow > 0 ? (
                    <Text style={styles.insightText}>✅ Positive free cash flow means you have cash available after capital expenditures.</Text>
                ) : (
                    <Text style={styles.insightText}>⚠️ Negative free cash flow indicates tight cash position after capital expenditures.</Text>
                )}

                {cashFlowMargin >= 15 ? (
                    <Text style={styles.insightText}>📈 Strong cash flow margin ({cashFlowMargin.toFixed(2)}%) indicates efficient conversion of sales to cash.</Text>
                ) : cashFlowMargin >= 5 ? (
                    <Text style={styles.insightText}>📊 Moderate cash flow margin ({cashFlowMargin.toFixed(2)}%) - monitor collection efficiency.</Text>
                ) : (
                    <Text style={styles.insightText}>📉 Low cash flow margin ({cashFlowMargin.toFixed(2)}%) - review accounts receivable and payable management.</Text>
                )}

                <Text style={styles.insightText}>🎯 Recommendation: Maintain positive operating cash flow and sufficient reserves for operational continuity.</Text>
            </View>

            {/* EXPLANATION */}
            <View style={styles.explanationSection}>
                <Text style={styles.explanation}>
                    The cash flow statement provides insight into how your business generates and uses cash.
                    Positive operating cash flow indicates your core business is generating cash, while
                    investing and financing activities show how you're growing and funding your business.
                    The cash flow statement complements your income statement and balance sheet.
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
    toggleContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#1e293b',
        padding: 12,
        borderRadius: 8,
        marginBottom: 12,
    },
    toggleLabel: {
        fontSize: 14,
        color: '#f8fafc',
        fontWeight: '500',
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
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
        marginTop: 8,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#334155',
    },
    label: {
        fontSize: 14,
        color: '#cbd5e1',
        fontWeight: '500',
    },
    totalLabel: {
        fontSize: 14,
        color: '#f8fafc',
        fontWeight: 'bold',
    },
    summaryLabel: {
        fontSize: 14,
        color: '#cbd5e1',
        fontWeight: '500',
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
    summarySection: {
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
    summaryTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#f8fafc',
        marginBottom: 12,
        textAlign: 'center',
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
    },
    metricsSection: {
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
    metricsTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#f8fafc',
        marginBottom: 12,
        textAlign: 'center',
    },
    metricRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
    },
    metricLabel: {
        fontSize: 14,
        color: '#cbd5e1',
        fontWeight: '500',
    },
    insightsSection: {
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
    insightsTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#f8fafc',
        marginBottom: 12,
        textAlign: 'center',
    },
    insightText: {
        fontSize: 12,
        color: '#cbd5e1',
        lineHeight: 18,
        marginBottom: 8,
    },
    explanationSection: {
        backgroundColor: '#0f172a',
        borderRadius: 8,
        padding: 12,
        borderWidth: 1,
        borderColor: '#334155',
    },
    explanation: {
        fontSize: 12,
        color: '#94a3b8',
        lineHeight: 16,
    },
});

export default CashFlowStatement;