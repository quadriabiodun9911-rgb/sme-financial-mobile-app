import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

interface FinanceData {
    income: number;
    expense: number;
    profit: number;
    margin: number;
    assets: number;
    liabilities: number;
    equity: number;
}

interface BudgetSummaryProps {
    finance: FinanceData;
    currency: string;
    minReserve: string;
    targetMargin: string;
}

const BudgetSummary: React.FC<BudgetSummaryProps> = ({ finance, currency, minReserve, targetMargin }) => {
    // Calculate budget metrics
    const actualVsBudgeted = finance.income - finance.expense; // Current actual profit
    const budgetedProfit = finance.income * (parseFloat(targetMargin) / 100); // Hypothetical budgeted profit
    const variance = actualVsBudgeted - budgetedProfit;
    const variancePercentage = finance.income > 0 ? (variance / finance.income) * 100 : 0;

    // Budget categories breakdown (hypothetical)
    const budgetCategories = [
        { name: 'Personnel', budgeted: finance.expense * 0.4, actual: finance.expense * 0.38, color: '#3b82f6' },
        { name: 'Operations', budgeted: finance.expense * 0.25, actual: finance.expense * 0.27, color: '#10b981' },
        { name: 'Marketing', budgeted: finance.expense * 0.15, actual: finance.expense * 0.18, color: '#f59e0b' },
        { name: 'Supplies', budgeted: finance.expense * 0.1, actual: finance.expense * 0.09, color: '#8b5cf6' },
        { name: 'Other', budgeted: finance.expense * 0.1, actual: finance.expense * 0.08, color: '#ef4444' },
    ];

    // Budget performance status
    const isOnTrack = Math.abs(variancePercentage) <= 5;
    const isUnderBudget = variance > 0;

    // Monthly budget forecast
    const monthlyBudget = [
        { month: 'Jan', income: finance.income * 1.02, expense: finance.expense * 1.01, profit: (finance.income * 1.02) - (finance.expense * 1.01) },
        { month: 'Feb', income: finance.income * 1.04, expense: finance.expense * 1.03, profit: (finance.income * 1.04) - (finance.expense * 1.03) },
        { month: 'Mar', income: finance.income * 1.03, expense: finance.expense * 1.02, profit: (finance.income * 1.03) - (finance.expense * 1.02) },
        { month: 'Apr', income: finance.income * 1.05, expense: finance.expense * 1.04, profit: (finance.income * 1.05) - (finance.expense * 1.04) },
    ];

    return (
        <ScrollView style={styles.container}>
            {/* BUDGET PERFORMANCE OVERVIEW */}
            <View style={styles.card}>
                <Text style={styles.title}>📊 BUDGET PERFORMANCE OVERVIEW</Text>

                <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>Budgeted Profit ({targetMargin}%)</Text>
                    <Text style={styles.positiveText}>{currency}{budgetedProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })}</Text>
                </View>

                <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>Actual Profit</Text>
                    <Text style={finance.profit >= 0 ? styles.positiveText : styles.negativeText}>
                        {finance.profit >= 0 ? '+' : ''}{currency}{finance.profit.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </Text>
                </View>

                <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>Variance</Text>
                    <Text style={variance >= 0 ? styles.positiveText : styles.negativeText}>
                        {variance >= 0 ? '+' : ''}{currency}{variance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </Text>
                </View>

                <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>Variance %</Text>
                    <Text style={Math.abs(variancePercentage) <= 5 ? styles.positiveText : styles.negativeText}>
                        {variancePercentage >= 0 ? '+' : ''}{variancePercentage.toFixed(2)}%
                    </Text>
                </View>

                <View style={styles.statusBadge}>
                    <Text style={[
                        styles.statusText,
                        isOnTrack ? styles.onTrackText :
                            isUnderBudget ? styles.underBudgetText : styles.overBudgetText
                    ]}>
                        {isOnTrack ? 'ON TRACK' : isUnderBudget ? 'UNDER BUDGET' : 'OVER BUDGET'}
                    </Text>
                </View>
            </View>

            {/* BUDGET BREAKDOWN BY CATEGORY */}
            <View style={styles.card}>
                <Text style={styles.title}>🗂️ BUDGET BREAKDOWN BY CATEGORY</Text>

                {budgetCategories.map((category, index) => {
                    const variance = category.actual - category.budgeted;
                    const variancePercent = category.budgeted > 0 ? (variance / category.budgeted) * 100 : 0;

                    return (
                        <View key={index} style={styles.categoryRow}>
                            <View style={styles.categoryHeader}>
                                <View style={[styles.colorBox, { backgroundColor: category.color }]} />
                                <Text style={styles.categoryName}>{category.name}</Text>
                            </View>

                            <View style={styles.categoryValues}>
                                <Text style={styles.budgetedValue}>{currency}{category.budgeted.toLocaleString(undefined, { maximumFractionDigits: 2 })}</Text>
                                <Text style={category.actual <= category.budgeted ? styles.positiveText : styles.negativeText}>
                                    {currency}{category.actual.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                </Text>
                                <Text style={Math.abs(variancePercent) <= 5 ? styles.positiveText : styles.negativeText}>
                                    {variance >= 0 ? '+' : ''}{currency}{variance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                </Text>
                            </View>
                        </View>
                    );
                })}
            </View>

            {/* MONTHLY FORECAST */}
            <View style={styles.card}>
                <Text style={styles.title}>🔮 MONTHLY BUDGET FORECAST</Text>

                <View style={styles.forecastHeader}>
                    <Text style={styles.forecastLabel}>Month</Text>
                    <Text style={styles.forecastLabel}>Income</Text>
                    <Text style={styles.forecastLabel}>Expense</Text>
                    <Text style={styles.forecastLabel}>Profit</Text>
                </View>

                {monthlyBudget.map((month, index) => (
                    <View key={index} style={styles.forecastRow}>
                        <Text style={styles.forecastCell}>{month.month}</Text>
                        <Text style={styles.positiveText}>{currency}{month.income.toLocaleString(undefined, { maximumFractionDigits: 2 })}</Text>
                        <Text style={styles.negativeText}>{currency}{month.expense.toLocaleString(undefined, { maximumFractionDigits: 2 })}</Text>
                        <Text style={month.profit >= 0 ? styles.positiveText : styles.negativeText}>
                            {month.profit >= 0 ? '+' : ''}{currency}{month.profit.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </Text>
                    </View>
                ))}
            </View>

            {/* BUDGET INSIGHTS */}
            <View style={styles.card}>
                <Text style={styles.title}>💡 BUDGET INSIGHTS</Text>

                {isOnTrack ? (
                    <Text style={styles.insightText}>✅ Your budget performance is on track! Keep maintaining this level of financial discipline.</Text>
                ) : isUnderBudget ? (
                    <Text style={styles.insightText}>📈 Great job! You're performing better than budgeted. Consider reinvesting surplus into growth initiatives.</Text>
                ) : (
                    <Text style={styles.insightText}>⚠️ You're over budget. Review expense categories to identify areas for improvement.</Text>
                )}

                {finance.margin < parseFloat(targetMargin) && (
                    <Text style={styles.insightText}>📉 Your current margin ({finance.margin.toFixed(2)}%) is below your target ({targetMargin}%). Focus on increasing profitability.</Text>
                )}

                {finance.expense > finance.income * 0.8 && (
                    <Text style={styles.insightText}>⚠️ High expense ratio detected. Consider optimizing cost structures to improve profitability.</Text>
                )}

                <Text style={styles.insightText}>🎯 Tip: Review and adjust your budget monthly to reflect actual business conditions.</Text>
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
    statusBadge: {
        marginTop: 12,
        alignItems: 'center',
    },
    statusText: {
        fontSize: 14,
        fontWeight: 'bold',
        paddingVertical: 4,
        paddingHorizontal: 12,
        borderRadius: 16,
    },
    onTrackText: {
        color: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
    },
    underBudgetText: {
        color: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
    },
    overBudgetText: {
        color: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
    },
    categoryRow: {
        marginBottom: 12,
    },
    categoryHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
    },
    colorBox: {
        width: 12,
        height: 12,
        borderRadius: 6,
        marginRight: 8,
    },
    categoryName: {
        fontSize: 14,
        color: '#f8fafc',
        fontWeight: '500',
    },
    categoryValues: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
    },
    budgetedValue: {
        color: '#94a3b8',
        fontSize: 12,
        fontWeight: '500',
    },
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
    insightText: {
        fontSize: 12,
        color: '#cbd5e1',
        lineHeight: 18,
        marginBottom: 8,
    },
});

export default BudgetSummary;