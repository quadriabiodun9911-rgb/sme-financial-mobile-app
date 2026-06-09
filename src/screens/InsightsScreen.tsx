import React from 'react';
import { SafeAreaView, ScrollView, View, Text, StyleSheet } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { getTopCategories } from '../utils/finance';

export default function InsightsScreen() {
    const { finance, settings, transactions } = useApp();
    const { currency, targetMargin, minReserve } = settings;

    const topExpenses = getTopCategories(transactions, 'expense', 3);
    const topIncome = getTopCategories(transactions, 'income', 3);

    const marginDiff = finance.margin - parseFloat(targetMargin);
    const reserveOk = finance.cashBalance >= parseFloat(minReserve);

    return (
        <SafeAreaView style={styles.safe}>
            <Header />
            <ScrollView style={styles.scroll}>
                <View style={styles.pad}>
                    <Text style={styles.title}>Financial Insights</Text>

                    {/* Performance overview */}
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Performance Overview</Text>
                        <Row label="Current Margin" value={`${finance.margin.toFixed(2)}%`} valueStyle={finance.margin >= parseFloat(targetMargin) ? styles.green : styles.red} />
                        <Row label="Target Margin" value={`${targetMargin}%`} valueStyle={styles.normal} />
                        <Row
                            label="Difference"
                            value={`${marginDiff >= 0 ? '+' : ''}${marginDiff.toFixed(2)}%`}
                            valueStyle={marginDiff >= 0 ? styles.green : styles.red}
                        />
                    </View>

                    {/* Cash Position */}
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Cash Position</Text>
                        <Row label="Total Income" value={`${currency}${finance.income.toLocaleString()}`} valueStyle={styles.green} />
                        <Row label="Total Expenses" value={`${currency}${finance.expense.toLocaleString()}`} valueStyle={styles.red} />
                        <Row
                            label="Cash Balance"
                            value={`${currency}${finance.cashBalance.toLocaleString()}`}
                            valueStyle={finance.cashBalance >= 0 ? styles.green : styles.red}
                        />
                        <Row
                            label="Min. Reserve"
                            value={`${currency}${minReserve}`}
                            valueStyle={styles.normal}
                        />
                        <View style={[styles.badge, reserveOk ? styles.badgeGreen : styles.badgeRed]}>
                            <Text style={styles.badgeText}>
                                {reserveOk ? 'Reserve threshold met' : 'Below minimum reserve'}
                            </Text>
                        </View>
                    </View>

                    {/* Balance Sheet Summary */}
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Balance Sheet Summary</Text>
                        <Row label="Total Assets" value={`${currency}${finance.assets.toLocaleString()}`} valueStyle={styles.blue} />
                        <Row label="Total Liabilities" value={`${currency}${finance.liabilities.toLocaleString()}`} valueStyle={styles.orange} />
                        <Row label="Owner's Equity" value={`${currency}${finance.equity.toLocaleString()}`} valueStyle={styles.purple} />
                        <Text style={styles.note}>Equity = Assets − Liabilities. Update opening balances in Settings.</Text>
                    </View>

                    {/* Top Expense Categories */}
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Top Expense Categories</Text>
                        {topExpenses.length === 0 && <Text style={styles.empty}>No expense transactions yet.</Text>}
                        {topExpenses.map(({ category, amount }) => (
                            <Row key={category} label={category} value={`${currency}${amount.toLocaleString()}`} valueStyle={styles.red} />
                        ))}
                    </View>

                    {/* Income Sources */}
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Income Sources</Text>
                        {topIncome.length === 0 && <Text style={styles.empty}>No income transactions yet.</Text>}
                        {topIncome.map(({ category, amount }) => (
                            <Row key={category} label={category} value={`${currency}${amount.toLocaleString()}`} valueStyle={styles.green} />
                        ))}
                    </View>
                </View>
            </ScrollView>
            <FooterNav />
        </SafeAreaView>
    );
}

function Row({ label, value, valueStyle }: { label: string; value: string; valueStyle: object }) {
    return (
        <View style={rowStyles.row}>
            <Text style={rowStyles.label}>{label}</Text>
            <Text style={[rowStyles.value, valueStyle]}>{value}</Text>
        </View>
    );
}

const rowStyles = StyleSheet.create({
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
    label: { fontSize: 14, color: Colors.textSecondary, fontWeight: '500' },
    value: { fontSize: 14, fontWeight: '600' },
});

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: 16 },
    title: { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 16 },
    card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 16 },
    cardTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 12 },
    green: { color: Colors.income },
    red: { color: Colors.expense },
    blue: { color: Colors.asset },
    orange: { color: Colors.liability },
    purple: { color: Colors.equity },
    normal: { color: Colors.textSecondary },
    note: { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic', marginTop: 8 },
    empty: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 8 },
    badge: { marginTop: 10, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, alignSelf: 'flex-start' },
    badgeGreen: { backgroundColor: 'rgba(16,185,129,0.15)' },
    badgeRed: { backgroundColor: 'rgba(239,68,68,0.15)' },
    badgeText: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary },
});
