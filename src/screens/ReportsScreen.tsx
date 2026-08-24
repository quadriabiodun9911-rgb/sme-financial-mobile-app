import React, { useMemo, useState, useEffect } from 'react';
import {
    SafeAreaView, ScrollView, View, Text,
    TouchableOpacity, StyleSheet, Dimensions, Share, TextInput, Platform,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import InfoTip from '../components/InfoTip';
import AgingReport from '../components/AgingReport';
import PeriodComparisonTable from '../components/PeriodComparisonTable';
import BalanceSheetComparisonTable from '../components/BalanceSheetComparisonTable';
import CashFlowComparisonTable from '../components/CashFlowComparisonTable';
import StockSalesComparisonTable from '../components/StockSalesComparisonTable';
import TaxSummary from '../components/TaxSummary';
import TaxFilingReadinessTab from '../components/TaxFilingReadinessTab';
import TaxPlanningTab from '../components/TaxPlanningTab';
import BudgetForecast from '../components/BudgetForecast';
import CashFlowSafety from '../components/CashFlowSafety';
import DebtAnalysis from '../components/DebtAnalysis';
import EnhancedDebtManagement from '../components/EnhancedDebtManagement';
import AssetProductivityAnalysis from '../components/AssetProductivityAnalysis';
import CustomerProfitability from '../components/CustomerProfitability';
import ProductPerformance from '../components/ProductPerformance';
import GrowthMetrics from '../components/GrowthMetrics';
import MultiYearTrends from '../components/MultiYearTrends';
import QualityOfGrowthTab from '../components/QualityOfGrowthTab';
import CostExposureTab from '../components/CostExposureTab';
import PricingOptimizer from '../components/PricingOptimizer';
import NextStepLink from '../components/NextStepLink';
import CashFlowStatement from '../components/CashFlowStatement';
import DataQualityBadge from '../components/DataQualityBadge';
import AccrualCashFlow from '../components/AccrualCashFlow';
import ProfitAndLossStatement from '../components/ProfitAndLossStatement';
import BalanceSheetStatement from '../components/BalanceSheetStatement';
import CashFlowFormalStatement from '../components/CashFlowFormalStatement';
import GroupedBarChart from '../components/GroupedBarChart';
import { computeBalanceSheetTrend } from '../utils/balanceSheetTrend';
import { computeAllTimeMonthlyBuckets } from '../utils/trendAnalysis';
import { filterByPeriod, filterByDateRange, getPreviousPeriodRange, computeFinance, computeAssetCurrentValue, computeMonthlyTrend, computeEnhancedPnL, computeProperCashFlow, computeWorkingCapitalMetrics, classifyBusinessSize, sizeLabel, transactionsToCSV, ReportPeriod, MonthlyPoint, DateRange } from '../utils/finance';
import { trackReportViewed, trackDataExported } from '../utils/analytics';
import { FinanceData } from '../types';
import DateInput from '../components/DateInput';
import { InventoryItem } from '../types';
import { generatePDF, sharePDF } from '../utils/pdfExport';
import { computeInventoryValue } from '../utils/stockVelocity';
import Icon, { IconName } from '../components/ui/Icon';
import { Radius, Shadow, Spacing } from '../theme/tokens';

// ─── Section groups ────────────────────────────────────────────────────────────
type SectionKey = 'statements' | 'customers' | 'tax' | 'planning' | 'growth';

const SECTIONS: { key: SectionKey; label: string; icon: IconName; desc: string }[] = [
    { key: 'statements', label: 'Financial Statements',    icon: 'bar-chart-2', desc: 'Balance Sheet, P&L, Inventory, Cash Flow' },
    { key: 'customers',  label: 'Customers & Collections',  icon: 'dollar-sign', desc: 'Who Owes Me - Unpaid Invoices' },
    { key: 'tax',        label: 'Tax & Compliance',         icon: 'clipboard',   desc: 'Tax Summary and Obligations' },
    { key: 'planning',   label: 'Planning & Forecasts',     icon: 'trending-up', desc: 'Growth Scenarios, Cash Timeline, Loans & Debt' },
    { key: 'growth',     label: 'Growth Analytics',         icon: 'zap',         desc: 'Growth Trends, Best Customers & Products' },
];

type SubTab =
    | 'balancesheet' | 'pnl' | 'inventory' | 'accrual'
    | 'aging'
    | 'tax' | 'tax-filing' | 'tax-planning'
    | 'budget' | 'cashflow' | 'cashsafety' | 'debt' | 'assets'
    | 'growth' | 'history' | 'quality' | 'exposure' | 'customers' | 'products' | 'pricing';

const SECTION_TABS: Record<SectionKey, { key: SubTab; label: string }[]> = {
    statements: [
        { key: 'balancesheet', label: 'What I Own & Owe' },
        { key: 'pnl',          label: 'Profit & Loss' },
        { key: 'cashflow',     label: 'Cash Flow Statement' },
        { key: 'inventory',    label: 'Stock' },
        { key: 'accrual',      label: 'Accrual vs Cash' },
    ],
    customers: [
        { key: 'aging', label: 'Who Owes Me' },
    ],
    tax: [
        { key: 'tax',          label: 'Tax Summary' },
        { key: 'tax-filing',   label: 'Filing Readiness' },
        { key: 'tax-planning', label: 'Tax Planning' },
    ],
    planning: [
        { key: 'budget',      label: 'Growth Scenarios' },
        { key: 'cashsafety',  label: 'Cash Flow & Safety' },
        { key: 'debt',        label: 'Loans & Debt' },
        { key: 'assets',      label: 'Assets' },
    ],
    growth: [
        { key: 'growth',    label: 'Growth Trends' },
        { key: 'history',   label: 'Multi-Year History' },
        { key: 'quality',   label: 'Quality of Growth' },
        { key: 'exposure',  label: 'Cost Exposure' },
        { key: 'customers', label: 'Best Customers' },
        { key: 'products',  label: 'Best Products' },
        { key: 'pricing',   label: 'Pricing Optimization' },
    ],
};

const PERIOD_AWARE: SubTab[] = ['balancesheet', 'pnl', 'aging', 'tax', 'inventory'];

const PERIODS: { key: ReportPeriod; label: string }[] = [
    { key: 'month',   label: 'Monthly' },
    { key: 'quarter', label: 'Quarterly' },
    { key: 'year',    label: 'Yearly' },
    { key: 'all',     label: 'All Time' },
    { key: 'custom',  label: 'Custom' },
];

export default function ReportsScreen() {
    const { finance: allFinance, settings, updateSettings, transactions, assets, loans: loansList, navParams, inventory, invoices, setCurrentScreen, navigate, user, isDemoMode } = useApp();
    const { currency, minReserve, targetMargin } = settings;
    const businessName = user?.businessName || 'Your Business';

    const [showLanding, setShowLanding] = useState(false);
    const [section, setSection]       = useState<SectionKey>('statements');
    const [activeTab, setActiveTab]   = useState<SubTab>('balancesheet');

    // Fires on every tab switch, including the initial default tab, so it's
    // one effect rather than adding a track call to each of the ~20 tab
    // buttons individually.
    useEffect(() => {
        if (!isDemoMode) trackReportViewed(activeTab);
    }, [activeTab, isDemoMode]);
    const [period, setPeriod]         = useState<ReportPeriod>('all');
    const [showComparison, setShowComparison] = useState(false);
    // Formal statement is the default view for everyone, not just when
    // preparing something for a lender — "Show Simple View" switches to the
    // plain-English cards for whoever prefers those instead. P&L has no such
    // toggle anymore: the formal statement is its only view.
    const [showFormalBS, setShowFormalBS]   = useState(true);
    const [showFormalCF, setShowFormalCF]   = useState(true);
    const today = new Date().toISOString().split('T')[0];
    const inventoryValue = useMemo(
        () => computeInventoryValue(inventory),
        [inventory],
    );
    const [customRange, setCustomRange] = useState<DateRange>({ from: today, to: today });

    const filteredTx = useMemo(() => {
        if (period === 'custom') return filterByDateRange(transactions, customRange);
        return filterByPeriod(transactions, period);
    }, [transactions, period, customRange]);
    const activeAssets = useMemo(() => assets.filter((a: any) => a.status === 'active'), [assets]);
    const registeredAssetsValue = useMemo(
        () => activeAssets.reduce((sum: number, a: any) => sum + computeAssetCurrentValue(a), 0),
        [activeAssets],
    );
    const finance = useMemo(
        () => computeFinance(filteredTx, settings, registeredAssetsValue, activeAssets),
        [filteredTx, settings, registeredAssetsValue, activeAssets]
    );
    const trend      = useMemo(() => computeMonthlyTrend(transactions, 6), [transactions]);
    const enhPnL     = useMemo(() => computeEnhancedPnL(filteredTx, assets), [filteredTx, assets]);
    const wcMetrics  = useMemo(() => computeWorkingCapitalMetrics(filteredTx), [filteredTx]);
    // Unfiltered (all-time, "as of today") AR/AP — the Debt tab's leverage
    // ratios describe the business's current balance sheet, not a
    // period-scoped slice, so this must match Reports > "What I Own & Owe"
    // and Credit-Worthiness's Five C's Capital section rather than wcMetrics
    // above (which is intentionally scoped to whatever period is selected).
    const allTimeWcMetrics = useMemo(() => computeWorkingCapitalMetrics(transactions), [transactions]);
    const bizSize    = classifyBusinessSize(enhPnL.revenue);

    const prevFinance = useMemo(() => {
        if (period === 'all' || period === 'custom') return null;
        const { previous } = getPreviousPeriodRange(period);
        const prevTx = filterByDateRange(transactions, previous);
        return computeFinance(prevTx, settings);
    }, [period, transactions, settings]);

    // Shared with BalanceSheetComparisonTable below (same manual-entry
    // fields feeding both) so the formal Balance Sheet statement's figures
    // never drift from what that trend table already shows.
    const manualBalances = useMemo(() => ({
        stockValue: inventoryValue,
        manualEquipment: parseFloat(settings.openingAssets) || 0,
        otherAssets: parseFloat(settings.openingOtherAssets) || 0,
        otherLiabilities: parseFloat(settings.openingLiabilities) || 0,
    }), [inventoryValue, settings.openingAssets, settings.openingOtherAssets, settings.openingLiabilities]);

    // "As of today" snapshot for the formal Balance Sheet -- the most recent
    // monthly point computeBalanceSheetTrend produces, capped at today.
    const balanceSheetPoint = useMemo(() => {
        const monthly = computeAllTimeMonthlyBuckets(transactions);
        const monthKeys = monthly.map(m => m.month);
        const points = computeBalanceSheetTrend('monthly', monthKeys, transactions, assets, loansList, manualBalances);
        return points.length > 0 ? points[points.length - 1] : null;
    }, [transactions, assets, loansList, manualBalances]);

    // Real calendar dates for the selected period, matching filterByPeriod's
    // own rolling-window logic -- a lender reading "For the period" wants an
    // actual date range, not a relative label like "Last 30 days".
    const periodDateLabel = useMemo(() => {
        const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        const todayLabel = fmtDate(today);
        if (period === 'custom') return `For the period ${fmtDate(customRange.from)} – ${fmtDate(customRange.to)}`;
        if (period === 'all') {
            const dates = filteredTx.map(t => t.date).filter(Boolean).sort();
            if (dates.length === 0) return `As of ${todayLabel}`;
            return `For the period ${fmtDate(dates[0])} – ${todayLabel}`;
        }
        const now = new Date();
        const cutoff = new Date(now);
        if (period === 'month') cutoff.setMonth(now.getMonth() - 1);
        else if (period === 'quarter') cutoff.setMonth(now.getMonth() - 3);
        else cutoff.setFullYear(now.getFullYear() - 1);
        return `For the period ${fmtDate(cutoff.toISOString().split('T')[0])} – ${todayLabel}`;
    }, [period, customRange, filteredTx, today]);

    const asOfLabel = useMemo(
        () => `As of ${new Date(today + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`,
        [today]
    );

    // computeProperCashFlow always runs over full history (not the period
    // filter) -- CashFlowStatement.tsx already calls it this way, and the
    // formal version reuses that same figure rather than a second one.
    const properCashFlow = useMemo(() => computeProperCashFlow(transactions, assets), [transactions, assets]);
    const cashFlowSinceLabel = useMemo(() => {
        const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        const dates = transactions.map(t => t.date).filter(Boolean).sort();
        const todayLabel = fmtDate(today);
        if (dates.length === 0) return `As of ${todayLabel}`;
        return `Since records began (${fmtDate(dates[0])}) through ${todayLabel}`;
    }, [transactions, today]);

    // Deep-link from navParams (e.g. from Dashboard or Insights)
    useEffect(() => {
        if (navParams?.reportSection) {
            const s = navParams.reportSection as SectionKey;
            const validSection = SECTIONS.find(sec => sec.key === s);
            if (!validSection) return;
            setSection(s);
            if (navParams.reportTab && SECTION_TABS[s].some((t: { key: SubTab; label: string }) => t.key === navParams.reportTab)) {
                setActiveTab(navParams.reportTab as SubTab);
            } else {
                setActiveTab(SECTION_TABS[s][0].key);
            }
            setShowLanding(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const periodActive = PERIOD_AWARE.includes(activeTab);
    const visibleSections = SECTIONS;

    const handleSectionChange = (s: SectionKey) => {
        const tabs = SECTION_TABS[s] ?? SECTION_TABS.statements;
        setSection(SECTION_TABS[s] ? s : 'statements');
        setActiveTab(tabs[0].key);
    };

    const exportPnL = async () => {
        const csv = transactionsToCSV(filteredTx);
        if (!isDemoMode) trackDataExported();
        if (Platform.OS === 'web') {
            const blob = new Blob([csv], { type: 'text/csv' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href = url; a.download = 'quad360-pnl.csv'; a.click();
            URL.revokeObjectURL(url);
        } else {
            await Share.share({ message: csv, title: 'P&L Export' });
        }
    };

    return (
        <SafeAreaView style={styles.safe}>
            <Header />

            {/* ── Landing page ─────────────────────────────────────── */}
            {showLanding ? (
                <ScrollView style={styles.landingScroll} contentContainerStyle={styles.landingPad}>
                    <Text style={styles.landingTitle}>Reports</Text>
                    <Text style={styles.landingSub}>Tap any report to open it</Text>

                    {/* ── MONEY Section ───────────────────────────────────── */}
                    <View style={styles.sectionTitleRow}>
                        <Icon name="dollar-sign" size={13} color={Colors.textMuted} />
                        <Text style={styles.reportGroupHeader}>MONEY</Text>
                    </View>
                    {[
                        { icon: 'bar-chart-2' as IconName, label: 'Profit & Loss', sub: 'Did I make money? Revenue vs costs breakdown', section: 'statements' as SectionKey, tab: 'pnl' as SubTab },
                        { icon: 'droplet' as IconName, label: 'Cash Flow', sub: 'Money coming in and going out over time', section: 'statements' as SectionKey, tab: 'cashflow' as SubTab },
                    ].map(item => (
                        <TouchableOpacity
                            key={item.tab}
                            style={styles.landingCard}
                            onPress={() => {
                                setSection(item.section);
                                setActiveTab(item.tab);
                                setShowLanding(false);
                            }}
                        >
                            <View style={styles.landingCardIconBadge}>
                                <Icon name={item.icon} size={18} color={Colors.primary} />
                            </View>
                            <View style={styles.landingCardText}>
                                <Text style={styles.landingCardLabel}>{item.label}</Text>
                                <Text style={styles.landingCardSub}>{item.sub}</Text>
                            </View>
                            <Icon name="chevron-right" size={18} color={Colors.textMuted} />
                        </TouchableOpacity>
                    ))}

                    {/* ── CUSTOMERS Section ───────────────────────────────── */}
                    <View style={styles.sectionTitleRow}>
                        <Icon name="users" size={13} color={Colors.textMuted} />
                        <Text style={styles.reportGroupHeader}>CUSTOMERS</Text>
                    </View>
                    {[
                        { icon: 'dollar-sign' as IconName, label: 'Who Owes Me', sub: 'Unpaid invoices and overdue payments', section: 'customers' as SectionKey, tab: 'aging' as SubTab },
                        { icon: 'file-text' as IconName, label: 'Invoices', sub: 'View all sent invoices and collection status', section: 'customers' as SectionKey, tab: 'aging' as SubTab },
                    ].map(item => (
                        <TouchableOpacity
                            key={item.tab + item.label}
                            style={styles.landingCard}
                            onPress={() => {
                                setSection(item.section);
                                setActiveTab(item.tab);
                                setShowLanding(false);
                            }}
                        >
                            <View style={styles.landingCardIconBadge}>
                                <Icon name={item.icon} size={18} color={Colors.primary} />
                            </View>
                            <View style={styles.landingCardText}>
                                <Text style={styles.landingCardLabel}>{item.label}</Text>
                                <Text style={styles.landingCardSub}>{item.sub}</Text>
                            </View>
                            <Icon name="chevron-right" size={18} color={Colors.textMuted} />
                        </TouchableOpacity>
                    ))}

                    {/* ── BUSINESS Section ────────────────────────────────── */}
                    <View style={styles.sectionTitleRow}>
                        <Icon name="briefcase" size={13} color={Colors.textMuted} />
                        <Text style={styles.reportGroupHeader}>BUSINESS</Text>
                    </View>
                    {[
                        { icon: 'trending-up' as IconName, label: 'Growth', sub: 'Revenue and profit trend over the past months', section: 'growth' as SectionKey, tab: 'growth' as SubTab },
                        { icon: 'award' as IconName, label: 'Business Worth', sub: 'What your business is worth over time', section: 'statements' as SectionKey, tab: 'balancesheet' as SubTab },
                    ].map(item => (
                        <TouchableOpacity
                            key={item.tab + item.label}
                            style={styles.landingCard}
                            onPress={() => {
                                setSection(item.section);
                                setActiveTab(item.tab);
                                setShowLanding(false);
                            }}
                        >
                            <View style={styles.landingCardIconBadge}>
                                <Icon name={item.icon} size={18} color={Colors.primary} />
                            </View>
                            <View style={styles.landingCardText}>
                                <Text style={styles.landingCardLabel}>{item.label}</Text>
                                <Text style={styles.landingCardSub}>{item.sub}</Text>
                            </View>
                            <Icon name="chevron-right" size={18} color={Colors.textMuted} />
                        </TouchableOpacity>
                    ))}
                    {/* Business Health & SWOT lives on its own page now (not a
                        Reports section) — this links straight there instead of
                        redirecting through a dead-end tab. */}
                    <TouchableOpacity
                        style={styles.landingCard}
                        onPress={() => setCurrentScreen('financial-assessment')}
                    >
                        <View style={styles.landingCardIconBadge}>
                            <Icon name="activity" size={18} color={Colors.primary} />
                        </View>
                        <View style={styles.landingCardText}>
                            <Text style={styles.landingCardLabel}>Business Health</Text>
                            <Text style={styles.landingCardSub}>Strengths, weaknesses, risks and opportunities</Text>
                        </View>
                        <Icon name="chevron-right" size={18} color={Colors.textMuted} />
                    </TouchableOpacity>

                    {/* ── TAX Section ────────────────────────────────────── */}
                    <View style={styles.sectionTitleRow}>
                        <Icon name="clipboard" size={13} color={Colors.textMuted} />
                        <Text style={styles.reportGroupHeader}>TAX</Text>
                    </View>
                    {[
                        { icon: 'clipboard' as IconName, label: 'Tax Summary', sub: 'Tax collected, paid and your net tax position', section: 'tax' as SectionKey, tab: 'tax' as SubTab },
                    ].map(item => (
                        <TouchableOpacity
                            key={item.tab}
                            style={styles.landingCard}
                            onPress={() => {
                                setSection(item.section);
                                setActiveTab(item.tab);
                                setShowLanding(false);
                            }}
                        >
                            <View style={styles.landingCardIconBadge}>
                                <Icon name={item.icon} size={18} color={Colors.primary} />
                            </View>
                            <View style={styles.landingCardText}>
                                <Text style={styles.landingCardLabel}>{item.label}</Text>
                                <Text style={styles.landingCardSub}>{item.sub}</Text>
                            </View>
                            <Icon name="chevron-right" size={18} color={Colors.textMuted} />
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            ) : (
            <>
            {/* ── Back to landing ───────────────────────────────────── */}
            <TouchableOpacity style={styles.backToLanding} onPress={() => setShowLanding(true)}>
                <Icon name="chevron-left" size={14} color={Colors.primary} />
                <Text style={styles.backToLandingText}>All Reports</Text>
            </TouchableOpacity>


            {/* ── Section picker ────────────────────────────────────── */}
            <View style={styles.sectionRow}>
                {visibleSections.map(s => (
                    <TouchableOpacity
                        key={s.key}
                        style={[styles.sectionBtn, section === s.key && styles.sectionBtnActive]}
                        onPress={() => handleSectionChange(s.key)}
                    >
                        <Icon name={s.icon} size={15} color={section === s.key ? Colors.primary : Colors.textMuted} />
                        <Text style={[styles.sectionText, section === s.key && styles.sectionTextActive]}>
                            {s.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* ── Sub-tab row ───────────────────────────────────────── */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.subTabBar}
                contentContainerStyle={styles.subTabContent}
            >
                {SECTION_TABS[section].map(tab => (
                    <TouchableOpacity
                        key={tab.key}
                        style={[styles.subTab, activeTab === tab.key && styles.subTabActive]}
                        onPress={() => setActiveTab(tab.key)}
                    >
                        <Text style={[styles.subTabText, activeTab === tab.key && styles.subTabTextActive]}>
                            {tab.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            <DataQualityBadge transactions={transactions} />

            {/* ── Period filter ─────────────────────────────────────── */}
            {periodActive && (
                <>
                    <View style={styles.periodRow}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                            {PERIODS.map(p => (
                                <TouchableOpacity
                                    key={p.key}
                                    style={[styles.periodBtn, period === p.key && styles.periodBtnActive]}
                                    onPress={() => { setPeriod(p.key); setShowComparison(false); }}
                                >
                                    <Text style={[styles.periodText, period === p.key && styles.periodTextActive]}>
                                        {p.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        {period !== 'all' && period !== 'custom' && (
                            <TouchableOpacity
                                style={[styles.periodBtn, showComparison && styles.periodBtnActive, { marginLeft: 6 }]}
                                onPress={() => setShowComparison(v => !v)}
                            >
                                <Text style={[styles.periodText, showComparison && styles.periodTextActive]}>Compare</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                    {period === 'custom' && (
                        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.bg, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 10, color: Colors.textMuted, marginBottom: 4 }}>From</Text>
                                <DateInput value={customRange.from} onChange={v => setCustomRange(r => ({ ...r, from: v }))} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 10, color: Colors.textMuted, marginBottom: 4 }}>To</Text>
                                <DateInput value={customRange.to} onChange={v => setCustomRange(r => ({ ...r, to: v }))} />
                            </View>
                        </View>
                    )}
                    {showComparison && prevFinance && period !== 'all' && period !== 'custom' && (
                        <ComparisonBanner current={finance} previous={prevFinance} currency={currency} />
                    )}
                </>
            )}

            <ScrollView style={styles.scroll}>
                <View style={styles.pad}>

                    {/* ── BALANCE SHEET ────────────────────────────────── */}
                    {activeTab === 'balancesheet' && (
                        <View>
                            <TouchableOpacity style={styles.formalToggleBtn} onPress={() => setShowFormalBS(v => !v)}>
                                <Icon name={showFormalBS ? 'list' : 'file-text'} size={14} color={Colors.primary} />
                                <Text style={styles.formalToggleText}>
                                    {showFormalBS ? 'Show Simple View' : 'Show Formal Statement'}
                                </Text>
                            </TouchableOpacity>

                            {showFormalBS && balanceSheetPoint && (
                                <BalanceSheetStatement
                                    businessName={businessName}
                                    asOfLabel={asOfLabel}
                                    point={balanceSheetPoint}
                                    currency={currency}
                                />
                            )}

                            {/* Clicking Monthly/Quarterly/Yearly above should show the Jan-Dec
                                breakdown right away, not after scrolling past the whole balance
                                sheet card — so this comes first, not last. Balance sheet figures
                                (assets/debts) are shown here, not the Revenue/Expenses/Profit
                                table that belongs on P&L — see BalanceSheetComparisonTable for
                                what's a real per-period trend vs. a flat current-only figure. */}
                            <BalanceSheetComparisonTable
                                businessName={businessName}
                                transactions={transactions}
                                assets={assets}
                                loans={loansList}
                                currency={currency}
                                manualBalances={manualBalances}
                            />
                            <BalanceSheetTab
                                finance={finance}
                                wcMetrics={wcMetrics}
                                assets={assets}
                                settings={settings}
                                updateSettings={updateSettings}
                                currency={currency}
                                bizSize={bizSize}
                            />
                        </View>
                    )}

                    {/* ── P & L ────────────────────────────────────────── */}
                    {activeTab === 'pnl' && (
                        <View>
                            {/* One P&L view only — the formal statement below is the
                                sole rendering of Revenue/COGS/Profit; the old plain-
                                English StatRow card that duplicated it has been
                                removed rather than just hidden behind a toggle. */}
                            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 10 }}>
                                <TouchableOpacity style={styles.exportCsvBtn} onPress={exportPnL}>
                                    <Text style={styles.exportText}>Export CSV</Text>
                                </TouchableOpacity>
                            </View>

                            <ProfitAndLossStatement
                                businessName={businessName}
                                periodLabel={periodDateLabel}
                                pnl={enhPnL}
                                currency={currency}
                            />

                            {/* Same reasoning as Balance Sheet: clicking Monthly/
                                Quarterly/Yearly above should show the Jan-Dec
                                breakdown right away, not after scrolling past the
                                whole P&L card and chart. */}
                            <PeriodComparisonTable businessName={businessName} transactions={transactions} currency={currency} />

                            <View style={styles.card}>
                                <Text style={styles.cardTitle}>Money Owed To / By You</Text>
                                <StatRow label="Customers Who Owe You"               value={`${currency}${wcMetrics.accountsReceivable.toLocaleString()}`}  color={Colors.income} />
                                <StatRow label="Suppliers You Still Owe"             value={`${currency}${wcMetrics.accountsPayable.toLocaleString()}`}     color={Colors.liability} />
                                <StatRow label="Net Position (customers owe − you owe)" value={`${currency}${wcMetrics.netWorkingCapital.toLocaleString()}`} color={wcMetrics.netWorkingCapital >= 0 ? Colors.income : Colors.expense} bold />
                                <StatRow label="Avg. Days to Get Paid"               value={`${wcMetrics.dso.toFixed(0)} days`}                            color={Colors.textSecondary} />
                                <StatRow label="Avg. Days Before You Pay Suppliers"  value={`${wcMetrics.dpo.toFixed(0)} days`}                            color={Colors.textSecondary} />
                                <StatRow label="Days Cash Is Tied Up in the Cycle"   value={`${wcMetrics.ccc.toFixed(0)} days`}                            color={wcMetrics.ccc <= 30 ? Colors.income : wcMetrics.ccc <= 60 ? Colors.warning : Colors.expense} />
                            </View>

                            <MonthlyChart trend={trend} currency={currency} />
                        </View>
                    )}

                    {/* ── INVENTORY ────────────────────────────────────── */}
                    {activeTab === 'inventory' && (
                        <View>
                            <StockSalesComparisonTable businessName={businessName} transactions={transactions} currency={currency} />
                            <InventoryReportTab inventory={inventory} finance={allFinance} transactions={transactions} currency={currency} />
                        </View>
                    )}

                    {/* ── ACCRUAL ──────────────────────────────────────── */}
                    {activeTab === 'accrual' && (
                        <View>
                            <CashFlowComparisonTable businessName={businessName} transactions={transactions} currency={currency} />
                            <AccrualCashFlow
                                transactions={transactions}
                                invoices={invoices}
                                finance={allFinance}
                                currency={currency}
                            />
                        </View>
                    )}

                    {/* ── AGING ────────────────────────────────────────── */}
                    {activeTab === 'aging' && <AgingReport />}

                    {/* ── TAX ──────────────────────────────────────────── */}
                    {activeTab === 'tax' && (
                        <>
                            <TaxSummary
                                periodTransactions={filteredTx}
                                allTransactions={transactions}
                                currency={currency}
                                onOpenTaxPlanning={() => setActiveTab('tax-planning')}
                            />
                            <NextStepLink
                                text="Check if your records are ready to hand to an accountant"
                                onPress={() => setActiveTab('tax-filing')}
                            />
                        </>
                    )}

                    {/* ── TAX FILING READINESS ─────────────────────────── */}
                    {activeTab === 'tax-filing' && <TaxFilingReadinessTab />}

                    {/* ── TAX PLANNING ──────────────────────────────────── */}
                    {activeTab === 'tax-planning' && <TaxPlanningTab />}

                    {/* ── BUDGET FORECAST ──────────────────────────────── */}
                    {activeTab === 'budget' && (
                        <BudgetForecast
                            finance={allFinance}
                            transactions={transactions}
                            currency={currency}
                            targetMargin={targetMargin}
                            onSeeBudget={() => setCurrentScreen('budget')}
                        />
                    )}

                    {/* ── CASH FLOW ────────────────────────────────────── */}
                    {activeTab === 'cashflow' && (
                        <View>
                            <TouchableOpacity style={styles.formalToggleBtn} onPress={() => setShowFormalCF(v => !v)}>
                                <Icon name={showFormalCF ? 'list' : 'file-text'} size={14} color={Colors.primary} />
                                <Text style={styles.formalToggleText}>
                                    {showFormalCF ? 'Show Simple View' : 'Show Formal Statement'}
                                </Text>
                            </TouchableOpacity>

                            {showFormalCF && (
                                <CashFlowFormalStatement
                                    businessName={businessName}
                                    sinceLabel={cashFlowSinceLabel}
                                    cf={properCashFlow}
                                    endingCashBalance={allFinance.cashBalance}
                                    currency={currency}
                                />
                            )}

                            <CashFlowStatement
                                transactions={transactions}
                                assets={assets}
                                currency={currency}
                            />
                        </View>
                    )}

                    {/* ── CASH FLOW & SAFETY ───────────────────────────── */}
                    {activeTab === 'cashsafety' && (
                        <CashFlowSafety
                            finance={allFinance}
                            transactions={transactions}
                            invoices={invoices}
                            currency={currency}
                            minReserve={minReserve}
                            inventoryValue={inventoryValue}
                        />
                    )}

                    {/* ── DEBT MANAGEMENT ──────────────────────────────── */}
                    {activeTab === 'debt' && (
                        <>
                            <EnhancedDebtManagement
                                finance={allFinance}
                                currency={currency}
                                loans={loansList}
                                transactions={transactions}
                                inventoryValue={inventoryValue}
                            />
                            {/* Solvency/leverage ratios (debt-to-assets, debt-to-
                                equity, ROA, ROE) — was imported but never actually
                                rendered anywhere in the app. */}
                            <DebtAnalysis
                                finance={allFinance}
                                currency={currency}
                                loans={loansList}
                                accountsReceivable={allTimeWcMetrics.accountsReceivable}
                                accountsPayable={allTimeWcMetrics.accountsPayable}
                                inventoryValue={inventoryValue}
                            />
                        </>
                    )}

                    {/* ── ASSET PRODUCTIVITY ───────────────────────────── */}
                    {activeTab === 'assets' && (
                        <AssetProductivityAnalysis
                            finance={allFinance}
                            assets={assets}
                            currency={currency}
                        />
                    )}


                    {/* ── GROWTH METRICS ───────────────────────────────── */}
                    {activeTab === 'growth' && (
                        <GrowthMetrics
                            transactions={transactions}
                            currency={currency}
                            finance={allFinance}
                        />
                    )}

                    {/* ── MULTI-YEAR HISTORY ───────────────────────────── */}
                    {activeTab === 'history' && <MultiYearTrends />}

                    {/* ── QUALITY OF GROWTH ────────────────────────────── */}
                    {activeTab === 'quality' && (
                        <QualityOfGrowthTab
                            transactions={transactions}
                            assets={assets}
                            loans={loansList}
                            currency={currency}
                        />
                    )}

                    {/* ── COST EXPOSURE ────────────────────────────────── */}
                    {activeTab === 'exposure' && <CostExposureTab />}

                    {/* ── CUSTOMER PROFITABILITY ───────────────────────── */}
                    {activeTab === 'customers' && (
                        <CustomerProfitability
                            invoices={invoices}
                            transactions={transactions}
                            currency={currency}
                        />
                    )}

                    {/* ── PRODUCT PERFORMANCE ──────────────────────────── */}
                    {activeTab === 'products' && (
                        <ProductPerformance
                            transactions={transactions}
                            inventory={inventory}
                            currency={currency}
                        />
                    )}

                    {/* ── PRICING OPTIMIZER ────────────────────────────── */}
                    {activeTab === 'pricing' && (
                        <>
                            <PricingOptimizer
                                currentRevenue={allFinance.income}
                                currentMargin={allFinance.margin}
                                currency={currency}
                                invoices={invoices}
                                onSeeFullPicture={() => setCurrentScreen('business-passport')}
                            />
                            <NextStepLink
                                text="After adjusting prices, see the effect on your Balance Sheet"
                                onPress={() => { setSection('statements'); setActiveTab('balancesheet'); }}
                            />
                        </>
                    )}

                </View>
            </ScrollView>

            <FooterNav />
            </>
            )}
        </SafeAreaView>
    );
}

// ─── Inventory Report Tab ─────────────────────────────────────────────────────

function InventoryReportTab({ inventory, finance, transactions, currency }: {
    inventory: InventoryItem[];
    finance: any;
    transactions: any[];
    currency: string;
}) {
    // These were plain consts recomputed by scanning the full inventory/
    // transactions arrays on every render of this tab, unlike the parent
    // ReportsScreen (which already memoizes its own derived values) --
    // memoized here too so they only recompute when the underlying data
    // actually changes.
    const { totalStockCost, potentialRevenue, potentialProfit, grossMargin } = useMemo(() => {
        const stockCost = computeInventoryValue(inventory);
        const revenue = inventory.reduce((s, i) => s + i.quantity * (i.sellingPrice ?? 0), 0);
        const profit = revenue - stockCost;
        const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
        return { totalStockCost: stockCost, potentialRevenue: revenue, potentialProfit: profit, grossMargin: margin };
    }, [inventory]);

    const totalRevenue = useMemo(
        () => transactions.filter(t => t.type === 'income').reduce((s: number, t: any) => s + (t.amount ?? 0), 0),
        [transactions],
    );
    const stockToRevRatio = totalRevenue > 0 ? (totalStockCost / totalRevenue) * 100 : 0;
    const ratioColor = stockToRevRatio < 30 ? Colors.income : stockToRevRatio < 60 ? Colors.warning : Colors.expense;

    // Category table
    const catRows = useMemo(() => {
        const catMap = new Map<string, { items: InventoryItem[] }>();
        for (const item of inventory) {
            const cat = item.category || 'General';
            if (!catMap.has(cat)) catMap.set(cat, { items: [] });
            catMap.get(cat)!.items.push(item);
        }
        return Array.from(catMap.entries()).map(([cat, { items }]) => {
            const units     = items.reduce((s, i) => s + i.quantity, 0);
            const stockCost = items.reduce((s, i) => s + i.quantity * (i.costPrice ?? 0), 0);
            const sellVal   = items.reduce((s, i) => s + i.quantity * (i.sellingPrice ?? 0), 0);
            const margin    = sellVal > 0 ? ((sellVal - stockCost) / sellVal) * 100 : 0;
            return { cat, count: items.length, units, stockCost, sellVal, margin };
        });
    }, [inventory]);

    return (
        <View>
            <Text style={styles.cardTitle}>Inventory & Cost of Goods Report</Text>
            <Text style={[styles.note, { marginBottom: 12 }]}>Current Stock Snapshot</Text>

            {/* COGS Analysis */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Inventory Valuation & Profit Analysis</Text>
                <StatRow label="Inventory at Cost"                  value={`${currency}${totalStockCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}   color={Colors.expense} />
                <StatRow label="Inventory at Retail (Selling Price)" value={`${currency}${potentialRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}  color={Colors.income} />
                <StatRow label="Potential Gross Profit on Stock"    value={`${currency}${potentialProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}   color={potentialProfit >= 0 ? Colors.income : Colors.expense} bold />
                <StatRow label="Gross Margin %"                     value={`${grossMargin.toFixed(1)}%`}                                                              color={Colors.textMuted} />
                <Text style={styles.note}>Add stock expenses as transactions to include in P&L</Text>
            </View>

            {/* Category Table */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Category Breakdown</Text>
                <View style={invStyles.tableHeader}>
                    <Text style={[invStyles.colCat, invStyles.headerText]}>Category</Text>
                    <Text style={[invStyles.colNum, invStyles.headerText]}>Items</Text>
                    <Text style={[invStyles.colNum, invStyles.headerText]}>Units</Text>
                    <Text style={[invStyles.colVal, invStyles.headerText]}>Cost</Text>
                    <Text style={[invStyles.colVal, invStyles.headerText]}>Sell</Text>
                    <Text style={[invStyles.colNum, invStyles.headerText]}>Margin</Text>
                </View>
                {catRows.map(r => (
                    <View key={r.cat} style={invStyles.tableRow}>
                        <Text style={[invStyles.colCat, invStyles.cellText]}>{r.cat}</Text>
                        <Text style={[invStyles.colNum, invStyles.cellText]}>{r.count}</Text>
                        <Text style={[invStyles.colNum, invStyles.cellText]}>{r.units}</Text>
                        <Text style={[invStyles.colVal, invStyles.cellText]}>{currency}{r.stockCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                        <Text style={[invStyles.colVal, invStyles.cellText]}>{currency}{r.sellVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                        <Text style={[invStyles.colNum, { color: r.margin >= 20 ? Colors.income : r.margin >= 10 ? Colors.warning : Colors.expense, fontSize: 11 }]}>{r.margin.toFixed(1)}%</Text>
                    </View>
                ))}
                {catRows.length === 0 && <Text style={styles.note}>No inventory items yet.</Text>}
            </View>

            {/* Full Item Table */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Full Item List</Text>
                <View style={invStyles.tableHeader}>
                    <Text style={[invStyles.colItem, invStyles.headerText]}>Item</Text>
                    <Text style={[invStyles.colNum, invStyles.headerText]}>Qty</Text>
                    <Text style={[invStyles.colVal, invStyles.headerText]}>Cost</Text>
                    <Text style={[invStyles.colVal, invStyles.headerText]}>Sell</Text>
                    <Text style={[invStyles.colNum, invStyles.headerText]}>Margin</Text>
                    <Text style={[invStyles.colVal, invStyles.headerText]}>Value</Text>
                </View>
                {inventory.map(item => {
                    const margin = (item.sellingPrice ?? 0) > 0 ? (((item.sellingPrice ?? 0) - (item.costPrice ?? 0)) / (item.sellingPrice ?? 0)) * 100 : 0;
                    const stockVal = item.quantity * (item.costPrice ?? 0);
                    return (
                        <View key={item.id} style={invStyles.tableRow}>
                            <Text style={[invStyles.colItem, invStyles.cellText]} numberOfLines={1}>{item.name}</Text>
                            <Text style={[invStyles.colNum, invStyles.cellText]}>{item.quantity}</Text>
                            <Text style={[invStyles.colVal, invStyles.cellText]}>{currency}{(item.costPrice ?? 0).toLocaleString()}</Text>
                            <Text style={[invStyles.colVal, invStyles.cellText]}>{currency}{(item.sellingPrice ?? 0).toLocaleString()}</Text>
                            <Text style={[invStyles.colNum, { color: margin >= 20 ? Colors.income : margin >= 10 ? Colors.warning : Colors.expense, fontSize: 11 }]}>{margin.toFixed(1)}%</Text>
                            <Text style={[invStyles.colVal, invStyles.cellText]}>{currency}{stockVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                        </View>
                    );
                })}
                {inventory.length === 0 && <Text style={styles.note}>No inventory items yet.</Text>}
            </View>

            {/* Inventory-to-Revenue Ratio */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Inventory-to-Revenue Ratio</Text>
                <StatRow label="Inventory at Cost"  value={`${currency}${totalStockCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}  color={Colors.asset} />
                <StatRow label="Total Revenue"      value={`${currency}${totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}    color={Colors.income} />
                <StatRow label="Ratio"              value={`${stockToRevRatio.toFixed(1)}%`}                                                        color={ratioColor} bold />
                <Text style={styles.note}>
                    {`For every ${currency}1 of revenue you have ${currency}${(totalRevenue > 0 ? totalStockCost / totalRevenue : 0).toFixed(2)} of stock tied up`}
                </Text>
            </View>

            <View style={[styles.card, { borderWidth: 1, borderColor: Colors.primary }]}>
                <Text style={styles.note}>
                    Tip: Record inventory purchases as 'Cost of Goods' expenses to include them in your P&L automatically.
                </Text>
            </View>
        </View>
    );
}

const invStyles = StyleSheet.create({
    tableHeader: { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: 4 },
    tableRow:    { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border, alignItems: 'center' },
    headerText:  { fontSize: 10, color: Colors.textMuted, fontWeight: '700' },
    cellText:    { fontSize: 11, color: Colors.textSecondary },
    colCat:      { flex: 2 },
    colItem:     { flex: 2 },
    colNum:      { flex: 1, textAlign: 'right' },
    colVal:      { flex: 1.5, textAlign: 'right' },
});

// ─── Balance Sheet Tab ─────────────────────────────────────────────────────────

function BalanceSheetTab({ finance, wcMetrics, assets, settings, updateSettings, currency, bizSize }: {
    finance: any; wcMetrics: any; assets: any[]; settings: any;
    updateSettings: (s: any) => void; currency: string; bizSize: any;
}) {
    const [openingAssets,     setOpeningAssets]     = useState(settings.openingAssets);
    const [openingLiabilities,setOpeningLiabilities]= useState(settings.openingLiabilities);
    const [openingLoans,      setOpeningLoans]       = useState(settings.openingLoans || '0');
    const [openingOtherAssets,setOpeningOtherAssets]= useState(settings.openingOtherAssets || '0');
    const [editing, setEditing] = useState(false);

    const save = () => {
        updateSettings({ ...settings, openingAssets, openingLiabilities, openingLoans, openingOtherAssets });
        setEditing(false);
    };

    // Pull live outstanding loan balances from context — still needed for the
    // "auto-filled from your Loan Register" hint text below.
    const { loans: loanRegister } = useApp();
    const liveLoansBalance = loanRegister
        .filter(l => l.status === 'active')
        .reduce((sum, l) => {
            const paid = (l.payments ?? []).reduce((s: number, p: any) => s + (p.amount || 0), 0);
            return sum + Math.max(0, (l.principal || 0) - paid);
        }, 0);

    const InputRow = ({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) => (
        <View style={bsStyles.inputRow}>
            <View style={bsStyles.inputLabelCol}>
                <Text style={bsStyles.inputLabel}>{label}</Text>
                <Text style={bsStyles.inputHint}>{hint}</Text>
            </View>
            <View style={bsStyles.inputWrap}>
                <Text style={bsStyles.currencyPrefix}>{currency}</Text>
                <TextInput
                    style={bsStyles.input}
                    value={value}
                    onChangeText={onChange}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={Colors.textMuted}
                />
            </View>
        </View>
    );

    return (
        <View>
            <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                    <Text style={styles.cardTitle}>Balance Sheet</Text>
                    <Text style={styles.sizeBadge}>{sizeLabel(bizSize)}</Text>
                </View>
                {/* The full Cash/AR/Equipment/Debts/Net Worth breakdown now lives
                    in the Balance Sheet Over Time table above (its last column
                    is today's figures) — this card just holds the manual-entry
                    controls that feed that table, so the numbers aren't shown
                    twice on the same screen. */}
                <Text style={bsStyles.editNote}>
                    See your full breakdown — Cash, Money Owed to You, Equipment, Debts, Net Worth — in the table above.
                    Use this to enter values that aren't tracked as transactions or in the Asset/Loan Register.
                </Text>

                <TouchableOpacity style={bsStyles.editBtn} onPress={() => setEditing(e => !e)}>
                    <Text style={bsStyles.editBtnText}>{editing ? 'Cancel' : 'Edit Manual Values'}</Text>
                </TouchableOpacity>

                {editing && (
                    <View style={bsStyles.editPanel}>
                        <Text style={bsStyles.editTitle}>Enter Your Known Values</Text>
                        <InputRow
                            label="Equipment & Property"
                            hint="Value of buildings, machinery, vehicles you own (not in Asset Register)"
                            value={openingAssets}
                            onChange={setOpeningAssets}
                        />
                        <InputRow
                            label="Other Assets"
                            hint="Investments, stock/inventory, deposits, prepaid expenses"
                            value={openingOtherAssets}
                            onChange={setOpeningOtherAssets}
                        />
                        <InputRow
                            label="Bank Loans & Debt (manual fallback)"
                            hint={loanRegister.length > 0 ? `Auto-filled from your ${loanRegister.filter(l=>l.status==='active').length} active loan(s) in the Loan Register` : 'Or add loans in the Loan Register (More → Loans) to auto-populate this'}
                            value={loanRegister.length > 0 ? String(Math.round(liveLoansBalance)) : openingLoans}
                            onChange={loanRegister.length > 0 ? () => {} : setOpeningLoans}
                        />
                        <InputRow
                            label="Other Amounts Owed"
                            hint="Tax owed, accrued expenses, any other debts not listed above"
                            value={openingLiabilities}
                            onChange={setOpeningLiabilities}
                        />
                        <TouchableOpacity style={bsStyles.saveBtn} onPress={save}>
                            <Text style={bsStyles.saveBtnText}>Save Changes</Text>
                        </TouchableOpacity>
                        <Text style={bsStyles.editNote}>
                            Tip: Figures from your transactions (cash, customer invoices, supplier bills) are filled in automatically. Only enter values that are not tracked as transactions.
                        </Text>
                    </View>
                )}
            </View>

            <KpiRow items={[
                { label: 'Sales',    value: `${currency}${finance.income.toLocaleString()}`,  color: Colors.income },
                { label: 'Costs',    value: `${currency}${finance.expense.toLocaleString()}`, color: Colors.expense },
                { label: 'Profit',   value: `${currency}${finance.profit.toLocaleString()}`,  color: finance.profit >= 0 ? Colors.income : Colors.expense },
            ]} />
        </View>
    );
}

const bsStyles = StyleSheet.create({
    editBtn:      { marginTop: 14, paddingVertical: 8, alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: Colors.primary },
    editBtnText:  { fontSize: 13, color: Colors.primary, fontWeight: '600' },
    editPanel:    { marginTop: 12, backgroundColor: Colors.bg, borderRadius: 10, padding: 12 },
    editTitle:    { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 10 },
    inputRow:     { marginBottom: 12 },
    inputLabelCol:{ marginBottom: 4 },
    inputLabel:   { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
    inputHint:    { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
    inputWrap:    { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 10 },
    currencyPrefix: { fontSize: 14, color: Colors.textMuted, marginRight: 4 },
    input:        { flex: 1, paddingVertical: 10, fontSize: 14, color: Colors.textPrimary },
    saveBtn:      { backgroundColor: Colors.primary, borderRadius: Radius.sm, paddingVertical: 12, alignItems: 'center', marginTop: 4, marginBottom: 8 },
    saveBtnText:  { fontSize: 14, color: '#fff', fontWeight: 'bold' },
    editNote:     { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic', lineHeight: 16 },
});

// ─── Helper components ─────────────────────────────────────────────────────────

function PeriodLabel({ period }: { period: ReportPeriod }) {
    const labels: Record<ReportPeriod, string> = {
        month: 'Last 30 days', quarter: 'Last 3 months',
        year: 'Last 12 months', all: 'All time', custom: 'Custom range',
    };
    return <Text style={styles.periodLabel}>{labels[period]}</Text>;
}

function ComparisonBanner({ current, previous, currency }: { current: FinanceData; previous: FinanceData; currency: string }) {
    const incomeChg  = previous.income  > 0 ? ((current.income  - previous.income)  / previous.income)  * 100 : null;
    const expenseChg = previous.expense > 0 ? ((current.expense - previous.expense) / previous.expense) * 100 : null;
    const profitChg  = previous.profit  !== 0 ? ((current.profit - previous.profit) / Math.abs(previous.profit)) * 100 : null;

    return (
        <View style={{ flexDirection: 'row', backgroundColor: Colors.surface, padding: 10, gap: 4, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
            <CompItem label="Income" curr={current.income} prev={previous.income} chg={incomeChg} currency={currency} positiveIsGood />
            <CompItem label="Expenses" curr={current.expense} prev={previous.expense} chg={expenseChg} currency={currency} positiveIsGood={false} />
            <CompItem label="Profit" curr={current.profit} prev={previous.profit} chg={profitChg} currency={currency} positiveIsGood />
        </View>
    );
}

function CompItem({ label, curr, prev, chg, currency, positiveIsGood }: {
    label: string; curr: number; prev: number; chg: number | null; currency: string; positiveIsGood: boolean;
}) {
    const color = chg === null ? Colors.textMuted : (positiveIsGood ? chg >= 0 : chg <= 0) ? Colors.income : Colors.expense;
    return (
        <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 9, color: Colors.textMuted, marginBottom: 2 }}>{label}</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.textPrimary }}>{currency}{Math.abs(curr).toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
            <Text style={{ fontSize: 10, color: Colors.textMuted }}>prev: {currency}{Math.abs(prev).toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
            {chg !== null && (
                <Text style={{ fontSize: 10, fontWeight: '700', color }}>{chg >= 0 ? '▲' : '▼'}{Math.abs(chg).toFixed(1)}%</Text>
            )}
        </View>
    );
}

function StatRow({ label, value, color, bold, indent, info }: { label: string; value: string; color: string; bold?: boolean; indent?: boolean; info?: string }) {
    return (
        <View style={rowStyles.row}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <Text style={[rowStyles.label, bold && rowStyles.labelBold, indent && rowStyles.labelIndent]}>{label}</Text>
                {info && <InfoTip term={info} />}
            </View>
            <Text style={[rowStyles.value, { color }, bold && rowStyles.valueBold]}>{value}</Text>
        </View>
    );
}

function SectionHeader({ label }: { label: string }) {
    return <Text style={rowStyles.sectionHeader}>{label}</Text>;
}

function KpiRow({ items }: { items: { label: string; value: string; color: string }[] }) {
    return (
        <View style={kpiStyles.row}>
            {items.map(item => (
                <View key={item.label} style={kpiStyles.card}>
                    <Text style={kpiStyles.label}>{item.label}</Text>
                    <Text style={[kpiStyles.value, { color: item.color }]}>{item.value}</Text>
                </View>
            ))}
        </View>
    );
}

function MonthlyChart({ trend, currency }: { trend: MonthlyPoint[]; currency: string }) {
    return (
        <View style={chartStyles.card}>
            <Text style={chartStyles.title}>Monthly Revenue vs Expenses (last 6 months)</Text>
            <GroupedBarChart
                labels={trend.map(p => p.label)}
                series={[
                    { label: 'Revenue', color: Colors.income, values: trend.map(p => p.income) },
                    { label: 'Expenses', color: Colors.expense, values: trend.map(p => p.expense) },
                ]}
            />
            {trend.every(p => p.income === 0 && p.expense === 0) && (
                <Text style={chartStyles.empty}>No transactions in the last 6 months</Text>
            )}
        </View>
    );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    safe:   { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad:    { padding: 16 },

    redirectCard:  { backgroundColor: Colors.surface, borderRadius: 14, padding: 20 },
    redirectTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary, marginBottom: 8 },
    redirectText:  { fontSize: 13, color: Colors.textSecondary, lineHeight: 19, marginBottom: 4 },

    formalToggleBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.primary,
        backgroundColor: Colors.primary + '15', marginBottom: 12,
    },
    formalToggleText: { fontSize: 13, fontWeight: '700', color: Colors.primary },

    landingScroll: { flex: 1 },
    landingPad:    { padding: Spacing.xl, paddingBottom: 40 },
    landingTitle:  { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
    landingSub:    { fontSize: 13, color: Colors.textMuted, marginBottom: 18 },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18, marginBottom: 10 },
    reportGroupHeader: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
    landingCard:   { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    landingCardIconBadge: { width: 40, height: 40, borderRadius: Radius.md, backgroundColor: Colors.primary + '18', alignItems: 'center', justifyContent: 'center' },
    landingCardText:  { flex: 1 },
    landingCardLabel: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
    landingCardSub:   { fontSize: 12, color: Colors.textMuted },
    exportSection: { marginTop: 20, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 16 },
    exportTitle:   { fontSize: 13, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
    exportCsvBtn:  { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: Colors.border },
    exportBtnIcon: { fontSize: 24 },
    exportBtnLabel:{ fontSize: 14, fontWeight: '700', color: Colors.primary },
    exportBtnSub:  { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

    backToLanding:     { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.surface },
    backToLandingText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },

    sectionRow: {
        flexDirection: 'row', backgroundColor: Colors.surface,
        borderBottomWidth: 1, borderBottomColor: Colors.border,
    },
    sectionBtn:       { flex: 1, paddingVertical: 11, alignItems: 'center', gap: 3 },
    sectionBtnActive: { borderBottomWidth: 2, borderBottomColor: Colors.primary },
    sectionText:      { fontSize: 11, color: Colors.textMuted, fontWeight: '500', textAlign: 'center' },
    sectionTextActive:{ color: Colors.primary, fontWeight: '700' },

    subTabBar:     { maxHeight: 46, backgroundColor: Colors.bg, borderBottomWidth: 1, borderBottomColor: Colors.border },
    subTabContent: { paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', gap: 6 },
    subTab:        { paddingHorizontal: 14, paddingVertical: 5, backgroundColor: Colors.surface, borderRadius: Radius.pill },
    subTabActive:  { backgroundColor: Colors.primary, ...Shadow.sm },
    subTabText:    { color: Colors.textMuted, fontSize: 12, fontWeight: '500' },
    subTabTextActive: { color: '#fff', fontWeight: 'bold' },

    periodRow:        { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.bg, gap: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
    periodBtn:        { paddingHorizontal: 12, paddingVertical: 4, borderRadius: Radius.pill, backgroundColor: Colors.surface },
    periodBtnActive:  { backgroundColor: Colors.primary },
    periodText:       { fontSize: 11, color: Colors.textMuted },
    periodTextActive: { color: '#fff', fontWeight: '600' },
    periodLabel:      { fontSize: 11, color: Colors.textMuted, marginBottom: 8, textAlign: 'right', fontStyle: 'italic' },

    exportBar:     { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.bg, borderBottomWidth: 1, borderBottomColor: Colors.border },
    exportBtn:     { flex: 1, backgroundColor: Colors.primary, borderRadius: Radius.sm, paddingVertical: 10, alignItems: 'center' },
    exportBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

    card:          { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: 16, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    cardTitle:     { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 12 },
    cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    note:          { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic', marginTop: 10, lineHeight: 16 },
    sizeBadge:     { fontSize: 11, color: Colors.primary, fontWeight: '600', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.primary, borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
    exportText:    { fontSize: 11, color: Colors.textPrimary, fontWeight: '600' },

    viewToggleRow:        { flexDirection: 'row', backgroundColor: Colors.surface, padding: 8, gap: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
    viewToggleBtn:        { flex: 1, paddingVertical: 7, borderRadius: Radius.sm, alignItems: 'center', backgroundColor: Colors.bg },
    viewToggleBtnActive:  { backgroundColor: Colors.primary },
    viewToggleText:       { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
    viewToggleTextActive: { color: '#fff' },
    viewToggleHint:       { fontSize: 11, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: 12, paddingBottom: 6, backgroundColor: Colors.surface },
});

const rowStyles = StyleSheet.create({
    row:           { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
    label:         { fontSize: 13, color: Colors.textSecondary, fontWeight: '500', flex: 1, marginRight: 8 },
    labelBold:     { fontWeight: '700', color: Colors.textPrimary },
    labelIndent:   { paddingLeft: 12, color: Colors.textMuted, fontSize: 12 },
    value:         { fontSize: 13, fontWeight: '600' },
    valueBold:     { fontSize: 14, fontWeight: 'bold' },
    sectionHeader: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1, marginTop: 10, marginBottom: 2 },
});

const kpiStyles = StyleSheet.create({
    row:   { flexDirection: 'row', gap: 8, marginBottom: 16 },
    card:  { flex: 1, backgroundColor: Colors.surface, borderRadius: 10, padding: 12, alignItems: 'center' },
    label: { fontSize: 11, color: Colors.textMuted, marginBottom: 4 },
    value: { fontSize: 14, fontWeight: 'bold' },
});

const chartStyles = StyleSheet.create({
    card:        { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 16 },
    title:       { fontSize: 14, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 12 },
    empty:       { fontSize: 12, color: Colors.textMuted, textAlign: 'center', marginTop: 8 },
});
