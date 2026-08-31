import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import LowDataNotice from '../components/LowDataNotice';
import Icon from '../components/ui/Icon';
import { computeRiskScore, RISK_BAND_STYLE, getMonthlyExpenseAverage } from '../utils/finance';
import { computeRiskRadar, RiskLevel } from '../utils/riskRadar';
import { computeReadinessDelta } from '../utils/readinessHistory';
import { computeBusinessExposure, computeBusinessResilience, describeHealthResilienceGap, ExposureLevel } from '../utils/businessExposure';
import { performFinancialDiagnosis } from '../utils/financialDiagnosisEngine';
import { computeFinancialHealthPillars, PillarStatus } from '../utils/financialHealthPillars';
import { analyzeTrend } from '../utils/trendAnalysis';
import { buildFinancialBehaviour } from '../utils/businessFinancialDNA';
import { computeExpenseLeaks } from '../utils/expenseLeakDetection';
import { computeUnusualSpending } from '../utils/unusualSpending';
import { generateActionPlan } from '../utils/actionRecommendationEngine';
import { calculateGoalBridge, mapSavedGoalToBridge } from '../utils/goalBridgeEngine';
import { assessGoalRisk, GoalRiskAssessment } from '../utils/goalRiskLinkage';
import { GoalStatus } from '../types';

const BAND_COLOR: Record<string, string> = {
    Excellent: Colors.income,
    Strong: '#10b981',
    Moderate: Colors.warning,
    Weak: '#fb923c',
    Critical: Colors.expense,
};

const RISK_LEVEL_META: Record<RiskLevel, { color: string; dot: string }> = {
    high:      { color: Colors.expense,   dot: '🔴' },
    medium:    { color: Colors.warning,   dot: '🟡' },
    low:       { color: Colors.income,    dot: '🟢' },
    'no-data': { color: Colors.textMuted, dot: '⚪' },
};

const FACTOR_STATUS_COLOR: Record<string, string> = { good: Colors.income, warning: Colors.warning, danger: Colors.expense };
const PILLAR_STATUS_COLOR: Record<PillarStatus, string> = { good: Colors.income, warning: Colors.warning, danger: Colors.expense };

const EXPOSURE_LEVEL_META: Record<ExposureLevel, { color: string; dot: string }> = {
    high:    { color: Colors.expense,  dot: '🔴' },
    medium:  { color: Colors.warning,  dot: '🟡' },
    low:     { color: Colors.income,   dot: '🟢' },
    unknown: { color: Colors.textMuted, dot: '⚪' },
};

const RESILIENCE_BAND_COLOR: Record<string, string> = {
    Strong: Colors.income,
    Moderate: Colors.warning,
    Weak: Colors.expense,
};

const READINESS_BAND_COLORS: Record<GoalRiskAssessment['readinessBand'], string> = {
    Strong: Colors.income,
    Moderate: Colors.warning,
    Weak: Colors.expense,
};

const GOAL_STATUS_META: Record<GoalStatus, { label: string; color: string }> = {
    on_track:  { label: 'On Track',  color: Colors.income },
    at_risk:   { label: 'At Risk',   color: Colors.warning },
    off_track: { label: 'Off Track', color: Colors.expense },
    achieved:  { label: 'Achieved',  color: Colors.primary },
};

/**
 * The Scoreboard — "how is my business doing right now," in one glance.
 * Every prior audit of this app found the same real signals (health score,
 * risk radar, readiness trend, goal progress) scattered across the
 * Dashboard, Credit-Worthiness, and Business Passport, with Passport itself
 * deliberately framed as a lender-facing report rather than an everyday
 * check-in. This is a thin composition layer like Passport is -- it computes
 * nothing new, it just pulls the same canonical numbers (computeRiskScore,
 * computeRiskRadar, computeReadinessDelta, goals) into one non-lender-framed
 * screen, and links onward to each one's full detail screen rather than
 * duplicating it.
 */
