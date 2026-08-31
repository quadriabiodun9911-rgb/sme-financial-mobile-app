import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { computeCostExposure, CostCategorySignal, ExposureBand } from '../utils/costExposure';
import { computeCostDecisions, CostDecisionAction } from '../utils/costDecisions';
import { computeCostExposureForecast } from '../utils/costExposureForecast';
import { computeExternalRiskInsights, ExternalRiskInsight } from '../utils/externalRiskInsights';
import { computeLaborProductivity } from '../utils/laborProductivity';
import { computeExpenseLeaks, ExpenseLeakResult } from '../utils/expenseLeakDetection';
import { computeUnusualSpending, UnusualSpendingResult } from '../utils/unusualSpending';
import { computeExpenseIntelligence, ExpenseIntelligenceResult } from '../utils/expenseIntelligence';
import RadialGauge from './RadialGauge';
import BarList from './BarList';
import GroupedBarChart from './GroupedBarChart';

const DECISION_COLOR: Record<CostDecisionAction, string> = {
    cut: Colors.expense,
    negotiate: Colors.warning,
};
const DECISION_LABEL: Record<CostDecisionAction, string> = {
    cut: 'Cut',
    negotiate: 'Negotiate',
};

const BAND_COLOR: Record<ExposureBand, string> = {
    Excellent: Colors.income,
    Strong: '#10b981',
    Moderate: Colors.warning,
    Weak: '#fb923c',
    Critical: Colors.expense,
};

function fmtCompact(currency: string, amount: number): string {
    const sign = amount < 0 ? '-' : '';
    const abs = Math.abs(amount);
    if (abs >= 1000000) return `${sign}${currency}${(abs / 1000000).toFixed(1)}M`;
    if (abs >= 1000) return `${sign}${currency}${(abs / 1000).toFixed(0)}K`;
    return `${sign}${currency}${Math.round(abs).toLocaleString()}`;
}

