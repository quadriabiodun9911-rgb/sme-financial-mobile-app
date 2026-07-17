import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { Transaction } from '../types';
import { computeMonthlyTrend, computeQuarterlyTrend, computeYearlyTrend } from '../utils/trendAnalysis';

interface Props {
    transactions: Transaction[];
    currency: string;
}

type Grouping = 'monthly' | 'quarterly' | 'yearly';

const MONTH_LABEL = (m: string) => {
    const [y, mo] = m.split('-');
    return new Date(Number(y), Number(mo) - 1, 1).toLocaleString('default', { month: 'short' }) + ` '${y.slice(2)}`;
};

// Every row is a real financial-statement line, not a made-up metric —
// Revenue, Expenses, Profit and Margin are exactly what a Jan-Dec
// comparison is for: spotting a bad month or a seasonal pattern that a
// single "This Month" snapshot can never show on its own.
export default function PeriodComparisonTable({ transactions, currency }: Props) {
    const [grouping, setGrouping] = useState<Grouping>('monthly');

    const monthly = useMemo(() => computeMonthlyTrend(transactions), [transactions]);
    const quarterly = useMemo(() => computeQuarterlyTrend(monthly), [monthly]);
    const yearly = useMemo(() => computeYearlyTrend(monthly), [monthly]);

    const columns = useMemo(() => {
        if (grouping === 'monthly') {
            return monthly.map(m => ({ key: m.month, label: MONTH_LABEL(m.month), revenue: m.revenue, expense: m.expense, profit: m.profit, margin: m.profitMargin }));
        }
        if (grouping === 'quarterly') {
            return quarterly.map(q => ({ key: q.quarter, label: q.label, revenue: q.revenue, expense: q.expense, profit: q.profit, margin: q.profitMargin }));
        }
        return yearly.map(y => ({ key: y.year, label: y.year, revenue: y.revenue, expense: y.expense, profit: y.profit, margin: y.profitMargin }));
    }, [grouping, monthly, quarterly, yearly]);

    const fmt = (n: number) => `${currency}${Math.round(n).toLocaleString()}`;

    if (columns.length === 0) {
        return (
            <View style={s.empty}>
                <Text style={s.emptyText}>No transactions yet — once you have some, they'll line up here month by month.</Text>
            </View>
        );
    }

    return (
        <View style={s.card}>
            <Text style={s.title}>Period Comparison</Text>
            <View style={s.toggleRow}>
                {(['monthly', 'quarterly', 'yearly'] as Grouping[]).map(g => (
                    <TouchableOpacity key={g} style={[s.toggleBtn, grouping === g && s.toggleBtnActive]} onPress={() => setGrouping(g)}>
                        <Text style={[s.toggleText, grouping === g && s.toggleTextActive]}>
                            {g === 'monthly' ? 'Monthly' : g === 'quarterly' ? 'Quarterly' : 'Yearly'}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                <View>
                    {/* Column headers */}
                    <View style={s.row}>
                        <View style={[s.cell, s.rowLabelCell]}><Text style={s.rowLabelHeader}></Text></View>
                        {columns.map(c => (
                            <View key={c.key} style={s.cell}><Text style={s.colHeader}>{c.label}</Text></View>
                        ))}
                    </View>

                    {/* Revenue */}
                    <View style={s.row}>
                        <View style={[s.cell, s.rowLabelCell]}><Text style={s.rowLabel}>Revenue</Text></View>
                        {columns.map(c => (
                            <View key={c.key} style={s.cell}><Text style={[s.val, { color: Colors.income }]}>{fmt(c.revenue)}</Text></View>
                        ))}
                    </View>

                    {/* Expenses */}
                    <View style={s.row}>
                        <View style={[s.cell, s.rowLabelCell]}><Text style={s.rowLabel}>Expenses</Text></View>
                        {columns.map(c => (
                            <View key={c.key} style={s.cell}><Text style={[s.val, { color: Colors.expense }]}>{fmt(c.expense)}</Text></View>
                        ))}
                    </View>

                    {/* Profit */}
                    <View style={s.row}>
                        <View style={[s.cell, s.rowLabelCell]}><Text style={[s.rowLabel, { fontWeight: '700' }]}>Profit</Text></View>
                        {columns.map(c => (
                            <View key={c.key} style={s.cell}>
                                <Text style={[s.val, { fontWeight: '700', color: c.profit >= 0 ? Colors.income : Colors.expense }]}>{fmt(c.profit)}</Text>
                            </View>
                        ))}
                    </View>

                    {/* Margin */}
                    <View style={[s.row, { borderBottomWidth: 0 }]}>
                        <View style={[s.cell, s.rowLabelCell]}><Text style={s.rowLabel}>Margin</Text></View>
                        {columns.map(c => (
                            <View key={c.key} style={s.cell}><Text style={s.valMuted}>{c.margin.toFixed(0)}%</Text></View>
                        ))}
                    </View>
                </View>
            </ScrollView>
            <Text style={s.hint}>Scroll sideways to see every {grouping === 'monthly' ? 'month' : grouping === 'quarterly' ? 'quarter' : 'year'} you have data for.</Text>
        </View>
    );
}

const s = StyleSheet.create({
    card: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 14 },
    title: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, marginBottom: 10 },
    toggleRow: { flexDirection: 'row', backgroundColor: Colors.bg, borderRadius: 9, padding: 3, marginBottom: 14, alignSelf: 'flex-start' },
    toggleBtn: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 7 },
    toggleBtnActive: { backgroundColor: Colors.primary },
    toggleText: { fontSize: 11.5, fontWeight: '700', color: Colors.textMuted },
    toggleTextActive: { color: '#fff' },

    row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border },
    cell: { width: 92, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'flex-end', justifyContent: 'center' },
    rowLabelCell: { width: 84, alignItems: 'flex-start' },
    rowLabelHeader: { fontSize: 10 },
    rowLabel: { fontSize: 12.5, color: Colors.textSecondary },
    colHeader: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase' },
    val: { fontSize: 12.5, color: Colors.textPrimary, fontVariant: ['tabular-nums'] },
    valMuted: { fontSize: 12.5, color: Colors.textMuted, fontVariant: ['tabular-nums'] },

    empty: { backgroundColor: Colors.surface, borderRadius: 14, padding: 20 },
    emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },

    hint: { fontSize: 11, color: Colors.textMuted, marginTop: 10, textAlign: 'center' },
});
