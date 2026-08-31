import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
    SafeAreaView, ScrollView, View, Text, TextInput,
    TouchableOpacity, Modal, StyleSheet, Platform, useWindowDimensions,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import DateInput from '../components/DateInput';
import Icon, { IconName } from '../components/ui/Icon';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import { GoalType, FinancialGoal, Transaction } from '../types';
import { generateStrategy, goalDefaults, buildNewGoal } from '../utils/goals';
import NextStepLink from '../components/NextStepLink';
import { calculateGoalBridge, mapSavedGoalToBridge, formatGoalMetric } from '../utils/goalBridgeEngine';
import { performFinancialDiagnosis } from '../utils/financialDiagnosisEngine';
import { generateActionPlan } from '../utils/actionRecommendationEngine';
import { suggestSolution, ImpactSource } from '../utils/impactChain';
import { getMonthlyExpenseAverage, computeCashFlowForecast, computeRevenueForecast, latestTransactionDate } from '../utils/finance';
import { showAlert, confirmAction } from '../utils/webAlert';
import { computeRiskRadar } from '../utils/riskRadar';
import { assessGoalRisk, GoalRiskSeverity } from '../utils/goalRiskLinkage';
import { computeGoalBudgetAlignment, computeGoalForecastAlignment, computeRevenueMarginForecastAlignment } from '../utils/goalAlignment';
import { computeGoalForecastGap } from '../utils/goalForecastGap';

// Maps each goal type to the closest matching solution category — a
// revenue/margin goal is fundamentally a pricing/growth problem, a cost or
// cash-reserve goal is a budget problem.
const GOAL_TYPE_SOLUTION: Record<GoalType, ImpactSource> = {
    revenue_growth: 'pricing',
    margin_improvement: 'pricing',
    cost_reduction: 'budget',
    cash_reserve: 'budget',
    reduce_overdue_ar: 'expense',
    custom: 'expense',
};

const GOAL_TYPES: { type: GoalType; label: string; icon: IconName; description: string }[] = [
    { type: 'revenue_growth', label: 'Increase Revenue', icon: 'trending-up', description: 'Grow total income to a target amount' },
    { type: 'margin_improvement', label: 'Improve Margin', icon: 'percent', description: 'Raise profit margin to a target percentage' },
    { type: 'cost_reduction', label: 'Reduce Costs', icon: 'scissors', description: 'Cut total operating expenses' },
    { type: 'cash_reserve', label: 'Build Cash Reserve', icon: 'save', description: 'Grow cash balance to a target amount' },
    { type: 'reduce_overdue_ar', label: 'Clear Overdue AR', icon: 'clipboard', description: 'Collect all outstanding receivables' },
    { type: 'custom', label: 'Custom Goal', icon: 'target', description: 'Define your own financial milestone' },
];

const STATUS_COLORS: Record<FinancialGoal['status'], string> = {
    achieved: Colors.income,
    on_track: Colors.income,
    at_risk: Colors.warning,
    off_track: Colors.expense,
};

const STATUS_LABELS: Record<FinancialGoal['status'], string> = {
    achieved: 'Achieved',
    on_track: 'On Track',
    at_risk: 'At Risk',
    off_track: 'Off Track',
};

const PRIORITY_COLORS = { high: Colors.expense, medium: Colors.warning, low: Colors.textMuted };

const FEASIBILITY_COLORS: Record<string, string> = { easy: Colors.income, medium: Colors.warning, difficult: Colors.expense };

const READINESS_BAND_COLORS: Record<string, string> = { Strong: Colors.income, Moderate: Colors.warning, Weak: Colors.expense };

const RISK_SEVERITY_COLORS: Record<GoalRiskSeverity, string> = { high: Colors.expense, medium: Colors.warning, low: Colors.textMuted };

const ALIGNMENT_STATUS_COLORS: Record<string, string> = { aligned: Colors.income, budget_too_high: Colors.expense, no_active_budget: Colors.warning };

