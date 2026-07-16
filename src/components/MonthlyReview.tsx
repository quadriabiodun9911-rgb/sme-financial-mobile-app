import React, { useMemo } from 'react';
import {
    Modal, View, Text, TouchableOpacity,
    StyleSheet, ScrollView, SafeAreaView,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';

interface Props {
    visible: boolean;
    onClose: () => void;
}

export default function MonthlyReview({ visible, onClose }: Props) {
    const { transactions, invoices, goals, finance, settings, setCurrentScreen } = useApp();
    const currency = settings.currency;

    const now = new Date();
    const thisMonth = now.toISOString().slice(0, 7);
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = lastMonthDate.toISOString().slice(0, 7);
    const monthName = now.toLocaleString('default', { month: 'long' });
    const lastMonthName = lastMonthDate.toLocaleString('default', { month: 'long' });

    const review = useMemo(() => {
        const thisTxs = transactions.filter(t => (t.date ?? '').startsWith(thisMonth));
        const lastTxs = transactions.filter(t => (t.date ?? '').startsWith(lastMonth));

        const sum = (txs: typeof transactions, type: 'income' | 'expense') =>
            txs.filter(t => t.type === type).reduce((s, t) => s + (Number(t.amount) || 0), 0);

        const thisIncome  = sum(thisTxs, 'income');
        const thisExpense = sum(thisTxs, 'expense');
        const thisProfit  = thisIncome - thisExpense;
        const lastIncome  = sum(lastTxs, 'income');
        const lastExpense = sum(lastTxs, 'expense');
        const lastProfit  = lastIncome - lastExpense;

        const incomeDelta  = lastIncome  > 0 ? ((thisIncome  - lastIncome)  / lastIncome)  * 100 : null;
        const profitDelta  = lastProfit  !== 0 ? ((thisProfit - lastProfit) / Math.abs(lastProfit)) * 100 : null;

        // Top 3 expense categories
        const catMap: Record<string, number> = {};
        thisTxs.filter(t => t.type === 'expense').forEach(t => {
            catMap[t.category] = (catMap[t.category] || 0) + (Number(t.amount) || 0);
        });
        const topExpenses = Object.entries(catMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);

        // Unpaid invoices
        const unpaidInvoices = invoices.filter(inv => inv.status === 'sent' || inv.status === 'overdue');
        const unpaidTotal = unpaidInvoices.reduce((s, inv) => s + inv.total, 0);
        const overdueInvoices = unpaidInvoices.filter(inv => inv.status === 'overdue');

        // Goal progress
        const activeGoals = goals.filter(g => g.status !== 'achieved');

        // One recommendation
        let recommendation = '';
        if (thisProfit < 0) {
            const biggestCat = topExpenses[0];
            recommendation = biggestCat
                ? `Your biggest cost this month is ${biggestCat[0]} (${currency}${biggestCat[1].toLocaleString()}). Consider if this can be reduced next month.`
                : 'You spent more than you earned this month. Review your expenses and look for areas to cut.';
        } else if (incomeDelta !== null && incomeDelta < -10) {
            recommendation = `Your income dropped ${Math.abs(incomeDelta).toFixed(0)}% vs ${lastMonthName}. Consider reaching out to existing customers or offering a promotion.`;
        } else if (overdueInvoices.length > 0) {
            recommendation = `You have ${overdueInvoices.length} overdue invoice${overdueInvoices.length > 1 ? 's' : ''}. Follow up with clients to collect ${currency}${overdueInvoices.reduce((s, i) => s + i.total, 0).toLocaleString()} owed.`;
        } else if (thisProfit > 0 && profitDelta !== null && profitDelta > 10) {
            recommendation = `Great month! Profit is up ${profitDelta.toFixed(0)}% vs ${lastMonthName}. Consider setting aside some of this profit as a cash reserve.`;
        } else {
            recommendation = 'Keep logging every day — the more data you have, the clearer your financial picture becomes.';
        }

        return {
            thisIncome, thisExpense, thisProfit,
            lastIncome, lastExpense, lastProfit,
            incomeDelta, profitDelta,
            topExpenses, unpaidInvoices, unpaidTotal, overdueInvoices,
            activeGoals, recommendation,
            txCount: thisTxs.length,
        };
    }, [transactions, invoices, goals, thisMonth, lastMonth]);

    const isProfit = review.thisProfit >= 0;

    const navigate = (screen: string) => { onClose(); setCurrentScreen(screen as any); };

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <SafeAreaView style={styles.root}>
                {/* Header */}
                <View style={styles.header}>
                    <View>
                        <Text style={styles.headerTitle}>{monthName} Review</Text>
                        <Text style={styles.headerSub}>{review.txCount} transactions logged</Text>
                    </View>
                    <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                        <Text style={styles.closeBtnText}>✕ Close</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView style={styles.scroll} contentContainerStyle={styles.pad}>

                    {/* ── 1. Did I make money? ─────────────────────────────── */}
                    <View style={styles.section}>
                        <Text style={styles.sectionQ}>1. Did I make money this month?</Text>
                        <View style={[styles.answerCard, { borderColor: isProfit ? Colors.income : Colors.expense }]}>
                            <Text style={[styles.answerBig, { color: isProfit ? Colors.income : Colors.expense }]}>
                                {isProfit ? '✅ Yes' : '❌ No'}
                            </Text>
                            <Text style={[styles.answerNum, { color: isProfit ? Colors.income : Colors.expense }]}>
                                {isProfit ? '+' : ''}{currency}{review.thisProfit.toLocaleString()}
                            </Text>
                            {review.profitDelta !== null && (
                                <Text style={[styles.answerDelta, { color: review.profitDelta >= 0 ? Colors.income : Colors.expense }]}>
                                    {review.profitDelta >= 0 ? '▲' : '▼'} {Math.abs(review.profitDelta).toFixed(0)}% vs {lastMonthName} ({currency}{review.lastProfit.toLocaleString()})
                                </Text>
                            )}
                            <View style={styles.answerRow}>
                                <View style={styles.answerMetric}>
                                    <Text style={styles.answerLabel}>Money In</Text>
                                    <Text style={[styles.answerVal, { color: Colors.income }]}>{currency}{review.thisIncome.toLocaleString()}</Text>
                                </View>
                                <View style={styles.answerDivider} />
                                <View style={styles.answerMetric}>
                                    <Text style={styles.answerLabel}>Money Out</Text>
                                    <Text style={[styles.answerVal, { color: Colors.expense }]}>{currency}{review.thisExpense.toLocaleString()}</Text>
                                </View>
                            </View>
                        </View>
                    </View>

                    {/* ── 2. Where did my money go? ────────────────────────── */}
                    <View style={styles.section}>
                        <Text style={styles.sectionQ}>2. Where did most of my money go?</Text>
                        {review.topExpenses.length === 0 ? (
                            <Text style={styles.emptyNote}>No expenses logged this month</Text>
                        ) : (
                            <View style={styles.expenseList}>
                                {review.topExpenses.map(([cat, amt], i) => {
                                    const pct = review.thisExpense > 0 ? (amt / review.thisExpense) * 100 : 0;
                                    return (
                                        <View key={cat} style={styles.expenseRow}>
                                            <Text style={styles.expenseRank}>#{i + 1}</Text>
                                            <View style={styles.expenseBar}>
                                                <Text style={styles.expenseCat}>{cat}</Text>
                                                <View style={styles.barTrack}>
                                                    <View style={[styles.barFill, { width: `${pct}%` as any, backgroundColor: i === 0 ? Colors.expense : Colors.warning }]} />
                                                </View>
                                            </View>
                                            <View style={styles.expenseAmts}>
                                                <Text style={styles.expenseAmt}>{currency}{amt.toLocaleString()}</Text>
                                                <Text style={styles.expensePct}>{pct.toFixed(0)}%</Text>
                                            </View>
                                        </View>
                                    );
                                })}
                                <TouchableOpacity style={styles.viewAllLink} onPress={() => navigate('transactions')}>
                                    <Text style={styles.viewAllText}>View all transactions →</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>

                    {/* ── 3. Who still owes me? ────────────────────────────── */}
                    <View style={styles.section}>
                        <Text style={styles.sectionQ}>3. Who still owes me money?</Text>
                        {review.unpaidInvoices.length === 0 ? (
                            <View style={[styles.answerCard, { borderColor: Colors.income }]}>
                                <Text style={[styles.answerBig, { color: Colors.income }]}>✅ All clear</Text>
                                <Text style={styles.emptyNote}>No unpaid invoices</Text>
                            </View>
                        ) : (
                            <View style={[styles.answerCard, { borderColor: review.overdueInvoices.length > 0 ? Colors.expense : Colors.warning }]}>
                                <Text style={[styles.answerBig, { color: review.overdueInvoices.length > 0 ? Colors.expense : Colors.warning }]}>
                                    {review.unpaidInvoices.length} unpaid
                                </Text>
                                <Text style={[styles.answerNum, { color: Colors.warning }]}>{currency}{review.unpaidTotal.toLocaleString()} owed to you</Text>
                                {review.overdueInvoices.length > 0 && (
                                    <Text style={{ color: Colors.expense, fontSize: 12, marginTop: 4 }}>
                                        {review.overdueInvoices.length} overdue — follow up now
                                    </Text>
                                )}
                                <TouchableOpacity style={styles.chaseBtn} onPress={() => navigate('invoices')}>
                                    <Text style={styles.chaseBtnText}>Go chase payments →</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>

                    {/* ── 4. Goal progress ─────────────────────────────────── */}
                    {review.activeGoals.length > 0 && (
                        <View style={styles.section}>
                            <Text style={styles.sectionQ}>4. How are my goals going?</Text>
                            {review.activeGoals.slice(0, 2).map(g => (
                                <View key={g.id} style={styles.goalRow}>
                                    <View style={styles.goalInfo}>
                                        <Text style={styles.goalTitle}>{g.title}</Text>
                                        <Text style={[styles.goalStatus, {
                                            color: g.status === 'on_track' ? Colors.income : g.status === 'achieved' ? Colors.income : Colors.warning
                                        }]}>
                                            {g.status === 'on_track' ? '✅ On track' : g.status === 'at_risk' ? '⚠️ At risk' : '❌ Off track'}
                                        </Text>
                                    </View>
                                    <View style={styles.goalBarTrack}>
                                        <View style={[styles.goalBarFill, {
                                            width: `${Math.min(g.progress ?? 0, 100)}%` as any,
                                            backgroundColor: g.status === 'on_track' ? Colors.income : Colors.warning
                                        }]} />
                                    </View>
                                    <Text style={styles.goalPct}>{(g.progress ?? 0).toFixed(0)}%</Text>
                                </View>
                            ))}
                            <TouchableOpacity style={styles.viewAllLink} onPress={() => navigate('goals')}>
                                <Text style={styles.viewAllText}>View all goals →</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* ── 5. Recommendation ────────────────────────────────── */}
                    <View style={[styles.section, styles.recBox]}>
                        <Text style={styles.recIcon}>💡</Text>
                        <Text style={styles.recTitle}>One thing to do next month</Text>
                        <Text style={styles.recText}>{review.recommendation}</Text>
                    </View>

                </ScrollView>
            </SafeAreaView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    root:   { flex: 1, backgroundColor: Colors.bg },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary },
    headerSub:   { fontSize: 12, color: Colors.textMuted },
    closeBtn:    { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: Colors.border },
    closeBtnText:{ fontSize: 13, color: Colors.textMuted },
    scroll: { flex: 1 },
    pad:    { padding: 16, paddingBottom: 40 },

    section:   { marginBottom: 20 },
    sectionQ:  { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 10 },
    emptyNote: { fontSize: 13, color: Colors.textMuted, fontStyle: 'italic', padding: 12 },

    answerCard:   { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, borderWidth: 2 },
    answerBig:    { fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
    answerNum:    { fontSize: 28, fontWeight: 'bold', marginBottom: 6 },
    answerDelta:  { fontSize: 12, fontWeight: '600', marginBottom: 12 },
    answerRow:    { flexDirection: 'row', borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12, marginTop: 4 },
    answerMetric: { flex: 1, alignItems: 'center' },
    answerDivider:{ width: 1, backgroundColor: Colors.border },
    answerLabel:  { fontSize: 11, color: Colors.textMuted, marginBottom: 4 },
    answerVal:    { fontSize: 16, fontWeight: '700' },

    expenseList: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border },
    expenseRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    expenseRank: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, width: 20 },
    expenseBar:  { flex: 1 },
    expenseCat:  { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, marginBottom: 3 },
    barTrack:    { height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden' },
    barFill:     { height: 6, borderRadius: 3 },
    expenseAmts: { alignItems: 'flex-end', minWidth: 70 },
    expenseAmt:  { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    expensePct:  { fontSize: 10, color: Colors.textMuted },
    viewAllLink: { paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 4 },
    viewAllText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },

    chaseBtn:     { marginTop: 12, backgroundColor: Colors.warning, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
    chaseBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

    goalRow:      { backgroundColor: Colors.surface, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
    goalInfo:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    goalTitle:    { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, flex: 1 },
    goalStatus:   { fontSize: 12, fontWeight: '600' },
    goalBarTrack: { height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
    goalBarFill:  { height: 6, borderRadius: 3 },
    goalPct:      { fontSize: 11, color: Colors.textMuted, textAlign: 'right' },

    recBox:   { backgroundColor: 'rgba(0,102,204,0.08)', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: Colors.primary, flexDirection: 'column' },
    recIcon:  { fontSize: 28, marginBottom: 8 },
    recTitle: { fontSize: 14, fontWeight: '700', color: Colors.primary, marginBottom: 6 },
    recText:  { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },
});
