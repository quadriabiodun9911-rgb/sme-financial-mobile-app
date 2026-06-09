import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Transaction } from '../types';
import { Colors } from '../theme/colors';
import { computeMonthlyTrend } from '../utils/finance';

interface Props {
    transactions: Transaction[];
    currency: string;
}

type CfView = 'summary' | 'monthly';

export default function CashFlowStatement({ transactions, currency }: Props) {
    const [view, setView] = useState<CfView>('summary');

    // ── Operating activities ─────────────────────────────────────────────
    const operating = useMemo(() => {
        const cashInflows = transactions
            .filter(t => t.type === 'income' && t.status !== 'pending' && t.status !== 'overdue')
            .reduce((s, t) => s + t.amount, 0);

        const cashOutflows = transactions
            .filter(t => t.type === 'expense' && t.status !== 'pending' && t.status !== 'overdue')
            .reduce((s, t) => s + t.amount, 0);

        const pendingAR = transactions
            .filter(t => t.type === 'income' && (t.status === 'pending' || t.status === 'overdue'))
            .reduce((s, t) => s + t.amount, 0);

        const pendingAP = transactions
            .filter(t => t.type === 'expense' && (t.status === 'pending' || t.status === 'overdue'))
            .reduce((s, t) => s + t.amount, 0);

        return { cashInflows, cashOutflows, pendingAR, pendingAP, net: cashInflows - cashOutflows };
    }, [transactions]);

    // ── Monthly trend ────────────────────────────────────────────────────
    const trend = useMemo(() => computeMonthlyTrend(transactions, 6), [transactions]);

    const maxAbsProfit = Math.max(...trend.map(p => Math.abs(p.profit)), 1);

    return (
        <View>
            {/* Toggle */}
            <View style={styles.toggle}>
                <TouchableOpacity
                    style={[styles.toggleBtn, view === 'summary' && styles.toggleActive]}
                    onPress={() => setView('summary')}
                >
                    <Text style={[styles.toggleText, view === 'summary' && styles.toggleTextActive]}>Summary</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.toggleBtn, view === 'monthly' && styles.toggleActive]}
                    onPress={() => setView('monthly')}
                >
                    <Text style={[styles.toggleText, view === 'monthly' && styles.toggleTextActive]}>Monthly</Text>
                </TouchableOpacity>
            </View>

            {view === 'summary' && (
                <View>
                    {/* Operating activities */}
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Operating Cash Flow</Text>
                        <Row label="Cash inflows (collected)"       value={operating.cashInflows} currency={currency} positive />
                        <Row label="Cash outflows (paid)"           value={-operating.cashOutflows} currency={currency} />
                        <Row label="Net operating cash flow"        value={operating.net} currency={currency} total />
                    </View>

                    {/* Working capital */}
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Working Capital</Text>
                        <Row label="Uncollected receivables (AR)"   value={operating.pendingAR} currency={currency} positive />
                        <Row label="Unpaid payables (AP)"           value={-operating.pendingAP} currency={currency} />
                        <Row label="Net working capital position"   value={operating.pendingAR - operating.pendingAP} currency={currency} total />
                        <Text style={styles.hint}>
                            Collecting outstanding AR would add {currency}{operating.pendingAR.toLocaleString()} to cash.
                        </Text>
                    </View>

                    {/* Net position */}
                    <View style={[styles.card, styles.netCard]}>
                        <Text style={styles.netLabel}>Total Net Cash Position</Text>
                        <Text style={[styles.netValue, { color: operating.net >= 0 ? Colors.income : Colors.expense }]}>
                            {operating.net >= 0 ? '+' : ''}{currency}{operating.net.toLocaleString()}
                        </Text>
                        <Text style={styles.hint}>Based on {transactions.length} transactions</Text>
                    </View>
                </View>
            )}

            {view === 'monthly' && (
                <View>
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Monthly Net Cash Flow</Text>
                        {trend.map((pt, i) => {
                            const barW = Math.round((Math.abs(pt.profit) / maxAbsProfit) * 100);
                            const isPositive = pt.profit >= 0;
                            return (
                                <View key={i} style={styles.monthRow}>
                                    <Text style={styles.monthLabel}>{pt.label}</Text>
                                    <View style={styles.barTrack}>
                                        <View style={[
                                            styles.barFill,
                                            { width: `${barW}%` as any, backgroundColor: isPositive ? Colors.income : Colors.expense }
                                        ]} />
                                    </View>
                                    <Text style={[styles.monthVal, { color: isPositive ? Colors.income : Colors.expense }]}>
                                        {isPositive ? '+' : ''}{currency}{Math.abs(pt.profit).toLocaleString()}
                                    </Text>
                                </View>
                            );
                        })}
                    </View>

                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Monthly Breakdown</Text>
                        {trend.map((pt, i) => (
                            <View key={i} style={styles.breakdownRow}>
                                <Text style={styles.monthLabel}>{pt.label}</Text>
                                <Text style={[styles.smallVal, { color: Colors.income }]}>
                                    +{currency}{pt.income.toLocaleString()}
                                </Text>
                                <Text style={[styles.smallVal, { color: Colors.expense }]}>
                                    -{currency}{pt.expense.toLocaleString()}
                                </Text>
                            </View>
                        ))}
                    </View>
                </View>
            )}
        </View>
    );
}

function Row({
    label, value, currency, positive = false, total = false,
}: { label: string; value: number; currency: string; positive?: boolean; total?: boolean }) {
    const color = value >= 0 ? Colors.income : Colors.expense;
    return (
        <View style={[rowStyles.row, total && rowStyles.totalRow]}>
            <Text style={[rowStyles.label, total && rowStyles.totalLabel]}>{label}</Text>
            <Text style={[rowStyles.value, { color: total ? color : value >= 0 ? Colors.income : Colors.expense }, total && rowStyles.totalValue]}>
                {value >= 0 ? '+' : ''}{currency}{Math.abs(value).toLocaleString()}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    toggle: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    toggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 8, borderWidth: 1, borderColor: Colors.border },
    toggleActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    toggleText: { color: Colors.textMuted, fontSize: 13, fontWeight: '500' },
    toggleTextActive: { color: Colors.textPrimary, fontWeight: 'bold' },

    card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12 },
    cardTitle: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 10 },
    netCard: { alignItems: 'center', paddingVertical: 20 },
    netLabel: { fontSize: 13, color: Colors.textMuted, marginBottom: 6 },
    netValue: { fontSize: 30, fontWeight: 'bold', marginBottom: 4 },
    hint: { fontSize: 11, color: Colors.textMuted, marginTop: 8, fontStyle: 'italic' },

    monthRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
    monthLabel: { fontSize: 12, color: Colors.textMuted, width: 30 },
    barTrack: { flex: 1, height: 8, backgroundColor: Colors.bg, borderRadius: 4, overflow: 'hidden' },
    barFill: { height: 8, borderRadius: 4, minWidth: 2 },
    monthVal: { fontSize: 12, fontWeight: '600', width: 80, textAlign: 'right' },

    breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
    smallVal: { fontSize: 12, fontWeight: '500', flex: 1, textAlign: 'right' },
});

const rowStyles = StyleSheet.create({
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: Colors.border },
    totalRow: { marginTop: 6, borderBottomWidth: 0, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 },
    label: { fontSize: 13, color: Colors.textSecondary, flex: 1, marginRight: 8 },
    totalLabel: { fontWeight: '700', color: Colors.textPrimary },
    value: { fontSize: 13, fontWeight: '600' },
    totalValue: { fontSize: 15, fontWeight: 'bold' },
});
