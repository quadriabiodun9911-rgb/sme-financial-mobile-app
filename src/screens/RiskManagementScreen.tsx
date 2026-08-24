import React, { useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
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
    return (
        <View style={s.miniBarTrack}>
            <View style={[s.miniBarFill, { width: `${Math.min(100, pct)}%`, backgroundColor: color }]} />
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
    const { transactions, loans, finance, inventory, settings, navigate, setCurrentScreen, navParams } = useApp();
    const currency = settings.currency || '₦';

    const [tab, setTab] = useState<Tab>(
        (['overview', 'concentration', 'seasonal', 'economic'] as Tab[]).includes(navParams?.tab as Tab) ? (navParams!.tab as Tab) : 'overview'
    );

    const risk         = useMemo(() => computeRiskScore(finance, loans, transactions, inventory), [finance, loans, transactions, inventory]);
    const riskRadar     = useMemo(() => computeRiskRadar(transactions, loans, settings?.macroAssumptions ?? []), [transactions, loans, settings?.macroAssumptions]);
    const customerConc  = useMemo(() => computeCustomerConcentration(transactions), [transactions]);
    const supplierConc  = useMemo(() => computeSupplierConcentration(transactions), [transactions]);
    const lenderConc    = useMemo(() => computeLenderConcentration(loans), [loans]);
    const seasonal      = useMemo(() => computeSeasonalRisk(transactions), [transactions]);
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
                        <View style={s.card}>
                            <Text style={s.cardTitle}>Business Risk Score</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                                <RadialGauge displayValue={String(risk.score)} label={risk.grade} progress={risk.score / 100} color={riskLabel(risk.score).color} size={80} strokeWidth={8} />
                                <View style={{ flex: 1, marginLeft: 16 }}>
                                    <Text style={{ fontSize: 16, fontWeight: '700', color: riskLabel(risk.score).color, marginBottom: 4 }}>
                                        {riskLabel(risk.score).label}
                                    </Text>
                                    <Text style={s.cardSub}>Lower score = more risk. Above 70 is solid.</Text>
                                </View>
                            </View>
                            {risk.factors.map(f => (
                                <View key={f.name} style={{ marginBottom: 10 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3 }}>
                                        <Text style={[s.pillarDot, { color: f.status === 'good' ? Colors.income : f.status === 'warning' ? Colors.warning : Colors.expense }]}>●</Text>
                                        <Text style={s.pillarName}>{f.name}</Text>
                                        <Text style={[s.pillarScore, { color: f.status === 'good' ? Colors.income : f.status === 'warning' ? Colors.warning : Colors.expense }]}>{f.score}/100</Text>
                                    </View>
                                    <MiniBar pct={f.score} color={f.status === 'good' ? Colors.income : f.status === 'warning' ? Colors.warning : Colors.expense} />
                                    <Text style={s.factorExplain}>{f.explanation}</Text>
                                </View>
                            ))}
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
                            {customerConc.some(c => c.risk === 'high') && (
                                <NextStepLink text="Review this customer's invoices" onPress={() => navigate('invoices')} />
                            )}
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
                        </View>

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
                                <Text style={s.empty}>No assumptions logged yet.</Text>
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

    pillarDot: { fontSize: 10, marginRight: 6 },
    pillarName: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
    pillarScore: { fontSize: 12, fontWeight: '700' },
    factorExplain: { fontSize: 11, color: Colors.textMuted, lineHeight: 15, marginTop: 3 },

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

    insightCard: { backgroundColor: Colors.bg, borderRadius: 10, padding: 12, marginBottom: 8 },
    insightTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
    insightBody: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginBottom: 4 },
});