export default function GoalsScreen() {
    const { goals, addGoal, deleteGoal, updateGoal, finance, transactions, invoices, settings, navParams, navigate, setCurrentScreen, loans, inventory, budgets, assets } = useApp();
    const { currency } = settings;

    // Modal renders via a portal on web, outside App.tsx's width constraint --
    // see FooterNav.tsx for the reference fix. Applied here to the bottom
    // sheets so they don't stretch full-bleed on desktop.
    const { width: windowWidth } = useWindowDimensions();
    const constrainSheetWidth = Platform.OS === 'web' && windowWidth >= 720;

    const [addModalOpen, setAddModalOpen] = useState(false);
    const [editGoal, setEditGoal]         = useState<FinancialGoal | null>(null);
    // Plan modal — merges what used to be two separate destinations (a
    // "View Strategy" modal here, and a full navigate-away to GoalBridgeScreen)
    // into one modal with two tabs, since both answered the same underlying
    // question ("what do I do about this goal?") with overlapping content.
    const [planGoalId, setPlanGoalId] = useState<string | null>(null);
    const [planTab, setPlanTab] = useState<'bridge' | 'strategy' | 'risks' | 'alignment'>('bridge');
    const [selectedType, setSelectedType] = useState<GoalType | null>(null);

    // Form state for new/edit goal
    const [form, setForm] = useState({
        title: '',
        description: '',
        targetValue: '',
        deadline: '',
        percentTarget: '',
    });

    const PCT_TYPES: GoalType[] = ['revenue_growth', 'cost_reduction', 'margin_improvement'];

    const planGoal = useMemo(
        () => goals.find(g => g.id === planGoalId) ?? null,
        [goals, planGoalId]
    );

    // The one performFinancialDiagnosis call this screen needs, shared by
    // both feasibilityByGoalId (every goal card's preview) and planDiagnosis
    // (the plan modal) below -- they used to run it independently, redoing
    // the same scan whenever the modal was open. Gated the same way both
    // callers were already gated (goal-card preview needs 5+ transactions
    // and at least one goal; the plan modal just needs to be open), so this
    // stays exactly as lazy as before -- an empty/thin-data screen still
    // never runs it.
    const shouldComputeGoalDiagnosis = !!planGoal || (transactions.length >= 5 && goals.length > 0);
    const goalDiagnosis = useMemo(() => {
        if (!shouldComputeGoalDiagnosis) return null;
        return performFinancialDiagnosis(transactions, invoices, finance.cashBalance, getMonthlyExpenseAverage(finance.expense, transactions), settings.currency, loans, inventory, assets);
    }, [shouldComputeGoalDiagnosis, transactions, invoices, finance.cashBalance, finance.expense, settings.currency, loans, inventory, assets]);

    // Feasibility per goal — reuses the same root-cause diagnosis + tactics
    // engine as Goal Bridge, so every goal card shows at a glance whether it's
    // realistic (EASY/MEDIUM/DIFFICULT) and what monthly improvement it needs,
    // instead of only revealing that after tapping into a separate screen.
    const feasibilityByGoalId = useMemo(() => {
        if (transactions.length < 5 || goals.length === 0 || !goalDiagnosis) return {};
        const tactics = generateActionPlan(goalDiagnosis, goalDiagnosis.metrics, settings.currency);
        const allTactics = [...tactics.immediateActions, ...tactics.shortTermActions, ...tactics.strategicActions];
        const map: Record<string, { feasibility: string; requiredMonthlyImprovement: number; successProbability: number }> = {};
        for (const g of goals) {
            const bridge = calculateGoalBridge(mapSavedGoalToBridge(g), goalDiagnosis.metrics, allTactics, settings.currency);
            map[g.id] = {
                feasibility: bridge.feasibility,
                requiredMonthlyImprovement: bridge.requiredMonthlyImprovement,
                successProbability: bridge.successProbability,
            };
        }
        return map;
    }, [transactions.length, goals, goalDiagnosis, settings.currency]);

    const strategy = useMemo(
        () => planGoal ? generateStrategy(planGoal, finance, transactions, settings) : null,
        [planGoal, finance, transactions, settings]
    );

    // Shared diagnosis for the plan modal — both the Bridge tab (via
    // .metrics) and the Risks tab (via .diagnoses, see planGoalRisk below)
    // need it; computed once here instead of twice.
    const planDiagnosis = useMemo(() => {
        if (!planGoal) return null;
        return goalDiagnosis;
    }, [planGoal, goalDiagnosis]);

    // Full Goal Bridge computation for the plan modal's Bridge tab — mirrors
    // the retired GoalBridgeScreen's own diagnosis -> tactics -> bridge
    // pipeline exactly (that screen never gated on transaction count, unlike
    // feasibilityByGoalId's lightweight card-preview above).
    const planBridge = useMemo(() => {
        if (!planGoal || !planDiagnosis) return null;
        const tactics = generateActionPlan(planDiagnosis, planDiagnosis.metrics, settings.currency);
        const allTactics = [...tactics.immediateActions, ...tactics.shortTermActions, ...tactics.strategicActions];
        return calculateGoalBridge(mapSavedGoalToBridge(planGoal), planDiagnosis.metrics, allTactics, settings.currency);
    }, [planGoal, planDiagnosis, settings.currency]);

    // "What could stop me from reaching THIS goal" — filters the same real
    // diagnosis root-causes and Risk Radar categories shown elsewhere down
    // to whichever ones actually threaten this goal's type, and combines
    // that with Goal Bridge's own successProbability into one Growth
    // Readiness score. See goalRiskLinkage.ts for why nothing here is a
    // fabricated number.
    const planGoalRisk = useMemo(() => {
        if (!planGoal || !planDiagnosis || !planBridge) return null;
        const riskRadar = computeRiskRadar(transactions, loans, settings?.macroAssumptions ?? [], new Date(), assets);
        return assessGoalRisk(planGoal.type, planDiagnosis.diagnoses, riskRadar, planBridge.successProbability);
    }, [planGoal, planDiagnosis, planBridge, transactions, loans, settings?.macroAssumptions, assets]);

    // Whether what's actually committed (this month's Budget) and what's
    // actually trending (the near-term Cash Flow Forecast, which already
    // folds the budget in) support this goal -- distinct from planBridge's
    // feasibility-from-pace math and planGoalRisk's external/diagnosis risk,
    // neither of which reads Budget or Forecast data at all.
    const planBudgetAlignment = useMemo(() => {
        if (!planGoal) return null;
        return computeGoalBudgetAlignment(planGoal, budgets, transactions, finance, loans);
    }, [planGoal, budgets, transactions, finance, loans]);

    const planForecastAlignment = useMemo(() => {
        if (!planGoal || planGoal.type !== 'cash_reserve') return null;
        const forecast = computeCashFlowForecast(transactions, loans, invoices, budgets);
        return computeGoalForecastAlignment(planGoal, forecast, finance.cashBalance);
    }, [planGoal, transactions, loans, invoices, budgets, finance.cashBalance]);

    // revenue_growth and margin_improvement compare against the near-term
    // Revenue Forecast instead of the cash-flow forecast above -- see
    // computeRevenueMarginForecastAlignment's own comment for why they
    // need a different forecast shape than cash_reserve does.
    const planRevenueMarginForecastAlignment = useMemo(() => {
        if (!planGoal || (planGoal.type !== 'revenue_growth' && planGoal.type !== 'margin_improvement')) return null;
        // Anchored to the latest transaction date, not real-world "now" --
        // see latestTransactionDate's comment.
        const revenueForecast = computeRevenueForecast(transactions, 3, latestTransactionDate(transactions) ?? undefined);
        return computeRevenueMarginForecastAlignment(planGoal, revenueForecast, budgets, transactions, finance);
    }, [planGoal, transactions, budgets, finance]);

    // "Is Your Forecast On Pace?" above asks whether the current monthly
    // RATE is fast enough; this asks the product-vision question directly
    // -- what TOTAL you'll actually reach by the deadline at that rate,
    // and the gap against the target in real currency. See
    // goalForecastGap.ts's own comment for why the two coexist rather than
    // one replacing the other.
    const planGoalForecastGap = useMemo(() => {
        if (!planGoal || planGoal.type !== 'revenue_growth') return null;
        return computeGoalForecastGap(planGoal, transactions, settings.currency);
    }, [planGoal, transactions, settings.currency]);

    const showAlignmentTab = planGoal?.type === 'cost_reduction' || planGoal?.type === 'cash_reserve'
        || planGoal?.type === 'margin_improvement' || planGoal?.type === 'revenue_growth';

    // Auto-open add modal if navigated here with a goalType param, or the
    // plan modal if navigated here with a goalId — the latter mirrors the
    // deep-link capability the retired GoalBridgeScreen used to offer via
    // its own goalId navParam. Defaults to the Bridge tab, but a caller
    // (e.g. Scoreboard's per-goal readiness link) can request a specific
    // tab via planTab, same as tapping that tab manually would.
    useEffect(() => {
        if (navParams?.goalType) {
            setAddModalOpen(true);
            openAddModal(navParams.goalType);
        }
        if (navParams?.goalId) {
            setPlanGoalId(navParams.goalId);
            setPlanTab(navParams?.planTab === 'risks' || navParams?.planTab === 'strategy' || navParams?.planTab === 'alignment' ? navParams.planTab : 'bridge');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const openAddModal = (type: GoalType) => {
        setSelectedType(type);
        const meta = GOAL_TYPES.find(g => g.type === type)!;
        const defaults = goalDefaults(type, finance, settings);
        setForm({
            title: defaults.title ?? meta.label,
            description: defaults.description ?? meta.description,
            targetValue: defaults.targetValue ? String(defaults.targetValue) : '',
            deadline: '',
            percentTarget: defaults.percentTarget != null ? String(defaults.percentTarget) : '',
        });
    };

    const handlePercentTargetChange = (pctStr: string) => {
        setForm(f => {
            const pct = parseFloat(pctStr);
            let tv = f.targetValue;
            if (!isNaN(pct) && selectedType) {
                if (selectedType === 'revenue_growth') tv = String(Math.round(finance.income * (1 + pct / 100)));
                else if (selectedType === 'cost_reduction') tv = String(Math.round(finance.expense * (1 - pct / 100)));
                else if (selectedType === 'margin_improvement') tv = String(parseFloat(((isFinite(finance.margin) ? finance.margin : 0) + pct).toFixed(1)));
            }
            return { ...f, percentTarget: pctStr, targetValue: tv };
        });
    };

    const handleTargetValueChange = (tvStr: string) => {
        setForm(f => {
            const tv = parseFloat(tvStr);
            let pct = f.percentTarget;
            if (!isNaN(tv) && selectedType) {
                if (selectedType === 'revenue_growth') pct = finance.income > 0 ? ((tv - finance.income) / finance.income * 100).toFixed(1) : '0';
                else if (selectedType === 'cost_reduction') pct = finance.expense > 0 ? ((finance.expense - tv) / finance.expense * 100).toFixed(1) : '0';
                else if (selectedType === 'margin_improvement') pct = isFinite(finance.margin) ? (tv - finance.margin).toFixed(1) : '0';
            }
            return { ...f, targetValue: tvStr, percentTarget: pct };
        });
    };

    const handleCreate = () => {
        if (!selectedType) return;
        if (!form.title.trim()) { showAlert('Almost there', 'Give your goal a name first'); return; }
        if (!form.deadline.match(/^\d{4}-\d{2}-\d{2}$/)) { showAlert('Please pick a date', 'Tap the date field and choose your deadline'); return; }
        const tv = parseFloat(form.targetValue);
        if (isNaN(tv)) { showAlert('Please enter an amount', 'Type in the target amount, e.g. 50000'); return; }

        const pct = parseFloat(form.percentTarget);
        addGoal(buildNewGoal({
            type: selectedType,
            title: form.title.trim(),
            description: form.description.trim(),
            targetValue: tv,
            deadline: form.deadline,
            percentTarget: isNaN(pct) ? undefined : pct,
        }, finance, settings, transactions));
        setAddModalOpen(false);
        setSelectedType(null);
    };

    const handleDelete = useCallback((id: string, title: string) => {
        confirmAction('Delete Goal', `Remove "${title}"?`, 'Delete', () => deleteGoal(id));
    }, [deleteGoal]);

    const openEditModal = useCallback((goal: FinancialGoal) => {
        setEditGoal(goal);
        setSelectedType(goal.type);
        setForm({ title: goal.title, description: goal.description, targetValue: String(goal.targetValue), deadline: goal.deadline, percentTarget: String(goal.percentTarget ?? '') });
    }, []);

    // Stable, list-index-independent handlers passed to every GoalCard — see
    // the matching note on LoanCard in LoansScreen.tsx for why this matters:
    // React.memo only skips re-rendering a card when ALL of its props are
    // referentially stable, and a fresh `() => doThing(goal.id)` closure
    // built inline inside `.map()` on every render defeats that regardless
    // of memoization.
    const handlePlanGoal = useCallback((id: string) => { setPlanGoalId(id); setPlanTab('bridge'); }, []);
    const handleExecute = useCallback(() => setCurrentScreen('action-tracker'), [setCurrentScreen]);
    const handleCollect = useCallback(() => navigate('transactions', { filter: 'collect' }), [navigate]);
    const handleSeeFullPicture = useCallback(() => setCurrentScreen('business-passport'), [setCurrentScreen]);

    const handleEditSave = () => {
        if (!editGoal) return;
        if (!form.title.trim()) { showAlert('Almost there', 'Give your goal a name first'); return; }
        if (!form.deadline.match(/^\d{4}-\d{2}-\d{2}$/)) { showAlert('Please pick a date', 'Tap the date field and choose your deadline'); return; }
        const tv = parseFloat(form.targetValue);
        if (isNaN(tv)) { showAlert('Please enter an amount', 'Type in the target amount, e.g. 50000'); return; }
        const pct = parseFloat(form.percentTarget);
        updateGoal(editGoal.id, { title: form.title.trim(), description: form.description.trim(), targetValue: tv, deadline: form.deadline, percentTarget: isNaN(pct) ? undefined : pct });
        setEditGoal(null);
    };

    const daysRemaining = (deadline: string) => {
        const d = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
        if (d < 0) return 'Overdue';
        if (d === 0) return 'Due today';
        return `${d} day${d !== 1 ? 's' : ''} left`;
    };

    // Was filtered inline in JSX (twice for achieved -- once for the
    // "any achieved?" length check, once for the actual .map()) on every
    // render; memoized once here and reused both places.
    const activeGoals = useMemo(() => goals.filter(g => g.status !== 'achieved'), [goals]);
    const achievedGoals = useMemo(() => goals.filter(g => g.status === 'achieved'), [goals]);

    return (
        <SafeAreaView style={styles.safe}>
            <Header />
            <ScrollView style={styles.scroll}>
                <View style={styles.pad}>
                    <Text style={styles.title}>Your Goals</Text>
                    <Text style={styles.subtitle}>
                        Set measurable business targets. The app tracks your progress daily and builds a personalised strategy to help you reach each goal.
                    </Text>

                    {/* Goals list */}
                    {goals.length === 0 ? (
                        <View style={styles.emptyCard}>
                            <View style={styles.emptyIcon}>
                                <Icon name="target" size={36} color={Colors.textMuted} />
                            </View>
                            <Text style={styles.emptyTitle}>No goals yet</Text>
                            <Text style={styles.emptyText}>
                                Add your first goal below. The app will analyse your financials and generate a step-by-step strategy to help you achieve it.
                            </Text>
                        </View>
                    ) : (
                        <>
                            {/* Active goals */}
                            {activeGoals.map(goal => (
                                <GoalCard
                                    key={goal.id}
                                    goal={goal}
                                    currency={currency}
                                    daysRemaining={daysRemaining(goal.deadline)}
                                    feasibility={feasibilityByGoalId[goal.id]}
                                    onPlan={handlePlanGoal}
                                    onEdit={openEditModal}
                                    onDelete={handleDelete}
                                    onExecute={handleExecute}
                                    onCollect={handleCollect}
                                    onSeeFullPicture={handleSeeFullPicture}
                                />
                            ))}
                            {/* Achieved goals */}
                            {achievedGoals.length > 0 && (
                                <>
                                    <Text style={styles.achievedHeader}>Achieved Goals</Text>
                                    {achievedGoals.map(goal => (
                                        <GoalCard
                                            key={goal.id}
                                            goal={goal}
                                            currency={currency}
                                            daysRemaining={daysRemaining(goal.deadline)}
                                            onPlan={handlePlanGoal}
                                            onEdit={openEditModal}
                                            onDelete={handleDelete}
                                        />
                                    ))}
                                </>
                            )}
                        </>
                    )}

                    {/* Add Goal */}
                    <Text style={styles.sectionTitle}>Add a New Goal</Text>
                    <View style={styles.typeGrid}>
                        {GOAL_TYPES.map(gt => (
                            <TouchableOpacity
                                key={gt.type}
                                style={styles.typeCard}
                                onPress={() => { setAddModalOpen(true); openAddModal(gt.type); }}
                            >
                                <View style={styles.typeIcon}>
                                    <Icon name={gt.icon} size={22} color={Colors.primary} />
                                </View>
                                <Text style={styles.typeLabel}>{gt.label}</Text>
                                <Text style={styles.typeDesc}>{gt.description}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            </ScrollView>
            <FooterNav />

            {/* Add Goal Modal */}
            <Modal visible={addModalOpen} animationType="slide" transparent onRequestClose={() => setAddModalOpen(false)}>
                <View style={styles.overlay}>
                    <ScrollView keyboardShouldPersistTaps="handled">
                        <View style={[styles.modal, constrainSheetWidth && styles.modalWide]}>
                            <View style={styles.modalTitleRow}>
                                {selectedType && <Icon name={GOAL_TYPES.find(g => g.type === selectedType)!.icon} size={18} color={Colors.textPrimary} />}
                                <Text style={styles.modalTitle}>
                                    {GOAL_TYPES.find(g => g.type === selectedType)?.label}
                                </Text>
                            </View>

                            <FieldLabel>Goal Title</FieldLabel>
                            <TextInput style={styles.input} value={form.title} onChangeText={v => setForm(f => ({ ...f, title: v }))} placeholder="e.g. Grow revenue to $200k" placeholderTextColor={Colors.muted} />

                            <FieldLabel>Description (optional)</FieldLabel>
                            <TextInput style={[styles.input, { height: 70 }]} value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} placeholder="Why this goal matters..." placeholderTextColor={Colors.muted} multiline />

                            {selectedType && PCT_TYPES.includes(selectedType) && (
                                <>
                                    <FieldLabel>% Target (e.g. 20 for 20%)</FieldLabel>
                                    <TextInput style={styles.input} value={form.percentTarget} onChangeText={handlePercentTargetChange} keyboardType="numeric" placeholder="e.g. 20" placeholderTextColor={Colors.muted} />
                                </>
                            )}

                            <FieldLabel>Target Value ({selectedType === 'margin_improvement' ? '%' : currency})</FieldLabel>
                            <TextInput style={styles.input} value={form.targetValue} onChangeText={handleTargetValueChange} keyboardType="numeric" placeholder="e.g. 200000" placeholderTextColor={Colors.muted} />

                            <FieldLabel>Deadline</FieldLabel>
                            <DateInput value={form.deadline} onChange={v => setForm(f => ({ ...f, deadline: v }))} />

                            <View style={styles.modalBtns}>
                                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: Colors.muted }]} onPress={() => setAddModalOpen(false)}>
                                    <Text style={styles.modalBtnText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: Colors.primary }]} onPress={handleCreate}>
                                    <Text style={styles.modalBtnText}>Create Goal</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </ScrollView>
                </View>
            </Modal>

            {/* Edit Goal Modal */}
            <Modal visible={!!editGoal} animationType="slide" transparent onRequestClose={() => setEditGoal(null)}>
                <View style={styles.overlay}>
                    <ScrollView keyboardShouldPersistTaps="handled">
                        <View style={[styles.modal, constrainSheetWidth && styles.modalWide]}>
                            <Text style={styles.modalTitle}>Edit Goal</Text>

                            <FieldLabel>Goal Title</FieldLabel>
                            <TextInput style={styles.input} value={form.title} onChangeText={v => setForm(f => ({ ...f, title: v }))} placeholder="Goal title" placeholderTextColor={Colors.muted} />

                            <FieldLabel>Description (optional)</FieldLabel>
                            <TextInput style={[styles.input, { height: 70 }]} value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} multiline placeholderTextColor={Colors.muted} />

                            {selectedType && PCT_TYPES.includes(selectedType) && (
                                <>
                                    <FieldLabel>% Target (e.g. 20 for 20%)</FieldLabel>
                                    <TextInput style={styles.input} value={form.percentTarget} onChangeText={handlePercentTargetChange} keyboardType="numeric" placeholder="e.g. 20" placeholderTextColor={Colors.muted} />
                                </>
                            )}

                            <FieldLabel>Target Value</FieldLabel>
                            <TextInput style={styles.input} value={form.targetValue} onChangeText={handleTargetValueChange} keyboardType="numeric" placeholderTextColor={Colors.muted} />

                            <FieldLabel>Deadline</FieldLabel>
                            <DateInput value={form.deadline} onChange={v => setForm(f => ({ ...f, deadline: v }))} />

                            <View style={styles.modalBtns}>
                                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: Colors.muted }]} onPress={() => setEditGoal(null)}>
                                    <Text style={styles.modalBtnText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: Colors.primary }]} onPress={handleEditSave}>
                                    <Text style={styles.modalBtnText}>Save Changes</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </ScrollView>
                </View>
            </Modal>

            {/* Plan Modal — Bridge (tactics/roadmap/feasibility) + Strategy
                (prioritised actions/daily actions), merged into one
                destination since both used to answer "what do I do about
                this goal?" separately (one as a modal here, one as a whole
                other screen — GoalBridgeScreen, now retired). */}
            <Modal visible={!!planGoalId} animationType="slide" transparent onRequestClose={() => setPlanGoalId(null)}>
                <View style={styles.overlay}>
                    <ScrollView>
                        <View style={[styles.modal, constrainSheetWidth && styles.modalWide]}>
                            {planGoal && (
                                <>
                                    <Text style={styles.modalTitle}>Plan: {planGoal.title}</Text>

                                    <View style={styles.planTabs}>
                                        <TouchableOpacity
                                            style={[styles.planTab, planTab === 'bridge' && styles.planTabActive]}
                                            onPress={() => setPlanTab('bridge')}
                                        >
                                            <View style={styles.planTabInner}>
                                                <Icon name="compass" size={13} color={planTab === 'bridge' ? '#fff' : Colors.textMuted} />
                                                <Text style={[styles.planTabText, planTab === 'bridge' && styles.planTabTextActive]}>Bridge</Text>
                                            </View>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.planTab, planTab === 'strategy' && styles.planTabActive]}
                                            onPress={() => setPlanTab('strategy')}
                                        >
                                            <View style={styles.planTabInner}>
                                                <Icon name="clipboard" size={13} color={planTab === 'strategy' ? '#fff' : Colors.textMuted} />
                                                <Text style={[styles.planTabText, planTab === 'strategy' && styles.planTabTextActive]}>Strategy</Text>
                                            </View>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.planTab, planTab === 'risks' && styles.planTabActive]}
                                            onPress={() => setPlanTab('risks')}
                                        >
                                            <View style={styles.planTabInner}>
                                                <Icon name="alert-triangle" size={13} color={planTab === 'risks' ? '#fff' : Colors.textMuted} />
                                                <Text style={[styles.planTabText, planTab === 'risks' && styles.planTabTextActive]}>Risks</Text>
                                            </View>
                                        </TouchableOpacity>
                                        {showAlignmentTab && (
                                            <TouchableOpacity
                                                style={[styles.planTab, planTab === 'alignment' && styles.planTabActive]}
                                                onPress={() => setPlanTab('alignment')}
                                            >
                                                <View style={styles.planTabInner}>
                                                    <Icon name="git-merge" size={13} color={planTab === 'alignment' ? '#fff' : Colors.textMuted} />
                                                    <Text style={[styles.planTabText, planTab === 'alignment' && styles.planTabTextActive]}>Alignment</Text>
                                                </View>
                                            </TouchableOpacity>
                                        )}
                                    </View>

                                    {planTab === 'bridge' && planBridge && (
                                        <>
                                            <View style={[styles.assessmentCard, { borderLeftColor: FEASIBILITY_COLORS[planBridge.feasibility] }]}>
                                                <View style={styles.assessmentHeader}>
                                                    <Text style={styles.assessmentLabel}>Feasibility Assessment</Text>
                                                    <View style={[styles.feasibilityBadge, { backgroundColor: FEASIBILITY_COLORS[planBridge.feasibility] + '22', borderColor: FEASIBILITY_COLORS[planBridge.feasibility] }]}>
                                                        <Text style={[styles.feasibilityText, { color: FEASIBILITY_COLORS[planBridge.feasibility] }]}>
                                                            {planBridge.feasibility.toUpperCase()}
                                                        </Text>
                                                    </View>
                                                </View>

                                                <View style={styles.assessmentRow}>
                                                    <Text style={styles.assessmentRowLabel}>Required Monthly Improvement:</Text>
                                                    <Text style={styles.assessmentRowValue}>{formatGoalMetric(planBridge.requiredMonthlyImprovement, planBridge.goal.type, currency)}</Text>
                                                </View>

                                                <View style={styles.assessmentRow}>
                                                    <Text style={styles.assessmentRowLabel}>Realistic Timeline:</Text>
                                                    <Text style={styles.assessmentRowValue}>{planBridge.achievableTimeline} months</Text>
                                                    <Text style={styles.timelineNote}>({planBridge.goal.timelineMonths} month target)</Text>
                                                </View>

                                                <View style={styles.assessmentRow}>
                                                    <Text style={styles.assessmentRowLabel}>Recommended Approach:</Text>
                                                    <Text style={[styles.approachBadge, { backgroundColor: Colors.primary + '22' }]}>
                                                        <Text style={{ color: Colors.primary, fontWeight: '700' }}>
                                                            {planBridge.recommendedApproach === 'revenue-focused' ? '📈 Revenue-Focused' : planBridge.recommendedApproach === 'expense-focused' ? '💰 Expense-Focused' : '⚖️ Hybrid'}
                                                        </Text>
                                                    </Text>
                                                </View>

                                                <View style={styles.assessmentRow}>
                                                    <Text style={styles.assessmentRowLabel}>Success Probability:</Text>
                                                    <View style={styles.probabilityContainer}>
                                                        <View style={styles.probabilityBar}>
                                                            <View
                                                                style={[
                                                                    styles.probabilityFill,
                                                                    { width: `${planBridge.successProbability * 100}%`, backgroundColor: planBridge.successProbability > 0.6 ? Colors.income : Colors.warning },
                                                                ]}
                                                            />
                                                        </View>
                                                        <Text style={styles.probabilityPercent}>{(planBridge.successProbability * 100).toFixed(0)}%</Text>
                                                    </View>
                                                </View>
                                            </View>

                                            <View style={styles.sectionTitleRow}>
                                                <Icon name="map" size={15} color={Colors.textPrimary} />
                                                <Text style={[styles.sectionTitle, styles.sectionTitleInRow]}>Tactics Roadmap</Text>
                                            </View>
                                            {planBridge.tactics.map((allocation, idx) => (
                                                <View key={idx} style={styles.roadmapNode}>
                                                    <View style={styles.timelineNodeContainer}>
                                                        <View style={[styles.timelineNode, { backgroundColor: Colors.primary }]} />
                                                        {idx < planBridge.tactics.length - 1 && <View style={styles.timelineConnector} />}
                                                    </View>
                                                    <View style={styles.roadmapCard}>
                                                        <Text style={styles.roadmapCardTitle}>{allocation.tactic.title}</Text>
                                                        <Text style={styles.roadmapCardMonth}>Month {Math.round(allocation.monthStart)}-{Math.round(allocation.monthEnd)}</Text>
                                                        <Text style={[styles.roadmapCardContribution, { color: allocation.tactic.impactType === 'revenue' ? Colors.income : Colors.expense }]}>
                                                            +{currency}{Math.round(allocation.contributionToGoal).toLocaleString()}
                                                        </Text>
                                                    </View>
                                                </View>
                                            ))}

                                            <View style={[styles.sectionTitleRow, { marginTop: 16 }]}>
                                                <Icon name="flag" size={15} color={Colors.textPrimary} />
                                                <Text style={[styles.sectionTitle, styles.sectionTitleInRow]}>Milestones</Text>
                                            </View>
                                            {planBridge.milestones.map((milestone, idx) => (
                                                <View key={idx} style={styles.milestoneCard}>
                                                    <View style={styles.milestoneLeft}>
                                                        <View style={[styles.milestoneDot, { backgroundColor: idx === planBridge.milestones.length - 1 ? Colors.income : Colors.primary }]} />
                                                        <View style={styles.milestoneContent}>
                                                            <Text style={styles.milestoneMonth}>Month {milestone.month}</Text>
                                                            <Text style={styles.milestoneDescription}>{milestone.description}</Text>
                                                        </View>
                                                    </View>
                                                    <Text style={styles.milestoneValue}>{formatGoalMetric(milestone.targetValue, planBridge.goal.type, currency)}</Text>
                                                </View>
                                            ))}

                                            <TouchableOpacity style={styles.ctaButton} onPress={() => { setPlanGoalId(null); setCurrentScreen('action-tracker'); }}>
                                                <Text style={styles.ctaButtonText}>Start Executing This Plan →</Text>
                                            </TouchableOpacity>
                                        </>
                                    )}

                                    {planTab === 'strategy' && strategy && (
                                        <>
                                            <Text style={styles.strategyIntro}>
                                                Based on your live financial data, here is a prioritised action plan to achieve this goal.
                                            </Text>

                                            {strategy.actions.map((action, i) => (
                                                <View key={i} style={[styles.actionCard, { borderLeftColor: PRIORITY_COLORS[action.priority] }]}>
                                                    <View style={styles.actionHeader}>
                                                        <View style={[styles.priorityBadge, { backgroundColor: PRIORITY_COLORS[action.priority] + '22' }]}>
                                                            <Text style={[styles.priorityText, { color: PRIORITY_COLORS[action.priority] }]}>
                                                                {action.priority.toUpperCase()} PRIORITY
                                                            </Text>
                                                        </View>
                                                    </View>
                                                    <Text style={styles.actionTitle}>{action.title}</Text>
                                                    <Text style={styles.actionDetail}>{action.detail}</Text>
                                                    {action.metric && (
                                                        <View style={styles.metricPill}>
                                                            <Text style={styles.metricText}>{action.metric}</Text>
                                                        </View>
                                                    )}
                                                </View>
                                            ))}

                                            {/* Daily action plan */}
                                            <DailyActionsSection goal={planGoal} transactions={transactions} currency={currency} />

                                            <Text style={styles.strategyFooter}>
                                                Strategy refreshes automatically as your financial data changes.
                                            </Text>
                                        </>
                                    )}

                                    {planTab === 'risks' && planGoalRisk && (
                                        <>
                                            <View style={[styles.assessmentCard, { borderLeftColor: READINESS_BAND_COLORS[planGoalRisk.readinessBand] }]}>
                                                <View style={styles.assessmentHeader}>
                                                    <Text style={styles.assessmentLabel}>Growth Readiness</Text>
                                                    <View style={[styles.feasibilityBadge, { backgroundColor: READINESS_BAND_COLORS[planGoalRisk.readinessBand] + '22', borderColor: READINESS_BAND_COLORS[planGoalRisk.readinessBand] }]}>
                                                        <Text style={[styles.feasibilityText, { color: READINESS_BAND_COLORS[planGoalRisk.readinessBand] }]}>
                                                            {planGoalRisk.readinessBand.toUpperCase()}
                                                        </Text>
                                                    </View>
                                                </View>
                                                <View style={styles.assessmentRow}>
                                                    <View style={styles.probabilityContainer}>
                                                        <View style={styles.probabilityBar}>
                                                            <View
                                                                style={[
                                                                    styles.probabilityFill,
                                                                    { width: `${planGoalRisk.growthReadiness}%`, backgroundColor: READINESS_BAND_COLORS[planGoalRisk.readinessBand] },
                                                                ]}
                                                            />
                                                        </View>
                                                        <Text style={styles.probabilityPercent}>{Math.round(planGoalRisk.growthReadiness)}/100</Text>
                                                    </View>
                                                </View>
                                                <Text style={styles.readinessNarrative}>{planGoalRisk.narrative}</Text>
                                            </View>

                                            <View style={styles.sectionTitleRow}>
                                                <Icon name="alert-triangle" size={15} color={Colors.textPrimary} />
                                                <Text style={[styles.sectionTitle, styles.sectionTitleInRow]}>What Could Stop This Goal</Text>
                                            </View>

                                            {planGoalRisk.risks.length === 0 && (
                                                <Text style={styles.strategyIntro}>Nothing currently threatens this goal — a clear runway to hit your target.</Text>
                                            )}

                                            {planGoalRisk.risks.map((risk, i) => (
                                                <View key={i} style={[styles.actionCard, { borderLeftColor: RISK_SEVERITY_COLORS[risk.severity] }]}>
                                                    <View style={styles.actionHeader}>
                                                        <View style={[styles.priorityBadge, { backgroundColor: RISK_SEVERITY_COLORS[risk.severity] + '22' }]}>
                                                            <Text style={[styles.priorityText, { color: RISK_SEVERITY_COLORS[risk.severity] }]}>
                                                                {risk.severity.toUpperCase()} RISK
                                                            </Text>
                                                        </View>
                                                    </View>
                                                    <Text style={styles.actionTitle}>{risk.label}</Text>
                                                    <Text style={styles.actionDetail}>{risk.summary}</Text>
                                                    {risk.financialImpact > 0 && (
                                                        <View style={styles.metricPill}>
                                                            <Text style={styles.metricText}>{currency}{Math.round(risk.financialImpact).toLocaleString()} at stake</Text>
                                                        </View>
                                                    )}
                                                    <Text style={[styles.actionDetail, { marginTop: 6, fontStyle: 'italic' }]}>→ {risk.action}</Text>
                                                </View>
                                            ))}

                                            <Text style={styles.strategyFooter}>
                                                Risks refresh automatically as your financial data changes.
                                            </Text>
                                        </>
                                    )}

                                    {planTab === 'alignment' && (
                                        <>
                                            {planBudgetAlignment?.applicable && (
                                                <>
                                                    <View style={styles.sectionTitleRow}>
                                                        <Icon name="git-merge" size={15} color={Colors.textPrimary} />
                                                        <Text style={[styles.sectionTitle, styles.sectionTitleInRow]}>Does Your Budget Support This Goal?</Text>
                                                    </View>
                                                    <View style={[styles.assessmentCard, { borderLeftColor: ALIGNMENT_STATUS_COLORS[planBudgetAlignment.status!] }]}>
                                                        <View style={styles.assessmentHeader}>
                                                            <Text style={styles.assessmentLabel}>This Month's Budget</Text>
                                                            <View style={[styles.feasibilityBadge, { backgroundColor: ALIGNMENT_STATUS_COLORS[planBudgetAlignment.status!] + '22', borderColor: ALIGNMENT_STATUS_COLORS[planBudgetAlignment.status!] }]}>
                                                                <Text style={[styles.feasibilityText, { color: ALIGNMENT_STATUS_COLORS[planBudgetAlignment.status!] }]}>
                                                                    {planBudgetAlignment.status === 'aligned' ? 'ALIGNED' : planBudgetAlignment.status === 'budget_too_high' ? 'NOT ALIGNED' : 'NO BUDGET SET'}
                                                                </Text>
                                                            </View>
                                                        </View>
                                                        <Text style={styles.readinessNarrative}>{planBudgetAlignment.message}</Text>
                                                    </View>
                                                    {planBudgetAlignment.status !== 'aligned' && (
                                                        <NextStepLink text="Review your budget" onPress={() => { setPlanGoalId(null); setCurrentScreen('budget'); }} />
                                                    )}
                                                </>
                                            )}

                                            {planForecastAlignment?.applicable && (
                                                <>
                                                    <View style={[styles.sectionTitleRow, { marginTop: 16 }]}>
                                                        <Icon name="trending-up" size={15} color={Colors.textPrimary} />
                                                        <Text style={[styles.sectionTitle, styles.sectionTitleInRow]}>Is Your Forecast On Pace?</Text>
                                                    </View>
                                                    <View style={[styles.assessmentCard, { borderLeftColor: planForecastAlignment.onPace ? Colors.income : Colors.expense }]}>
                                                        <View style={styles.assessmentHeader}>
                                                            <Text style={styles.assessmentLabel}>Near-Term Cash Flow Forecast</Text>
                                                            <View style={[styles.feasibilityBadge, { backgroundColor: (planForecastAlignment.onPace ? Colors.income : Colors.expense) + '22', borderColor: planForecastAlignment.onPace ? Colors.income : Colors.expense }]}>
                                                                <Text style={[styles.feasibilityText, { color: planForecastAlignment.onPace ? Colors.income : Colors.expense }]}>
                                                                    {planForecastAlignment.onPace ? 'ON PACE' : 'BEHIND PACE'}
                                                                </Text>
                                                            </View>
                                                        </View>
                                                        <Text style={styles.readinessNarrative}>{planForecastAlignment.message}</Text>
                                                    </View>
                                                    {!planForecastAlignment.onPace && (
                                                        <NextStepLink text="See the full cash flow forecast" onPress={() => { setPlanGoalId(null); setCurrentScreen('cashflow'); }} />
                                                    )}
                                                </>
                                            )}

                                            {planRevenueMarginForecastAlignment?.applicable && (
                                                <>
                                                    <View style={[styles.sectionTitleRow, { marginTop: 16 }]}>
                                                        <Icon name="trending-up" size={15} color={Colors.textPrimary} />
                                                        <Text style={[styles.sectionTitle, styles.sectionTitleInRow]}>Is Your Forecast On Pace?</Text>
                                                    </View>
                                                    <View style={[styles.assessmentCard, { borderLeftColor: planRevenueMarginForecastAlignment.onPace ? Colors.income : Colors.expense }]}>
                                                        <View style={styles.assessmentHeader}>
                                                            <Text style={styles.assessmentLabel}>Near-Term Revenue Forecast</Text>
                                                            <View style={[styles.feasibilityBadge, { backgroundColor: (planRevenueMarginForecastAlignment.onPace ? Colors.income : Colors.expense) + '22', borderColor: planRevenueMarginForecastAlignment.onPace ? Colors.income : Colors.expense }]}>
                                                                <Text style={[styles.feasibilityText, { color: planRevenueMarginForecastAlignment.onPace ? Colors.income : Colors.expense }]}>
                                                                    {planRevenueMarginForecastAlignment.onPace ? 'ON PACE' : 'BEHIND PACE'}
                                                                </Text>
                                                            </View>
                                                        </View>
                                                        <Text style={styles.readinessNarrative}>{planRevenueMarginForecastAlignment.message}</Text>
                                                    </View>
                                                    {!planRevenueMarginForecastAlignment.onPace && (
                                                        <NextStepLink text="See the full revenue forecast" onPress={() => { setPlanGoalId(null); navigate('cfo', { tab: 'forecast' }); }} />
                                                    )}
                                                </>
                                            )}

                                            {planGoalForecastGap?.available && (
                                                <>
                                                    <View style={[styles.sectionTitleRow, { marginTop: 16 }]}>
                                                        <Icon name="target" size={15} color={Colors.textPrimary} />
                                                        <Text style={[styles.sectionTitle, styles.sectionTitleInRow]}>Target vs. Forecast</Text>
                                                    </View>
                                                    <View style={[styles.assessmentCard, { borderLeftColor: planGoalForecastGap.gap > 0 ? Colors.expense : Colors.income }]}>
                                                        <Text style={styles.readinessNarrative}>{planGoalForecastGap.headline}</Text>
                                                        {planGoalForecastGap.gap > 0 && (
                                                            <Text style={[styles.readinessNarrative, { marginTop: 6, fontWeight: '700' }]}>
                                                                Gap: {settings.currency}{Math.round(planGoalForecastGap.gap).toLocaleString()}
                                                            </Text>
                                                        )}
                                                    </View>
                                                    {planGoalForecastGap.prompt && (
                                                        <Text style={[styles.strategyFooter, { fontStyle: 'italic' }]}>{planGoalForecastGap.prompt}</Text>
                                                    )}
                                                </>
                                            )}

                                            <Text style={styles.strategyFooter}>
                                                Alignment refreshes automatically as your budget and financial data change.
                                            </Text>
                                        </>
                                    )}

                                    <TouchableOpacity style={[styles.modalBtn, { backgroundColor: Colors.primary, marginTop: 16 }]} onPress={() => setPlanGoalId(null)}>
                                        <Text style={styles.modalBtnText}>Close</Text>
                                    </TouchableOpacity>
                                </>
                            )}
                        </View>
                    </ScrollView>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

