import React from 'react';
import { SafeAreaView, ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { getTopCategories } from '../utils/finance';

export default function InsightsScreen() {
    const { finance, settings, transactions, setCurrentScreen } = useApp();
    const { currency, targetMargin, minReserve } = settings;

    const topExpenses = getTopCategories(transactions, 'expense', 5);
    const topIncome = getTopCategories(transactions, 'income', 5);

    const marginDiff = finance.margin - parseFloat(targetMargin);
    const reserveOk = finance.cashBalance >= parseFloat(minReserve);

    const pendingAR = transactions.filter(t => t.type === 'income' && (t.status === 'pending' || t.status === 'overdue'));
    const pendingAP = transactions.filter(t => t.type === 'expense' && (t.status === 'pending' || t.status === 'overdue'));
    const totalAR = pendingAR.reduce((s, t) => s + t.amount, 0);
    const totalAP = pendingAP.reduce((s, t) => s + t.amount, 0);
    const recurringCount = transactions.filter(t => t.isRecurring).length;
    const overdueCount = transactions.filter(t => t.status === 'overdue').length;

    return (
        <SafeAreaView style={styles.safe}>
            <Header />
            <ScrollView style={styles.scroll}>
                <View style={styles.pad}>
                    <Text style={styles.title}>Financial Insights</Text>

                    {/* Quick stat cards */}
                    <View style={styles.statRow}>
                        <StatCard label="Outstanding AR" value={`${currency}${totalAR.toLocaleString()}`} sub={`${pendingAR.length} invoices`} color={Colors.income} />
                        <StatCard label="Outstanding AP" value={`${currency}${totalAP.toLocaleString()}`} sub={`${pendingAP.length} bills`} color={Colors.expense} />
                    </View>
                    <View style={styles.statRow}>
                        <StatCard label="Recurring Entries" value={`${recurringCount}`} sub="auto-tracked" color={Colors.primary} />
                        <StatCard label="Overdue Items" value={`${overdueCount}`} sub="need attention" color={overdueCount > 0 ? Colors.expense : Colors.income} />
                    </View>

                    {overdueCount > 0 && (
                        <TouchableOpacity style={styles.alertBanner} onPress={() => setCurrentScreen('reports')}>
                            <Text style={styles.alertText}>
                                ⚠ {overdueCount} overdue transaction{overdueCount > 1 ? 's' : ''} — view AR/AP Aging report
                            </Text>
                        </TouchableOpacity>
                    )}

                    {/* Performance */}
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Performance Overview</Text>
                        <Row label="Current Margin" value={`${finance.margin.toFixed(2)}%`} valueStyle={finance.margin >= parseFloat(targetMargin) ? styles.green : styles.red} />
                        <Row label="Target Margin" value={`${targetMargin}%`} valueStyle={styles.normal} />
                        <Row label="Difference" value={`${marginDiff >= 0 ? '+' : ''}${marginDiff.toFixed(2)}%`} valueStyle={marginDiff >= 0 ? styles.green : styles.red} />
                    </View>

                    {/* Cash Position */}
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Cash Position</Text>
                        <Row label="Total Income" value={`${currency}${finance.income.toLocaleString()}`} valueStyle={styles.green} />
                        <Row label="Total Expenses" value={`${currency}${finance.expense.toLocaleString()}`} valueStyle={styles.red} />
                        <Row label="Cash Balance" value={`${currency}${finance.cashBalance.toLocaleString()}`} valueStyle={finance.cashBalance >= 0 ? styles.green : styles.red} />
                        <Row label="Min. Reserve" value={`${currency}${minReserve}`} valueStyle={styles.normal} />
                        <View style={[styles.badge, reserveOk ? styles.badgeGreen : styles.badgeRed]}>
                            <Text style={styles.badgeText}>{reserveOk ? 'Reserve threshold met' : 'Below minimum reserve'}</Text>
                        </View>
                    </View>

                    {/* Tax */}
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Tax Position</Text>
                        <Row label="Tax Collected" value={`${currency}${finance.totalTaxCollected.toLocaleString()}`} valueStyle={styles.yellow} />
                        <Row label="Tax Paid" value={`${currency}${finance.totalTaxPaid.toLocaleString()}`} valueStyle={styles.yellow} />
                        <Row label="Net Tax Position" value={`${finance.netTaxPosition >= 0 ? '+' : ''}${currency}${finance.netTaxPosition.toLocaleString()}`} valueStyle={finance.netTaxPosition >= 0 ? styles.green : styles.red} />
                        <TouchableOpacity onPress={() => setCurrentScreen('reports')}>
                            <Text style={styles.linkText}>View full Tax Summary →</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Balance Sheet */}
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Balance Sheet Summary</Text>
                        <Row label="Total Assets" value={`${currency}${finance.assets.toLocaleString()}`} valueStyle={styles.blue} />
                        <Row label="Total Liabilities" value={`${currency}${finance.liabilities.toLocaleString()}`} valueStyle={styles.orange} />
                        <Row label="Owner's Equity" value={`${currency}${finance.equity.toLocaleString()}`} valueStyle={styles.purple} />
                        <Text style={styles.note}>Update opening balances in Settings for a complete balance sheet.</Text>
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

function StatCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
    return (
        <View style={[statStyles.card, { borderTopColor: color }]}>
            <Text style={statStyles.label}>{label}</Text>
            <Text style={[statStyles.value, { color }]}>{value}</Text>
            <Text style={statStyles.sub}>{sub}</Text>
        </View>
    );
}

const statStyles = StyleSheet.create({
    card: { flex: 1, backgroundColor: Colors.surface, borderRadius: 10, padding: 12, borderTopWidth: 3 },
    label: { fontSize: 11, color: Colors.textMuted, marginBottom: 4 },
    value: { fontSize: 18, fontWeight: 'bold', marginBottom: 2 },
    sub: { fontSize: 10, color: Colors.textMuted },
});

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
    statRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
    alertBanner: { backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: Colors.expense, borderRadius: 8, padding: 12, marginBottom: 12 },
    alertText: { color: Colors.expense, fontSize: 13, fontWeight: '600', textAlign: 'center' },
    card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 14 },
    cardTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 12 },
    green: { color: Colors.income },
    red: { color: Colors.expense },
    blue: { color: Colors.asset },
    orange: { color: Colors.liability },
    purple: { color: Colors.equity },
    yellow: { color: Colors.warning },
    normal: { color: Colors.textSecondary },
    note: { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic', marginTop: 8 },
    empty: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 8 },
    badge: { marginTop: 10, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, alignSelf: 'flex-start' },
    badgeGreen: { backgroundColor: 'rgba(16,185,129,0.15)' },
    badgeRed: { backgroundColor: 'rgba(239,68,68,0.15)' },
    badgeText: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary },
    linkText: { color: Colors.primary, fontSize: 12, marginTop: 10 },
});
