import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { Transaction } from '../types';
import { computeDailyTrend, computeWeeklyTrend, computeMonthlyTrend, computeQuarterlyTrend, computeYearlyTrend, isoWeekKey } from '../utils/trendAnalysis';

interface Props {
    transactions: Transaction[];
    currency: string;
    // Screens that only care about short-term pace (Transactions, Inventory)
    // can skip straight to Daily/Weekly instead of defaulting to Monthly.
    defaultGrouping?: Grouping;
}

export type Grouping = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

const GROUPINGS: { key: Grouping; label: string }[] = [
    { key: 'daily', label: 'Daily' },
    { key: 'weekly', label: 'Weekly' },
    { key: 'monthly', label: 'Monthly' },
    { key: 'quarterly', label: 'Quarterly' },
    { key: 'yearly', label: 'Yearly' },
];

const MONTH_LABEL = (m: string) => {
    const [y, mo] = m.split('-');
    return new Date(Number(y), Number(mo) - 1, 1).toLocaleString('default', { month: 'short' }) + ` '${y.slice(2)}`;
};

const DAY_LABEL = (d: string) => {
    const [y, mo, day] = d.split('-').map(Number);
    return new Date(y, mo - 1, day).toLocaleString('default', { month: 'short', day: 'numeric' });
};

// Every row is a real financial-statement line, not a made-up metric —
// Revenue, Expenses, Profit and Margin are exactly what a Jan-Dec
// comparison is for: spotting a bad month or a seasonal pattern that a
// single "This Month" snapshot can never show on its own.
export default function PeriodComparisonTable({ transactions, currency, defaultGrouping = 'monthly' }: Props) {
    const [grouping, setGrouping] = useState<Grouping>(defaultGrouping);

    const daily = useMemo(() => computeDailyTrend(transactions), [transactions]);
    const weekly = useMemo(() => computeWeeklyTrend(daily), [daily]);
    const monthly = useMemo(() => computeMonthlyTrend(transactions), [transactions]);
    const quarterly = useMemo(() => computeQuarterlyTrend(monthly), [monthly]);
    const yearly = useMemo(() => computeYearlyTrend(monthly), [monthly]);

    // The most recent bucket is often still "in progress" (today, this week,
    // this month/quarter/year) — flag it so a naturally-lower number doesn't
    // read as a real decline against a fully-elapsed prior period.
    const currentKeys = useMemo(() => {
        const todayISO = new Date().toISOString().slice(0, 10);
        const month = todayISO.slice(5, 7);
        return {
            daily: todayISO,
            weekly: isoWeekKey(todayISO),
            monthly: todayISO.slice(0, 7),
            quarterly: `${todayISO.slice(0, 4)}-Q${Math.ceil(Number(month) / 3)}`,
            yearly: todayISO.slice(0, 4),
        };
    }, []);

    const columns = useMemo(() => {
        if (grouping === 'daily') {
            return daily.map(d => ({ key: d.date, label: DAY_LABEL(d.date), revenue: d.revenue, expense: d.expense, profit: d.profit, margin: d.profitMargin, partial: d.date === currentKeys.daily }));
        }
        if (grouping === 'weekly') {
            return weekly.map(w => ({ key: w.week, label: w.label, revenue: w.revenue, expense: w.expense, profit: w.profit, margin: w.profitMargin, partial: w.week === currentKeys.weekly }));
        }
        if (grouping === 'monthly') {
            return monthly.map(m => ({ key: m.month, label: MONTH_LABEL(m.month), revenue: m.revenue, expense: m.expense, profit: m.profit, margin: m.profitMargin, partial: m.month === currentKeys.monthly }));
        }
        if (grouping === 'quarterly') {
            return quarterly.map(q => ({ key: q.quarter, label: q.label, revenue: q.revenue, expense: q.expense, profit: q.profit, margin: q.profitMargin, partial: q.quarter === currentKeys.quarterly }));
        }
        return yearly.map(y => ({ key: y.year, label: y.year, revenue: y.revenue, expense: y.expense, profit: y.profit, margin: y.profitMargin, partial: y.year === currentKeys.yearly }));
    }, [grouping, daily, weekly, monthly, quarterly, yearly, currentKeys]);

    const hasPartial = columns.some(c => c.partial);

    const fmt = (n: number) => `${n < 0 ? '-' : ''}${currency}${Math.round(Math.abs(n)).toLocaleString()}`;

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
                {GROUPINGS.map(g => (
                    <TouchableOpacity key={g.key} style={[s.toggleBtn, grouping === g.key && s.toggleBtnActive]} onPress={() => setGrouping(g.key)}>
                        <Text style={[s.toggleText, grouping === g.key && s.toggleTextActive]}>{g.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                <View>
                    {/* Column headers */}
                    <View style={s.row}>
                        <View style={[s.cell, s.rowLabelCell]}><Text style={s.rowLabelHeader}></Text></View>
                        {columns.map(c => (
                            <View key={c.key} style={s.cell}><Text style={s.colHeader}>{c.label}{c.partial ? ' *' : ''}</Text></View>
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
            <Text style={s.hint}>Scroll sideways to see every {grouping === 'daily' ? 'day' : grouping === 'weekly' ? 'week' : grouping === 'monthly' ? 'month' : grouping === 'quarterly' ? 'quarter' : 'year'} you have data for.</Text>
            {hasPartial && (
                <Text style={s.hint}>* still in progress — not a full {grouping === 'daily' ? 'day' : grouping === 'weekly' ? 'week' : grouping === 'monthly' ? 'month' : grouping === 'quarterly' ? 'quarter' : 'year'} yet, so it's not a fair comparison against earlier columns.</Text>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    card: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 14 },
    title: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, marginBottom: 10 },
    toggleRow: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: Colors.bg, borderRadius: 9, padding: 3, marginBottom: 14, alignSelf: 'flex-start', gap: 2 },
    toggleBtn: { paddingVertical: 6, paddingHorizontal: 11, borderRadius: 7 },
    toggleBtnActive: { backgroundColor: Colors.primary },
    toggleText: { fontSize: 11.5, fontWeight: '700', color: Colors.textMuted },
    toggleTextActive: { color: '#fff' },

    row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border },
    cell: { width: 98, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'flex-end', justifyContent: 'center' },
    rowLabelCell: { width: 84, alignItems: 'flex-start' },
    rowLabelHeader: { fontSize: 10 },
    rowLabel: { fontSize: 12.5, color: Colors.textSecondary },
    colHeader: { fontSize: 10.5, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', textAlign: 'right' },
    val: { fontSize: 12.5, color: Colors.textPrimary, fontVariant: ['tabular-nums'] },
    valMuted: { fontSize: 12.5, color: Colors.textMuted, fontVariant: ['tabular-nums'] },

    empty: { backgroundColor: Colors.surface, borderRadius: 14, padding: 20 },
    emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },

    hint: { fontSize: 11, color: Colors.textMuted, marginTop: 10, textAlign: 'center' },
});