function DailyActionsSection({ goal, transactions, currency }: { goal: FinancialGoal; transactions: Transaction[]; currency: string }) {
    const today = new Date().toISOString().split('T')[0];
    const todayTx = transactions.filter(t => t.date === today);
    const todayRevenue = todayTx.filter(t => t.type === 'income').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    // Loan principal excluded -- "today's profit"/"spending budget" below are
    // P&L-style messaging, and principal isn't a cost that can be "paused".
    const todayExpenses = todayTx.filter(t => t.type === 'expense').reduce((s, t) => s + (Number(t.amount) || 0) - (t.principalPortion || 0), 0);
    const todayProfit = todayRevenue - todayExpenses;

    const daysLeft = Math.max(1, Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / 86400000));
    const remaining = Math.max(0, goal.targetValue - goal.currentValue);
    const dailyTarget = ['revenue_growth', 'custom'].includes(goal.type) ? remaining / daysLeft : 0;
    const dailyBudget = goal.type === 'cost_reduction' ? goal.targetValue / Math.max(1, daysLeft) : 0;

    const overdueTotal = transactions.filter(t => t.type === 'income' && t.status === 'overdue').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const overdueCount = transactions.filter(t => t.type === 'income' && t.status === 'overdue').length;

    const fmt = (n: number) => `${currency}${Math.round(isNaN(n) ? 0 : n).toLocaleString()}`;

    const actions: { num: number; text: string }[] = [];

    if (todayTx.length === 0) {
        actions.push({ num: 1, text: 'Log today\'s sales and expenses — the app can only help if you record what happens each day' });
    }
    if (dailyTarget > 0) {
        if (todayRevenue >= dailyTarget) {
            actions.push({ num: actions.length + 1, text: `✅ Revenue target hit today (${fmt(todayRevenue)} of ${fmt(dailyTarget)}). Keep this pace — ${daysLeft} days left.` });
        } else {
            const gap = dailyTarget - todayRevenue;
            const topCat = [...transactions.filter(t => t.type === 'income')]
                .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))[0]?.category ?? 'your best product';
            actions.push({ num: actions.length + 1, text: `Make ${fmt(gap)} more today to hit your daily target of ${fmt(dailyTarget)} — focus on ${topCat}` });
        }
    }
    if (dailyBudget > 0 && todayExpenses > dailyBudget) {
        actions.push({ num: actions.length + 1, text: `Spending is ${fmt(todayExpenses - dailyBudget)} over today's budget of ${fmt(dailyBudget)} — pause non-essential purchases` });
    }
    if (overdueTotal > 0) {
        actions.push({ num: actions.length + 1, text: `Chase ${overdueCount} unpaid invoice${overdueCount > 1 ? 's' : ''} — you're owed ${fmt(overdueTotal)}. A quick call or message often gets results.` });
    }
    if (todayProfit > 0 && actions.length < 2) {
        actions.push({ num: actions.length + 1, text: `You made ${fmt(todayProfit)} profit today. Well done! Consistency is how goals get achieved.` });
    }
    if (actions.length === 0) {
        actions.push({ num: 1, text: `You need ${fmt(remaining)} more to hit this goal in ${daysLeft} days. Daily logging keeps you on track.` });
    }

    return (
        <View style={styles.dailyActionsBox}>
            <Text style={styles.dailyActionsTitle}>TODAY'S ACTION LIST</Text>
            {actions.slice(0, 3).map((a) => (
                <View key={a.num} style={styles.dailyActionRow}>
                    <View style={styles.dailyActionNum}><Text style={styles.dailyActionNumText}>{a.num}</Text></View>
                    <Text style={styles.dailyActionText}>{a.text}</Text>
                </View>
            ))}
        </View>
    );
}

