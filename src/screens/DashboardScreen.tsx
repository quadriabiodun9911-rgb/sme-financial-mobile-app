import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    SafeAreaView, ScrollView, View, Text,
    TouchableOpacity, StyleSheet, ActivityIndicator,
    Modal, TextInput, KeyboardAvoidingView, Platform, Alert, Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import { trackDemoConvertTapped, trackScreenViewed } from '../utils/analytics';
import FooterNav from '../components/FooterNav';
import { t } from '../utils/i18n';
import { validateAmount, validateDescription } from '../utils/validation';
import OnboardingWizard from '../components/OnboardingWizard';
import ProfitShareCard from '../components/ProfitShareCard';
import RetentionNudges from '../components/RetentionNudges';
import FirstRunWizard from '../components/FirstRunWizard';
import GlobalSearch from '../components/GlobalSearch';
import DailyTargetCard from '../components/DailyTargetCard';
import MonthlyReview from '../components/MonthlyReview';
import CashPocketsModal from '../components/CashPocketsModal';
import DailyReportModal from '../components/DailyReportModal';

const INCOME_CATEGORIES = ['Sales', 'Service', 'Consulting', 'Rental', 'Interest', 'Other Income'];
const EXPENSE_CATEGORIES = ['Rent', 'Salaries', 'Utilities', 'Marketing', 'Supplies', 'Transport', 'Meals', 'Software', 'Tax', 'Other'];

