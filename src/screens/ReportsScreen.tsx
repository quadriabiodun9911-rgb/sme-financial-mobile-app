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
import TaxSummary from '../components/TaxSummary';
import BudgetForecast from '../components/BudgetForecast';
import CashManagement from '../components/CashManagement';
import DebtAnalysis from '../components/DebtAnalysis';
import EnhancedDebtManagement from '../components/EnhancedDebtManagement';
import AssetProductivityAnalysis from '../components/AssetProductivityAnalysis';
import CustomerProfitability from '../components/CustomerProfitability';
import ProductPerformance from '../components/ProductPerformance';
import GrowthMetrics from '../components/GrowthMetrics';
import PricingOptimizer from '../components/PricingOptimizer';
import NextStepLink from '../components/NextStepLink';
import CashFlowStatement from '../components/CashFlowStatement';
import AccrualCashFlow from '../components/AccrualCashFlow';
import { filterByPeriod, filterByDateRange, getPreviousPeriodRange, computeFinance, computeAssetCurrentValue, computeMonthlyTrend, computeEnhancedPnL, computeWorkingCapitalMetrics, classifyBusinessSize, sizeLabel, transactionsToCSV, ReportPeriod, MonthlyPoint, DateRange } from '../utils/finance';
import { FinanceData } from '../types';
import DateInput from '../components/DateInput';
import { InventoryItem } from '../types';
import { generatePDF, sharePDF } from '../utils/pdfExport';

// ─── Section groups ────────────────────────────────────────────────────────────
type SectionKey = 'statements' | 'customers' | 'tax' | 'planning' | 'growth';

const SECTIONS: { key: SectionKey; label: string; icon: string; desc: string }[] = [
    { key: 'statements', label: '📊 Financial Statements', icon: '📊', desc: 'Balance Sheet, P&L, Inventory, Cash Flow' },
    { key: 'customers',  label: '💰 Customers & Collections', icon: '💰', desc: 'Who Owes Me - Unpaid Invoices' },
    { key: 'tax',        label: '🏛️ Tax & Compliance', icon: '🏛️', desc: 'Tax Summary and Obligations' },
    { key: 'planning',   label: '📈 Planning & Forecasts', icon: '📈', desc: 'Growth Scenarios, Cash Timeline, Loans & Debt' },
    { key: 'growth',     label: '🚀 Growth Analytics', icon: '🚀', desc: 'Growth Trends, Best Customers & Products' },
];

type SubTab =
    | 'balancesheet' | 'pnl' | 'inventory' | 'accrual'
    | 'aging'
    | 'tax'
    | 'budget' | 'cashflow' | 'cashmgmt' | 'debt' | 'assets'
    | 'growth' | 'customers' | 'products' | 'pricing';