// React.memo + stable (useCallback'd, list-index-independent) handlers from
// the parent means a card whose own goal/feasibility hasn't changed can
// skip re-rendering entirely when a sibling goal updates or the screen
// re-renders for an unrelated reason (typing in the add-goal form, etc.).
const GoalCard = React.memo(function GoalCard({ goal, currency, daysRemaining, feasibility, onPlan, onEdit, onDelete, onExecute, onCollect, onSeeFullPicture }: {
    goal: FinancialGoal;
    currency: string;
    daysRemaining: string;
    feasibility?: { feasibility: string; requiredMonthlyImprovement: number; successProbability: number };
    onPlan: (id: string) => void;
    onEdit: (goal: FinancialGoal) => void;
    onDelete: (id: string, title: string) => void;
    onExecute?: () => void;
    onCollect?: () => void;
    onSeeFullPicture?: () => void;
}) {
    const statusColor = STATUS_COLORS[goal.status];
    const isReduction = goal.type === 'cost_reduction' || goal.type === 'reduce_overdue_ar';
    const unit = goal.unit === '%' ? '%' : goal.unit === 'days' ? 'days' : currency;
    // '%' and 'days' are suffixes (64.4%, 90 days), currency is a prefix
    // (₦64.4) — unit was being prepended unconditionally throughout this
    // card, so every percentage goal (margin_improvement) displayed as
    // "%64.4" instead of "64.4%". 'days' (runway goals saved from the Goal
    // Bridge screen) needs the same suffix treatment.
    const fmtUnit = (value: number, decimals: number = 0) =>
        unit === '%' ? `${value.toFixed(decimals)}%` : unit === 'days' ? `${Math.round(value)} days` : `${unit}${Math.round(value).toLocaleString()}`;

    const isAchieved = goal.status === 'achieved';
    const feasColor = feasibility?.feasibility === 'easy' ? Colors.income : feasibility?.feasibility === 'medium' ? Colors.warning : Colors.expense;
    return (
        <View style={[cardStyles.card, { borderTopColor: statusColor }, isAchieved && cardStyles.achievedCard]}>
            <View style={cardStyles.header}>
                <View style={cardStyles.titleRow}>
                    {isAchieved && <View style={cardStyles.trophy}><Icon name="award" size={14} color={Colors.income} /></View>}
                    <Text style={cardStyles.title} numberOfLines={2}>{goal.title}</Text>
                </View>
                <View style={[cardStyles.statusBadge, { backgroundColor: statusColor + '22' }]}>
                    <Text style={[cardStyles.statusText, { color: statusColor }]}>{STATUS_LABELS[goal.status]}</Text>
                </View>
            </View>

            {goal.description ? <Text style={cardStyles.desc}>{goal.description}</Text> : null}

            {/* Feasibility preview — how realistic is this goal, and what does
                it actually take, without needing to open Goal Bridge first. */}
            {!isAchieved && feasibility && (
                <View style={[cardStyles.feasRow, { borderColor: feasColor + '55', backgroundColor: feasColor + '12' }]}>
                    <Text style={[cardStyles.feasBadge, { color: feasColor }]}>{feasibility.feasibility.toUpperCase()}</Text>
                    <Text style={cardStyles.feasText}>
                        Needs {fmtUnit(Math.abs(feasibility.requiredMonthlyImprovement), 1)}/mo · {(feasibility.successProbability * 100).toFixed(0)}% likely
                    </Text>
                </View>
            )}

            {!isAchieved && feasibility?.feasibility === 'difficult' && (
                <View style={cardStyles.solutionBox}>
                    <View style={cardStyles.solutionTitleRow}>
                        <Icon name="zap" size={12} color={Colors.textPrimary} />
                        <Text style={cardStyles.solutionTitle}>{suggestSolution(GOAL_TYPE_SOLUTION[goal.type]).title}</Text>
                    </View>
                    <Text style={cardStyles.solutionDetail}>{suggestSolution(GOAL_TYPE_SOLUTION[goal.type]).detail}</Text>
                    {onExecute && <NextStepLink text="See your action plan" onPress={onExecute} />}
                    {onSeeFullPicture && <NextStepLink text="See the full profit → cash picture" onPress={onSeeFullPicture} />}
                </View>
            )}
            {!isAchieved && goal.type === 'reduce_overdue_ar' && (goal.status === 'off_track' || goal.status === 'at_risk') && onCollect && (
                <NextStepLink text="Review overdue collections" onPress={onCollect} />
            )}

            {/* Progress bar + key numbers */}
            {(isNaN(goal.progress) || goal.progress <= 0) ? (
                <Text style={[cardStyles.progressPct, { color: Colors.textMuted, width: 'auto', marginBottom: 12, fontSize: 12 }]}>Not started yet</Text>
            ) : goal.progress > 100 ? (
                <Text style={[cardStyles.progressPct, { color: Colors.income, width: 'auto', marginBottom: 12, fontSize: 13, fontWeight: 'bold' }]}>
                    🎉 Goal achieved! {(goal.progress ?? 0).toFixed(0)}%
                </Text>
            ) : (
                <View style={cardStyles.progressSection}>
                    <View style={cardStyles.progressTrack}>
                        <View style={[cardStyles.progressFill, { width: `${Math.min(goal.progress, 100)}%` as any, backgroundColor: statusColor }]} />
                    </View>
                    <Text style={[cardStyles.progressPct, { color: statusColor }]}>{(goal.progress ?? 0).toFixed(0)}%</Text>
                </View>
            )}
            <View style={cardStyles.bigNumbers}>
                <View style={cardStyles.bigNum}>
                    <Text style={cardStyles.bigNumVal}>{fmtUnit(goal.currentValue ?? 0, 1)}</Text>
                    <Text style={cardStyles.bigNumLabel}>Current</Text>
                </View>
                <Text style={cardStyles.bigNumArrow}>→</Text>
                <View style={cardStyles.bigNum}>
                    <Text style={[cardStyles.bigNumVal, { color: statusColor }]}>{fmtUnit(goal.targetValue ?? 0, 1)}</Text>
                    <Text style={cardStyles.bigNumLabel}>Target</Text>
                </View>
            </View>

            {/* Metrics row */}
            <View style={cardStyles.metricsRow}>
                <View style={cardStyles.metric}>
                    <Text style={cardStyles.metricLabel}>Current</Text>
                    <Text style={cardStyles.metricValue}>{fmtUnit(goal.currentValue ?? 0, 1)}</Text>
                </View>
                <View style={cardStyles.metric}>
                    <Text style={cardStyles.metricLabel}>Baseline</Text>
                    <Text style={cardStyles.metricValue}>{fmtUnit(goal.baselineValue ?? 0, 1)}</Text>
                </View>
                <View style={cardStyles.metric}>
                    <Text style={cardStyles.metricLabel}>Target</Text>
                    <Text style={[cardStyles.metricValue, { color: statusColor }]}>{fmtUnit(goal.targetValue ?? 0, 1)}</Text>
                </View>
                <View style={cardStyles.metric}>
                    <Text style={cardStyles.metricLabel}>Deadline</Text>
                    <Text style={cardStyles.metricValue}>{daysRemaining}</Text>
                </View>
            </View>

            <View style={cardStyles.actions}>
                <TouchableOpacity style={cardStyles.strategyBtn} onPress={() => onPlan(goal.id)}>
                    <View style={cardStyles.strategyBtnInner}>
                        <Icon name="compass" size={13} color="#fff" />
                        <Text style={cardStyles.strategyBtnText}>View Plan →</Text>
                    </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onEdit(goal)} style={{ marginLeft: 12 }}>
                    <Text style={[cardStyles.deleteText, { color: Colors.primary }]}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onDelete(goal.id, goal.title)} style={{ marginLeft: 12 }}>
                    <Text style={cardStyles.deleteText}>Delete</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
});

