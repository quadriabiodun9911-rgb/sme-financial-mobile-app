import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { computeAgingBuckets } from '../utils/finance';
import { Colors } from '../theme/colors';
import { Transaction } from '../types';

export default function AgingReport() {
    const { transactions, settings, updateTransaction } = useApp();
    const { currency } = settings;
    const [activeTab, setActiveTab] = useState<'ar' | 'ap'>('ar');

    const arBuckets = useMemo(() => computeAgingBuckets(transactions, 'income'), [transactions]);
    const apBuckets = useMemo(() => computeAgingBuckets(transactions, 'expense'), [transactions]);

    const buckets = activeTab === 'ar' ? arBuckets : apBuckets;
    const totalOutstanding = buckets.reduce((s, b) => s + b.total, 0);
    const hasAny = buckets.some(b => b.transactions.length > 0);

    const markPaid = (id: string) => updateTransaction(id, { status: 'paid' });

    return (
        <View style={styles.container}>
            {/* AR / AP Toggle */}
            <View style={styles.tabRow}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'ar' && styles.tabActive]}
                    onPress={() => setActiveTab('ar')}
                >
                    <Text style={[styles.tabText, activeTab === 'ar' && styles.tabTextActive]}>
                        Accounts Receivable (AR)
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'ap' && styles.tabActive]}
                    onPress={() => setActiveTab('ap')}
                >
                    <Text style={[styles.tabText, activeTab === 'ap' && styles.tabTextActive]}>
                        Accounts Payable (AP)
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Summary */}
            <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>
                    {activeTab === 'ar' ? 'Total Outstanding Receivables' : 'Total Outstanding Payables'}
                </Text>
                <Text style={[styles.summaryAmount, { color: activeTab === 'ar' ? Colors.income : Colors.expense }]}>
                    {currency}{totalOutstanding.toLocaleString()}
                </Text>
                <Text style={styles.summaryHint}>
                    {activeTab === 'ar'
                        ? 'Income invoices with pending/overdue status'
                        : 'Expense invoices with pending/overdue status'}
                </Text>
            </View>

            {!hasAny && (
                <View style={styles.emptyCard}>
                    <Text style={styles.emptyTitle}>All Clear</Text>
                    <Text style={styles.emptyText}>
                        No outstanding {activeTab === 'ar' ? 'receivables' : 'payables'}.{'\n'}
                        Set a transaction status to "Pending" or "Overdue" with a due date to track it here.
                    </Text>
                </View>
            )}

            {/* Aging Buckets */}
            {buckets.map((bucket, i) => {
                if (bucket.transactions.length === 0) return null;
                const bucketColor = i === 0 ? Colors.income : i === 1 ? Colors.warning : Colors.expense;
                return (
                    <View key={bucket.label} style={[styles.bucketCard, { borderLeftColor: bucketColor }]}>
                        <View style={styles.bucketHeader}>
                            <Text style={[styles.bucketLabel, { color: bucketColor }]}>{bucket.label}</Text>
                            <Text style={[styles.bucketTotal, { color: bucketColor }]}>
                                {currency}{bucket.total.toLocaleString()}
                            </Text>
                        </View>

                        {bucket.transactions.map((tx: Transaction) => (
                            <View key={tx.id} style={styles.txRow}>
                                <View style={styles.txInfo}>
                                    <Text style={styles.txDesc} numberOfLines={1}>{tx.description}</Text>
                                    <View style={styles.txMeta}>
                                        {tx.vendorCustomer ? <Text style={styles.metaText}>{tx.vendorCustomer}</Text> : null}
                                        {tx.dueDate ? <Text style={styles.metaText}>Due: {tx.dueDate}</Text> : null}
                                        {tx.reference ? <Text style={styles.metaText}>#{tx.reference}</Text> : null}
                                        <View style={[styles.statusDot, { backgroundColor: tx.status === 'overdue' ? Colors.expense : Colors.warning }]} />
                                        <Text style={[styles.statusText, { color: tx.status === 'overdue' ? Colors.expense : Colors.warning }]}>
                                            {tx.status}
                                        </Text>
                                    </View>
                                </View>
                                <View style={styles.txRight}>
                                    <Text style={[styles.txAmount, { color: activeTab === 'ar' ? Colors.income : Colors.expense }]}>
                                        {currency}{tx.amount.toLocaleString()}
                                    </Text>
                                    <TouchableOpacity style={styles.markPaidBtn} onPress={() => markPaid(tx.id)}>
                                        <Text style={styles.markPaidText}>Mark Paid</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))}
                    </View>
                );
            })}

            {/* Aging Summary Bar */}
            {hasAny && (
                <View style={styles.summaryBar}>
                    <Text style={styles.summaryBarTitle}>Aging Breakdown</Text>
                    {buckets.map((b, i) => {
                        const pct = totalOutstanding > 0 ? (b.total / totalOutstanding) * 100 : 0;
                        const barColor = i === 0 ? Colors.income : i === 1 ? Colors.warning : Colors.expense;
                        return (
                            <View key={b.label} style={styles.barRow}>
                                <Text style={styles.barLabel}>{b.label}</Text>
                                <View style={styles.barTrack}>
                                    <View style={[styles.barFill, { width: `${pct}%` as any, backgroundColor: barColor }]} />
                                </View>
                                <Text style={[styles.barPct, { color: barColor }]}>{pct.toFixed(0)}%</Text>
                            </View>
                        );
                    })}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    tabRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    tab: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 8, borderWidth: 1, borderColor: Colors.border },
    tabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    tabText: { color: Colors.textMuted, fontSize: 12, fontWeight: '500', textAlign: 'center' },
    tabTextActive: { color: Colors.textPrimary, fontWeight: 'bold' },
    summaryCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12, alignItems: 'center' },
    summaryTitle: { fontSize: 13, color: Colors.textMuted, marginBottom: 6 },
    summaryAmount: { fontSize: 28, fontWeight: 'bold', marginBottom: 4 },
    summaryHint: { fontSize: 11, color: Colors.textMuted, textAlign: 'center' },
    emptyCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 24, alignItems: 'center', marginBottom: 12 },
    emptyTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.income, marginBottom: 8 },
    emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
    bucketCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 12, borderLeftWidth: 4 },
    bucketHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    bucketLabel: { fontSize: 13, fontWeight: 'bold' },
    bucketTotal: { fontSize: 15, fontWeight: 'bold' },
    txRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.border },
    txInfo: { flex: 1, marginRight: 8 },
    txDesc: { fontSize: 13, color: Colors.textPrimary, fontWeight: '500', marginBottom: 4 },
    txMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
    metaText: { fontSize: 11, color: Colors.textMuted },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    statusText: { fontSize: 11, fontWeight: '600' },
    txRight: { alignItems: 'flex-end', gap: 6 },
    txAmount: { fontSize: 14, fontWeight: 'bold' },
    markPaidBtn: { paddingHorizontal: 8, paddingVertical: 3, backgroundColor: 'rgba(16,185,129,0.15)', borderRadius: 6 },
    markPaidText: { fontSize: 11, color: Colors.income, fontWeight: '600' },
    summaryBar: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12 },
    summaryBarTitle: { fontSize: 14, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 12 },
    barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
    barLabel: { fontSize: 11, color: Colors.textMuted, width: 100 },
    barTrack: { flex: 1, height: 8, backgroundColor: Colors.bg, borderRadius: 4, overflow: 'hidden' },
    barFill: { height: 8, borderRadius: 4 },
    barPct: { fontSize: 11, fontWeight: '600', width: 32, textAlign: 'right' },
});
