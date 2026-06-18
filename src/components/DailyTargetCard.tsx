import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../theme/colors';
import { FinancialGoal, Transaction } from '../types';

interface Props {
    goals: FinancialGoal[];
    transactions: Transaction[];
    currency: string;
    onSetGoal: () => void;
}

function fmt(n: number, currency: string) {
    const v = isNaN(n) ? 0 : n;
    if (v >= 1_000_000) return `${currency}${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${currency}${(v / 1_000).toFixed(0)}k`;
    return `${currency}${Math.round(v).toLocaleString()}`;
}

export default function DailyTargetCard({ goals, transactions, currency, onSetGoal }: Props) {
    const activeGoal = goals.find(g =>
        g.status !== 'achieved' &&
        ['revenue_growth', 'custom', 'margin_improvement', 'cost_reduction'].includes(g.type)
    );

    const today = new Date().toISOString().split('T')[0];
    const todayTx = transactions.filter(t => t.date === today);
    const todayRevenue = todayTx.filter(t => t.type === 'income').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const todayExpenses = todayTx.filter(t => t.type === 'expense').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const todayProfit = todayRevenue - todayExpenses;

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

    return (
        <View style={s.card}>
            <View style={s.headerRow}>
                <Text style={s.label}>🎯 Today's Plan — {activeGoal.title}</Text>
                <Text style={s.daysLeft}>{daysLeft}d left</Text>
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
        </View>
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
    label: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, flex: 1 },
    daysLeft: { fontSize: 11, color: Colors.textMuted, backgroundColor: Colors.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    dataRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderTopWidth: 1, borderTopColor: Colors.border },
    dataLabel: { flex: 1.4, fontSize: 11, color: Colors.textSecondary },
    dataTarget: { flex: 0.8, fontSize: 11, color: Colors.textMuted, textAlign: 'right' },
    dataActual: { flex: 0.8, fontSize: 12, fontWeight: '700', textAlign: 'right' },
    dataGap: { flex: 1, fontSize: 11, textAlign: 'right' },
    scoreRow: { marginTop: 10 },
    track: { height: 6, backgroundColor: Colors.bg, borderRadius: 3, overflow: 'hidden', marginBottom: 5 },
    fill: { height: 6, borderRadius: 3 },
    scoreLabel: { fontSize: 10, color: Colors.textMuted, textAlign: 'center' },
    emptyCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.border, padding: 14, marginBottom: 10 },
    emptyIcon: { fontSize: 22 },
    emptyTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    emptySub: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
    arrow: { fontSize: 18, color: Colors.primary },
});
