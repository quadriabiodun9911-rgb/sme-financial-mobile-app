import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput, Switch, Dimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';

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

const BudgetForecastingDashboard: React.FC<Props> = ({ finance, currency, minReserve, targetMargin }) => {
    const [selectedPeriod, setSelectedPeriod] = useState<'month' | 'quarter' | 'year'>('month');
    const [investmentAmount, setInvestmentAmount] = useState<string>('');
    const [investmentDescription, setInvestmentDescription] = useState<string>('');
    const [trendAnalysis, setTrendAnalysis] = useState<'income' | 'expense' | 'profit'>('income');
    const [forecastRange, setForecastRange] = useState<number>(6); // Number of months to forecast

    // Calculate forecasted values based on current data
    const monthlyGrowthRate = 0.05; // 5% monthly growth assumption
    const forecastedIncome = selectedPeriod === 'month'
        ? finance.income * (1 + monthlyGrowthRate)
        : selectedPeriod === 'quarter'
            ? finance.income * Math.pow(1 + monthlyGrowthRate, 3)
            : finance.income * Math.pow(1 + monthlyGrowthRate, 12);

    const forecastedExpenses = selectedPeriod === 'month'
        ? finance.expense * (1 + monthlyGrowthRate * 0.5)
        : selectedPeriod === 'quarter'
            ? finance.expense * Math.pow(1 + monthlyGrowthRate * 0.5, 3)
            : finance.expense * Math.pow(1 + monthlyGrowthRate * 0.5, 12);

    const forecastedProfit = forecastedIncome - forecastedExpenses;

    // Calculate cash flow projections for the specified range
    const generateCashFlowProjections = (months: number) => {
        const inflows = [];
        const outflows = [];
        const netFlows = [];

        for (let i = 0; i < months; i++) {
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const currentMonth = monthNames[(new Date().getMonth() + i) % 12] || `Month ${i + 1}`;

            const growthMultiplier = 1 + (monthlyGrowthRate * (i * 0.1)); // Gradually increasing growth
            const expenseMultiplier = 1 + (monthlyGrowthRate * 0.5 * (i * 0.1)); // Expenses grow slower

            inflows.push({
                month: currentMonth,
                amount: finance.income * growthMultiplier
            });

            outflows.push({
                month: currentMonth,
                amount: finance.expense * expenseMultiplier
            });

            netFlows.push({
                month: currentMonth,
                amount: (finance.income * growthMultiplier) - (finance.expense * expenseMultiplier)
            });
        }

        return { inflows, outflows, netFlows };
    };

    const { inflows, outflows, netFlows } = generateCashFlowProjections(forecastRange);

    // Calculate trend data for chart
    const trendData = {
        labels: inflows.map(item => item.month),
        datasets: [
            {
                data: trendAnalysis === 'income'
                    ? inflows.map(item => item.amount)
                    : trendAnalysis === 'expense'
                        ? outflows.map(item => item.amount)
                        : netFlows.map(item => item.amount),
                strokeWidth: 2,
            },
        ],
    };

    const chartConfig = {
        backgroundGradientFrom: '#1e293b',
        backgroundGradientTo: '#1e293b',
        decimalPlaces: 2,
        color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
        labelColor: (opacity = 1) => `rgba(156, 163, 175, ${opacity})`,
        style: {
            borderRadius: 16
        },
        propsForDots: {
            r: "6",
            strokeWidth: "2",
            stroke: "#2563eb"
        }
    };

    // Calculate cash flow statistics
    const averageMonthlyCashFlow = netFlows.reduce((sum, item) => sum + item.amount, 0) / netFlows.length;
    const maxCashFlow = Math.max(...netFlows.map(item => item.amount));
    const minCashFlow = Math.min(...netFlows.map(item => item.amount));
    const cashFlowVolatility = (maxCashFlow - minCashFlow) / averageMonthlyCashFlow;

    const calculateNPV = (initialInvestment: number, annualCashFlows: number[], discountRate: number) => {
        let npv = -initialInvestment;
        for (let i = 0; i < annualCashFlows.length; i++) {
            npv += annualCashFlows[i] / Math.pow(1 + discountRate, i + 1);
        }
        return npv;
    };

    const handleAddInvestment = () => {
        if (investmentAmount && investmentDescription) {
            alert(`Investment added: ${investmentDescription} - ${currency}${parseFloat(investmentAmount).toLocaleString()}`);
            setInvestmentAmount('');
            setInvestmentDescription('');
        }
    };

    return (
        <ScrollView style={styles.container}>
            {/* TREND ANALYSIS CHART */}
            <View style={styles.chartCard}>
                <View style={styles.headerRow}>
                    <Text style={styles.title}>📈 TREND ANALYSIS</Text>
                </View>

                <View style={styles.trendSelector}>
                    <TouchableOpacity
                        style={[styles.trendButton, trendAnalysis === 'income' && styles.activeTrendButton]}
                        onPress={() => setTrendAnalysis('income')}
                    >
                        <Text style={[styles.trendButtonText, trendAnalysis === 'income' && styles.activeTrendButtonText]}>Income</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.trendButton, trendAnalysis === 'expense' && styles.activeTrendButton]}
                        onPress={() => setTrendAnalysis('expense')}
                    >
                        <Text style={[styles.trendButtonText, trendAnalysis === 'expense' && styles.activeTrendButtonText]}>Expense</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.trendButton, trendAnalysis === 'profit' && styles.activeTrendButton]}
                        onPress={() => setTrendAnalysis('profit')}
                    >
                        <Text style={[styles.trendButtonText, trendAnalysis === 'profit' && styles.activeTrendButtonText]}>Profit</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.rangeSelector}>
                    <Text style={styles.label}>Forecast Range (Months)</Text>
                    <View style={styles.rangeInputRow}>
                        <TouchableOpacity
                            style={styles.rangeButton}
                            onPress={() => setForecastRange(prev => Math.max(3, prev - 1))}
                        >
                            <Text style={styles.rangeButtonText}>-</Text>
                        </TouchableOpacity>
                        <Text style={styles.rangeValue}>{forecastRange}</Text>
                        <TouchableOpacity
                            style={styles.rangeButton}
                            onPress={() => setForecastRange(prev => Math.min(12, prev + 1))}
                        >
                            <Text style={styles.rangeButtonText}>+</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <LineChart
                    data={trendData}
                    width={Dimensions.get("window").width - 40}
                    height={220}
                    chartConfig={chartConfig}
                    bezier
                    style={styles.chart}
                />

                <View style={styles.statsRow}>
                    <View style={styles.statBox}>
                        <Text style={styles.statLabel}>Avg. Monthly</Text>
                        <Text style={styles.statValue}>{currency}{averageMonthlyCashFlow.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                    </View>
                    <View style={styles.statBox}>
                        <Text style={styles.statLabel}>Max Flow</Text>
                        <Text style={styles.statValue}>{currency}{maxCashFlow.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                    </View>
                    <View style={styles.statBox}>
                        <Text style={styles.statLabel}>Min Flow</Text>
                        <Text style={styles.statValue}>{currency}{minCashFlow.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                    </View>
                </View>
            </View>

            {/* BUDGETING SECTION */}
            <View style={styles.card}>
                <View style={styles.headerRow}>
                    <Text style={styles.title}>📋 BUDGETING</Text>
                </View>
                <Text style={styles.subtitle}>Creating a detailed financial plan that outlines expected revenues and expenses over a specific period</Text>

                <View style={styles.budgetRow}>
                    <Text style={styles.budgetLabel}>Budget Period</Text>
                    <View style={styles.periodSelector}>
                        <TouchableOpacity
                            style={[styles.periodButton, selectedPeriod === 'month' && styles.activePeriodButton]}
                            onPress={() => setSelectedPeriod('month')}
                        >
                            <Text style={[styles.periodButtonText, selectedPeriod === 'month' && styles.activePeriodButtonText]}>Month</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.periodButton, selectedPeriod === 'quarter' && styles.activePeriodButton]}
                            onPress={() => setSelectedPeriod('quarter')}
                        >
                            <Text style={[styles.periodButtonText, selectedPeriod === 'quarter' && styles.activePeriodButtonText]}>Quarter</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.periodButton, selectedPeriod === 'year' && styles.activePeriodButton]}
                            onPress={() => setSelectedPeriod('year')}
                        >
                            <Text style={[styles.periodButtonText, selectedPeriod === 'year' && styles.activePeriodButtonText]}>Year</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={styles.row}>
                    <Text style={styles.label}>Expected Income</Text>
                    <Text style={styles.positiveText}>{currency}{finance.income.toLocaleString()}</Text>
                </View>

                <View style={styles.row}>
                    <Text style={styles.label}>Planned Expenses</Text>
                    <Text style={styles.negativeText}>{currency}{finance.expense.toLocaleString()}</Text>
                </View>

                <View style={styles.row}>
                    <Text style={styles.label}>Budgeted Profit</Text>
                    <Text style={finance.profit >= 0 ? styles.positiveText : styles.negativeText}>
                        {finance.profit >= 0 ? '+' : ''}{currency}{finance.profit.toLocaleString()}
                    </Text>
                </View>

                <Text style={styles.explanation}>
                    A budget serves as a roadmap for resource allocation and financial control. Regular comparison with actual results helps maintain financial discipline.
                </Text>
            </View>

            {/* FORECASTING SECTION */}
            <View style={styles.card}>
                <View style={styles.headerRow}>
                    <Text style={styles.title}>🔮 FORECASTING</Text>
                </View>
                <Text style={styles.subtitle}>Making educated estimates of future financial performance based on historical data and market analysis</Text>

                <View style={styles.row}>
                    <Text style={styles.label}>Current Income</Text>
                    <Text style={styles.positiveText}>{currency}{finance.income.toLocaleString()}</Text>
                </View>

                <View style={styles.row}>
                    <Text style={styles.label}>Forecasted Income ({selectedPeriod})</Text>
                    <Text style={styles.positiveText}>{currency}{forecastedIncome.toLocaleString()}</Text>
                </View>

                <View style={styles.row}>
                    <Text style={styles.label}>Current Expenses</Text>
                    <Text style={styles.negativeText}>{currency}{finance.expense.toLocaleString()}</Text>
                </View>

                <View style={styles.row}>
                    <Text style={styles.label}>Forecasted Expenses ({selectedPeriod})</Text>
                    <Text style={styles.negativeText}>{currency}{forecastedExpenses.toLocaleString()}</Text>
                </View>

                <View style={styles.row}>
                    <Text style={styles.label}>Projected Profit ({selectedPeriod})</Text>
                    <Text style={forecastedProfit >= 0 ? styles.positiveText : styles.negativeText}>
                        {forecastedProfit >= 0 ? '+' : ''}{currency}{forecastedProfit.toLocaleString()}
                    </Text>
                </View>

                <Text style={styles.explanation}>
                    Accurate forecasting helps anticipate trends, challenges, and opportunities. Regular updates based on actual performance improve accuracy over time.
                </Text>
            </View>

            {/* INVESTMENT DECISIONS SECTION */}
            <View style={styles.card}>
                <View style={styles.headerRow}>
                    <Text style={styles.title}>💼 INVESTMENT DECISIONS</Text>
                </View>
                <Text style={styles.subtitle}>Evaluating investment opportunities by assessing risks and potential returns to determine financial viability</Text>

                <View style={styles.row}>
                    <Text style={styles.label}>ROI Target</Text>
                    <Text style={styles.normalText}>{targetMargin}%</Text>
                </View>

                <View style={styles.row}>
                    <Text style={styles.label}>Current Margin</Text>
                    <Text style={finance.margin >= parseFloat(targetMargin) ? styles.positiveText : styles.negativeText}>
                        {finance.margin.toFixed(2)}%
                    </Text>
                </View>

                <View style={styles.row}>
                    <Text style={styles.label}>Investment Capacity</Text>
                    <Text style={finance.profit >= parseFloat(minReserve) * 0.3 ? styles.positiveText : styles.negativeText}>
                        {finance.profit >= parseFloat(minReserve) * 0.3 ? 'High' : 'Limited'}
                    </Text>
                </View>

                <View style={styles.inputRow}>
                    <Text style={styles.label}>New Investment:</Text>
                    <TextInput
                        style={styles.input}
                        placeholder={`Amount (${currency})`}
                        value={investmentAmount}
                        onChangeText={setInvestmentAmount}
                        keyboardType="numeric"
                    />
                    <TextInput
                        style={styles.input}
                        placeholder="Description"
                        value={investmentDescription}
                        onChangeText={setInvestmentDescription}
                    />
                </View>

                <TouchableOpacity style={styles.addButton} onPress={handleAddInvestment}>
                    <Text style={styles.addButtonText}>Add Investment</Text>
                </TouchableOpacity>

                <Text style={styles.explanation}>
                    Investment decisions should consider risk-adjusted returns, alignment with strategic goals, and impact on cash flow. A systematic evaluation process helps minimize risks.
                </Text>
            </View>

            {/* CASH FLOW MANAGEMENT SECTION */}
            <View style={styles.card}>
                <View style={styles.headerRow}>
                    <Text style={styles.title}>💰 MANAGING CASH FLOW</Text>
                </View>
                <Text style={styles.subtitle}>Monitoring and controlling the inflow and outflow of cash to ensure positive and consistent cash flow</Text>

                <View style={styles.row}>
                    <Text style={styles.label}>Current Monthly Cash Flow</Text>
                    <Text style={(finance.income - finance.expense) >= 0 ? styles.positiveText : styles.negativeText}>
                        {(finance.income - finance.expense) >= 0 ? '+' : ''}{currency}{(finance.income - finance.expense).toLocaleString()}
                    </Text>
                </View>

                <View style={styles.row}>
                    <Text style={styles.label}>Minimum Cash Reserve</Text>
                    <Text style={parseFloat(minReserve) > 0 ? styles.normalText : styles.negativeText}>
                        {currency}{parseFloat(minReserve).toLocaleString()}
                    </Text>
                </View>

                <View style={styles.row}>
                    <Text style={styles.label}>Days of Operations Coverage</Text>
                    <Text style={Math.floor(parseFloat(minReserve) / Math.max(finance.expense / 30, 1)) >= 30 ? styles.positiveText : styles.negativeText}>
                        {Math.floor(parseFloat(minReserve) / Math.max(finance.expense / 30, 1))} days
                    </Text>
                </View>

                <View style={styles.cashFlowTable}>
                    <View style={styles.tableHeader}>
                        <Text style={styles.tableHeaderText}>Month</Text>
                        <Text style={styles.tableHeaderText}>Inflows</Text>
                        <Text style={styles.tableHeaderText}>Outflows</Text>
                        <Text style={styles.tableHeaderText}>Net Flow</Text>
                    </View>

                    {inflows.map((item, index) => (
                        <View key={index} style={styles.tableRow}>
                            <Text style={styles.tableCell}>{item.month}</Text>
                            <Text style={styles.positiveText}>{currency}{inflows[index].amount.toLocaleString()}</Text>
                            <Text style={styles.negativeText}>{currency}{outflows[index].amount.toLocaleString()}</Text>
                            <Text style={netFlows[index].amount >= 0 ? styles.positiveText : styles.negativeText}>
                                {netFlows[index].amount >= 0 ? '+' : ''}
                                {currency}{netFlows[index].amount.toLocaleString()}
                            </Text>
                        </View>
                    ))}
                </View>

                <Text style={styles.explanation}>
                    Effective cash flow management ensures liquidity to meet obligations, seize opportunities, and sustain operations. Regular monitoring helps identify potential shortfalls early.
                </Text>
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
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
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
        paddingBottom: 8,
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#f8fafc',
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
    },
    budgetRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
        marginBottom: 12,
    },
    label: {
        fontSize: 14,
        color: '#cbd5e1',
        fontWeight: '500',
    },
    subtitle: {
        fontSize: 12,
        color: '#94a3b8',
        marginBottom: 12,
        fontStyle: 'italic',
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
        color: '#f97316',
        fontWeight: '600',
    },
    explanation: {
        fontSize: 12,
        color: '#94a3b8',
        marginTop: 10,
        fontStyle: 'italic',
        lineHeight: 16,
    },
    budgetLabel: {
        fontSize: 14,
        color: '#cbd5e1',
        fontWeight: '500',
        flex: 1,
    },
    periodSelector: {
        flexDirection: 'row',
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 8,
        overflow: 'hidden',
    },
    periodButton: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        backgroundColor: '#0f172a',
    },
    activePeriodButton: {
        backgroundColor: '#2563eb',
    },
    periodButtonText: {
        color: '#94a3b8',
        fontSize: 12,
        fontWeight: '500',
    },
    activePeriodButtonText: {
        color: '#f8fafc',
        fontWeight: 'bold',
    },
    inputRow: {
        flexDirection: 'column',
        gap: 8,
        marginTop: 12,
    },
    input: {
        backgroundColor: '#0f172a',
        borderColor: '#334155',
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        color: '#f8fafc',
        fontSize: 14,
    },
    addButton: {
        backgroundColor: '#2563eb',
        borderRadius: 8,
        paddingVertical: 10,
        alignItems: 'center',
        marginTop: 12,
    },
    addButtonText: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: 'bold',
    },
    cashFlowTable: {
        marginTop: 12,
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 8,
        overflow: 'hidden',
    },
    tableHeader: {
        flexDirection: 'row',
        backgroundColor: '#0f172a',
        paddingVertical: 8,
    },
    tableHeaderText: {
        flex: 1,
        color: '#f8fafc',
        fontSize: 11,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    tableRow: {
        flexDirection: 'row',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
    },
    tableCell: {
        flex: 1,
        color: '#cbd5e1',
        fontSize: 11,
        textAlign: 'center',
    },
    chartCard: {
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
    trendSelector: {
        flexDirection: 'row',
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 8,
        overflow: 'hidden',
        marginBottom: 12,
    },
    trendButton: {
        flex: 1,
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: '#0f172a',
        alignItems: 'center',
    },
    activeTrendButton: {
        backgroundColor: '#2563eb',
    },
    trendButtonText: {
        color: '#94a3b8',
        fontSize: 12,
        fontWeight: '500',
    },
    activeTrendButtonText: {
        color: '#f8fafc',
        fontWeight: 'bold',
    },
    rangeSelector: {
        marginBottom: 12,
    },
    rangeInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 8,
    },
    rangeButton: {
        backgroundColor: '#2563eb',
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rangeButtonText: {
        color: '#f8fafc',
        fontSize: 16,
        fontWeight: 'bold',
    },
    rangeValue: {
        color: '#f8fafc',
        fontSize: 16,
        marginHorizontal: 16,
        fontWeight: 'bold',
    },
    chart: {
        marginVertical: 8,
        borderRadius: 16,
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 12,
    },
    statBox: {
        flex: 1,
        backgroundColor: '#0f172a',
        padding: 10,
        borderRadius: 8,
        marginHorizontal: 4,
        alignItems: 'center',
    },
    statLabel: {
        fontSize: 10,
        color: '#94a3b8',
        marginBottom: 4,
    },
    statValue: {
        fontSize: 12,
        color: '#f8fafc',
        fontWeight: 'bold',
    },
});

export default BudgetForecastingDashboard;