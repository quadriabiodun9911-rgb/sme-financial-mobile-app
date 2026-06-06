import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput, Modal } from 'react-native';

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

const CashFlowManagement: React.FC<Props> = ({ finance, currency, minReserve, targetMargin }) => {
    const [showForecastModal, setShowForecastModal] = useState(false);
    const [upcomingRevenue, setUpcomingRevenue] = useState<number>(0);
    const [upcomingExpenses, setUpcomingExpenses] = useState<number>(0);
    const [forecastResult, setForecastResult] = useState<number | null>(null);

    const calculateForecast = () => {
        const result = upcomingRevenue - upcomingExpenses;
        setForecastResult(result);
    };

    const monthlyCashFlow = finance.income - finance.expense;
    const monthlyReserve = parseFloat(minReserve) || 1000;

    // Calculate additional metrics
    const cashRunway = monthlyCashFlow > 0 ? '∞' : Math.floor(monthlyReserve / Math.abs(monthlyCashFlow)) + ' months';
    const liquidityRatio = finance.expense > 0 ? (finance.income / finance.expense).toFixed(2) : '0.00';
    const burnRate = monthlyCashFlow < 0 ? Math.abs(monthlyCashFlow) : 0;

    // Mock data for cash flow forecast (similar to other components)
    const cashFlowForecast = [
        { month: 'Jan', inflow: finance.income * 1.1, outflow: finance.expense * 1.05 },
        { month: 'Feb', inflow: finance.income * 1.15, outflow: finance.expense * 1.08 },
        { month: 'Mar', inflow: finance.income * 1.05, outflow: finance.expense * 1.03 },
        { month: 'Apr', inflow: finance.income * 1.2, outflow: finance.expense * 1.12 },
        { month: 'May', inflow: finance.income * 1.18, outflow: finance.expense * 1.1 },
        { month: 'Jun', inflow: finance.income * 1.12, outflow: finance.expense * 1.07 },
    ];

    // Cash flow optimization strategies
    const optimizationStrategies = [
        { title: 'Invoice Promptly', description: 'Send invoices immediately after delivery', impact: 'High' },
        { title: 'Follow Up', description: 'Chase overdue payments systematically', impact: 'High' },
        { title: 'Negotiate Terms', description: 'Extend payment terms with suppliers', impact: 'Medium' },
        { title: 'Discount Incentives', description: 'Offer early payment discounts', impact: 'Medium' },
        { title: 'Monitor Expenses', description: 'Track and reduce unnecessary expenses', impact: 'High' },
    ];

    return (
        <View style={styles.container}>
            {/* CASH FLOW DASHBOARD */}
            <View style={styles.card}>
                <Text style={styles.title}>💰 CASH FLOW DASHBOARD</Text>

                <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>Monthly Income</Text>
                    <Text style={styles.positiveText}>{currency}{finance.income.toLocaleString()}</Text>
                </View>

                <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>Monthly Expenses</Text>
                    <Text style={styles.negativeText}>{currency}{finance.expense.toLocaleString()}</Text>
                </View>

                <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>Monthly Cash Flow</Text>
                    <Text style={monthlyCashFlow >= 0 ? styles.positiveText : styles.negativeText}>
                        {monthlyCashFlow >= 0 ? '+' : ''}{currency}{monthlyCashFlow.toLocaleString()}
                    </Text>
                </View>

                <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>Cash Reserve</Text>
                    <Text style={styles.normalText}>{currency}{monthlyReserve.toLocaleString()}</Text>
                </View>

                <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>Liquidity Ratio</Text>
                    <Text style={styles.normalText}>{liquidityRatio}:1</Text>
                </View>

                <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>Cash Runway</Text>
                    <Text style={styles.normalText}>{cashRunway}</Text>
                </View>

                {burnRate > 0 && (
                    <View style={styles.metricRow}>
                        <Text style={styles.metricLabel}>Burn Rate</Text>
                        <Text style={styles.negativeText}>{currency}{burnRate.toLocaleString()}/mo</Text>
                    </View>
                )}
            </View>

            {/* CASH FLOW FORECAST */}
            <View style={styles.card}>
                <Text style={styles.title}>🔮 6-MONTH CASH FLOW FORECAST</Text>

                <View style={styles.forecastHeader}>
                    <Text style={styles.forecastLabel}>Month</Text>
                    <Text style={styles.forecastLabel}>Inflow</Text>
                    <Text style={styles.forecastLabel}>Outflow</Text>
                    <Text style={styles.forecastLabel}>Net</Text>
                </View>

                {cashFlowForecast.map((month, index) => (
                    <View key={index} style={styles.forecastRow}>
                        <Text style={styles.forecastCell}>{month.month}</Text>
                        <Text style={styles.positiveText}>{currency}{month.inflow.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                        <Text style={styles.negativeText}>{currency}{month.outflow.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                        <Text style={(month.inflow - month.outflow) >= 0 ? styles.positiveText : styles.negativeText}>
                            {(month.inflow - month.outflow) >= 0 ? '+' : ''}{currency}{(month.inflow - month.outflow).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </Text>
                    </View>
                ))}

                <TouchableOpacity style={styles.actionButton} onPress={() => setShowForecastModal(true)}>
                    <Text style={styles.actionButtonText}>Custom Forecast Calculation</Text>
                </TouchableOpacity>
            </View>

            {/* OPTIMIZATION STRATEGIES */}
            <View style={styles.card}>
                <Text style={styles.title}>💡 CASH FLOW OPTIMIZATION</Text>

                {optimizationStrategies.map((strategy, index) => (
                    <View key={index} style={styles.strategyRow}>
                        <View style={styles.strategyInfo}>
                            <Text style={styles.strategyTitle}>{strategy.title}</Text>
                            <Text style={styles.strategyDesc}>{strategy.description}</Text>
                        </View>
                        <View style={[
                            styles.impactBadge,
                            strategy.impact === 'High' ? styles.highImpact : styles.mediumImpact
                        ]}>
                            <Text style={[
                                styles.impactText,
                                strategy.impact === 'High' ? styles.highImpactText : styles.mediumImpactText
                            ]}>
                                {strategy.impact}
                            </Text>
                        </View>
                    </View>
                ))}
            </View>

            {/* CASH CONVERSION CYCLE */}
            <View style={styles.card}>
                <Text style={styles.title}>🔄 CASH CONVERSION CYCLE</Text>

                <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>Inventory Days</Text>
                    <Text style={styles.normalText}>30 days</Text>
                </View>

                <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>Receivables Days</Text>
                    <Text style={styles.normalText}>45 days</Text>
                </View>

                <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>Payables Days</Text>
                    <Text style={styles.normalText}>60 days</Text>
                </View>

                <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>Cash Conversion</Text>
                    <Text style={styles.normalText}>15 days</Text>
                </View>
            </View>

            {/* Forecast Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={showForecastModal}
                onRequestClose={() => setShowForecastModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Cash Flow Forecast Calculator</Text>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Upcoming Revenue ({currency})</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="0.00"
                                placeholderTextColor="#64748b"
                                value={upcomingRevenue.toString()}
                                onChangeText={text => setUpcomingRevenue(parseFloat(text) || 0)}
                                keyboardType="numeric"
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Upcoming Expenses ({currency})</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="0.00"
                                placeholderTextColor="#64748b"
                                value={upcomingExpenses.toString()}
                                onChangeText={text => setUpcomingExpenses(parseFloat(text) || 0)}
                                keyboardType="numeric"
                            />
                        </View>

                        <TouchableOpacity style={styles.calculateButton} onPress={calculateForecast}>
                            <Text style={styles.buttonText}>Calculate</Text>
                        </TouchableOpacity>

                        {forecastResult !== null && (
                            <View style={styles.forecastResult}>
                                <Text style={styles.forecastText}>
                                    Projected Cash Flow: {forecastResult >= 0 ? '+' : ''}{currency}{forecastResult.toLocaleString()}
                                </Text>
                            </View>
                        )}

                        <TouchableOpacity
                            style={[styles.actionButton, { backgroundColor: '#475569' }]}
                            onPress={() => setShowForecastModal(false)}
                        >
                            <Text style={styles.actionButtonText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
        backgroundColor: '#0f172a',
    },
    card: {
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
    title: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#f8fafc',
        marginBottom: 12,
    },
    metricRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
    },
    metricLabel: {
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
        color: '#f8fafc',
        fontWeight: '600',
    },
    description: {
        fontSize: 12,
        color: '#94a3b8',
        marginBottom: 12,
        lineHeight: 16,
    },
    actionButton: {
        backgroundColor: '#3b82f6',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 12,
    },
    actionButtonText: {
        color: '#f8fafc',
        fontWeight: 'bold',
        fontSize: 14,
    },
    tipText: {
        fontSize: 12,
        color: '#cbd5e1',
        lineHeight: 18,
        marginBottom: 8,
    },
    buttonText: {
        color: '#f8fafc',
        fontWeight: 'bold',
        fontSize: 14,
    },

    // Forecast table styles
    forecastHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        backgroundColor: '#0f172a',
        paddingVertical: 8,
        marginBottom: 8,
        borderRadius: 6,
    },
    forecastLabel: {
        flex: 1,
        color: '#f8fafc',
        fontSize: 11,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    forecastRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
    },
    forecastCell: {
        flex: 1,
        color: '#cbd5e1',
        fontSize: 11,
        textAlign: 'center',
    },

    // Strategy styles
    strategyRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
    },
    strategyInfo: {
        flex: 1,
    },
    strategyTitle: {
        fontSize: 14,
        color: '#f8fafc',
        fontWeight: '500',
    },
    strategyDesc: {
        fontSize: 12,
        color: '#94a3b8',
    },
    impactBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    impactText: {
        fontSize: 11,
        fontWeight: 'bold',
    },
    highImpact: {
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
    },
    mediumImpact: {
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
    },
    highImpactText: {
        color: '#10b981',
    },
    mediumImpactText: {
        color: '#f59e0b',
    },

    // Modal styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        backgroundColor: '#1e293b',
        borderRadius: 12,
        padding: 24,
        width: '90%',
        maxWidth: 500,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#f8fafc',
        marginBottom: 16,
        textAlign: 'center'
    },
    inputGroup: {
        marginBottom: 16
    },
    label: {
        fontSize: 14,
        color: '#cbd5e1',
        marginBottom: 8,
        fontWeight: '500'
    },
    input: {
        backgroundColor: '#334155',
        borderColor: '#475569',
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: '#f8fafc',
        fontSize: 16
    },
    calculateButton: {
        backgroundColor: '#10b981',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 8,
        alignItems: 'center',
        marginBottom: 12
    },
    forecastResult: {
        marginTop: 12,
        padding: 12,
        backgroundColor: '#334155',
        borderRadius: 8,
        alignItems: 'center',
        marginBottom: 16
    },
    forecastText: {
        color: '#f8fafc',
        fontSize: 14,
        fontWeight: 'bold'
    }
});

export default CashFlowManagement;