export default function CostExposureTab() {
    const { transactions, settings, navigate, staff } = useApp();
    const currency = settings.currency || '₦';

    const result = useMemo(() => computeCostExposure(transactions), [transactions]);
    const decisions = useMemo(() => computeCostDecisions(result, currency), [result, currency]);
    const externalRisk = useMemo(
        () => computeExternalRiskInsights(transactions, settings.macroAssumptions ?? []),
        [transactions, settings.macroAssumptions]
    );
    const forecast = useMemo(
        () => computeCostExposureForecast(transactions, settings.macroAssumptions ?? [], 6),
        [transactions, settings.macroAssumptions]
    );
    const labor = useMemo(() => computeLaborProductivity(transactions, staff ?? []), [transactions, staff]);
    const expenseLeaks = useMemo(() => computeExpenseLeaks(transactions, currency), [transactions, currency]);
    const unusualSpending = useMemo(() => computeUnusualSpending(transactions, currency), [transactions, currency]);
    const expenseIntelligence = useMemo(() => computeExpenseIntelligence(transactions, currency, 6), [transactions, currency]);

    if (!result.available) {
        return (
            <View>
                <View style={s.emptyState}>
                    <Text style={s.emptyTitle}>Not enough history yet</Text>
                    <Text style={s.emptySub}>{result.reason}</Text>
                </View>
                {/* Labor Productivity needs far less history than the cost-
                    concentration trend above (one month with revenue and
                    active staff vs. two full comparison windows), so it can
                    often say something real even while the rest of this tab
                    is still waiting on data. */}
                {labor.available && <LaborProductivityCard labor={labor} currency={currency} />}
                {unusualSpending.available && unusualSpending.flags.length > 0 && (
                    <UnusualSpendingCard result={unusualSpending} />
                )}
                {expenseLeaks.available && expenseLeaks.recurringGroups.length > 0 && (
                    <ExpenseLeakCard result={expenseLeaks} currency={currency} />
                )}
            </View>
        );
    }

    const bandColor = BAND_COLOR[result.band];

    return (
        <View>
            <Text style={s.subtitle}>
                A rising category cost doesn't show up as a single alarming number — it shows up as a slowly growing
                share of every revenue unit. This compares each expense category's share of revenue over {result.periodLabel.toLowerCase()},
                and projects what happens to profit if the fastest-growing one keeps climbing at its own pace.
            </Text>

            {/* Score card */}
            <View style={[s.scoreCard, { borderTopColor: bandColor }]}>
                <Text style={s.scoreLabel}>Cost Exposure</Text>
                <RadialGauge displayValue={String(result.score)} label={result.band} progress={result.score / 100} color={bandColor} size={104} strokeWidth={9} />
                <Text style={s.verdict}>{result.verdict}</Text>
            </View>

            {/* Cost Decisions — the DECIDE-stage call itself: cut or
                negotiate, not just "this is rising." */}
            {decisions.length > 0 && (
                <View style={s.card}>
                    <Text style={s.cardTitle}>Cost Decisions</Text>
                    {decisions.map(d => (
                        <View key={d.category} style={s.flagRow}>
                            <Text style={s.flagBullet}>•</Text>
                            <Text style={s.flagText}>
                                <Text style={{ fontWeight: '800', color: DECISION_COLOR[d.action] }}>{DECISION_LABEL[d.action]}: </Text>
                                {d.detail}
                            </Text>
                        </View>
                    ))}
                </View>
            )}

            {/* Forward Cost Trajectory — every category still flagged as
                rising, projected forward together (not just the single
                worst one), using the owner's own stated external
                expectations wherever one is linked to a rising category. */}
            {forecast.available && forecast.drivers.length > 0 && (
                <View style={s.impactCard}>
                    <Text style={s.cardTitle}>📈 Forward Cost Trajectory — Next {forecast.horizonMonths} Months</Text>
                    <Text style={s.impactText}>{forecast.verdict}</Text>

                    <GroupedBarChart
                        height={90}
                        labels={forecast.months.map(m => `+${m.monthIndex}mo`)}
                        series={[
                            { label: 'Projected Monthly Profit', color: Colors.expense, values: forecast.months.map(m => m.projectedMonthlyProfit) },
                        ]}
                    />

                    <Text style={[s.cardTitle, { fontSize: 12, marginTop: 14, marginBottom: 8 }]}>What's driving this projection</Text>
                    {forecast.drivers.map(d => (
                        <View key={d.category} style={s.driverRow}>
                            <View style={s.flex1}>
                                <Text style={s.driverCategory}>{d.category}</Text>
                                <Text style={s.driverSource}>
                                    {d.source === 'external'
                                        ? `Projected from your "${d.externalLabel}" assumption`
                                        : 'Projected from its own recent trend'}
                                </Text>
                            </View>
                            <View style={[s.driverBadge, { backgroundColor: d.source === 'external' ? Colors.primary + '20' : Colors.textMuted + '20' }]}>
                                <Text style={[s.driverBadgeText, { color: d.source === 'external' ? Colors.primary : Colors.textMuted }]}>
                                    {d.source === 'external' ? 'External' : 'Internal'}
                                </Text>
                            </View>
                        </View>
                    ))}
                    <TouchableOpacity onPress={() => navigate('budget')}>
                        <Text style={s.impactLink}>Set a budget alert for these categories →</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Flags */}
            {result.flags.length > 0 && (
                <View style={s.flagsCard}>
                    <Text style={s.cardTitle}>Categories Growing Faster Than Revenue</Text>
                    {result.flags.map((flag, i) => (
                        <View key={i} style={s.flagRow}>
                            <Text style={s.flagBullet}>•</Text>
                            <Text style={s.flagText}>{flag}</Text>
                        </View>
                    ))}
                </View>
            )}

            {/* External Risk — turns "why is this rising" from a headline the
                owner reads elsewhere into a business-specific insight, using
                whatever macro assumptions they've linked to a category that's
                actually rising in their own numbers. */}
            {externalRisk.insights.map((insight, i) => (
                <ExternalRiskCard key={i} insight={insight} currency={currency} />
            ))}

            {result.flags.length > 0 && !externalRisk.hasAssumptions && (
                <TouchableOpacity style={s.macroCta} onPress={() => navigate('macro-assumptions')}>
                    <Text style={s.macroCtaText}>
                        Know why? Tell Quad360 what's happening externally (energy prices, FX, inflation...) to turn this into a specific early warning →
                    </Text>
                </TouchableOpacity>
            )}

            {/* Share of revenue, ranked -- the same categories as the table
                below, but the shape a reader actually wants first: who's
                biggest right now. */}
            <View style={s.card}>
                <Text style={s.cardTitle}>Share of Revenue, Ranked</Text>
                <BarList
                    color={Colors.expense}
                    items={result.signals
                        .slice()
                        .sort((a, b) => b.currentPctOfRevenue - a.currentPctOfRevenue)
                        .map(sig => ({
                            label: sig.category,
                            value: sig.currentPctOfRevenue,
                            displayValue: `${sig.currentPctOfRevenue.toFixed(1)}%`,
                        }))}
                />
            </View>

            {/* Signal comparison table -- "% of Spend" answers a different
                question than "% of Revenue": of everything actually paid out
                this period, how much went here. A category can be a small
                share of revenue but still dominate the expense side (e.g. a
                low-margin business), and that's exactly the case "% of
                Revenue" alone hides. */}
            <View style={s.card}>
                <Text style={s.cardTitle}>Every Category — {result.periodLabel}</Text>
                <View style={s.tableHeader}>
                    <Text style={[s.th, { flex: 1.3 }]}>Category</Text>
                    <Text style={s.th}>Prior %</Text>
                    <Text style={s.th}>Now %</Text>
                    <Text style={s.th}>Change</Text>
                    <Text style={s.th}>% of Spend</Text>
                </View>
                {result.signals.map(sig => <SignalRow key={sig.category} signal={sig} />)}
            </View>

            {/* Labor Productivity -- pairs "salaries are X% of revenue" with
                the headcount actually behind it, so the number points to a
                decision (cut cost, or grow revenue with the same team)
                instead of sitting alone as a percentage. */}
            {labor.available && <LaborProductivityCard labor={labor} currency={currency} />}

            {/* Unusual Spending -- a sudden one-off spike or brand-new
                category this month, distinct from the cost-concentration
                view above (which needs 6+ months and only catches a
                SUSTAINED multi-month drift, not a single unusual month). */}
            {unusualSpending.available && unusualSpending.flags.length > 0 && (
                <UnusualSpendingCard result={unusualSpending} />
            )}

            {/* Expense Leak Detection -- pattern-detected from raw vendor
                history (no manual "mark as recurring" needed), distinct
                from the labor/category views above which only look at
                THIS period's spend. */}
            {expenseLeaks.available && expenseLeaks.recurringGroups.length > 0 && (
                <ExpenseLeakCard result={expenseLeaks} currency={currency} />
            )}

            {/* Expense Intelligence -- each recurring category's own
                growth rate held directly against revenue's growth rate
                over the same window ("Software increased 37% while
                revenue increased 8%"), not the percentage-POINT-of-revenue
                framing the cost-concentration card above uses. */}
            {expenseIntelligence.available && expenseIntelligence.categories.length > 0 && (
                <ExpenseIntelligenceCard result={expenseIntelligence} currency={currency} />
            )}
        </View>
    );
}

function LaborProductivityCard({ labor, currency }: { labor: ReturnType<typeof computeLaborProductivity>; currency: string }) {
    if (!labor.available) return null;
    return (
        <View style={s.card}>
            <Text style={s.cardTitle}>Labor Productivity — {labor.periodLabel}</Text>
            <View style={s.laborStatRow}>
                <View style={s.laborStat}>
                    <Text style={s.laborStatValue}>{fmtCompact(currency, labor.revenuePerEmployee)}</Text>
                    <Text style={s.laborStatLabel}>Revenue / Employee</Text>
                </View>
                <View style={s.laborStat}>
                    <Text style={s.laborStatValue}>{labor.laborCostPctOfRevenue.toFixed(0)}%</Text>
                    <Text style={s.laborStatLabel}>Salaries / Revenue</Text>
                </View>
                <View style={s.laborStat}>
                    <Text style={s.laborStatValue}>{labor.activeStaffCount}</Text>
                    <Text style={s.laborStatLabel}>Active Staff</Text>
                </View>
            </View>
            <Text style={s.laborText}>
                {labor.activeStaffCount} active staff member{labor.activeStaffCount === 1 ? '' : 's'} generated{' '}
                {fmtCompact(currency, labor.revenue)} in revenue this period, or {fmtCompact(currency, labor.revenuePerEmployee)} each.
                Salaries took {labor.laborCostPctOfRevenue.toFixed(0)}% of that revenue -- the same headcount either costs less,
                or the business grows revenue without adding to it.
            </Text>
            {labor.note && (
                <View style={[s.laborNoteBox]}>
                    <Text style={s.laborNoteText}>{labor.note}</Text>
                </View>
            )}
        </View>
    );
}

function UnusualSpendingCard({ result }: { result: UnusualSpendingResult }) {
    return (
        <View style={s.card}>
            <Text style={s.cardTitle}>⚠️ Unusual Spending This Month</Text>
            {result.flags.map((flag, i) => (
                <View key={i} style={[s.laborNoteBox, { borderLeftColor: Colors.warning, borderLeftWidth: 3 }]}>
                    <Text style={s.laborNoteText}>{flag.message}</Text>
                </View>
            ))}
        </View>
    );
}

function ExpenseIntelligenceCard({ result, currency }: { result: ExpenseIntelligenceResult; currency: string }) {
    return (
        <View style={s.card}>
            <Text style={s.cardTitle}>Recurring Expense Analysis — Last {result.windowMonths} Months</Text>
            {result.categories.slice(0, 6).map(cat => (
                <View key={cat.category} style={s.driverRow}>
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textPrimary }}>{cat.category}</Text>
                        <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 1 }}>{fmtCompact(currency, cat.monthlyRate)}/month</Text>
                    </View>
                    {cat.spendGrowthPct !== null && (
                        <Text style={{ fontSize: 12, fontWeight: '700', color: cat.concern ? Colors.expense : Colors.textSecondary }}>
                            {cat.spendGrowthPct >= 0 ? '+' : ''}{cat.spendGrowthPct.toFixed(0)}%
                        </Text>
                    )}
                </View>
            ))}
            {result.categories.filter(c => c.concern).map(cat => (
                <View key={`concern-${cat.category}`} style={[s.laborNoteBox, { borderLeftColor: Colors.expense, borderLeftWidth: 3 }]}>
                    <Text style={s.laborNoteText}>{cat.narrative}</Text>
                </View>
            ))}
        </View>
    );
}