const SECTION_TABS: Record<SectionKey, { key: SubTab; label: string }[]> = {
    statements: [
        { key: 'balancesheet', label: 'What I Own & Owe' },
        { key: 'pnl',          label: 'Profit & Loss' },
        { key: 'inventory',    label: 'Stock' },
        { key: 'accrual',      label: 'Cash Flow' },
    ],
    customers: [
        { key: 'aging', label: 'Who Owes Me' },
    ],
    tax: [
        { key: 'tax', label: 'Tax Summary' },
    ],
    planning: [
        { key: 'budget',   label: 'Growth Scenarios' },
        { key: 'cashflow', label: 'Cash Timeline' },
        { key: 'cashmgmt', label: 'Cash Safety' },
        { key: 'debt',     label: 'Loans & Debt' },
        { key: 'assets',   label: 'Assets' },
    ],
    growth: [
        { key: 'growth',    label: 'Growth Trends' },
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
    const { finance: allFinance, settings, updateSettings, transactions, assets, loans: loansList, navParams, inventory, invoices, setCurrentScreen } = useApp();
    const { currency, minReserve, targetMargin } = settings;

    const [showLanding, setShowLanding] = useState(false);
    const [section, setSection]       = useState<SectionKey>('statements');
    const [activeTab, setActiveTab]   = useState<SubTab>('balancesheet');
    const [period, setPeriod]         = useState<ReportPeriod>('all');
    const [showComparison, setShowComparison] = useState(false);
    const today = new Date().toISOString().split('T')[0];
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
    const bizSize    = classifyBusinessSize(enhPnL.revenue);

    const prevFinance = useMemo(() => {
        if (period === 'all' || period === 'custom') return null;
        const { previous } = getPreviousPeriodRange(period);
        const prevTx = filterByDateRange(transactions, previous);
        return computeFinance(prevTx, settings);
    }, [period, transactions, settings]);

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
                    <Text style={styles.reportGroupHeader}>💰 MONEY</Text>
                    {[
                        { icon: '📊', label: 'Profit & Loss', sub: 'Did I make money? Revenue vs costs breakdown', section: 'statements' as SectionKey, tab: 'pnl' as SubTab },
                        { icon: '💧', label: 'Cash Flow', sub: 'Money coming in and going out over time', section: 'planning' as SectionKey, tab: 'cashflow' as SubTab },
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
                            <Text style={styles.landingCardIcon}>{item.icon}</Text>
                            <View style={styles.landingCardText}>
                                <Text style={styles.landingCardLabel}>{item.label}</Text>
                                <Text style={styles.landingCardSub}>{item.sub}</Text>
                            </View>
                            <Text style={styles.landingCardArrow}>›</Text>
                        </TouchableOpacity>
                    ))}

                    {/* ── CUSTOMERS Section ───────────────────────────────── */}
                    <Text style={styles.reportGroupHeader}>👥 CUSTOMERS</Text>
                    {[
                        { icon: '💰', label: 'Who Owes Me', sub: 'Unpaid invoices and overdue payments', section: 'customers' as SectionKey, tab: 'aging' as SubTab },
                        { icon: '📄', label: 'Invoices', sub: 'View all sent invoices and collection status', section: 'customers' as SectionKey, tab: 'aging' as SubTab },
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
                            <Text style={styles.landingCardIcon}>{item.icon}</Text>
                            <View style={styles.landingCardText}>
                                <Text style={styles.landingCardLabel}>{item.label}</Text>
                                <Text style={styles.landingCardSub}>{item.sub}</Text>
                            </View>
                            <Text style={styles.landingCardArrow}>›</Text>
                        </TouchableOpacity>
                    ))}

                    {/* ── BUSINESS Section ────────────────────────────────── */}
                    <Text style={styles.reportGroupHeader}>⚙️ BUSINESS</Text>
                    {[
                        { icon: '📈', label: 'Growth', sub: 'Revenue and profit trend over the past months', section: 'growth' as SectionKey, tab: 'growth' as SubTab },
                        { icon: '💎', label: 'Business Worth', sub: 'What your business is worth over time', section: 'statements' as SectionKey, tab: 'balancesheet' as SubTab },
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
                            <Text style={styles.landingCardIcon}>{item.icon}</Text>
                            <View style={styles.landingCardText}>
                                <Text style={styles.landingCardLabel}>{item.label}</Text>
                                <Text style={styles.landingCardSub}>{item.sub}</Text>
                            </View>
                            <Text style={styles.landingCardArrow}>›</Text>
                        </TouchableOpacity>
                    ))}
                    {/* Business Health & SWOT lives on its own page now (not a
                        Reports section) — this links straight there instead of
                        redirecting through a dead-end tab. */}
                    <TouchableOpacity
                        style={styles.landingCard}
                        onPress={() => setCurrentScreen('financial-assessment')}
                    >
                        <Text style={styles.landingCardIcon}>🏥</Text>
                        <View style={styles.landingCardText}>
                            <Text style={styles.landingCardLabel}>Business Health</Text>
                            <Text style={styles.landingCardSub}>Strengths, weaknesses, risks and opportunities</Text>
                        </View>
                        <Text style={styles.landingCardArrow}>›</Text>
                    </TouchableOpacity>

                    {/* ── TAX Section ────────────────────────────────────── */}
                    <Text style={styles.reportGroupHeader}>🧾 TAX</Text>
                    {[
                        { icon: '🧾', label: 'Tax Summary', sub: 'Tax collected, paid and your net tax position', section: 'operations' as SectionKey, tab: 'tax' as SubTab },
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
                            <Text style={styles.landingCardIcon}>{item.icon}</Text>
                            <View style={styles.landingCardText}>
                                <Text style={styles.landingCardLabel}>{item.label}</Text>
                                <Text style={styles.landingCardSub}>{item.sub}</Text>
                            </View>
                            <Text style={styles.landingCardArrow}>›</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            ) : (
            <>
            {/* ── Back to landing ───────────────────────────────────── */}
            <TouchableOpacity style={styles.backToLanding} onPress={() => setShowLanding(true)}>
                <Text style={styles.backToLandingText}>← All Reports</Text>
            </TouchableOpacity>


            {/* ── Section picker ────────────────────────────────────── */}
            <View style={styles.sectionRow}>
                {visibleSections.map(s => (
                    <TouchableOpacity
                        key={s.key}
                        style={[styles.sectionBtn, section === s.key && styles.sectionBtnActive]}
                        onPress={() => handleSectionChange(s.key)}
                    >
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
                            {/* Clicking Monthly/Quarterly/Yearly above should show the Jan-Dec
                                breakdown right away, not after scrolling past the whole balance
                                sheet card — so this comes first, not last. Balance sheet figures
                                (assets/debts) are shown here, not the Revenue/Expenses/Profit
                                table that belongs on P&L — see BalanceSheetComparisonTable for
                                why AR/AP/inventory aren't part of the trend. */}
                            <BalanceSheetComparisonTable
                                transactions={transactions}
                                assets={assets}
                                loans={loansList}
                                currency={currency}
                                manualBalances={{
                                    otherAssets: (parseFloat(settings.openingAssets) || 0) + (parseFloat(settings.openingOtherAssets) || 0),
                                    otherLiabilities: parseFloat(settings.openingLiabilities) || 0,
                                }}
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
                            <PeriodLabel period={period} />
                            <View style={styles.card}>
                                <View style={styles.cardHeaderRow}>
                                    <Text style={styles.cardTitle}>Profit & Loss</Text>
                                    <TouchableOpacity style={styles.exportCsvBtn} onPress={exportPnL}>
                                        <Text style={styles.exportText}>Export CSV</Text>
                                    </TouchableOpacity>
                                </View>
                                <StatRow label="Total Revenue (Money In)"             value={`${currency}${Math.round(enhPnL.revenue).toLocaleString()}`}                                           color={Colors.income} />
                                <StatRow label="  Cost of Goods Sold"                 value={`-${currency}${Math.round(enhPnL.cogs).toLocaleString()}`}                                          color={Colors.expense} indent />
                                <StatRow label="Gross Profit"                         value={`${currency}${Math.round(enhPnL.grossProfit).toLocaleString()}`}                                  color={enhPnL.grossProfit >= 0 ? Colors.income : Colors.expense} bold />
                                <StatRow label="  Gross Margin %"                     value={`${(isNaN(enhPnL.grossMargin) ? 0 : enhPnL.grossMargin).toFixed(1)}%`}               color={Colors.textMuted} indent info="Gross Margin" />
                                <StatRow label="  Running Costs (rent, salaries, admin)" value={`-${currency}${Math.round(enhPnL.sgaExpenses).toLocaleString()}`}                              color={Colors.expense} indent />
                                <StatRow label="Operating Profit"                     value={`${enhPnL.ebit >= 0 ? '+' : ''}${currency}${Math.round(enhPnL.ebit).toLocaleString()}`}           color={enhPnL.ebit >= 0 ? Colors.income : Colors.expense} bold />
                                <StatRow label="  Operating Margin %"                 value={`${(isNaN(enhPnL.ebitMargin) ? 0 : enhPnL.ebitMargin).toFixed(1)}%`}                 color={Colors.textMuted} indent info="Operating Margin" />
                                <StatRow label="  Equipment Depreciation (non-cash)"  value={`+${currency}${Math.round(enhPnL.depreciation).toLocaleString()}`}                               color={Colors.textMuted} indent />
                                <StatRow label="Cash Profit"                          value={`${enhPnL.ebitda >= 0 ? '+' : ''}${currency}${Math.round(enhPnL.ebitda).toLocaleString()}`}      color={enhPnL.ebitda >= 0 ? Colors.income : Colors.expense} bold info="Cash Profit" />
                                <StatRow label="Net Profit (Bottom Line)"             value={`${enhPnL.netProfit >= 0 ? '+' : ''}${currency}${Math.round(enhPnL.netProfit).toLocaleString()}`} color={enhPnL.netProfit >= 0 ? Colors.income : Colors.expense} bold />
                                <StatRow label="Net Profit %"                         value={`${(isNaN(enhPnL.netMargin) ? 0 : enhPnL.netMargin).toFixed(1)}%`}                   color={enhPnL.netMargin >= parseFloat(targetMargin) ? Colors.income : Colors.expense} />
                                <StatRow label="Your Profit Target"                   value={`${targetMargin}%`}                                                                    color={Colors.textMuted} />
                                <StatRow label="Tax Charged to Customers"             value={`${currency}${finance.totalTaxCollected.toLocaleString()}`}                           color={Colors.warning} />
                                <StatRow label="Tax You Have Paid"                    value={`${currency}${finance.totalTaxPaid.toLocaleString()}`}                                color={Colors.warning} />
                            </View>

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

                            <PeriodComparisonTable transactions={transactions} currency={currency} />
                        </View>
                    )}

                    {/* ── INVENTORY ────────────────────────────────────── */}
                    {activeTab === 'inventory' && (
                        <InventoryReportTab inventory={inventory} finance={allFinance} transactions={transactions} currency={currency} />
                    )}

                    {/* ── ACCRUAL ──────────────────────────────────────── */}
                    {activeTab === 'accrual' && (
                        <AccrualCashFlow
                            transactions={transactions}
                            invoices={invoices}
                            finance={allFinance}
                            currency={currency}
                        />
                    )}

                    {/* ── AGING ────────────────────────────────────────── */}
                    {activeTab === 'aging' && <AgingReport />}

                    {/* ── TAX ──────────────────────────────────────────── */}
                    {activeTab === 'tax' && <TaxSummary />}

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
                        <CashFlowStatement
                            transactions={transactions}
                            assets={assets}
                            currency={currency}
                        />
                    )}

                    {/* ── CASH MGMT ────────────────────────────────────── */}
                    {activeTab === 'cashmgmt' && (
                        <CashManagement
                            finance={allFinance}
                            transactions={transactions}
                            currency={currency}
                            minReserve={minReserve}
                        />
                    )}

                    {/* ── DEBT MANAGEMENT ──────────────────────────────── */}
                    {activeTab === 'debt' && (
                        <>
                            <EnhancedDebtManagement
                                finance={allFinance}
                                currency={currency}
                                loans={loansList}
                            />
                            {/* Solvency/leverage ratios (debt-to-assets, debt-to-
                                equity, ROA, ROE) — was imported but never actually
                                rendered anywhere in the app. */}
                            <DebtAnalysis
                                finance={allFinance}
                                currency={currency}
                                loans={loansList}
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
                                onSeeFullPicture={() => setCurrentScreen('clarity')}
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
    const totalStockCost    = inventory.reduce((s, i) => s + i.quantity * i.costPrice, 0);
    const potentialRevenue  = inventory.reduce((s, i) => s + i.quantity * i.sellingPrice, 0);
    const potentialProfit   = potentialRevenue - totalStockCost;
    const grossMargin       = potentialRevenue > 0 ? (potentialProfit / potentialRevenue) * 100 : 0;

    const totalRevenue = transactions.filter(t => t.type === 'income').reduce((s: number, t: any) => s + t.amount, 0);
    const stockToRevRatio = totalRevenue > 0 ? (totalStockCost / totalRevenue) * 100 : 0;
    const ratioColor = stockToRevRatio < 30 ? Colors.income : stockToRevRatio < 60 ? Colors.warning : Colors.expense;

    // Category table
    const catMap = new Map<string, { items: InventoryItem[] }>();
    for (const item of inventory) {
        const cat = item.category || 'General';
        if (!catMap.has(cat)) catMap.set(cat, { items: [] });
        catMap.get(cat)!.items.push(item);
    }
    const catRows = Array.from(catMap.entries()).map(([cat, { items }]) => {
        const units     = items.reduce((s, i) => s + i.quantity, 0);
        const stockCost = items.reduce((s, i) => s + i.quantity * i.costPrice, 0);
        const sellVal   = items.reduce((s, i) => s + i.quantity * i.sellingPrice, 0);
        const margin    = sellVal > 0 ? ((sellVal - stockCost) / sellVal) * 100 : 0;
        return { cat, count: items.length, units, stockCost, sellVal, margin };
    });

    return (
        <View>
            <Text style={styles.cardTitle}>Inventory & Cost of Goods Report</Text>
            <Text style={[styles.note, { marginBottom: 12 }]}>Current Stock Snapshot</Text>

            {/* COGS Analysis */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Stock Profit Analysis</Text>
                <StatRow label="What Your Stock Cost You"      value={`${currency}${totalStockCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}   color={Colors.expense} />
                <StatRow label="What You Could Sell It For"    value={`${currency}${potentialRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}  color={Colors.income} />
                <StatRow label="Potential Profit If All Sold"  value={`${currency}${potentialProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}   color={potentialProfit >= 0 ? Colors.income : Colors.expense} bold />
                <StatRow label="Profit Margin %"               value={`${grossMargin.toFixed(1)}%`}                                                              color={Colors.textMuted} />
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
                    const margin = item.sellingPrice > 0 ? ((item.sellingPrice - item.costPrice) / item.sellingPrice) * 100 : 0;
                    const stockVal = item.quantity * item.costPrice;
                    return (
                        <View key={item.id} style={invStyles.tableRow}>
                            <Text style={[invStyles.colItem, invStyles.cellText]} numberOfLines={1}>{item.name}</Text>
                            <Text style={[invStyles.colNum, invStyles.cellText]}>{item.quantity}</Text>
                            <Text style={[invStyles.colVal, invStyles.cellText]}>{currency}{item.costPrice.toLocaleString()}</Text>
                            <Text style={[invStyles.colVal, invStyles.cellText]}>{currency}{item.sellingPrice.toLocaleString()}</Text>
                            <Text style={[invStyles.colNum, { color: margin >= 20 ? Colors.income : margin >= 10 ? Colors.warning : Colors.expense, fontSize: 11 }]}>{margin.toFixed(1)}%</Text>
                            <Text style={[invStyles.colVal, invStyles.cellText]}>{currency}{stockVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                        </View>
                    );
                })}
                {inventory.length === 0 && <Text style={styles.note}>No inventory items yet.</Text>}
            </View>

            {/* Inventory-to-Revenue Ratio */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Stock vs Revenue</Text>
                <StatRow label="Stock Value"    value={`${currency}${totalStockCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}  color={Colors.asset} />
                <StatRow label="Total Revenue"  value={`${currency}${totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}    color={Colors.income} />
                <StatRow label="Ratio"          value={`${stockToRevRatio.toFixed(1)}%`}                                                        color={ratioColor} bold />
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

    const registeredAssetValue = assets
        .filter(a => a.status === 'active')
        .reduce((sum, a) => {
            const cost      = isNaN(a.purchaseCost)    ? 0 : (a.purchaseCost    || 0);
            const residual  = isNaN(a.residualValue)   ? 0 : (a.residualValue   || 0);
            const lifeYears = (!a.usefulLifeYears || a.usefulLifeYears <= 0) ? 1 : a.usefulLifeYears;
            const purchaseMs = new Date(a.purchaseDate).getTime();
            const yr = isNaN(purchaseMs) ? 0 : (Date.now() - purchaseMs) / (1000 * 60 * 60 * 24 * 365);
            const dep = Math.min(yr * (cost - residual) / lifeYears, cost - residual);
            const val = Math.max(residual, cost - dep);
            return sum + (isNaN(val) ? 0 : val);
        }, 0);

    // Pull live outstanding loan balances and inventory from context
    const { loans: loanRegister, inventory: inventoryItems } = useApp();
    const liveLoansBalance = loanRegister
        .filter(l => l.status === 'active')
        .reduce((sum, l) => {
            const paid = (l.payments ?? []).reduce((s: number, p: any) => s + (p.amount || 0), 0);
            return sum + Math.max(0, (l.principal || 0) - paid);
        }, 0);

    const inventoryValue  = inventoryItems.reduce((sum: number, item: any) => sum + ((item.quantity || 0) * (item.costPrice || 0)), 0);
    const manualAssets    = parseFloat(openingAssets) || 0;
    const otherAssets     = parseFloat(openingOtherAssets) || 0;
    const manualLiab      = parseFloat(openingLiabilities) || 0;
    const manualLoans     = parseFloat(openingLoans) || 0;
    // Live loans from Loan Register take priority; fall back to manual entry if no loans registered
    const loansBalance    = loanRegister.length > 0 ? liveLoansBalance : manualLoans;
    const cashBal         = isNaN(finance.cashBalance) ? 0 : finance.cashBalance;
    const arBal           = isNaN(wcMetrics.accountsReceivable) ? 0 : wcMetrics.accountsReceivable;
    const apBal           = isNaN(wcMetrics.accountsPayable) ? 0 : wcMetrics.accountsPayable;
    const currentAssets   = cashBal + arBal + inventoryValue;
    const totalAssets     = currentAssets + registeredAssetValue + manualAssets + otherAssets;
    const totalLiab       = apBal + manualLiab + loansBalance;
    const equity          = totalAssets - totalLiab;

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

                <SectionHeader label="WHAT YOU OWN (ASSETS)" />
                <StatRow label="Cash on Hand"                       value={`${currency}${Math.round(finance.cashBalance).toLocaleString()}`}              color={Colors.income} />
                <StatRow label="  Money Owed to You by Customers"   value={`${currency}${Math.round(wcMetrics.accountsReceivable).toLocaleString()}`}     color={Colors.income} indent />
                {inventoryValue > 0 && <StatRow label="  Stock / Inventory Value" value={`${currency}${Math.round(inventoryValue).toLocaleString()}`} color={Colors.asset} indent />}
                <StatRow label="Short-Term Assets Total"            value={`${currency}${Math.round(currentAssets).toLocaleString()}`}                   color={Colors.asset} bold />
                <StatRow label="  Equipment & Property (Asset Register)" value={`${currency}${Math.round(registeredAssetValue).toLocaleString()}`}       color={Colors.asset} indent />
                <StatRow label="  Equipment & Property (Manual Entry)"   value={`${currency}${Math.round(manualAssets).toLocaleString()}`}               color={Colors.asset} indent />
                <StatRow label="  Other Assets You Own"             value={`${currency}${Math.round(otherAssets).toLocaleString()}`}                     color={Colors.asset} indent />
                <StatRow label="Everything You Own"                 value={`${currency}${Math.round(isNaN(totalAssets) ? 0 : totalAssets).toLocaleString()}`}   color={Colors.asset} bold />

                <SectionHeader label="WHAT YOU OWE (DEBTS)" />
                <StatRow label="  Bills Owed to Suppliers"          value={`${currency}${Math.round(apBal).toLocaleString()}`}                          color={Colors.liability} indent />
                <StatRow label={`  Bank Loans & Other Debt${loanRegister.length > 0 ? ' (from Loan Register)' : ''}`} value={`${currency}${Math.round(loansBalance).toLocaleString()}`} color={Colors.liability} indent />
                <StatRow label="  Other Amounts Owed"               value={`${currency}${Math.round(manualLiab).toLocaleString()}`}                     color={Colors.liability} indent />
                <StatRow label="Everything You Owe"                 value={`${currency}${Math.round(totalLiab).toLocaleString()}`}                      color={Colors.liability} bold />

                <SectionHeader label="YOUR BUSINESS VALUE" />
                <StatRow label="Net Worth (Assets − Debts)"         value={`${currency}${Math.round(isNaN(equity) ? 0 : equity).toLocaleString()}`}  color={(isNaN(equity) ? 0 : equity) >= 0 ? Colors.equity : Colors.expense} bold />
                <StatRow label="Day-to-Day Cash Buffer"             value={`${currency}${Math.round(wcMetrics.netWorkingCapital).toLocaleString()}`}     color={wcMetrics.netWorkingCapital >= 0 ? Colors.income : Colors.expense} />

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
    saveBtn:      { backgroundColor: Colors.primary, borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 4, marginBottom: 8 },
    saveBtnText:  { fontSize: 14, color: Colors.textPrimary, fontWeight: 'bold' },
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
    const maxVal = Math.max(...trend.flatMap(p => [p.income, p.expense]), 1);
    const BAR_H = 120;

    return (
        <View style={chartStyles.card}>
            <Text style={chartStyles.title}>Monthly Revenue vs Expenses (last 6 months)</Text>
            <View style={chartStyles.chart}>
                {trend.map((pt, i) => {
                    const incH = Math.round((pt.income / maxVal) * BAR_H);
                    const expH = Math.round((pt.expense / maxVal) * BAR_H);
                    return (
                        <View key={i} style={chartStyles.col}>
                            <View style={chartStyles.bars}>
                                <View style={[chartStyles.bar, { height: Math.max(incH, 2), backgroundColor: Colors.income, marginRight: 2 }]} />
                                <View style={[chartStyles.bar, { height: Math.max(expH, 2), backgroundColor: Colors.expense }]} />
                            </View>
                            <Text style={chartStyles.monthLabel}>{pt.label}</Text>
                        </View>
                    );
                })}
            </View>
            <View style={chartStyles.legend}>
                <View style={chartStyles.legendItem}>
                    <View style={[chartStyles.dot, { backgroundColor: Colors.income }]} />
                    <Text style={chartStyles.legendText}>Revenue</Text>
                </View>
                <View style={chartStyles.legendItem}>
                    <View style={[chartStyles.dot, { backgroundColor: Colors.expense }]} />
                    <Text style={chartStyles.legendText}>Expenses</Text>
                </View>
            </View>
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

    landingScroll: { flex: 1 },
    landingPad:    { padding: 16, paddingBottom: 40 },
    landingTitle:  { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
    landingSub:    { fontSize: 13, color: Colors.textMuted, marginBottom: 18 },
    reportGroupHeader: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginBottom: 10, marginTop: 16, letterSpacing: 0.3 },
    landingCard:   { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: Colors.border },
    landingCardIcon:  { fontSize: 28 },
    landingCardText:  { flex: 1 },
    landingCardLabel: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
    landingCardSub:   { fontSize: 12, color: Colors.textMuted },
    landingCardArrow: { fontSize: 22, color: Colors.textMuted },
    exportSection: { marginTop: 20, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 16 },
    exportTitle:   { fontSize: 13, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
    exportCsvBtn:  { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: Colors.border },
    exportBtnIcon: { fontSize: 24 },
    exportBtnLabel:{ fontSize: 14, fontWeight: '700', color: Colors.primary },
    exportBtnSub:  { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

    backToLanding:     { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.surface },
    backToLandingText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },

    sectionRow: {
        flexDirection: 'row', backgroundColor: Colors.surface,
        borderBottomWidth: 1, borderBottomColor: Colors.border,
    },
    sectionBtn:       { flex: 1, paddingVertical: 11, alignItems: 'center' },
    sectionBtnActive: { borderBottomWidth: 2, borderBottomColor: Colors.primary },
    sectionText:      { fontSize: 12, color: Colors.textMuted, fontWeight: '500' },
    sectionTextActive:{ color: Colors.primary, fontWeight: '700' },

    subTabBar:     { maxHeight: 46, backgroundColor: Colors.bg, borderBottomWidth: 1, borderBottomColor: Colors.border },
    subTabContent: { paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', gap: 6 },
    subTab:        { paddingHorizontal: 14, paddingVertical: 5, backgroundColor: Colors.surface, borderRadius: 20 },
    subTabActive:  { backgroundColor: Colors.primary },
    subTabText:    { color: Colors.textMuted, fontSize: 12, fontWeight: '500' },
    subTabTextActive: { color: Colors.textPrimary, fontWeight: 'bold' },

    periodRow:        { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.bg, gap: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
    periodBtn:        { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, backgroundColor: Colors.surface },
    periodBtnActive:  { backgroundColor: Colors.primary },
    periodText:       { fontSize: 11, color: Colors.textMuted },
    periodTextActive: { color: Colors.textPrimary, fontWeight: '600' },
    periodLabel:      { fontSize: 11, color: Colors.textMuted, marginBottom: 8, textAlign: 'right', fontStyle: 'italic' },

    exportBar:     { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.bg, borderBottomWidth: 1, borderBottomColor: Colors.border },
    exportBtn:     { flex: 1, backgroundColor: Colors.primary, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
    exportBtnText: { color: Colors.textPrimary, fontWeight: '700', fontSize: 13 },

    card:          { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 16 },
    cardTitle:     { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 12 },
    cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    note:          { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic', marginTop: 10, lineHeight: 16 },
    sizeBadge:     { fontSize: 11, color: Colors.primary, fontWeight: '600', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.primary, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
    exportText:    { fontSize: 11, color: Colors.textPrimary, fontWeight: '600' },

    viewToggleRow:        { flexDirection: 'row', backgroundColor: Colors.surface, padding: 8, gap: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
    viewToggleBtn:        { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center', backgroundColor: Colors.bg },
    viewToggleBtnActive:  { backgroundColor: Colors.primary },
    viewToggleText:       { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
    viewToggleTextActive: { color: Colors.textPrimary },
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
    chart:       { flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 4 },
    col:         { flex: 1, alignItems: 'center' },
    bars:        { flexDirection: 'row', alignItems: 'flex-end' },
    bar:         { width: 10, borderRadius: 3 },
    monthLabel:  { fontSize: 9, color: Colors.textMuted, marginTop: 4 },
    legend:      { flexDirection: 'row', gap: 16, marginTop: 12, justifyContent: 'center' },
    legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
    dot:         { width: 8, height: 8, borderRadius: 4 },
    legendText:  { fontSize: 11, color: Colors.textMuted },
    empty:       { fontSize: 12, color: Colors.textMuted, textAlign: 'center', marginTop: 8 },
});
