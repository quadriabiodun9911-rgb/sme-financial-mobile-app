import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    SafeAreaView, ScrollView, View, Text, TouchableOpacity, StyleSheet, Animated, Easing,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import RadialGauge from '../components/RadialGauge';
import ProfitWaterfall from '../components/ProfitWaterfall';
import ProfitByDimension from '../components/ProfitByDimension';
import ProfitDriversInsights from '../components/ProfitDriversInsights';
import NextStepLink from '../components/NextStepLink';
import {
    computeProfitWaterfall,
    computeProfitByCategory,
    computeProfitByVendorCustomer,
    identifyProfitDrivers,
    computeMomentum,
    computeTopPerformers,
    computeGrowthScore,
    computeBreakeven,
    MonthlySnapshot,
} from '../utils/profitability';
import { computeCustomerMetrics } from '../utils/customerMetrics';
import Icon, { IconName } from '../components/ui/Icon';
import { Radius, Shadow, Spacing } from '../theme/tokens';

type Tab = 'score' | 'momentum' | 'performers' | 'drivers' | 'customers';

const TABS: { key: Tab; icon: IconName; label: string }[] = [
    { key: 'score',      icon: 'award',       label: 'Score'      },
    { key: 'momentum',   icon: 'trending-up', label: 'Momentum'   },
    { key: 'performers', icon: 'star',        label: 'Top'        },
    { key: 'customers',  icon: 'users',       label: 'Customers'  },
    { key: 'drivers',    icon: 'search',      label: 'Drivers'    },
];

