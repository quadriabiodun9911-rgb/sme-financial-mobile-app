import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import NextStepLink from '../components/NextStepLink';
import RadialGauge from '../components/RadialGauge';
import Icon, { IconName } from '../components/ui/Icon';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import {
    computeRiskScore,
    computeCustomerConcentration,
    computeSupplierConcentration,
    computeLenderConcentration,
    computeSeasonalRisk,
} from '../utils/finance';
import { computeRiskRadar, RiskLevel } from '../utils/riskRadar';
import { computeExternalRiskInsights, DRIVER_LABEL } from '../utils/externalRiskInsights';
import { computeExpenseSeasonalityPattern } from '../utils/seasonality';
import { MACRO_ASSUMPTION_SUGGESTIONS } from '../utils/macroAssumptionSuggestions';
import { fetchLiveFxRate, computeFxChangeSuggestion, recordFxSnapshot, LiveFxRate, FxChangeSuggestion } from '../utils/macroFeed';
import { loadFxSnapshots, saveFxSnapshots } from '../utils/storage';
import { computeSupplierIntelligence } from '../utils/supplierIntelligence';

type Tab = 'overview' | 'concentration' | 'seasonal' | 'economic';

const TABS: { key: Tab; icon: IconName; label: string }[] = [
    { key: 'overview',      icon: 'radio',           label: 'Overview' },
    { key: 'concentration', icon: 'users',           label: 'Concentration' },
    { key: 'seasonal',      icon: 'calendar',        label: 'Seasonal' },
    { key: 'economic',      icon: 'globe',           label: 'Economic' },
];

const RISK_LEVEL_META: Record<RiskLevel, { color: string; dot: string }> = {
    high:      { color: Colors.expense,   dot: '🔴' },
    medium:    { color: Colors.warning,   dot: '🟡' },
    low:       { color: Colors.income,    dot: '🟢' },
    'no-data': { color: Colors.textMuted, dot: '⚪' },
};

function riskLabel(score: number): { label: string; color: string } {
    if (score >= 80) return { label: 'Low Risk', color: Colors.income };
    if (score >= 60) return { label: 'Moderate Risk', color: Colors.income };
    if (score >= 40) return { label: 'Elevated Risk', color: Colors.warning };
    return { label: 'High Risk', color: Colors.expense };
}

function tierColor(risk: 'low' | 'medium' | 'high'): string {
    return risk === 'high' ? Colors.expense : risk === 'medium' ? Colors.warning : Colors.income;
}

function MiniBar({ pct, color }: { pct: number; color: string }) {
    const anim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.timing(anim, {
            toValue: Math.min(100, Math.max(pct, 0)),
            duration: 500,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
    }, [pct]);
    return (
        <View style={s.miniBarTrack}>
            <Animated.View style={[s.miniBarFill, {
                backgroundColor: color,
                width: anim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
            }]} />
        </View>
    );
}

/**
 * Risk management used to be scattered across Dashboard (a teaser), the
 * Scoreboard (a summary card), CFO Advisor's Risk tab (the actual detail --
 * Business Risk Score, Customer Dependency, Seasonal Patterns), and Cost
 * Exposure's Economic Risk insight cards buried on Inventory -- five
 * partial views with no single place that showed everything. This is now
 * the one canonical home: CFO Advisor's former Risk tab content moved here
 * wholesale (not duplicated), Risk Radar's full 6-category breakdown
 * (previously only summarised elsewhere) gets its actual detail page, and
 * Supplier/Lender concentration -- which had computations but no screen
 * showing them -- are surfaced for the first time. Debt Coverage itself
 * stays a summary here with a link to Loans, since debt-specific tools
 * (DSCR detail, Interest Rate Shock, Debt Optimizer) now live there.
 */
