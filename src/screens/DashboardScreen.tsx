import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    SafeAreaView, ScrollView, View, Text,
    TouchableOpacity, StyleSheet, ActivityIndicator,
    Modal, TextInput, KeyboardAvoidingView, Platform, Animated, useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../contexts/AppContext';
import { computeCashRunway } from '../utils/cashRunway';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import Header from '../components/Header';
import { trackDemoConvertTapped, trackScreenViewed } from '../utils/analytics';
import { getWorkspaceOwnerId } from '../utils/storage';
import { claimIncomingPayments } from '../utils/incomingPayments';
import FooterNav from '../components/FooterNav';
import { t } from '../utils/i18n';
import { validateAmount, validateDescription } from '../utils/validation';
import { Language, Screen } from '../types';
import OnboardingWizard from '../components/OnboardingWizard';
import ProfitShareCard from '../components/ProfitShareCard';
import RetentionNudges from '../components/RetentionNudges';
import FirstRunWizard from '../components/FirstRunWizard';
import GlobalSearch from '../components/GlobalSearch';
import DailyTargetCard from '../components/DailyTargetCard';
import MacroShieldSimulator from '../components/MacroShieldSimulator';
import MonthlyReview from '../components/MonthlyReview';
import CashPocketsModal from '../components/CashPocketsModal';
import DailyReportModal from '../components/DailyReportModal';
import StickyMetricsHeader from '../components/StickyMetricsHeader';
import { MetricsComputer } from '../utils/metricsComputer';
import GreetingCard from '../components/GreetingCard';
import TodaysNumbersCard from '../components/TodaysNumbersCard';
import WeeklyReportModal from '../components/WeeklyReportModal';
import { showAlert } from '../utils/webAlert';
import Icon, { IconName } from '../components/ui/Icon';
import StatTile from '../components/ui/StatTile';
import RadialGauge from '../components/RadialGauge';
import TrendSparkline from '../components/TrendSparkline';
import NextStepLink from '../components/NextStepLink';
import { buildFinancingFitInput } from '../utils/financingFit';
import { recommendFinancingTypes } from '../utils/financingRecommendation';
import { computeReadinessDelta } from '../utils/readinessHistory';
import { notifyFinancingOpportunity, notifyFinancingQualificationProgress, notifyOverdueRemindersDue, notifyLoanPaymentDueSoon, notifyPayrollDue, notifyOverdueTransactionsFound, notifyTaxDeadline, notifyGoalAlerts, notifyRecurringTransactionAlerts, notifyBudgetPeriodLapsed, notifyAssetsNearingReplacement, notifyStockoutRisk, notifyTaxAbilityToPayShortfall, notifySlowMovingStock, requestNotificationPermission, scheduleWeeklySummaryReminder, scheduleDailyReminder, scheduleMorningBriefing, scheduleEveningRecap, scheduleMonthlyBrief } from '../utils/notifications';
import { computeWeekdayPattern } from '../utils/weekdayPattern';
import { buildDailyBriefing } from '../utils/dailyBriefing';
import { buildDailyRecap } from '../utils/dailyRecap';
import { buildMonthlyBrief } from '../utils/monthlyBrief';
import { computeCelebration } from '../utils/celebrationEngine';
import CelebrationBanner from '../components/CelebrationBanner';
import { getInvoicesDueForReminder, loadReminderState, InvoiceReminderState } from '../utils/invoiceReminders';
import { isLoanPaymentOverdue, daysUntilLoanPaymentDue } from '../utils/loanMath';
import { getPayrollReminderStatus } from '../utils/payrollReminders';
import { getUninvoicedOverdueTransactions } from '../utils/overdueTransactions';
import { getTaxDeadlineStatus } from '../utils/taxDeadline';
import { isRecurringTransactionOverdue, daysUntilRecurringDue, hasRecurringSchedule } from '../utils/recurringTransactions';
import { isBudgetActiveForPeriod, isBudgetPeriodLapsed, currentPeriodString } from '../utils/budgetPeriod';
import { computeAssetsNearingReplacement, computeAssetCurrentValue, getMonthlyExpenseAverage, computeOneThingInsight, computeRiskScore, computeDSCR, computeFinancingReadinessScore, RISK_BAND_STYLE } from '../utils/finance';
import { computeBusinessHealthIntelligence } from '../utils/metricIntelligence';
import { computeStockVelocity, computeInventoryValue } from '../utils/stockVelocity';
import { computeDataQuality } from '../utils/dataQuality';
import { computeLendingCapacityEstimate } from '../utils/lendingCapacity';
import { computeTaxAbilityToPay } from '../utils/taxFilingReadiness';
import { detectFinancialAlerts, DEFAULT_THRESHOLDS } from '../utils/alertEngine';
import { performFinancialDiagnosis } from '../utils/financialDiagnosisEngine';
import { buildNewGoal, goalDefaults } from '../utils/goals';
import { computeRiskRadar, RiskLevel } from '../utils/riskRadar';
import { detectPersonalSpending, DISMISSED_PERSONAL_KEY } from '../utils/personalSpendingDetector';
import { GoalType } from '../types';
import { buildDashboardPriorities, PriorityKind, PriorityTier, OverspentBudget } from '../utils/dashboardPriorities';
import { resolveMonthlyMission, StoredMission } from '../utils/monthlyMission';

const CELEBRATED_GOALS_KEY = '@quad360/celebrated_goal_ids';
const MONTHLY_MISSION_KEY = '@quad360/monthly_mission';

const INCOME_CATEGORIES = ['Sales', 'Service', 'Consulting', 'Rental', 'Interest', 'Other Income'];
const EXPENSE_CATEGORIES = ['Rent', 'Salaries', 'Utilities', 'Marketing', 'Supplies', 'Transport', 'Meals', 'Software', 'Tax', 'Other'];

const PRIORITY_TIER_ORDER: PriorityTier[] = ['attention', 'watch', 'opportunity'];
const TOP_PRIORITY_COUNT = 3;
const NUMBER_EMOJI = ['1️⃣', '2️⃣', '3️⃣'];

const RISK_LEVEL_META: Record<RiskLevel, { color: string; dot: string }> = {
    high:      { color: Colors.expense,    dot: '🔴' },
    medium:    { color: Colors.warning,    dot: '🟡' },
    low:       { color: Colors.income,     dot: '🟢' },
    'no-data': { color: Colors.textMuted,  dot: '⚪' },
};

// Same band/status colors the Scoreboard screen uses for computeRiskScore's
// output -- one canonical score shown consistently everywhere it appears.
const HEALTH_BAND_COLOR: Record<string, string> = {
    Excellent: Colors.income,
    Strong: '#10b981',
    Moderate: Colors.warning,
    Weak: '#fb923c',
    Critical: Colors.expense,
};
const HEALTH_FACTOR_STATUS_COLOR: Record<string, string> = { good: Colors.income, warning: Colors.warning, danger: Colors.expense };

const PRIORITY_TIER_META: Record<PriorityTier, { emoji: string; label: string; color: string; tinted: boolean }> = {
    attention:   { emoji: '🔴', label: 'Attention',   color: Colors.expense, tinted: true },
    watch:       { emoji: '🟠', label: 'Watch',       color: Colors.warning, tinted: true },
    opportunity: { emoji: '🟢', label: 'Opportunity', color: Colors.primary, tinted: false },
};

const PRIORITY_KIND_META: Record<PriorityKind, { icon: IconName; screen: Screen }> = {
    overdue_invoices:     { icon: 'dollar-sign',    screen: 'invoices' },
    overdue_loan_payments: { icon: 'alert-triangle', screen: 'loans' },
    overdue_transactions:  { icon: 'dollar-sign',    screen: 'transactions' },
    low_cash:              { icon: 'alert-circle',   screen: 'cashflow' },
    negative_forecast:     { icon: 'trending-down',  screen: 'cashflow' },
    large_expense_coming:  { icon: 'alert-triangle', screen: 'cashflow' },
    low_stock:              { icon: 'package',        screen: 'inventory' },
    overspent_budget:       { icon: 'alert-triangle', screen: 'budget' },
    financing_opportunity:  { icon: 'trending-up',    screen: 'financing-marketplace' },
    payroll_overdue:        { icon: 'users',           screen: 'payroll' },
    payroll_due_soon:       { icon: 'users',           screen: 'payroll' },
    tax_deadline_overdue:   { icon: 'alert-triangle',  screen: 'reports' },
    tax_deadline_due_soon:  { icon: 'alert-circle',    screen: 'reports' },
    goal_deadline_passed:   { icon: 'target',           screen: 'goals' },
    goal_off_track:         { icon: 'flag',             screen: 'goals' },
    recurring_transaction_overdue: { icon: 'repeat',    screen: 'transactions' },
    budget_period_lapsed:   { icon: 'calendar',        screen: 'budget' },
    asset_nearing_replacement: { icon: 'briefcase',    screen: 'assets' },
    inventory_stockout_risk:   { icon: 'zap',          screen: 'inventory' },
    tax_ability_to_pay_shortfall: { icon: 'alert-triangle', screen: 'reports' },
    inventory_slow_moving:     { icon: 'package',      screen: 'inventory' },
};