export default function DashboardScreen() {
    const { finance, insight, settings, goals, transactions, invoices, assets, loans, inventory, navigate, setCurrentScreen, language, isLoading, addTransaction, isDemoMode, exitDemo, cashPockets, deleteGoal, updateGoal } = useApp();

    const [fabOpen, setFabOpen]           = useState(false);
    const [qaType, setQaType]             = useState<'income' | 'expense'>('income');
    const [qaAmount, setQaAmount]         = useState('');
    const [qaDesc, setQaDesc]             = useState('');
    const [qaCategory, setQaCategory]     = useState('');
    const [qaSubmitting, setQaSubmitting] = useState(false);
    const [showMore, setShowMore]               = useState(false);
    const [showGoDeeper, setShowGoDeeper]       = useState(false);
    const [showFullDashboard, setShowFullDashboard] = useState(false);
    const [onboardingDismissed, setOnboardingDismissed] = useState(false);
    const [showOnboardingWizard, setShowOnboardingWizard] = useState(false);
    const [showShareCard, setShowShareCard]     = useState(false);
    const [showFirstRun, setShowFirstRun]       = useState(false);
    const [showSearch, setShowSearch]           = useState(false);
    const [showMonthlyReview, setShowMonthlyReview] = useState(false);
    const [showCashPockets, setShowCashPockets] = useState(false);
    const [showDailyReport, setShowDailyReport] = useState(false);
    const [toast, setToast]                     = useState<string | null>(null);
    const [eodOpen, setEodOpen]                 = useState(false);
    const [eodIncome, setEodIncome]             = useState('');
    const [eodExpense, setEodExpense]           = useState('');
    const [lastSynced, setLastSynced]           = useState<Date>(new Date());

    useEffect(() => {
        AsyncStorage.getItem('@quad360/onboarding_dismissed').then(v => {
            if (v === '1') setOnboardingDismissed(true);
        });
    }, []);

    useEffect(() => {
        if (isDemoMode) return;
        AsyncStorage.getItem('@quad360/first_run_done').then(v => {
            if (!v) setShowFirstRun(true);
        });
    }, [isDemoMode]);

    useEffect(() => {
        if (isDemoMode) return;
        if (finance.profit <= 0) return;
        const monthKey = `@quad360/share_prompted_${new Date().toISOString().slice(0, 7)}`;
        AsyncStorage.getItem(monthKey).then(v => {
            if (!v) {
                setShowShareCard(true);
                AsyncStorage.setItem(monthKey, '1');
            }
        });
    }, [isDemoMode, finance.profit]);

    const categories = qaType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

    const openFab = (type: 'income' | 'expense' = 'income') => {
        setQaType(type);
        setQaCategory('');
        setQaAmount('');
        setQaDesc('');
        setFabOpen(true);
    };

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3000);
    };

    const submitEod = () => {
        const inc = parseFloat(eodIncome) || 0;
        const exp = parseFloat(eodExpense) || 0;
        if (inc <= 0 && exp <= 0) { Alert.alert('Nothing to save', 'Enter at least one amount.'); return; }
        if (inc > 0) addTransaction({ type: 'income',  amount: inc, description: 'End of day income',   category: 'Sales',  status: 'paid' });
        if (exp > 0) addTransaction({ type: 'expense', amount: exp, description: 'End of day expenses', category: 'Other',  status: 'paid' });
        setEodIncome(''); setEodExpense(''); setEodOpen(false);
        setLastSynced(new Date());
        const newProfit = finance.profit + inc - exp;
        showToast(`Saved! Today's profit: ${settings.currency}${newProfit.toLocaleString()}`);
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
            const newProfit = finance.profit + (qaType === 'income' ? amt : -amt);
            showToast(`Saved! This month's profit: ${settings.currency}${(isNaN(newProfit) ? 0 : newProfit).toLocaleString()}`);
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
    const showOnboarding = (!hasTransaction || !hasGoal) && !onboardingDismissed;

    const dismissOnboarding = () => {
        AsyncStorage.setItem('@quad360/onboarding_dismissed', '1');
        setOnboardingDismissed(true);
    };

    const runwayDays = finance.expense > 0 ? Math.floor(finance.cashBalance / (finance.expense / 30)) : null;
    const runwayColor = runwayDays === null ? Colors.income : runwayDays < 30 ? Colors.expense : runwayDays < 60 ? Colors.warning : Colors.income;

    // Last month date range
    const now = new Date();
    const thisMonthStr = now.toISOString().slice(0, 7); // YYYY-MM
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthStr = lastMonthDate.toISOString().slice(0, 7);
    const lastMonthIncome  = transactions.filter(t => t.type === 'income'  && t.date.startsWith(lastMonthStr)).reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const lastMonthExpense = transactions.filter(t => t.type === 'expense' && t.date.startsWith(lastMonthStr)).reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const lastMonthProfit  = lastMonthIncome - lastMonthExpense;
    const thisMonthIncome  = transactions.filter(t => t.type === 'income'  && t.date.startsWith(thisMonthStr)).reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const thisMonthExpense = transactions.filter(t => t.type === 'expense' && t.date.startsWith(thisMonthStr)).reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const thisMonthProfit  = thisMonthIncome - thisMonthExpense;
    const profitDelta = lastMonthProfit !== 0 ? ((thisMonthProfit - lastMonthProfit) / Math.abs(lastMonthProfit)) * 100 : null;

    // Cash pockets
    const totalCash = cashPockets.reduce((s, p) => s + p.amount, 0);

    // Survival numbers
    const todayIncome  = transactions.filter(tx => tx.type === 'income'  && tx.date === today).reduce((s, tx) => s + (Number(tx.amount) || 0), 0);
    const todayExpense = transactions.filter(tx => tx.type === 'expense' && tx.date === today).reduce((s, tx) => s + (Number(tx.amount) || 0), 0);
    const todayProfit  = todayIncome - todayExpense;
    const runwayColor2 = runwayDays === null ? Colors.income : runwayDays < 30 ? Colors.expense : runwayDays < 60 ? Colors.warning : Colors.income;
    const collectionsTotal =
        transactions.filter(t => t.status === 'overdue' || (t.status === 'pending' && t.dueDate && t.dueDate < today)).reduce((s, t) => s + (Number(t.amount) || 0), 0) +
        invoices.filter(inv => inv.status === 'overdue').reduce((s, inv) => s + (inv.total ?? 0), 0);
    const collectionsCount =
        transactions.filter(t => t.status === 'overdue' || (t.status === 'pending' && t.dueDate && t.dueDate < today)).length +
        invoices.filter(inv => inv.status === 'overdue').length;

    return (
        <SafeAreaView style={styles.safe}>
            <Header />
            <ScrollView style={styles.scroll} contentContainerStyle={styles.pad}>

                <TouchableOpacity style={styles.searchTrigger} onPress={() => setShowSearch(true)}>
                    <Text style={styles.searchTriggerIcon}>🔍</Text>
                    <Text style={styles.searchTriggerText}>Search transactions, invoices, assets...</Text>
                </TouchableOpacity>
                <Text style={styles.title}>{t(language, 'dashboard')}</Text>

                {/* ── Demo banner ──────────────────────────────────────────── */}
                {isDemoMode && (
                    <View style={styles.demoBanner}>
                        <Text style={styles.demoBannerText}>👀 Demo Mode — data is not saved</Text>
                        <TouchableOpacity onPress={() => { trackDemoConvertTapped(); exitDemo(); }} style={styles.demoBannerBtn}>
                            <Text style={styles.demoBannerBtnText}>Create Account →</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* ── 3 Survival Numbers strip — always first ───────────────── */}
                <View style={styles.survivalRow}>
                    <View style={styles.survivalCard}>
                        <Text style={styles.survivalLabel}>💰 Profit TODAY</Text>
                        <Text style={[styles.survivalValue, { color: todayProfit >= 0 ? Colors.income : Colors.expense }]}>
                            {todayProfit >= 0 ? '+' : ''}{currency}{todayProfit.toLocaleString()}
                        </Text>
                    </View>
                    <View style={styles.survivalCard}>
                        <Text style={styles.survivalLabel}>⏳ Cash Left</Text>
                        <Text style={[styles.survivalValue, { color: runwayColor2 }]}>
                            {runwayDays === null ? '∞' : `${runwayDays} days`}
                        </Text>
                    </View>
                    <TouchableOpacity style={styles.survivalCard} onPress={() => setCurrentScreen('transactions')}>
                        <Text style={styles.survivalLabel}>📥 Collect</Text>
                        <Text style={[styles.survivalValue, { color: collectionsCount > 0 ? Colors.warning : Colors.income }]}>
                            {collectionsCount > 0 ? `${currency}${collectionsTotal.toLocaleString()}` : '✓ Clear'}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* ── Onboarding ───────────────────────────────────────────── */}
                {showOnboarding && (
                    <View style={styles.onboardCard}>
                        <View style={styles.onboardHeader}>
                            <View>
                                <Text style={styles.onboardTitle}>👋 Welcome to Quad360</Text>
                                <Text style={styles.onboardSub}>Your business finance tracker — let's get you set up in 2 minutes</Text>
                            </View>
                            <TouchableOpacity onPress={dismissOnboarding} style={styles.onboardDismissBtn}>
                                <Text style={styles.onboardDismissText}>✕</Text>
                            </TouchableOpacity>
                        </View>
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
                                {!hasGoal && <Text style={styles.onboardStepHint}>Tap to set a revenue or profit goal →</Text>}
                            </View>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.onboardStep} onPress={() => setCurrentScreen('invoices')}>
                            <Text style={styles.onboardCheck}>{invoices.length > 0 ? '✅' : '⬜'}</Text>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.onboardStepText, invoices.length > 0 && styles.onboardDone]}>Create your first invoice</Text>
                                {invoices.length === 0 && <Text style={styles.onboardStepHint}>Send professional invoices via WhatsApp →</Text>}
                            </View>
                        </TouchableOpacity>
                    </View>
                )}

                {/* ── Daily Revenue Target ─────────────────────────────────── */}
                <DailyTargetCard
                    goals={goals}
                    transactions={transactions}
                    currency={currency}
                    onSetGoal={() => setCurrentScreen('goals')}
                    onEditGoal={(id, changes) => updateGoal(id, changes)}
                    onDeleteGoal={(id) => deleteGoal(id)}
                />

                {/* ── Retention nudges ─────────────────────────────────────── */}
                {!isDemoMode && (
                    <RetentionNudges
                        transactions={transactions}
                        currency={currency}
                        profit={finance.profit}
                        onAddTransaction={() => openFab()}
                    />
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

                {/* ── 3 Quick Stats row ────────────────────────────────────── */}
                {(() => {
                    const owedToYou =
                        transactions.filter(t => t.status === 'overdue' || t.status === 'pending').reduce((s, t) => s + (Number(t.amount) || 0), 0) +
                        invoices.filter(inv => inv.status === 'overdue').reduce((s, inv) => s + (inv.total ?? 0), 0);
                    return (
                        <View style={styles.quickStatsRow}>
                            <TouchableOpacity style={styles.quickStatCard} onPress={() => setShowCashPockets(true)}>
                                <Text style={styles.quickStatIcon}>💵</Text>
                                <Text style={styles.quickStatLabel}>{cashPockets.length > 0 ? 'My Cash (all pockets)' : 'Cash · Tap to add pockets'}</Text>
                                <Text style={styles.quickStatValue}>{currency}{cashPockets.length > 0 ? totalCash.toLocaleString() : finance.cashBalance.toLocaleString()}</Text>
                            </TouchableOpacity>
                            <View style={styles.quickStatCard}>
                                <Text style={styles.quickStatIcon}>👥</Text>
                                <Text style={styles.quickStatLabel}>Owed to You</Text>
                                <Text style={styles.quickStatValue}>{currency}{owedToYou.toLocaleString()}</Text>
                            </View>
                            <View style={styles.quickStatCard}>
                                <Text style={styles.quickStatIcon}>📦</Text>
                                <Text style={styles.quickStatLabel}>Stock Items</Text>
                                <Text style={styles.quickStatValue}>{inventory.length}</Text>
                            </View>
                        </View>
                    );
                })()}

                {/* ── Full Dashboard toggle ─────────────────────────────────── */}
                <TouchableOpacity style={styles.fullDashToggle} onPress={() => setShowFullDashboard(v => !v)}>
                    <Text style={styles.fullDashToggleText}>{showFullDashboard ? '▲ Hide' : '📊 See Full Dashboard ▼'}</Text>
                </TouchableOpacity>

                {showFullDashboard && (
                <>

                {/* ── CARD 1: Profit hero ──────────────────────────────────── */}
                <View style={[styles.heroCard, { borderColor: finance.profit >= 0 ? Colors.income : Colors.expense }]}>
                    <Text style={[styles.heroStatus, { color: finance.profit >= 0 ? Colors.income : Colors.expense }]}>
                        {finance.profit >= 0 ? 'PROFITABLE ✓' : 'LOSING MONEY ✗'}
                    </Text>
                    <Text style={[styles.heroProfit, { color: finance.profit >= 0 ? Colors.income : Colors.expense }]}>
                        {finance.profit >= 0 ? '+' : ''}{currency}{finance.profit.toLocaleString()}
                    </Text>
                    <View style={styles.heroSubRow}>
                        <Text style={[styles.heroMargin, { color: finance.profit >= 0 ? Colors.income : Colors.expense }]}>
                            {finance.profit >= 0
                                ? `${(isNaN(finance.margin) ? 0 : finance.margin).toFixed(0)}% of your income is profit`
                                : 'You are spending more than you earn'}
                        </Text>
                    </View>
                    {lastMonthProfit !== 0 && profitDelta !== null && (
                        <View style={styles.deltaRow}>
                            <Text style={[styles.deltaBadge, { backgroundColor: profitDelta >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: profitDelta >= 0 ? Colors.income : Colors.expense }]}>
                                {profitDelta >= 0 ? '▲' : '▼'} {Math.abs(profitDelta).toFixed(0)}% vs last month
                            </Text>
                            <Text style={styles.deltaHint}>{profitDelta >= 0 ? 'Growing ✓' : 'Down from last month'}</Text>
                        </View>
                    )}
                    <View style={styles.heroMetricsRow}>
                        <TouchableOpacity style={styles.heroMetric} onPress={() => setCurrentScreen('transactions')}>
                            <Text style={styles.heroMetricLabel}>Income</Text>
                            <Text style={[styles.heroMetricVal, { color: Colors.income }]}>{currency}{finance.income.toLocaleString()}</Text>
                        </TouchableOpacity>
                        <View style={styles.heroMetricDivider} />
                        <TouchableOpacity style={styles.heroMetric} onPress={() => setCurrentScreen('transactions')}>
                            <Text style={styles.heroMetricLabel}>Expenses</Text>
                            <Text style={[styles.heroMetricVal, { color: Colors.expense }]}>{currency}{finance.expense.toLocaleString()}</Text>
                        </TouchableOpacity>
                        <View style={styles.heroMetricDivider} />
                        <View style={styles.heroMetric}>
                            <Text style={styles.heroMetricLabel}>Cash Profit</Text>
                            <Text style={[styles.heroMetricVal, { color: finance.profit >= 0 ? Colors.income : Colors.expense }]}>
                                {finance.profit >= 0 ? '+' : ''}{currency}{finance.profit.toLocaleString()}
                            </Text>
                        </View>
                    </View>
                    {finance.annualDepreciation > 0 && (
                        <Text style={styles.deprNote}>
                            After {currency}{Math.round(finance.annualDepreciation || 0).toLocaleString()} depreciation: {currency}{(finance.depreciationAdjustedProfit || 0).toLocaleString()} · Cash profit shown above
                        </Text>
                    )}
                    {finance.profit > 0 && hasTransaction && (
                        <TouchableOpacity style={styles.shareWinBtn} onPress={() => setShowShareCard(true)}>
                            <Text style={styles.shareWinText}>📤 Share your win</Text>
                        </TouchableOpacity>
                    )}
                    <Text style={styles.syncLabel}>{syncLabel}</Text>
                </View>

                {/* ── Loss guidance ────────────────────────────────────────── */}
                {finance.profit < 0 && hasTransaction && (
                    <View style={styles.lossGuide}>
                        <Text style={styles.lossGuideTitle}>💡 Here's what you can do</Text>
                        {(() => {
                            const cats: Record<string, number> = {};
                            transactions.filter(t => t.type === 'expense').forEach(t => {
                                const c = t.category || 'Other';
                                cats[c] = (cats[c] || 0) + (Number(t.amount) || 0);
                            });
                            const top = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
                            return top ? (
                                <Text style={styles.lossGuideText}>
                                    Your biggest cost is <Text style={styles.lossGuideHighlight}>{top[0]} ({currency}{top[1].toLocaleString()})</Text>.{'\n'}
                                    Can you charge customers a little more, or spend less on {top[0].toLowerCase()}?
                                </Text>
                            ) : (
                                <Text style={styles.lossGuideText}>Try logging all your expenses — knowing where money goes is the first step to fixing it.</Text>
                            );
                        })()}
                        <TouchableOpacity onPress={() => setCurrentScreen('transactions')} style={styles.lossGuideBtn}>
                            <Text style={styles.lossGuideBtnText}>See all my expenses →</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* ── Quick Answers ─────────────────────────────────────────── */}
                {hasTransaction && (
                    <View style={styles.qaRow}>
                        {(() => {
                            const now = new Date();
                            const weekStart = new Date(now);
                            weekStart.setDate(now.getDate() - now.getDay());
                            const weekStr = weekStart.toISOString().split('T')[0];
                            const weekIncome  = transactions.filter(t => t.type === 'income'  && t.date >= weekStr).reduce((s, t) => s + (Number(t.amount) || 0), 0);
                            const weekExpense = transactions.filter(t => t.type === 'expense' && t.date >= weekStr).reduce((s, t) => s + (Number(t.amount) || 0), 0);
                            const weekProfit  = weekIncome - weekExpense;
                            const cats: Record<string, number> = {};
                            transactions.filter(t => t.type === 'expense').forEach(t => {
                                const c = t.category || 'Other';
                                cats[c] = (cats[c] || 0) + (Number(t.amount) || 0);
                            });
                            const topCat = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
                            const owedCount = overdueInvoices.length + transactions.filter(t => t.status === 'overdue').length;
                            return (
                                <>
                                    <TouchableOpacity style={[styles.qaCard, { borderColor: weekProfit >= 0 ? Colors.income : Colors.expense }]} onPress={() => setCurrentScreen('reports')}>
                                        <Text style={styles.qaQuestion}>Did I make money this week?</Text>
                                        <Text style={[styles.qaAnswer, { color: weekProfit >= 0 ? Colors.income : Colors.expense }]}>
                                            {weekProfit >= 0 ? '✅ Yes' : '❌ No'}
                                        </Text>
                                        <Text style={[styles.qaValue, { color: weekProfit >= 0 ? Colors.income : Colors.expense }]}>
                                            {weekProfit >= 0 ? '+' : ''}{currency}{weekProfit.toLocaleString()}
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.qaCard} onPress={() => setCurrentScreen('transactions')}>
                                        <Text style={styles.qaQuestion}>Where did most money go?</Text>
                                        <Text style={styles.qaAnswer}>{topCat ? topCat[0] : '—'}</Text>
                                        <Text style={styles.qaValue}>{topCat ? `${currency}${topCat[1].toLocaleString()}` : 'No expenses yet'}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.qaCard, { borderColor: owedCount > 0 ? Colors.warning : Colors.border }]} onPress={() => setCurrentScreen('invoices')}>
                                        <Text style={styles.qaQuestion}>Who owes me money?</Text>
                                        <Text style={[styles.qaAnswer, { color: owedCount > 0 ? Colors.warning : Colors.income }]}>{owedCount > 0 ? `${owedCount} unpaid` : '✅ All clear'}</Text>
                                        <Text style={styles.qaValue}>{owedCount > 0 ? 'Tap to chase →' : 'No unpaid invoices'}</Text>
                                    </TouchableOpacity>
                                </>
                            );
                        })()}
                    </View>
                )}

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

                {/* ── CARD 3: Go Deeper (AI Insight + Analysis + CFO) ─────── */}
                <View style={[styles.goDeeperCard, { borderLeftColor: insightBorder }]}>
                    <TouchableOpacity style={styles.goDeeperHeader} onPress={() => setShowGoDeeper(v => !v)}>
                        <View style={styles.goDeeperLeft}>
                            <View style={[styles.tag, { backgroundColor: insightBorder }]}>
                                <Text style={styles.tagText}>{insight.tag}</Text>
                            </View>
                            <Text style={styles.goDeeperTitle}>{insight.title}</Text>
                        </View>
                        <Text style={styles.goDeeperToggle}>{showGoDeeper ? '▲' : '▼ Go Deeper'}</Text>
                    </TouchableOpacity>
                    <Text style={styles.insightAction}>{insight.action}</Text>
                    <Text style={styles.insightTimestamp}>
                        Based on {transactions.length} transaction{transactions.length !== 1 ? 's' : ''} · Updated {new Date().toLocaleDateString('default', { month: 'short', day: 'numeric' })}
                    </Text>
                    {transactions.length === 0 && (
                        <Text style={styles.insightStale}>Add transactions to unlock personalised insights</Text>
                    )}
                    {showGoDeeper && (
                        <View style={styles.goDeeperOptions}>
                            <TouchableOpacity style={styles.goDeeperOption} onPress={() => setCurrentScreen('insights')}>
                                <Text style={styles.goDeeperOptionIcon}>💡</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.goDeeperOptionLabel}>AI Insights</Text>
                                    <Text style={styles.goDeeperOptionSub}>Full breakdown & recommendations</Text>
                                </View>
                                <Text style={styles.quickArrow}>›</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.goDeeperOption} onPress={() => setCurrentScreen('analysis')}>
                                <Text style={styles.goDeeperOptionIcon}>🔍</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.goDeeperOptionLabel}>Analysis & Decisions</Text>
                                    <Text style={styles.goDeeperOptionSub}>Why did my profit change? · What if I hire or borrow?</Text>
                                </View>
                                <Text style={styles.quickArrow}>›</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.goDeeperOption, { borderBottomWidth: 0 }]} onPress={() => setCurrentScreen('cfo')}>
                                <Text style={styles.goDeeperOptionIcon}>🧠</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.goDeeperOptionLabel}>Business Advisor</Text>
                                    <Text style={styles.goDeeperOptionSub}>Cash flow forecast · Risk check · Loan calculator</Text>
                                </View>
                                <Text style={styles.quickArrow}>›</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                {/* ── CARD 4: Cash position ────────────────────────────────── */}
                <View style={styles.row}>
                    <View style={[styles.card, styles.flex]}>
                        <Text style={styles.cardLabel}>Money in Your Account</Text>
                        <TouchableOpacity onPress={() => setCurrentScreen('transactions')}>
                            <Text style={[styles.bigNum, { color: Colors.income }]}>{currency}{finance.cashBalance.toLocaleString()}</Text>
                        </TouchableOpacity>
                        <View style={[styles.reserveBadge, { backgroundColor: finance.cashBalance >= parseFloat(minReserve) ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)' }]}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: finance.cashBalance >= parseFloat(minReserve) ? Colors.income : Colors.expense }}>
                                {finance.cashBalance >= parseFloat(minReserve) ? 'Reserve OK ✓' : 'Below Reserve ✗'}
                            </Text>
                        </View>
                    </View>
                    <View style={[styles.card, styles.flex]}>
                        <Text style={styles.cardLabel}>How Long Your Money Lasts</Text>
                        <TouchableOpacity onPress={() => setCurrentScreen('reports')}>
                            <Text style={[styles.bigNum, { color: runwayColor }]}>
                                {runwayDays === null ? '∞' : `${runwayDays} days`}
                            </Text>
                        </TouchableOpacity>
                        <Text style={[styles.hint, { color: runwayColor }]}>
                            {runwayDays === null ? 'Add expenses to see how long your cash will last' : runwayDays < 30 ? 'Urgent — money running low!' : runwayDays < 60 ? 'Getting tight — watch spending' : 'You\'re in a good position'}
                        </Text>
                    </View>
                </View>

                {/* ── CARD 4b: 6-month trend chart ─────────────────────────── */}
                {hasTransaction && (
                    <ProfitTrendChart
                        data={trendData}
                        currency={currency}
                        onPress={() => setCurrentScreen('reports')}
                    />
                )}

                {/* ── Recurring due this month ──────────────────────────────── */}
                {recurringDueCount > 0 && (
                    <TouchableOpacity style={styles.recurringBanner} onPress={() => setCurrentScreen('transactions')}>
                        <Text style={styles.recurringIcon}>🔁</Text>
                        <Text style={styles.recurringText}>
                            {recurringDueCount} recurring transaction{recurringDueCount > 1 ? 's' : ''} due this month — tap to review
                        </Text>
                        <Text style={styles.recurringArrow}>›</Text>
                    </TouchableOpacity>
                )}

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

                {/* ── See more toggle ──────────────────────────────────────── */}
                <TouchableOpacity style={styles.seeMoreBtn} onPress={() => setShowMore(v => !v)}>
                    <Text style={styles.seeMoreText}>
                        {showMore ? '▲ Show less' : `▼ See more: ${assets.length > 0 ? `🏗️ ${assets.length} asset${assets.length !== 1 ? 's' : ''} · ` : ''}${loans.filter(l => l.status === 'active').length > 0 ? `🏦 ${loans.filter(l => l.status === 'active').length} loan${loans.filter(l => l.status === 'active').length !== 1 ? 's' : ''} · ` : ''}tax, equity & inventory`}
                    </Text>
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
                                <Text style={[styles.bigNum, { color: Colors.asset, fontSize: 18 }]}>{currency}{(isNaN(finance.assets) ? 0 : finance.assets).toLocaleString()}</Text>
                            </View>
                            <View style={[styles.card, styles.flex]}>
                                <Text style={styles.cardLabel}>{t(language, 'totalLiabilities')}</Text>
                                <Text style={[styles.bigNum, { color: Colors.liability, fontSize: 18 }]}>{currency}{(isNaN(finance.liabilities) ? 0 : finance.liabilities).toLocaleString()}</Text>
                            </View>
                        </View>
                        <View style={styles.card}>
                            <Text style={styles.cardLabel}>{t(language, 'ownersEquity')}</Text>
                            <Text style={[styles.bigNum, { color: Colors.equity }]}>{currency}{(isNaN(finance.equity) ? 0 : finance.equity).toLocaleString()}</Text>
                            <Text style={styles.hint}>{t(language, 'assetsMinusLiabilities')}</Text>
                        </View>

                        {/* Inventory */}
                        <TouchableOpacity style={styles.quickCard} onPress={() => setCurrentScreen('inventory')}>
                            <View style={styles.quickCardLeft}>
                                <Text style={styles.quickIcon}>📦</Text>
                                <View>
                                    <Text style={styles.quickLabel}>Inventory & Stock</Text>
                                    <Text style={styles.quickSub}>Track what you have in stock and how much you make on each item</Text>
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
                                    <Text style={styles.quickSub}>Set a monthly spending limit and see if you're going over</Text>
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

                <TouchableOpacity style={styles.reviewBtn} onPress={() => setShowDailyReport(true)}>
                    <Text style={styles.reviewBtnIcon}>📊</Text>
                    <View>
                        <Text style={styles.reviewBtnText}>Today's Report</Text>
                        <Text style={styles.reviewBtnSub}>End-of-day summary · Tomorrow's action plan</Text>
                    </View>
                    <Text style={styles.quickArrow}>›</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.reviewBtn} onPress={() => setShowMonthlyReview(true)}>
                    <Text style={styles.reviewBtnIcon}>📋</Text>
                    <View>
                        <Text style={styles.reviewBtnText}>Monthly Review</Text>
                        <Text style={styles.reviewBtnSub}>Did I make money? · Where did it go? · Who owes me?</Text>
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
            <TouchableOpacity style={styles.eodFab} onPress={() => setEodOpen(true)}>
                <Text style={styles.eodFabText}>🌙 End of Day</Text>
            </TouchableOpacity>

            {/* ── Daily log-today banner ───────────────────────────────────── */}
            {!loggedToday && (
                <View style={styles.logTodayBanner}>
                    <View style={styles.logTodayLeft}>
                        <Text style={styles.logTodayTitle}>🌙 Log today's sales before you sleep</Text>
                        <Text style={styles.logTodaySub}>Takes 30 seconds</Text>
                    </View>
                    <TouchableOpacity style={styles.logTodayBtn} onPress={() => openFab()}>
                        <Text style={styles.logTodayBtnText}>Log →</Text>
                    </TouchableOpacity>
                </View>
            )}

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
            <DailyReportModal
                visible={showDailyReport}
                onClose={() => setShowDailyReport(false)}
                transactions={transactions}
                goals={goals}
                finance={finance}
                settings={settings}
                currency={currency}
            />
            <GlobalSearch visible={showSearch} onClose={() => setShowSearch(false)} />
            <OnboardingWizard visible={showOnboardingWizard} onDone={() => setShowOnboardingWizard(false)} />
            <ProfitShareCard visible={showShareCard} onClose={() => setShowShareCard(false)} />
            <FirstRunWizard
                visible={showFirstRun}
                onDone={() => {
                    AsyncStorage.setItem('@quad360/first_run_done', '1');
                    setShowFirstRun(false);
                    dismissOnboarding();
                }}
            />
            <MonthlyReview visible={showMonthlyReview} onClose={() => setShowMonthlyReview(false)} />
            <CashPocketsModal visible={showCashPockets} onClose={() => setShowCashPockets(false)} />
            {toast !== null && (
                <View style={styles.toast} pointerEvents="none">
                    <Text style={styles.toastText}>✅ {toast}</Text>
                </View>
            )}
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

    demoBanner: {
        backgroundColor: '#854d0e', borderRadius: 10, padding: 12, marginBottom: 14,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    demoBannerText:    { color: '#fef3c7', fontWeight: '600', fontSize: 13, flex: 1 },
    demoBannerBtn:     { backgroundColor: '#fef3c7', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5, marginLeft: 8 },
    demoBannerBtnText: { color: '#854d0e', fontWeight: '700', fontSize: 12 },

    onboardCard:        { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: Colors.primary },
    onboardHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
    onboardTitle:       { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
    onboardSub:         { fontSize: 12, color: Colors.textMuted },
    onboardDismissBtn:  { padding: 4 },
    onboardDismissText: { fontSize: 16, color: Colors.textMuted },
    onboardStep:        { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 10 },
    onboardCheck:       { fontSize: 16, width: 22 },
    onboardStepText:    { fontSize: 14, color: Colors.textPrimary, fontWeight: '600' },
    onboardDone:        { color: Colors.textMuted, textDecorationLine: 'line-through' },
    onboardStepHint:    { fontSize: 11, color: Colors.primary, marginTop: 1 },

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
    shareWinBtn:       { marginTop: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(16,185,129,0.12)', alignItems: 'center', borderWidth: 1, borderColor: Colors.income },
    shareWinText:      { fontSize: 12, color: Colors.income, fontWeight: '700' },

    survivalRow:   { flexDirection: 'row', gap: 8, marginBottom: 12 },
    survivalCard:  { flex: 1, backgroundColor: Colors.bg, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 12, alignItems: 'center' },
    survivalLabel: { fontSize: 10, color: Colors.textMuted, marginBottom: 4, textAlign: 'center' },
    survivalValue: { fontSize: 14, fontWeight: 'bold', textAlign: 'center' },

    quickStatsRow:   { flexDirection: 'row', gap: 8, marginBottom: 12 },
    quickStatCard:   { flex: 1, backgroundColor: Colors.surface, borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
    quickStatIcon:   { fontSize: 22, marginBottom: 4 },
    quickStatLabel:  { fontSize: 10, color: Colors.textMuted, marginBottom: 4, textAlign: 'center' },
    quickStatValue:  { fontSize: 14, fontWeight: 'bold', color: Colors.textPrimary, textAlign: 'center' },

    fullDashToggle:     { alignItems: 'center', paddingVertical: 12, marginBottom: 8, backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border },
    fullDashToggleText: { color: Colors.primary, fontSize: 14, fontWeight: '700' },

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

    goDeeperCard:       { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12, borderLeftWidth: 4 },
    goDeeperHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
    goDeeperLeft:       { flex: 1, gap: 6 },
    goDeeperTitle:      { fontSize: 14, fontWeight: 'bold', color: Colors.textPrimary },
    goDeeperToggle:     { fontSize: 12, color: Colors.primary, fontWeight: '600', marginLeft: 8, marginTop: 2 },
    goDeeperOptions:    { marginTop: 12, borderTopWidth: 1, borderTopColor: Colors.border },
    goDeeperOption:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 10 },
    goDeeperOptionIcon: { fontSize: 20 },
    goDeeperOptionLabel:{ fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 1 },
    goDeeperOptionSub:  { fontSize: 11, color: Colors.textMuted },

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

    lossGuide:          { backgroundColor: 'rgba(239,68,68,0.07)', borderWidth: 1, borderColor: Colors.expense, borderRadius: 12, padding: 14, marginBottom: 12 },
    lossGuideTitle:     { fontSize: 13, fontWeight: '700', color: Colors.expense, marginBottom: 6 },
    lossGuideText:      { fontSize: 13, color: Colors.textSecondary, lineHeight: 20, marginBottom: 10 },
    lossGuideHighlight: { fontWeight: '700', color: Colors.expense },
    lossGuideBtn:       { alignSelf: 'flex-start' },
    lossGuideBtnText:   { fontSize: 12, color: Colors.expense, fontWeight: '600', textDecorationLine: 'underline' },

    qaRow:      { flexDirection: 'row', gap: 8, marginBottom: 12 },
    qaCard:     { flex: 1, backgroundColor: Colors.surface, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: Colors.border },
    qaQuestion: { fontSize: 10, color: Colors.textMuted, marginBottom: 4, lineHeight: 13 },
    qaAnswer:   { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
    qaValue:    { fontSize: 10, color: Colors.textMuted },

    seeMoreBtn:  { alignItems: 'center', paddingVertical: 12, marginBottom: 8 },
    seeMoreText: { color: Colors.primary, fontSize: 13, fontWeight: '600' },

    reviewBtn:     { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: Colors.primary, gap: 12 },
    reviewBtnIcon: { fontSize: 22 },
    reviewBtnText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
    reviewBtnSub:  { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

    btn:     { backgroundColor: Colors.primary, paddingVertical: 13, borderRadius: 10, alignItems: 'center', marginTop: 4 },
    btnText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 14 },

    toast:     { position: 'absolute', bottom: 140, left: 20, right: 20, backgroundColor: '#1a1a2e', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 10 },
    toastText: { color: '#fff', fontSize: 13, fontWeight: '600', textAlign: 'center' },

    syncLabel:  { fontSize: 10, color: Colors.income, marginTop: 8, textAlign: 'center' },
    insightTimestamp: { fontSize: 10, color: Colors.textMuted, marginTop: 6, fontStyle: 'italic' },

    recurringBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(59,130,246,0.1)', borderWidth: 1, borderColor: Colors.primary, borderRadius: 10, padding: 12, marginBottom: 10, gap: 8 },
    recurringIcon:   { fontSize: 16 },
    recurringText:   { flex: 1, fontSize: 12, color: Colors.primary, fontWeight: '600' },
    recurringArrow:  { fontSize: 18, color: Colors.primary },

    eodFab:     { position: 'absolute', right: 20, bottom: 140, backgroundColor: Colors.surface, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: Colors.border, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 5 },
    eodFabText: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },

    searchTrigger:     { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14, gap: 8 },
    searchTriggerIcon: { fontSize: 14, color: Colors.textMuted },
    searchTriggerText: { fontSize: 13, color: Colors.textMuted, flex: 1 },

    deltaRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    deltaBadge: { fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    deltaHint:  { fontSize: 11, color: Colors.textMuted },

    insightStale: { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic', marginTop: 4 },

    fab:     { position: 'absolute', right: 20, bottom: 80, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.income, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 8 },
    fabText: { fontSize: 30, color: Colors.textPrimary, lineHeight: 34 },

    logTodayBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(245,158,11,0.15)', borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.warning, paddingHorizontal: 16, paddingVertical: 10 },
    logTodayLeft:   { flex: 1 },
    logTodayTitle:  { fontSize: 13, fontWeight: '700', color: Colors.warning, marginBottom: 2 },
    logTodaySub:    { fontSize: 11, color: Colors.textMuted },
    logTodayBtn:    { backgroundColor: Colors.warning, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, marginLeft: 12 },
    logTodayBtnText:{ color: '#fff', fontWeight: '700', fontSize: 13 },

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
