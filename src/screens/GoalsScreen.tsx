import React, { useState, useMemo, useEffect } from 'react';
import {
    SafeAreaView, ScrollView, View, Text, TextInput,
    TouchableOpacity, Modal, StyleSheet, Alert, Platform,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import DateInput from '../components/DateInput';
import { GoalType, FinancialGoal, Transaction } from '../types';
import { generateStrategy, goalDefaults, buildNewGoal } from '../utils/goals';
import NextStepLink from '../components/NextStepLink';
import { calculateGoalBridge, mapSavedGoalToBridge } from '../utils/goalBridgeEngine';
import { performFinancialDiagnosis } from '../utils/financialDiagnosisEngine';
import { generateActionPlan } from '../utils/actionRecommendationEngine';
import { suggestSolution, ImpactSource } from '../utils/impactChain';

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

const GOAL_TYPES: { type: GoalType; label: string; icon: string; description: string }[] = [
    { type: 'revenue_growth', label: 'Increase Revenue', icon: '📈', description: 'Grow total income to a target amount' },
    { type: 'margin_improvement', label: 'Improve Margin', icon: '💰', description: 'Raise profit margin to a target percentage' },
    { type: 'cost_reduction', label: 'Reduce Costs', icon: '✂️', description: 'Cut total operating expenses' },
    { type: 'cash_reserve', label: 'Build Cash Reserve', icon: '🏦', description: 'Grow cash balance to a target amount' },
    { type: 'reduce_overdue_ar', label: 'Clear Overdue AR', icon: '📋', description: 'Collect all outstanding receivables' },
    { type: 'custom', label: 'Custom Goal', icon: '🎯', description: 'Define your own financial milestone' },
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

export default function GoalsScreen() {
    const { goals, addGoal, deleteGoal, updateGoal, finance, transactions, invoices, settings, navParams, navigate, setCurrentScreen } = useApp();
    const { currency } = settings;

    const [addModalOpen, setAddModalOpen] = useState(false);
    const [editGoal, setEditGoal]         = useState<FinancialGoal | null>(null);
    const [strategyGoalId, setStrategyGoalId] = useState<string | null>(null);
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

    // Feasibility per goal — reuses the same root-cause diagnosis + tactics
    // engine as Goal Bridge, so every goal card shows at a glance whether it's
    // realistic (EASY/MEDIUM/DIFFICULT) and what monthly improvement it needs,
    // instead of only revealing that after tapping into a separate screen.
    const feasibilityByGoalId = useMemo(() => {
        if (transactions.length < 5 || goals.length === 0) return {};
        const diagnosis = performFinancialDiagnosis(transactions, invoices, finance.cashBalance, finance.expense || 1, settings.currency);
        const tactics = generateActionPlan(diagnosis, diagnosis.metrics, settings.currency);
        const allTactics = [...tactics.immediateActions, ...tactics.shortTermActions, ...tactics.strategicActions];
        const map: Record<string, { feasibility: string; requiredMonthlyImprovement: number; successProbability: number }> = {};
        for (const g of goals) {
            const bridge = calculateGoalBridge(mapSavedGoalToBridge(g), diagnosis.metrics, allTactics, settings.currency);
            map[g.id] = {
                feasibility: bridge.feasibility,
                requiredMonthlyImprovement: bridge.requiredMonthlyImprovement,
                successProbability: bridge.successProbability,
            };
        }
        return map;
    }, [transactions, invoices, finance.cashBalance, finance.expense, goals, settings.currency]);

    const strategyGoal = useMemo(
        () => goals.find(g => g.id === strategyGoalId) ?? null,
        [goals, strategyGoalId]
    );

    const strategy = useMemo(
        () => strategyGoal ? generateStrategy(strategyGoal, finance, transactions, settings) : null,
        [strategyGoal, finance, transactions, settings]
    );

    // Auto-open add modal if navigated here with a goalType param
    useEffect(() => {
        if (navParams?.goalType) {
            setAddModalOpen(true);
            openAddModal(navParams.goalType);
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
        if (!form.title.trim()) { Alert.alert('Almost there', 'Give your goal a name first'); return; }
        if (!form.deadline.match(/^\d{4}-\d{2}-\d{2}$/)) { Alert.alert('Please pick a date', 'Tap the date field and choose your deadline'); return; }
        const tv = parseFloat(form.targetValue);
        if (isNaN(tv)) { Alert.alert('Please enter an amount', 'Type in the target amount, e.g. 50000'); return; }

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

    const handleDelete = (id: string, title: string) => {
        if (Platform.OS === 'web') {
            if (window.confirm(`Remove "${title}"?`)) {
                deleteGoal(id);
            }
        } else {
            Alert.alert('Delete Goal', `Remove "${title}"?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => deleteGoal(id) },
            ]);
        }
    };

    const openEditModal = (goal: FinancialGoal) => {
        setEditGoal(goal);
        setSelectedType(goal.type);
        setForm({ title: goal.title, description: goal.description, targetValue: String(goal.targetValue), deadline: goal.deadline, percentTarget: String(goal.percentTarget ?? '') });
    };

    const handleEditSave = () => {
        if (!editGoal) return;
        if (!form.title.trim()) { Alert.alert('Almost there', 'Give your goal a name first'); return; }
        if (!form.deadline.match(/^\d{4}-\d{2}-\d{2}$/)) { Alert.alert('Please pick a date', 'Tap the date field and choose your deadline'); return; }
        const tv = parseFloat(form.targetValue);
        if (isNaN(tv)) { Alert.alert('Please enter an amount', 'Type in the target amount, e.g. 50000'); return; }
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
                            <Text style={styles.emptyIcon}>🎯</Text>
                            <Text style={styles.emptyTitle}>No goals yet</Text>
                            <Text style={styles.emptyText}>
                                Add your first goal below. The app will analyse your financials and generate a step-by-step strategy to help you achieve it.
                            </Text>
                        </View>
                    ) : (
                        <>
                            {/* Active goals */}
                            {goals.filter(g => g.status !== 'achieved').map(goal => (
                                <GoalCard
                                    key={goal.id}
                                    goal={goal}
                                    currency={currency}
                                    daysRemaining={daysRemaining(goal.deadline)}
                                    feasibility={feasibilityByGoalId[goal.id]}
                                    onStrategy={() => setStrategyGoalId(goal.id)}
                                    onBridge={() => navigate('goal-bridge', { goalId: goal.id })}
                                    onEdit={() => openEditModal(goal)}
                                    onDelete={() => handleDelete(goal.id, goal.title)}
                                    onExecute={() => setCurrentScreen('action-tracker')}
                                    onCollect={() => navigate('transactions', { filter: 'collect' })}
                                    onSeeFullPicture={() => setCurrentScreen('clarity')}
                                />
                            ))}
                            {/* Achieved goals */}
                            {goals.filter(g => g.status === 'achieved').length > 0 && (
                                <>
                                    <Text style={styles.achievedHeader}>Achieved Goals</Text>
                                    {goals.filter(g => g.status === 'achieved').map(goal => (
                                        <GoalCard
                                            key={goal.id}
                                            goal={goal}
                                            currency={currency}
                                            daysRemaining={daysRemaining(goal.deadline)}
                                            onStrategy={() => setStrategyGoalId(goal.id)}
                                            onBridge={() => navigate('goal-bridge', { goalId: goal.id })}
                                            onEdit={() => openEditModal(goal)}
                                            onDelete={() => handleDelete(goal.id, goal.title)}
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
                                <Text style={styles.typeIcon}>{gt.icon}</Text>
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
                        <View style={styles.modal}>
                            <Text style={styles.modalTitle}>
                                {GOAL_TYPES.find(g => g.type === selectedType)?.icon}{' '}
                                {GOAL_TYPES.find(g => g.type === selectedType)?.label}
                            </Text>

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
                        <View style={styles.modal}>
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

            {/* Strategy Modal */}
            <Modal visible={!!strategyGoalId} animationType="slide" transparent onRequestClose={() => setStrategyGoalId(null)}>
                <View style={styles.overlay}>
                    <ScrollView>
                        <View style={styles.modal}>
                            {strategyGoal && strategy && (
                                <>
                                    <Text style={styles.modalTitle}>Strategy: {strategyGoal.title}</Text>
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
                                    <DailyActionsSection goal={strategyGoal} transactions={transactions} currency={currency} />

                                    <Text style={styles.strategyFooter}>
                                        Strategy refreshes automatically as your financial data changes.
                                    </Text>
                                    <TouchableOpacity style={[styles.modalBtn, { backgroundColor: Colors.primary, marginTop: 8 }]} onPress={() => setStrategyGoalId(null)}>
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
    const todayExpenses = todayTx.filter(t => t.type === 'expense').reduce((s, t) => s + (Number(t.amount) || 0), 0);
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
                .sort((a, b) => b.amount - a.amount)[0]?.category ?? 'your best product';
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

function GoalCard({ goal, currency, daysRemaining, feasibility, onStrategy, onBridge, onEdit, onDelete, onExecute, onCollect, onSeeFullPicture }: {
    goal: FinancialGoal;
    currency: string;
    daysRemaining: string;
    feasibility?: { feasibility: string; requiredMonthlyImprovement: number; successProbability: number };
    onStrategy: () => void;
    onBridge: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onExecute?: () => void;
    onCollect?: () => void;
    onSeeFullPicture?: () => void;
}) {
    const statusColor = STATUS_COLORS[goal.status];
    const isReduction = goal.type === 'cost_reduction' || goal.type === 'reduce_overdue_ar';
    const unit = goal.unit === '%' ? '%' : currency;

    const isAchieved = goal.status === 'achieved';
    const feasColor = feasibility?.feasibility === 'easy' ? Colors.income : feasibility?.feasibility === 'medium' ? Colors.warning : Colors.expense;
    return (
        <View style={[cardStyles.card, { borderTopColor: statusColor }, isAchieved && cardStyles.achievedCard]}>
            <View style={cardStyles.header}>
                <View style={cardStyles.titleRow}>
                    {isAchieved && <Text style={cardStyles.trophy}>🏆 </Text>}
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
                        Needs {currency}{Math.round(Math.abs(feasibility.requiredMonthlyImprovement)).toLocaleString()}/mo · {(feasibility.successProbability * 100).toFixed(0)}% likely
                    </Text>
                </View>
            )}

            {!isAchieved && feasibility?.feasibility === 'difficult' && (
                <View style={cardStyles.solutionBox}>
                    <Text style={cardStyles.solutionTitle}>💡 {suggestSolution(GOAL_TYPE_SOLUTION[goal.type]).title}</Text>
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
                    <Text style={cardStyles.bigNumVal}>{unit}{(goal.currentValue ?? 0).toLocaleString()}</Text>
                    <Text style={cardStyles.bigNumLabel}>Current</Text>
                </View>
                <Text style={cardStyles.bigNumArrow}>→</Text>
                <View style={cardStyles.bigNum}>
                    <Text style={[cardStyles.bigNumVal, { color: statusColor }]}>{unit}{(goal.targetValue ?? 0).toLocaleString()}</Text>
                    <Text style={cardStyles.bigNumLabel}>Target</Text>
                </View>
            </View>

            {/* Metrics row */}
            <View style={cardStyles.metricsRow}>
                <View style={cardStyles.metric}>
                    <Text style={cardStyles.metricLabel}>Current</Text>
                    <Text style={cardStyles.metricValue}>{unit}{(goal.currentValue ?? 0).toLocaleString()}</Text>
                </View>
                <View style={cardStyles.metric}>
                    <Text style={cardStyles.metricLabel}>Baseline</Text>
                    <Text style={cardStyles.metricValue}>{unit}{(goal.baselineValue ?? 0).toLocaleString()}</Text>
                </View>
                <View style={cardStyles.metric}>
                    <Text style={cardStyles.metricLabel}>Target</Text>
                    <Text style={[cardStyles.metricValue, { color: statusColor }]}>{unit}{(goal.targetValue ?? 0).toLocaleString()}</Text>
                </View>
                <View style={cardStyles.metric}>
                    <Text style={cardStyles.metricLabel}>Deadline</Text>
                    <Text style={cardStyles.metricValue}>{daysRemaining}</Text>
                </View>
            </View>

            <View style={cardStyles.actions}>
                <TouchableOpacity style={cardStyles.strategyBtn} onPress={onStrategy}>
                    <Text style={cardStyles.strategyBtnText}>View Strategy →</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onBridge} style={{ marginLeft: 12 }}>
                    <Text style={[cardStyles.deleteText, { color: Colors.primary }]}>🌉 Bridge</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onEdit} style={{ marginLeft: 12 }}>
                    <Text style={[cardStyles.deleteText, { color: Colors.primary }]}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onDelete} style={{ marginLeft: 12 }}>
                    <Text style={cardStyles.deleteText}>Delete</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
    return <Text style={styles.label}>{children}</Text>;
}

const cardStyles = StyleSheet.create({
    card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 14, borderTopWidth: 3 },
    achievedCard: { backgroundColor: 'rgba(16,185,129,0.06)', borderTopColor: Colors.income },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
    titleRow: { flexDirection: 'row', flex: 1, alignItems: 'flex-start', marginRight: 8 },
    trophy: { fontSize: 14 },
    title: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary, flex: 1 },
    feasRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 10 },
    feasBadge: { fontSize: 10, fontWeight: '800' },
    feasText: { fontSize: 11, color: Colors.textSecondary, flex: 1 },
    solutionBox:    { backgroundColor: Colors.primary + '10', borderRadius: 8, padding: 10, marginBottom: 10 },
    solutionTitle:  { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, marginBottom: 3 },
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
    strategyBtn: { backgroundColor: Colors.primary, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 },
    strategyBtnText: { color: Colors.textPrimary, fontSize: 12, fontWeight: 'bold' },
    deleteText: { color: Colors.expense, fontSize: 12 },
});

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: 16 },
    title: { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 8 },
    subtitle: { fontSize: 13, color: Colors.textMuted, lineHeight: 20, marginBottom: 20 },
    achievedHeader: { fontSize: 13, fontWeight: '700', color: Colors.income, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 4 },
    emptyCard: { backgroundColor: Colors.surface, borderRadius: 14, padding: 28, alignItems: 'center', marginBottom: 24 },
    emptyIcon: { fontSize: 36, marginBottom: 10 },
    emptyTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 8 },
    emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 12 },
    typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
    typeCard: {
        backgroundColor: Colors.surface,
        borderRadius: 10,
        padding: 14,
        width: '47%',
        borderWidth: 1,
        borderColor: Colors.border,
    },
    typeIcon: { fontSize: 24, marginBottom: 6 },
    typeLabel: { fontSize: 13, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
    typeDesc: { fontSize: 11, color: Colors.textMuted, lineHeight: 16 },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
    modal: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 44 },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary, textAlign: 'center', marginBottom: 16 },
    label: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600', marginBottom: 6, marginTop: 12 },
    input: {
        backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border,
        borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
        color: Colors.textPrimary, fontSize: 14,
    },
    modalBtns: { flexDirection: 'row', gap: 12, marginTop: 24 },
    modalBtn: { flex: 1, paddingVertical: 13, borderRadius: 8, alignItems: 'center' },
    modalBtnText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 14 },
    strategyIntro: { fontSize: 13, color: Colors.textMuted, marginBottom: 16, lineHeight: 20, textAlign: 'center' },
    actionCard: { backgroundColor: Colors.bg, borderRadius: 10, padding: 14, marginBottom: 12, borderLeftWidth: 4 },
    actionHeader: { marginBottom: 6 },
    priorityBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    priorityText: { fontSize: 10, fontWeight: 'bold' },
    actionTitle: { fontSize: 14, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 6 },
    actionDetail: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },
    metricPill: { backgroundColor: Colors.surface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginTop: 8, alignSelf: 'flex-start' },
    metricText: { fontSize: 11, color: Colors.primary, fontWeight: '600' },
    strategyFooter: { fontSize: 11, color: Colors.textMuted, textAlign: 'center', marginTop: 16, fontStyle: 'italic' },
    dailyActionsBox: { backgroundColor: Colors.bg, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 12, marginTop: 16, marginBottom: 4 },
    dailyActionsTitle: { fontSize: 9, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1, marginBottom: 8 },
    dailyActionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
    dailyActionNum: { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
    dailyActionNumText: { fontSize: 10, fontWeight: '700', color: '#fff' },
    dailyActionText: { flex: 1, fontSize: 12, color: Colors.textPrimary, lineHeight: 17 },
});