export default function ScoreboardScreen() {
    const { transactions, invoices, loans, inventory, finance, settings, goals, readinessHistory, navigate, setCurrentScreen, assets } = useApp();
    const { currency } = settings;

    // Every colored dot on this screen already carries a real, computed
    // explanation (RiskFactor.explanation / ExposureFactor.detail /
    // RiskCategory.summary) -- it just wasn't surfaced anywhere. Tapping a
    // chip reveals its own real text right underneath it; tapping it again
    // (or another chip) closes it. One shared key namespaced by section so
    // only one explanation is open across the whole screen at a time.
    const [expandedChip, setExpandedChip] = useState<string | null>(null);
    const toggleChip = (key: string) => setExpandedChip(prev => (prev === key ? null : key));

    const risk = useMemo(() => computeRiskScore(finance, loans, transactions, inventory), [finance, loans, transactions, inventory]);
    const bandMeta = useMemo(() => ({ ...RISK_BAND_STYLE[risk.band], color: BAND_COLOR[risk.band] }), [risk.band]);
    const readinessDelta = useMemo(() => computeReadinessDelta(readinessHistory), [readinessHistory]);

    const riskRadar = useMemo(
        () => computeRiskRadar(transactions, loans, settings?.macroAssumptions ?? [], new Date(), assets),
        [transactions, loans, settings?.macroAssumptions, assets],
    );

    const exposure = useMemo(
        () => computeBusinessExposure(transactions, loans, inventory, settings?.macroAssumptions ?? [], finance, settings?.nextTaxDeadline, currency),
        [transactions, loans, inventory, settings?.macroAssumptions, finance, settings?.nextTaxDeadline, currency],
    );
    const resilience = useMemo(() => computeBusinessResilience(exposure), [exposure]);
    const resilienceGap = useMemo(() => describeHealthResilienceGap(risk.score, resilience), [risk.score, resilience]);

    // Financial Health Score, regrouped into the product-vision document's
    // 8-pillar taxonomy -- see financialHealthPillars.ts's own doc comment
    // for why this is a relabeling of the SAME risk/resilience numbers
    // above, not a second score. The three narrative extras are each cheap,
    // pure, transactions-only reads (no gating needed the way the goal-risk
    // diagnosis above requires 5+ transactions).
    const trend = useMemo(() => analyzeTrend(transactions), [transactions]);
    const behaviour = useMemo(() => buildFinancialBehaviour(transactions, loans, trend), [transactions, loans, trend]);
    const expenseLeaks = useMemo(() => computeExpenseLeaks(transactions, currency), [transactions, currency]);
    const unusualSpending = useMemo(() => computeUnusualSpending(transactions, currency), [transactions, currency]);
    const pillars = useMemo(
        () => computeFinancialHealthPillars(risk, transactions, resilience, {
            revenueVolatility: behaviour.revenueVolatility,
            expenseLeakCount: expenseLeaks.available ? expenseLeaks.recurringGroups.length : undefined,
            unusualSpendingCount: unusualSpending.available ? unusualSpending.flags.length : undefined,
        }),
        [risk, transactions, resilience, behaviour, expenseLeaks, unusualSpending],
    );

    // Same worsened/improved factors CreditWorthinessScreen lists in full,
    // condensed into the single flowing sentence next to the score itself
    // ("fell from 76 to 72 primarily because...") -- the list view answers
    // "what changed", this answers "why", right where the score already is.
    const scoreChangeReason = useMemo(() => {
        if (!readinessDelta || readinessDelta.trend === 'stable') return null;
        const movers = readinessDelta.trend === 'declining' ? readinessDelta.worsenedFactors : readinessDelta.improvedFactors;
        if (movers.length === 0) return null;
        const names = movers.slice(0, 2).map(f => f.name.toLowerCase());
        return names.length === 1 ? names[0] : `${names[0]} and ${names[1]}`;
    }, [readinessDelta]);

    const goalCounts = useMemo(() => {
        const counts: Record<GoalStatus, number> = { on_track: 0, at_risk: 0, off_track: 0, achieved: 0 };
        goals.forEach(g => { counts[g.status] = (counts[g.status] ?? 0) + 1; });
        return counts;
    }, [goals]);
    const activeGoals = useMemo(() => goals.filter(g => g.status !== 'achieved').slice(0, 3), [goals]);

    // "What could stop THIS goal" for each goal shown above -- same real
    // diagnosis/risk-radar/bridge pipeline GoalsScreen's Plan modal already
    // runs, gated the same way (< 5 transactions makes the diagnosis too
    // noisy to be worth it). Kept to the 3 goals actually rendered rather
    // than every goal, since this recomputes a full goal-bridge per goal.
    const goalRiskByGoalId = useMemo(() => {
        if (transactions.length < 5 || activeGoals.length === 0) return {};
        const diagnosis = performFinancialDiagnosis(transactions, invoices, finance.cashBalance, getMonthlyExpenseAverage(finance.expense, transactions), currency, loans, inventory, assets);
        const tactics = generateActionPlan(diagnosis, diagnosis.metrics, currency);
        const allTactics = [...tactics.immediateActions, ...tactics.shortTermActions, ...tactics.strategicActions];
        const map: Record<string, GoalRiskAssessment> = {};
        for (const g of activeGoals) {
            const bridge = calculateGoalBridge(mapSavedGoalToBridge(g), diagnosis.metrics, allTactics, currency);
            map[g.id] = assessGoalRisk(g.type, diagnosis.diagnoses, riskRadar, bridge.successProbability);
        }
        return map;
    }, [transactions, invoices, finance, currency, loans, inventory, assets, activeGoals, riskRadar]);

    // The single most useful thing to say about goals at a glance: which one
    // is least ready, in its own words -- not a repeat of every goal's list.
    const mostAtRiskGoal = useMemo(() => {
        let worst: { goal: typeof activeGoals[number]; risk: GoalRiskAssessment } | null = null;
        for (const g of activeGoals) {
            const risk = goalRiskByGoalId[g.id];
            if (!risk) continue;
            if (!worst || risk.growthReadiness < worst.risk.growthReadiness) worst = { goal: g, risk };
        }
        return worst;
    }, [activeGoals, goalRiskByGoalId]);

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
                <View style={s.titleRow}>
                    <Icon name="activity" size={20} color={Colors.textPrimary} />
                    <Text style={s.title}>Scoreboard</Text>
                </View>
                <Text style={s.subtitle}>
                    Everything Quad360 already knows about your business, in one glance — updated live, nothing to prepare.
                </Text>

                <LowDataNotice transactionCount={transactions.length} label="your Scoreboard" />

                {/* Health score hero */}
                <View style={[s.scoreCard, { borderColor: bandMeta.color }]}>
                    <Text style={s.scoreCardLabel}>BUSINESS HEALTH SCORE</Text>
                    <View style={s.scoreRow}>
                        <Text style={[s.scoreValue, { color: bandMeta.color }]}>{Math.round(risk.score)}</Text>
                        <View style={[s.bandBadge, { backgroundColor: bandMeta.color + '22' }]}>
                            <Text style={[s.bandBadgeText, { color: bandMeta.color }]}>{bandMeta.emoji} {bandMeta.label} · {risk.grade}</Text>
                        </View>
                    </View>
                    <View style={s.factorChipsRow}>
                        {risk.factors.map(f => {
                            const key = `health:${f.name}`;
                            const isOpen = expandedChip === key;
                            return (
                                <TouchableOpacity key={f.name} style={[s.factorChip, isOpen && s.factorChipOpen]} onPress={() => toggleChip(key)} activeOpacity={0.7}>
                                    <View style={[s.factorDot, { backgroundColor: FACTOR_STATUS_COLOR[f.status] }]} />
                                    <Text style={s.factorChipText}>{f.name}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                    {risk.factors.map(f => expandedChip === `health:${f.name}` && (
                        <Text key={f.name} style={s.chipExplanation}>{f.explanation}</Text>
                    ))}
                    <Text style={s.chipHint}>Tap a dot above to see why it's that color</Text>

                    {readinessHistory.length < 2 ? (
                        <Text style={s.trendNote}>
                            {readinessHistory.length === 0
                                ? 'Quad360 starts tracking your score trend from today — check back in about a week.'
                                : 'First snapshot recorded — check back in about a week to see a trend.'}
                        </Text>
                    ) : readinessDelta && (
                        <Text style={[
                            s.trendNote,
                            { color: readinessDelta.trend === 'improving' ? Colors.income : readinessDelta.trend === 'declining' ? Colors.expense : Colors.textSecondary },
                        ]}>
                            {readinessDelta.trend === 'improving' && `Improved from ${readinessDelta.fromScore} → ${readinessDelta.toScore} over ${readinessDelta.periodLabel}${scoreChangeReason ? `, mainly thanks to ${scoreChangeReason}` : ''}.`}
                            {readinessDelta.trend === 'declining' && `Dropped from ${readinessDelta.fromScore} → ${readinessDelta.toScore} over ${readinessDelta.periodLabel}${scoreChangeReason ? `, primarily because of ${scoreChangeReason}` : ''}.`}
                            {readinessDelta.trend === 'stable' && `Holding steady (${readinessDelta.fromScore} → ${readinessDelta.toScore}) over ${readinessDelta.periodLabel}.`}
                        </Text>
                    )}

                    {resilienceGap && (
                        <Text style={[s.trendNote, { color: Colors.textSecondary, fontStyle: 'italic' }]}>{resilienceGap}</Text>
                    )}

                    <TouchableOpacity style={s.linkRow} onPress={() => setCurrentScreen('credit-worthiness')}>
                        <Text style={s.linkText}>See full readiness trend & breakdown →</Text>
                    </TouchableOpacity>
                </View>

                {/* Financial Health Score, by pillar -- the exact same score
                    above, broken down a second way (Cash Health, Working
                    Capital folding in Inventory, Revenue Health isolating
                    customer concentration specifically, etc.) instead of
                    computeRiskScore's own factor names. Same tap-to-expand
                    pattern as the chips above. */}
                <View style={s.card}>
                    <View style={s.cardHeaderRow}>
                        <Icon name="grid" size={14} color={Colors.textMuted} />
                        <Text style={s.cardTitle}>Financial Health — By Pillar</Text>
                    </View>
                    <View style={s.factorChipsRow}>
                        {pillars.pillars.map(p => {
                            const key = `pillar:${p.key}`;
                            const isOpen = expandedChip === key;
                            return (
                                <TouchableOpacity key={p.key} style={[s.factorChip, isOpen && s.factorChipOpen]} onPress={() => toggleChip(key)} activeOpacity={0.7}>
                                    <View style={[s.factorDot, { backgroundColor: PILLAR_STATUS_COLOR[p.status] }]} />
                                    <Text style={s.factorChipText}>{p.label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                    {pillars.pillars.map(p => expandedChip === `pillar:${p.key}` && (
                        <Text key={p.key} style={s.chipExplanation}>{p.score}/100 — {p.explanation}</Text>
                    ))}
                    <Text style={s.chipHint}>Tap a pillar above to see why it's that color</Text>
                </View>

                {/* Business Exposure & Resilience -- complements Health:
                    Health asks "is the business doing well", this asks
                    "how much would one bad event hurt it". */}
                <TouchableOpacity style={s.card} onPress={() => setCurrentScreen('risk-management')} activeOpacity={0.85}>
                    <View style={s.cardHeaderRow}>
                        <Icon name="shield" size={14} color={Colors.textMuted} />
                        <Text style={s.cardTitle}>Business Resilience</Text>
                        <View style={[s.bandBadge, { backgroundColor: RESILIENCE_BAND_COLOR[resilience.band] + '22', marginLeft: 'auto' }]}>
                            <Text style={[s.bandBadgeText, { color: RESILIENCE_BAND_COLOR[resilience.band] }]}>
                                {resilience.score} · {resilience.band}
                            </Text>
                        </View>
                    </View>
                    <Text style={s.cardBodyText}>How much a single bad event — a lost customer, a rate move, slow-moving stock — would hurt the business right now.</Text>
                    <View style={[s.factorChipsRow, { marginTop: Spacing.sm }]}>
                        {exposure.factors.map(f => {
                            const key = `exposure:${f.key}`;
                            const isOpen = expandedChip === key;
                            return (
                                <TouchableOpacity
                                    key={f.key}
                                    style={[s.factorChip, isOpen && s.factorChipOpen]}
                                    onPress={(e) => { e.stopPropagation(); toggleChip(key); }}
                                    activeOpacity={0.7}
                                >
                                    <Text style={s.riskDot}>{EXPOSURE_LEVEL_META[f.level].dot}</Text>
                                    <Text style={s.factorChipText}>{f.label.replace(' Exposure', '')}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                    {exposure.factors.map(f => expandedChip === `exposure:${f.key}` && (
                        <Text key={f.key} style={s.chipExplanation}>{f.detail}</Text>
                    ))}
                    {resilience.topConcerns.length > 0 && (
                        <Text style={s.cardBodyText}>
                            <Text style={{ fontWeight: '700', color: Colors.textPrimary }}>Biggest exposure: </Text>
                            {resilience.topConcerns[0].detail}
                        </Text>
                    )}
                </TouchableOpacity>

                {/* Risk Radar */}
                <TouchableOpacity style={s.card} onPress={() => setCurrentScreen('risk-management')} activeOpacity={0.85}>
                    <View style={s.cardHeaderRow}>
                        <Icon name="radio" size={14} color={Colors.textMuted} />
                        <Text style={s.cardTitle}>Risk Radar</Text>
                        <View style={[s.bandBadge, { backgroundColor: RISK_LEVEL_META[riskRadar.overallLevel].color + '22', marginLeft: 'auto' }]}>
                            <Text style={[s.bandBadgeText, { color: RISK_LEVEL_META[riskRadar.overallLevel].color }]}>
                                {riskRadar.overallLevel === 'high' ? 'High' : riskRadar.overallLevel === 'medium' ? 'Moderate' : 'Low'}
                            </Text>
                        </View>
                    </View>
                    <View style={s.factorChipsRow}>
                        {riskRadar.categories.map(c => {
                            const key = `radar:${c.key}`;
                            const isOpen = expandedChip === key;
                            return (
                                <TouchableOpacity
                                    key={c.key}
                                    style={[s.factorChip, isOpen && s.factorChipOpen]}
                                    onPress={(e) => { e.stopPropagation(); toggleChip(key); }}
                                    activeOpacity={0.7}
                                >
                                    <Text style={s.riskDot}>{RISK_LEVEL_META[c.level].dot}</Text>
                                    <Text style={s.factorChipText}>{c.label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                    {riskRadar.categories.map(c => expandedChip === `radar:${c.key}` && (
                        <Text key={c.key} style={s.chipExplanation}>{c.summary}</Text>
                    ))}
                    {riskRadar.topRisks.length > 0 ? (
                        <Text style={s.cardBodyText}>
                            <Text style={{ fontWeight: '700', color: Colors.textPrimary }}>Biggest risk: </Text>
                            {riskRadar.topRisks[0].summary}
                        </Text>
                    ) : (
                        <Text style={s.cardBodyText}>Nothing standing out right now — a good window to focus on growth.</Text>
                    )}
                </TouchableOpacity>

                {/* Goals -- the header (tap -> Goals screen) and the
                    per-goal risk note (tap -> that goal's Risks tab) are
                    separate tap targets, not nested, so a tap on one never
                    also fires the other. */}
                <View style={s.card}>
                    <TouchableOpacity onPress={() => setCurrentScreen('goals')} activeOpacity={0.85}>
                        <View style={s.cardHeaderRow}>
                            <Icon name="target" size={14} color={Colors.textMuted} />
                            <Text style={s.cardTitle}>Goals</Text>
                        </View>
                        {goals.length === 0 && (
                            <Text style={s.cardBodyText}>No goals set yet — tap to set your first one.</Text>
                        )}
                    </TouchableOpacity>
                    {goals.length > 0 && (
                        <>
                            <View style={s.factorChipsRow}>
                                {(['on_track', 'at_risk', 'off_track', 'achieved'] as GoalStatus[])
                                    .filter(st => goalCounts[st] > 0)
                                    .map(st => (
                                        <View key={st} style={s.factorChip}>
                                            <View style={[s.factorDot, { backgroundColor: GOAL_STATUS_META[st].color }]} />
                                            <Text style={s.factorChipText}>{goalCounts[st]} {GOAL_STATUS_META[st].label}</Text>
                                        </View>
                                    ))}
                            </View>
                            {activeGoals.map(g => {
                                const goalRisk = goalRiskByGoalId[g.id];
                                return (
                                    <View key={g.id} style={s.goalRow}>
                                        <View style={s.goalTitleRow}>
                                            <Text style={s.goalTitle} numberOfLines={1}>{g.title}</Text>
                                            {goalRisk && (
                                                <View style={[s.readinessPill, { backgroundColor: READINESS_BAND_COLORS[goalRisk.readinessBand] + '22' }]}>
                                                    <Text style={[s.readinessPillText, { color: READINESS_BAND_COLORS[goalRisk.readinessBand] }]}>
                                                        {goalRisk.readinessBand}
                                                    </Text>
                                                </View>
                                            )}
                                        </View>
                                        <View style={s.goalBarTrack}>
                                            <View style={[s.goalBarFill, { width: `${Math.min(100, Math.max(0, g.progress))}%`, backgroundColor: GOAL_STATUS_META[g.status].color }]} />
                                        </View>
                                    </View>
                                );
                            })}

                            {mostAtRiskGoal && (
                                <TouchableOpacity
                                    style={s.goalRiskNote}
                                    onPress={() => navigate('goals', { goalId: mostAtRiskGoal.goal.id, planTab: 'risks' })}
                                >
                                    <Text style={s.goalRiskNoteText}>
                                        <Text style={{ fontWeight: '700', color: Colors.textPrimary }}>{mostAtRiskGoal.goal.title}: </Text>
                                        {mostAtRiskGoal.risk.narrative} See what could stop it →
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </>
                    )}
                </View>

                <TouchableOpacity style={s.linkRow} onPress={() => setCurrentScreen('business-timeline')}>
                    <Text style={s.linkText}>See the story of your business's finances so far →</Text>
                </TouchableOpacity>

                <TouchableOpacity style={s.linkRow} onPress={() => setCurrentScreen('dashboard')}>
                    <Text style={s.linkText}>See today's priorities & this month's mission on the Dashboard →</Text>
                </TouchableOpacity>
            </ScrollView>
            <FooterNav />
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: 16, paddingBottom: 100 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    title: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
    subtitle: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginBottom: 16 },

    scoreCard: { backgroundColor: Colors.card, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.lg, borderWidth: 1.5, ...Shadow.sm },
    scoreCardLabel: { fontSize: 10.5, fontWeight: '800', color: Colors.textMuted, letterSpacing: 0.8, marginBottom: Spacing.sm },
    scoreRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md },
    scoreValue: { fontSize: 40, fontWeight: '800' },
    bandBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.pill },
    bandBadgeText: { fontSize: 12, fontWeight: '800' },
    trendNote: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginTop: Spacing.sm },

    card: { backgroundColor: Colors.card, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.lg, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.sm },
    cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
    cardBodyText: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },

    factorChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.sm },
    factorChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.bg, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: Colors.border },
    factorChipOpen: { borderColor: Colors.primary, backgroundColor: Colors.primary + '11' },
    factorDot: { width: 7, height: 7, borderRadius: 4 },
    factorChipText: { fontSize: 10.5, fontWeight: '600', color: Colors.textSecondary },
    riskDot: { fontSize: 9 },
    chipExplanation: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, backgroundColor: Colors.bg, borderRadius: Radius.sm, padding: Spacing.sm, marginTop: -2, marginBottom: Spacing.sm },
    chipHint: { fontSize: 10, color: Colors.textMuted, fontStyle: 'italic', marginTop: -4, marginBottom: Spacing.sm },

    goalRow: { marginTop: Spacing.sm },
    goalTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    goalTitle: { flex: 1, fontSize: 12, fontWeight: '600', color: Colors.textPrimary, marginRight: Spacing.sm },
    goalBarTrack: { height: 6, borderRadius: 3, backgroundColor: Colors.bg, overflow: 'hidden' },
    goalBarFill: { height: '100%', borderRadius: 3 },
    readinessPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.pill },
    readinessPillText: { fontSize: 9.5, fontWeight: '800' },
    goalRiskNote: { marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
    goalRiskNoteText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },

    linkRow: { paddingVertical: Spacing.sm, marginBottom: Spacing.sm },
    linkText: { fontSize: 12.5, color: Colors.primary, fontWeight: '700' },
});
