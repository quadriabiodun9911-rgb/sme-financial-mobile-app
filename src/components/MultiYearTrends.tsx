import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Radius, Shadow } from '../theme/tokens';
import { analyzeTrend, computeDailyTrend, computeWeeklyTrend, computeQuarterlyTrend, computeYearlyBusinessSnapshot } from '../utils/trendAnalysis';
import GroupedBarChart from './GroupedBarChart';

type Grouping = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
const GROUPINGS: { key: Grouping; label: string }[] = [
    { key: 'daily', label: 'Daily' },
    { key: 'weekly', label: 'Weekly' },
    { key: 'monthly', label: 'Monthly' },
    { key: 'quarterly', label: 'Quarterly' },
    { key: 'yearly', label: 'Yearly' },
];
const PERIOD_NOUN: Record<Grouping, string> = { daily: 'day', weekly: 'week', monthly: 'month', quarterly: 'quarter', yearly: 'year' };
// The chart is a horizontal-scrolling column chart, not a fixed-width
// table, so it can hold more points than a vertical list -- but "every
// day, all recorded history" is still hundreds of columns nobody scrolls
// through usefully. Capped to a sensible trailing window per granularity,
// same reasoning as Reports > Cash Flow Statement's "By Period" view.
const WINDOW: Record<Grouping, number> = { daily: 30, weekly: 12, monthly: 36, quarterly: 12, yearly: 20 };

const MONTH_LABEL = (m: string) => {
    const [y, mo] = m.split('-');
    return new Date(Number(y), Number(mo) - 1, 1).toLocaleString('default', { month: 'short', year: '2-digit' });
};
const DAY_LABEL = (d: string) => {
    const [y, mo, day] = d.split('-').map(Number);
    return new Date(y, mo - 1, day).toLocaleString('default', { month: 'short', day: 'numeric' });
};

