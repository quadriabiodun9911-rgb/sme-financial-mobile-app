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
import { Language } from '../types';
import OnboardingWizard from '../components/OnboardingWizard';
import ProfitShareCard from '../components/ProfitShareCard';
import RetentionNudges from '../components/RetentionNudges';
import FirstRunWizard from '../components/FirstRunWizard';
import GlobalSearch from '../components/GlobalSearch';
import DailyTargetCard from '../components/DailyTargetCard';
import MonthlyReview from '../components/MonthlyReview';
import CashPocketsModal from '../components/CashPocketsModal';
import DailyReportModal from '../components/DailyReportModal';
import MerchantFinancingQualificationWidget from '../components/MerchantFinancingQualificationWidget';
import StickyMetricsHeader from '../components/StickyMetricsHeader';
import { MetricsComputer } from '../utils/metricsComputer';
import GreetingCard from '../components/GreetingCard';
import TodaysNumbersCard from '../components/TodaysNumbersCard';
import BusinessHealthWheel from '../components/BusinessHealthWheel';
import QuadAICard from '../components/QuadAICard';
import PillarsNavigation from '../components/PillarsNavigation';
import AlertsWidget from '../components/AlertsWidget';

const INCOME_CATEGORIES = ['Sales', 'Service', 'Consulting', 'Rental', 'Interest', 'Other Income'];
const EXPENSE_CATEGORIES = ['Rent', 'Salaries', 'Utilities', 'Marketing', 'Supplies', 'Transport', 'Meals', 'Software', 'Tax', 'Other'];

