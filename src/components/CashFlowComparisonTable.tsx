import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { Transaction } from '../types';
import { computeCashFlowTrend, CashFlowPeriodGrouping, CashFlowTrendPoint } from '../utils/cashFlowTrend';
import { isoWeekKey } from '../utils/trendAnalysis';
import { StatementCard } from './FormalStatement';
import PeriodTrendTable, { PeriodTrendRow } from './PeriodTrendTable';

interface Props {
    businessName: string;
    transactions: Transaction[];
    currency: string;
}

const GROUPINGS: { key: CashFlowPeriodGrouping; label: string }[] = [
    { key: 'daily', label: 'Daily' },
    { key: 'weekly', label: 'Weekly' },
    { key: 'monthly', label: 'Monthly' },
    { key: 'quarterly', label: 'Quarterly' },
    { key: 'yearly', label: 'Yearly' },
];

const PERIOD_NOUN: Record<CashFlowPeriodGrouping, string> = { daily: 'day', weekly: 'week', monthly: 'month', quarterly: 'quarter', yearly: 'year' };

export default function CashFlowComparisonTable({ businessName, transactions, currency }: Props) {
    const [grouping, setGrouping] = useState<CashFlowPeriodGrouping>('monthly');
    const points = useMemo(() => computeCashFlowTrend(grouping, transactions), [grouping, transactions]);

    const currentKey = useMemo(() => {
        const todayISO = new Date().toISOString().slice(0, 10);
        if (grouping === 'daily') return todayISO;
        if (grouping === 'weekly') return isoWeekKey(todayISO);
        if (grouping === 'monthly') return todayISO.slice(0, 7);
        if (grouping === 'quarterly') return `${todayISO.slice(0, 4)}-Q${Math.ceil(Number(todayISO.slice(5, 7)) / 3)}`;
        return todayISO.slice(0, 4);
    }, [grouping]);

    const fmt = (n: number) => `${n < 0 ? '-' : ''}${currency}${Math.round(Math.abs(n)).toLocaleString()}`;
    const pointByKey = useMemo(() => new Map(points.map(p => [p.key, p] as [string, CashFlowTrendPoint])), [points]);

    if (points.length === 0) {
        return (
            <View style={s.empty}>
                <Text style={s.emptyText}>No paid transactions yet — once money actually moves in or out, it'll build up here.</Text>
            </View>
        );
    }

    const hasPartial = points.some(p => p.key === currentKey);
    const columns = points.map(p => ({ key: p.key, label: `${p.label}${p.key === currentKey ? ' *' : ''}` }));

    const rows: PeriodTrendRow[] = [
        { key: 'cashIn', label: 'Cash Receipts', getValue: k => fmt(pointByKey.get(k)!.cashIn), getColor: () => Colors.income },
        { key: 'cashOut', label: 'Cash Disbursements', getValue: k => fmt(pointByKey.get(k)!.cashOut), getColor: () => Colors.expense },
        // Same three activities the formal Statement of Cash Flows breaks
        // out (Operating/Investing/Financing), so this trend answers not
        // just "how much went out" but "was it running the business,
        // buying equipment, or paying down debt" -- indented under
        // Disbursements since they sum to it.
        { key: 'operatingOut', label: 'Operating', indent: true, muted: true, getValue: k => fmt(pointByKey.get(k)!.operatingOut) },
        { key: 'investingOut', label: 'Investing', indent: true, muted: true, getValue: k => fmt(pointByKey.get(k)!.investingOut) },
        { key: 'financingOut', label: 'Financing', indent: true, muted: true, getValue: k => fmt(pointByKey.get(k)!.financingOut) },
        {
            key: 'netCashFlow', label: 'Net Cash Flow', bold: true, doubleTopBorder: true, noBottomBorder: true,
            getValue: k => fmt(pointByKey.get(k)!.netCashFlow),
            getColor: k => pointByKey.get(k)!.netCashFlow >= 0 ? Colors.income : Colors.expense,
        },
    ];

    return (
        <StatementCard
            businessName={businessName}
            title="Cash Flow Trend"
            subtitle={`${GROUPINGS.find(g => g.key === grouping)!.label} Breakdown, All Recorded History`}
        >
            <View style={s.toggleRow}>
                {GROUPINGS.map(g => (
                    <TouchableOpacity key={g.key} style={[s.toggleBtn, grouping === g.key && s.toggleBtnActive]} onPress={() => setGrouping(g.key)}>
                        <Text style={[s.toggleText, grouping === g.key && s.toggleTextActive]}>{g.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <PeriodTrendTable columns={columns} rows={rows} labelColumnWidth={120} columnWidth={98} scrollDep={grouping} />

            <Text style={s.hint}>Only money that actually moved (paid transactions), summed within each {PERIOD_NOUN[grouping]} — not a running balance, and not the same as Revenue/Expenses on Profit &amp; Loss, which counts unpaid transactions too.</Text>
            {hasPartial && (
                <Text style={s.hint}>* still in progress — not a full {PERIOD_NOUN[grouping]} yet, so it's not a fair comparison against earlier columns.</Text>
            )}
        </StatementCard>
    );
}

const s = StyleSheet.create({
    toggleRow: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: Colors.bg, borderRadius: 9, padding: 3, marginBottom: 14, alignSelf: 'flex-start', gap: 2 },
    toggleBtn: { paddingVertical: 6, paddingHorizontal: 11, borderRadius: 7 },
    toggleBtnActive: { backgroundColor: Colors.primary },
    toggleText: { fontSize: 11.5, fontWeight: '700', color: Colors.textMuted },
    toggleTextActive: { color: '#fff' },

    empty: { backgroundColor: Colors.surface, borderRadius: 14, padding: 20 },
    emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },

    hint: { fontSize: 11, color: Colors.textMuted, marginTop: 6, textAlign: 'center' },
});