function fmt(n: number, currency: string): string {
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1_000_000) return `${sign}${currency}${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000)     return `${sign}${currency}${(abs / 1_000).toFixed(0)}k`;
    return `${sign}${currency}${Math.round(abs).toLocaleString()}`;
}

// One pillar's fill bar -- owns its own Animated.Value so it grows in
// independently, matching the motion language used across the rest of the
// app's list-of-bars breakdowns.
function PillarBar({ pct, color }: { pct: number; color: string }) {
    const anim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.timing(anim, {
            toValue: Math.min(Math.max(pct, 0), 100),
            duration: 600,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
    }, [pct]);
    return (
        <View style={gs.pillarTrack}>
            <Animated.View style={[gs.pillarFill, {
                backgroundColor: color,
                width: anim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
            }]} />
        </View>
    );
}

// ─── Growth Score Tab ─────────────────────────────────────────────────────────
function ScoreTab({ currency }: { currency: string }) {
    const { transactions, settings } = useApp();
    const result = useMemo(() => computeGrowthScore(transactions, settings), [transactions, settings]);
    const momentum = useMemo(() => computeMomentum(transactions), [transactions]);
    const breakeven = useMemo(() => computeBreakeven(transactions, settings), [transactions, settings]);
    const performers = useMemo(() => computeTopPerformers(transactions), [transactions]);

    const scoreAnim = useRef(new Animated.Value(0)).current;
    const [animatedScore, setAnimatedScore] = useState(0);
    useEffect(() => {
        const id = scoreAnim.addListener(({ value }) => setAnimatedScore(value));
        Animated.timing(scoreAnim, { toValue: result.score, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
        return () => scoreAnim.removeListener(id);
    }, [result.score]);

    return (
        <ScrollView showsVerticalScrollIndicator={false}>
            {/* Score circle */}
            <View style={gs.scoreCard}>
                <View style={{ marginBottom: Spacing.md }}>
                    <RadialGauge
                        displayValue={`${Math.round(animatedScore)}`}
                        label="/100"
                        progress={result.score / 100}
                        color={result.color}
                        size={100}
                        strokeWidth={8}
                    />
                </View>
                <Text style={[gs.scoreLabel, { color: result.color }]}>{result.label}</Text>
                <Text style={gs.scoreVerdict}>{momentum.growthVerdict}</Text>
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
                            <PillarBar pct={pct} color={barColor} />
                            <Text style={gs.pillarNote}>{p.note}</Text>
                        </View>
                    );
                })}
            </View>

            {/* Next steps */}
            <View style={gs.nextCard}>
                <Text style={gs.sectionTitle}>HOW TO IMPROVE YOUR SCORE</Text>
                {result.score < 25 && <Text style={gs.nextItem}>→ Log transactions consistently for 3+ months</Text>}
                {(result.pillars[2]?.score ?? 100) < 25 && (
                    <Text style={gs.nextItem}>
                        → Grow monthly revenue — even 5% MoM compounds fast
                        {result.label !== 'Not Enough Data' && ` (you're at ${momentum.revenueGrowthPct >= 0 ? '+' : ''}${momentum.revenueGrowthPct.toFixed(0)}% right now)`}
                    </Text>
                )}
                {(result.pillars[3]?.score ?? 100) < 20 && (
                    <Text style={gs.nextItem}>
                        → {result.label === 'Not Enough Data'
                            ? 'Reach breakeven by cutting your top expense category'
                            : breakeven.costStructureUpsideDown
                                ? "Fix pricing or cost-per-sale first — right now every sale's variable cost alone exceeds what it brings in, so more volume makes it worse, not better"
                                : `Close the ${fmt(Math.abs(breakeven.surplusOrGap), currency)}/mo gap to breakeven: cut ~${fmt(breakeven.pathsToProfitability.costReductionNeeded, currency)} in costs, or add ~${fmt(breakeven.pathsToProfitability.revenueIncreaseNeeded, currency)} in revenue`}
                    </Text>
                )}
                {(result.pillars[4]?.score ?? 100) < 10 && performers.topCustomers[0] && (
                    <Text style={gs.nextItem}>
                        → {performers.topCustomers[0].name} is {Math.round(performers.topCustomers[0].sharePct)}% of revenue ({fmt(performers.topCustomers[0].revenue, currency)}) — reduce concentration by adding 2+ new clients of similar size
                    </Text>
                )}
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
                <View style={gs.emptyIconWrap}>
                    <Icon name="trending-up" size={44} color={Colors.textMuted} />
                </View>
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
                        {/* Scoped to the trailing 6 months (this tab's own
                            momentum window), not the lifetime average shown
                            elsewhere in the app (e.g. Loan Eligibility,
                            Dashboard) — labeled explicitly so the two don't
                            read as the same figure when they legitimately
                            aren't. */}
                        <Text style={gs.momLabel}>Avg Monthly Revenue (6mo)</Text>
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
                            <View style={gs.highlightIconWrap}>
                                <Icon name="award" size={22} color={Colors.income} />
                            </View>
                            <Text style={gs.highlightLabel}>Best Month</Text>
                            <Text style={[gs.highlightMonth]}>{m.bestMonth.label}</Text>
                            <Text style={[gs.highlightVal, { color: Colors.income }]}>{fmt(m.bestMonth.profit, currency)} profit</Text>
                        </View>
                    )}
                    {m.worstMonth && m.worstMonth.month !== m.bestMonth?.month && (
                        <View style={[gs.highlightBox, { borderColor: Colors.expense }]}>
                            <View style={gs.highlightIconWrap}>
                                <Icon name="trending-down" size={22} color={Colors.expense} />
                            </View>
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
                    <Icon name="zap" size={20} color={Colors.primary} />
                    <Text style={gs.focusText}>{p.focusRecommendation}</Text>
                </View>
            ) : null}

            {/* Concentration risk banner */}
            {p.concentrationRisk && (
                <View style={[gs.riskBanner, { borderColor: Colors.expense }]}>
                    <View style={gs.riskTitleRow}>
                        <Icon name="alert-triangle" size={14} color={Colors.expense} />
                        <Text style={[gs.riskTitle, { color: Colors.expense }]}>Customer Concentration Risk</Text>
                    </View>
                    <Text style={gs.riskBody}>{p.concentrationWarning}</Text>
                    {p.topCustomers[0] && (
                        <Text style={gs.riskImpact}>
                            If not solved: losing {p.topCustomers[0].name} alone would wipe out {fmt(p.topCustomers[0].revenue, currency)} in revenue.
                        </Text>
                    )}
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
                                    <View style={gs.perfShareRow}>
                                        <Text style={[gs.perfShare, { color: c.isConcentrationRisk ? Colors.expense : Colors.textMuted }]}>
                                            {Math.round(c.sharePct)}% of revenue
                                        </Text>
                                        {c.isConcentrationRisk && <Icon name="alert-triangle" size={10} color={Colors.expense} />}
                                    </View>
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
                            <Icon name="trending-down" size={16} color={Colors.expense} />
                            <Text style={[gs.perfName, { flex: 1 }]}>{c.name}</Text>
                            <Text style={[gs.perfVal, { color: Colors.expense }]}>{fmt(c.cost, currency)}</Text>
                        </View>
                    ))}
                </View>
            )}
        </ScrollView>
    );
}

