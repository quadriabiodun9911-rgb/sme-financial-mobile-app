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

    const cashFlowForecast = [
        { month: 'Jan', inflow: finance.income * 1.1, outflow: finance.expense * 1.05 },
        { month: 'Feb', inflow: finance.income * 1.15, outflow: finance.expense * 1.08 },
        { month: 'Mar', inflow: finance.income * 1.05, outflow: finance.expense * 1.03 },
        { month: 'Apr', inflow: finance.income * 1.2, outflow: finance.expense * 1.12 },
        { month: 'May', inflow: finance.income * 1.18, outflow: finance.expense * 1.1 },
        { month: 'Jun', inflow: finance.income * 1.12, outflow: finance.expense * 1.07 },
    ];

    return (
        <ScrollView style={styles.container}>
            <View style={styles.infoCard}>
                <Text style={styles.infoTitle}>CASH FLOW MANAGEMENT</Text>
                <Text style={styles.infoText}>
                    Monitor and predict your cash flow to ensure business sustainability.
                </Text>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>CURRENT CASH POSITION</Text>
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
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>CASH FLOW FORECAST</Text>
                <Text style={styles.infoText}>
                    Predict future cash flow based on expected revenues and expenses.
                </Text>
                <TouchableOpacity style={styles.button} onPress={() => setShowForecastModal(true)}>
                    <Text style={styles.buttonText}>Calculate Forecast</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>OPTIMIZATION RECOMMENDATIONS</Text>
                <Text style={styles.recommendationText}>
                    • Invoice promptly and follow up on overdue payments
                </Text>
                <Text style={styles.recommendationText}>
                    • Negotiate better payment terms with suppliers
                </Text>
                <Text style={styles.recommendationText}>
                    • Maintain adequate cash reserves for emergencies
                </Text>
                <Text style={styles.recommendationText}>
                    • Monitor cash flow regularly to identify trends
                </Text>
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
                            <Text style={styles.label}>Upcoming Revenue ($)</Text>
                            <TextInput
                                style={styles.input}
                                value={upcomingRevenue.toString()}
                                onChangeText={text => setUpcomingRevenue(parseFloat(text) || 0)}
                                keyboardType="numeric"
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Upcoming Expenses ($)</Text>
                            <TextInput
                                style={styles.input}
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
                            style={[styles.button, { backgroundColor: '#94a3b8' }]}
                            onPress={() => setShowForecastModal(false)}
                        >
                            <Text style={styles.buttonText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, padding: 16, backgroundColor: '#f0f4f8' },
    infoCard: { backgroundColor: '#ffffff', borderRadius: 8, padding: 16, marginBottom: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.22, shadowRadius: 2.22 },
    card: { backgroundColor: '#ffffff', borderRadius: 8, padding: 16, marginBottom: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.22, shadowRadius: 2.22 },
    cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#1e293b', marginBottom: 12 },
    metricRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
    metricLabel: { fontSize: 14, color: '#334155', fontWeight: '500' },
    positiveText: { color: '#10b981', fontWeight: '600', fontSize: 14 },
    negativeText: { color: '#ef4444', fontWeight: '600', fontSize: 14 },
    normalText: { color: '#475569', fontWeight: '600', fontSize: 14 },
    infoTitle: { fontSize: 18, fontWeight: 'bold', color: '#0f172a', marginBottom: 8 },
    infoText: { fontSize: 14, color: '#64748b', marginBottom: 8, lineHeight: 18 },
    button: { backgroundColor: '#3b82f6', padding: 12, borderRadius: 6, alignItems: 'center', marginTop: 12 },
    buttonText: { color: '#ffffff', fontWeight: 'bold', fontSize: 16 },
    recommendationText: { fontSize: 14, color: '#475569', lineHeight: 20, marginBottom: 8 },

    // Modal styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        backgroundColor: '#ffffff',
        borderRadius: 8,
        padding: 24,
        width: '90%',
        maxWidth: 500,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#0f172a',
        marginBottom: 16,
        textAlign: 'center'
    },
    inputGroup: {
        marginBottom: 16
    },
    label: {
        fontSize: 14,
        color: '#334155',
        marginBottom: 8
    },
    input: {
        backgroundColor: '#f1f5f9',
        borderColor: '#cbd5e1',
        borderWidth: 1,
        borderRadius: 6,
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: '#0f172a',
        fontSize: 16
    },
    calculateButton: {
        backgroundColor: '#10b981',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 6,
        alignItems: 'center',
        marginBottom: 12
    },
    forecastResult: {
        marginTop: 12,
        padding: 12,
        backgroundColor: '#f1f5f9',
        borderRadius: 6,
        alignItems: 'center'
    },
    forecastText: {
        color: '#0f172a',
        fontSize: 16,
        fontWeight: 'bold'
    }
});

export default CashFlowManagement;