function ExpenseLeakCard({ result, currency }: { result: ExpenseLeakResult; currency: string }) {
    return (
        <View style={s.card}>
            <Text style={s.cardTitle}>Recurring Charges &amp; Expense Leaks</Text>
            <Text style={s.laborText}>{result.summary}</Text>

            {result.leaks.map((flag, i) => (
                <View key={i} style={[s.laborNoteBox, { borderLeftColor: flag.severity === 'warning' ? Colors.warning : Colors.textMuted, borderLeftWidth: 3 }]}>
                    <Text style={s.laborNoteText}>{flag.message}</Text>
                </View>
            ))}

            <View style={s.tableHeader}>
                <Text style={[s.th, { flex: 1.3 }]}>Vendor</Text>
                <Text style={s.th}>Months</Text>
                <Text style={s.th}>Latest</Text>
                <Text style={s.th}>Change</Text>
            </View>
            {result.recurringGroups.map(group => (
                <View key={group.vendorKey} style={s.tableRow}>
                    <Text style={[s.td, { flex: 1.3 }]} numberOfLines={1}>{group.displayName}</Text>
                    <Text style={s.td}>{group.occurrenceCount}</Text>
                    <Text style={s.td}>{fmtCompact(currency, group.latestAmount)}</Text>
                    <Text style={[s.td, { color: group.amountGrowthPct !== null && group.amountGrowthPct > 15 ? Colors.expense : Colors.textSecondary }]}>
                        {group.amountGrowthPct === null ? '—' : `${group.amountGrowthPct >= 0 ? '+' : ''}${group.amountGrowthPct.toFixed(0)}%`}
                    </Text>
                </View>
            ))}
        </View>
    );
}

