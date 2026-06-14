import React, { useState } from 'react';
import {
    SafeAreaView, ScrollView, View, Text,
    TouchableOpacity, StyleSheet, ActivityIndicator,
    Modal, TextInput, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { t } from '../utils/i18n';
import { validateAmount, validateDescription } from '../utils/validation';

const INCOME_CATEGORIES = ['Sales', 'Service', 'Consulting', 'Rental', 'Interest', 'Other Income'];
const EXPENSE_CATEGORIES = ['Rent', 'Salaries', 'Utilities', 'Marketing', 'Supplies', 'Transport', 'Meals', 'Software', 'Tax', 'Other'];

export default function DashboardScreen() {
    const { finance, insight, settings, goals, transactions, invoices, assets, loans, navigate, setCurrentScreen, language, isLoading, addTransaction } = useApp();

    const [fabOpen, setFabOpen]           = useState(false);
    const [qaType, setQaType]             = useState<'income' | 'expense'>('income');
    const [qaAmount, setQaAmount]         = useState('');
    const [qaDesc, setQaDesc]             = useState('');
    const [qaCategory, setQaCategory]     = useState('');
    const [qaSubmitting, setQaSubmitting] = useState(false);
    const [showMore, setShowMore]         = useState(false);

    const categories = qaType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

    const openFab = (type: 'income' | 'expense' = 'income') => {
        setQaType(type);
        setQaCategory('');
        setQaAmount('');
        setQaDesc('');
        setFabOpen(true);
    };

    const submitQuickAdd = () => {
        const amt = parseFloat(qaAmount);
        const amountError = validateAmount(amt);
        if (amountError) { Alert.alert('Invalid Amount', amountError.message); return; }
        const descError = validateDescription(qaDesc.trim());
        if (descError) { Alert.alert('Invalid Description', descError.message); return; }

        setQaSubmitting(true);
        try {
            addTransaction({
                type: qaType,
                amount: amt,
                description: qaDesc.trim(),
                category: qaCategory || (qaType === 'income' ? 'Sales' : 'General'),
                status: 'paid',
            });
            setQaAmount(''); setQaDesc(''); setQaCategory(''); setFabOpen(false);
        } finally {
            setQaSubmitting(false);
        }
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

    const activeGoals   = goals.filter(g => g.status !== 'achieved');
    const achievedGoals = goals.filter(g => g.status === 'achieved');
    const offTrack      = goals.filter(g => g.status === 'off_track' || g.status === 'at_risk');
    const overdueCount  = transactions.filter(t => t.status === 'overdue').length;
    const overdueInvoices = invoices.filter(inv => inv.status === 'overdue');
    const today = new Date().toISOString().split('T')[0];
    const loggedToday = transactions.some(tx => tx.date === today);
    const hasTransaction = transactions.length > 0;
    const hasGoal        = goals.length > 0;
    const showOnboarding = !hasTransaction || !hasGoal;

    const runwayDays = finance.expense > 0 ? Math.floor(finance.cashBalance / (finance.expense / 30)) : null;
    const runwayColor = runwayDays === null ? Colors.income : runwayDays < 30 ? Colors.expense : runwayDays < 60 ? Colors.warning : Colors.income;

    return (
        <SafeAreaView style={styles.safe}>
            <Header />
            <ScrollView style={styles.scroll} contentContainerStyle={styles.pad}>

                <Text style={styles.title}>{t(language, 'dashboard')}</Text>

                {/* ── Onboarding ───────────────────────────────────────────── */}
                {showOnboarding && (
                    <View style={styles.onboardCard}>
                        <Text style={styles.onboardTitle}>🚀 Get started — 3 quick steps</Text>
                        <Text style={styles.onboardSub}>Complete these to unlock your full financial picture</Text>
                        <View style={styles.onboardStep}>
                            <Text style={styles.onboardCheck}>✅</Text>
                            <Text style={[styles.onboardStepText, styles.onboardDone]}>Create your account</Text>
                        </View>
                        <TouchableOpacity style={styles.onboardStep} onPress={() => openFab()}>
                            <Text style={styles.onboardCheck}>{hasTransaction ? '✅' : '⬜'}</Text>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.onboardStepText, hasTransaction && styles.onboardDone]}>Add your first transaction</Text>
                                {!hasTransaction && <Text style={styles.onboardStepHint}>Tap to add income or expense →</Text>}
                            </View>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.onboardStep} onPress={() => setCurrentScreen('goals')}>
                            <Text style={styles.onboardCheck}>{hasGoal ? '✅' : '⬜'}</Text>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.onboardStepText, hasGoal && styles.onboardDone]}>Set a financial goal</Text>
                                {!hasGoal && <Text style={styles.onboardStepHint}>Tap to set a savings or revenue goal →</Text>}
                            </View>
                        </TouchableOpacity>
                    </View>
                )}

                {/* ── Alert banners (always visible) ───────────────────────── */}
                {overdueInvoices.length > 0 && (
                    <TouchableOpacity style={styles.alertBanner} onPress={() => setCurrentScreen('invoices')}>
                        <Text style={styles.alertText}>💰 {overdueInvoices.length} unpaid invoice{overdueInvoices.length > 1 ? 's' : ''} overdue — tap to chase →</Text>
                    </TouchableOpacity>
                )}
                {overdueCount > 0 && (
                    <TouchableOpacity style={styles.alertBanner} onPress={() => navigate('reports', { reportSection: 'operations', reportTab: 'aging' })}>
                        <Text style={styles.alertText}>⚠ {overdueCount} overdue transaction{overdueCount > 1 ? 's' : ''} — tap to review →</Text>
                    </TouchableOpacity>
                )}
                {finance.depreciationAdjustedProfit < 0 && (
                    <View style={styles.dangerBanner}>
                        <Text style={styles.dangerText}>🔴 {finance.profit >= 0 ? 'Cash positive but loss after depreciation' : 'Spending more than you earn'} — review expenses</Text>
                    </View>
                )}

                {/* ── CARD 1: Profit hero ──────────────────────────────────── */}
                <View style={[styles.heroCard, { borderColor: finance.profit >= 0 ? Colors.income : Colors.expense }]}>
                    <Text style={[styles.heroStatus, { color: finance.profit >= 0 ? Colors.income : Colors.expense }]}>
                        {finance.profit >= 0 ? 'PROFITABLE ✓' : 'LOSING MONEY ✗'}
                    </Text>
                    <Text style={[styles.heroProfit, { color: finance.profit >= 0 ? Colors.income : Colors.expense }]}>
                        {finance.profit >= 0 ? '+' : ''}{currency}{finance.depreciationAdjustedProfit.toLocaleString()}
                    </Text>
                    <View style={styles.heroSubRow}>
                        <Text style={[styles.heroMargin, { color: finance.margin >= parseFloat(targetMargin) ? Colors.income : Colors.expense }]}>
                            {finance.margin.toFixed(1)}% margin
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
                            <Text style={[styles.heroMetricVal, { color: finance.depreciationAdjustedProfit >= 0 ? Colors.income : Colors.expense }]}>
                                {finance.depreciationAdjustedProfit >= 0 ? '+' : ''}{currency}{finance.depreciationAdjustedProfit.toLocaleString()}
                            </Text>
                        </View>
                    </View>
                    {finance.annualDepreciation > 0 && (
                        <Text style={styles.deprNote}>
                            Includes {currency}{Math.round(finance.annualDepreciation).toLocaleString()} depreciation · Cash: {currency}{finance.profit.toLocaleString()}
                        </Text>
                    )}
                </View>

                {/* ── CARD 2: Quick actions row ────────────────────────────── */}
                <View style={styles.quickActionsRow}>
                    <TouchableOpacity style={[styles.quickAction, { backgroundColor: 'rgba(16,185,129,0.15)' }]} onPress={() => openFab('income')}>
                        <Text style={styles.quickActionIcon}>+</Text>
                        <Text style={[styles.quickActionText, { color: Colors.income }]}>Income</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.quickAction, { backgroundColor: 'rgba(239,68,68,0.15)' }]} onPress={() => openFab('expense')}>
                        <Text style={styles.quickActionIcon}>−</Text>
                        <Text style={[styles.quickActionText, { color: Colors.expense }]}>Expense</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.quickAction, { backgroundColor: 'rgba(59,130,246,0.15)' }]} onPress={() => setCurrentScreen('invoices')}>
                        <Text style={styles.quickActionIcon}>🧾</Text>
                        <Text style={[styles.quickActionText, { color: Colors.primary }]}>Invoice</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.quickAction, { backgroundColor: 'rgba(245,158,11,0.15)' }]} onPress={() => setCurrentScreen('reports')}>
                        <Text style={styles.quickActionIcon}>📊</Text>
                        <Text style={[styles.quickActionText, { color: Colors.warning }]}>Reports</Text>
                    </TouchableOpacity>
                </View>

                {/* ── CARD 3: AI Insight ───────────────────────────────────── */}
                <TouchableOpacity style={[styles.insightCard, { borderLeftColor: insightBorder }]} onPress={() => setCurrentScreen('insights')}>
                    <View style={styles.insightHeader}>
                        <View style={[styles.tag, { backgroundColor: insightBorder }]}>
                            <Text style={styles.tagText}>{insight.tag}</Text>
                        </View>
                        <Text style={styles.insightLink}>Full insights →</Text>
                    </View>
                    <Text style={styles.insightTitle}>{insight.title}</Text>
                    <Text style={styles.insightAction}>{insight.action}</Text>
                </TouchableOpacity>

                {/* ── CARD 4: Cash position ────────────────────────────────── */}
                <View style={styles.row}>
                    <View style={[styles.card, styles.flex]}>
                        <Text style={styles.cardLabel}>Cash Balance</Text>
                        <Text style={[styles.bigNum, { color: Colors.income }]}>{currency}{finance.cashBalance.toLocaleString()}</Text>
                        <View style={[styles.reserveBadge, { backgroundColor: finance.cashBalance >= parseFloat(minReserve) ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)' }]}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: finance.cashBalance >= parseFloat(minReserve) ? Colors.income : Colors.expense }}>
                                {finance.cashBalance >= parseFloat(minReserve) ? 'Reserve OK ✓' : 'Below Reserve ✗'}
                            </Text>
                        </View>
                    </View>
                    <View style={[styles.card, styles.flex]}>
                        <Text style={styles.cardLabel}>Cash Runway</Text>
                        <Text style={[styles.bigNum, { color: runwayColor }]}>
                            {runwayDays === null ? '∞' : `${runwayDays}d`}
                        </Text>
                        <Text style={[styles.hint, { color: runwayColor }]}>
                            {runwayDays === null ? 'No expenses yet' : runwayDays < 30 ? 'Critical — act now!' : runwayDays < 60 ? 'Keep watch' : 'Looking good'}
                        </Text>
                    </View>
                </View>

                {/* ── CARD 5: Goals ────────────────────────────────────────── */}
                <TouchableOpacity style={styles.quickCard} onPress={() => setCurrentScreen('goals')}>
                    <View style={styles.quickCardLeft}>
                        <Text style={styles.quickIcon}>🎯</Text>
                        <View>
                            <Text style={styles.quickLabel}>{t(language, 'financialGoals')}</Text>
                            {goals.length === 0
                                ? <Text style={styles.quickSub}>No goals yet — tap to set one</Text>
                                : <Text style={styles.quickSub}>{activeGoals.length} active · {achievedGoals.length} achieved{offTrack.length > 0 ? ` · ${offTrack.length} need attention` : ''}</Text>
                            }
                        </View>
                    </View>
                    <Text style={styles.quickArrow}>›</Text>
                </TouchableOpacity>

                {/* ── CARD 6: Analysis & Decisions ─────────────────────────── */}
                <TouchableOpacity style={[styles.quickCard, { borderColor: Colors.primary, backgroundColor: 'rgba(0,102,204,0.08)' }]} onPress={() => setCurrentScreen('analysis')}>
                    <View style={styles.quickCardLeft}>
                        <Text style={styles.quickIcon}>🔍</Text>
                        <View>
                            <Text style={[styles.quickLabel, { color: Colors.primary }]}>Analysis & Decisions</Text>
                            <Text style={styles.quickSub}>Why did profit change? · What if I hire / take a loan?</Text>
                        </View>
                    </View>
                    <Text style={styles.quickArrow}>›</Text>
                </TouchableOpacity>

                {/* ── CARD 7: CFO Advisor ──────────────────────────────────── */}
                <TouchableOpacity style={[styles.quickCard, { borderColor: Colors.border }]} onPress={() => setCurrentScreen('cfo')}>
                    <View style={styles.quickCardLeft}>
                        <Text style={styles.quickIcon}>🧠</Text>
                        <View>
                            <Text style={styles.quickLabel}>CFO Advisor</Text>
                            <Text style={styles.quickSub}>Forecasts · Risk score · Ratios · Debt optimiser</Text>
                        </View>
                    </View>
                    <Text style={styles.quickArrow}>›</Text>
                </TouchableOpacity>

                {/* ── Daily nudge ──────────────────────────────────────────── */}
                {!loggedToday && hasTransaction && (
                    <TouchableOpacity style={styles.nudgeBanner} onPress={() => openFab()}>
                        <Text style={styles.nudgeText}>📝 Nothing logged today — tap to add a transaction</Text>
                    </TouchableOpacity>
                )}

                {/* ── See more toggle ──────────────────────────────────────── */}
                <TouchableOpacity style={styles.seeMoreBtn} onPress={() => setShowMore(v => !v)}>
                    <Text style={styles.seeMoreText}>{showMore ? '▲ Show less' : '▼ More — tax, equity, inventory, assets & loans'}</Text>
                </TouchableOpacity>

                {showMore && (
                    <>
                        {/* Tax summary */}
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

                        {/* Assets / Liabilities / Equity */}
                        <View style={styles.row}>
                            <View style={[styles.card, styles.flex]}>
                                <Text style={styles.cardLabel}>{t(language, 'totalAssets')}</Text>
                                <Text style={[styles.bigNum, { color: Colors.asset, fontSize: 18 }]}>{currency}{finance.assets.toLocaleString()}</Text>
                            </View>
                            <View style={[styles.card, styles.flex]}>
                                <Text style={styles.cardLabel}>{t(language, 'totalLiabilities')}</Text>
                                <Text style={[styles.bigNum, { color: Colors.liability, fontSize: 18 }]}>{currency}{finance.liabilities.toLocaleString()}</Text>
                            </View>
                        </View>
                        <View style={styles.card}>
                            <Text style={styles.cardLabel}>{t(language, 'ownersEquity')}</Text>
                            <Text style={[styles.bigNum, { color: Colors.equity }]}>{currency}{finance.equity.toLocaleString()}</Text>
                            <Text style={styles.hint}>{t(language, 'assetsMinusLiabilities')}</Text>
                        </View>

                        {/* Inventory */}
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

                        {/* Budget */}
                        <TouchableOpacity style={styles.quickCard} onPress={() => setCurrentScreen('budget')}>
                            <View style={styles.quickCardLeft}>
                                <Text style={styles.quickIcon}>📋</Text>
                                <View>
                                    <Text style={styles.quickLabel}>Budget vs Actual</Text>
                                    <Text style={styles.quickSub}>Set monthly budgets, track overspend</Text>
                                </View>
                            </View>
                            <Text style={styles.quickArrow}>›</Text>
                        </TouchableOpacity>

                        {/* Assets */}
                        {assets.length > 0 ? (
                            <TouchableOpacity style={styles.quickCard} onPress={() => setCurrentScreen('assets')}>
                                <View style={styles.quickCardLeft}>
                                    <Text style={styles.quickIcon}>🏗️</Text>
                                    <View>
                                        <Text style={styles.quickLabel}>Assets</Text>
                                        <Text style={styles.quickSub}>{assets.length} asset{assets.length !== 1 ? 's' : ''} · {currency}{assets.reduce((s, a) => s + (a.currentValue ?? a.purchaseCost), 0).toLocaleString()} total value</Text>
                                    </View>
                                </View>
                                <Text style={styles.quickArrow}>›</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity style={styles.discoverLink} onPress={() => setCurrentScreen('assets')}>
                                <Text style={styles.discoverText}>🏗️  Got equipment or property? <Text style={styles.discoverCta}>Track assets →</Text></Text>
                            </TouchableOpacity>
                        )}

                        {/* Loans */}
                        {loans.length > 0 ? (
                            <TouchableOpacity style={styles.quickCard} onPress={() => setCurrentScreen('loans')}>
                                <View style={styles.quickCardLeft}>
                                    <Text style={styles.quickIcon}>🏦</Text>
                                    <View>
                                        <Text style={styles.quickLabel}>Loans</Text>
                                        <Text style={styles.quickSub}>{loans.filter(l => l.status === 'active').length} active loan{loans.filter(l => l.status === 'active').length !== 1 ? 's' : ''}</Text>
                                    </View>
                                </View>
                                <Text style={styles.quickArrow}>›</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity style={styles.discoverLink} onPress={() => setCurrentScreen('loans')}>
                                <Text style={styles.discoverText}>🏦  Have a business loan? <Text style={styles.discoverCta}>Register it →</Text></Text>
                            </TouchableOpacity>
                        )}

                        {/* SWOT */}
                        <TouchableOpacity style={styles.quickCard} onPress={() => navigate('reports', { reportSection: 'analysis', reportTab: 'swot' })}>
                            <View style={styles.quickCardLeft}>
                                <Text style={styles.quickIcon}>📊</Text>
                                <View>
                                    <Text style={styles.quickLabel}>{t(language, 'swotAnalysis')}</Text>
                                    <Text style={styles.quickSub}>{t(language, 'swotSub')}</Text>
                                </View>
                            </View>
                            <Text style={styles.quickArrow}>›</Text>
                        </TouchableOpacity>
                    </>
                )}

                <TouchableOpacity style={styles.btn} onPress={() => setCurrentScreen('reports')}>
                    <Text style={styles.btnText}>{t(language, 'viewDetailedReports')}</Text>
                </TouchableOpacity>

            </ScrollView>

            {/* ── FAB ─────────────────────────────────────────────────────── */}
            <TouchableOpacity style={styles.fab} onPress={() => openFab()}>
                <Text style={styles.fabText}>+</Text>
            </TouchableOpacity>

            <FooterNav />

            {/* ── Quick-add modal ──────────────────────────────────────────── */}
            <Modal visible={fabOpen} transparent animationType="slide" onRequestClose={() => setFabOpen(false)}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setFabOpen(false)} />
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalSheet}>
                    <View style={styles.modalHandle} />
                    <Text style={styles.modalTitle}>Quick Add</Text>

                    <View style={styles.typeRow}>
                        <TouchableOpacity style={[styles.typeBtn, qaType === 'income' && styles.typeBtnIncome]} onPress={() => { setQaType('income'); setQaCategory(''); }}>
                            <Text style={[styles.typeBtnText, qaType === 'income' && { color: '#fff' }]}>+ Income</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.typeBtn, qaType === 'expense' && styles.typeBtnExpense]} onPress={() => { setQaType('expense'); setQaCategory(''); }}>
                            <Text style={[styles.typeBtnText, qaType === 'expense' && { color: '#fff' }]}>− Expense</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Category chips */}
                    <Text style={styles.catLabel}>Category</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
                        {categories.map(cat => (
                            <TouchableOpacity
                                key={cat}
                                style={[styles.catChip, qaCategory === cat && { backgroundColor: Colors.primary, borderColor: Colors.primary }]}
                                onPress={() => setQaCategory(cat)}
                            >
                                <Text style={[styles.catChipText, qaCategory === cat && { color: '#fff' }]}>{cat}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

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
                        disabled={qaSubmitting || !qaDesc.trim() || !qaAmount}
                    >
                        <Text style={styles.modalSubmitText}>Add {qaType === 'income' ? 'Income' : 'Expense'}</Text>
                    </TouchableOpacity>
                </KeyboardAvoidingView>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe:   { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1, backgroundColor: Colors.bg },
    pad:    { padding: 16, paddingBottom: 100 },
    title:  { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 14 },
    row:    { flexDirection: 'row', gap: 12, marginBottom: 12 },
    flex:   { flex: 1 },

    onboardCard:     { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: Colors.primary },
    onboardTitle:    { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
    onboardSub:      { fontSize: 12, color: Colors.textMuted, marginBottom: 12 },
    onboardStep:     { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 10 },
    onboardCheck:    { fontSize: 16, width: 22 },
    onboardStepText: { fontSize: 14, color: Colors.textPrimary, fontWeight: '600' },
    onboardDone:     { color: Colors.textMuted, textDecorationLine: 'line-through' },
    onboardStepHint: { fontSize: 11, color: Colors.primary, marginTop: 1 },

    alertBanner:  { backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: Colors.warning, borderRadius: 8, padding: 10, marginBottom: 8 },
    alertText:    { color: Colors.warning, fontSize: 12, fontWeight: '600' },
    dangerBanner: { backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: Colors.expense, borderRadius: 8, padding: 10, marginBottom: 8 },
    dangerText:   { color: Colors.expense, fontSize: 12, fontWeight: '600' },

    heroCard:          { backgroundColor: Colors.surface, borderRadius: 14, padding: 18, marginBottom: 12, borderWidth: 2 },
    heroStatus:        { fontSize: 13, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
    heroProfit:        { fontSize: 36, fontWeight: 'bold', marginBottom: 4 },
    heroSubRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
    heroMargin:        { fontSize: 13, fontWeight: '700' },
    heroTarget:        { fontSize: 12, color: Colors.textMuted },
    heroMetricsRow:    { flexDirection: 'row', borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12 },
    heroMetric:        { flex: 1, alignItems: 'center' },
    heroMetricLabel:   { fontSize: 10, color: Colors.textMuted, marginBottom: 3 },
    heroMetricVal:     { fontSize: 13, fontWeight: '700' },
    heroMetricDivider: { width: 1, backgroundColor: Colors.border },
    deprNote:          { fontSize: 10, color: Colors.textMuted, textAlign: 'center', marginTop: 8, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 8 },

    quickActionsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    quickAction:     { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.border },
    quickActionIcon: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary },
    quickActionText: { fontSize: 11, fontWeight: '600', marginTop: 2 },

    insightCard:   { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12, borderLeftWidth: 4 },
    insightHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    tag:           { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 10 },
    tagText:       { fontSize: 10, fontWeight: 'bold', color: Colors.textPrimary },
    insightLink:   { color: Colors.primary, fontSize: 12 },
    insightTitle:  { fontSize: 14, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
    insightAction: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },

    card:         { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 12 },
    cardLabel:    { fontSize: 12, color: Colors.textMuted, marginBottom: 6 },
    bigNum:       { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary },
    hint:         { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
    reserveBadge: { marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: 'flex-start' },

    taxRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
    taxItem:    { flex: 1, alignItems: 'center' },
    taxLabel:   { fontSize: 10, color: Colors.textMuted, marginBottom: 4 },
    taxVal:     { fontSize: 13, fontWeight: 'bold' },
    taxDivider: { width: 1, height: 30, backgroundColor: Colors.border },

    quickCard:     { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
    quickCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    quickIcon:     { fontSize: 24 },
    quickLabel:    { fontSize: 14, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 2 },
    quickSub:      { fontSize: 11, color: Colors.textMuted },
    quickArrow:    { fontSize: 22, color: Colors.textMuted },

    discoverLink: { paddingVertical: 10, paddingHorizontal: 14, marginBottom: 10, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed' },
    discoverText: { fontSize: 12, color: Colors.textMuted },
    discoverCta:  { color: Colors.primary, fontWeight: '600' },

    nudgeBanner: { backgroundColor: 'rgba(59,130,246,0.1)', borderWidth: 1, borderColor: Colors.primary, borderRadius: 10, padding: 12, marginBottom: 10 },
    nudgeText:   { color: Colors.primary, fontSize: 12, fontWeight: '600' },

    seeMoreBtn:  { alignItems: 'center', paddingVertical: 12, marginBottom: 8 },
    seeMoreText: { color: Colors.primary, fontSize: 13, fontWeight: '600' },

    btn:     { backgroundColor: Colors.primary, paddingVertical: 13, borderRadius: 10, alignItems: 'center', marginTop: 4 },
    btnText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 14 },

    fab:     { position: 'absolute', right: 20, bottom: 80, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.income, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 8 },
    fabText: { fontSize: 30, color: Colors.textPrimary, lineHeight: 34 },

    modalOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    modalSheet:       { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
    modalHandle:      { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
    modalTitle:       { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 16 },
    typeRow:          { flexDirection: 'row', gap: 10, marginBottom: 14 },
    typeBtn:          { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg },
    typeBtnIncome:    { backgroundColor: Colors.income, borderColor: Colors.income },
    typeBtnExpense:   { backgroundColor: Colors.expense, borderColor: Colors.expense },
    typeBtnText:      { fontWeight: '700', fontSize: 14, color: Colors.textSecondary },
    catLabel:         { fontSize: 12, color: Colors.textMuted, marginBottom: 6 },
    catScroll:        { marginBottom: 12 },
    catChip:          { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg, marginRight: 8 },
    catChipText:      { fontSize: 12, color: Colors.textSecondary },
    modalInput:       { backgroundColor: Colors.bg, borderColor: Colors.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11, color: Colors.textPrimary, fontSize: 14, marginBottom: 12 },
    modalSubmit:      { paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 4 },
    modalSubmitText:  { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});