export default function DashboardScreen() {
    const { finance, settings, goals, transactions, invoices, assets, loans, navigate, setCurrentScreen, language: rawLanguage, isLoading, addTransaction, isDemoMode, exitDemo, cashPockets, deleteGoal, updateGoal, budgets, inventory, user, financing } = useApp();
    const language = rawLanguage as Language;

    const [fabOpen, setFabOpen]           = useState(false);
    const [qaType, setQaType]             = useState<'income' | 'expense'>('income');
    const [qaAmount, setQaAmount]         = useState('');
    const [qaDesc, setQaDesc]             = useState('');
    const [qaCategory, setQaCategory]     = useState('');
    const [qaSubmitting, setQaSubmitting] = useState(false);
    const [showMore, setShowMore]               = useState(false);
    const [betaCardDismissed, setBetaCardDismissed] = useState(false);

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
        AsyncStorage.getItem('@quad360/beta_card_dismissed').then(v => {
            if (v === '1') setBetaCardDismissed(true);
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

    // ── Date strings (stable across renders within same month) ───────────────
    const today = useMemo(() => new Date().toISOString().split('T')[0], []);
    const thisMonthStr = useMemo(() => new Date().toISOString().slice(0, 7), []);
    const lastMonthStr = useMemo(() => {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 7);
    }, []);

    // ── PERFORMANCE: Single-pass metrics computer (25x faster than 15 separate filters) ──
    const metrics = useMemo(() => {
        const computer = new MetricsComputer(transactions, invoices, goals, today, thisMonthStr, lastMonthStr);
        return computer.compute();
    }, [transactions, invoices, goals, today, thisMonthStr, lastMonthStr]);

    // Extract metrics from computer (replaces 15 separate useMemo calls)
    const activeGoals = metrics.activeGoals;
    const achievedGoals = metrics.achievedGoals;
    const offTrack = metrics.offTrack;
    const overdueCount = metrics.overdueCount;
    const overdueInvoices = metrics.overdueInvoices;
    const owedToYou = metrics.owedToYou;
    const recurringDueCount = metrics.recurringDueCount;
    const todayProfit = metrics.todayProfit;
    const lastMonthProfit = metrics.lastMonthProfit;
    const thisMonthProfit = metrics.thisMonthProfit;
    const profitDelta = metrics.profitDelta;
    const loggedToday = metrics.loggedToday;
    const collectionsTotal = metrics.collectionsTotal;
    const collectionsCount = metrics.collectionsCount;

    // ── Remaining memoized values (not in MetricsComputer yet) ──
    const overspentBudgets = useMemo(() => {
        const monthStr = thisMonthStr;
        return budgets.filter(b => {
            if (b.period && b.period !== monthStr) return false;
            const spent = transactions
                .filter(t => t.type === 'expense' && t.category === b.category && t.date.startsWith(monthStr))
                .reduce((s, t) => s + t.amount, 0);
            return spent > b.monthlyAmount;
        });
    }, [budgets, transactions, thisMonthStr]);

    const lowStockItems = useMemo(() => inventory.filter(i => i.quantity <= i.lowStockThreshold), [inventory]);
    const totalCash = useMemo(() => cashPockets.reduce((s, p) => s + p.amount, 0), [cashPockets]);

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
        if (inc > 0) addTransaction({ type: 'income',  amount: inc, description: 'End of day income',   category: 'Sales' });
        if (exp > 0) addTransaction({ type: 'expense', amount: exp, description: 'End of day expenses', category: 'Other' });
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

    const { currency = '₦', targetMargin, minReserve } = settings || { currency: '₦' };

    const hasTransaction = transactions.length > 0;
    const hasGoal        = goals.length > 0;
    const showOnboarding = (!hasTransaction || !hasGoal) && !onboardingDismissed;

    const dismissOnboarding = () => {
        AsyncStorage.setItem('@quad360/onboarding_dismissed', '1');
        setOnboardingDismissed(true);
    };

    const runwayDays = finance.expense > 0 ? Math.floor(finance.cashBalance / (finance.expense / 30)) : null;
    const runwayColor = runwayDays === null ? Colors.income : runwayDays < 30 ? Colors.expense : runwayDays < 60 ? Colors.warning : Colors.income;

    // Sync label (how recently data was saved)
    const syncLabel = (() => {
        const diffMin = Math.floor((Date.now() - lastSynced.getTime()) / 60000);
        if (diffMin < 2)  return '● Saved just now';
        if (diffMin < 60) return `● Saved ${diffMin} min ago`;
        return '● Saved today';
    })();


    // ── 7-Section Header Component ──
    const SectionHeader = ({ emoji, title }: { emoji: string; title: string }) => (
        <Text style={styles.sectionHeader}>{emoji} {title}</Text>
    );

    return (
        <SafeAreaView style={styles.safe}>
            <Header />
            <StickyMetricsHeader finance={finance} currency={currency} isSticky={true} />
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

                {/* ══════════════════════════════════════════════════════════════════
                    🎯 BUSINESS COMMAND CENTRE
                    ══════════════════════════════════════════════════════════════════ */}

                {/* 1. Greeting + Financial Score */}
                <GreetingCard
                  userName={user?.businessName?.split(' ')[0] || 'User'}
                  financialScore={Math.round(finance.cashBalance > 0 && finance.profit > 0 ? 75 + (Math.min(finance.margin, 50) / 50 * 15) : 65)}
                  status={finance.cashBalance > 0 && runwayDays && runwayDays > 30 ? 'healthy' : runwayDays && runwayDays > 7 ? 'warning' : 'critical'}
                />

                {/* 2. Today's Numbers */}
                <TodaysNumbersCard
                  sales={todayProfit >= 0 ? finance.income : finance.income - todayProfit}
                  expenses={todayProfit >= 0 ? finance.expense : finance.expense + (Math.abs(todayProfit) - Math.abs(finance.profit))}
                  profit={todayProfit}
                  margin={finance.profit > 0 ? (finance.profit / finance.income * 100) : 0}
                  currency={currency}
                />

                {/* 3. Business Health Wheel */}
                <BusinessHealthWheel
                  growth={profitDelta ? Math.min(Math.max(50 + profitDelta, 20), 100) : 65}
                  profit={finance.profit > 0 ? 80 : 40}
                  cash={finance.cashBalance > 0 ? Math.min(60 + (finance.cashBalance / 1000000 * 20), 95) : 35}
                  funding={financing?.isQualified ? 80 : 55}
                  control={inventory.length > 0 && budgets.length > 0 ? 75 : 60}
                  overall={Math.round(finance.cashBalance > 0 && finance.profit > 0 ? 75 + (Math.min(finance.margin, 50) / 50 * 15) : 65)}
                />

                {/* 4. Quad AI Card */}
                <QuadAICard
                  updates={[
                    ...(profitDelta && profitDelta > 10 ? [{ type: 'success' as const, emoji: '✅', message: `Sales increased ${Math.round(profitDelta)}% this month` }] : []),
                    ...(overdueInvoices.length > 0 ? [{ type: 'alert' as const, emoji: '⚠️', message: `${overdueInvoices.length} customer${overdueInvoices.length > 1 ? 's' : ''} owe ₦${overdueInvoices.reduce((s, i) => s + i.total, 0).toLocaleString()}` }] : []),
                    ...(lowStockItems.length > 0 ? [{ type: 'alert' as const, emoji: '📦', message: `${lowStockItems.length} items low on stock` }] : []),
                  ].slice(0, 3)}
                  recommendedAction={overdueInvoices.length > 0 ? `Follow up ${overdueInvoices.length} overdue customer${overdueInvoices.length > 1 ? 's' : ''} today` : profitDelta && profitDelta < 0 ? 'Review expenses to improve profitability' : 'Keep up momentum — maintain sales streak'}
                  onViewDetails={() => setShowDailyReport(true)}
                />


                {/* ── Merchant Financing Qualification Widget ────────────────── */}
                {!isDemoMode && user && (
                    <MerchantFinancingQualificationWidget
                        daysActive={user.daysActive || 0}
                        monthlyRevenue={user.avgMonthlyRevenue || 0}
                        healthScore={user.financialHealthScore || 0}
                        currency={settings.currency || '₦'}
                        isQualified={financing.isQualified || false}
                        hasActiveLoan={financing.activeLoan !== undefined && financing.activeLoan !== null}
                        onPress={() => setCurrentScreen('loans')}
                    />
                )}

                {/* ── Beta Features Spotlight ──────────────────────────────── */}
                {!isDemoMode && !betaCardDismissed && (
                    <View style={styles.betaCard}>
                        <View style={styles.betaCardHeader}>
                            <View style={styles.betaBadge}>
                                <Text style={styles.betaBadgeText}>🚀 NEW FEATURES</Text>
                            </View>
                            <TouchableOpacity onPress={() => {
                                setBetaCardDismissed(true);
                                AsyncStorage.setItem('@quad360/beta_card_dismissed', '1');
                            }}>
                                <Text style={styles.betaDismiss}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.betaTitle}>Try these features now</Text>
                        <Text style={styles.betaSubtitle}>Available during beta — built for your business</Text>

                        {/* Feature 1 — Paystack */}
                        <TouchableOpacity style={styles.betaFeature} onPress={() => navigate('payment-link')}>
                            <View style={[styles.betaFeatureIcon, { backgroundColor: '#00C3F722' }]}>
                                <Text style={{ fontSize: 22 }}>💳</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Text style={styles.betaFeatureName}>Collect Payment Online</Text>
                                    <View style={styles.betaLiveBadge}><Text style={styles.betaLiveText}>LIVE</Text></View>
                                </View>
                                <Text style={styles.betaFeatureDesc}>Send a Paystack checkout link to your customer. They pay with card, bank transfer, or USSD — money goes straight to you.</Text>
                            </View>
                            <Text style={styles.betaArrow}>›</Text>
                        </TouchableOpacity>

                        {/* Feature 2 — CSV Export */}
                        <TouchableOpacity style={styles.betaFeature} onPress={() => navigate('transactions')}>
                            <View style={[styles.betaFeatureIcon, { backgroundColor: '#10b98122' }]}>
                                <Text style={{ fontSize: 22 }}>📊</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Text style={styles.betaFeatureName}>Export to CSV / Excel</Text>
                                    <View style={[styles.betaLiveBadge, { backgroundColor: '#10b981' }]}><Text style={styles.betaLiveText}>LIVE</Text></View>
                                </View>
                                <Text style={styles.betaFeatureDesc}>Download all your transactions as a spreadsheet. Open in Excel or Google Sheets — great for accountants and tax filing.</Text>
                            </View>
                            <Text style={styles.betaArrow}>›</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.betaFeature} onPress={() => setCurrentScreen('cashflow')} activeOpacity={0.75}>
                            <View style={[styles.betaFeatureIcon, { backgroundColor: '#3b82f622' }]}>
                                <Text style={{ fontSize: 22 }}>💧</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Text style={styles.betaFeatureName}>Cash Flow Forecast</Text>
                                    <View style={[styles.betaLiveBadge, { backgroundColor: '#3b82f6' }]}><Text style={styles.betaLiveText}>NEW</Text></View>
                                </View>
                                <Text style={styles.betaFeatureDesc}>90-day weekly cash projection, runway calculator, and AR collection risk scoring.</Text>
                            </View>
                            <Text style={styles.betaArrow}>›</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.betaFeature} onPress={() => setCurrentScreen('payroll')} activeOpacity={0.75}>
                            <View style={[styles.betaFeatureIcon, { backgroundColor: '#10b98122' }]}>
                                <Text style={{ fontSize: 22 }}>👥</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Text style={styles.betaFeatureName}>Payroll</Text>
                                    <View style={[styles.betaLiveBadge, { backgroundColor: '#10b981' }]}><Text style={styles.betaLiveText}>NEW</Text></View>
                                </View>
                                <Text style={styles.betaFeatureDesc}>Manage staff, run monthly payroll with automatic deductions, and track salary history.</Text>
                            </View>
                            <Text style={styles.betaArrow}>›</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.betaFeature} onPress={() => setCurrentScreen('reconciliation')} activeOpacity={0.75}>
                            <View style={[styles.betaFeatureIcon, { backgroundColor: '#8b5cf622' }]}>
                                <Text style={{ fontSize: 22 }}>🔗</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Text style={styles.betaFeatureName}>Bank Reconciliation</Text>
                                    <View style={[styles.betaLiveBadge, { backgroundColor: '#8b5cf6' }]}><Text style={styles.betaLiveText}>NEW</Text></View>
                                </View>
                                <Text style={styles.betaFeatureDesc}>Import your bank statement and auto-match transactions to catch discrepancies instantly.</Text>
                            </View>
                            <Text style={styles.betaArrow}>›</Text>
                        </TouchableOpacity>
                    </View>
                )}
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

                {/* ── Alert banners ──────────────────────────────────────────– */}
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

                {/* Loss guidance */}
                {finance.profit < 0 && hasTransaction && (
                    <View style={styles.lossGuide}>
                        <Text style={styles.lossGuideTitle}>💡 Recommended Action</Text>
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
                                    Can you increase prices or reduce this expense?
                                </Text>
                            ) : (
                                <Text style={styles.lossGuideText}>Log all expenses to identify where money goes.</Text>
                            );
                        })()}
                        <TouchableOpacity onPress={() => setCurrentScreen('transactions')} style={styles.lossGuideBtn}>
                            <Text style={styles.lossGuideBtnText}>See expenses →</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* ── Retention nudges ─────────────────────────────────────── */}
                {!isDemoMode && (
                    <RetentionNudges
                        transactions={transactions}
                        currency={currency}
                        profit={finance.profit}
                        onAddTransaction={() => openFab()}
                    />
                )}

                {/* ── Beta Features ──────────────────────────────────────────– */}
                {!isDemoMode && !betaCardDismissed && (
                    <View style={styles.betaCard}>
                        <View style={styles.betaCardHeader}>
                            <View style={styles.betaBadge}>
                                <Text style={styles.betaBadgeText}>🚀 NEW FEATURES</Text>
                            </View>
                            <TouchableOpacity onPress={() => {
                                setBetaCardDismissed(true);
                                AsyncStorage.setItem('@quad360/beta_card_dismissed', '1');
                            }}>
                                <Text style={styles.betaDismiss}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.betaTitle}>Try these features now</Text>
                        <Text style={styles.betaSubtitle}>Available during beta — built for your business</Text>

                        <TouchableOpacity style={styles.betaFeature} onPress={() => navigate('payment-link')}>
                            <View style={[styles.betaFeatureIcon, { backgroundColor: '#00C3F722' }]}>
                                <Text style={{ fontSize: 22 }}>💳</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Text style={styles.betaFeatureName}>Collect Payment Online</Text>
                                    <View style={styles.betaLiveBadge}><Text style={styles.betaLiveText}>LIVE</Text></View>
                                </View>
                                <Text style={styles.betaFeatureDesc}>Send a Paystack checkout link.</Text>
                            </View>
                            <Text style={styles.betaArrow}>›</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.betaFeature} onPress={() => navigate('transactions')}>
                            <View style={[styles.betaFeatureIcon, { backgroundColor: '#10b98122' }]}>
                                <Text style={{ fontSize: 22 }}>📊</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Text style={styles.betaFeatureName}>Export to CSV / Excel</Text>
                                    <View style={[styles.betaLiveBadge, { backgroundColor: '#10b981' }]}><Text style={styles.betaLiveText}>LIVE</Text></View>
                                </View>
                                <Text style={styles.betaFeatureDesc}>Download transactions as a spreadsheet.</Text>
                            </View>
                            <Text style={styles.betaArrow}>›</Text>
                        </TouchableOpacity>
                    </View>
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
            {/* ── End of Day quick-log modal ───────────────────────────────── */}
            <Modal visible={eodOpen} transparent animationType="slide" onRequestClose={() => setEodOpen(false)}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setEodOpen(false)} />
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalSheet}>
                    <View style={styles.modalHandle} />
                    <Text style={styles.modalTitle}>🌙 End of Day Quick Log</Text>
                    <Text style={[styles.insightAction, { marginBottom: 16 }]}>Just two numbers — quick and done</Text>
                    <Text style={styles.catLabel}>Total money received today ({currency})</Text>
                    <TextInput
                        style={styles.modalInput}
                        placeholder="0"
                        placeholderTextColor={Colors.textMuted}
                        keyboardType="decimal-pad"
                        value={eodIncome}
                        onChangeText={setEodIncome}
                    />
                    <Text style={styles.catLabel}>Total money spent today ({currency})</Text>
                    <TextInput
                        style={styles.modalInput}
                        placeholder="0"
                        placeholderTextColor={Colors.textMuted}
                        keyboardType="decimal-pad"
                        value={eodExpense}
                        onChangeText={setEodExpense}
                    />
                    <TouchableOpacity style={[styles.modalSubmit, { backgroundColor: Colors.primary }]} onPress={submitEod}>
                        <Text style={styles.modalSubmitText}>Save Today's Numbers</Text>
                    </TouchableOpacity>
                </KeyboardAvoidingView>
            </Modal>
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

    betaCard:           { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1.5, borderColor: Colors.primary + '55' },
    betaCardHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    betaBadge:          { backgroundColor: Colors.primary + '22', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
    betaBadgeText:      { color: Colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
    betaDismiss:        { color: Colors.textMuted, fontSize: 16, paddingLeft: 12 },
    betaTitle:          { fontSize: 17, fontWeight: '800', color: Colors.textPrimary, marginBottom: 2 },
    betaSubtitle:       { fontSize: 12, color: Colors.textMuted, marginBottom: 14 },
    betaFeature:        { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: Colors.border },
    betaFeatureIcon:    { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    betaFeatureName:    { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 3 },
    betaFeatureDesc:    { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
    betaLiveBadge:      { backgroundColor: '#00C3F7', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
    betaLiveText:       { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
    betaArrow:          { color: Colors.textMuted, fontSize: 22, alignSelf: 'center' },

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

    // Section Styles (7-Section Architecture)
    sectionHeader:    { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 12, marginTop: 8 },
    sectionGrid:      { flexDirection: 'row', gap: 10, marginBottom: 12 },
    sectionCard:      { flex: 1, backgroundColor: Colors.surface, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
    sectionCardFlex:  { flex: 1 },
    sectionCardLabel: { fontSize: 11, color: Colors.textMuted, marginBottom: 4, textAlign: 'center' },
    sectionCardValue: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
    sectionActionCard: { backgroundColor: Colors.surface, borderRadius: 10, padding: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, gap: 12 },
    sectionActionIcon: { fontSize: 22 },
    sectionActionTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
    sectionActionSub: { fontSize: 11, color: Colors.textMuted },
    sectionActionArrow: { fontSize: 22, color: Colors.textMuted },
});