function ExternalRiskCard({ insight, currency }: { insight: ExternalRiskInsight; currency: string }) {
    return (
        <View style={s.externalCard}>
            <Text style={s.externalTitle}>{insight.title}</Text>
            <Text style={s.externalText}>{insight.whatChanged}</Text>
            <Text style={s.externalText}>{insight.whyItMatters}</Text>
            {insight.projectedImpact && (
                <Text style={s.externalText}>
                    At that pace, monthly {insight.projectedImpact.category} spend would move from{' '}
                    <Text style={s.impactBold}>{fmtCompact(currency, insight.projectedImpact.currentMonthlySpend)}</Text> to{' '}
                    <Text style={s.impactBold}>{fmtCompact(currency, insight.projectedImpact.projectedNextPeriodMonthlySpend)}</Text>
                    {' '}— cutting monthly profit from{' '}
                    <Text style={s.impactBold}>{fmtCompact(currency, insight.projectedImpact.currentMonthlyProfit)}</Text> to roughly{' '}
                    <Text style={[s.impactBold, { color: Colors.expense }]}>{fmtCompact(currency, insight.projectedImpact.projectedMonthlyProfit)}</Text>.
                </Text>
            )}
            <Text style={s.externalText}>{insight.whatCouldHappenNext}</Text>

            <Text style={s.externalSubhead}>Recommended actions</Text>
            {insight.recommendedActions.map((action, i) => (
                <View key={i} style={s.flagRow}>
                    <Text style={s.flagBullet}>{i + 1}.</Text>
                    <Text style={s.flagText}>{action}</Text>
                </View>
            ))}

            <View style={s.externalFooter}>
                <Text style={s.externalFooterText}>💳 {insight.creditReadinessImpact}</Text>
                <Text style={s.externalFooterText}>🌱 {insight.growthImpact}</Text>
            </View>
        </View>
    );
}