export default function DashboardScreen() {
    const { finance, settings, goals, transactions, invoices, assets, loans, staff, payrollRuns, navigate, setCurrentScreen, navParams, language: rawLanguage, isLoading, addTransaction, isDemoMode, demoBusinessId, cashPockets, addGoal, deleteGoal, updateGoal, budgets, inventory, user, financing, canViewFinancials, readinessHistory, markInvoiceStatus } = useApp();
    const language = rawLanguage as Language;

    // Fallback pickup for payments payment-webhook confirmed while the
    // customer's checkout tab (or this device) wasn't the one that opened
    // PaymentLinkScreen/PaymentCompleteScreen -- e.g. a teammate collected
    // the payment from a different device. See incomingPayments.ts.
    useEffect(() => {
        if (isDemoMode) return;
        let cancelled = false;
        (async () => {
            const ownerUserId = await getWorkspaceOwnerId();
            if (!ownerUserId || cancelled) return;
            const existingRefs = new Set<string>((transactions || []).map((t: any) => t.reference).filter(Boolean));
            await claimIncomingPayments(ownerUserId, existingRefs, addTransaction, markInvoiceStatus);
        })();
        return () => { cancelled = true; };
    }, [isDemoMode]);

    // Modal renders via a portal on web, outside App.tsx's width constraint --
    // see FooterNav.tsx for the reference fix. Applied here to the bottom
    // sheets so they don't stretch full-bleed on desktop.
    const { width: windowWidth } = useWindowDimensions();
    const constrainSheetWidth = Platform.OS === 'web' && windowWidth >= 720;
    // Desktop-optimized layout: Business Health and Vital Signs sit side by
    // side on a wide viewport instead of stacking, actually using the
    // app column's width (App.tsx's centeredAppColumn, 1040px) instead of
    // just centering a single narrow column inside it. 1000, not the app
    // column's own 720 breakpoint -- two ~490px cards need real room each;
    // below this they'd cramp, so they keep stacking exactly as on mobile.
    const isWideDashboard = Platform.OS === 'web' && windowWidth >= 1000;

    const [fabOpen, setFabOpen]           = useState(false);
    const [qaType, setQaType]             = useState<'income' | 'expense'>('income');
    const [qaAmount, setQaAmount]         = useState('');
    const [qaDesc, setQaDesc]             = useState('');
    const [qaCategory, setQaCategory]     = useState('');
    const [qaSubmitting, setQaSubmitting] = useState(false);
    const [qaPaymentMethod, setQaPaymentMethod] = useState<'cash' | 'bank' | undefined>(undefined);
    const [showMore, setShowMore]               = useState(false);
    // Collapsed by default -- the #1 priority gets hero treatment (Next
    // Best Action) below, so re-showing the full ranked list right under it
    // would just repeat the top item and add back the clutter that change
    // was meant to remove. Expand only on request.
    const [showAllPriorities, setShowAllPriorities] = useState(false);
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
    const [showWeeklyReport, setShowWeeklyReport] = useState(false);
    const [toast, setToast]                     = useState<string | null>(null);
    // Measured height of the "Log today's sales" banner below -- the FAB and
    // "End of Day" pill are position:'absolute' with fixed bottom offsets
    // tuned for when that banner is hidden. When it's showing (any user who
    // hasn't logged a transaction today), those offsets landed the FAB right
    // on top of the banner instead of above it. Real measurement instead of
    // a guessed constant so it stays correct if the banner's text wraps.
    const [logTodayBannerHeight, setLogTodayBannerHeight] = useState(0);
    const [eodOpen, setEodOpen]                 = useState(false);
    const [eodIncome, setEodIncome]             = useState('');
    const [eodExpense, setEodExpense]           = useState('');
    // Optional -- left unset keeps today's numbers exactly as before
    // (payment method unspecified). Tagging it lets a cash-heavy business
    // build a real Cash Sales vs Bank Sales split over repeated EOD logs
    // without adding a mandatory field to the fastest entry point in the app.
    const [eodPaymentMethod, setEodPaymentMethod] = useState<'cash' | 'bank' | undefined>(undefined);
    const [lastSynced, setLastSynced]           = useState<Date>(new Date());
    // Which achieved goals have already had their "what's next" banner shown
    // (either accepted or dismissed) -- status/progress are recomputed fresh
    // on every render (see goals.ts's refreshGoal) and never persisted, so
    // without this a goal would re-trigger the celebration banner forever,
    // and a goal that briefly dips back under 100% and re-crosses it would
    // celebrate twice.
    const [celebratedGoalIds, setCelebratedGoalIds] = useState<string[]>([]);

    useEffect(() => {
        AsyncStorage.getItem(CELEBRATED_GOALS_KEY).then(raw => {
            if (raw) {
                try { setCelebratedGoalIds(JSON.parse(raw)); } catch { /* corrupt value, start fresh */ }
            }
        });
    }, []);

    // undefined = not yet read from storage (skip resolving a mission until
    // then, so a freshly-picked baseline never races the real stored one
    // and overwrites it before the load completes); null = read, nothing
    // stored yet.
    const [storedMission, setStoredMission] = useState<StoredMission | null | undefined>(undefined);
    useEffect(() => {
        AsyncStorage.getItem(MONTHLY_MISSION_KEY).then(raw => {
            if (!raw) { setStoredMission(null); return; }
            try { setStoredMission(JSON.parse(raw)); } catch { setStoredMission(null); }
        });
    }, []);

    useEffect(() => {
        AsyncStorage.getItem('@quad360/onboarding_dismissed').then(v => {
            if (v === '1') setOnboardingDismissed(true);
        }).catch(() => {});
        AsyncStorage.getItem('@quad360/beta_card_dismissed').then(v => {
            if (v === '1') setBetaCardDismissed(true);
        }).catch(() => {});
    }, []);

    useEffect(() => {
        if (isDemoMode || isLoading) return;
        // Already has real transactions (e.g. just imported a bank statement
        // from OnboardingChoiceScreen) — asking "what came in/out this week"
        // right after would just re-ask what the data already answers.
        if (transactions.length > 0) return;
        AsyncStorage.getItem('@quad360/first_run_done').then(v => {
            if (!v) setShowFirstRun(true);
        }).catch(() => {});
    }, [isDemoMode, isLoading, transactions.length]);

    // Deep-link from Global Search
    useEffect(() => {
        if (navParams?.openWeeklyReport) setShowWeeklyReport(true);
        if (navParams?.openMonthlyReview) setShowMonthlyReview(true);
        if (navParams?.openDailyReport) setShowDailyReport(true);
    }, [navParams]);

    useEffect(() => {
        if (isDemoMode) return;
        if (finance.profit <= 0) return;
        const monthKey = `@quad360/share_prompted_${new Date().toISOString().slice(0, 7)}`;
        AsyncStorage.getItem(monthKey).then(v => {
            if (!v) {
                setShowShareCard(true);
                AsyncStorage.setItem(monthKey, '1').catch(() => {});
            }
        }).catch(() => {});
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
        return budgets
            .map(b => {
                if (!isBudgetActiveForPeriod(b, monthStr)) return null;
                const spent = transactions
                    .filter(t => t.type === 'expense' && t.category === b.category && t.date.startsWith(monthStr))
                    .reduce((s, t) => s + (t.amount ?? 0), 0);
                return spent > b.monthlyAmount ? { ...b, spent, overage: spent - b.monthlyAmount } : null;
            })
            .filter((b): b is OverspentBudget => b !== null);
    }, [budgets, transactions, thisMonthStr]);

    const lowStockItems = useMemo(() => inventory.filter(i => i.quantity <= i.lowStockThreshold), [inventory]);
    const overdueLoans = useMemo(() => loans.filter(l => isLoanPaymentOverdue(l)), [loans]);
    const overdueTransactions = useMemo(
        () => getUninvoicedOverdueTransactions(transactions, invoices).map(o => o.transaction),
        [transactions, invoices]
    );
    const totalCash = useMemo(() => cashPockets.reduce((s, p) => s + p.amount, 0), [cashPockets]);

    // The "what changed" story, not just the current snapshot -- built from
    // the same readiness history Credit-Worthiness already tracks, not a
    // second computation. Null until there are 2+ snapshots (never true in
    // demo mode, since demo data is never persisted for snapshotting).
    const readinessDelta = useMemo(() => computeReadinessDelta(readinessHistory), [readinessHistory]);
    const readinessTopMover = useMemo(() => {
        if (!readinessDelta) return null;
        if (readinessDelta.trend === 'improving') {
            return readinessDelta.improvedFactors.reduce((best, f) => (!best || f.to - f.from > best.to - best.from) ? f : best, readinessDelta.improvedFactors[0] ?? null);
        }
        if (readinessDelta.trend === 'declining') {
            return readinessDelta.worsenedFactors.reduce((worst, f) => (!worst || f.to - f.from < worst.to - worst.from) ? f : worst, readinessDelta.worsenedFactors[0] ?? null);
        }
        return null;
    }, [readinessDelta]);

    // Surface a financing opportunity on the dashboard itself, not just
    // when the owner happens to visit Financing — but only the strongest
    // signal, and only one, so this doesn't become noise on every visit
    // the way a "you could get working capital" card always being true
    // would. Deliberately excludes the always-available Working Capital
    // fallback (see financingRecommendation.ts) -- a generic "you might
    // want financing" card here would just be clutter.
    // The single canonical business health score (computeRiskScore) -- same
    // eight weighted pillars (Profitability, Liquidity, Working Capital,
    // Debt, Efficiency, Inventory, Concentration, Operating Cash Flow) the
    // Scoreboard screen shows, computed once here and reused by both the Dashboard's own
    // health-score card below and financingCapacity's lending estimate, so
    // the two never independently recompute (and can never drift from) the
    // same underlying score.
    const businessHealth = useMemo(
        () => computeRiskScore(finance, loans, transactions, inventory),
        [finance, loans, transactions, inventory]
    );
    // Metric Intelligence pilot -- Definition/Owner-confidence/Trigger for
    // the single most prominent number on this screen. See
    // metricIntelligence.ts for exactly what's reused vs new.
    const healthIntelligence = useMemo(
        () => computeBusinessHealthIntelligence(businessHealth, transactions),
        [businessHealth, transactions]
    );
    const [healthWhyOpen, setHealthWhyOpen] = useState(false);
    const healthBandMeta = useMemo(
        () => ({ ...RISK_BAND_STYLE[businessHealth.band], color: HEALTH_BAND_COLOR[businessHealth.band] }),
        [businessHealth.band]
    );

    const financingOpportunity = useMemo(() => {
        const fitInput = buildFinancingFitInput(transactions, loans, settings, user);
        const readinessTrend = computeReadinessDelta(readinessHistory)?.trend ?? null;
        const recs = recommendFinancingTypes({ fitInput, invoices, assets, readinessTrend, transactions, inventory }, settings.currency)
            .filter(r => r.confidence === 'strong' && r.productType !== 'working_capital');
        return recs[0] ?? null;
    }, [transactions, loans, settings, user, readinessHistory, invoices, assets, inventory]);

    // "How much could my business realistically borrow" -- the same estimate
    // Credit-Worthiness and the Financing Marketplace already compute, just
    // surfaced ambiently here instead of only after a business owner goes
    // looking for it. Same >=5-transaction noise gate as diagnosisForNextGoal
    // (computeDataQuality's own 'none'/'limited' bands already return a
    // "not enough history" estimate below that threshold, but skipping the
    // card entirely is more honest than showing a hedge-everything result).
    const financingCapacity = useMemo(() => {
        if (transactions.length < 5) return null;
        const fitInput = buildFinancingFitInput(transactions, loans, settings, user);
        // Reweighted toward debt-service coverage and liquidity -- what
        // actually predicts repayment ability -- same as Credit-Worthiness
        // and the Financing Marketplace's own lending-capacity estimate.
        const financingReadiness = computeFinancingReadinessScore(businessHealth.factors);
        const dscr = computeDSCR(transactions, loans);
        const dataQuality = computeDataQuality(transactions);
        const inventoryValue = computeInventoryValue(inventory);
        return computeLendingCapacityEstimate({
            overallCreditScore: financingReadiness.score,
            avgMonthlyRevenue: fitInput.avgMonthlyRevenue,
            dscr: dscr.dscr,
            hasReliableData: dataQuality.confidence !== 'none' && dataQuality.confidence !== 'limited',
            inventoryValue,
        });
    }, [transactions, loans, settings, user, businessHealth, inventory]);

    // Best-effort device notification mirroring the dashboard card above —
    // notifyFinancingOpportunity throttles itself to once per 14 days, so
    // this effect re-running on every recompute of financingOpportunity
    // (e.g. after each new transaction) doesn't mean repeat notifications.
    useEffect(() => {
        if (isDemoMode || !financingOpportunity) return;
        notifyFinancingOpportunity(financingOpportunity.label, financingOpportunity.reasons[0]).catch(() => {});
    }, [isDemoMode, financingOpportunity]);

    // "Almost qualified for merchant financing" nudge -- built the same way
    // as notifyFinancingOpportunity above (throttles itself, once every 7
    // days) but never actually called from anywhere until now, so a
    // business closing in on the 90-day activity threshold never heard
    // about it.
    useEffect(() => {
        if (isDemoMode || !user?.daysActive) return;
        notifyFinancingQualificationProgress(user.daysActive).catch(() => {});
    }, [isDemoMode, user?.daysActive]);

    // Same "should I nag the owner" question InvoicesScreen's reminder
    // banner asks -- computed independently here (its own copy of the
    // persisted reminder state) rather than threaded through props, the
    // same way the alert detection just above is duplicated per-screen.
    const [invoiceReminderState, setInvoiceReminderState] = useState<InvoiceReminderState>({});
    useEffect(() => {
        loadReminderState().then(setInvoiceReminderState);
    }, []);
    const remindersDueCount = useMemo(
        () => getInvoicesDueForReminder(invoices, invoiceReminderState).length,
        [invoices, invoiceReminderState]
    );
    useEffect(() => {
        if (isDemoMode || remindersDueCount === 0) return;
        notifyOverdueRemindersDue(remindersDueCount).catch(() => {});
    }, [isDemoMode, remindersDueCount]);

    // Proactive heads-up before a loan payment is even overdue -- the
    // overdue ones already surface via the alert bell and the priority
    // list above; this is the "don't let it get there" half of the gap.
    const loansDueSoon = useMemo(
        () => loans
            .filter(l => l.status === 'active')
            .map(l => ({ loan: l, daysUntilDue: daysUntilLoanPaymentDue(l) }))
            .filter(x => x.daysUntilDue >= 0 && x.daysUntilDue <= DEFAULT_THRESHOLDS.loanPaymentDueSoonDays)
            .sort((a, b) => a.daysUntilDue - b.daysUntilDue),
        [loans]
    );
    useEffect(() => {
        if (isDemoMode || loansDueSoon.length === 0) return;
        const [soonest, ...rest] = loansDueSoon;
        notifyLoanPaymentDueSoon(soonest.loan.lenderName || 'your lender', soonest.daysUntilDue, rest.length).catch(() => {});
    }, [isDemoMode, loansDueSoon]);

    // Month-granular, not date-precise -- see payrollReminders.ts for why
    // (no pay-day field exists on StaffMember, unlike invoices' dueDate or
    // loans' implied schedule).
    const payrollStatus = useMemo(() => getPayrollReminderStatus(staff, payrollRuns), [staff, payrollRuns]);
    useEffect(() => {
        if (isDemoMode || payrollStatus.kind === 'none') return;
        notifyPayrollDue(payrollStatus).catch(() => {});
    }, [isDemoMode, payrollStatus]);

    useEffect(() => {
        if (isDemoMode || overdueTransactions.length === 0) return;
        const total = overdueTransactions.reduce((s, t) => s + (t.amount ?? 0), 0);
        notifyOverdueTransactionsFound(overdueTransactions.length, total, settings?.currency ?? '₦').catch(() => {});
    }, [isDemoMode, overdueTransactions, settings?.currency]);

    // The Tax Filing Readiness tab (Reports) already shows this prominently
    // on its own screen -- this only adds the alert bell / priority list /
    // notification surfacing that was previously missing everywhere else.
    const taxDeadlineStatus = useMemo(() => getTaxDeadlineStatus(settings?.nextTaxDeadline), [settings?.nextTaxDeadline]);
    useEffect(() => {
        if (isDemoMode || taxDeadlineStatus.kind === 'none' || taxDeadlineStatus.kind === 'ok') return;
        notifyTaxDeadline(taxDeadlineStatus).catch(() => {});
    }, [isDemoMode, taxDeadlineStatus]);

    // goals is already the live/refreshed array (OptimizedContexts recomputes
    // status/progress on every read via refreshGoal) -- this only counts what's
    // already there, it never recomputes goal math itself.
    const goalsMissedCount = useMemo(
        () => goals.filter(g => g.status !== 'achieved' && new Date(g.deadline) < new Date()).length,
        [goals]
    );
    const goalsOffTrackCount = useMemo(
        () => goals.filter(g => g.status === 'off_track' && new Date(g.deadline) >= new Date()).length,
        [goals]
    );
    useEffect(() => {
        if (isDemoMode || (goalsMissedCount === 0 && goalsOffTrackCount === 0)) return;
        notifyGoalAlerts(goalsMissedCount, goalsOffTrackCount).catch(() => {});
    }, [isDemoMode, goalsMissedCount, goalsOffTrackCount]);

    // Quad360 has no engine that auto-generates each period's instance, so
    // this can only ever say "expected by now, not updated since" -- see
    // recurringTransactions.ts and alertEngine's detectRecurringTransactionAlerts
    // for the full reasoning.
    const overdueRecurringTransactions = useMemo(
        () => transactions.filter(t => hasRecurringSchedule(t) && isRecurringTransactionOverdue(t)),
        [transactions]
    );
    const recurringDueSoonCount = useMemo(
        () => transactions.filter(t => {
            if (!hasRecurringSchedule(t)) return false;
            const d = daysUntilRecurringDue(t);
            return d >= 0 && d <= DEFAULT_THRESHOLDS.recurringDueSoonDays;
        }).length,
        [transactions]
    );
    useEffect(() => {
        if (isDemoMode || (overdueRecurringTransactions.length === 0 && recurringDueSoonCount === 0)) return;
        notifyRecurringTransactionAlerts(overdueRecurringTransactions.length, recurringDueSoonCount).catch(() => {});
    }, [isDemoMode, overdueRecurringTransactions.length, recurringDueSoonCount]);

    // Never fires for a business that's simply never used budgeting -- see
    // budgetPeriod.ts's isBudgetPeriodLapsed guard.
    const budgetPeriodLapsed = useMemo(() => isBudgetPeriodLapsed(budgets), [budgets]);
    useEffect(() => {
        if (isDemoMode || !budgetPeriodLapsed) return;
        notifyBudgetPeriodLapsed(currentPeriodString()).catch(() => {});
    }, [isDemoMode, budgetPeriodLapsed]);

    // Same ≤20%-of-cost threshold AssetsScreen's own local banner already
    // uses (computeAssetsNearingReplacement, finance.ts) -- just not
    // previously surfaced anywhere else.
    const assetsNearingReplacement = useMemo(() => computeAssetsNearingReplacement(assets), [assets]);
    useEffect(() => {
        if (isDemoMode || assetsNearingReplacement.length === 0) return;
        const total = assetsNearingReplacement.reduce((s, a) => s + computeAssetCurrentValue(a), 0);
        notifyAssetsNearingReplacement(assetsNearingReplacement.length, total, settings?.currency ?? '₦').catch(() => {});
    }, [isDemoMode, assetsNearingReplacement, settings?.currency]);

    // One velocity-per-item pass shared by both lists below, instead of each
    // independently re-filtering the full inventory array with its own call
    // to computeStockVelocity (which itself scans all of `transactions` per
    // item) -- same memoized-Map pattern InventoryScreen.tsx already uses
    // for the same function, halving the O(items × transactions) work this
    // effect used to do on every dashboard load/transaction change.
    const velocityByItemId = useMemo(
        () => new Map(inventory.map(item => [item.id, computeStockVelocity(item, transactions)])),
        [inventory, transactions]
    );

    // Distinct from lowStockItems below -- this is sales-velocity-derived
    // (computeStockVelocity's 'fast' tier), so it can catch an item that's
    // well above its manually-set reorder point but still about to sell out.
    const stockoutRiskItems = useMemo(
        () => inventory.filter(i => velocityByItemId.get(i.id)?.tier === 'fast'),
        [inventory, velocityByItemId]
    );
    useEffect(() => {
        if (isDemoMode || stockoutRiskItems.length === 0) return;
        const total = computeInventoryValue(stockoutRiskItems);
        notifyStockoutRisk(stockoutRiskItems.length, total, settings?.currency ?? '₦').catch(() => {});
    }, [isDemoMode, stockoutRiskItems, settings?.currency]);

    // The mirror image of stockoutRiskItems -- cash tied up in stock that
    // isn't moving (computeStockVelocity's 'slow' tier), rather than stock
    // about to run out.
    const slowMovingItems = useMemo(
        () => inventory.filter(i => velocityByItemId.get(i.id)?.tier === 'slow'),
        [inventory, velocityByItemId]
    );
    useEffect(() => {
        if (isDemoMode || slowMovingItems.length === 0) return;
        const total = computeInventoryValue(slowMovingItems);
        notifySlowMovingStock(slowMovingItems.length, total, settings?.currency ?? '₦').catch(() => {});
    }, [isDemoMode, slowMovingItems, settings?.currency]);

    // Same "ability to pay" check the Tax Filing Readiness tab already runs
    // -- distinct from taxDeadlineStatus above, which is purely about the
    // filing date. This is about whether cash on hand covers tax already
    // collected but not yet remitted, regardless of how far off the
    // deadline is.
    const taxAbilityToPay = useMemo(
        () => computeTaxAbilityToPay({ cashBalance: finance.cashBalance, totalTaxCollected: finance.totalTaxCollected, totalTaxPaid: finance.totalTaxPaid }),
        [finance.cashBalance, finance.totalTaxCollected, finance.totalTaxPaid]
    );
    useEffect(() => {
        if (isDemoMode || taxAbilityToPay.canCover) return;
        notifyTaxAbilityToPayShortfall(taxAbilityToPay.shortfall, settings?.currency ?? '₦').catch(() => {});
    }, [isDemoMode, taxAbilityToPay, settings?.currency]);

    // Daily + weekly rhythm engagement -- both scheduling functions existed
    // fully built in notifications.ts but neither was ever called from
    // anywhere; this is the missing link that actually brings the user back
    // instead of only showing the weekly report to whoever happens to open
    // it manually. All three calls are already idempotent (permission check
    // short-circuits if already granted; each schedule cancels its own
    // previous notification before rescheduling), so running this once per
    // mount is safe.
    useEffect(() => {
        if (isDemoMode) return;
        requestNotificationPermission().then(granted => {
            if (granted) {
                scheduleDailyReminder();
                scheduleWeeklySummaryReminder();
            }
        });
    }, [isDemoMode]);

    // Same cash-flow risk detection the header's alert bell uses -- pure
    // computation, cheap to run a second time here rather than threading
    // Header's alert state down through props for what's otherwise an
    // unrelated component tree.
    const alerts = useMemo(
        () => detectFinancialAlerts(finance.cashBalance, transactions, invoices, settings?.currency, undefined, loans, staff, payrollRuns, settings?.nextTaxDeadline, goals, budgets, assets, inventory, finance.totalTaxCollected, finance.totalTaxPaid, settings?.minReserve),
        [finance.cashBalance, transactions, invoices, settings?.currency, loans, staff, payrollRuns, settings?.nextTaxDeadline, goals, budgets, assets, inventory, finance.totalTaxCollected, finance.totalTaxPaid, settings?.minReserve]
    );

    const priorities = useMemo(
        () => buildDashboardPriorities({
            alerts,
            overdueInvoices,
            overdueLoans,
            overdueTransactions,
            overdueRecurringTransactions,
            assetsNearingReplacement,
            stockoutRiskItems,
            slowMovingItems,
            lowStockItems,
            overspentBudgets,
            financingOpportunity,
            currency: settings?.currency ?? '₦',
            primaryGoal: settings?.primaryGoal,
        }),
        [alerts, overdueInvoices, overdueLoans, overdueTransactions, overdueRecurringTransactions, assetsNearingReplacement, stockoutRiskItems, slowMovingItems, lowStockItems, overspentBudgets, financingOpportunity, settings?.currency, settings?.primaryGoal]
    );

    // Day-of-week revenue/expense shape (weekdayPattern.ts) -- feeds both the
    // morning briefing (is today historically a strong/weak day) and the
    // evening recap (how did today compare to a typical day like it).
    const weekdayPattern = useMemo(() => computeWeekdayPattern(transactions), [transactions]);

    // Morning briefing / evening recap -- see notifications.ts's
    // scheduleMorningBriefing/scheduleEveningRecap for why these are
    // rescheduled (not just scheduled once): this is a fully client-side app
    // with no backend to compute "today's real numbers" at 7am/6pm server-
    // side, so each is a one-off local notification rebuilt with the
    // freshest data available every time the Dashboard renders, replacing
    // whatever was scheduled before. A business that never reopens the app
    // gets whichever version was last built, not fabricated content.
    const dailyBriefing = useMemo(() => buildDailyBriefing(priorities, weekdayPattern), [priorities, weekdayPattern]);
    useEffect(() => {
        if (isDemoMode) return;
        scheduleMorningBriefing(dailyBriefing).catch(() => {});
    }, [isDemoMode, dailyBriefing]);

    const dailyRecap = useMemo(
        () => buildDailyRecap(transactions, weekdayPattern, null, null, settings?.currency ?? '₦'),
        [transactions, weekdayPattern, settings?.currency]
    );
    useEffect(() => {
        if (isDemoMode) return;
        scheduleEveningRecap(dailyRecap).catch(() => {});
    }, [isDemoMode, dailyRecap]);

    // Monthly CEO/CFO brief -- the automatically-delivered counterpart to
    // MonthlyReview.tsx's own on-demand modal (same underlying monthly
    // buckets, see monthlyBrief.ts). Same one-off-notification-rebuilt-on-
    // every-render pattern as the morning briefing/evening recap above, just
    // on a monthly cadence (see scheduleMonthlyBrief).
    const monthlyBrief = useMemo(
        () => buildMonthlyBrief(transactions, invoices, settings?.currency ?? '₦'),
        [transactions, invoices, settings?.currency]
    );
    useEffect(() => {
        if (isDemoMode) return;
        scheduleMonthlyBrief(monthlyBrief).catch(() => {});
    }, [isDemoMode, monthlyBrief]);

    // Celebrating improvement -- see celebrationEngine.ts for why this is a
    // separate, positive-reinforcement moment rather than a duplicate of the
    // readiness-trend line already on this screen.
    const celebration = useMemo(
        () => computeCelebration(readinessHistory, transactions, settings?.currency ?? '₦'),
        [readinessHistory, transactions, settings?.currency]
    );

    // This month's one focused target -- the highest-impact "reduce this to
    // zero" item already on the priority list above, tracked against a
    // baseline snapshotted once (see monthlyMission.ts). Held back until
    // storedMission has actually been read from AsyncStorage (see its
    // useEffect above), otherwise a fresh guess made on the very first
    // render would win the race and get persisted over the real stored
    // baseline.
    const { mission: monthlyMission, toPersist: missionToPersist } = useMemo(
        () => (storedMission === undefined ? { mission: null, toPersist: null } : resolveMonthlyMission(priorities, storedMission)),
        [priorities, storedMission]
    );
    useEffect(() => {
        if (!missionToPersist) return;
        setStoredMission(missionToPersist);
        AsyncStorage.setItem(MONTHLY_MISSION_KEY, JSON.stringify(missionToPersist));
    }, [missionToPersist]);

    // Same call shape every other diagnosis screen already uses (GoalsScreen,
    // ActionTrackerScreen, FinancialAssessmentScreen, BudgetScreen) -- gated
    // the same way GoalsScreen gates it, since fewer than 5 transactions
    // makes the diagnosis too noisy to be worth a second engine run here.
    const diagnosisForNextGoal = useMemo(
        () => (transactions.length >= 5
            ? performFinancialDiagnosis(transactions, invoices, finance.cashBalance, getMonthlyExpenseAverage(finance.expense, transactions), settings?.currency, loans, inventory, assets)
            : null),
        [transactions, invoices, finance.cashBalance, finance.expense, settings?.currency, loans, inventory, assets]
    );

    // The first not-yet-celebrated achieved goal -- see celebratedGoalIds
    // above for why "achieved" alone isn't enough to gate this.
    const goalToCelebrate = useMemo(
        () => achievedGoals.find(g => !celebratedGoalIds.includes(g.id)) ?? null,
        [achievedGoals, celebratedGoalIds]
    );

    // What to propose next: the highest-severity/impact unresolved issue
    // that maps to a trackable goal type (financialDiagnosisEngine's
    // suggestedGoalType) and isn't already an active goal -- recommending a
    // goal type the user is already chasing would just be noise. Falls back
    // to cash_reserve (always a legitimate target for any business) when
    // diagnosis found nothing mappable, e.g. because the business is
    // genuinely healthy right now.
    const nextGoalType: GoalType | null = useMemo(() => {
        if (!goalToCelebrate) return null;
        const activeTypes = new Set(goals.filter(g => g.status !== 'achieved').map(g => g.type));
        const fromDiagnosis = diagnosisForNextGoal?.diagnoses.find(d => d.suggestedGoalType && !activeTypes.has(d.suggestedGoalType));
        if (fromDiagnosis?.suggestedGoalType) return fromDiagnosis.suggestedGoalType;
        return activeTypes.has('cash_reserve') ? null : 'cash_reserve';
    }, [goalToCelebrate, goals, diagnosisForNextGoal]);

    // Same defaults GoalsScreen's own "add goal" tile would prefill for this
    // type -- never a number invented just for this banner.
    const nextGoalPreview = useMemo(
        () => (nextGoalType ? goalDefaults(nextGoalType, finance, settings, transactions) : null),
        [nextGoalType, finance, settings, transactions]
    );

    const markGoalCelebrated = (goalId: string) => {
        setCelebratedGoalIds(prev => {
            const next = [...prev, goalId];
            AsyncStorage.setItem(CELEBRATED_GOALS_KEY, JSON.stringify(next));
            return next;
        });
    };

    const handleSetNextGoal = () => {
        if (!goalToCelebrate || !nextGoalType || !nextGoalPreview) return;
        const deadline = new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0];
        addGoal(buildNewGoal({
            type: nextGoalType,
            title: nextGoalPreview.title ?? 'New Goal',
            description: nextGoalPreview.description ?? '',
            targetValue: nextGoalPreview.targetValue ?? 0,
            deadline,
        }, finance, settings, transactions));
        markGoalCelebrated(goalToCelebrate.id);
        showToast(`New goal set: ${nextGoalPreview.title}`);
    };

    const handleDismissCelebration = () => {
        if (!goalToCelebrate) return;
        markGoalCelebrated(goalToCelebrate.id);
    };

    // "What could stop growth" -- distinct from "What Needs Your Attention"
    // above: that section is acute/urgent items with a real dollar figure;
    // this is a periodic strategic check-in across signals that already
    // exist scattered on their own deep-dive screens (CFO > Risk tab's
    // concentration/seasonal cards, Settings' macro assumptions), never
    // otherwise summarized in one place.
    const riskRadar = useMemo(
        () => computeRiskRadar(transactions, loans, settings?.macroAssumptions ?? [], new Date(), assets),
        [transactions, loans, settings?.macroAssumptions, assets]
    );

    // Same "not personal" confirmations TransactionsScreen's row action
    // writes -- read independently here (not lifted to context) so this
    // banner reflects them without adding new global state, matching how
    // Header's own dismissedAlertIds is scoped to that component alone.
    const [dismissedPersonalIds, setDismissedPersonalIds] = useState<string[]>([]);
    useEffect(() => {
        AsyncStorage.getItem(DISMISSED_PERSONAL_KEY).then(raw => {
            if (raw) {
                try { setDismissedPersonalIds(JSON.parse(raw)); } catch { /* corrupt value, start fresh */ }
            }
        });
    }, []);
    const personalSpending = useMemo(
        () => detectPersonalSpending(transactions, settings?.currency ?? '₦', dismissedPersonalIds, settings?.industry),
        [transactions, settings?.currency, dismissedPersonalIds, settings?.industry]
    );

    const openFab = (type: 'income' | 'expense' = 'income') => {
        setQaType(type);
        setQaCategory('');
        setQaAmount('');
        setQaDesc('');
        setQaPaymentMethod(undefined);
        setFabOpen(true);
    };

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3000);
    };

    const submitEod = () => {
        const inc = parseFloat(eodIncome) || 0;
        const exp = parseFloat(eodExpense) || 0;
        if (inc <= 0 && exp <= 0) { showAlert('Nothing to save', 'Enter at least one amount.'); return; }
        const today = new Date().toISOString().split('T')[0];
        if (inc > 0) addTransaction({ type: 'income',  amount: inc, description: 'End of day income',   category: 'Sales', date: today, paymentMethod: eodPaymentMethod });
        if (exp > 0) addTransaction({ type: 'expense', amount: exp, description: 'End of day expenses', category: 'Other', date: today, paymentMethod: eodPaymentMethod });
        setEodIncome(''); setEodExpense(''); setEodPaymentMethod(undefined); setEodOpen(false);
        setLastSynced(new Date());
        // The Daily Report recap already shows this exact number alongside a
        // verdict and tomorrow's action plan -- a toast saying the same thing
        // a beat before the recap opens would just be redundant.
        setShowDailyReport(true);
    };

    const submitQuickAdd = () => {
        const amt = parseFloat(qaAmount);
        const amountError = validateAmount(amt);
        if (amountError) { showAlert('Invalid Amount', amountError.message); return; }
        const descError = validateDescription(qaDesc.trim());
        if (descError) { showAlert('Invalid Description', descError.message); return; }

        setQaSubmitting(true);
        try {
            addTransaction({
                type: qaType,
                amount: amt,
                description: qaDesc.trim(),
                category: qaCategory.trim() || (qaType === 'income' ? 'Sales' : 'Other'),
                date: new Date().toISOString().split('T')[0],
                paymentMethod: qaPaymentMethod,
            });
            setQaAmount(''); setQaDesc(''); setQaCategory(''); setQaPaymentMethod(undefined); setFabOpen(false);
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

    // Same trailing-30-day-paid-expenses burn rate used everywhere else in
    // the app (Cash Runway tab, Weekly Dashboard, Loans & Debt, Cash Flow
    // Stress Test) — this used to divide finance.expense (an all-time
    // cumulative total, not a monthly figure) by 30, which understated or
    // overstated runway depending purely on how long the business had been
    // tracked, and could show a different runway than every other screen.
    const { dailyBurn: dashboardDailyBurn, runwayDays: computedRunwayDays } = useMemo(
        () => computeCashRunway(transactions, finance.cashBalance),
        [transactions, finance.cashBalance],
    );
    const runwayDays = dashboardDailyBurn > 0 ? computedRunwayDays : null;
    const runwayColor = runwayDays === null ? Colors.income : runwayDays < 30 ? Colors.expense : runwayDays < 60 ? Colors.warning : Colors.income;

    // Last 30 days of cash balance, reconstructed by walking today's real
    // balance (finance.cashBalance) backward through paid transactions in
    // the window, then forward day-by-day -- same cash-basis definition
    // computeFinance's cashBalance already uses (paid-only, full amount,
    // no principalPortion subtraction), so the chart's last point always
    // matches the Cash in Hand figure shown right above it.
    const cashTrend = useMemo(() => {
        const days = 30;
        const today = new Date();
        const dates: string[] = [];
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(today); d.setDate(today.getDate() - i);
            dates.push(d.toISOString().split('T')[0]);
        }
        const startStr = dates[0];
        const netByDay = new Map<string, number>();
        let netInWindow = 0;
        for (const t of transactions) {
            if ((t.status ?? 'paid') !== 'paid') continue;
            if (!t.date || t.date < startStr) continue;
            const signed = t.type === 'income' ? (t.amount ?? 0) : -(t.amount ?? 0);
            netByDay.set(t.date, (netByDay.get(t.date) ?? 0) + signed);
            netInWindow += signed;
        }
        let running = finance.cashBalance - netInWindow;
        return dates.map(d => { running += netByDay.get(d) ?? 0; return running; });
    }, [transactions, finance.cashBalance]);

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
            {canViewFinancials && <StickyMetricsHeader finance={finance} currency={currency} />}
            <ScrollView style={styles.scroll} contentContainerStyle={styles.pad}>

                <TouchableOpacity style={styles.searchTrigger} onPress={() => setShowSearch(true)}>
                    <Icon name="search" size={14} color={Colors.textMuted} />
                    <Text style={styles.searchTriggerText}>Search transactions, invoices, assets...</Text>
                </TouchableOpacity>
                <Text style={styles.title}>{t(language, 'dashboard')}</Text>

                {/* One-tap entry to Collect Payment for a payment that isn't
                    tied to any invoice -- invoice-linked payments already
                    have their own "Collect Payment" button on each invoice
                    row (InvoicesScreen), this is the ad-hoc path. */}
                {canViewFinancials && (
                    <View style={styles.quickActionsRow}>
                        <TouchableOpacity style={styles.quickAction} onPress={() => navigate('payment-link')}>
                            <Icon name="credit-card" size={18} color={Colors.primary} />
                            <Text style={[styles.quickActionText, { color: Colors.textPrimary }]}>Collect Payment</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* ── Guest/Demo Mode banner ───────────────────────────────────
                    "Guest Mode" only applies to the blank entry (real numbers
                    the visitor typed/imported themselves, demoBusinessId ===
                    null) -- a canned sample business is fake data, and
                    labeling it "Guest Mode" would make it look like the
                    visitor's own numbers are showing on screen. */}
                {isDemoMode && (
                    <View style={styles.demoBanner}>
                        <View style={styles.demoBannerLeft}>
                            <Icon name="eye" size={14} color="#fff" />
                            <Text style={styles.demoBannerText}>
                                {demoBusinessId === null
                                    ? 'Guest Mode — data is not saved'
                                    : 'Demo Mode — sample data, not saved'}
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => {
                                trackDemoConvertTapped();
                                // Deliberately NOT exitDemo() -- that flips
                                // isDemoMode/user immediately, which wipes
                                // this in-memory guest data (transactions,
                                // etc.) before the signup form even opens.
                                // Navigating straight to the signup form
                                // while staying in guest mode keeps this
                                // data alive so LoginScreen's handleSetup
                                // can capture and carry it into the new
                                // account -- see setupAccount's guestData
                                // handling for how it survives the switch.
                                navigate('login', { mode: 'owner-setup' });
                            }}
                            style={styles.demoBannerBtn}
                        >
                            <Text style={styles.demoBannerBtnText}>Create Account →</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Business Health and Vital Signs sit side by side on a wide
                    desktop viewport (isWideDashboard) instead of stacking --
                    the two most-glanced-at cards on this screen, similar
                    height, a natural pairing. Below the 1000px breakpoint
                    this row/col wrapping is unstyled (no flexDirection set),
                    so mobile stacking is completely unchanged from before. */}
                {canViewFinancials && <CelebrationBanner celebration={celebration} />}

                <View style={isWideDashboard && styles.dashboardRow}>
                {/* BUSINESS HEALTH -- the single "how is my business doing"
                    answer, using the same canonical computeRiskScore the
                    Scoreboard screen shows, placed at the very top of the
                    Dashboard (above Vital Signs and everything else) since
                    it's the first thing an owner wants on opening the app.
                    Tapping through goes to the full breakdown. */}
                {canViewFinancials && (
                    <View style={[styles.operationsSection, isWideDashboard && styles.dashboardCol]}>
                      <Text style={styles.operationsSectionTitle}>🩺 BUSINESS HEALTH</Text>
                      <TouchableOpacity
                        style={[styles.healthScoreCard, { borderColor: healthBandMeta.color }]}
                        activeOpacity={0.85}
                        onPress={() => setCurrentScreen('scoreboard')}
                      >
                        <View style={styles.healthScoreRow}>
                            <Text style={[styles.healthScoreValue, { color: healthBandMeta.color }]}>{Math.round(businessHealth.score)}</Text>
                            <View style={[styles.healthBandBadge, { backgroundColor: healthBandMeta.color + '22' }]}>
                                <Text style={[styles.healthBandBadgeText, { color: healthBandMeta.color }]}>
                                    {healthBandMeta.emoji} {healthBandMeta.label} · {businessHealth.grade}
                                </Text>
                            </View>
                        </View>
                        <View style={styles.healthFactorsRow}>
                            {businessHealth.factors.map(f => (
                                <View key={f.name} style={styles.healthFactorChip}>
                                    <View style={[styles.healthFactorDot, { backgroundColor: HEALTH_FACTOR_STATUS_COLOR[f.status] }]} />
                                    <Text style={styles.healthFactorChipText}>{f.name}</Text>
                                </View>
                            ))}
                        </View>
                        <TouchableOpacity
                            style={styles.healthWhyBtn}
                            onPress={(e) => { e.stopPropagation(); setHealthWhyOpen(o => !o); }}
                        >
                            <Icon name="help-circle" size={12} color={Colors.textMuted} />
                            <Text style={styles.healthWhyBtnText}>Why? What is this built on?</Text>
                            <Icon name={healthWhyOpen ? 'chevron-up' : 'chevron-down'} size={12} color={Colors.textMuted} />
                        </TouchableOpacity>

                        {healthWhyOpen && (
                            <TouchableOpacity style={styles.healthWhyBox} activeOpacity={1} onPress={(e) => e.stopPropagation()}>
                                <Text style={styles.healthWhyLabel}>Definition</Text>
                                <Text style={styles.healthWhyText}>{healthIntelligence.definition}</Text>

                                <Text style={styles.healthWhyLabel}>Data confidence</Text>
                                <Text style={styles.healthWhyText}>{healthIntelligence.dataQuality.summary}</Text>
                                {healthIntelligence.builtOn.map((line, i) => (
                                    <Text key={i} style={styles.healthWhyBullet}>• {line}</Text>
                                ))}

                                <Text style={styles.healthWhyLabel}>Trigger</Text>
                                <Text style={[styles.healthWhyText, { color: Colors.warning, fontWeight: '700' }]}>⚠️ {healthIntelligence.trigger}</Text>
                            </TouchableOpacity>
                        )}

                        <Text style={styles.healthLinkText}>See full breakdown & trend →</Text>
                      </TouchableOpacity>
                    </View>
                )}

                {/* ══════════════════════════════════════════════════════════════════
                    ⚙️ OPERATIONS COMMAND CENTRE
                    ══════════════════════════════════════════════════════════════════ */}

                {/* SECTION 1: VITAL SIGNS - Critical metrics at a glance
                    Cash balance and profit are exactly the financial
                    performance a staff account shouldn't see — hidden for
                    'staff', unchanged for 'owner'/'accountant'. */}
                {canViewFinancials && (
                <View style={[styles.operationsSection, isWideDashboard && styles.dashboardCol]}>
                  <View style={styles.sectionTitleRow}>
                    <Icon name="activity" size={13} color={Colors.textMuted} />
                    <Text style={styles.operationsSectionTitle}>Vital Signs</Text>
                  </View>

                  {/* Cash Position Card - Most Important */}
                  <View style={styles.vitalCard}>
                    <View style={styles.vitalCardTop}>
                      <View style={styles.vitalMetric}>
                        <Text style={styles.vitalLabel}>Cash in Hand</Text>
                        <Text style={styles.vitalValue}>{currency}{Math.round(finance.cashBalance).toLocaleString()}</Text>
                        <Text style={styles.vitalSubtext}>+{currency}{Math.round(totalCash).toLocaleString()} in pockets</Text>
                      </View>
                      <RadialGauge
                        displayValue={runwayDays === null ? '∞' : String(runwayDays)}
                        label="days"
                        progress={runwayDays === null ? 1 : runwayDays / 90}
                        color={runwayColor}
                        size={64}
                        strokeWidth={6}
                      />
                    </View>
                    {cashTrend.length >= 2 && (
                      <View style={styles.cashTrendWrap}>
                        <TrendSparkline data={cashTrend} color={Colors.primary} height={44} />
                        <Text style={styles.cashTrendCaption}>Cash, last 30 days</Text>
                      </View>
                    )}
                    <View style={styles.vitalDivider} />
                    <View style={styles.vitalCardBottom}>
                      <View style={styles.vitalMetric}>
                        <Text style={styles.vitalLabel}>Today's Profit</Text>
                        <Text style={[styles.vitalValue, { color: todayProfit >= 0 ? Colors.income : Colors.expense }]}>
                          {todayProfit >= 0 ? '+' : ''}{currency}{Math.round(todayProfit).toLocaleString()}
                        </Text>
                      </View>
                      <View style={styles.vitalMetric}>
                        <Text style={styles.vitalLabel}>This Month</Text>
                        <Text style={[styles.vitalValue, { color: thisMonthProfit >= 0 ? Colors.income : Colors.expense }]}>
                          {thisMonthProfit >= 0 ? '+' : ''}{currency}{Math.round(thisMonthProfit).toLocaleString()}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
                )}
                </View>

                {/* MacroShield — most tools only show what already happened;
                    this is the forward-looking layer right below the Cash
                    in Hand / runway numbers above: drag an inflation or FX
                    -devaluation shock and see exactly which month it would
                    put cash below zero. See macroShield.ts. */}
                {canViewFinancials && (
                  <MacroShieldSimulator
                    currency={currency}
                    transactions={transactions}
                    loans={loans}
                    finance={finance}
                    staff={staff}
                    minReserve={parseFloat(settings?.minReserve || '') || DEFAULT_THRESHOLDS.lowCashThreshold}
                    macroAssumptions={settings?.macroAssumptions ?? []}
                    onAddMacroAssumption={() => setCurrentScreen('macro-assumptions')}
                    onSeeFullImpact={(shock) => navigate('macroshield-detail', {
                        macroShieldInflationPct: shock.inflationPct,
                        macroShieldFxDevaluationPct: shock.fxDevaluationPct,
                        macroShieldRevenueImpactPct: shock.revenueImpactPct,
                    })}
                  />
                )}

                {/* WHAT QUAD360 SEES — the plain-language "what does this
                    mean" that Vital Signs' raw numbers above don't answer on
                    their own. Reuses diagnosisForNextGoal's own
                    narrativeSummary (already computed above for the goal-
                    celebration flow) rather than a second engine call — same
                    fixed-template synthesis, no LLM. Held to the same
                    >=5-transaction gate as that diagnosis so a near-empty
                    account doesn't get a guessed narrative. */}
                {canViewFinancials && diagnosisForNextGoal && (
                  <TouchableOpacity style={styles.narrativeCard} onPress={() => setCurrentScreen('financial-assessment')} activeOpacity={0.85}>
                    <Text style={styles.narrativeEyebrow}>WHAT QUAD360 SEES</Text>
                    <Text style={styles.narrativeText}>{diagnosisForNextGoal.narrativeSummary}</Text>
                    <NextStepLink text="Full diagnosis & what to do about it →" onPress={() => setCurrentScreen('financial-assessment')} />
                  </TouchableOpacity>
                )}

                {personalSpending.flaggedCount > 0 && (
                  <TouchableOpacity
                    style={styles.personalSpendingBanner}
                    onPress={() => navigate('transactions', { filter: 'personal' })}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.personalSpendingBannerTitle}>⚠️ Mixed Personal & Business Spending</Text>
                    <Text style={styles.personalSpendingBannerText}>{personalSpending.summary}</Text>
                  </TouchableOpacity>
                )}

                {/* "Your Progress" — the change that already happened, not
                    just where things stand today. Reuses the same
                    readiness-history trend the Scoreboard's health-score
                    card and Credit-Worthiness's "Readiness Over Time" both
                    show in full; this is a one-line summary that links to
                    the Scoreboard (the everyday "how am I doing" home for
                    this data — Credit-Worthiness stays reachable from there
                    for the full factor-level breakdown). Hidden entirely in
                    demo mode (snapshots never persist there, so there's
                    nothing honest to show) and for staff accounts (same
                    financial-visibility gate as Vital Signs). */}
                {canViewFinancials && !isDemoMode && (
                  <TouchableOpacity
                    style={[
                      styles.progressCard,
                      { borderColor: readinessDelta?.trend === 'improving' ? Colors.income : readinessDelta?.trend === 'declining' ? Colors.expense : Colors.border },
                    ]}
                    onPress={() => setCurrentScreen('scoreboard')}
                    activeOpacity={0.8}
                  >
                    <Icon
                      name={!readinessDelta ? 'activity' : readinessDelta.trend === 'improving' ? 'trending-up' : readinessDelta.trend === 'declining' ? 'trending-down' : 'minus'}
                      size={16}
                      color={!readinessDelta ? healthBandMeta.color : readinessDelta?.trend === 'improving' ? Colors.income : readinessDelta?.trend === 'declining' ? Colors.expense : Colors.textMuted}
                    />
                    <Text style={styles.progressCardText}>
                      {!readinessDelta ? (
                        <>Your Business Health is <Text style={{ color: healthBandMeta.color, fontWeight: '800' }}>{Math.round(businessHealth.score)}/100 ({healthBandMeta.label})</Text> — trend builds up after a week of data.</>
                      ) : readinessDelta.trend === 'improving' ? (
                        <>Your readiness improved <Text style={{ color: Colors.income, fontWeight: '800' }}>{readinessDelta.scoreDelta} points</Text> over {readinessDelta.periodLabel}{readinessTopMover ? ` — ${readinessTopMover.name} is the biggest driver.` : '.'}</>
                      ) : readinessDelta.trend === 'declining' ? (
                        <>Your readiness dropped <Text style={{ color: Colors.expense, fontWeight: '800' }}>{Math.abs(readinessDelta.scoreDelta)} points</Text> over {readinessDelta.periodLabel}{readinessTopMover ? ` — ${readinessTopMover.name} needs attention.` : '.'}</>
                      ) : (
                        <>Your readiness has held steady over {readinessDelta.periodLabel}.</>
                      )}
                    </Text>
                    <Icon name="chevron-right" size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                )}

                {/* Achievement -> next goal: a business never permanently
                    "arrives" at financial health, so a completed goal ends
                    with a proposed next one instead of just sitting achieved.
                    nextGoalType is sourced from the same diagnosis engine's
                    highest-impact unresolved issue (never a made-up target),
                    and Set This Goal reuses the exact same goalDefaults/
                    buildNewGoal path the manual "add goal" flow uses. */}
                {canViewFinancials && goalToCelebrate && (
                  <View style={styles.celebrationCard}>
                    <View style={styles.celebrationHeaderRow}>
                      <Icon name="award" size={18} color={Colors.income} />
                      <Text style={styles.celebrationTitle}>Goal Achieved — {goalToCelebrate.title}</Text>
                    </View>
                    <Text style={styles.celebrationSubtitle}>
                      {nextGoalType && nextGoalPreview
                        ? `Nice work! Ready for what's next? Recommended: ${nextGoalPreview.title}`
                        : 'Nice work! Keep it up — explore new goals whenever you\'re ready.'}
                    </Text>
                    <View style={styles.celebrationActions}>
                      {nextGoalType && nextGoalPreview && (
                        <TouchableOpacity style={styles.celebrationPrimaryBtn} onPress={handleSetNextGoal} activeOpacity={0.85}>
                          <Text style={styles.celebrationPrimaryBtnText}>Set This Goal</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={styles.celebrationSecondaryBtn} onPress={handleDismissCelebration} activeOpacity={0.7}>
                        <Text style={styles.celebrationSecondaryBtnText}>Not Now</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* This Month's Mission -- one focused target pulled from
                    the priority list below, not a second computation. The
                    baseline is a real snapshot taken once (monthlyMission.ts);
                    progress is that same real number moving, never guessed.
                    Clearing it early rolls straight into the next one, same
                    "achieved -> what's next" loop as the goal-celebration
                    card above. */}
                {canViewFinancials && monthlyMission && (
                  <TouchableOpacity
                    style={styles.missionCard}
                    onPress={() => setCurrentScreen(PRIORITY_KIND_META[monthlyMission.kind]?.screen ?? 'transactions')}
                    activeOpacity={0.85}
                  >
                    <View style={styles.sectionTitleRow}>
                      <Icon name="target" size={13} color={Colors.textMuted} />
                      <Text style={styles.operationsSectionTitle}>This Month's Mission</Text>
                    </View>
                    <Text style={styles.missionTitle}>{monthlyMission.title}</Text>
                    <View style={styles.missionBarTrack}>
                      <View style={[styles.missionBarFill, { width: `${monthlyMission.progressPct}%` }]} />
                    </View>
                    <View style={styles.missionStatsRow}>
                      <Text style={styles.missionStat}>
                        {Math.round(monthlyMission.progressPct)}% cleared
                      </Text>
                      <Text style={styles.missionStat}>
                        {(settings?.currency ?? '₦')}{Math.round(monthlyMission.currentAmount).toLocaleString()} left of {(settings?.currency ?? '₦')}{Math.round(monthlyMission.baselineAmount).toLocaleString()}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}

                {/* This whole priorities block (top priorities, the "all
                    clear" fallback, and "what else needs attention") is
                    built from cash balance, loans, budgets, assets, and
                    goals -- exactly the P&L/cash-balance/loan detail
                    canViewFinancials exists to keep from a 'staff' role.
                    Every other financially-derived section on this screen
                    is already gated the same way; this one was missed. */}
                {canViewFinancials && (
                <>
                {/* YOUR TOP PRIORITIES — up to 3 numbered items from the
                    same real, already-sorted priority list (attention tier
                    first, real dollar-impact descending). A short, finite
                    list with impact framing on each line, instead of a
                    single hero item plus an open-ended list to keep
                    scrolling through. Nothing new is computed here. */}
                {priorities.length > 0 && (
                  <View style={styles.topPrioritiesCard}>
                    <Text style={styles.topPrioritiesEyebrow}>👉 START HERE — YOUR TOP PRIORIT{priorities.length > 1 ? 'IES' : 'Y'}</Text>
                    {priorities.slice(0, TOP_PRIORITY_COUNT).map((item, i, arr) => {
                      const kindMeta = PRIORITY_KIND_META[item.kind];
                      const tierMeta = PRIORITY_TIER_META[item.tier];
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={[styles.topPriorityRow, i < arr.length - 1 && styles.topPriorityRowBorder]}
                          onPress={() => setCurrentScreen(kindMeta.screen)}
                          activeOpacity={0.75}
                        >
                          <Text style={styles.topPriorityNumber}>{NUMBER_EMOJI[i]}</Text>
                          <View style={[styles.priorityIconBadge, { backgroundColor: tierMeta.color + '22' }]}>
                            <Icon name={kindMeta.icon} size={16} color={tierMeta.color} />
                          </View>
                          <View style={styles.priorityContent}>
                            <Text style={styles.priorityTitle}>{item.title}</Text>
                            <Text style={styles.priorityAmount}>{item.subtitle}</Text>
                          </View>
                          <Icon name="chevron-right" size={18} color={Colors.textMuted} />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {/* Empty state -- no alert-engine priority is currently
                    active, but that doesn't mean nothing is worth saying.
                    computeOneThingInsight checks a real signal the priority
                    list doesn't cover at all (margin vs. target), so this
                    slot shows that instead of a generic "all clear" filler
                    whenever there's something more specific and true to say. */}
                {priorities.length === 0 && (() => {
                  const insight = computeOneThingInsight(finance, settings);
                  const isHealthy = insight.severity === 'healthy';
                  const insightColor = insight.severity === 'critical' ? Colors.expense : insight.severity === 'warning' ? Colors.warning : Colors.success;
                  return (
                    <View style={styles.nextActionCard}>
                      <View style={styles.nextActionRow}>
                        <View style={[styles.priorityIconBadge, { backgroundColor: insightColor + '22' }]}>
                          <Icon name={isHealthy ? 'check' : insight.severity === 'critical' ? 'alert-circle' : 'alert-triangle'} size={16} color={insightColor} />
                        </View>
                        <View style={styles.priorityContent}>
                          <Text style={styles.nextActionTitle}>{isHealthy ? 'All Clear for Today' : insight.title}</Text>
                          <Text style={styles.priorityAmount}>{insight.action}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })()}

                {/* SECTION 2: WHAT NEEDS YOUR ATTENTION — every risk/
                    opportunity signal beyond the top 3 already shown above,
                    collapsed by default so the dashboard doesn't default to
                    a full list on top of the top-priorities card. */}
                {priorities.length > TOP_PRIORITY_COUNT && (
                  <View style={styles.operationsSection}>
                    <TouchableOpacity style={styles.sectionTitleRow} onPress={() => setShowAllPriorities(v => !v)} activeOpacity={0.7}>
                      <Icon name="check-square" size={13} color={Colors.textMuted} />
                      <Text style={styles.operationsSectionTitle}>What Else Needs Your Attention ({priorities.length - TOP_PRIORITY_COUNT})</Text>
                      <Icon name={showAllPriorities ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
                    </TouchableOpacity>

                    {showAllPriorities && PRIORITY_TIER_ORDER.map(tier => {
                      const tierItems = priorities.slice(TOP_PRIORITY_COUNT).filter(p => p.tier === tier);
                      if (tierItems.length === 0) return null;
                      const tierMeta = PRIORITY_TIER_META[tier];
                      return (
                        <View key={tier} style={styles.priorityTierGroup}>
                          <Text style={[styles.priorityTierLabel, { color: tierMeta.color }]}>{tierMeta.emoji} {tierMeta.label}</Text>
                          {tierItems.map(item => {
                            const kindMeta = PRIORITY_KIND_META[item.kind];
                            return (
                              <TouchableOpacity
                                key={item.id}
                                style={[styles.priorityCard, tierMeta.tinted && { borderLeftColor: tierMeta.color, backgroundColor: tierMeta.color + '08' }]}
                                onPress={() => setCurrentScreen(kindMeta.screen)}
                              >
                                <View style={[styles.priorityIconBadge, { backgroundColor: tierMeta.color + '22' }]}>
                                  <Icon name={kindMeta.icon} size={16} color={tierMeta.color} />
                                </View>
                                <View style={styles.priorityContent}>
                                  <Text style={styles.priorityTitle}>{item.title}</Text>
                                  <Text style={styles.priorityAmount}>{item.subtitle}</Text>
                                </View>
                                <Icon name="chevron-right" size={18} color={Colors.textMuted} />
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      );
                    })}
                  </View>
                )}
                </>
                )}

                {/* IF YOU NEED CAPITAL — an ambient answer to "how much
                    could my business realistically borrow", not just a
                    marketplace listing to browse. Reuses financingCapacity
                    (computeLendingCapacityEstimate — the exact same estimate
                    Credit-Worthiness and the Financing Marketplace already
                    show) so this is visible without going looking for
                    financing first. Hidden below 'not-yet-bankable' since a
                    ₦0–₦0 range with no encouraging framing isn't worth a
                    dashboard card -- CreditWorthinessScreen is still the
                    place that explains what to fix. */}
                {canViewFinancials && financingCapacity && financingCapacity.tier !== 'not-yet-bankable' && (
                  <TouchableOpacity
                    style={styles.capacityCard}
                    onPress={() => setCurrentScreen('financing-marketplace')}
                    activeOpacity={0.85}
                  >
                    <View style={styles.sectionTitleRow}>
                      <Icon name="briefcase" size={13} color={Colors.textMuted} />
                      <Text style={styles.operationsSectionTitle}>If You Need Capital</Text>
                    </View>
                    <Text style={styles.capacityAmount}>
                      {currency}{Math.round(financingCapacity.minAmount).toLocaleString()}–{currency}{Math.round(financingCapacity.maxAmount).toLocaleString()}
                    </Text>
                    <Text style={styles.capacitySubtext}>
                      Estimated financing capacity ({financingCapacity.tierLabel.toLowerCase()}) based on your current financial performance — see matched options →
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Risk Radar -- what could stop growth, not what needs
                    action today. This used to render the full category-chip
                    breakdown here AND on the Scoreboard, with two different
                    destinations (this card went straight to CFO > Risk,
                    bypassing Scoreboard entirely) -- the exact duplication
                    "Your Progress" above was already written to avoid. Now
                    it's the same one-line teaser pattern: a single summary
                    line linking to the Scoreboard, which is the one place
                    the full category breakdown lives; Scoreboard's own Risk
                    Radar card still links onward to CFO > Risk for detail. */}
                {canViewFinancials && (
                <TouchableOpacity
                  style={styles.riskRadarCard}
                  onPress={() => setCurrentScreen('scoreboard')}
                  activeOpacity={0.85}
                >
                  <View style={styles.sectionTitleRow}>
                    <Icon name="radio" size={13} color={Colors.textMuted} />
                    <Text style={styles.operationsSectionTitle}>Risk Radar</Text>
                    <View style={[styles.riskOverallBadge, { backgroundColor: RISK_LEVEL_META[riskRadar.overallLevel].color + '22' }]}>
                      <Text style={[styles.riskOverallBadgeText, { color: RISK_LEVEL_META[riskRadar.overallLevel].color }]}>
                        {riskRadar.overallLevel === 'high' ? 'High' : riskRadar.overallLevel === 'medium' ? 'Moderate' : 'Low'}
                      </Text>
                    </View>
                  </View>
                  {riskRadar.topRisks.length > 0 ? (
                    <Text style={styles.riskRadarSummary}>
                      <Text style={{ fontWeight: '700', color: Colors.textPrimary }}>Biggest risk: </Text>
                      {riskRadar.topRisks[0].summary} — see the full breakdown on your Scoreboard →
                    </Text>
                  ) : (
                    <Text style={styles.riskRadarSummary}>Nothing standing out right now — a good window to focus on growth. See your Scoreboard →</Text>
                  )}
                </TouchableOpacity>
                )}

                {/* SECTION 3: KEY METRICS - Monthly snapshot */}
                {canViewFinancials && (
                <View style={styles.operationsSection}>
                  <View style={styles.sectionTitleRow}>
                    <Icon name="bar-chart-2" size={13} color={Colors.textMuted} />
                    <Text style={styles.operationsSectionTitle}>Monthly Snapshot</Text>
                  </View>
                  <View style={styles.metricsGrid}>
                    <StatTile icon="trending-up" iconColor={Colors.income} label="Total Revenue" value={`${currency}${Math.round(finance.income).toLocaleString()}`} />
                    <StatTile icon="trending-down" iconColor={Colors.expense} label="Total Expenses" value={`${currency}${Math.round(finance.expense).toLocaleString()}`} />
                  </View>
                  <View style={styles.metricsGrid}>
                    <StatTile
                        icon="percent"
                        iconColor={finance.profit > 0 ? Colors.income : Colors.expense}
                        label="Profit Margin"
                        value={`${finance.income > 0 ? ((finance.profit / finance.income) * 100).toFixed(1) : 0}%`}
                        valueColor={finance.profit > 0 ? Colors.income : Colors.expense}
                    />
                    <StatTile icon="file-text" iconColor={Colors.primary} label="Pending Invoices" value={String(invoices.filter(i => i.status !== 'paid').length)} />
                  </View>
                </View>
                )}

                {/* SECTION 4: QUICK ACTIONS - One-tap operations.
                    Log Sales/Send Invoice/Record Expense removed -- the
                    floating + button (openFab) and the Invoices tab already
                    cover those, so this section is just the one action that
                    had no other easy entry point. */}
                {canViewFinancials && (
                <View style={styles.operationsSection}>
                  <Text style={styles.operationsSectionTitle}>⚡ QUICK ACTIONS</Text>
                  <View style={styles.actionsGrid}>
                    <TouchableOpacity style={[styles.actionCard, styles.actionCardFull]} activeOpacity={0.7} onPress={() => setCurrentScreen('import-transactions')}>
                      <Text style={styles.actionEmoji}>🏦</Text>
                      <Text style={styles.actionLabel}>Import Bank Statement</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                )}

                {/* SECTION 4B: AI FINANCIAL ENGINE - Assessment & Action Planning
                    Every destination here (diagnosis, weekly priorities, goal
                    tracking) is a financial-performance view — not shown to staff. */}
                {canViewFinancials && (
                <View style={styles.operationsSection}>
                  <Text style={styles.operationsSectionTitle}>🤖 AI Financial Engine</Text>
                  <View style={styles.engineCardsGrid}>
                    <TouchableOpacity
                      style={styles.engineCard}
                      onPress={() => setCurrentScreen('financial-assessment')}
                    >
                      <Text style={styles.engineEmoji}>🔍</Text>
                      <Text style={styles.engineTitle}>{'Financial\nAssessment'}</Text>
                      <Text style={styles.engineSubtext}>Diagnose issues</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.engineCard}
                      onPress={() => setCurrentScreen('action-tracker')}
                    >
                      <Text style={styles.engineEmoji}>⚡</Text>
                      <Text style={styles.engineTitle}>Action<br/>Tracker</Text>
                      <Text style={styles.engineSubtext}>Prioritized tactics</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.engineCard}
                      onPress={() => setCurrentScreen('goals')}
                    >
                      <Text style={styles.engineEmoji}>🌉</Text>
                      <Text style={styles.engineTitle}>Goal<br/>Bridge</Text>
                      <Text style={styles.engineSubtext}>Connect to goals</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity style={[styles.btn, { marginTop: 10 }]} onPress={() => setShowWeeklyReport(true)}>
                    <Text style={styles.btnText}>🗓️ Weekly Dashboard — Wins, Problems & Priorities</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btn, { marginTop: 10 }]} onPress={() => setShowMonthlyReview(true)}>
                    <Text style={styles.btnText}>📊 Monthly Review — Recap & Recommendation</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btn, { marginTop: 10 }]} onPress={() => setShowDailyReport(true)}>
                    <Text style={styles.btnText}>📆 Daily Report — Today's Recap</Text>
                  </TouchableOpacity>
                </View>
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
                    <TouchableOpacity style={styles.alertBanner} onPress={() => navigate('reports', { reportSection: 'customers', reportTab: 'aging' })}>
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
                                // Loan principal isn't a cuttable cost (only interest is) --
                                // excluded so this "biggest cost" callout can't point at a
                                // loan repayment and suggest reducing it, matching finance.profit above.
                                cats[c] = (cats[c] || 0) + (Number(t.amount) || 0) - (t.principalPortion || 0);
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


                {canViewFinancials && (
                <TouchableOpacity style={styles.btn} onPress={() => setCurrentScreen('reports')}>
                    <Text style={styles.btnText}>{t(language, 'viewDetailedReports')}</Text>
                </TouchableOpacity>
                )}

            </ScrollView>

            {/* ── FAB ─────────────────────────────────────────────────────── */}
            <TouchableOpacity style={[styles.fab, { bottom: 80 + (!loggedToday ? logTodayBannerHeight : 0) }]} onPress={() => openFab()}>
                <Text style={styles.fabText}>+</Text>
            </TouchableOpacity>
            <TouchableOpacity
                style={[styles.eodFab, { bottom: 140 + (!loggedToday ? logTodayBannerHeight : 0) }]}
                onPress={() => setEodOpen(true)}
                accessibilityLabel="End of Day quick log"
            >
                <Icon name="moon" size={20} color={Colors.textPrimary} />
            </TouchableOpacity>

            {/* ── Daily log-today banner ───────────────────────────────────── */}
            {!loggedToday && (
                <View style={styles.logTodayBanner} onLayout={e => setLogTodayBannerHeight(e.nativeEvent.layout.height)}>
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
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.modalSheet, constrainSheetWidth && styles.modalSheetWide]}>
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

                    {/* Same fixed-list problem TransactionsScreen's own category
                        picker had -- these chips don't fit every industry (a
                        retailer's "Product Sales", a manufacturer's "Raw
                        Materials"), so a free-text fallback lets any business
                        name its own category instead of silently landing on
                        "Sales"/"Other" whenever nothing here fits. */}
                    <TextInput
                        style={styles.modalInput}
                        placeholder="Or type your own category..."
                        placeholderTextColor={Colors.textMuted}
                        value={qaCategory}
                        onChangeText={setQaCategory}
                    />

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

                    <Text style={styles.catLabel}>Cash or bank? (optional)</Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                        {(['cash', 'bank'] as const).map(m => (
                            <TouchableOpacity
                                key={m}
                                style={[styles.eodPaymentChip, qaPaymentMethod === m && styles.eodPaymentChipActive]}
                                onPress={() => setQaPaymentMethod(prev => prev === m ? undefined : m)}
                            >
                                <Text style={[styles.eodPaymentChipText, qaPaymentMethod === m && styles.eodPaymentChipTextActive]}>
                                    {m === 'cash' ? '💵 Cash' : '🏦 Bank'}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

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
            <WeeklyReportModal
                visible={showWeeklyReport}
                onClose={() => setShowWeeklyReport(false)}
                onEditMission={() => { setShowWeeklyReport(false); setCurrentScreen('settings'); }}
                transactions={transactions}
                invoices={invoices}
                finance={finance}
                loans={loans}
                settings={settings}
            />
            <CashPocketsModal visible={showCashPockets} onClose={() => setShowCashPockets(false)} />
            {/* ── End of Day quick-log modal ───────────────────────────────── */}
            <Modal visible={eodOpen} transparent animationType="slide" onRequestClose={() => setEodOpen(false)}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setEodOpen(false)} />
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.modalSheet, constrainSheetWidth && styles.modalSheetWide]}>
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
                    <Text style={styles.catLabel}>Was this mostly cash or bank? (optional)</Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                        {(['cash', 'bank'] as const).map(m => (
                            <TouchableOpacity
                                key={m}
                                style={[styles.eodPaymentChip, eodPaymentMethod === m && styles.eodPaymentChipActive]}
                                onPress={() => setEodPaymentMethod(prev => prev === m ? undefined : m)}
                            >
                                <Text style={[styles.eodPaymentChipText, eodPaymentMethod === m && styles.eodPaymentChipTextActive]}>
                                    {m === 'cash' ? '💵 Cash' : '🏦 Bank'}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
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
        backgroundColor: Colors.warning, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.lg,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    demoBannerLeft:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
    demoBannerText:    { color: '#fff', fontWeight: '600', fontSize: 13, flex: 1 },
    demoBannerBtn:     { backgroundColor: '#fff', borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 5, marginLeft: 8 },
    demoBannerBtnText: { color: Colors.warning, fontWeight: '700', fontSize: 12 },

    progressCard: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1.5,
        padding: Spacing.md, marginBottom: Spacing.lg,
        ...Shadow.sm,
    },
    progressCardText: { flex: 1, fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },

    narrativeCard: {
        backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1.5,
        borderColor: Colors.primary + '33', padding: Spacing.md, marginBottom: Spacing.lg,
        ...Shadow.sm,
    },
    narrativeEyebrow: { fontSize: 11, fontWeight: '800', color: Colors.primary, letterSpacing: 0.5, marginBottom: 6 },
    narrativeText: { fontSize: 13, color: Colors.textPrimary, lineHeight: 19 },

    capacityCard: {
        backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1,
        borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.lg,
        ...Shadow.sm,
    },
    capacityAmount: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, marginTop: 2, marginBottom: 4 },
    capacitySubtext: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },

    celebrationCard: {
        backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1.5,
        borderColor: Colors.income + '55', padding: Spacing.md, marginBottom: Spacing.lg,
        ...Shadow.sm,
    },
    celebrationHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: 4 },
    celebrationTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, flex: 1 },
    celebrationSubtitle: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18, marginBottom: Spacing.sm },
    celebrationActions: { flexDirection: 'row', gap: Spacing.sm },
    celebrationPrimaryBtn: {
        backgroundColor: Colors.income, borderRadius: Radius.pill,
        paddingVertical: 9, paddingHorizontal: Spacing.md,
    },
    celebrationPrimaryBtnText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
    celebrationSecondaryBtn: {
        paddingVertical: 9, paddingHorizontal: Spacing.md,
        borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.border,
    },
    celebrationSecondaryBtnText: { color: Colors.textSecondary, fontSize: 12.5, fontWeight: '600' },

    riskRadarCard: {
        backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1,
        borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.lg,
        ...Shadow.sm,
    },
    riskOverallBadge: { borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 2, marginLeft: 'auto' },
    riskOverallBadgeText: { fontSize: 11, fontWeight: '800' },
    riskRadarSummary: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },

    missionCard: {
        backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1,
        borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.lg,
        ...Shadow.sm,
    },
    missionTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.sm },
    missionBarTrack: { height: 8, borderRadius: 4, backgroundColor: Colors.bg, overflow: 'hidden', marginBottom: Spacing.xs },
    missionBarFill: { height: 8, borderRadius: 4, backgroundColor: Colors.primary },
    missionStatsRow: { flexDirection: 'row', justifyContent: 'space-between' },
    missionStat: { fontSize: 11.5, color: Colors.textMuted, fontWeight: '600' },

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

    // Fixed dark background (not Colors.surface) on purpose: toastText is
    // always white, and Colors.surface is a light cream on the Warm Paper
    // theme -- reacting to theme here would make the toast illegible on
    // that palette instead of just staying a normal dark toast on both.
    toast:     { position: 'absolute', bottom: 140, left: 20, right: 20, backgroundColor: '#1a1a2e', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 10 },
    toastText: { color: '#fff', fontSize: 13, fontWeight: '600', textAlign: 'center' },

    syncLabel:  { fontSize: 10, color: Colors.income, marginTop: 8, textAlign: 'center' },
    insightTimestamp: { fontSize: 10, color: Colors.textMuted, marginTop: 6, fontStyle: 'italic' },

    recurringBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(59,130,246,0.1)', borderWidth: 1, borderColor: Colors.primary, borderRadius: 10, padding: 12, marginBottom: 10, gap: 8 },
    recurringIcon:   { fontSize: 16 },
    recurringText:   { flex: 1, fontSize: 12, color: Colors.primary, fontWeight: '600' },
    recurringArrow:  { fontSize: 18, color: Colors.primary },

    // Was a wide "🌙 End of Day" text pill -- fine in isolation, but as a
    // permanently fixed-position overlay (not scrolled with content, see the
    // FAB comment above) its full width regularly landed on top of card
    // numbers and narrative text as the page scrolled underneath it (e.g.
    // covering "This Month" and "Pending Invoices" figures, and cutting into
    // the "What Quad360 Sees" sentence). Shrunk to a round icon-only button,
    // matching the "+" FAB's footprint, so it can only ever obscure a small
    // corner instead of a run of text.
    eodFab:     { position: 'absolute', right: 20, bottom: 140, width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 5 },

    searchTrigger:     { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, marginBottom: Spacing.lg, gap: Spacing.sm, ...Shadow.sm },
    searchTriggerText: { fontSize: 13, color: Colors.textMuted, flex: 1 },

    deltaRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    deltaBadge: { fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    deltaHint:  { fontSize: 11, color: Colors.textMuted },

    insightStale: { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic', marginTop: 4 },

    // ── Operations Command Centre Styles ──
    operationsSection: {
      marginBottom: 20,
    },
    dashboardRow: {
      flexDirection: 'row',
      gap: Spacing.md,
      alignItems: 'flex-start',
    },
    dashboardCol: {
      flex: 1,
      minWidth: 0,
    },
    sectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 12,
    },
    operationsSectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: Colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    healthScoreCard: {
      backgroundColor: Colors.surface,
      borderRadius: Radius.lg,
      borderWidth: 1.5,
      padding: Spacing.lg,
    },
    healthScoreRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      marginBottom: Spacing.md,
    },
    healthScoreValue: {
      fontSize: 36,
      fontWeight: '800',
    },
    healthBandBadge: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: Radius.pill,
    },
    healthBandBadgeText: {
      fontSize: 12,
      fontWeight: '800',
    },
    healthFactorsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: Spacing.sm,
    },
    healthFactorChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: Colors.bg,
      borderRadius: Radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    healthFactorDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
    healthFactorChipText: {
      fontSize: 10.5,
      fontWeight: '600',
      color: Colors.textSecondary,
    },
    healthLinkText: {
      fontSize: 12.5,
      color: Colors.primary,
      fontWeight: '700',
    },
    healthWhyBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      alignSelf: 'flex-start', marginTop: 8, marginBottom: 4,
    },
    healthWhyBtnText: { fontSize: 11.5, fontWeight: '600', color: Colors.textMuted },
    healthWhyBox: {
      backgroundColor: Colors.bg, borderRadius: Radius.md, padding: Spacing.md,
      marginBottom: Spacing.sm, gap: 2,
    },
    healthWhyLabel: {
      fontSize: 10, fontWeight: '700', color: Colors.textMuted,
      textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 8,
    },
    healthWhyText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
    healthWhyBullet: { fontSize: 11, color: Colors.textMuted, lineHeight: 16, marginTop: 2 },
    vitalCard: {
      backgroundColor: Colors.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: Colors.primary + '33',
      overflow: 'hidden',
      ...Shadow.sm,
    },
    vitalCardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      backgroundColor: Colors.primary + '08',
    },
    vitalCardBottom: {
      flexDirection: 'row',
      padding: 16,
      gap: 12,
    },
    vitalMetric: {
      flex: 1,
    },
    vitalLabel: {
      fontSize: 11,
      color: Colors.textMuted,
      fontWeight: '600',
      marginBottom: 4,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    vitalValue: {
      fontSize: 22,
      fontWeight: '800',
      color: Colors.textPrimary,
      marginBottom: 2,
    },
    vitalSubtext: {
      fontSize: 10,
      color: Colors.textSecondary,
    },
    cashTrendWrap: {
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 12,
      backgroundColor: Colors.primary + '08',
    },
    cashTrendCaption: {
      fontSize: 10,
      color: Colors.textMuted,
      fontWeight: '600',
      marginTop: 2,
    },
    vitalDivider: {
      height: 1,
      backgroundColor: Colors.border,
    },

    personalSpendingBanner: {
      backgroundColor: Colors.warning + '18',
      borderWidth: 1,
      borderColor: Colors.warning,
      borderRadius: Radius.md,
      padding: Spacing.md,
      marginHorizontal: Spacing.lg,
      marginBottom: Spacing.lg,
    },
    personalSpendingBannerTitle: { fontSize: 13.5, fontWeight: '700', color: Colors.textPrimary, marginBottom: 3 },
    personalSpendingBannerText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },

    nextActionCard: {
      backgroundColor: Colors.surface,
      borderRadius: Radius.lg,
      padding: Spacing.lg,
      marginBottom: Spacing.md,
      borderWidth: 1.5,
      borderColor: Colors.primary,
      ...Shadow.sm,
    },
    topPrioritiesCard: {
      backgroundColor: Colors.surface,
      borderRadius: Radius.lg,
      padding: Spacing.lg,
      marginBottom: Spacing.md,
      borderWidth: 1.5,
      borderColor: Colors.primary,
      ...Shadow.sm,
    },
    topPrioritiesEyebrow: {
      fontSize: 10.5,
      fontWeight: '800',
      color: Colors.primary,
      letterSpacing: 0.8,
      marginBottom: Spacing.sm,
    },
    topPriorityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingVertical: Spacing.sm,
    },
    topPriorityRowBorder: {
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    topPriorityNumber: {
      fontSize: 15,
    },
    nextActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
    },
    nextActionTitle: {
      fontSize: 14.5,
      fontWeight: '800',
      color: Colors.textPrimary,
      marginBottom: 2,
    },

    priorityTierGroup: {
      marginBottom: Spacing.sm,
    },
    priorityTierLabel: {
      fontSize: 11,
      fontWeight: '700',
      marginBottom: 6,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    priorityCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Colors.surface,
      borderRadius: Radius.lg,
      padding: Spacing.lg,
      marginBottom: Spacing.sm,
      borderLeftWidth: 4,
      borderLeftColor: Colors.primary,
      gap: Spacing.md,
      ...Shadow.sm,
    },
    priorityCardAlert: {
      borderLeftColor: Colors.expense,
      backgroundColor: Colors.expense + '08',
    },
    priorityCardWarning: {
      borderLeftColor: Colors.warning,
      backgroundColor: Colors.warning + '08',
    },
    priorityIconBadge: {
      width: 34, height: 34, borderRadius: Radius.sm,
      alignItems: 'center', justifyContent: 'center',
    },
    priorityContent: {
      flex: 1,
    },
    priorityTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: Colors.textPrimary,
      marginBottom: 2,
    },
    priorityAmount: {
      fontSize: 11,
      color: Colors.textSecondary,
      fontWeight: '500',
    },

    metricsGrid: {
      flexDirection: 'row',
      gap: Spacing.md,
      marginBottom: Spacing.md,
    },

    actionsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      justifyContent: 'space-between',
    },
    actionCard: {
      width: '48%',
      backgroundColor: Colors.primary + '12',
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: Colors.primary,
    },
    actionCardFull: {
      width: '100%',
    },
    actionEmoji: {
      fontSize: 32,
      marginBottom: 8,
    },
    actionLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: Colors.primary,
      textAlign: 'center',
    },

    engineCardsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      justifyContent: 'space-between',
    },
    engineCard: {
      width: '32%',
      backgroundColor: Colors.primary + '15',
      borderRadius: 14,
      padding: 12,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: Colors.primary,
      gap: 6,
    },
    engineEmoji: {
      fontSize: 32,
    },
    engineTitle: {
      fontSize: 11,
      fontWeight: '700',
      color: Colors.primary,
      textAlign: 'center',
      lineHeight: 14,
    },
    engineSubtext: {
      fontSize: 9,
      color: Colors.textMuted,
      textAlign: 'center',
    },

    importCard: {
      backgroundColor: Colors.warning + '15',
      borderRadius: 14,
      padding: 14,
      marginBottom: 16,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: Colors.warning,
      gap: 12,
    },
    importCardContent: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    importCardEmoji: {
      fontSize: 32,
    },
    importCardText: {
      flex: 1,
    },
    importCardTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: Colors.warning,
      marginBottom: 2,
    },
    importCardSubtitle: {
      fontSize: 10,
      color: Colors.textSecondary,
      lineHeight: 14,
    },
    importCardArrow: {
      fontSize: 16,
      color: Colors.warning,
      fontWeight: '700',
    },

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
    modalSheetWide:   { maxWidth: 480, width: '100%', alignSelf: 'center' },
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
    eodPaymentChip:       { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg, alignItems: 'center' },
    eodPaymentChipActive: { backgroundColor: Colors.primary + '22', borderColor: Colors.primary },
    eodPaymentChipText:       { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
    eodPaymentChipTextActive: { color: Colors.primary },
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
