import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Switch, Alert } from 'react-native';

interface FinanceData {
    income: number;
    expense: number;
    profit: number;
    margin: number;
    assets: number;
    liabilities: number;
    equity: number;
}

interface DashboardConfig {
    showIncome: boolean;
    showExpenses: boolean;
    showProfit: boolean;
    showCashFlow: boolean;
    showDebtRatio: boolean;
    showCashReserve: boolean;
    showQuickActions: boolean;
}

interface DashboardProps {
    finance: FinanceData;
    currency: string;
    minReserve: string;
    targetMargin: string;
    onConfigChange: (config: DashboardConfig) => void;
}

const Dashboard: React.FC<DashboardProps> = ({
    finance,
    currency,
    minReserve,
    targetMargin,
    onConfigChange
}) => {
    const [config, setConfig] = useState<DashboardConfig>({
        showIncome: true,
        showExpenses: true,
        showProfit: true,
        showCashFlow: true,
        showDebtRatio: true,
        showCashReserve: true,
        showQuickActions: true,
    });

    const [showConfig, setShowConfig] = useState(false);

    // Calculate derived metrics
    const monthlyCashFlow = finance.income - finance.expense;
    const monthlyReserve = parseFloat(minReserve) || 1000;
    const debtToEquityRatio = finance.equity !== 0 ? (finance.liabilities / finance.equity) : 0;

    useEffect(() => {
        onConfigChange(config);
    }, [config]);

    const toggleSetting = (key: keyof DashboardConfig) => {
        setConfig(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    const quickActions = [
        { id: 'add-income', label: 'Add Income', icon: '💰' },
        { id: 'add-expense', label: 'Add Expense', icon: '💸' },
        { id: 'view-cashflow', label: 'Cash Flow', icon: '📈' },
        { id: 'view-reports', label: 'Reports', icon: '📊' },
    ];

    return (
        <ScrollView style={styles.container}>
            {/* Dashboard Header */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Financial Dashboard</Text>
                <TouchableOpacity
                    style={styles.configButton}
                    onPress={() => setShowConfig(!showConfig)}
                >
                    <Text style={styles.configButtonText}>⚙️ Customize</Text>
                </TouchableOpacity>
            </View>

            {/* Configuration Panel */}
            {showConfig && (
                <View style={styles.configPanel}>
                    <Text style={styles.configTitle}>Dashboard Configuration</Text>

                    <View style={styles.configOption}>
                        <Text style={styles.configLabel}>Show Income</Text>
                        <Switch
                            value={config.showIncome}
                            onValueChange={() => toggleSetting('showIncome')}
                        />
                    </View>

                    <View style={styles.configOption}>
                        <Text style={styles.configLabel}>Show Expenses</Text>
                        <Switch
                            value={config.showExpenses}
                            onValueChange={() => toggleSetting('showExpenses')}
                        />
                    </View>

                    <View style={styles.configOption}>
                        <Text style={styles.configLabel}>Show Profit</Text>
                        <Switch
                            value={config.showProfit}
                            onValueChange={() => toggleSetting('showProfit')}
                        />
                    </View>

                    <View style={styles.configOption}>
                        <Text style={styles.configLabel}>Show Cash Flow</Text>
                        <Switch
                            value={config.showCashFlow}
                            onValueChange={() => toggleSetting('showCashFlow')}
                        />
                    </View>

                    <View style={styles.configOption}>
                        <Text style={styles.configLabel}>Show Debt Ratio</Text>
                        <Switch
                            value={config.showDebtRatio}
                            onValueChange={() => toggleSetting('showDebtRatio')}
                        />
                    </View>

                    <View style={styles.configOption}>
                        <Text style={styles.configLabel}>Show Cash Reserve</Text>
                        <Switch
                            value={config.showCashReserve}
                            onValueChange={() => toggleSetting('showCashReserve')}
                        />
                    </View>

                    <View style={styles.configOption}>
                        <Text style={styles.configLabel}>Show Quick Actions</Text>
                        <Switch
                            value={config.showQuickActions}
                            onValueChange={() => toggleSetting('showQuickActions')}
                        />
                    </View>
                </View>
            )}

            {/* Financial Metrics Cards */}
            {config.showIncome && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Total Income</Text>
                    <Text style={styles.incomeText}>{currency}{finance.income.toLocaleString()}</Text>
                    <Text style={styles.cardSubtitle}>This month</Text>
                </View>
            )}

            {config.showExpenses && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Total Expenses</Text>
                    <Text style={styles.expenseText}>{currency}{finance.expense.toLocaleString()}</Text>
                    <Text style={styles.cardSubtitle}>This month</Text>
                </View>
            )}

            {config.showProfit && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Net Profit</Text>
                    <Text style={finance.profit >= 0 ? styles.incomeText : styles.expenseText}>
                        {finance.profit >= 0 ? '+' : ''}{currency}{finance.profit.toLocaleString()}
                    </Text>
                    <Text style={styles.cardSubtitle}>This month</Text>
                </View>
            )}

            {config.showCashFlow && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Monthly Cash Flow</Text>
                    <Text style={monthlyCashFlow >= 0 ? styles.incomeText : styles.expenseText}>
                        {monthlyCashFlow >= 0 ? '+' : ''}{currency}{monthlyCashFlow.toLocaleString()}
                    </Text>
                    <Text style={styles.cardSubtitle}>Income minus expenses</Text>
                </View>
            )}

            {config.showDebtRatio && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Debt to Equity Ratio</Text>
                    <Text style={styles.normalText}>{debtToEquityRatio.toFixed(2)}:1</Text>
                    <Text style={styles.cardSubtitle}>Liabilities to equity ratio</Text>
                </View>
            )}

            {config.showCashReserve && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Cash Reserve</Text>
                    <Text style={styles.normalText}>{currency}{monthlyReserve.toLocaleString()}</Text>
                    <Text style={styles.cardSubtitle}>Minimum recommended</Text>
                </View>
            )}

            {/* Quick Actions */}
            {config.showQuickActions && (
                <View style={styles.quickActionsContainer}>
                    <Text style={styles.sectionTitle}>Quick Actions</Text>
                    <View style={styles.quickActionsGrid}>
                        {quickActions.map(action => (
                            <TouchableOpacity
                                key={action.id}
                                style={styles.quickActionItem}
                                onPress={() => Alert.alert(`Action: ${action.label}`, `Performing ${action.label}...`)}
                            >
                                <Text style={styles.quickActionIcon}>{action.icon}</Text>
                                <Text style={styles.quickActionLabel}>{action.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            )}

            {/* Performance Insights */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Performance Insights</Text>
                <View style={styles.insightItem}>
                    <Text style={styles.insightText}>
                        {finance.margin >= parseFloat(targetMargin)
                            ? `✅ Great! Your ${finance.margin.toFixed(1)}% margin meets your ${targetMargin}% target.`
                            : `⚠️ Your ${finance.margin.toFixed(1)}% margin is below your ${targetMargin}% target.`}
                    </Text>
                </View>
                <View style={styles.insightItem}>
                    <Text style={styles.insightText}>
                        {monthlyCashFlow >= 0
                            ? '✅ Positive cash flow indicates healthy operations.'
                            : '⚠️ Negative cash flow requires immediate attention.'}
                    </Text>
                </View>
                <View style={styles.insightItem}>
                    <Text style={styles.insightText}>
                        {finance.assets > finance.liabilities
                            ? '✅ Your assets exceed your liabilities.'
                            : '⚠️ Your liabilities exceed your assets.'}
                    </Text>
                </View>
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
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#f8fafc',
    },
    configButton: {
        backgroundColor: '#334155',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
    },
    configButtonText: {
        color: '#f8fafc',
        fontSize: 14,
    },
    configPanel: {
        backgroundColor: '#1e293b',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
    },
    configTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#f8fafc',
        marginBottom: 12,
    },
    configOption: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
    },
    configLabel: {
        fontSize: 14,
        color: '#cbd5e1',
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
    cardTitle: {
        fontSize: 14,
        fontWeight: '500',
        color: '#94a3b8',
        marginBottom: 4,
    },
    cardSubtitle: {
        fontSize: 12,
        color: '#94a3b8',
        marginTop: 4,
    },
    incomeText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#10b981',
    },
    expenseText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#ef4444',
    },
    normalText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#f8fafc',
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#f8fafc',
        marginBottom: 12,
    },
    quickActionsContainer: {
        marginBottom: 16,
    },
    quickActionsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    quickActionItem: {
        backgroundColor: '#1e293b',
        borderRadius: 12,
        padding: 12,
        width: '48%',
        alignItems: 'center',
        marginBottom: 12,
    },
    quickActionIcon: {
        fontSize: 24,
        marginBottom: 8,
    },
    quickActionLabel: {
        fontSize: 12,
        color: '#f8fafc',
        textAlign: 'center',
    },
    insightItem: {
        paddingVertical: 4,
    },
    insightText: {
        fontSize: 12,
        color: '#cbd5e1',
        lineHeight: 18,
    },
});

export default Dashboard;