export default function RiskManagementScreen() {
    const { transactions, loans, finance, inventory, settings, navigate, setCurrentScreen, navParams, assets } = useApp();
    const currency = settings.currency || '₦';

    const [tab, setTab] = useState<Tab>(
        (['overview', 'concentration', 'seasonal', 'economic'] as Tab[]).includes(navParams?.tab as Tab) ? (navParams!.tab as Tab) : 'overview'
    );

    const risk         = useMemo(() => computeRiskScore(finance, loans, transactions, inventory), [finance, loans, transactions, inventory]);
    const riskRadar     = useMemo(() => computeRiskRadar(transactions, loans, settings?.macroAssumptions ?? [], new Date(), assets), [transactions, loans, settings?.macroAssumptions, assets]);
    const customerConc  = useMemo(() => computeCustomerConcentration(transactions), [transactions]);
    const supplierConc  = useMemo(() => computeSupplierConcentration(transactions), [transactions]);
    const supplierIntel = useMemo(() => computeSupplierIntelligence(transactions, inventory, currency), [transactions, inventory, currency]);
    const lenderConc    = useMemo(() => computeLenderConcentration(loans), [loans]);
    const seasonal      = useMemo(() => computeSeasonalRisk(transactions), [transactions]);
    const expenseSeasonality = useMemo(() => computeExpenseSeasonalityPattern(transactions), [transactions]);
    const externalRisk  = useMemo(
        () => computeExternalRiskInsights(transactions, settings.macroAssumptions ?? []),
        [transactions, settings.macroAssumptions]
    );
    const topExternalInsight = useMemo(
        () => [...externalRisk.insights].sort(
            (a, b) => (b.projectedImpact?.observedGrowthPct ?? 0) - (a.projectedImpact?.observedGrowthPct ?? 0)
        )[0],
        [externalRisk.insights]
    );

    // Overview's own reason to exist, separate from the Scoreboard's health
    // score (which already covers Business Health + a Risk Radar teaser):
    // pull the single worst signal out of each of THIS screen's other three
    // tabs (Concentration, Seasonal, Economic) into one triage list, so
    // opening this screen answers "which of these four areas needs my
    // attention right now" instead of restating numbers already shown
    // elsewhere.
    const worstConcentration = useMemo(() => {
        const candidates = [
            ...customerConc.filter(c => c.customer !== 'Unknown').map(c => ({ name: c.customer, kind: 'customer' as const, pct: c.percentage, risk: c.risk })),
            ...supplierConc.map(c => ({ name: c.supplier, kind: 'supplier' as const, pct: c.percentage, risk: c.risk })),
            ...lenderConc.map(c => ({ name: c.lenderName, kind: 'lender' as const, pct: c.percentage, risk: c.risk })),
        ];
        if (candidates.length === 0) return null;
        return candidates.sort((a, b) => b.pct - a.pct)[0];
    }, [customerConc, supplierConc, lenderConc]);

    const worstSeasonalMonth = useMemo(() => {
        const flagged = seasonal.filter(m => m.hasData && m.riskLevel !== 'low');
        if (flagged.length === 0) return null;
        const high = flagged.find(m => m.riskLevel === 'high');
        return high ?? flagged[0];
    }, [seasonal]);

    const MONTHS_GRID = [seasonal.slice(0, 6), seasonal.slice(6, 12)];

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <View style={s.headerRow}>
                <TouchableOpacity onPress={() => setCurrentScreen('dashboard')}>
                    <Text style={s.backBtn}>← Dashboard</Text>
                </TouchableOpacity>
                <Text style={s.screenTitle}>Risk Management</Text>
            </View>

            <View style={s.tabBar}>
                {TABS.map(t => (
                    <TouchableOpacity key={t.key} style={[s.tab, tab === t.key && s.tabActive]} onPress={() => setTab(t.key)}>
                        <Icon name={t.icon} size={13} color={tab === t.key ? Colors.primary : Colors.textMuted} />
                        <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <ScrollView style={s.scroll} contentContainerStyle={s.pad}>

                {/* ── OVERVIEW ─────────────────────────────────────────── */}
                {tab === 'overview' && (
                    <>
                        {/* Business Health itself lives on the Scoreboard now
                            (score, factors, and their explanations) -- this
                            screen's job is the detail Scoreboard only teases:
                            triage across Concentration/Seasonal/Economic,
                            then the full Risk Radar breakdown below. */}
                        <TouchableOpacity style={[s.card, { borderLeftWidth: 4, borderLeftColor: riskLabel(risk.score).color }]} onPress={() => setCurrentScreen('scoreboard')} activeOpacity={0.85}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <RadialGauge displayValue={String(risk.score)} label={risk.grade} progress={risk.score / 100} color={riskLabel(risk.score).color} size={56} strokeWidth={6} />
                                <View style={{ flex: 1, marginLeft: 14 }}>
                                    <Text style={{ fontSize: 14, fontWeight: '700', color: riskLabel(risk.score).color }}>
                                        Business Health: {riskLabel(risk.score).label}
                                    </Text>
                                    <Text style={s.cardSub}>See the full score breakdown & why → Scoreboard</Text>
                                </View>
                                <Icon name="chevron-right" size={16} color={Colors.textMuted} />
                            </View>
                        </TouchableOpacity>

                        <Text style={s.sectionTitle}>Biggest Exposures Right Now</Text>
                        <View style={s.card}>
                            <Text style={s.cardSub}>The single worst signal from each area below — not a repeat of the score above.</Text>
                            {worstConcentration && (
                                <TouchableOpacity style={s.exposureRow} onPress={() => setTab('concentration')} activeOpacity={0.7}>
                                    <Text style={s.radarDot}>{tierColor(worstConcentration.risk) === Colors.expense ? '🔴' : tierColor(worstConcentration.risk) === Colors.warning ? '🟡' : '🟢'}</Text>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.exposureLabel}>Concentration: {worstConcentration.name}</Text>
                                        <Text style={s.exposureDetail}>
                                            {worstConcentration.pct.toFixed(0)}% of your {worstConcentration.kind === 'customer' ? 'revenue' : worstConcentration.kind === 'supplier' ? 'spend' : 'debt'} rests on this one {worstConcentration.kind}.
                                        </Text>
                                    </View>
                                    <Icon name="chevron-right" size={14} color={Colors.textMuted} />
                                </TouchableOpacity>
                            )}
                            {worstSeasonalMonth && (
                                <TouchableOpacity style={s.exposureRow} onPress={() => setTab('seasonal')} activeOpacity={0.7}>
                                    <Text style={s.radarDot}>{worstSeasonalMonth.riskLevel === 'high' ? '🔴' : '🟡'}</Text>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.exposureLabel}>Seasonal: {worstSeasonalMonth.month}</Text>
                                        <Text style={s.exposureDetail}>{worstSeasonalMonth.warning}</Text>
                                    </View>
                                    <Icon name="chevron-right" size={14} color={Colors.textMuted} />
                                </TouchableOpacity>
                            )}
                            {externalRisk.hasAssumptions && externalRisk.insights.length > 0 && (
                                <TouchableOpacity style={s.exposureRow} onPress={() => setTab('economic')} activeOpacity={0.7}>
                                    <Text style={s.radarDot}>🟡</Text>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.exposureLabel}>Economic: {topExternalInsight.title.replace('⚠️ ', '')}</Text>
                                        <Text style={s.exposureDetail} numberOfLines={2}>{topExternalInsight.whatChanged}</Text>
                                    </View>
                                    <Icon name="chevron-right" size={14} color={Colors.textMuted} />
                                </TouchableOpacity>
                            )}
                            {!worstConcentration && !worstSeasonalMonth && !(externalRisk.hasAssumptions && externalRisk.insights.length > 0) && (
                                <Text style={s.empty}>Nothing standing out across concentration, seasonal, or economic risk right now.</Text>
                            )}
                        </View>

                        <Text style={s.sectionTitle}>Risk Radar</Text>
                        <View style={s.card}>
                            {riskRadar.categories.map(c => (
                                <View key={c.key} style={s.radarRow}>
                                    <Text style={s.radarDot}>{RISK_LEVEL_META[c.level].dot}</Text>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.radarLabel}>{c.label}</Text>
                                        <Text style={s.radarSummary}>{c.summary}</Text>
                                    </View>
                                </View>
                            ))}
                            <NextStepLink text="Debt Coverage detail, Interest Rate Shock & repayment strategy → Loans" onPress={() => navigate('loans')} />
                        </View>
                    </>
                )}

                {/* ── CONCENTRATION ─────────────────────────────────────── */}
                {tab === 'concentration' && (
                    <>
                        <View style={s.card}>
                            <Text style={s.cardTitle}>Customer Dependency Risk</Text>
                            <Text style={s.cardSub}>If one customer accounts for 40%+ of revenue, your business is exposed if they leave.</Text>
                            {customerConc.length === 0 ? (
                                <Text style={s.empty}>Add income transactions with customer names to see this.</Text>
                            ) : customerConc.slice(0, 8).map((c, i) => (
                                <View key={i} style={s.concRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.concName}>{c.customer}</Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                                            <MiniBar pct={c.percentage} color={tierColor(c.risk)} />
                                            <Text style={s.concPct}>{c.percentage.toFixed(1)}%</Text>
                                        </View>
                                    </View>
                                    <RiskBadge risk={c.risk} />
                                </View>
                            ))}
                            {(() => {
                                const topRisk = customerConc.find(c => c.risk === 'high');
                                if (!topRisk) return null;
                                // Same "Unknown" bucket as Supplier Dependency
                                // Risk below -- income transactions with no
                                // customer name recorded. Nothing to look up
                                // in Invoices for a customer that isn't named.
                                return topRisk.customer === 'Unknown' ? (
                                    <NextStepLink
                                        text="Add customer names to your income"
                                        onPress={() => navigate('transactions', { filter: 'income' })}
                                    />
                                ) : (
                                    <NextStepLink text="Review this customer's invoices" onPress={() => navigate('invoices')} />
                                );
                            })()}
                        </View>

                        <View style={s.card}>
                            <Text style={s.cardTitle}>Supplier Dependency Risk</Text>
                            <Text style={s.cardSub}>Relying on one supplier for 40%+ of spend leaves you exposed to their price rises or a supply break.</Text>
                            {supplierConc.length === 0 ? (
                                <Text style={s.empty}>Add expense transactions with a vendor name to see this.</Text>
                            ) : supplierConc.slice(0, 8).map((c, i) => (
                                <View key={i} style={s.concRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.concName}>{c.supplier}</Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                                            <MiniBar pct={c.percentage} color={tierColor(c.risk)} />
                                            <Text style={s.concPct}>{c.percentage.toFixed(1)}%</Text>
                                        </View>
                                    </View>
                                    <RiskBadge risk={c.risk} />
                                </View>
                            ))}
                            {(() => {
                                const topRisk = supplierConc.find(c => c.risk === 'high');
                                if (!topRisk) return null;
                                // "Unknown" is the bucket for expenses with no
                                // vendor recorded at all -- there's no name to
                                // search for, so searching literal "Unknown"
                                // text against transactions would just come up
                                // empty. Point at the real fix instead: get
                                // vendor names recorded so this concentration
                                // can even be attributed to a real supplier.
                                return topRisk.supplier === 'Unknown' ? (
                                    <NextStepLink
                                        text="Add vendor names to your expenses"
                                        onPress={() => navigate('transactions', { filter: 'expense' })}
                                    />
                                ) : (
                                    <NextStepLink
                                        text="Review this supplier's expenses"
                                        onPress={() => navigate('transactions', { filter: 'expense', search: topRisk.supplier })}
                                    />
                                );
                            })()}
                        </View>

                        {supplierIntel.available && (
                            <View style={s.card}>
                                <Text style={s.cardTitle}>Supplier Intelligence</Text>
                                <Text style={s.cardSub}>Purchase frequency and cost trend for each supplier, plus current payment terms and logistics spend.</Text>
                                {supplierIntel.suppliers.slice(0, 8).map((sp, i) => (
                                    <View key={i} style={[s.concRow, { flexDirection: 'column', alignItems: 'stretch' }]}>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                            <Text style={s.concName}>{sp.supplier}</Text>
                                            <Text style={s.concPct}>{currency}{Math.round(sp.totalSpent).toLocaleString()}</Text>
                                        </View>
                                        <Text style={[s.cardSub, { marginTop: 2, marginBottom: sp.priceCreep ? 2 : 0 }]}>{sp.frequencyLabel}</Text>
                                        {sp.priceCreep && (
                                            <Text style={[s.cardSub, { color: Colors.warning }]}>⚠ {sp.priceCreep.message}</Text>
                                        )}
                                    </View>
                                ))}
                                <Text style={[s.cardSub, { marginTop: 8 }]}>
                                    Current supplier payment terms: about {Math.round(supplierIntel.currentPayablesDays)} days.
                                    {' '}<Text style={{ color: Colors.primary }} onPress={() => navigate('reports', { reportSection: 'statements', reportTab: 'workingcapitalhealth' })}>See the payment-terms trend →</Text>
                                </Text>
                                {supplierIntel.logistics?.available && (
                                    <Text style={[s.cardSub, { marginTop: 6 }]}>🚚 {supplierIntel.logistics.message}</Text>
                                )}
                                {supplierIntel.inventoryTurnover.length > 0 && supplierIntel.inventoryTurnover.map((t, i) => (
                                    <Text key={i} style={[s.cardSub, { marginTop: 4 }]}>📦 {t.supplier}: {t.summary}</Text>
                                ))}
                            </View>
                        )}

                        <View style={s.card}>
                            <Text style={s.cardTitle}>Lender Dependency Risk</Text>
                            <Text style={s.cardSub}>Debt concentrated with one lender means their policies (or a relationship breakdown) can move your whole debt position.</Text>
                            {lenderConc.length === 0 ? (
                                <Text style={s.empty}>No active loan balances to assess.</Text>
                            ) : lenderConc.slice(0, 8).map((c, i) => (
                                <View key={i} style={s.concRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.concName}>{c.lenderName}</Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                                            <MiniBar pct={c.percentage} color={tierColor(c.risk)} />
                                            <Text style={s.concPct}>{c.percentage.toFixed(1)}%</Text>
                                        </View>
                                    </View>
                                    <RiskBadge risk={c.risk} />
                                </View>
                            ))}
                            <NextStepLink text="Manage loans & lenders" onPress={() => navigate('loans')} />
                        </View>
                    </>
                )}

                {/* ── SEASONAL ──────────────────────────────────────────── */}
                {tab === 'seasonal' && (
                    <View style={s.card}>
                        <Text style={s.cardTitle}>Seasonal Patterns</Text>
                        <Text style={s.cardSub}>Months where your revenue is historically low or high.</Text>
                        {MONTHS_GRID.map((row, ri) => (
                            <View key={ri} style={s.seasonRow}>
                                {row.map((m, i) => (
                                    <View key={i} style={[s.seasonCell, { borderColor: m.riskLevel === 'high' ? Colors.expense : m.riskLevel === 'medium' ? Colors.warning : m.riskLevel === 'unknown' ? Colors.border : Colors.income }]}>
                                        <Text style={s.seasonMonth}>{m.month}</Text>
                                        <Text style={[s.seasonRiskIcon, { color: m.riskLevel === 'high' ? Colors.expense : m.riskLevel === 'medium' ? Colors.warning : m.riskLevel === 'unknown' ? Colors.textMuted : Colors.income }]}>
                                            {m.riskLevel === 'high' ? '✗' : m.riskLevel === 'medium' ? '!' : m.riskLevel === 'unknown' ? '?' : '✓'}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        ))}
                        {seasonal.filter(m => m.hasData && m.riskLevel !== 'low').map((m, i) => (
                            <Text key={i} style={[s.seasonWarning, { color: m.riskLevel === 'high' ? Colors.expense : Colors.warning }]}>
                                {m.warning}
                            </Text>
                        ))}
                    </View>
                )}

                {/* Expenses have their own seasonal rhythm -- a rent review,
                    a stock-up before a busy season, year-end bonuses -- that
                    doesn't necessarily line up with when revenue peaks or
                    dips. Same real month-of-year pattern already computed
                    for behavioralProfile.ts's narrative, given its own
                    section here since a cost spike and a revenue dip are
                    different risks even when they land in the same month. */}
                {tab === 'seasonal' && (
                    <View style={s.card}>
                        <Text style={s.cardTitle}>Expense Seasonality</Text>
                        <Text style={s.cardSub}>Months where your costs historically run above or below your own average.</Text>
                        {!expenseSeasonality.available ? (
                            <Text style={s.empty}>
                                Needs at least {expenseSeasonality.minMonthsRequired} months of history to detect a pattern — {expenseSeasonality.monthsOfHistory} so far.
                            </Text>
                        ) : expenseSeasonality.peakMonths.length === 0 && expenseSeasonality.troughMonths.length === 0 ? (
                            <Text style={s.empty}>Your costs run fairly even across the year — no month stands out.</Text>
                        ) : (
                            <>
                                {expenseSeasonality.peakMonths.map(m => (
                                    <Text key={`peak-${m.month}`} style={[s.seasonWarning, { color: Colors.expense }]}>
                                        {m.monthName} costs typically run {Math.round((m.index - 1) * 100)}% above average ({m.sampleCount} year{m.sampleCount === 1 ? '' : 's'} of data) — budget ahead for it.
                                    </Text>
                                ))}
                                {expenseSeasonality.troughMonths.map(m => (
                                    <Text key={`trough-${m.month}`} style={[s.seasonWarning, { color: Colors.income }]}>
                                        {m.monthName} costs typically run {Math.round((1 - m.index) * 100)}% below average ({m.sampleCount} year{m.sampleCount === 1 ? '' : 's'} of data).
                                    </Text>
                                ))}
                            </>
                        )}
                    </View>
                )}

                {/* ── ECONOMIC ──────────────────────────────────────────── */}
                {tab === 'economic' && (
                    <>
                        <View style={s.card}>
                            <Text style={s.cardTitle}>Your Economic Assumptions</Text>
                            <Text style={s.cardSub}>
                                Beliefs you've logged about external factors (fuel, FX, interest rates, inflation…) linked to the
                                expense categories they actually affect.
                            </Text>
                            {(settings.macroAssumptions ?? []).length === 0 ? (
                                <>
                                    <Text style={s.empty}>No assumptions logged yet.</Text>
                                    {/* Most owners don't already know what an
                                        "economic assumption" is supposed to
                                        be -- these are the four things that
                                        most commonly move an SME's costs,
                                        with a plain question and where to
                                        actually check, so a blank state
                                        doesn't leave someone with no macro
                                        background stuck. */}
                                    <Text style={s.suggestTitle}>Not sure where to start? Check these first:</Text>
                                    {MACRO_ASSUMPTION_SUGGESTIONS.map(sug => (
                                        <View key={sug.driver} style={s.suggestRow}>
                                            <Text style={s.suggestLabel}>{sug.label}</Text>
                                            <Text style={s.suggestPrompt}>{sug.prompt}</Text>
                                            <Text style={s.suggestWhere}>💡 {sug.whereToCheck}</Text>
                                            {sug.driver === 'fx' && <LiveFxSuggestionCard />}
                                        </View>
                                    ))}
                                </>
                            ) : (settings.macroAssumptions ?? []).map(a => (
                                <View key={a.id} style={s.assumptionRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.concName}>{a.label}</Text>
                                        <Text style={s.assumptionMeta}>
                                            {DRIVER_LABEL[a.driver]} · {a.changePct >= 0 ? '+' : ''}{a.changePct}% over {a.periodMonths}mo
                                            {a.linkedCategories.length > 0 ? ` · linked: ${a.linkedCategories.join(', ')}` : ''}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                            <NextStepLink text="Add or edit economic assumptions" onPress={() => setCurrentScreen('macro-assumptions')} />
                        </View>

                        <View style={s.card}>
                            <Text style={s.cardTitle}>Economic Risk Insights</Text>
                            <Text style={s.cardSub}>
                                Only fires when a linked assumption is corroborated by your own rising spend — not just because a
                                headline exists.
                            </Text>
                            {!externalRisk.available ? (
                                <Text style={s.empty}>{externalRisk.reason ?? 'Not enough transaction history yet.'}</Text>
                            ) : !externalRisk.hasAssumptions ? (
                                <Text style={s.empty}>Add an assumption above to unlock this.</Text>
                            ) : externalRisk.insights.length === 0 ? (
                                <Text style={s.empty}>No economic risks are currently showing up in your spending.</Text>
                            ) : (
                                <View style={s.insightCard}>
                                    <Text style={s.insightTitle}>{topExternalInsight.title}</Text>
                                    <Text style={s.insightBody}>
                                        {externalRisk.insights.length > 1
                                            ? `+ ${externalRisk.insights.length - 1} more economic risk${externalRisk.insights.length - 1 > 1 ? 's' : ''} showing up in your spending.`
                                            : topExternalInsight.whatChanged}
                                    </Text>
                                </View>
                            )}
                            <NextStepLink text="See the full forward cost trajectory → Sales" onPress={() => navigate('transactions', { tab: 'exposure' })} />
                        </View>
                    </>
                )}

            </ScrollView>
            <FooterNav />
        </SafeAreaView>
    );
}

// Live USD→[business currency] rate, fetched from a real public FX feed
// (see macroFeed.ts / supabase/functions/macro-feed) -- a concrete,
// non-fabricated starting point for the FX macro assumption, for a
// business owner with no idea what "% change over 3 months" even means to
// estimate on their own. This device builds its own short rate history on
// repeat visits (there's no free historical FX endpoint), so the first few
// visits can only show today's rate; once at least MIN_SNAPSHOT_AGE_DAYS of
// history exists, it also suggests a real % change to prefill. The owner
// still reviews and completes the assumption on the Add form -- this never
// saves one on its own.
function LiveFxSuggestionCard() {
    const { settings, navigate, isDemoMode } = useApp();
    const currency = settings.currency;
    const [status, setStatus] = useState<'loading' | 'unavailable' | 'ready'>('loading');
    const [rate, setRate] = useState<LiveFxRate | null>(null);
    const [suggestion, setSuggestion] = useState<FxChangeSuggestion | null>(null);

    useEffect(() => {
        if (!currency || currency === 'USD') return;
        let cancelled = false;
        (async () => {
            const live = await fetchLiveFxRate('USD', currency);
            if (cancelled) return;
            if (!live) { setStatus('unavailable'); return; }

            const today = new Date().toISOString().split('T')[0];
            // Demo businesses promise "nothing will be saved" -- still show
            // the live rate, just don't persist a snapshot history for them.
            const history = isDemoMode ? [] : (await loadFxSnapshots()) ?? [];
            const change = computeFxChangeSuggestion(history, 'USD', currency, live.rate, today, 3);
            if (cancelled) return;
            setRate(live);
            setSuggestion(change);
            setStatus('ready');

            if (!isDemoMode) {
                const updated = recordFxSnapshot(history, 'USD', currency, live.rate, today);
                saveFxSnapshots(updated).catch(() => {});
            }
        })();
        return () => { cancelled = true; };
    }, [currency, isDemoMode]);

    if (!currency || currency === 'USD') return null; // no FX relevance for a business already priced in USD
    if (status === 'loading') {
        return <Text style={[s.suggestWhere, { marginTop: 4 }]}>Checking today's live USD→{currency} rate…</Text>;
    }
    // Never show a broken widget -- if the feed is unreachable, the plain
    // prompt/whereToCheck text above this already covers self-reporting.
    if (status === 'unavailable' || !rate) return null;

    return (
        <View style={s.liveFxBox}>
            <View style={s.badgeRow}>
                <Icon name="wifi" size={11} color={Colors.income} />
                <Text style={s.liveFxLabel}>LIVE MARKET RATE</Text>
            </View>
            <Text style={s.liveFxRate}>1 USD = {currency}{rate.rate.toLocaleString(undefined, { maximumFractionDigits: 2 })}</Text>
            {suggestion ? (
                <Text style={s.liveFxChange}>
                    {suggestion.changePct >= 0 ? '+' : ''}{suggestion.changePct.toFixed(1)}% vs {suggestion.actualMonthsSpanned < 1 ? 'a couple weeks ago' : `~${suggestion.actualMonthsSpanned} mo ago`} (both rates this app actually recorded)
                </Text>
            ) : (
                <Text style={s.liveFxNote}>Check back in a couple of weeks to see how much this has moved.</Text>
            )}
            <TouchableOpacity
                style={s.liveFxBtn}
                onPress={() => navigate('macro-assumptions', {
                    prefill: {
                        driver: 'fx',
                        label: `USD/${currency} exchange rate`,
                        changePct: suggestion?.changePct,
                        periodMonths: suggestion ? Math.max(1, Math.round(suggestion.actualMonthsSpanned)) : 3,
                        source: `Live market rate (${rate.source})`,
                        confidence: 'high' as const,
                    },
                })}
            >
                <Text style={s.liveFxBtnText}>Use this →</Text>
            </TouchableOpacity>
        </View>
    );
}

function RiskBadge({ risk }: { risk: 'low' | 'medium' | 'high' }) {
    const color = tierColor(risk);
    return (
        <View style={[s.riskBadge, { backgroundColor: color + '20' }]}>
            <Text style={[s.riskBadgeText, { color }]}>
                {risk === 'high' ? '⚠ HIGH' : risk === 'medium' ? '! MED' : '✓ LOW'}
            </Text>
        </View>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: Spacing.lg, paddingBottom: 100 },
    headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, gap: Spacing.md },
    backBtn: { color: Colors.primary, fontSize: 14 },
    screenTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary },

    tabBar: { flexDirection: 'row', backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
    tab: { flex: 1, paddingVertical: 12, alignItems: 'center', gap: 3, flexDirection: 'row', justifyContent: 'center' },
    tabActive: { borderBottomWidth: 3, borderBottomColor: Colors.primary },
    tabText: { fontSize: 11.5, color: Colors.textMuted, fontWeight: '600' },
    tabTextActive: { color: Colors.primary },

    sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8, marginTop: 4 },
    card: { backgroundColor: Colors.surface, borderRadius: 14, padding: Spacing.lg, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
    cardSub: { fontSize: 12, color: Colors.textMuted, lineHeight: 17, marginBottom: 12 },
    empty: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 8 },

    exposureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.border },
    exposureLabel: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    exposureDetail: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginTop: 2 },

    miniBarTrack: { height: 5, backgroundColor: Colors.border, borderRadius: 3, flex: 1 },
    miniBarFill: { height: 5, borderRadius: 3 },

    radarRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
    radarDot: { fontSize: 12, marginTop: 2 },
    radarLabel: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    radarSummary: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginTop: 2 },

    concRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 10 },
    concName: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
    concPct: { fontSize: 11, color: Colors.textMuted, marginLeft: 6 },
    riskBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    riskBadgeText: { fontSize: 10.5, fontWeight: '700' },

    seasonRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
    seasonCell: { flex: 1, alignItems: 'center', paddingVertical: 8, borderWidth: 1, borderRadius: 8 },
    seasonMonth: { fontSize: 10, color: Colors.textSecondary, marginBottom: 2 },
    seasonRiskIcon: { fontSize: 13, fontWeight: '700' },
    seasonWarning: { fontSize: 12, lineHeight: 18, marginTop: 6 },

    assumptionRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
    assumptionMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2, lineHeight: 16 },

    suggestTitle: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, marginTop: 10, marginBottom: 8 },
    suggestRow: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.border },
    suggestLabel: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    suggestPrompt: { fontSize: 12, color: Colors.textSecondary, marginTop: 2, lineHeight: 17 },
    suggestWhere: { fontSize: 11, color: Colors.textMuted, marginTop: 4, lineHeight: 15 },
    liveFxBox: { marginTop: 10, padding: 10, borderRadius: Radius.md, backgroundColor: Colors.income + '10', borderWidth: 1, borderColor: Colors.income + '30' },
    badgeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    liveFxLabel: { fontSize: 9.5, fontWeight: '700', color: Colors.income, letterSpacing: 0.5 },
    liveFxRate: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginTop: 4 },
    liveFxChange: { fontSize: 11, color: Colors.textSecondary, marginTop: 3, lineHeight: 15 },
    liveFxNote: { fontSize: 11, color: Colors.textMuted, marginTop: 3, fontStyle: 'italic' },
    liveFxBtn: { marginTop: 8, alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12, borderRadius: Radius.sm, backgroundColor: Colors.income },
    liveFxBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },

    insightCard: { backgroundColor: Colors.bg, borderRadius: 10, padding: 12, marginBottom: 8 },
    insightTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
    insightBody: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginBottom: 4 },
});