function FieldLabel({ children }: { children: React.ReactNode }) {
    return <Text style={styles.label}>{children}</Text>;
}

const cardStyles = StyleSheet.create({
    card: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.lg, marginBottom: 14, borderWidth: 1, borderColor: Colors.border, borderTopWidth: 3, ...Shadow.sm },
    achievedCard: { backgroundColor: 'rgba(16,185,129,0.06)', borderTopColor: Colors.income },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
    titleRow: { flexDirection: 'row', flex: 1, alignItems: 'flex-start', marginRight: Spacing.sm },
    trophy: { marginRight: 4 },
    title: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary, flex: 1 },
    feasRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 10 },
    feasBadge: { fontSize: 10, fontWeight: '800' },
    feasText: { fontSize: 11, color: Colors.textSecondary, flex: 1 },
    solutionBox:    { backgroundColor: Colors.primary + '10', borderRadius: Radius.sm, padding: 10, marginBottom: 10 },
    solutionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
    solutionTitle:  { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
    solutionDetail: { fontSize: 11, color: Colors.textSecondary, lineHeight: 16, marginBottom: 4 },
    bigNumbers: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 12, backgroundColor: Colors.bg, borderRadius: 10, padding: 10 },
    bigNum: { alignItems: 'center' },
    bigNumVal: { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary },
    bigNumLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
    bigNumArrow: { fontSize: 18, color: Colors.textMuted },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    statusText: { fontSize: 10, fontWeight: 'bold' },
    desc: { fontSize: 12, color: Colors.textMuted, marginBottom: 12, lineHeight: 18 },
    progressSection: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
    progressTrack: { flex: 1, height: 8, backgroundColor: Colors.bg, borderRadius: 4, overflow: 'hidden' },
    progressFill: { height: 8, borderRadius: 4 },
    progressPct: { fontSize: 12, fontWeight: 'bold', width: 36, textAlign: 'right' },
    metricsRow: { flexDirection: 'row', marginBottom: 12, gap: 4 },
    metric: { flex: 1, alignItems: 'center' },
    metricLabel: { fontSize: 10, color: Colors.textMuted, marginBottom: 2 },
    metricValue: { fontSize: 11, fontWeight: '600', color: Colors.textPrimary, textAlign: 'center' },
    actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    strategyBtn: { backgroundColor: Colors.primary, paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.sm },
    strategyBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    // Bug fix: this button sits on a solid Colors.primary background — the
    // text was using Colors.textPrimary (near-black in the light "Warm
    // Paper" theme), making it illegible. Same class of bug already fixed
    // in LoginScreen/ReportsScreen.
    strategyBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
    deleteText: { color: Colors.expense, fontSize: 12 },
});

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: Spacing.lg },
    title: { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: Spacing.sm },
    subtitle: { fontSize: 13, color: Colors.textMuted, lineHeight: 20, marginBottom: Spacing.xl },
    achievedHeader: { fontSize: 13, fontWeight: '700', color: Colors.income, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 4 },
    emptyCard: { backgroundColor: Colors.surface, borderRadius: 14, padding: 28, alignItems: 'center', marginBottom: Spacing.xxl },
    emptyIcon: { alignItems: 'center', marginBottom: 10 },
    emptyTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: Spacing.sm },
    emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: Spacing.md },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.md },
    sectionTitleInRow: { marginBottom: 0 },
    typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: Spacing.xl },
    typeCard: {
        backgroundColor: Colors.surface,
        borderRadius: 10,
        padding: 14,
        width: '47%',
        borderWidth: 1,
        borderColor: Colors.border,
        ...Shadow.sm,
    },
    typeIcon: { marginBottom: 6 },
    typeLabel: { fontSize: 13, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
    typeDesc: { fontSize: 11, color: Colors.textMuted, lineHeight: 16 },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
    modal: { backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.xxl, paddingBottom: 44 },
    modalWide: { maxWidth: 640, width: '100%', alignSelf: 'center' },
    modalTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: Spacing.lg },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary, textAlign: 'center' },
    label: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600', marginBottom: 6, marginTop: Spacing.md },
    input: {
        backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border,
        borderRadius: Radius.sm, paddingHorizontal: Spacing.md, paddingVertical: 10,
        color: Colors.textPrimary, fontSize: 14,
    },
    modalBtns: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.xxl },
    modalBtn: { flex: 1, paddingVertical: 13, borderRadius: Radius.sm, alignItems: 'center' },
    // Bug fix: modalBtn is always given a saturated background (Colors.muted
    // or Colors.primary) inline — Colors.textPrimary text on top of either
    // is illegible in the light "Warm Paper" theme. Same fix as
    // LoginScreen/ReportsScreen.
    modalBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
    strategyIntro: { fontSize: 13, color: Colors.textMuted, marginBottom: Spacing.lg, lineHeight: 20, textAlign: 'center' },
    actionCard: { backgroundColor: Colors.bg, borderRadius: 10, padding: 14, marginBottom: Spacing.md, borderLeftWidth: 4 },
    actionHeader: { marginBottom: 6 },
    priorityBadge: { alignSelf: 'flex-start', paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.sm },
    priorityText: { fontSize: 10, fontWeight: 'bold' },
    actionTitle: { fontSize: 14, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 6 },
    actionDetail: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },
    metricPill: { backgroundColor: Colors.surface, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 5, marginTop: Spacing.sm, alignSelf: 'flex-start' },
    metricText: { fontSize: 11, color: Colors.primary, fontWeight: '600' },
    strategyFooter: { fontSize: 11, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.lg, fontStyle: 'italic' },
    dailyActionsBox: { backgroundColor: Colors.bg, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginTop: Spacing.lg, marginBottom: 4 },
    dailyActionsTitle: { fontSize: 9, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1, marginBottom: Spacing.sm },
    dailyActionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.sm },
    dailyActionNum: { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
    dailyActionNumText: { fontSize: 10, fontWeight: '700', color: '#fff' },
    dailyActionText: { flex: 1, fontSize: 12, color: Colors.textPrimary, lineHeight: 17 },

    // Plan modal — Bridge tab (adapted from the retired GoalBridgeScreen)
    planTabs: { flexDirection: 'row', backgroundColor: Colors.bg, borderRadius: 10, padding: 4, marginBottom: Spacing.lg, gap: 4 },
    planTab: { flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.sm, alignItems: 'center' },
    planTabInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    planTabActive: { backgroundColor: Colors.primary },
    planTabText: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
    planTabTextActive: { color: '#fff' },

    assessmentCard: { backgroundColor: Colors.bg, borderRadius: 14, borderLeftWidth: 4, padding: Spacing.lg, marginBottom: Spacing.xl, gap: Spacing.md },
    assessmentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
    assessmentLabel: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    feasibilityBadge: { borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
    feasibilityText: { fontSize: 10, fontWeight: '700' },
    assessmentRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    assessmentRowLabel: { fontSize: 12, color: Colors.textSecondary, flex: 1 },
    assessmentRowValue: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    timelineNote: { fontSize: 10, color: Colors.textMuted, marginLeft: 4 },
    approachBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
    probabilityContainer: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
    probabilityBar: { flex: 1, height: 6, backgroundColor: Colors.surface, borderRadius: 3, overflow: 'hidden' },
    probabilityFill: { height: '100%' },
    probabilityPercent: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
    readinessNarrative: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18, marginTop: 4 },

    roadmapNode: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.sm },
    timelineNodeContainer: { alignItems: 'center', width: 30 },
    timelineNode: { width: 12, height: 12, borderRadius: 6 },
    timelineConnector: { width: 2, height: 30, backgroundColor: Colors.border, marginTop: 4 },
    roadmapCard: { flex: 1, backgroundColor: Colors.bg, borderRadius: 10, padding: Spacing.md, borderLeftWidth: 2, borderLeftColor: Colors.primary },
    roadmapCardTitle: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
    roadmapCardMonth: { fontSize: 10, color: Colors.textMuted, marginBottom: 6 },
    roadmapCardContribution: { fontSize: 12, fontWeight: '700' },

    milestoneCard: { backgroundColor: Colors.bg, borderRadius: Radius.md, padding: Spacing.md, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderLeftWidth: 3, borderLeftColor: Colors.primary },
    milestoneLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    milestoneDot: { width: 12, height: 12, borderRadius: 6 },
    milestoneContent: { flex: 1 },
    milestoneMonth: { fontSize: 10, color: Colors.textMuted, fontWeight: '600', marginBottom: 2 },
    milestoneDescription: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
    milestoneValue: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },

    ctaButton: { backgroundColor: Colors.income, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: Spacing.sm, marginBottom: Spacing.sm },
    ctaButtonText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
