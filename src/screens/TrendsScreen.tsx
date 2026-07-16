import React, { useMemo, useState } from 'react';
import {
    SafeAreaView, ScrollView, View, Text, TouchableOpacity, StyleSheet,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { analyzeTrend, MonthlyTrendPoint } from '../utils/trendAnalysis';

type RangeKey = '12' | '24' | '36' | 'all';
const RANGES: { key: RangeKey; label: string }[] = [
    { key: '12', label: '12mo' },
    { key: '24', label: '24mo' },
    { key: '36', label: '36mo' },
    { key: 'all', label: 'All time' },
];

const MONTH_LABEL = (m: string) => {
    const [y, mo] = m.split('-');
    return new Date(Number(y), Number(mo) - 1, 1).toLocaleString('default', { month: 'short', year: '2-digit' });
};

export default function TrendsScreen() {
    const { transactions, settings, navigate } = useApp();
    const currency = settings.currency || '₦';
    const [range, setRange] = useState<RangeKey>('all');

    const trend = useMemo(() => analyzeTrend(transactions), [transactions]);

    const visibleMonths: MonthlyTrendPoint[] = useMemo(() => {
        if (range === 'all') return trend.monthly;
        const n = Number(range);
        return trend.monthly.slice(-n);
    }, [trend.monthly, range]);

    const maxAbs = useMemo(
        () => Math.max(1, ...visibleMonths.map(m => Math.max(m.revenue, m.expense))),
        [visibleMonths]
    );

    const fmt = (n: number) => `${currency}${Math.round(n).toLocaleString()}`;
    const fmtPct = (n: number | null) => n === null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
                <Text style={s.title}>📈 Multi-Year Trends</Text>
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

                        {/* Range toggle */}
                        <View style={s.rangeRow}>
                            {RANGES.map(r => (
                                <TouchableOpacity
                                    key={r.key}
                                    style={[s.rangeBtn, range === r.key && s.rangeBtnActive]}
                                    onPress={() => setRange(r.key)}
                                >
                                    <Text style={[s.rangeBtnText, range === r.key && s.rangeBtnTextActive]}>{r.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Monthly revenue vs expense chart */}
                        <View style={s.card}>
                            <Text style={s.cardTitle}>Revenue vs Expenses by Month</Text>
                            <View style={s.legendRow}>
                                <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: Colors.income }]} /><Text style={s.legendText}>Revenue</Text></View>
                                <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: Colors.expense }]} /><Text style={s.legendText}>Expenses</Text></View>
                            </View>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                <View style={s.chartRow}>
                                    {visibleMonths.map(m => (
                                        <View key={m.month} style={s.chartCol}>
                                            <View style={s.barPair}>
                                                <View style={[s.bar, { height: Math.max(3, (m.revenue / maxAbs) * 100), backgroundColor: Colors.income }]} />
                                                <View style={[s.bar, { height: Math.max(3, (m.expense / maxAbs) * 100), backgroundColor: Colors.expense }]} />
                                            </View>
                                            <Text style={s.chartMonthLabel}>{MONTH_LABEL(m.month)}</Text>
                                        </View>
                                    ))}
                                </View>
                            </ScrollView>
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
                    </>
                )}
            </ScrollView>
            <FooterNav />
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe:  { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad:   { padding: 16, paddingBottom: 100 },
    title: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
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

    card: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 14 },
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

    rangeRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
    rangeBtn: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 8, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
    rangeBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    rangeBtnText: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
    rangeBtnTextActive: { color: '#fff' },

    legendRow: { flexDirection: 'row', gap: 16, marginBottom: 10 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { fontSize: 11, color: Colors.textMuted },

    chartRow: { flexDirection: 'row', alignItems: 'flex-end', height: 140, paddingTop: 10 },
    chartCol: { width: 40, alignItems: 'center', marginRight: 4 },
    barPair: { flexDirection: 'row', gap: 3, alignItems: 'flex-end', height: 100 },
    bar: { width: 14, borderRadius: 3 },
    chartMonthLabel: { fontSize: 9, color: Colors.textMuted, marginTop: 6, transform: [{ rotate: '-40deg' }] },

    tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border, paddingBottom: 8, marginBottom: 6 },
    th: { flex: 1, fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase' },
    tableRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
    td: { flex: 1, fontSize: 12, color: Colors.textSecondary },
});
