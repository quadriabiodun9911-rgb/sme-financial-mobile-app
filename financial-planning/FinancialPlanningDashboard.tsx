import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput } from 'react-native';

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
    const [revenueCategory, setRevenueCategory] = useState<string>('');
    const [revenueAmount, setRevenueAmount] = useState<string>('');
    const [expenseCategory, setExpenseCategory] = useState<string>('');
    const [expenseAmount, setExpenseAmount] = useState<string>('');

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

    // Calculate cash flow projections
    const cashFlowInflows = [
        { month: 'Jan', amount: finance.income * 1.1 },
        { month: 'Feb', amount: finance.income * 1.15 },
        { month: 'Mar', amount: finance.income * 1.05 },
        { month: 'Apr', amount: finance.income * 1.2 },
        { month: 'May', amount: finance.income * 1.18 },
        { month: 'Jun', amount: finance.income * 1.12 },
    ];

    const cashFlowOutflows = [
        { month: 'Jan', amount: finance.expense * 1.05 },
        { month: 'Feb', amount: finance.expense * 1.08 },
        { month: 'Mar', amount: finance.expense * 1.03 },
        { month: 'Apr', amount: finance.expense * 1.12 },
        { month: 'May', amount: finance.expense * 1.1 },
        { month: 'Jun', amount: finance.expense * 1.07 },
    ];

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

    const handleAddRevenue = () => {
        if (revenueAmount && revenueCategory) {
            alert(`Revenue added: ${revenueCategory} - ${currency}${parseFloat(revenueAmount).toLocaleString()}`);
            setRevenueAmount('');
            setRevenueCategory('');
        }
    };

    const handleAddExpense = () => {
        if (expenseAmount && expenseCategory) {
            alert(`Expense added: ${expenseCategory} - ${currency}${parseFloat(expenseAmount).toLocaleString()}`);
            setExpenseAmount('');
            setExpenseCategory('');
        }
    };

    return (
        <ScrollView style={styles.container}>
            {/* IMPORTANCE OF BUDGETING AND FORECASTING */}
            <View style={styles.infoCard}>
                <Text style={styles.infoTitle}>🎯 THE IMPORTANCE OF BUDGETING & FORECASTING</Text>
                <Text style={styles.infoText}>
                    Budgeting and forecasting are essential financial tools that provide roadmaps for your business.
                    They help entrepreneurs know what resources are available to effectively utilize them for business survival and growth.
                </Text>
                <View style={styles.bulletPoint}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.bulletText}>Provide Financial Roadmaps: Outline expected financial performance as a roadmap for achieving goals</Text>
                </View>
                <View style={styles.bulletPoint}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.bulletText}>Aid Decision-Making: Help anticipate and plan for future expenses, revenue, and resource allocation</Text>
                </View>
                <View style={styles.bulletPoint}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.bulletText}>Ensure Financial Discipline: Set spending limits and ensure efficient resource use</Text>
                </View>
                <View style={styles.bulletPoint}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.bulletText}>Enable Performance Measurement: Compare actual results to budgeted figures</Text>
                </View>
                <View style={styles.bulletPoint}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.bulletText}>Attract Investors and Lenders: Demonstrate financial strategy and resource management</Text>
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
                
                <View style={styles.inputRow}>
                    <Text style={styles.label}>Add Revenue:</Text>
                    <TextInput
                        style={styles.input}
                        placeholder={`Category (e.g. Sales, Services)`}
                        value={revenueCategory}
                        onChangeText={setRevenueCategory}
                    />
                    <TextInput
                        style={styles.input}
                        placeholder={`Amount (${currency})`}
                        value={revenueAmount}
                        onChangeText={setRevenueAmount}
                        keyboardType="numeric"
                    />
                </View>
                
                <TouchableOpacity style={styles.addButton} onPress={handleAddRevenue}>
                    <Text style={styles.addButtonText}>Add Revenue Item</Text>
                </TouchableOpacity>
                
                <View style={styles.inputRow}>
                    <Text style={styles.label}>Add Expense:</Text>
                    <TextInput
                        style={styles.input}
                        placeholder={`Category (e.g. Rent, Utilities)`}
                        value={expenseCategory}
                        onChangeText={setExpenseCategory}
                    />
                    <TextInput
                        style={styles.input}
                        placeholder={`Amount (${currency})`}
                        value={expenseAmount}
                        onChangeText={setExpenseAmount}
                        keyboardType="numeric"
                    />
                </View>
                
                <TouchableOpacity style={styles.addButton} onPress={handleAddExpense}>
                    <Text style={styles.addButtonText}>Add Expense Item</Text>
                </TouchableOpacity>
                
                <Text style={styles.explanation}>
                    A budget serves as a roadmap for resource allocation and financial control. Regular comparison with actual results helps maintain financial discipline.
                    Set clear goals, gather historical data, and create detailed revenue and expense budgets to effectively plan your finances.
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
                    Monitor and adjust your forecasts continuously to reflect changing circumstances and evolving business goals.
                </Text>
            </View>

            {/* HOW TO CREATE AND USE BUDGETS */}
            <View style={styles.infoCard}>
                <Text style={styles.infoTitle}>⚙️ HOW TO CREATE AND USE BUDGETS</Text>
                <View style={styles.bulletPoint}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.bulletText}>Set Clear Goals: Determine specific financial objectives and key performance indicators</Text>
                </View>
                <View style={styles.bulletPoint}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.bulletText}>Gather Data: Collect historical financial data and market research to inform assumptions</Text>
                </View>
                <View style={styles.bulletPoint}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.bulletText}>Create Detailed Budgets: Estimate all revenue sources and break down expenses into categories</Text>
                </View>
                <View style={styles.bulletPoint}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.bulletText}>Monitor and Adjust: Track actual performance against the budget regularly</Text>
                </View>
                <View style={styles.bulletPoint}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.bulletText}>Use Budgets for Decision-Making: Reference your budget before making financial decisions</Text>
                </View>
                <View style={styles.bulletPoint}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.bulletText}>Regularly Review and Revise: Update your budget to reflect new information and changing goals</Text>
                </View>
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
                    <Text style={Math.floor(parseFloat(minReserve) / Math.max(finance.expense/30, 1)) >= 30 ? styles.positiveText : styles.negativeText}>
                        {Math.floor(parseFloat(minReserve) / Math.max(finance.expense/30, 1))} days
                    </Text>
                </View>
                
                <View style={styles.cashFlowTable}>
                    <View style={styles.tableHeader}>
                        <Text style={styles.tableHeaderText}>Month</Text>
                        <Text style={styles.tableHeaderText}>Inflows</Text>
                        <Text style={styles.tableHeaderText}>Outflows</Text>
                        <Text style={styles.tableHeaderText}>Net Flow</Text>
                    </View>
                    
                    {cashFlowInflows.map((item, index) => (
                        <View key={index} style={styles.tableRow}>
                            <Text style={styles.tableCell}>{item.month}</Text>
                            <Text style={styles.positiveText}>{currency}{cashFlowInflows[index].amount.toLocaleString()}</Text>
                            <Text style={styles.negativeText}>{currency}{cashFlowOutflows[index].amount.toLocaleString()}</Text>
                            <Text style={(cashFlowInflows[index].amount - cashFlowOutflows[index].amount) >= 0 ? styles.positiveText : styles.negativeText}>
                                {(cashFlowInflows[index].amount - cashFlowOutflows[index].amount) >= 0 ? '+' : ''}
                                {currency}{(cashFlowInflows[index].amount - cashFlowOutflows[index].amount).toLocaleString()}
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
    infoCard: {
        backgroundColor: '#0f172a',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#334155',
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
    infoTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#f8fafc',
        marginBottom: 10,
    },
    infoText: {
        fontSize: 12,
        color: '#94a3b8',
        marginBottom: 10,
        lineHeight: 16,
    },
    bulletPoint: {
        flexDirection: 'row',
        marginBottom: 6,
    },
    bullet: {
        color: '#f8fafc',
        fontSize: 14,
        fontWeight: 'bold',
        marginRight: 8,
    },
    bulletText: {
        color: '#cbd5e1',
        fontSize: 12,
        flex: 1,
        lineHeight: 16,
    },
});

export default BudgetForecastingDashboard;