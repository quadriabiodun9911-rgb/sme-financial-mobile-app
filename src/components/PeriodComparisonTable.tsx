import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { Radius, Shadow } from '../theme/tokens';
import { Transaction } from '../types';
import { computeDailyTrend, computeWeeklyTrend, computeAllTimeMonthlyBuckets, computeQuarterlyTrend, computeYearlyTrend, isoWeekKey } from '../utils/trendAnalysis';
import { projectionFactor } from '../utils/periodProjection';
import { StatementCard } from './FormalStatement';
import PeriodTrendTable, { PeriodTrendRow } from './PeriodTrendTable';
import { localDateStr } from '../utils/localDate';

interface Props {
    transactions: Transaction[];
    currency: string;
    // Screens that only care about short-term pace (Transactions, Inventory)
    // can skip straight to Daily/Weekly instead of defaulting to Monthly.
    defaultGrouping?: Grouping;
    // Only set from Reports, where this sits alongside the formal statements —
    // it renders as a StatementCard there. Left unset on Inventory's "daily
    // sales pace" widget, which keeps the plain card look.
    businessName?: string;
}

export type Grouping = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

const GROUPINGS: { key: Grouping; label: string }[] = [
    { key: 'daily', label: 'Daily' },
    { key: 'weekly', label: 'Weekly' },
    { key: 'monthly', label: 'Monthly' },
    { key: 'quarterly', label: 'Quarterly' },
    { key: 'yearly', label: 'Yearly' },
];

