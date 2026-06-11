import React, { useState } from 'react';
import {
    SafeAreaView, ScrollView, View, Text,
    TouchableOpacity, StyleSheet, ActivityIndicator,
    Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { t } from '../utils/i18n';

export default function DashboardScreen() {
    const { finance, insight, settings, goals, transactions, invoices, navigate, setCurrentScreen, language, isLoading, addTransaction } = useApp();

    // Quick-add modal state
    const [fabOpen, setFabOpen]         = useState(false);
    const [qaType, setQaType]           = useState<'income' | 'expense'>('income');
    const [qaAmount, setQaAmount]       = useState('');
    const [qaDesc, setQaDesc]           = useState('');
    const [qaSubmitting, setQaSubmitting] = useState(false);

    const submitQuickAdd = () => {
        const amt = parseFloat(qaAmount);
        if (!qaDesc.trim() || isNaN(amt) || amt <= 0) return;
        setQaSubmitting(true);
        addTransaction({ type: qaType, amount: amt, description: qaDesc.trim(), category: qaType === 'income' ? 'Sales' : 'General', status: 'paid' });
        setQaAmount(''); setQaDesc(''); setQaSubmitting(false); setFabOpen(false);
    };

    if (isLoading) {
        return (
            <SafeAreaView style={styles.safe}>
                <Header />
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                    <Text style={{ color: Colors.textMuted, marginTop: 12, fontSize: 13 }}>{t(language, 'loading')}</Text>
                </View>
                <FooterNav />
            </SafeAreaView>
        );
    }
    const { currency, targetMargin, minReserve } = settings;

    const insightBorder =
        insight.severity === 'critical' ? Colors.criticalBorder
        : insight.severity === 'warning' ? Colors.warningBorder
        : Colors.healthyBorder;

    const tagBg = insightBorder;
    const tagColor = insight.severity === 'warning' ? Colors.bg : Colors.textPrimary;

    // Live goal summary
    const activeGoals  = goals.filter(g => g.status !== 'achieved');
    const achievedGoals = goals.filter(g => g.status === 'achieved');
    const offTrack     = goals.filter(g => g.status === 'off_track' || g.status === 'at_risk');

    // Overdue counts
    const overdueCount = transactions.filter(t => t.status === 'overdue').length;
    const overdueInvoices = invoices.filter(inv => inv.status === 'overdue');

    // Daily nudge — no transactions logged today
    const today = new Date().toISOString().split('T')[0];
    const loggedToday = transactions.some(tx => tx.date === today);

    return (
        <SafeAreaView style={styles.safe}>
            <Header />
            <ScrollView style={styles.scroll} contentContainerStyle={styles.pad}>

                <Text style={styles.title}>{t(language, 'dashboard')}</Text>

                {/* ── Profitability Hero Card ──────────────────────────────── */}
                <View style={[styles.heroCard, { borderColor: finance.profit >= 0 ? Colors.income : Colors.expense }]}>
                    <Text style={[styles.heroStatus, { color: finance.profit >= 0 ? Colors.income : Colors.expense }]}>
                        {finance.profit >= 0 ? 'PROFITABLE ✓' : 'LOSING MONEY ✗'}
                    </Text>
                    <Text style={[styles.heroProfit, { color: finance.profit >= 0 ? Colors.income : Colors.expense }]}>
                        {finance.profit >= 0 ? '+' : ''}{currency}{finance.profit.toLocaleString()}
                    </Text>
                    <View style={styles.heroSubRow}>
                        <Text style={[styles.heroMargin, { color: finance.margin >= parseFloat(targetMargin) ? Colors.income : Colors.expense }]}>
                            {finance.margin.toFixed(2)}% margin
                        </Text>
                        <Text style={styles.heroTarget}>target {targetMargin}%</Text>
                    </View>
                    <View style={styles.heroMetricsRow}>
                        <View style={styles.heroMetric}>
                            <Text style={styles.heroMetricLabel}>Income</Text>
                            <Text style={[styles.heroMetricVal, { color: Colors.income }]}>{currency}{finance.income.toLocaleString()}</Text>
                        </View>
                        <View style={styles.heroMetricDivider} />
                        <View style={styles.heroMetric}>
                            <Text style={styles.heroMetricLabel}>Expenses</Text>
                            <Text style={[styles.heroMetricVal, { color: Colors.expense }]}>{currency}{finance.expense.toLocaleString()}</Text>
                        </View>
                        <View style={styles.heroMetricDivider} />
                        <View style={styles.heroMetric}>
                            <Text style={styles.heroMetricLabel}>Net Profit</Text>
                            <Text style={[styles.heroMetricVal, { color: finance.profit >= 0 ? Colors.income : Colors.expense }]}>
                                {finance.profit >= 0 ? '+' : ''}{currency}{finance.profit.toLocaleString()}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* ── Spending alert ───────────────────────────────────────── */}
                {finance.profit < 0 && (
                    <View style={styles.spendingAlert}>
                        <Text style={styles.spendingAlertText}>⚠ You are spending more than you earn — review your expenses</Text>
                    </View>
                )}

                {/* ── Overdue invoice banner ──────────────────────────────── */}
                {overdueInvoices.length > 0 && (
                    <TouchableOpacity style={styles.invoiceBanner} onPress={() => setCurrentScreen('invoices')}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.invoiceBannerTitle}>💰 {overdueInvoices.length} unpaid invoice{overdueInvoices.length > 1 ? 's' : ''} overdue</Text>
                            <Text style={styles.invoiceBannerSub}>Tap to chase payment →</Text>
                        </View>
                    </TouchableOpacity>
                )}

                {/* ── Daily nudge ─────────────────────────────────────────── */}
                {!loggedToday && (
                    <TouchableOpacity style={styles.nudgeBanner} onPress={() => setFabOpen(true)}>
                        <Text style={styles.nudgeText}>📝 Nothing logged today — tap to add a transaction</Text>
                    </TouchableOpacity>
                )}

                {/* ── Overdue alert ───────────────────────────────────────── */}
                {overdueCount > 0 && (
                    <TouchableOpacity
                        style={styles.alertBanner}
                        onPress={() => navigate('reports', { reportSection: 'operations', reportTab: 'aging' })}
                    >
                        <Text style={styles.alertText}>
                            ⚠ {overdueCount} {t(language, 'overdueAlert')}
                        </Text>
                    </TouchableOpacity>
                )}

                {/* ── Insight card ────────────────────────────────────────── */}
                <View style={[styles.insightCard, { borderLeftColor: insightBorder }]}>
                    <View style={styles.insightHeader}>
                        <View style={[styles.tag, { backgroundColor: tagBg }]}>
                            <Text style={[styles.tagText, { color: tagColor }]}>{insight.tag}</Text>
                        </View>
                        <TouchableOpacity onPress={() => setCurrentScreen('insights')}>
                            <Text style={styles.insightLink}>{t(language, 'fullInsights')}</Text>
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.insightTitle}>{insight.title}</Text>
                    <Text style={styles.insightAction}>{insight.action}</Text>
                </View>

                {/* ── Cash Balance ────────────────────────────────────────── */}
                <View style={styles.card}>
                    <Text style={styles.cardLabel}>{t(language, 'cashBalance')}</Text>
                    <Text style={[styles.bigNum, { color: Colors.income }]}>
                        {currency}{finance.cashBalance.toLocaleString()}
                    </Text>
                    <View style={styles.marginRow}>
                        <Text style={styles.hint}>{t(language, 'minReserve')}: {currency}{minReserve}</Text>
                        <View style={[styles.reserveBadge, {
                            backgroundColor: finance.cashBalance >= parseFloat(minReserve)
                                ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                        }]}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: finance.cashBalance >= parseFloat(minReserve) ? Colors.income : Colors.expense }}>
                                {finance.cashBalance >= parseFloat(minReserve) ? t(language, 'reserveOk') : t(language, 'belowReserve')}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* ── Cash Runway ─────────────────────────────────────────── */}
                {(() => {
                    const runwayDays = finance.expense > 0 ? Math.floor(finance.cashBalance / (finance.expense / 30)) : null;
                    const runwayColor = runwayDays === null ? Colors.income : runwayDays < 30 ? Colors.expense : runwayDays < 60 ? Colors.warning : Colors.income;
                    return (
                        <View style={styles.card}>
                            <Text style={styles.cardLabel}>Cash Runway</Text>
                            <Text style={[styles.bigNum, { color: runwayColor }]}>
                                {runwayDays === null ? '∞' : `~${runwayDays} days`}
                            </Text>
                            <Text style={[styles.hint, { color: runwayColor }]}>
                                {runwayDays === null
                                    ? 'No expenses recorded'
                                    : runwayDays < 30
                                    ? 'Critical — refill cash soon!'
                                    : runwayDays < 60
                                    ? 'Your cash will last ~' + runwayDays + ' days — keep watch'
                                    : 'Your cash will last ~' + runwayDays + ' days'}
                            </Text>
                        </View>
                    );
                })()}

                {/* ── Tax summary ─────────────────────────────────────────── */}
                <View style={[styles.card, styles.taxRow]}>
                    <View style={styles.taxItem}>
                        <Text style={styles.taxLabel}>{t(language, 'taxCollected')}</Text>
                        <Text style={[styles.taxVal, { color: Colors.warning }]}>{currency}{finance.totalTaxCollected.toLocaleString()}</Text>
                    </View>
                    <View style={styles.taxDivider} />
                    <View style={styles.taxItem}>
                        <Text style={styles.taxLabel}>{t(language, 'taxPaid')}</Text>
                        <Text style={[styles.taxVal, { color: Colors.warning }]}>{currency}{finance.totalTaxPaid.toLocaleString()}</Text>
                    </View>
                    <View style={styles.taxDivider} />
                    <View style={styles.taxItem}>
                        <Text style={styles.taxLabel}>{t(language, 'netTax')}</Text>
                        <Text style={[styles.taxVal, { color: finance.netTaxPosition >= 0 ? Colors.income : Colors.expense }]}>
                            {finance.netTaxPosition >= 0 ? '+' : ''}{currency}{finance.netTaxPosition.toLocaleString()}
                        </Text>
                    </View>
                </View>

                {/* ── Assets / Liabilities ────────────────────────────────── */}
                <View style={styles.row}>
                    <MetricCard label={t(language, 'totalAssets')}      value={`${currency}${finance.assets.toLocaleString()}`}      color={Colors.asset} />
                    <MetricCard label={t(language, 'totalLiabilities')}  value={`${currency}${finance.liabilities.toLocaleString()}`} color={Colors.liability} />
                </View>
                <View style={styles.card}>
                    <Text style={styles.cardLabel}>{t(language, 'ownersEquity')}</Text>
                    <Text style={[styles.bigNum, { color: Colors.equity }]}>
                        {currency}{finance.equity.toLocaleString()}
                    </Text>
                    <Text style={styles.hint}>{t(language, 'assetsMinusLiabilities')}</Text>
                </View>

                {/* ── Goals quick card ────────────────────────────────────── */}
                <TouchableOpacity style={styles.quickCard} onPress={() => setCurrentScreen('goals')}>
                    <View style={styles.quickCardLeft}>
                        <Text style={styles.quickIcon}>🎯</Text>
                        <View>
                            <Text style={styles.quickLabel}>{t(language, 'financialGoals')}</Text>
                            {goals.length === 0 ? (
                                <Text style={styles.quickSub}>{t(language, 'noGoalsYet')}</Text>
                            ) : (
                                <Text style={styles.quickSub}>
                                    {activeGoals.length} {t(language, 'active')} · {achievedGoals.length} {t(language, 'achieved')}
                                    {offTrack.length > 0 ? ` · ${offTrack.length} ${t(language, 'needAttention')}` : ''}
                                </Text>
                            )}
                        </View>
                    </View>
                    <Text style={styles.quickArrow}>›</Text>
                </TouchableOpacity>

                {/* ── Inventory quick card ────────────────────────────────── */}
                <TouchableOpacity style={styles.quickCard} onPress={() => setCurrentScreen('inventory')}>
                    <View style={styles.quickCardLeft}>
                        <Text style={styles.quickIcon}>📦</Text>
                        <View>
                            <Text style={styles.quickLabel}>Inventory & Stock</Text>
                            <Text style={styles.quickSub}>Track stock levels, costs & margins</Text>
                        </View>
                    </View>
                    <Text style={styles.quickArrow}>›</Text>
                </TouchableOpacity>

                {/* ── SWOT quick card ─────────────────────────────────────── */}
                <TouchableOpacity
                    style={styles.quickCard}
                    onPress={() => navigate('reports', { reportSection: 'analysis', reportTab: 'swot' })}
                >
                    <View style={styles.quickCardLeft}>
                        <Text style={styles.quickIcon}>📊</Text>
                        <View>
                            <Text style={styles.quickLabel}>{t(language, 'swotAnalysis')}</Text>
                            <Text style={styles.quickSub}>{t(language, 'swotSub')}</Text>
                        </View>
                    </View>
                    <Text style={styles.quickArrow}>›</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.btn} onPress={() => setCurrentScreen('reports')}>
                    <Text style={styles.btnText}>{t(language, 'viewDetailedReports')}</Text>
                </TouchableOpacity>
            </ScrollView>

            {/* ── Quick-add FAB ────────────────────────────────────────────── */}
            <TouchableOpacity style={styles.fab} onPress={() => setFabOpen(true)}>
                <Text style={styles.fabText}>+</Text>
            </TouchableOpacity>

            <FooterNav />

            {/* ── Quick-add modal ──────────────────────────────────────────── */}
            <Modal visible={fabOpen} transparent animationType="slide" onRequestClose={() => setFabOpen(false)}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setFabOpen(false)} />
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalSheet}>
                    <View style={styles.modalHandle} />
                    <Text style={styles.modalTitle}>Quick Add</Text>

                    {/* Income / Expense toggle */}
                    <View style={styles.typeRow}>
                        <TouchableOpacity
                            style={[styles.typeBtn, qaType === 'income' && styles.typeBtnIncome]}
                            onPress={() => setQaType('income')}>
                            <Text style={[styles.typeBtnText, qaType === 'income' && { color: '#fff' }]}>+ Income</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.typeBtn, qaType === 'expense' && styles.typeBtnExpense]}
                            onPress={() => setQaType('expense')}>
                            <Text style={[styles.typeBtnText, qaType === 'expense' && { color: '#fff' }]}>− Expense</Text>
                        </TouchableOpacity>
                    </View>

                    <TextInput
                        style={styles.modalInput}
                        placeholder={`Amount (${settings.currency})`}
                        placeholderTextColor={Colors.textMuted}
                        keyboardType="decimal-pad"
                        value={qaAmount}
                        onChangeText={setQaAmount}
                    />
                    <TextInput
                        style={styles.modalInput}
                        placeholder="Description (e.g. Client payment, Rent)"
                        placeholderTextColor={Colors.textMuted}
                        value={qaDesc}
                        onChangeText={setQaDesc}
                    />

                    <TouchableOpacity
                        style={[styles.modalSubmit, { backgroundColor: qaType === 'income' ? Colors.income : Colors.expense }, (!qaDesc.trim() || !qaAmount) && { opacity: 0.5 }]}
                        onPress={submitQuickAdd}
                        disabled={qaSubmitting || !qaDesc.trim() || !qaAmount}>
                        <Text style={styles.modalSubmitText}>Add {qaType === 'income' ? 'Income' : 'Expense'}</Text>
                    </TouchableOpacity>
                </KeyboardAvoidingView>
            </Modal>
        </SafeAreaView>
    );
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <View style={[styles.card, styles.flex]}>
            <Text style={styles.cardLabel}>{label}</Text>
            <Text style={[styles.bigNum, { color, fontSize: 18 }]}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    safe:  { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1, backgroundColor: Colors.bg },
    pad:   { padding: 16, paddingBottom: 100 },
    title: { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 14 },
    row:   { flexDirection: 'row', gap: 12, marginBottom: 12 },
    flex:  { flex: 1 },

    heroCard: {
        backgroundColor: Colors.surface, borderRadius: 14, padding: 18,
        marginBottom: 12, borderWidth: 2,
    },
    heroStatus:     { fontSize: 13, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
    heroProfit:     { fontSize: 36, fontWeight: 'bold', marginBottom: 4 },
    heroSubRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
    heroMargin:     { fontSize: 13, fontWeight: '700' },
    heroTarget:     { fontSize: 12, color: Colors.textMuted },
    heroMetricsRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12 },
    heroMetric:     { flex: 1, alignItems: 'center' },
    heroMetricLabel:{ fontSize: 10, color: Colors.textMuted, marginBottom: 3 },
    heroMetricVal:  { fontSize: 13, fontWeight: '700' },
    heroMetricDivider: { width: 1, backgroundColor: Colors.border },

    spendingAlert: {
        backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1,
        borderColor: Colors.expense, borderRadius: 8, padding: 10, marginBottom: 12,
    },
    spendingAlertText: { color: Colors.expense, fontSize: 12, fontWeight: '600', textAlign: 'center' },

    alertBanner: {
        backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1,
        borderColor: Colors.expense, borderRadius: 8, padding: 10, marginBottom: 12,
    },
    alertText: { color: Colors.expense, fontSize: 12, fontWeight: '600', textAlign: 'center' },

    insightCard: {
        backgroundColor: Colors.surface, borderRadius: 12, padding: 16,
        marginBottom: 12, borderLeftWidth: 4,
    },
    insightHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    tag:       { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 10 },
    tagText:   { fontSize: 10, fontWeight: 'bold' },
    insightLink: { color: Colors.primary, fontSize: 12 },
    insightTitle:  { fontSize: 14, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
    insightAction: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },

    card:      { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 12 },
    cardLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 6 },
    bigNum:    { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary },
    marginRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
    marginText:  { fontSize: 12, fontWeight: '600' },
    marginTarget:{ fontSize: 11, color: Colors.textMuted },
    hint:      { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
    reserveBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },

    taxRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
    taxItem: { flex: 1, alignItems: 'center' },
    taxLabel:{ fontSize: 10, color: Colors.textMuted, marginBottom: 4 },
    taxVal:  { fontSize: 13, fontWeight: 'bold' },
    taxDivider: { width: 1, height: 30, backgroundColor: Colors.border },

    quickCard: {
        backgroundColor: Colors.surface, borderRadius: 12, padding: 14,
        marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
    },
    quickCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    quickIcon:  { fontSize: 24 },
    quickLabel: { fontSize: 14, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 2 },
    quickSub:   { fontSize: 11, color: Colors.textMuted },
    quickArrow: { fontSize: 22, color: Colors.textMuted },

    btn:     { backgroundColor: Colors.primary, paddingVertical: 13, borderRadius: 10, alignItems: 'center', marginTop: 4 },
    btnText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 14 },

    invoiceBanner: {
        backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1,
        borderColor: Colors.warning, borderRadius: 10, padding: 12, marginBottom: 10,
    },
    invoiceBannerTitle: { color: Colors.warning, fontWeight: '700', fontSize: 13 },
    invoiceBannerSub:   { color: Colors.warning, fontSize: 11, marginTop: 2, opacity: 0.8 },

    nudgeBanner: {
        backgroundColor: 'rgba(59,130,246,0.1)', borderWidth: 1,
        borderColor: Colors.primary, borderRadius: 10, padding: 12, marginBottom: 10,
    },
    nudgeText: { color: Colors.primary, fontSize: 12, fontWeight: '600' },

    fab: {
        position: 'absolute', right: 20, bottom: 80,
        width: 56, height: 56, borderRadius: 28,
        backgroundColor: Colors.income, alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.3, shadowRadius: 6, elevation: 8,
    },
    fabText: { fontSize: 30, color: Colors.textPrimary, lineHeight: 34 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    modalSheet: {
        backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
        padding: 24, paddingBottom: 40,
    },
    modalHandle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
    modalTitle:  { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 16 },
    typeRow:     { flexDirection: 'row', gap: 10, marginBottom: 14 },
    typeBtn:     { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg },
    typeBtnIncome:  { backgroundColor: Colors.income, borderColor: Colors.income },
    typeBtnExpense: { backgroundColor: Colors.expense, borderColor: Colors.expense },
    typeBtnText: { fontWeight: '700', fontSize: 14, color: Colors.textSecondary },
    modalInput:  {
        backgroundColor: Colors.bg, borderColor: Colors.border, borderWidth: 1,
        borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11,
        color: Colors.textPrimary, fontSize: 14, marginBottom: 12,
    },
    modalSubmit:     { paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 4 },
    modalSubmitText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});
