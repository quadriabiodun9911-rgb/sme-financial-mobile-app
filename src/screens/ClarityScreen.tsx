import React, { useMemo } from 'react';
import { SafeAreaView, ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import NextStepLink from '../components/NextStepLink';
import { performFinancialDiagnosis } from '../utils/financialDiagnosisEngine';
import { generateActionPlan, ActionTactic } from '../utils/actionRecommendationEngine';

const MIN_TRANSACTIONS_FOR_DIAGNOSIS = 5;

// The single "here's where my business stands, and here's what to do about
// it" screen — everything else (CFO, Financial Health, Action Tracker, Goal
// Bridge, Budget...) is supporting detail one tap deeper. This screen exists
// because that supporting detail is spread across a dozen similarly-named
// screens with no one place that just answers the question plainly.
export default function ClarityScreen() {
    const { transactions, invoices, finance, settings, goals, inventory, setCurrentScreen } = useApp();
    const { currency } = settings;

    const hasEnoughData = transactions.length >= MIN_TRANSACTIONS_FOR_DIAGNOSIS;
    const hasGoals = goals.length > 0;

    const diagnosis = useMemo(() => {
        if (!hasEnoughData) return null;
        return performFinancialDiagnosis(transactions, invoices, finance.cashBalance, finance.expense || 1, currency);
    }, [hasEnoughData, transactions, invoices, finance.cashBalance, finance.expense, currency]);

    const actionPlan = useMemo(() => {
        if (!diagnosis) return null;
        return generateActionPlan(diagnosis, diagnosis.metrics, currency);
    }, [diagnosis, currency]);

    const topActions: ActionTactic[] = useMemo(() => {
        if (!actionPlan) return [];
        return [...actionPlan.immediateActions, ...actionPlan.shortTermActions, ...actionPlan.strategicActions].slice(0, 3);
    }, [actionPlan]);

    // Fallback for the "not enough transactions yet, but has goals" path —
    // shows real progress toward what the owner has already committed to,
    // instead of a blank diagnosis screen.
    const goalProgress = useMemo(() => {
        if (hasEnoughData || !hasGoals) return [];
        return goals
            .filter(g => g.status !== 'achieved')
            .slice(0, 3)
            .map(g => ({ goal: g, progress: g.progress ?? 0 }));
    }, [hasEnoughData, hasGoals, goals]);

    const healthColor = !diagnosis
        ? Colors.textMuted
        : diagnosis.healthStatus === 'healthy' ? Colors.income
        : diagnosis.healthStatus === 'warning' ? Colors.warning
        : Colors.expense;

    const healthLabel = !diagnosis
        ? 'Not enough data yet'
        : diagnosis.healthStatus === 'healthy' ? 'Strong Position'
        : diagnosis.healthStatus === 'warning' ? 'Needs Attention'
        : 'Critical — Act Now';

    const criticalProblems = diagnosis?.diagnoses.filter(d => d.severity === 'critical') ?? [];
    const otherProblems = diagnosis?.diagnoses.filter(d => d.severity !== 'critical') ?? [];

    // A low-margin problem is the entry point to a concrete next-step chain:
    // check what's priced too low in Inventory → adjust it via the Pricing
    // Optimizer → see the effect on the Balance Sheet. Only worth suggesting
    // if the business actually tracks priced inventory items.
    const isLowMarginProblem = (problem: string) => problem.toLowerCase().includes('profit margin');
    const showInventoryNudge = inventory.length > 0;

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
                <Text style={s.title}>🧭 Financial Clarity</Text>
                <Text style={s.subtitle}>Where your business stands, and what to do next — in plain terms.</Text>

                {/* ── Case 1: full diagnosis ─────────────────────────────── */}
                {hasEnoughData && diagnosis && (
                    <>
                        <View style={[s.healthCard, { borderColor: healthColor }]}>
                            <Text style={s.healthLabel}>Your Financial Position</Text>
                            <Text style={[s.healthScore, { color: healthColor }]}>{diagnosis.overallHealth}</Text>
                            <Text style={[s.healthStatus, { color: healthColor }]}>{healthLabel}</Text>
                        </View>

                        {criticalProblems.length === 0 && otherProblems.length === 0 && (
                            <View style={s.goodCard}>
                                <Text style={s.goodText}>✓ No major issues found right now. Keep doing what's working, and check back as your numbers change.</Text>
                            </View>
                        )}

                        {criticalProblems.length > 0 && (
                            <View style={s.section}>
                                <Text style={s.sectionTitle}>⚠ What's Wrong Right Now</Text>
                                {criticalProblems.map((d, i) => (
                                    <View key={i} style={[s.problemCard, { borderLeftColor: Colors.expense }]}>
                                        <Text style={s.problemTitle}>{d.problem}</Text>
                                        <Text style={s.problemImpact}>{d.impact}</Text>
                                        <Text style={s.problemOpportunity}>💡 {d.opportunity}</Text>
                                        {isLowMarginProblem(d.problem) && showInventoryNudge && (
                                            <NextStepLink text="Check your inventory pricing" onPress={() => setCurrentScreen('inventory')} />
                                        )}
                                    </View>
                                ))}
                            </View>
                        )}

                        {otherProblems.length > 0 && (
                            <View style={s.section}>
                                <Text style={s.sectionTitle}>👀 Worth Keeping an Eye On</Text>
                                {otherProblems.map((d, i) => (
                                    <View key={i} style={[s.problemCard, { borderLeftColor: Colors.warning }]}>
                                        <Text style={s.problemTitle}>{d.problem}</Text>
                                        <Text style={s.problemImpact}>{d.impact}</Text>
                                        <Text style={s.problemOpportunity}>💡 {d.opportunity}</Text>
                                        {isLowMarginProblem(d.problem) && showInventoryNudge && (
                                            <NextStepLink text="Check your inventory pricing" onPress={() => setCurrentScreen('inventory')} />
                                        )}
                                    </View>
                                ))}
                            </View>
                        )}

                        {topActions.length > 0 && (
                            <View style={s.section}>
                                <Text style={s.sectionTitle}>📋 Your Strategy — Top {topActions.length} Actions</Text>
                                {topActions.map((a, i) => (
                                    <View key={a.id} style={s.actionCard}>
                                        <View style={s.actionNumBadge}><Text style={s.actionNumText}>{i + 1}</Text></View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.actionTitle}>{a.title}</Text>
                                            <Text style={s.actionDesc}>{a.description}</Text>
                                            <View style={s.actionMetaRow}>
                                                <Text style={[s.actionMeta, { color: Colors.income, fontWeight: '700' }]}>
                                                    ~{currency}{Math.round(a.expectedImpact).toLocaleString()} impact
                                                </Text>
                                                <Text style={s.actionMeta}>⏱ {a.timeframe}</Text>
                                                <Text style={s.actionMeta}>✓ {(a.successProbability * 100).toFixed(0)}% likely</Text>
                                            </View>
                                        </View>
                                    </View>
                                ))}
                                <TouchableOpacity style={s.linkBtn} onPress={() => setCurrentScreen('action-tracker')}>
                                    <Text style={s.linkBtnText}>See your full action plan →</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </>
                )}

                {/* ── Case 2: not enough transactions, but has goals ─────── */}
                {!hasEnoughData && hasGoals && (
                    <>
                        <View style={[s.healthCard, { borderColor: Colors.primary }]}>
                            <Text style={s.healthLabel}>Starting Point: Your Goals</Text>
                            <Text style={s.healthSub}>
                                You haven't logged enough transactions yet for a full diagnosis ({transactions.length}/{MIN_TRANSACTIONS_FOR_DIAGNOSIS}).
                                Your goals are the plan — log your day-to-day income and expenses to track real progress toward them.
                            </Text>
                        </View>

                        <View style={s.section}>
                            <Text style={s.sectionTitle}>🎯 Your Goals So Far</Text>
                            {goalProgress.map(({ goal, progress }) => (
                                <View key={goal.id} style={s.goalRow}>
                                    <Text style={s.goalTitle}>{goal.title}</Text>
                                    <View style={s.goalBarTrack}>
                                        <View style={[s.goalBarFill, { width: `${Math.min(Math.max(progress, 0), 100)}%` as any }]} />
                                    </View>
                                    <Text style={s.goalPct}>{progress.toFixed(0)}%</Text>
                                </View>
                            ))}
                        </View>

                        <TouchableOpacity style={s.primaryBtn} onPress={() => setCurrentScreen('import-transactions')}>
                            <Text style={s.primaryBtnText}>📄 Upload a Bank Statement</Text>
                        </TouchableOpacity>
                        <Text style={s.helperText}>Unlocks a full diagnosis and a ranked action plan, automatically.</Text>
                    </>
                )}

                {/* ── Case 3: nothing yet ─────────────────────────────────── */}
                {!hasEnoughData && !hasGoals && (
                    <View style={s.emptyState}>
                        <Text style={s.emptyIcon}>🧭</Text>
                        <Text style={s.emptyTitle}>Let's find out where you stand</Text>
                        <Text style={s.emptySub}>
                            Upload your bank statement for an instant diagnosis, or set a financial goal to give your business a target to work toward.
                        </Text>
                        <TouchableOpacity style={s.primaryBtn} onPress={() => setCurrentScreen('import-transactions')}>
                            <Text style={s.primaryBtnText}>📄 Upload a Bank Statement</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.secondaryBtn} onPress={() => setCurrentScreen('goals')}>
                            <Text style={s.secondaryBtnText}>🎯 Set a Financial Goal Instead</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>
            <FooterNav />
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe:    { flex: 1, backgroundColor: Colors.bg },
    scroll:  { flex: 1, backgroundColor: Colors.bg },
    pad:     { padding: 16, paddingBottom: 100 },

    title:    { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
    subtitle: { fontSize: 13, color: Colors.textSecondary, marginBottom: 18, lineHeight: 18 },

    healthCard:   { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 2, padding: 20, alignItems: 'center', marginBottom: 18 },
    healthLabel:  { fontSize: 12, color: Colors.textMuted, marginBottom: 6, fontWeight: '600' },
    healthScore:  { fontSize: 44, fontWeight: '900' },
    healthStatus: { fontSize: 15, fontWeight: '700', marginTop: 4 },
    healthSub:    { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', lineHeight: 18, marginTop: 6 },

    goodCard: { backgroundColor: Colors.income + '15', borderWidth: 1, borderColor: Colors.income, borderRadius: 12, padding: 14, marginBottom: 18 },
    goodText: { fontSize: 13, color: Colors.textPrimary, lineHeight: 19 },

    section:      { marginBottom: 20 },
    sectionTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginBottom: 10 },

    problemCard:       { backgroundColor: Colors.surface, borderRadius: 10, borderLeftWidth: 3, padding: 12, marginBottom: 8 },
    problemTitle:      { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
    problemImpact:     { fontSize: 12, color: Colors.textSecondary, marginBottom: 6, lineHeight: 17 },
    problemOpportunity:{ fontSize: 12, color: Colors.income, fontWeight: '600', lineHeight: 17 },

    actionCard:    { flexDirection: 'row', gap: 12, backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 10 },
    actionNumBadge:{ width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
    actionNumText: { color: '#fff', fontWeight: '800', fontSize: 13 },
    actionTitle:   { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 3 },
    actionDesc:    { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginBottom: 8 },
    actionMetaRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
    actionMeta:    { fontSize: 10, color: Colors.textMuted, fontWeight: '600' },

    linkBtn:     { paddingVertical: 10, alignItems: 'center' },
    linkBtnText: { fontSize: 13, color: Colors.primary, fontWeight: '700' },

    goalRow:      { marginBottom: 14 },
    goalTitle:    { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
    goalBarTrack: { height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: 'hidden', marginBottom: 4 },
    goalBarFill:  { height: '100%', backgroundColor: Colors.primary, borderRadius: 4 },
    goalPct:      { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },

    primaryBtn:     { backgroundColor: Colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 8 },
    primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    secondaryBtn:     { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 16, alignItems: 'center' },
    secondaryBtnText: { color: Colors.textPrimary, fontWeight: '700', fontSize: 15 },
    helperText: { fontSize: 11, color: Colors.textMuted, textAlign: 'center', marginBottom: 20 },

    emptyState: { alignItems: 'center', paddingVertical: 40 },
    emptyIcon:  { fontSize: 48, marginBottom: 14 },
    emptyTitle: { fontSize: 19, fontWeight: '800', color: Colors.textPrimary, marginBottom: 10 },
    emptySub:   { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
});
