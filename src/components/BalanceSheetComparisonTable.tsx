import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { Transaction, Asset, Loan } from '../types';
import { computeMonthlyTrend } from '../utils/trendAnalysis';
import { computeBalanceSheetTrend, BalancePeriodGrouping } from '../utils/balanceSheetTrend';

interface Props {
    transactions: Transaction[];
    assets: Asset[];
    loans: Loan[];
    currency: string;
}

const GROUPINGS: { key: BalancePeriodGrouping; label: string }[] = [
    { key: 'monthly', label: 'Monthly' },
    { key: 'quarterly', label: 'Quarterly' },
    { key: 'yearly', label: 'Yearly' },
];

// Every row here is something we can honestly reconstruct for a past date —
// cash (transactions are dated), equipment (depreciation is a function of
// purchase date), loans (each payment is dated). Accounts receivable/payable
// and inventory value are NOT included: this app only tracks their current
// value, not a history of it, so faking a trend for them would be lying
// with numbers.
export default function BalanceSheetComparisonTable({ transactions, assets, loans, currency }: Props) {
    const [grouping, setGrouping] = useState<BalancePeriodGrouping>('monthly');

    const monthly = useMemo(() => computeMonthlyTrend(transactions), [transactions]);
    const monthKeys = useMemo(() => monthly.map(m => m.month), [monthly]);

    const points = useMemo(
        () => computeBalanceSheetTrend(grouping, monthKeys, transactions, assets, loans),
        [grouping, monthKeys, transactions, assets, loans]
    );

    const currentKey = useMemo(() => {
        const todayISO = new Date().toISOString().slice(0, 10);
        if (grouping === 'monthly') return todayISO.slice(0, 7);
        if (grouping === 'quarterly') return `${todayISO.slice(0, 4)}-Q${Math.ceil(Number(todayISO.slice(5, 7)) / 3)}`;
        return todayISO.slice(0, 4);
    }, [grouping]);

    const fmt = (n: number) => `${n < 0 ? '-' : ''}${currency}${Math.round(Math.abs(n)).toLocaleString()}`;

    if (points.length === 0) {
        return (
            <View style={s.empty}>
                <Text style={s.emptyText}>No transactions yet — once you have some, your balance sheet trend will build up here.</Text>
            </View>
        );
    }

    const hasPartial = points.some(p => p.key === currentKey);

    return (
        <View style={s.card}>
            <Text style={s.title}>Balance Sheet Over Time</Text>
            <View style={s.toggleRow}>
                {GROUPINGS.map(g => (
                    <TouchableOpacity key={g.key} style={[s.toggleBtn, grouping === g.key && s.toggleBtnActive]} onPress={() => setGrouping(g.key)}>
                        <Text style={[s.toggleText, grouping === g.key && s.toggleTextActive]}>{g.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                <View>
                    <View style={s.row}>
                        <View style={[s.cell, s.rowLabelCell]}><Text style={s.rowLabelHeader}></Text></View>
                        {points.map(p => (
                            <View key={p.key} style={s.cell}><Text style={s.colHeader}>{p.label}{p.key === currentKey ? ' *' : ''}</Text></View>
                        ))}
                    </View>

                    <View style={s.row}>
                        <View style={[s.cell, s.rowLabelCell]}><Text style={s.rowLabel}>Cash on Hand</Text></View>
                        {points.map(p => (
                            <View key={p.key} style={s.cell}><Text style={[s.val, { color: p.cashOnHand >= 0 ? Colors.income : Colors.expense }]}>{fmt(p.cashOnHand)}</Text></View>
                        ))}
                    </View>

                    <View style={s.row}>
                        <View style={[s.cell, s.rowLabelCell]}><Text style={s.rowLabel}>Equipment Value</Text></View>
                        {points.map(p => (
                            <View key={p.key} style={s.cell}><Text style={[s.val, { color: Colors.asset }]}>{fmt(p.equipmentValue)}</Text></View>
                        ))}
                    </View>

                    <View style={s.row}>
                        <View style={[s.cell, s.rowLabelCell]}><Text style={s.rowLabel}>Loans Outstanding</Text></View>
                        {points.map(p => (
                            <View key={p.key} style={s.cell}><Text style={[s.val, { color: Colors.liability }]}>{fmt(p.loansOutstanding)}</Text></View>
                        ))}
                    </View>

                    <View style={[s.row, { borderBottomWidth: 0 }]}>
                        <View style={[s.cell, s.rowLabelCell]}><Text style={[s.rowLabel, { fontWeight: '700' }]}>Net Position</Text></View>
                        {points.map(p => (
                            <View key={p.key} style={s.cell}>
                                <Text style={[s.val, { fontWeight: '700', color: p.netPosition >= 0 ? Colors.income : Colors.expense }]}>{fmt(p.netPosition)}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            </ScrollView>
            <Text style={s.hint}>Cash + Equipment Value − Loans Outstanding, as of the end of each {grouping === 'monthly' ? 'month' : grouping === 'quarterly' ? 'quarter' : 'year'}.</Text>
            <Text style={s.hint}>Doesn't include money owed to/by you or stock value — this app only tracks their current total, not a history of it.</Text>
            {hasPartial && (
                <Text style={s.hint}>* still in progress — figures are as of today, not a full {grouping === 'monthly' ? 'month' : grouping === 'quarterly' ? 'quarter' : 'year'}.</Text>
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
    cell: { width: 108, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'flex-end', justifyContent: 'center' },
    rowLabelCell: { width: 122, alignItems: 'flex-start' },
    rowLabelHeader: { fontSize: 10 },
    rowLabel: { fontSize: 12.5, color: Colors.textSecondary },
    colHeader: { fontSize: 10.5, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', textAlign: 'right' },
    val: { fontSize: 12.5, color: Colors.textPrimary, fontVariant: ['tabular-nums'] },

    empty: { backgroundColor: Colors.surface, borderRadius: 14, padding: 20 },
    emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },

    hint: { fontSize: 11, color: Colors.textMuted, marginTop: 6, textAlign: 'center' },
});
