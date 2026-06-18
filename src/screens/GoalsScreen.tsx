import React, { useState, useMemo, useEffect } from 'react';
import {
    SafeAreaView, ScrollView, View, Text, TextInput,
    TouchableOpacity, Modal, StyleSheet, Alert,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import DateInput from '../components/DateInput';
import { GoalType, FinancialGoal } from '../types';
import { generateStrategy } from '../utils/goals';

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
    const { goals, addGoal, deleteGoal, updateGoal, finance, transactions, settings, navParams } = useApp();
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
    });

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
        // Pre-fill title from type label
        const meta = GOAL_TYPES.find(g => g.type === type)!;
        setForm({ title: meta.label, description: meta.description, targetValue: '', deadline: '' });
    };

    const handleCreate = () => {
        if (!selectedType) return;
        if (!form.title.trim()) { Alert.alert('Missing field', 'Please enter a goal title.'); return; }
        if (!form.deadline.match(/^\d{4}-\d{2}-\d{2}$/)) { Alert.alert('Invalid date', 'Enter deadline as YYYY-MM-DD.'); return; }
        const tv = parseFloat(form.targetValue);
        if (isNaN(tv)) { Alert.alert('Invalid value', 'Enter a numeric target value.'); return; }

        addGoal(selectedType, {
            title: form.title.trim(),
            description: form.description.trim(),
            targetValue: tv,
            deadline: form.deadline,
        });
        setAddModalOpen(false);
        setSelectedType(null);
    };

    const handleDelete = (id: string, title: string) => {
        Alert.alert('Delete Goal', `Remove "${title}"?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteGoal(id) },
        ]);
    };

    const openEditModal = (goal: FinancialGoal) => {
        setEditGoal(goal);
        setForm({ title: goal.title, description: goal.description, targetValue: String(goal.targetValue), deadline: goal.deadline });
    };

    const handleEditSave = () => {
        if (!editGoal) return;
        if (!form.title.trim()) { Alert.alert('Missing field', 'Please enter a goal title.'); return; }
        if (!form.deadline.match(/^\d{4}-\d{2}-\d{2}$/)) { Alert.alert('Invalid date', 'Enter deadline as YYYY-MM-DD.'); return; }
        const tv = parseFloat(form.targetValue);
        if (isNaN(tv)) { Alert.alert('Invalid value', 'Enter a numeric target value.'); return; }
        updateGoal(editGoal.id, { title: form.title.trim(), description: form.description.trim(), targetValue: tv, deadline: form.deadline });
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
                                    onStrategy={() => setStrategyGoalId(goal.id)}
                                    onEdit={() => openEditModal(goal)}
                                    onDelete={() => handleDelete(goal.id, goal.title)}
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

                            <FieldLabel>Target Value ({selectedType === 'margin_improvement' ? '%' : currency})</FieldLabel>
                            <TextInput style={styles.input} value={form.targetValue} onChangeText={v => setForm(f => ({ ...f, targetValue: v }))} keyboardType="numeric" placeholder="e.g. 200000" placeholderTextColor={Colors.muted} />

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

                            <FieldLabel>Target Value</FieldLabel>
                            <TextInput style={styles.input} value={form.targetValue} onChangeText={v => setForm(f => ({ ...f, targetValue: v }))} keyboardType="numeric" placeholderTextColor={Colors.muted} />

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

function GoalCard({ goal, currency, daysRemaining, onStrategy, onEdit, onDelete }: {
    goal: FinancialGoal;
    currency: string;
    daysRemaining: string;
    onStrategy: () => void;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const statusColor = STATUS_COLORS[goal.status];
    const isReduction = goal.type === 'cost_reduction' || goal.type === 'reduce_overdue_ar';
    const unit = goal.unit === '%' ? '%' : currency;

    const isAchieved = goal.status === 'achieved';
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

            {/* Progress bar + key numbers */}
            {(isNaN(goal.progress) || goal.progress <= 0) ? (
                <Text style={[cardStyles.progressPct, { color: Colors.textMuted, width: 'auto', marginBottom: 12, fontSize: 12 }]}>Not started yet</Text>
            ) : goal.progress > 100 ? (
                <Text style={[cardStyles.progressPct, { color: Colors.income, width: 'auto', marginBottom: 12, fontSize: 13, fontWeight: 'bold' }]}>
                    🎉 Goal achieved! {goal.progress.toFixed(0)}%
                </Text>
            ) : (
                <View style={cardStyles.progressSection}>
                    <View style={cardStyles.progressTrack}>
                        <View style={[cardStyles.progressFill, { width: `${Math.min(goal.progress, 100)}%` as any, backgroundColor: statusColor }]} />
                    </View>
                    <Text style={[cardStyles.progressPct, { color: statusColor }]}>{goal.progress.toFixed(0)}%</Text>
                </View>
            )}
            <View style={cardStyles.bigNumbers}>
                <View style={cardStyles.bigNum}>
                    <Text style={cardStyles.bigNumVal}>{unit}{goal.currentValue.toLocaleString()}</Text>
                    <Text style={cardStyles.bigNumLabel}>Current</Text>
                </View>
                <Text style={cardStyles.bigNumArrow}>→</Text>
                <View style={cardStyles.bigNum}>
                    <Text style={[cardStyles.bigNumVal, { color: statusColor }]}>{unit}{goal.targetValue.toLocaleString()}</Text>
                    <Text style={cardStyles.bigNumLabel}>Target</Text>
                </View>
            </View>

            {/* Metrics row */}
            <View style={cardStyles.metricsRow}>
                <View style={cardStyles.metric}>
                    <Text style={cardStyles.metricLabel}>Current</Text>
                    <Text style={cardStyles.metricValue}>{unit}{goal.currentValue.toLocaleString()}</Text>
                </View>
                <View style={cardStyles.metric}>
                    <Text style={cardStyles.metricLabel}>Baseline</Text>
                    <Text style={cardStyles.metricValue}>{unit}{goal.baselineValue.toLocaleString()}</Text>
                </View>
                <View style={cardStyles.metric}>
                    <Text style={cardStyles.metricLabel}>Target</Text>
                    <Text style={[cardStyles.metricValue, { color: statusColor }]}>{unit}{goal.targetValue.toLocaleString()}</Text>
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
});
