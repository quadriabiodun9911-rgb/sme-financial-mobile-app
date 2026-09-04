import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { Radius, Shadow } from '../theme/tokens';
import { Transaction } from '../types';
import { computeInventorySalesTrend, InventorySalesGrouping, InventorySalesTrendPoint } from '../utils/inventorySalesTrend';
import { isoWeekKey } from '../utils/trendAnalysis';
import { StatementCard } from './FormalStatement';
import PeriodTrendTable, { PeriodTrendRow } from './PeriodTrendTable';
import { localDateStr } from '../utils/localDate';

interface Props {
    businessName: string;
    transactions: Transaction[];
    currency: string;
}

const GROUPINGS: { key: InventorySalesGrouping; label: string }[] = [
    { key: 'daily', label: 'Daily' },
    { key: 'weekly', label: 'Weekly' },
    { key: 'monthly', label: 'Monthly' },
    { key: 'quarterly', label: 'Quarterly' },
    { key: 'yearly', label: 'Yearly' },
];

const PERIOD_NOUN: Record<InventorySalesGrouping, string> = { daily: 'day', weekly: 'week', monthly: 'month', quarterly: 'quarter', yearly: 'year' };

// Stock quantity has no dated history in this app, so "stock value over
// time" can't be shown honestly (see inventorySalesTrend.ts). What's here
// instead: sales actually recorded through the Sell button, which ARE
// dated facts — a genuinely new slice of revenue, not a repeat of P&L.
export default function StockSalesComparisonTable({ businessName, transactions, currency }: Props) {
    const [grouping, setGrouping] = useState<InventorySalesGrouping>('monthly');
    const points = useMemo(() => computeInventorySalesTrend(grouping, transactions), [grouping, transactions]);

    const currentKey = useMemo(() => {
        const todayISO = localDateStr();
        if (grouping === 'daily') return todayISO;
        if (grouping === 'weekly') return isoWeekKey(todayISO);
        if (grouping === 'monthly') return todayISO.slice(0, 7);
        if (grouping === 'quarterly') return `${todayISO.slice(0, 4)}-Q${Math.ceil(Number(todayISO.slice(5, 7)) / 3)}`;
        return todayISO.slice(0, 4);
    }, [grouping]);

    const fmt = (n: number) => `${n < 0 ? '-' : ''}${currency}${Math.round(Math.abs(n)).toLocaleString()}`;
    const pointByKey = useMemo(() => new Map(points.map(p => [p.key, p] as [string, InventorySalesTrendPoint])), [points]);

    const hasAnyStockSales = points.some(p => p.stockSold > 0);

    if (points.length === 0) {
        return (
            <View style={s.empty}>
                <Text style={s.emptyText}>No transactions yet — once you record sales, they'll build up here.</Text>
            </View>
        );
    }

    const hasPartial = points.some(p => p.key === currentKey);
    const columns = points.map(p => ({ key: p.key, label: `${p.label}${p.key === currentKey ? ' *' : ''}` }));
    const rows: PeriodTrendRow[] = [
        { key: 'stockSold', label: 'Inventory Sold', getValue: k => fmt(pointByKey.get(k)!.stockSold), getColor: () => Colors.income },
        { key: 'cogs', label: 'Cost of Goods Sold', getValue: k => fmt(pointByKey.get(k)!.costOfGoodsSold), getColor: () => Colors.expense },
        {
            key: 'grossProfit', label: 'Gross Profit', bold: true, topBorder: true,
            getValue: k => fmt(pointByKey.get(k)!.grossProfit),
            getColor: k => pointByKey.get(k)!.grossProfit >= 0 ? Colors.income : Colors.expense,
        },
        { key: 'grossMargin', label: 'Gross Margin', muted: true, getValue: k => `${pointByKey.get(k)!.grossMarginPct.toFixed(0)}%` },
        { key: 'pctOfRevenue', label: '% of Total Revenue', muted: true, noBottomBorder: true, getValue: k => `${pointByKey.get(k)!.pctOfRevenue.toFixed(0)}%` },
    ];

    return (
        <StatementCard
            businessName={businessName}
            title="Inventory Sales Trend"
            subtitle={`${GROUPINGS.find(g => g.key === grouping)!.label} Breakdown, All Recorded History`}
        >
            <View style={s.toggleRow}>
                {GROUPINGS.map(g => (
                    <TouchableOpacity key={g.key} style={[s.toggleBtn, grouping === g.key && s.toggleBtnActive]} onPress={() => setGrouping(g.key)}>
                        <Text style={[s.toggleText, grouping === g.key && s.toggleTextActive]}>{g.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {!hasAnyStockSales && (
                <Text style={[s.emptyText, { marginBottom: 10 }]}>
                    No sales recorded through Inventory's "Sell" button yet — use it when you sell stock to start tracking this.
                </Text>
            )}

            <PeriodTrendTable columns={columns} rows={rows} labelColumnWidth={140} columnWidth={98} scrollDep={grouping} />

            <Text style={s.hint}>Only sales recorded through Inventory's Sell button — revenue logged any other way isn't counted here.</Text>
            <Text style={s.hint}>Cost of Goods Sold is only tracked for sales recorded after this feature was added — earlier sales show as {currency}0 cost, understating Gross Profit for periods that include them.</Text>
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

    empty: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: 20, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },

    hint: { fontSize: 11, color: Colors.textMuted, marginTop: 6, textAlign: 'center' },
});
