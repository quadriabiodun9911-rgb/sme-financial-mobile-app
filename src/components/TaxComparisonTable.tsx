import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { Transaction } from '../types';
import { computeTaxTrend, TaxPeriodGrouping } from '../utils/taxTrend';

interface Props {
    transactions: Transaction[];
    currency: string;
}

const GROUPINGS: { key: TaxPeriodGrouping; label: string }[] = [
    { key: 'monthly', label: 'Monthly' },
    { key: 'quarterly', label: 'Quarterly' },
    { key: 'yearly', label: 'Yearly' },
];

export default function TaxComparisonTable({ transactions, currency }: Props) {
    const [grouping, setGrouping] = useState<TaxPeriodGrouping>('monthly');
    const points = useMemo(() => computeTaxTrend(grouping, transactions), [grouping, transactions]);

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
                <Text style={s.emptyText}>No tax data yet — add a Tax Rate (%) when logging transactions to see this build up over time.</Text>
            </View>
        );
    }

    const hasPartial = points.some(p => p.key === currentKey);

    return (
        <View style={s.card}>
            <Text style={s.title}>Tax Collected vs Paid Over Time</Text>
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
                        <View style={[s.cell, s.rowLabelCell]}><Text style={s.rowLabelHeader}>Breakdown</Text></View>
                        {points.map(p => (
                            <View key={p.key} style={s.cell}><Text style={s.colHeader}>{p.label}{p.key === currentKey ? ' *' : ''}</Text></View>
                        ))}
                    </View>

                    <View style={s.row}>
                        <View style={[s.cell, s.rowLabelCell]}><Text style={s.rowLabel}>Tax Collected</Text></View>
                        {points.map(p => (
                            <View key={p.key} style={s.cell}><Text style={[s.val, { color: Colors.income }]}>{fmt(p.taxCollected)}</Text></View>
                        ))}
                    </View>

                    <View style={s.row}>
                        <View style={[s.cell, s.rowLabelCell]}><Text style={s.rowLabel}>Tax Paid</Text></View>
                        {points.map(p => (
                            <View key={p.key} style={s.cell}><Text style={[s.val, { color: Colors.expense }]}>{fmt(p.taxPaid)}</Text></View>
                        ))}
                    </View>

                    <View style={[s.row, { borderBottomWidth: 0 }]}>
                        <View style={[s.cell, s.rowLabelCell]}><Text style={[s.rowLabel, s.rowLabelBold]}>Net Tax Position</Text></View>
                        {points.map(p => (
                            <View key={p.key} style={s.cell}>
                                <Text style={[s.val, s.valBold, { color: p.netTaxPosition >= 0 ? Colors.income : Colors.expense }]}>{fmt(p.netTaxPosition)}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            </ScrollView>
            <Text style={s.hint}>Tax charged/paid on transactions dated within each {grouping === 'monthly' ? 'month' : grouping === 'quarterly' ? 'quarter' : 'year'}.</Text>
            {hasPartial && (
                <Text style={s.hint}>* still in progress — not a full {grouping === 'monthly' ? 'month' : grouping === 'quarterly' ? 'quarter' : 'year'} yet, so it's not a fair comparison against earlier columns.</Text>
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
    rowLabelCell: { width: 140, alignItems: 'flex-start' },
    rowLabelHeader: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase' },
    rowLabel: { fontSize: 12.5, color: Colors.textSecondary },
    rowLabelBold: { fontWeight: '700', color: Colors.textPrimary },
    colHeader: { fontSize: 10.5, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', textAlign: 'right' },
    val: { fontSize: 12.5, color: Colors.textPrimary, fontVariant: ['tabular-nums'] },
    valBold: { fontWeight: '700' },

    empty: { backgroundColor: Colors.surface, borderRadius: 14, padding: 20 },
    emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },

    hint: { fontSize: 11, color: Colors.textMuted, marginTop: 6, textAlign: 'center' },
});
