import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { Colors } from '../theme/colors';
import { FinancialGoal, Transaction } from '../types';

interface Props {
    goals: FinancialGoal[];
    transactions: Transaction[];
    currency: string;
    onSetGoal: () => void;
    onEditGoal?: (id: string, changes: { targetValue: number; deadline: string; title: string }) => void;
    onDeleteGoal?: (id: string) => void;
}

function fmt(n: number, currency: string) {
    const v = isNaN(n) ? 0 : n;
    if (v >= 1_000_000) return `${currency}${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${currency}${(v / 1_000).toFixed(0)}k`;
    return `${currency}${Math.round(v).toLocaleString()}`;
}

export default function DailyTargetCard({ goals, transactions, currency, onSetGoal, onEditGoal, onDeleteGoal }: Props) {
    const [editOpen, setEditOpen] = useState(false);
    const [editTitle, setEditTitle] = useState('');
    const [editTarget, setEditTarget] = useState('');
    const [editDeadline, setEditDeadline] = useState('');

    const activeGoal = goals.find(g =>
        g.status !== 'achieved' &&
        ['revenue_growth', 'custom', 'margin_improvement', 'cost_reduction'].includes(g.type)
    );

    const today = new Date().toISOString().split('T')[0];
    const todayTx = transactions.filter(t => t.date === today);
    const todayRevenue = todayTx.filter(t => t.type === 'income').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const todayExpenses = todayTx.filter(t => t.type === 'expense').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const todayProfit = todayRevenue - todayExpenses;

    const openEdit = () => {
        if (!activeGoal) return;
        setEditTitle(activeGoal.title);
        setEditTarget(String(activeGoal.targetValue));
        setEditDeadline(activeGoal.deadline);
        setEditOpen(true);
    };

    const saveEdit = () => {
        if (!activeGoal || !onEditGoal) return;
        const tv = parseFloat(editTarget);
        if (isNaN(tv) || tv <= 0) { Alert.alert('Invalid target', 'Enter a valid target amount.'); return; }
        if (!editDeadline.match(/^\d{4}-\d{2}-\d{2}$/)) { Alert.alert('Invalid date', 'Enter date as YYYY-MM-DD.'); return; }
        onEditGoal(activeGoal.id, { targetValue: tv, deadline: editDeadline, title: editTitle.trim() || activeGoal.title });
        setEditOpen(false);
    };

    const confirmDelete = () => {
        if (!activeGoal || !onDeleteGoal) return;
        Alert.alert('Remove Target', `Remove "${activeGoal.title}" from your daily plan?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: () => onDeleteGoal(activeGoal.id) },
        ]);
    };

    if (!activeGoal) {
        return (
            <TouchableOpacity style={s.emptyCard} onPress={onSetGoal}>
                <Text style={s.emptyIcon}>🎯</Text>
                <View style={{ flex: 1 }}>
                    <Text style={s.emptyTitle}>Set a daily target</Text>
                    <Text style={s.emptySub}>Tap to set a goal — we'll tell you how much to make each day</Text>
                </View>
                <Text style={s.arrow}>→</Text>
            </TouchableOpacity>
        );
    }

    const daysLeft = Math.max(1, Math.ceil((new Date(activeGoal.deadline).getTime() - Date.now()) / 86400000));
    const daysTotal = Math.max(1, Math.ceil((new Date(activeGoal.deadline).getTime() - new Date(activeGoal.createdAt).getTime()) / 86400000));
    const remaining = Math.max(0, activeGoal.targetValue - activeGoal.currentValue);

    const dailyRevenueTarget = ['revenue_growth', 'custom'].includes(activeGoal.type)
        ? remaining / daysLeft : 0;
    const dailyCostBudget = activeGoal.type === 'cost_reduction'
        ? activeGoal.targetValue / daysTotal : 0;
    const dailyProfitTarget = activeGoal.type === 'margin_improvement'
        ? (activeGoal.targetValue / 100) * (activeGoal.baselineValue / daysTotal) : 0;

    const checks = [
        dailyRevenueTarget > 0 ? todayRevenue >= dailyRevenueTarget : null,
        dailyCostBudget > 0 ? todayExpenses <= dailyCostBudget : null,
        dailyProfitTarget > 0 ? todayProfit >= dailyProfitTarget : null,
        todayRevenue > 0,
    ].filter(v => v !== null) as boolean[];
    const score = checks.filter(Boolean).length;
    const scorePct = checks.length > 0 ? Math.round((score / checks.length) * 100) : 0;

    const revenueGap = dailyRevenueTarget - todayRevenue;
    const expenseOver = todayExpenses - dailyCostBudget;
    const profitGap = dailyProfitTarget - todayProfit;

    // Today's action list
    const actions: string[] = [];
    if (todayTx.length === 0) {
        actions.push('Log your first sale or expense today — tap the + button');
    }
    if (dailyRevenueTarget > 0 && revenueGap > 0) {
        actions.push(`Make ${fmt(revenueGap, currency)} more today to hit your revenue target`);
    }
    if (dailyCostBudget > 0 && expenseOver > 0) {
        actions.push(`You're ${fmt(expenseOver, currency)} over your expense budget — avoid extra spending`);
    }
    if (dailyProfitTarget > 0 && profitGap > 0) {
        actions.push(`${fmt(profitGap, currency)} more profit needed — increase sales or cut a cost`);
    }
    if (actions.length === 0 && todayTx.length > 0) {
        actions.push(`Great work! You're on track. Keep going — ${daysLeft} days left on this goal.`);
    }

    return (
        <>
            <View style={s.card}>
                <View style={s.headerRow}>
                    <Text style={s.label}>🎯 Today's Plan — {activeGoal.title}</Text>
                    <View style={s.headerActions}>
                        <Text style={s.daysLeft}>{daysLeft}d left</Text>
                        {onEditGoal && (
                            <TouchableOpacity style={s.iconBtn} onPress={openEdit}>
                                <Text style={s.iconBtnText}>Edit</Text>
                            </TouchableOpacity>
                        )}
                        {onDeleteGoal && (
                            <TouchableOpacity style={[s.iconBtn, s.deleteBtn]} onPress={confirmDelete}>
                                <Text style={s.deleteBtnText}>✕</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {dailyRevenueTarget > 0 && (
                    <DataRow
                        label="Revenue target"
                        target={fmt(dailyRevenueTarget, currency)}
                        actual={fmt(todayRevenue, currency)}
                        gap={revenueGap > 0 ? `${fmt(revenueGap, currency)} to go` : '✅ Hit'}
                        gapGood={revenueGap <= 0}
                    />
                )}

                {dailyCostBudget > 0 && (
                    <DataRow
                        label="Expense budget"
                        target={fmt(dailyCostBudget, currency)}
                        actual={fmt(todayExpenses, currency)}
                        gap={expenseOver > 0 ? `${fmt(expenseOver, currency)} over` : '✅ Under'}
                        gapGood={expenseOver <= 0}
                    />
                )}

                {dailyProfitTarget > 0 ? (
                    <DataRow
                        label="Profit target"
                        target={fmt(dailyProfitTarget, currency)}
                        actual={fmt(todayProfit, currency)}
                        gap={profitGap > 0 ? `${fmt(profitGap, currency)} behind` : '✅ Hit'}
                        gapGood={profitGap <= 0}
                    />
                ) : (
                    <DataRow
                        label="Today's profit"
                        target="—"
                        actual={fmt(todayProfit, currency)}
                        gap={todayProfit >= 0 ? '✅ Positive' : '❌ Loss'}
                        gapGood={todayProfit >= 0}
                    />
                )}

                <View style={s.scoreRow}>
                    <View style={s.track}>
                        <View style={[s.fill, {
                            width: `${scorePct}%` as any,
                            backgroundColor: scorePct >= 75 ? Colors.income : scorePct >= 40 ? Colors.warning : Colors.expense,
                        }]} />
                    </View>
                    <Text style={s.scoreLabel}>Today's score: {scorePct}%  ·  {todayTx.length} transactions logged</Text>
                </View>

                {/* Action list */}
                {actions.length > 0 && (
                    <View style={s.actionsBlock}>
                        <Text style={s.actionsTitle}>DO THIS TODAY</Text>
                        {actions.map((a, i) => (
                            <View key={i} style={s.actionRow}>
                                <Text style={s.actionNum}>{i + 1}</Text>
                                <Text style={s.actionText}>{a}</Text>
                            </View>
                        ))}
                    </View>
                )}
            </View>

            {/* Edit modal */}
            <Modal visible={editOpen} transparent animationType="slide" onRequestClose={() => setEditOpen(false)}>
                <View style={s.overlay}>
                    <View style={s.editSheet}>
                        <Text style={s.editTitle}>Edit Daily Target</Text>

                        <Text style={s.fieldLabel}>Goal Name</Text>
                        <TextInput style={s.input} value={editTitle} onChangeText={setEditTitle} placeholder="Goal name" placeholderTextColor={Colors.textMuted} />

                        <Text style={s.fieldLabel}>Target Amount ({currency})</Text>
                        <TextInput style={s.input} value={editTarget} onChangeText={setEditTarget} keyboardType="numeric" placeholder="e.g. 50000" placeholderTextColor={Colors.textMuted} />

                        <Text style={s.fieldLabel}>Deadline (YYYY-MM-DD)</Text>
                        <TextInput style={s.input} value={editDeadline} onChangeText={setEditDeadline} placeholder="e.g. 2025-12-31" placeholderTextColor={Colors.textMuted} />

                        <View style={s.editBtns}>
                            <TouchableOpacity style={s.cancelBtn} onPress={() => setEditOpen(false)}>
                                <Text style={s.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={s.saveBtn} onPress={saveEdit}>
                                <Text style={s.saveBtnText}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </>
    );
}

function DataRow({ label, target, actual, gap, gapGood }: {
    label: string; target: string; actual: string; gap: string; gapGood: boolean;
}) {
    return (
        <View style={s.dataRow}>
            <Text style={s.dataLabel}>{label}</Text>
            <Text style={s.dataTarget}>{target}</Text>
            <Text style={[s.dataActual, { color: gapGood ? Colors.income : Colors.textPrimary }]}>{actual}</Text>
            <Text style={[s.dataGap, { color: gapGood ? Colors.income : Colors.expense }]}>{gap}</Text>
        </View>
    );
}

const s = StyleSheet.create({
    card: { backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 10 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    label: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, flex: 1 },
    daysLeft: { fontSize: 11, color: Colors.textMuted, backgroundColor: Colors.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    iconBtn: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    iconBtnText: { fontSize: 11, color: Colors.primary, fontWeight: '600' },
    deleteBtn: { borderColor: Colors.expense + '44' },
    deleteBtnText: { fontSize: 11, color: Colors.expense },
    dataRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderTopWidth: 1, borderTopColor: Colors.border },
    dataLabel: { flex: 1.4, fontSize: 11, color: Colors.textSecondary },
    dataTarget: { flex: 0.8, fontSize: 11, color: Colors.textMuted, textAlign: 'right' },
    dataActual: { flex: 0.8, fontSize: 12, fontWeight: '700', textAlign: 'right' },
    dataGap: { flex: 1, fontSize: 11, textAlign: 'right' },
    scoreRow: { marginTop: 10 },
    track: { height: 6, backgroundColor: Colors.bg, borderRadius: 3, overflow: 'hidden', marginBottom: 5 },
    fill: { height: 6, borderRadius: 3 },
    scoreLabel: { fontSize: 10, color: Colors.textMuted, textAlign: 'center' },
    actionsBlock: { marginTop: 12, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 },
    actionsTitle: { fontSize: 9, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1, marginBottom: 6 },
    actionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 5 },
    actionNum: { width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.primary, color: '#fff', fontSize: 10, fontWeight: '700', textAlign: 'center', lineHeight: 18 },
    actionText: { flex: 1, fontSize: 12, color: Colors.textPrimary, lineHeight: 17 },
    emptyCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.border, padding: 14, marginBottom: 10 },
    emptyIcon: { fontSize: 22 },
    emptyTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    emptySub: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
    arrow: { fontSize: 18, color: Colors.primary },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    editSheet: { backgroundColor: Colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
    editTitle: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary, marginBottom: 16 },
    fieldLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 4, marginTop: 10 },
    input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, padding: 10, color: Colors.textPrimary, fontSize: 14 },
    editBtns: { flexDirection: 'row', gap: 10, marginTop: 20 },
    cancelBtn: { flex: 1, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, padding: 12, alignItems: 'center' },
    cancelBtnText: { fontSize: 14, color: Colors.textPrimary },
    saveBtn: { flex: 1, backgroundColor: Colors.primary, borderRadius: 8, padding: 12, alignItems: 'center' },
    saveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
