import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { getTopCategories } from '../utils/finance';

export default function TaxSummary() {
    const { finance, transactions, settings, navigate } = useApp();
    const { currency } = settings;

    const taxByCategory = useMemo(() => {
        const map = new Map<string, number>();
        transactions.forEach(tx => {
            if (tx.taxAmount && tx.taxAmount > 0) {
                const key = `${tx.category} (${tx.type})`;
                map.set(key, (map.get(key) ?? 0) + tx.taxAmount);
            }
        });
        return Array.from(map.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([label, amount]) => ({ label, amount }));
    }, [transactions]);

    const taxableIncome = useMemo(() => (
        transactions.filter(t => t.type === 'income' && (t.taxAmount ?? 0) > 0).reduce((s, t) => s + t.amount, 0)
    ), [transactions]);

    const taxableExpenses = useMemo(() => (
        transactions.filter(t => t.type === 'expense' && (t.taxAmount ?? 0) > 0).reduce((s, t) => s + t.amount, 0)
    ), [transactions]);

    const effectiveTaxRate = taxableIncome > 0 ? (finance.totalTaxCollected / taxableIncome) * 100 : 0;

    return (
        <View>
            {/* Overview */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Tax Overview</Text>

                <View style={styles.row}>
                    <View style={[styles.statBox, { borderColor: Colors.income }]}>
                        <Text style={styles.statLabel}>Tax Collected</Text>
                        <Text style={[styles.statValue, { color: Colors.income }]}>
                            {currency}{finance.totalTaxCollected.toLocaleString()}
                        </Text>
                        <Text style={styles.statSub}>From income transactions</Text>
                    </View>
                    <View style={[styles.statBox, { borderColor: Colors.expense }]}>
                        <Text style={styles.statLabel}>Tax Paid</Text>
                        <Text style={[styles.statValue, { color: Colors.expense }]}>
                            {currency}{finance.totalTaxPaid.toLocaleString()}
                        </Text>
                        <Text style={styles.statSub}>On expense transactions</Text>
                    </View>
                </View>

                <View style={[styles.netBox, { backgroundColor: finance.netTaxPosition >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' }]}>
                    <Text style={styles.netLabel}>Net Tax Position</Text>
                    <Text style={[styles.netValue, { color: finance.netTaxPosition >= 0 ? Colors.income : Colors.expense }]}>
                        {finance.netTaxPosition >= 0 ? '+' : ''}{currency}{finance.netTaxPosition.toLocaleString()}
                    </Text>
                    <Text style={styles.netHint}>
                        {finance.netTaxPosition >= 0
                            ? 'You have collected more tax than you have paid — check compliance obligations.'
                            : 'You have paid more tax than collected on income.'}
                    </Text>
                </View>
            </View>

            {/* Effective Rate */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Tax Metrics</Text>
                <MetricRow label="Taxable Revenue" value={`${currency}${taxableIncome.toLocaleString()}`} />
                <MetricRow label="Taxable Expenses" value={`${currency}${taxableExpenses.toLocaleString()}`} />
                <MetricRow label="Effective Tax Rate on Revenue" value={`${effectiveTaxRate.toFixed(2)}%`} />
                <MetricRow label="Transactions with Tax" value={`${transactions.filter(t => (t.taxAmount ?? 0) > 0).length}`} />
            </View>

            {/* Tax Planning Tool */}
            <TouchableOpacity onPress={() => navigate('tax-planning')}>
                <View style={styles.featureCard}>
                    <Text style={styles.featureIcon}>📊</Text>
                    <View style={styles.featureContent}>
                        <Text style={styles.featureTitle}>Tax Planning Tool</Text>
                        <Text style={styles.featureDesc}>Quarterly planning, deductions, and tax filing checklist</Text>
                    </View>
                    <Text style={styles.featureArrow}>→</Text>
                </View>
            </TouchableOpacity>

            {/* By Category */}
            {taxByCategory.length > 0 && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Tax by Category</Text>
                    {taxByCategory.map(({ label, amount }) => (
                        <MetricRow key={label} label={label} value={`${currency}${amount.toLocaleString()}`} />
                    ))}
                </View>
            )}

            {taxByCategory.length === 0 && (
                <View style={styles.emptyCard}>
                    <Text style={styles.emptyTitle}>No Tax Data Yet</Text>
                    <Text style={styles.emptyText}>
                        Add a Tax Rate (%) when logging transactions to track tax collected and paid here.
                    </Text>
                </View>
            )}

            {/* Disclaimer */}
            <View style={styles.disclaimerCard}>
                <Text style={styles.disclaimerText}>
                    ⚠ This is a summary for internal tracking only. Consult a qualified accountant or tax advisor for official tax filings and compliance requirements.
                </Text>
            </View>
        </View>
    );
}

function MetricRow({ label, value }: { label: string; value: string }) {
    return (
        <View style={rowStyles.row}>
            <Text style={rowStyles.label}>{label}</Text>
            <Text style={rowStyles.value}>{value}</Text>
        </View>
    );
}

const rowStyles = StyleSheet.create({
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
    label: { fontSize: 13, color: Colors.textSecondary, flex: 1 },
    value: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
});

const styles = StyleSheet.create({
    card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 14 },
    cardTitle: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 12 },
    row: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    statBox: { flex: 1, borderRadius: 10, borderWidth: 1, padding: 12, alignItems: 'center' },
    statLabel: { fontSize: 11, color: Colors.textMuted, marginBottom: 6 },
    statValue: { fontSize: 20, fontWeight: 'bold' },
    statSub: { fontSize: 10, color: Colors.textMuted, marginTop: 4, textAlign: 'center' },
    netBox: { borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 4 },
    netLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 4 },
    netValue: { fontSize: 24, fontWeight: 'bold', marginBottom: 6 },
    netHint: { fontSize: 11, color: Colors.textMuted, textAlign: 'center', lineHeight: 16 },
    emptyCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 24, alignItems: 'center', marginBottom: 14 },
    emptyTitle: { fontSize: 15, fontWeight: 'bold', color: Colors.textMuted, marginBottom: 8 },
    emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
    disclaimerCard: { backgroundColor: 'rgba(245,158,11,0.08)', borderRadius: 10, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' },
    disclaimerText: { fontSize: 11, color: Colors.warning, lineHeight: 18 },
    featureCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: Colors.primary + '40' },
    featureIcon: { fontSize: 28 },
    featureContent: { flex: 1 },
    featureTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
    featureDesc: { fontSize: 12, color: Colors.textMuted },
    featureArrow: { fontSize: 16, color: Colors.primary, fontWeight: 'bold' },
});