export default function MultiYearTrends() {
    const { transactions, invoices, assets, settings, navigate } = useApp();
    const currency = settings.currency || '₦';
    const [grouping, setGrouping] = useState<Grouping>('monthly');

    const trend = useMemo(() => analyzeTrend(transactions), [transactions]);
    const snapshot = useMemo(
        () => computeYearlyBusinessSnapshot(trend.yearly.map(y => y.year), transactions, invoices, assets),
        [trend.yearly, transactions, invoices, assets]
    );
    const daily = useMemo(() => computeDailyTrend(transactions), [transactions]);
    const weekly = useMemo(() => computeWeeklyTrend(daily), [daily]);
    const quarterly = useMemo(() => computeQuarterlyTrend(trend.monthly), [trend.monthly]);

    // Same {label, revenue, expense} shape regardless of grouping, so the
    // chart below doesn't need to know which one is active.
    const chartPoints = useMemo(() => {
        if (grouping === 'daily') return daily.map(d => ({ label: DAY_LABEL(d.date), revenue: d.revenue, expense: d.expense }));
        if (grouping === 'weekly') return weekly.map(w => ({ label: w.label, revenue: w.revenue, expense: w.expense }));
        if (grouping === 'monthly') return trend.monthly.map(m => ({ label: MONTH_LABEL(m.month), revenue: m.revenue, expense: m.expense }));
        if (grouping === 'quarterly') return quarterly.map(q => ({ label: q.label, revenue: q.revenue, expense: q.expense }));
        return trend.yearly.map(y => ({ label: y.year, revenue: y.revenue, expense: y.expense }));
    }, [grouping, daily, weekly, trend.monthly, trend.yearly, quarterly]);

    const visiblePoints = useMemo(() => chartPoints.slice(-WINDOW[grouping]), [chartPoints, grouping]);

    const fmt = (n: number) => `${currency}${Math.round(n).toLocaleString()}`;
    const fmtPct = (n: number | null) => n === null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

    return (
        <View>
            <Text style={s.subtitle}>
                Every month you have data for — imported or entered by hand — not just a current snapshot.
            </Text>

            {trend.monthly.length === 0 ? (
                <View style={s.emptyState}>
                    <Text style={s.emptyTitle}>No transaction history yet</Text>
                    <Text style={s.emptySub}>
                        Import a bank statement or record some transactions to start building a trend.
                    </Text>
                    <TouchableOpacity style={s.emptyBtn} onPress={() => navigate('import-transactions')}>
                        <Text style={s.emptyBtnText}>Import Bank Statement</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <>
                    {/* Span + headline stats */}
                    <View style={s.statsRow}>
                        <View style={s.statBox}>
                            <Text style={s.statVal}>{trend.spanMonths}</Text>
                            <Text style={s.statLabel}>Months of data</Text>
                        </View>
                        <View style={s.statBox}>
                            <Text style={s.statVal}>{trend.yearly.length}</Text>
                            <Text style={s.statLabel}>Years covered</Text>
                        </View>
                        <View style={s.statBox}>
                            <Text style={[s.statVal, { color: trend.avgMonthlyProfitMargin >= 0 ? Colors.income : Colors.expense }]}>
                                {trend.avgMonthlyProfitMargin.toFixed(1)}%
                            </Text>
                            <Text style={s.statLabel}>Avg profit margin</Text>
                        </View>
                    </View>

                    {/* Year-over-year */}
                    {trend.yearly.length >= 2 && (
                        <View style={s.card}>
                            <Text style={s.cardTitle}>Year-over-Year</Text>
                            <Text style={s.cardSub}>
                                {trend.yearly[trend.yearly.length - 1].year} vs {trend.yearly[trend.yearly.length - 2].year}
                            </Text>
                            <View style={s.yoyRow}>
                                <View style={s.yoyBox}>
                                    <Text style={s.yoyLabel}>Revenue growth</Text>
                                    <Text style={[s.yoyVal, { color: (trend.yoyRevenueGrowthPct ?? 0) >= 0 ? Colors.income : Colors.expense }]}>
                                        {fmtPct(trend.yoyRevenueGrowthPct)}
                                    </Text>
                                </View>
                                <View style={s.yoyBox}>
                                    <Text style={s.yoyLabel}>Profit growth</Text>
                                    <Text style={[s.yoyVal, { color: (trend.yoyProfitGrowthPct ?? 0) >= 0 ? Colors.income : Colors.expense }]}>
                                        {fmtPct(trend.yoyProfitGrowthPct)}
                                    </Text>
                                </View>
                            </View>
                        </View>
                    )}

                    {/* Best / worst month */}
                    <View style={s.bwRow}>
                        {trend.bestMonth && (
                            <View style={[s.bwBox, { borderColor: Colors.income }]}>
                                <Text style={s.bwLabel}>🏆 Best month</Text>
                                <Text style={s.bwMonth}>{MONTH_LABEL(trend.bestMonth.month)}</Text>
                                <Text style={[s.bwVal, { color: Colors.income }]}>{fmt(trend.bestMonth.profit)} profit</Text>
                            </View>
                        )}
                        {trend.worstMonth && trend.worstMonth.month !== trend.bestMonth?.month && (
                            <View style={[s.bwBox, { borderColor: Colors.expense }]}>
                                <Text style={s.bwLabel}>⚠️ Toughest month</Text>
                                <Text style={s.bwMonth}>{MONTH_LABEL(trend.worstMonth.month)}</Text>
                                <Text style={[s.bwVal, { color: Colors.expense }]}>{fmt(trend.worstMonth.profit)} profit</Text>
                            </View>
                        )}
                    </View>

                    {/* Grouping toggle -- same Daily/Weekly/Monthly/Quarterly/
                        Yearly granularities as every other trend table in
                        Reports, replacing the old months-only range picker. */}
                    <View style={s.rangeRow}>
                        {GROUPINGS.map(g => (
                            <TouchableOpacity
                                key={g.key}
                                style={[s.rangeBtn, grouping === g.key && s.rangeBtnActive]}
                                onPress={() => setGrouping(g.key)}
                            >
                                <Text style={[s.rangeBtnText, grouping === g.key && s.rangeBtnTextActive]}>{g.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Revenue vs expense chart, at the chosen granularity */}
                    <View style={s.card}>
                        <Text style={s.cardTitle}>Revenue vs Expenses (last {visiblePoints.length} {PERIOD_NOUN[grouping]}{visiblePoints.length === 1 ? '' : 's'})</Text>
                        <GroupedBarChart
                            height={100}
                            labels={visiblePoints.map(p => p.label)}
                            series={[
                                { label: 'Revenue', color: Colors.income, values: visiblePoints.map(p => p.revenue) },
                                { label: 'Expenses', color: Colors.expense, values: visiblePoints.map(p => p.expense) },
                            ]}
                        />
                    </View>

                    {/* Yearly summary table */}
                    {trend.yearly.length > 0 && (
                        <View style={s.card}>
                            <Text style={s.cardTitle}>By Year</Text>
                            <View style={s.tableHeader}>
                                <Text style={[s.th, { flex: 1 }]}>Year</Text>
                                <Text style={s.th}>Revenue</Text>
                                <Text style={s.th}>Expenses</Text>
                                <Text style={s.th}>Profit</Text>
                                <Text style={s.th}>Margin</Text>
                            </View>
                            {trend.yearly.slice().reverse().map(y => (
                                <View key={y.year} style={s.tableRow}>
                                    <Text style={[s.td, { flex: 1, color: Colors.textPrimary, fontWeight: '700' }]}>{y.year}</Text>
                                    <Text style={[s.td, { color: Colors.income }]}>{fmt(y.revenue)}</Text>
                                    <Text style={[s.td, { color: Colors.expense }]}>{fmt(y.expense)}</Text>
                                    <Text style={[s.td, { color: y.profit >= 0 ? Colors.income : Colors.expense, fontWeight: '700' }]}>{fmt(y.profit)}</Text>
                                    <Text style={s.td}>{y.profitMargin.toFixed(0)}%</Text>
                                </View>
                            ))}
                        </View>
                    )}

                    {/* Business Growth by Year — non-financial dimensions
                        (who you sold to, what you invested in) alongside the
                        revenue/expense trend above. */}
                    {snapshot.length > 0 && (
                        <>
                            <View style={s.card}>
                                <Text style={s.cardTitle}>Customers by Year</Text>
                                <GroupedBarChart
                                    height={80}
                                    labels={snapshot.map(sn => sn.year)}
                                    series={[{ label: 'Customers', color: Colors.primary, values: snapshot.map(sn => sn.customers) }]}
                                />
                            </View>

                            <View style={s.card}>
                                <Text style={s.cardTitle}>Assets Purchased by Year</Text>
                                <Text style={s.cardSub}>Capital invested in equipment/vehicles/property that year, not depreciated current value.</Text>
                                <GroupedBarChart
                                    height={80}
                                    labels={snapshot.map(sn => sn.year)}
                                    series={[{ label: 'Assets Purchased', color: Colors.asset, values: snapshot.map(sn => sn.assetsPurchased) }]}
                                />
                            </View>

                            <View style={s.card}>
                                <Text style={s.cardTitle}>Business Snapshot by Year</Text>
                                {snapshot.slice().reverse().map(sn => (
                                    <View key={sn.year} style={s.snapshotCard}>
                                        <Text style={s.snapshotYear}>{sn.year}</Text>
                                        <View style={s.snapshotRow}>
                                            <Text style={s.snapshotLabel}>Customers billed</Text>
                                            <Text style={s.snapshotVal}>{sn.customers}</Text>
                                        </View>
                                        <View style={s.snapshotRow}>
                                            <Text style={s.snapshotLabel}>Top expense category</Text>
                                            <Text style={s.snapshotVal}>
                                                {sn.topExpenseCategory ? `${sn.topExpenseCategory} (${fmt(sn.topExpenseCategoryAmount)})` : '—'}
                                            </Text>
                                        </View>
                                        <View style={s.snapshotRow}>
                                            <Text style={s.snapshotLabel}>Receivables still outstanding today</Text>
                                            <Text style={s.snapshotVal}>{fmt(sn.receivablesOutstandingToday)}</Text>
                                        </View>
                                        <View style={[s.snapshotRow, { borderBottomWidth: 0 }]}>
                                            <Text style={s.snapshotLabel}>Assets purchased</Text>
                                            <Text style={s.snapshotVal}>{fmt(sn.assetsPurchased)}</Text>
                                        </View>
                                    </View>
                                ))}
                                <Text style={s.disc}>
                                    "Receivables still outstanding today" is what's unpaid right now from invoices issued that year — not a
                                    historical year-end balance, since daily balance history isn't tracked.
                                </Text>
                            </View>
                        </>
                    )}
                </>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    subtitle: { fontSize: 12, color: Colors.textMuted, marginBottom: 16, lineHeight: 17 },

    emptyState: { alignItems: 'center', padding: 32, backgroundColor: Colors.surface, borderRadius: 14 },
    emptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
    emptySub:   { fontSize: 12, color: Colors.textMuted, textAlign: 'center', marginBottom: 16 },
    emptyBtn:   { backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24 },
    emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

    statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    statBox:  { flex: 1, backgroundColor: Colors.surface, borderRadius: 12, padding: 12, alignItems: 'center' },
    statVal:  { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
    statLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 4, textAlign: 'center' },

    card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    cardTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
    cardSub:   { fontSize: 11, color: Colors.textMuted, marginBottom: 12 },

    yoyRow: { flexDirection: 'row', gap: 10 },
    yoyBox: { flex: 1, backgroundColor: Colors.bg, borderRadius: 10, padding: 12, alignItems: 'center' },
    yoyLabel: { fontSize: 11, color: Colors.textMuted, marginBottom: 4 },
    yoyVal:   { fontSize: 17, fontWeight: '800' },

    bwRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    bwBox: { flex: 1, backgroundColor: Colors.surface, borderRadius: 12, padding: 12, borderWidth: 1 },
    bwLabel: { fontSize: 10, color: Colors.textMuted, marginBottom: 4 },
    bwMonth: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
    bwVal:   { fontSize: 12, fontWeight: '700' },

    rangeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
    rangeBtn: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
    rangeBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    rangeBtnText: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
    rangeBtnTextActive: { color: '#fff' },

    tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border, paddingBottom: 8, marginBottom: 6 },
    th: { flex: 1, fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase' },
    tableRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
    td: { flex: 1, fontSize: 12, color: Colors.textSecondary },

    snapshotCard: { backgroundColor: Colors.bg, borderRadius: 10, padding: 12, marginBottom: 10 },
    snapshotYear: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary, marginBottom: 6 },
    snapshotRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 8 },
    snapshotLabel: { fontSize: 11.5, color: Colors.textMuted, flex: 1 },
    snapshotVal: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, textAlign: 'right' },
    disc: { fontSize: 10.5, color: Colors.textMuted, marginTop: 4, fontStyle: 'italic', lineHeight: 15 },
});
