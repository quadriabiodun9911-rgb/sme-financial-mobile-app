import React, { useMemo, useState } from 'react';
import {
    SafeAreaView, ScrollView, View, Text, TouchableOpacity, StyleSheet,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import ProfitWaterfall from '../components/ProfitWaterfall';
import ProfitByDimension from '../components/ProfitByDimension';
import BreakevenAnalysis from '../components/BreakevenAnalysis';
import ProfitDriversInsights from '../components/ProfitDriversInsights';
import {
    computeProfitWaterfall,
    computeProfitByCategory,
    computeProfitByVendorCustomer,
    computeBreakeven,
    identifyProfitDrivers,
    computeMomentum,
    computeTopPerformers,
    computeGrowthScore,
    MonthlySnapshot,
} from '../utils/profitability';

type Tab = 'score' | 'momentum' | 'performers' | 'drivers' | 'breakeven';

const TABS: { key: Tab; icon: string; label: string }[] = [
    { key: 'score',      icon: '🏆', label: 'Score'      },
    { key: 'momentum',   icon: '📈', label: 'Momentum'   },
    { key: 'performers', icon: '⭐', label: 'Top'        },
    { key: 'drivers',    icon: '🔍', label: 'Drivers'    },
    { key: 'breakeven',  icon: '⚖️',  label: 'Breakeven'  },
];

function fmt(n: number, currency: string): string {
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1_000_000) return `${sign}${currency}${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000)     return `${sign}${currency}${(abs / 1_000).toFixed(0)}k`;
    return `${sign}${currency}${Math.round(abs).toLocaleString()}`;
}

// ─── Growth Score Tab ─────────────────────────────────────────────────────────
function ScoreTab({ currency }: { currency: string }) {
    const { transactions, settings } = useApp();
    const result = useMemo(() => computeGrowthScore(transactions, settings), [transactions, settings]);
    const circumference = 2 * Math.PI * 44;
    const filled = (result.score / 100) * circumference;

    return (
        <ScrollView showsVerticalScrollIndicator={false}>
            {/* Score circle */}
            <View style={gs.scoreCard}>
                <View style={[gs.scoreRing, { borderColor: result.color }]}>
                    <Text style={[gs.scoreNum, { color: result.color }]}>{result.score}</Text>
                    <Text style={gs.scoreMax}>/100</Text>
                </View>
                <Text style={[gs.scoreLabel, { color: result.color }]}>{result.label}</Text>
                <Text style={gs.scoreVerdict}>{computeMomentum(transactions).growthVerdict}</Text>
            </View>

            {/* Pillars */}
            <View style={gs.pillarsCard}>
                <Text style={gs.sectionTitle}>HOW YOUR SCORE IS BUILT</Text>
                {result.pillars.map((p, i) => {
                    const pct = (p.score / p.max) * 100;
                    const barColor = pct >= 80 ? '#10B981' : pct >= 50 ? '#3B82F6' : pct >= 20 ? '#F59E0B' : '#EF4444';
                    return (
                        <View key={i} style={gs.pillarRow}>
                            <View style={gs.pillarTop}>
                                <Text style={gs.pillarName}>{p.name}</Text>
                                <Text style={[gs.pillarScore, { color: barColor }]}>{p.score}/{p.max}</Text>
                            </View>
                            <View style={gs.pillarTrack}>
                                <View style={[gs.pillarFill, { width: `${pct}%` as any, backgroundColor: barColor }]} />
                            </View>
                            <Text style={gs.pillarNote}>{p.note}</Text>
                        </View>
                    );
                })}
            </View>

            {/* Next steps */}
            <View style={gs.nextCard}>
                <Text style={gs.sectionTitle}>HOW TO IMPROVE YOUR SCORE</Text>
                {result.score < 25 && <Text style={gs.nextItem}>→ Log transactions consistently for 3+ months</Text>}
                {(result.pillars[2]?.score ?? 100) < 25 && <Text style={gs.nextItem}>→ Grow monthly revenue — even 5% MoM compounds fast</Text>}
                {(result.pillars[3]?.score ?? 100) < 20 && <Text style={gs.nextItem}>→ Reach breakeven by cutting your top expense category</Text>}
                {(result.pillars[4]?.score ?? 100) < 10 && <Text style={gs.nextItem}>→ Reduce customer concentration — add 2 new clients</Text>}
                {(result.pillars[1]?.score ?? 100) < 20 && <Text style={gs.nextItem}>→ Turn loss months profitable — review costs when revenue dips</Text>}
                {result.score >= 75 && <Text style={gs.nextItem}>→ You're doing great. Reinvest profit into growth channels.</Text>}
            </View>
        </ScrollView>
    );
}

// ─── Momentum Tab ─────────────────────────────────────────────────────────────
function MomentumTab({ currency }: { currency: string }) {
    const { transactions } = useApp();
    const m = useMemo(() => computeMomentum(transactions), [transactions]);

    const hasData = m.months.some(mo => mo.revenue > 0 || mo.expenses > 0);
    const maxBar  = Math.max(...m.months.map(mo => Math.max(mo.revenue, mo.expenses, 1)));

    const trendColor = m.growthTrend === 'up' ? Colors.income : m.growthTrend === 'down' ? Colors.expense : Colors.warning;
    const trendIcon  = m.growthTrend === 'up' ? '▲' : m.growthTrend === 'down' ? '▼' : '→';

    if (!hasData) {
        return (
            <View style={gs.emptyBox}>
                <Text style={gs.emptyIcon}>📈</Text>
                <Text style={gs.emptyTitle}>Not enough data yet</Text>
                <Text style={gs.emptyBody}>Log transactions for 2+ months to see your momentum.</Text>
            </View>
        );
    }

    return (
        <ScrollView showsVerticalScrollIndicator={false}>
            {/* MoM summary */}
            <View style={gs.momCard}>
                <View style={gs.momRow}>
                    <View style={gs.momBox}>
                        <Text style={gs.momLabel}>Revenue MoM</Text>
                        <Text style={[gs.momVal, { color: trendColor }]}>
                            {trendIcon} {Math.abs(m.revenueGrowthPct).toFixed(1)}%
                        </Text>
                    </View>
                    <View style={gs.momBox}>
                        <Text style={gs.momLabel}>Avg Monthly Revenue</Text>
                        <Text style={gs.momVal}>{fmt(m.avgRevenue, currency)}</Text>
                    </View>
                    <View style={gs.momBox}>
                        <Text style={gs.momLabel}>Avg Sale Value</Text>
                        <Text style={gs.momVal}>{fmt(m.avgTxValue, currency)}</Text>
                    </View>
                </View>
            </View>

            {/* 6-month bar chart */}
            <View style={gs.chartCard}>
                <Text style={gs.sectionTitle}>6-MONTH REVENUE & PROFIT</Text>
                <View style={gs.chartLegend}>
                    <View style={gs.legendItem}><View style={[gs.legendDot, { backgroundColor: Colors.income }]} /><Text style={gs.legendText}>Revenue</Text></View>
                    <View style={gs.legendItem}><View style={[gs.legendDot, { backgroundColor: Colors.primary }]} /><Text style={gs.legendText}>Profit</Text></View>
                    <View style={gs.legendItem}><View style={[gs.legendDot, { backgroundColor: Colors.expense }]} /><Text style={gs.legendText}>Expenses</Text></View>
                </View>
                <View style={gs.barsArea}>
                    {m.months.map((mo, i) => {
                        const revH  = maxBar > 0 ? (mo.revenue  / maxBar) * 120 : 0;
                        const expH  = maxBar > 0 ? (mo.expenses / maxBar) * 120 : 0;
                        const profH = maxBar > 0 ? (Math.abs(mo.profit) / maxBar) * 120 : 0;
                        const profColor = mo.profit >= 0 ? Colors.primary : Colors.expense;
                        return (
                            <View key={i} style={gs.barGroup}>
                                <View style={gs.bars}>
                                    <View style={[gs.bar, { height: Math.max(2, revH), backgroundColor: Colors.income + 'BB' }]} />
                                    <View style={[gs.bar, { height: Math.max(2, expH), backgroundColor: Colors.expense + 'BB' }]} />
                                    <View style={[gs.bar, { height: Math.max(2, profH), backgroundColor: profColor + 'BB' }]} />
                                </View>
                                <Text style={gs.barMonthLabel}>{mo.label}</Text>
                            </View>
                        );
                    })}
                </View>
            </View>

            {/* Monthly table */}
            <View style={gs.tableCard}>
                <Text style={gs.sectionTitle}>MONTH-BY-MONTH BREAKDOWN</Text>
                <View style={gs.tableHeader}>
                    <Text style={[gs.tableCell, { flex: 1 }]}>Month</Text>
                    <Text style={[gs.tableCell, gs.tableCellR]}>Revenue</Text>
                    <Text style={[gs.tableCell, gs.tableCellR]}>Costs</Text>
                    <Text style={[gs.tableCell, gs.tableCellR]}>Profit</Text>
                </View>
                {m.months.map((mo, i) => (
                    <View key={i} style={[gs.tableRow, i % 2 === 0 && gs.tableRowAlt]}>
                        <Text style={[gs.tableCell, { flex: 1, color: Colors.textPrimary }]}>{mo.label}</Text>
                        <Text style={[gs.tableCell, gs.tableCellR, { color: Colors.income }]}>{fmt(mo.revenue, currency)}</Text>
                        <Text style={[gs.tableCell, gs.tableCellR, { color: Colors.expense }]}>{fmt(mo.expenses, currency)}</Text>
                        <Text style={[gs.tableCell, gs.tableCellR, { color: mo.profit >= 0 ? Colors.income : Colors.expense, fontWeight: '700' }]}>
                            {mo.profit >= 0 ? '+' : ''}{fmt(mo.profit, currency)}
                        </Text>
                    </View>
                ))}
            </View>

            {/* Best / Worst */}
            {(m.bestMonth || m.worstMonth) && (
                <View style={gs.highlightCard}>
                    {m.bestMonth && (
                        <View style={[gs.highlightBox, { borderColor: Colors.income }]}>
                            <Text style={[gs.highlightIcon]}>🏆</Text>
                            <Text style={gs.highlightLabel}>Best Month</Text>
                            <Text style={[gs.highlightMonth]}>{m.bestMonth.label}</Text>
                            <Text style={[gs.highlightVal, { color: Colors.income }]}>{fmt(m.bestMonth.profit, currency)} profit</Text>
                        </View>
                    )}
                    {m.worstMonth && m.worstMonth.month !== m.bestMonth?.month && (
                        <View style={[gs.highlightBox, { borderColor: Colors.expense }]}>
                            <Text style={gs.highlightIcon}>📉</Text>
                            <Text style={gs.highlightLabel}>Weakest Month</Text>
                            <Text style={gs.highlightMonth}>{m.worstMonth.label}</Text>
                            <Text style={[gs.highlightVal, { color: Colors.expense }]}>{fmt(m.worstMonth.profit, currency)} profit</Text>
                        </View>
                    )}
                </View>
            )}
        </ScrollView>
    );
}

// ─── Top Performers Tab ───────────────────────────────────────────────────────
function PerformersTab({ currency }: { currency: string }) {
    const { transactions } = useApp();
    const p = useMemo(() => computeTopPerformers(transactions), [transactions]);

    return (
        <ScrollView showsVerticalScrollIndicator={false}>
            {/* Focus rec */}
            {p.focusRecommendation ? (
                <View style={gs.focusCard}>
                    <Text style={gs.focusIcon}>💡</Text>
                    <Text style={gs.focusText}>{p.focusRecommendation}</Text>
                </View>
            ) : null}

            {/* Concentration risk banner */}
            {p.concentrationRisk && (
                <View style={[gs.riskBanner, { borderColor: Colors.expense }]}>
                    <Text style={[gs.riskTitle, { color: Colors.expense }]}>⚠️ Customer Concentration Risk</Text>
                    <Text style={gs.riskBody}>{p.concentrationWarning}</Text>
                </View>
            )}

            {/* Top customers */}
            <View style={gs.tableCard}>
                <Text style={gs.sectionTitle}>TOP CUSTOMERS BY REVENUE</Text>
                {p.topCustomers.length === 0 ? (
                    <Text style={gs.emptyHint}>Add vendor/customer names to transactions to see this.</Text>
                ) : (
                    <>
                        {p.topCustomers.map((c, i) => (
                            <View key={i} style={gs.perfRow}>
                                <View style={[gs.rankBadge, { backgroundColor: i === 0 ? '#F59E0B' : Colors.bg }]}>
                                    <Text style={[gs.rankNum, { color: i === 0 ? '#fff' : Colors.textMuted }]}>{i + 1}</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={gs.perfName}>{c.name}</Text>
                                    <Text style={gs.perfMeta}>{c.txCount} transaction{c.txCount !== 1 ? 's' : ''}</Text>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={[gs.perfVal, { color: Colors.income }]}>{fmt(c.revenue, currency)}</Text>
                                    <Text style={[gs.perfShare, { color: c.isConcentrationRisk ? Colors.expense : Colors.textMuted }]}>
                                        {Math.round(c.sharePct)}% of revenue{c.isConcentrationRisk ? ' ⚠️' : ''}
                                    </Text>
                                </View>
                            </View>
                        ))}
                    </>
                )}
            </View>

            {/* Top categories */}
            <View style={gs.tableCard}>
                <Text style={gs.sectionTitle}>TOP CATEGORIES BY REVENUE</Text>
                {p.topCategories.length === 0 ? (
                    <Text style={gs.emptyHint}>No categorised income yet.</Text>
                ) : (
                    p.topCategories.map((c, i) => (
                        <View key={i} style={gs.perfRow}>
                            <View style={[gs.rankBadge, { backgroundColor: Colors.bg }]}>
                                <Text style={gs.rankNum}>{i + 1}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={gs.perfName}>{c.name}</Text>
                                <Text style={gs.perfMeta}>
                                    {c.margin > 0 ? `${Math.round(c.margin)}% margin` : 'cost-only category'}
                                </Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={[gs.perfVal, { color: Colors.income }]}>{fmt(c.revenue, currency)}</Text>
                                <Text style={gs.perfShare}>profit {fmt(c.profit, currency)}</Text>
                            </View>
                        </View>
                    ))
                )}
            </View>

            {/* Drain categories */}
            {p.worstCategories.length > 0 && (
                <View style={gs.tableCard}>
                    <Text style={gs.sectionTitle}>COST-ONLY CATEGORIES (NO REVENUE)</Text>
                    <Text style={gs.drainNote}>These categories spend money but generate no income. Review if they're necessary.</Text>
                    {p.worstCategories.map((c, i) => (
                        <View key={i} style={gs.perfRow}>
                            <Text style={gs.drainIcon}>💸</Text>
                            <Text style={[gs.perfName, { flex: 1 }]}>{c.name}</Text>
                            <Text style={[gs.perfVal, { color: Colors.expense }]}>{fmt(c.cost, currency)}</Text>
                        </View>
                    ))}
                </View>
            )}
        </ScrollView>
    );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function GrowthIntelligenceScreen() {
    const { transactions, settings } = useApp();
    const [activeTab, setActiveTab] = useState<Tab>('score');
    const currency = settings.currency;

    const waterfall  = useMemo(() => computeProfitWaterfall(transactions), [transactions]);
    const byCategory = useMemo(() => computeProfitByCategory(transactions), [transactions]);
    const byVendor   = useMemo(() => computeProfitByVendorCustomer(transactions), [transactions]);
    const breakeven  = useMemo(() => computeBreakeven(transactions, settings), [transactions, settings]);
    const drivers    = useMemo(() => identifyProfitDrivers(transactions), [transactions]);

    return (
        <SafeAreaView style={gs.safe}>
            <Header />
            <View style={gs.headerRow}>
                <Text style={gs.screenTitle}>Growth Intelligence</Text>
            </View>

            {/* Tab bar */}
            <View style={gs.tabBar}>
                {TABS.map(tab => (
                    <TouchableOpacity
                        key={tab.key}
                        style={[gs.tab, activeTab === tab.key && gs.tabActive]}
                        onPress={() => setActiveTab(tab.key)}
                    >
                        <Text style={gs.tabIcon}>{tab.icon}</Text>
                        <Text style={[gs.tabText, activeTab === tab.key && gs.tabTextActive]}>{tab.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <View style={gs.scroll}>
                <ScrollView contentContainerStyle={gs.content} showsVerticalScrollIndicator={false}>
                    {activeTab === 'score'      && <ScoreTab      currency={currency} />}
                    {activeTab === 'momentum'   && <MomentumTab   currency={currency} />}
                    {activeTab === 'performers' && <PerformersTab currency={currency} />}
                    {activeTab === 'drivers'    && (
                        <>
                            <ProfitWaterfall items={waterfall} currency={currency} />
                            <View style={{ height: 12 }} />
                            <ProfitDriversInsights drivers={drivers} currency={currency} />
                        </>
                    )}
                    {activeTab === 'breakeven'  && (
                        <>
                            <ProfitByDimension byCategory={byCategory} byVendor={byVendor} currency={currency} />
                            <View style={{ height: 12 }} />
                            <BreakevenAnalysis result={breakeven} currency={currency} />
                        </>
                    )}
                </ScrollView>
            </View>

            <FooterNav />
        </SafeAreaView>
    );
}

const gs = StyleSheet.create({
    safe:        { flex: 1, backgroundColor: Colors.bg },
    scroll:      { flex: 1 },
    content:     { padding: 14, paddingBottom: 100 },
    headerRow:   { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
    screenTitle: { color: Colors.textPrimary, fontSize: 20, fontWeight: '700' },

    tabBar:       { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 8, gap: 4, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.surface },
    tab:          { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.bg },
    tabActive:    { backgroundColor: Colors.primary },
    tabIcon:      { fontSize: 14, marginBottom: 2 },
    tabText:      { color: Colors.textMuted, fontSize: 10, fontWeight: '600' },
    tabTextActive:{ color: '#fff' },

    sectionTitle: { fontSize: 10, fontWeight: '800', color: Colors.textMuted, letterSpacing: 0.8, marginBottom: 12 },

    // Score tab
    scoreCard:   { backgroundColor: Colors.surface, borderRadius: 14, padding: 20, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
    scoreRing:   { width: 100, height: 100, borderRadius: 50, borderWidth: 6, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    scoreNum:    { fontSize: 32, fontWeight: '900' },
    scoreMax:    { fontSize: 12, color: Colors.textMuted, marginTop: -4 },
    scoreLabel:  { fontSize: 20, fontWeight: '800', marginBottom: 6 },
    scoreVerdict:{ fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
    pillarsCard: { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
    pillarRow:   { marginBottom: 14 },
    pillarTop:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    pillarName:  { fontSize: 13, color: Colors.textPrimary, fontWeight: '600' },
    pillarScore: { fontSize: 13, fontWeight: '800' },
    pillarTrack: { height: 7, backgroundColor: Colors.bg, borderRadius: 4, overflow: 'hidden', marginBottom: 3 },
    pillarFill:  { height: 7, borderRadius: 4 },
    pillarNote:  { fontSize: 11, color: Colors.textMuted },
    nextCard:    { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
    nextItem:    { fontSize: 13, color: Colors.textSecondary, lineHeight: 22, marginBottom: 4 },

    // Momentum tab
    momCard:     { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
    momRow:      { flexDirection: 'row' },
    momBox:      { flex: 1, alignItems: 'center' },
    momLabel:    { fontSize: 10, color: Colors.textMuted, marginBottom: 4, textAlign: 'center' },
    momVal:      { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
    chartCard:   { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
    chartLegend: { flexDirection: 'row', gap: 14, marginBottom: 12 },
    legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
    legendDot:   { width: 8, height: 8, borderRadius: 4 },
    legendText:  { fontSize: 11, color: Colors.textSecondary },
    barsArea:    { flexDirection: 'row', alignItems: 'flex-end', height: 130, gap: 4 },
    barGroup:    { flex: 1, alignItems: 'center' },
    bars:        { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 120 },
    bar:         { flex: 1, borderRadius: 3, minWidth: 4 },
    barMonthLabel:{ fontSize: 9, color: Colors.textMuted, marginTop: 4 },
    tableCard:   { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
    tableHeader: { flexDirection: 'row', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: 4 },
    tableRow:    { flexDirection: 'row', paddingVertical: 7 },
    tableRowAlt: { backgroundColor: Colors.bg, borderRadius: 6 },
    tableCell:   { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
    tableCellR:  { width: 72, textAlign: 'right' },
    highlightCard:{ flexDirection: 'row', gap: 10, marginBottom: 12 },
    highlightBox: { flex: 1, backgroundColor: Colors.surface, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1 },
    highlightIcon:{ fontSize: 22, marginBottom: 4 },
    highlightLabel:{ fontSize: 10, color: Colors.textMuted, marginBottom: 2 },
    highlightMonth:{ fontSize: 16, fontWeight: '800', color: Colors.textPrimary, marginBottom: 2 },
    highlightVal:  { fontSize: 13, fontWeight: '700' },

    // Performers tab
    focusCard:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: Colors.primary + '44' },
    focusIcon:   { fontSize: 20 },
    focusText:   { flex: 1, fontSize: 13, color: Colors.textPrimary, lineHeight: 20 },
    riskBanner:  { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12, backgroundColor: Colors.expense + '11' },
    riskTitle:   { fontSize: 13, fontWeight: '700', marginBottom: 4 },
    riskBody:    { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
    perfRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
    rankBadge:   { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
    rankNum:     { fontSize: 12, fontWeight: '800', color: Colors.textMuted },
    perfName:    { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    perfMeta:    { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
    perfVal:     { fontSize: 13, fontWeight: '800' },
    perfShare:   { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
    drainNote:   { fontSize: 11, color: Colors.textMuted, marginBottom: 10, lineHeight: 16 },
    drainIcon:   { fontSize: 16 },
    emptyHint:   { fontSize: 12, color: Colors.textMuted, paddingVertical: 12, textAlign: 'center' },

    // Empty state
    emptyBox:   { alignItems: 'center', padding: 40 },
    emptyIcon:  { fontSize: 44, marginBottom: 14 },
    emptyTitle: { fontSize: 17, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 8 },
    emptyBody:  { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
