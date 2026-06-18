import React from 'react';
import {
    Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { Colors } from '../theme/colors';
import { Transaction, FinancialGoal, FinanceData, BusinessSettings } from '../types';
import { Invoice } from '../types';

interface Props {
    visible: boolean;
    onClose: () => void;
    transactions: Transaction[];
    goals: FinancialGoal[];
    finance: FinanceData;
    settings: BusinessSettings;
    currency: string;
}

export default function DailyReportModal({ visible, onClose, transactions, goals, finance, settings, currency }: Props) {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const dateLabel = today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    // Today's numbers
    const todayTxns = transactions.filter(t => t.date === todayStr);
    const todayRevenue = todayTxns.filter(t => t.type === 'income').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const todayExpenses = todayTxns.filter(t => t.type === 'expense').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const todayProfit = todayRevenue - todayExpenses;
    const todaySales = todayTxns.length;

    // Active goal
    const activeGoal = goals.find(g => g.status !== 'achieved' && (g.type === 'revenue_growth' || g.type === 'custom' || g.type === 'margin_improvement' || g.type === 'cost_reduction'));

    // Daily targets from active goal
    let dailyRevenueTarget = 0;
    let dailyCostBudget = 0;
    let dailyProfitTarget = 0;
    if (activeGoal) {
        const deadline = new Date(activeGoal.deadline);
        const created = new Date(activeGoal.createdAt);
        const daysInPeriod = Math.max(1, Math.ceil((deadline.getTime() - created.getTime()) / 86400000));
        dailyRevenueTarget = isNaN(activeGoal.targetValue / daysInPeriod) ? 0 : activeGoal.targetValue / daysInPeriod;
        dailyCostBudget = activeGoal.type === 'cost_reduction'
            ? (isNaN(activeGoal.targetValue / daysInPeriod) ? 0 : activeGoal.targetValue / daysInPeriod)
            : (isNaN(activeGoal.baselineValue / daysInPeriod) ? 0 : activeGoal.baselineValue / daysInPeriod);
        dailyProfitTarget = Math.max(0, dailyRevenueTarget - dailyCostBudget);
    }

    // Verdicts
    const revenueOk = dailyRevenueTarget === 0 || todayRevenue >= dailyRevenueTarget;
    const expenseOk = dailyCostBudget === 0 || todayExpenses <= dailyCostBudget;
    const profitPositive = todayProfit > 0;

    let verdict = '';
    let verdictEmoji = '';
    if (todaySales === 0) {
        verdictEmoji = '⚠️';
        verdict = 'No transactions logged today. Make sure to record all your sales and expenses.';
    } else if (revenueOk && expenseOk) {
        verdictEmoji = '✅';
        verdict = 'Great day! You hit your revenue target and stayed within budget.';
    } else if (revenueOk || profitPositive) {
        verdictEmoji = '⚠️';
        verdict = 'Decent day — but there\'s room to improve. Check your action plan below.';
    } else {
        verdictEmoji = '❌';
        verdict = 'Tough day. Don\'t worry — tomorrow is a fresh start. See your action plan below.';
    }

    // Action plan
    const actions: string[] = [];

    // Overdue invoices / transactions
    const overdueInvoiceCount = transactions.filter(t => t.type === 'income' && t.status === 'overdue').length;
    const overdueInvoiceTotal = transactions.filter(t => t.type === 'income' && t.status === 'overdue').reduce((s, t) => s + (Number(t.amount) || 0), 0);

    if (todaySales === 0) {
        actions.push('Log all your sales tomorrow — it only takes 30 seconds per sale');
    } else if (!revenueOk && dailyRevenueTarget > 0) {
        const topIncomeCategory = todayTxns.filter(t => t.type === 'income').sort((a, b) => b.amount - a.amount)[0]?.category || 'your top category';
        const gap = dailyRevenueTarget - todayRevenue;
        actions.push(`Try to make at least ${currency}${Math.round(isNaN(gap) ? 0 : gap).toLocaleString()} more tomorrow — focus on ${topIncomeCategory}`);
    }

    if (!expenseOk && dailyCostBudget > 0) {
        const over = todayExpenses - dailyCostBudget;
        actions.push(`Keep spending under ${currency}${Math.round(isNaN(dailyCostBudget) ? 0 : dailyCostBudget).toLocaleString()} tomorrow — you went ${currency}${Math.round(isNaN(over) ? 0 : over).toLocaleString()} over today`);
    }

    if (overdueInvoiceCount > 0) {
        actions.push(`Follow up on ${overdueInvoiceCount} unpaid invoice${overdueInvoiceCount !== 1 ? 's' : ''} — you\'re owed ${currency}${Math.round(isNaN(overdueInvoiceTotal) ? 0 : overdueInvoiceTotal).toLocaleString()}`);
    }

    if (profitPositive && revenueOk && expenseOk && activeGoal) {
        const deadline = new Date(activeGoal.deadline);
        const daysLeft = Math.max(1, Math.ceil((deadline.getTime() - today.getTime()) / 86400000));
        const remaining = Math.max(0, activeGoal.targetValue - activeGoal.currentValue);
        actions.push(`Great day! Keep it up — you need ${currency}${Math.round(isNaN(remaining) ? 0 : remaining).toLocaleString()} more to hit your ${activeGoal.title} by the deadline (${daysLeft} days left)`);
    }

    if (profitPositive && todayProfit > 0) {
        actions.push(`You made ${currency}${Math.round(isNaN(todayProfit) ? 0 : todayProfit).toLocaleString()} profit today. Well done!`);
    }

    // Ensure at least one action
    if (actions.length === 0) {
        actions.push('Keep logging your transactions daily — consistency is key to understanding your business');
    }

    // Keep only 3 actions
    const topActions = actions.slice(0, 3);

    const fmt = (n: number) => {
        const v = isNaN(n) ? 0 : n;
        return `${currency}${Math.round(v).toLocaleString()}`;
    };

    const pct = (actual: number, target: number) => {
        if (!target) return '';
        const p = Math.round((actual / target) * 100);
        return ` (target: ${fmt(target)} — ${isNaN(p) ? 0 : p}%)`;
    };

    const expensePct = (actual: number, budget: number) => {
        if (!budget) return '';
        const over = actual - budget;
        if (over <= 0) return ` (budget: ${fmt(budget)} — under budget)`;
        const p = Math.round((over / budget) * 100);
        return ` (budget: ${fmt(budget)} — ${isNaN(p) ? 0 : p}% over)`;
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={s.overlay}>
                <View style={s.sheet}>
                    <ScrollView showsVerticalScrollIndicator={false}>
                        {/* Header */}
                        <Text style={s.heading}>End of Day — {dateLabel}</Text>
                        <View style={s.divider} />

                        {/* Today's Summary */}
                        <Text style={s.sectionTitle}>TODAY'S SUMMARY</Text>
                        <View style={s.summaryBlock}>
                            <View style={s.summaryRow}>
                                <Text style={s.summaryKey}>Revenue:</Text>
                                <Text style={[s.summaryVal, { color: Colors.income }]}>
                                    {fmt(todayRevenue)}{dailyRevenueTarget > 0 ? pct(todayRevenue, dailyRevenueTarget) : ''}
                                </Text>
                            </View>
                            <View style={s.summaryRow}>
                                <Text style={s.summaryKey}>Expenses:</Text>
                                <Text style={[s.summaryVal, { color: todayExpenses <= dailyCostBudget ? Colors.textPrimary : Colors.expense }]}>
                                    {fmt(todayExpenses)}{dailyCostBudget > 0 ? expensePct(todayExpenses, dailyCostBudget) : ''}
                                </Text>
                            </View>
                            <View style={s.summaryRow}>
                                <Text style={s.summaryKey}>Profit:</Text>
                                <Text style={[s.summaryVal, { color: todayProfit >= 0 ? Colors.income : Colors.expense }]}>
                                    {todayProfit >= 0 ? '+' : ''}{fmt(todayProfit)}{dailyProfitTarget > 0 ? pct(todayProfit, dailyProfitTarget) : ''}
                                </Text>
                            </View>
                            <View style={s.summaryRow}>
                                <Text style={s.summaryKey}>Sales logged:</Text>
                                <Text style={s.summaryVal}>{todaySales} transaction{todaySales !== 1 ? 's' : ''}</Text>
                            </View>
                        </View>

                        {/* Verdict */}
                        <Text style={s.sectionTitle}>HOW DID YOU DO?</Text>
                        <View style={s.verdictBlock}>
                            <Text style={s.verdictEmoji}>{verdictEmoji}</Text>
                            <Text style={s.verdictText}>{verdict}</Text>
                        </View>

                        {/* Action plan */}
                        <Text style={s.sectionTitle}>TOMORROW'S ACTION PLAN</Text>
                        {topActions.map((action, i) => (
                            <View key={i} style={s.actionRow}>
                                <Text style={s.actionNum}>{i + 1}.</Text>
                                <Text style={s.actionText}>{action}</Text>
                            </View>
                        ))}

                        {/* Close button */}
                        <TouchableOpacity style={s.closeBtn} onPress={onClose}>
                            <Text style={s.closeBtnText}>Close</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 44, maxHeight: '90%' },
    heading: { fontSize: 17, fontWeight: 'bold', color: Colors.textPrimary, textAlign: 'center', marginBottom: 12 },
    divider: { height: 1, backgroundColor: Colors.border, marginBottom: 16 },
    sectionTitle: { fontSize: 10, fontWeight: '800', color: Colors.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, marginTop: 4 },
    summaryBlock: { backgroundColor: Colors.bg, borderRadius: 10, padding: 14, marginBottom: 16 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
    summaryKey: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600', minWidth: 90 },
    summaryVal: { fontSize: 13, color: Colors.textPrimary, fontWeight: '700', flex: 1, textAlign: 'right', flexWrap: 'wrap' },
    verdictBlock: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: Colors.bg, borderRadius: 10, padding: 14, marginBottom: 16 },
    verdictEmoji: { fontSize: 22 },
    verdictText: { fontSize: 13, color: Colors.textSecondary, flex: 1, lineHeight: 20 },
    actionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10 },
    actionNum: { fontSize: 14, fontWeight: 'bold', color: Colors.primary, minWidth: 20 },
    actionText: { fontSize: 13, color: Colors.textSecondary, flex: 1, lineHeight: 20 },
    closeBtn: { backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 20 },
    closeBtnText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 15 },
});
