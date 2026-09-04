import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { Radius, Shadow } from '../theme/tokens';
import { Transaction } from '../types';
import { computeTaxTrend, TaxPeriodGrouping, TaxTrendPoint } from '../utils/taxTrend';
import PeriodTrendTable, { PeriodTrendRow } from './PeriodTrendTable';
import { localDateStr } from '../utils/localDate';

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
        const todayISO = localDateStr();
        if (grouping === 'monthly') return todayISO.slice(0, 7);
        if (grouping === 'quarterly') return `${todayISO.slice(0, 4)}-Q${Math.ceil(Number(todayISO.slice(5, 7)) / 3)}`;
        return todayISO.slice(0, 4);
    }, [grouping]);

    const fmt = (n: number) => `${n < 0 ? '-' : ''}${currency}${Math.round(Math.abs(n)).toLocaleString()}`;
    const pointByKey = useMemo(() => new Map(points.map(p => [p.key, p] as [string, TaxTrendPoint])), [points]);

    if (points.length === 0) {
        return (
            <View style={s.empty}>
                <Text style={s.emptyText}>No tax data yet — add a Tax Rate (%) when logging transactions to see this build up over time.</Text>
            </View>
        );
    }

    const hasPartial = points.some(p => p.key === currentKey);
    const columns = points.map(p => ({ key: p.key, label: `${p.label}${p.key === currentKey ? ' *' : ''}` }));
    const rows: PeriodTrendRow[] = [
        { key: 'taxCollected', label: 'Tax Collected', getValue: k => fmt(pointByKey.get(k)!.taxCollected), getColor: () => Colors.income },
        { key: 'taxPaid', label: 'Tax Paid', getValue: k => fmt(pointByKey.get(k)!.taxPaid), getColor: () => Colors.expense },
        {
            key: 'netTaxPosition', label: 'Net Tax Position', bold: true, noBottomBorder: true,
            getValue: k => fmt(pointByKey.get(k)!.netTaxPosition),
            getColor: k => pointByKey.get(k)!.netTaxPosition >= 0 ? Colors.income : Colors.expense,
        },
    ];

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

            <PeriodTrendTable columns={columns} rows={rows} labelColumnWidth={140} columnWidth={98} scrollDep={grouping} />

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

    empty: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: 20, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },

    hint: { fontSize: 11, color: Colors.textMuted, marginTop: 6, textAlign: 'center' },
});