const PERIOD_NOUN: Record<Grouping, string> = { daily: 'day', weekly: 'week', monthly: 'month', quarterly: 'quarter', yearly: 'year' };

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
// single "This Month" snapshot can never show on its own. The table itself
// is PeriodTrendTable (frozen label column + auto-scroll to the most
// recent period) -- this component only turns the computed period buckets
// into that shared shell's rows/columns.
export default function PeriodComparisonTable({ transactions, currency, defaultGrouping = 'monthly', businessName }: Props) {
    const [grouping, setGrouping] = useState<Grouping>(defaultGrouping);

    const daily = useMemo(() => computeDailyTrend(transactions), [transactions]);
    const weekly = useMemo(() => computeWeeklyTrend(daily), [daily]);
    const monthly = useMemo(() => computeAllTimeMonthlyBuckets(transactions), [transactions]);
    const quarterly = useMemo(() => computeQuarterlyTrend(monthly), [monthly]);
    const yearly = useMemo(() => computeYearlyTrend(monthly), [monthly]);

    // The most recent bucket is often still "in progress" (today, this week,
    // this month/quarter/year) — flag it so a naturally-lower number doesn't
    // read as a real decline against a fully-elapsed prior period.
    const currentKeys = useMemo(() => {
        const todayISO = localDateStr();
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
            return daily.map(d => ({ key: d.date, label: DAY_LABEL(d.date), revenue: d.revenue, expense: d.expense, cogs: d.cogs, opex: d.opex, other: d.otherExpense, profit: d.profit, margin: d.profitMargin, partial: d.date === currentKeys.daily }));
        }
        if (grouping === 'weekly') {
            return weekly.map(w => ({ key: w.week, label: w.label, revenue: w.revenue, expense: w.expense, cogs: w.cogs, opex: w.opex, other: w.otherExpense, profit: w.profit, margin: w.profitMargin, partial: w.week === currentKeys.weekly }));
        }
        if (grouping === 'monthly') {
            return monthly.map(m => ({ key: m.month, label: MONTH_LABEL(m.month), revenue: m.revenue, expense: m.expense, cogs: m.cogs, opex: m.opex, other: m.otherExpense, profit: m.profit, margin: m.profitMargin, partial: m.month === currentKeys.monthly }));
        }
        if (grouping === 'quarterly') {
            return quarterly.map(q => ({ key: q.quarter, label: q.label, revenue: q.revenue, expense: q.expense, cogs: q.cogs, opex: q.opex, other: q.otherExpense, profit: q.profit, margin: q.profitMargin, partial: q.quarter === currentKeys.quarterly }));
        }
        return yearly.map(y => ({ key: y.year, label: y.year, revenue: y.revenue, expense: y.expense, cogs: y.cogs, opex: y.opex, other: y.otherExpense, profit: y.profit, margin: y.profitMargin, partial: y.year === currentKeys.yearly }));
    }, [grouping, daily, weekly, monthly, quarterly, yearly, currentKeys]);

    const hasPartial = columns.some(c => c.partial);

    // Run-rate estimate for the in-progress column — "17 days into a 31-day
    // month at this pace" projected to the full period. Margin is left
    // alone: since revenue and expense are scaled by the same factor, the
    // projected margin is mathematically identical to the actual-so-far
    // margin, so a separate estimate would just repeat the same number.
    const factor = useMemo(() => projectionFactor(grouping), [grouping]);
    const showEstimate = hasPartial && factor !== null;

    const fmt = (n: number) => `${n < 0 ? '-' : ''}${currency}${Math.round(Math.abs(n)).toLocaleString()}`;
    const columnByKey = useMemo(() => new Map(columns.map(c => [c.key, c])), [columns]);
    const estimateFor = (value: number, partial: boolean) => (partial && showEstimate) ? `≈${fmt(value * factor!)}` : null;

    if (columns.length === 0) {
        return (
            <View style={s.empty}>
                <Text style={s.emptyText}>No transactions yet — once you have some, they'll line up here month by month.</Text>
            </View>
        );
    }

    const trendColumns = columns.map(c => ({ key: c.key, label: `${c.label}${c.partial ? ' *' : ''}` }));

    // businessName is only set from Reports, where this sits alongside the
    // formal P&L statement -- a single "Expenses" line there hides exactly
    // the breakdown (Cost of Goods Sold vs. Operating Expenses vs.
    // interest/other) the formal statement right above it already shows,
    // so this trend should show it too rather than flattening it back
    // down. Inventory's plain "daily sales pace" card (no businessName)
    // keeps the single Expenses line -- it's not P&L context.
    const trendRows: PeriodTrendRow[] = businessName ? [
        { key: 'revenue', label: 'Revenue', getValue: k => fmt(columnByKey.get(k)!.revenue), getColor: () => Colors.income, getSubValue: k => estimateFor(columnByKey.get(k)!.revenue, columnByKey.get(k)!.partial) },
        { key: 'cogs', label: 'Cost of Goods Sold', getValue: k => fmt(columnByKey.get(k)!.cogs), getColor: () => Colors.expense, getSubValue: k => estimateFor(columnByKey.get(k)!.cogs, columnByKey.get(k)!.partial) },
        {
            key: 'grossProfit', label: 'Gross Profit', bold: true, topBorder: true,
            getValue: k => fmt(columnByKey.get(k)!.revenue - columnByKey.get(k)!.cogs),
            getColor: k => (columnByKey.get(k)!.revenue - columnByKey.get(k)!.cogs) >= 0 ? Colors.income : Colors.expense,
            getSubValue: k => estimateFor(columnByKey.get(k)!.revenue - columnByKey.get(k)!.cogs, columnByKey.get(k)!.partial),
        },
        { key: 'opex', label: 'Operating Expenses', getValue: k => fmt(columnByKey.get(k)!.opex), getColor: () => Colors.expense, getSubValue: k => estimateFor(columnByKey.get(k)!.opex, columnByKey.get(k)!.partial) },
        { key: 'other', label: 'Other (Interest, etc.)', getValue: k => fmt(columnByKey.get(k)!.other), getColor: () => Colors.expense, getSubValue: k => estimateFor(columnByKey.get(k)!.other, columnByKey.get(k)!.partial) },
    ] : [
        { key: 'revenue', label: 'Revenue', getValue: k => fmt(columnByKey.get(k)!.revenue), getColor: () => Colors.income, getSubValue: k => estimateFor(columnByKey.get(k)!.revenue, columnByKey.get(k)!.partial) },
        { key: 'expense', label: 'Expenses', getValue: k => fmt(columnByKey.get(k)!.expense), getColor: () => Colors.expense, getSubValue: k => estimateFor(columnByKey.get(k)!.expense, columnByKey.get(k)!.partial) },
    ];

    trendRows.push({
        key: 'profit', label: 'Profit', bold: true, topBorder: true,
        getValue: k => fmt(columnByKey.get(k)!.profit),
        getColor: k => columnByKey.get(k)!.profit >= 0 ? Colors.income : Colors.expense,
        getSubValue: k => estimateFor(columnByKey.get(k)!.profit, columnByKey.get(k)!.partial),
    });
    trendRows.push({
        key: 'margin', label: 'Margin', muted: true, noBottomBorder: true,
        getValue: k => `${columnByKey.get(k)!.margin.toFixed(0)}%`,
    });

    const table = (
        <>
            <View style={s.toggleRow}>
                {GROUPINGS.map(g => (
                    <TouchableOpacity key={g.key} style={[s.toggleBtn, grouping === g.key && s.toggleBtnActive]} onPress={() => setGrouping(g.key)}>
                        <Text style={[s.toggleText, grouping === g.key && s.toggleTextActive]}>{g.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <PeriodTrendTable columns={trendColumns} rows={trendRows} labelColumnWidth={84} columnWidth={98} scrollDep={grouping} />

            <Text style={s.hint}>Scroll sideways to see every {PERIOD_NOUN[grouping]} you have data for.</Text>
            {hasPartial && (
                <Text style={s.hint}>* still in progress — not a full {PERIOD_NOUN[grouping]} yet, so it's not a fair comparison against earlier columns.</Text>
            )}
            {showEstimate && (
                <Text style={s.hint}>≈ estimated full {grouping === 'weekly' ? 'week' : grouping === 'monthly' ? 'month' : grouping === 'quarterly' ? 'quarter' : 'year'} at the current daily pace — a projection, not an actual.</Text>
            )}
        </>
    );

    if (businessName) {
        return (
            <StatementCard
                businessName={businessName}
                title="Revenue, Expenses & Profit Trend"
                subtitle={`${GROUPINGS.find(g => g.key === grouping)!.label} Breakdown, All Recorded History`}
            >
                {table}
            </StatementCard>
        );
    }

    return (
        <View style={s.card}>
            <Text style={s.title}>Period Comparison</Text>
            {table}
        </View>
    );
}

const s = StyleSheet.create({
    card: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    title: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, marginBottom: 10 },
    toggleRow: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: Colors.bg, borderRadius: 9, padding: 3, marginBottom: 14, alignSelf: 'flex-start', gap: 2 },
    toggleBtn: { paddingVertical: 6, paddingHorizontal: 11, borderRadius: 7 },
    toggleBtnActive: { backgroundColor: Colors.primary },
    toggleText: { fontSize: 11.5, fontWeight: '700', color: Colors.textMuted },
    toggleTextActive: { color: '#fff' },

    empty: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: 20, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },

    hint: { fontSize: 11, color: Colors.textMuted, marginTop: 10, textAlign: 'center' },
});