function SignalRow({ signal }: { signal: CostCategorySignal }) {
    const changeColor = signal.pctPointChange <= 0 ? Colors.income : signal.pctPointChange < 2 ? Colors.textSecondary : Colors.expense;

    return (
        <View style={s.tableRow}>
            <Text style={[s.td, { flex: 1.3, color: Colors.textPrimary, fontWeight: '700' }]}>{signal.category}</Text>
            <Text style={s.td}>{signal.priorPctOfRevenue.toFixed(1)}%</Text>
            <Text style={s.td}>{signal.currentPctOfRevenue.toFixed(1)}%</Text>
            <Text style={[s.td, { color: changeColor, fontWeight: '700' }]}>
                {signal.pctPointChange >= 0 ? '+' : ''}{signal.pctPointChange.toFixed(1)}pp
            </Text>
            <Text style={s.td}>{signal.currentPctOfTotalExpense.toFixed(0)}%</Text>
        </View>
    );
}

const s = StyleSheet.create({
    subtitle: { fontSize: 12, color: Colors.textMuted, marginBottom: 16, lineHeight: 17 },

    emptyState: { alignItems: 'center', padding: 32, backgroundColor: Colors.surface, borderRadius: 14 },
    emptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
    emptySub: { fontSize: 12, color: Colors.textMuted, textAlign: 'center' },

    scoreCard: { backgroundColor: Colors.surface, borderRadius: 14, borderTopWidth: 4, padding: 20, marginBottom: 14, alignItems: 'center' },
    scoreLabel: { fontSize: 13, color: Colors.textSecondary, marginBottom: 10 },
    verdict: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, marginTop: 12 },

    impactCard: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 14, borderLeftWidth: 4, borderLeftColor: Colors.warning },
    impactText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20, marginBottom: 10 },
    impactBold: { fontWeight: '800', color: Colors.textPrimary },
    impactLink: { fontSize: 12.5, color: Colors.primary, fontWeight: '700', marginTop: 10 },

    flex1: { flex: 1 },
    driverRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
    driverCategory: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
    driverSource: { fontSize: 11, color: Colors.textMuted },
    driverBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    driverBadgeText: { fontSize: 10, fontWeight: '700' },

    flagsCard: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 14, borderLeftWidth: 4, borderLeftColor: Colors.expense },
    flagRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    flagBullet: { fontSize: 12, color: Colors.textMuted },
    flagText: { flex: 1, fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },

    card: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 14 },
    cardTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginBottom: 10 },

    externalCard: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: Colors.warning },
    externalTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginBottom: 10 },
    externalText: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 19, marginBottom: 8 },
    externalSubhead: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', marginTop: 6, marginBottom: 8 },
    externalFooter: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border, gap: 6 },
    externalFooterText: { fontSize: 11.5, color: Colors.textMuted, lineHeight: 16 },

    macroCta: { backgroundColor: Colors.primary + '12', borderRadius: 12, padding: 14, marginBottom: 14 },
    macroCtaText: { fontSize: 12.5, color: Colors.primary, fontWeight: '700', lineHeight: 18 },

    tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border, paddingBottom: 8, marginBottom: 6 },
    th: { flex: 1, fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase' },
    tableRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
    td: { flex: 1, fontSize: 12, color: Colors.textSecondary },

    laborStatRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, gap: 8 },
    laborStat: { flex: 1, alignItems: 'center', backgroundColor: Colors.bg, borderRadius: 10, paddingVertical: 10 },
    laborStatValue: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
    laborStatLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 3, textAlign: 'center' },
    laborText: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 19 },
    laborNoteBox: { marginTop: 10, backgroundColor: Colors.warning + '15', borderRadius: 10, padding: 10 },
    laborNoteText: { fontSize: 11.5, color: Colors.textSecondary, lineHeight: 16 },
});