// ─── Customers Tab (CAC & Churn) ───────────────────────────────────────────────
function CustomersTab({ currency }: { currency: string }) {
    const { transactions } = useApp();
    const m = useMemo(() => computeCustomerMetrics(transactions), [transactions]);

    if (!m.hasEnoughData) {
        return (
            <View style={gs.emptyBox}>
                <View style={gs.emptyIconWrap}>
                    <Icon name="users" size={44} color={Colors.textMuted} />
                </View>
                <Text style={gs.emptyTitle}>Not enough customer data yet</Text>
                <Text style={gs.emptyBody}>{m.reason}</Text>
            </View>
        );
    }

    const latest = m.latestMonth!;

    return (
        <ScrollView showsVerticalScrollIndicator={false}>
            {/* Latest month summary */}
            <View style={gs.momCard}>
                <View style={gs.momRow}>
                    <View style={gs.momBox}>
                        <Text style={gs.momLabel}>Churn Rate ({latest.month})</Text>
                        <Text style={[gs.momVal, { color: latest.churnRate === null ? Colors.textMuted : latest.churnRate > 0.2 ? Colors.expense : Colors.income }]}>
                            {latest.churnRate === null ? 'N/A' : `${Math.round(latest.churnRate * 100)}%`}
                        </Text>
                    </View>
                    <View style={gs.momBox}>
                        <Text style={gs.momLabel}>CAC ({latest.month})</Text>
                        <Text style={gs.momVal}>{latest.cac === null ? 'N/A' : fmt(latest.cac, currency)}</Text>
                    </View>
                    <View style={gs.momBox}>
                        <Text style={gs.momLabel}>Avg CAC (12mo)</Text>
                        <Text style={gs.momVal}>{m.avgCac === null ? 'N/A' : fmt(m.avgCac, currency)}</Text>
                    </View>
                </View>
            </View>

            <View style={gs.tableCard}>
                <Text style={gs.sectionTitle}>MONTH-BY-MONTH CUSTOMERS</Text>
                <View style={gs.tableHeader}>
                    <Text style={[gs.tableCell, { flex: 1 }]}>Month</Text>
                    <Text style={[gs.tableCell, gs.tableCellR]}>New</Text>
                    <Text style={[gs.tableCell, gs.tableCellR]}>Churned</Text>
                    <Text style={[gs.tableCell, gs.tableCellR]}>CAC</Text>
                </View>
                {m.monthly.map((mo, i) => (
                    <View key={mo.month} style={[gs.tableRow, i % 2 === 0 && gs.tableRowAlt]}>
                        <Text style={[gs.tableCell, { flex: 1, color: Colors.textPrimary }]}>{mo.month}</Text>
                        <Text style={[gs.tableCell, gs.tableCellR, { color: Colors.income }]}>{mo.newCustomers}</Text>
                        <Text style={[gs.tableCell, gs.tableCellR, { color: mo.churnedCustomers > 0 ? Colors.expense : Colors.textMuted }]}>
                            {mo.churnedCustomers}
                        </Text>
                        <Text style={[gs.tableCell, gs.tableCellR]}>{mo.cac === null ? '—' : fmt(mo.cac, currency)}</Text>
                    </View>
                ))}
            </View>

            <View style={gs.focusCard}>
                <Icon name="zap" size={20} color={Colors.primary} />
                <Text style={gs.focusText}>
                    CAC = Marketing-category spend ÷ new customers that month. Churn = customers who bought last month but not this one, as a share of last month's active customers. Add a customer name to sales transactions and tag spend "Marketing" to keep these accurate.
                </Text>
            </View>
        </ScrollView>
    );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function GrowthIntelligenceScreen() {
    const { transactions, settings, navParams, navigate } = useApp();
    const [activeTab, setActiveTab] = useState<Tab>(
        (['score', 'momentum', 'performers', 'customers', 'drivers'] as Tab[]).includes(navParams?.tab as Tab) ? (navParams!.tab as Tab) : 'score'
    );
    const currency = settings.currency;

    const waterfall  = useMemo(() => computeProfitWaterfall(transactions), [transactions]);
    const byCategory = useMemo(() => computeProfitByCategory(transactions), [transactions]);
    const byVendor   = useMemo(() => computeProfitByVendorCustomer(transactions), [transactions]);
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
                        <View style={gs.tabIconWrap}>
                            <Icon name={tab.icon} size={14} color={activeTab === tab.key ? '#fff' : Colors.textMuted} />
                        </View>
                        <Text style={[gs.tabText, activeTab === tab.key && gs.tabTextActive]}>{tab.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <View style={gs.scroll}>
                <ScrollView contentContainerStyle={gs.content} showsVerticalScrollIndicator={false}>
                    {activeTab === 'score'      && <ScoreTab      currency={currency} />}
                    {activeTab === 'momentum'   && <MomentumTab   currency={currency} />}
                    {activeTab === 'performers' && <PerformersTab currency={currency} />}
                    {activeTab === 'customers'  && <CustomersTab  currency={currency} />}
                    {activeTab === 'drivers'    && (
                        <>
                            <ProfitWaterfall items={waterfall} currency={currency} />
                            <View style={{ height: 12 }} />
                            <ProfitByDimension byCategory={byCategory} byVendor={byVendor} currency={currency} />
                            <View style={{ height: 12 }} />
                            <ProfitDriversInsights drivers={drivers} currency={currency} />
                            <NextStepLink
                                text="See how your actual business is doing against breakeven this period"
                                onPress={() => navigate('cashflow', { tab: 'breakeven' })}
                            />
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
    headerRow:   { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.xs },
    screenTitle: { color: Colors.textPrimary, fontSize: 20, fontWeight: '700' },

    tabBar:       { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: Spacing.sm, gap: Spacing.xs, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.surface },
    tab:          { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: Radius.sm, backgroundColor: Colors.bg },
    tabActive:    { backgroundColor: Colors.primary },
    tabIconWrap:  { marginBottom: 2 },
    tabText:      { color: Colors.textMuted, fontSize: 10, fontWeight: '600' },
    tabTextActive:{ color: '#fff' },

    sectionTitle: { fontSize: 10, fontWeight: '800', color: Colors.textMuted, letterSpacing: 0.8, marginBottom: Spacing.md },

    // Score tab
    scoreCard:   { backgroundColor: Colors.surface, borderRadius: 14, padding: Spacing.xl, alignItems: 'center', marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    scoreLabel:  { fontSize: 20, fontWeight: '800', marginBottom: 6 },
    scoreVerdict:{ fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
    pillarsCard: { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    pillarRow:   { marginBottom: 14 },
    pillarTop:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.xs },
    pillarName:  { fontSize: 13, color: Colors.textPrimary, fontWeight: '600' },
    pillarScore: { fontSize: 13, fontWeight: '800' },
    pillarTrack: { height: 7, backgroundColor: Colors.bg, borderRadius: 4, overflow: 'hidden', marginBottom: 3 },
    pillarFill:  { height: 7, borderRadius: 4 },
    pillarNote:  { fontSize: 11, color: Colors.textMuted },
    nextCard:    { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    nextItem:    { fontSize: 13, color: Colors.textSecondary, lineHeight: 22, marginBottom: Spacing.xs },

    // Momentum tab
    momCard:     { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    momRow:      { flexDirection: 'row' },
    momBox:      { flex: 1, alignItems: 'center' },
    momLabel:    { fontSize: 10, color: Colors.textMuted, marginBottom: Spacing.xs, textAlign: 'center' },
    momVal:      { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
    chartCard:   { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    chartLegend: { flexDirection: 'row', gap: 14, marginBottom: Spacing.md },
    legendItem:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    legendDot:   { width: 8, height: 8, borderRadius: 4 },
    legendText:  { fontSize: 11, color: Colors.textSecondary },
    barsArea:    { flexDirection: 'row', alignItems: 'flex-end', height: 130, gap: Spacing.xs },
    barGroup:    { flex: 1, alignItems: 'center' },
    bars:        { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 120 },
    bar:         { flex: 1, borderRadius: 3, minWidth: 4 },
    barMonthLabel:{ fontSize: 9, color: Colors.textMuted, marginTop: Spacing.xs },
    tableCard:   { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    tableHeader: { flexDirection: 'row', paddingBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: Spacing.xs },
    tableRow:    { flexDirection: 'row', paddingVertical: 7 },
    tableRowAlt: { backgroundColor: Colors.bg, borderRadius: 6 },
    tableCell:   { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
    tableCellR:  { width: 72, textAlign: 'right' },
    highlightCard:{ flexDirection: 'row', gap: 10, marginBottom: Spacing.md },
    highlightBox: { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 14, alignItems: 'center', borderWidth: 1 },
    highlightIconWrap:{ marginBottom: 4 },
    highlightLabel:{ fontSize: 10, color: Colors.textMuted, marginBottom: 2 },
    highlightMonth:{ fontSize: 16, fontWeight: '800', color: Colors.textPrimary, marginBottom: 2 },
    highlightVal:  { fontSize: 13, fontWeight: '700' },

    // Performers tab
    focusCard:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 14, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '44' },
    focusText:   { flex: 1, fontSize: 13, color: Colors.textPrimary, lineHeight: 20 },
    riskBanner:  { borderWidth: 1, borderRadius: 10, padding: Spacing.md, marginBottom: Spacing.md, backgroundColor: Colors.expense + '11' },
    riskTitleRow:{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: 4 },
    riskTitle:   { fontSize: 13, fontWeight: '700' },
    riskBody:    { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
    riskImpact:  { fontSize: 11, color: Colors.expense, fontWeight: '700', marginTop: 4 },
    perfRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
    rankBadge:   { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
    rankNum:     { fontSize: 12, fontWeight: '800', color: Colors.textMuted },
    perfName:    { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    perfMeta:    { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
    perfVal:     { fontSize: 13, fontWeight: '800' },
    perfShareRow:{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 1 },
    perfShare:   { fontSize: 10, color: Colors.textMuted },
    drainNote:   { fontSize: 11, color: Colors.textMuted, marginBottom: 10, lineHeight: 16 },
    emptyHint:   { fontSize: 12, color: Colors.textMuted, paddingVertical: Spacing.md, textAlign: 'center' },

    // Empty state
    emptyBox:      { alignItems: 'center', padding: Spacing.huge },
    emptyIconWrap: { marginBottom: 14 },
    emptyTitle:    { fontSize: 17, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: Spacing.sm },
    emptyBody:     { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
