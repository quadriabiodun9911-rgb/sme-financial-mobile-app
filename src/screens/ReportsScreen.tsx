import React, { useMemo, useState, useEffect } from 'react';
import {
    SafeAreaView, ScrollView, View, Text,
    TouchableOpacity, StyleSheet, Dimensions, Share, TextInput,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import AgingReport from '../components/AgingReport';
import TaxSummary from '../components/TaxSummary';
import SwotAnalysis from '../components/SwotAnalysis';
import FinancialHealthAssessment from '../../financial-planning/FinancialHealthAssessment';
import BudgetForecast from '../components/BudgetForecast';
import CashManagement from '../components/CashManagement';
import DebtAnalysis from '../components/DebtAnalysis';
import EnhancedDebtManagement from '../components/EnhancedDebtManagement';
import AssetProductivityAnalysis from '../components/AssetProductivityAnalysis';
import CustomerProfitability from '../components/CustomerProfitability';
import ProductPerformance from '../components/ProductPerformance';
import GrowthMetrics from '../components/GrowthMetrics';
import PricingOptimizer from '../components/PricingOptimizer';
import CashFlowStatement from '../components/CashFlowStatement';
import AccrualCashFlow from '../components/AccrualCashFlow';
import { filterByPeriod, filterByDateRange, getPreviousPeriodRange, computeFinance, computeMonthlyTrend, computeEnhancedPnL, computeWorkingCapitalMetrics, classifyBusinessSize, sizeLabel, transactionsToCSV, ReportPeriod, MonthlyPoint, DateRange } from '../utils/finance';
import { FinanceData } from '../types';
import DateInput from '../components/DateInput';
import { InventoryItem } from '../types';

// ─── Section groups ────────────────────────────────────────────────────────────
type SectionKey = 'statements' | 'operations' | 'planning' | 'analysis' | 'growth';

const SECTIONS: { key: SectionKey; label: string }[] = [
    { key: 'statements', label: 'Summary' },
    { key: 'operations', label: 'Invoices' },
    { key: 'planning',   label: 'Planning' },
    { key: 'growth',     label: 'Growth' },
    { key: 'analysis',   label: 'Health' },
];

type SubTab =
    | 'balancesheet' | 'pnl' | 'inventory' | 'accrual'
    | 'aging' | 'tax'
    | 'budget' | 'cashflow' | 'cashmgmt' | 'debt' | 'assets'
    | 'health' | 'swot'
    | 'customers' | 'products' | 'growth' | 'pricing';

const SECTION_TABS: Record<SectionKey, { key: SubTab; label: string }[]> = {
    statements: [
        { key: 'balancesheet', label: 'What I Own & Owe' },
        { key: 'pnl',          label: 'Profit & Loss' },
        { key: 'inventory',    label: 'Stock' },
        { key: 'accrual',      label: 'Cash Flow' },
    ],
    operations: [
        { key: 'aging', label: 'Who Owes Me' },
        { key: 'tax',   label: 'Tax' },
    ],
    planning: [
        { key: 'budget',   label: 'Budget' },
        { key: 'cashflow', label: 'Cash Timeline' },
        { key: 'cashmgmt', label: 'Cash Safety' },
        { key: 'debt',     label: 'Loans & Debt' },
        { key: 'assets',   label: 'Assets' },
    ],
    growth: [
        { key: 'growth',    label: 'Growth' },
        { key: 'customers', label: 'Best Customers' },
        { key: 'products',  label: 'Best Products' },
        { key: 'pricing',   label: 'Pricing' },
    ],
    analysis: [
        { key: 'health', label: 'Business Score' },
        { key: 'swot',   label: 'SWOT' },
    ],
};

const PERIOD_AWARE: SubTab[] = ['balancesheet', 'pnl', 'aging', 'tax', 'inventory'];

const PERIODS: { key: ReportPeriod; label: string }[] = [
    { key: 'month',   label: 'This Month' },
    { key: 'quarter', label: '3 Months' },
    { key: 'year',    label: 'This Year' },
    { key: 'all',     label: 'All Time' },
    { key: 'custom',  label: 'Custom' },
];

export default function ReportsScreen() {
    const { finance: allFinance, settings, updateSettings, transactions, assets, navParams, inventory, invoices } = useApp();
    const { currency, minReserve, targetMargin } = settings;

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
    const finance = useMemo(
        () => computeFinance(filteredTx, settings),
        [filteredTx, settings]
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
            setSection(s);
            if (navParams.reportTab) {
                setActiveTab(navParams.reportTab as SubTab);
            } else {
                setActiveTab(SECTION_TABS[s][0].key);
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const periodActive = PERIOD_AWARE.includes(activeTab);

    const handleSectionChange = (s: SectionKey) => {
        setSection(s);
        setActiveTab(SECTION_TABS[s][0].key);
    };

    const exportPnL = async () => {
        const csv = transactionsToCSV(filteredTx);
        await Share.share({ message: csv, title: 'P&L Export' });
    };

    return (
        <SafeAreaView style={styles.safe}>
            <Header />

            {/* ── Section picker ────────────────────────────────────── */}
            <View style={styles.sectionRow}>
                {SECTIONS.map(s => (
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
                        <BalanceSheetTab
                            finance={finance}
                            wcMetrics={wcMetrics}
                            assets={assets}
                            settings={settings}
                            updateSettings={updateSettings}
                            currency={currency}
                            bizSize={bizSize}
                        />
                    )}

                    {/* ── P & L ────────────────────────────────────────── */}
                    {activeTab === 'pnl' && (
                        <View>
                            <PeriodLabel period={period} />
                            <View style={styles.card}>
                                <View style={styles.cardHeaderRow}>
                                    <Text style={styles.cardTitle}>Profit & Loss</Text>
                                    <TouchableOpacity style={styles.exportBtn} onPress={exportPnL}>
                                        <Text style={styles.exportText}>Export CSV</Text>
                                    </TouchableOpacity>
                                </View>
                                <StatRow label="Total Revenue (Money In)"             value={`${currency}${enhPnL.revenue.toLocaleString()}`}                                           color={Colors.income} />
                                <StatRow label="  Cost of Goods Sold"                 value={`-${currency}${enhPnL.cogs.toLocaleString()}`}                                          color={Colors.expense} indent />
                                <StatRow label="Gross Profit"                         value={`${currency}${enhPnL.grossProfit.toLocaleString()}`}                                  color={enhPnL.grossProfit >= 0 ? Colors.income : Colors.expense} bold />
                                <StatRow label="  Gross Margin %"                     value={`${(isNaN(enhPnL.grossMargin) ? 0 : enhPnL.grossMargin).toFixed(1)}%`}               color={Colors.textMuted} indent />
                                <StatRow label="  Running Costs (rent, salaries, admin)" value={`-${currency}${enhPnL.sgaExpenses.toLocaleString()}`}                              color={Colors.expense} indent />
                                <StatRow label="Operating Profit"                     value={`${enhPnL.ebit >= 0 ? '+' : ''}${currency}${enhPnL.ebit.toLocaleString()}`}           color={enhPnL.ebit >= 0 ? Colors.income : Colors.expense} bold />
                                <StatRow label="  Operating Margin %"                 value={`${(isNaN(enhPnL.ebitMargin) ? 0 : enhPnL.ebitMargin).toFixed(1)}%`}                 color={Colors.textMuted} indent />
                                <StatRow label="  Equipment Depreciation (non-cash)"  value={`+${currency}${enhPnL.depreciation.toLocaleString()}`}                               color={Colors.textMuted} indent />
                                <StatRow label="Cash Profit"                          value={`${enhPnL.ebitda >= 0 ? '+' : ''}${currency}${enhPnL.ebitda.toLocaleString()}`}      color={enhPnL.ebitda >= 0 ? Colors.income : Colors.expense} bold />
                                <StatRow label="Net Profit (Bottom Line)"             value={`${enhPnL.netProfit >= 0 ? '+' : ''}${currency}${enhPnL.netProfit.toLocaleString()}`} color={enhPnL.netProfit >= 0 ? Colors.income : Colors.expense} bold />
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
                        <EnhancedDebtManagement
                            finance={allFinance}
                            currency={currency}
                        />
                    )}

                    {/* ── ASSET PRODUCTIVITY ───────────────────────────── */}
                    {activeTab === 'assets' && (
                        <AssetProductivityAnalysis
                            finance={allFinance}
                            assets={assets}
                            currency={currency}
                        />
                    )}

                    {/* ── HEALTH SCORE ─────────────────────────────────── */}
                    {activeTab === 'health' && (
                        <FinancialHealthAssessment
                            finance={allFinance}
                            transactions={transactions}
                            assets={assets}
                            currency={currency}
                            minReserve={minReserve}
                            targetMargin={targetMargin}
                        />
                    )}

                    {/* ── SWOT ─────────────────────────────────────────── */}
                    {activeTab === 'swot' && <SwotAnalysis />}

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
                        <PricingOptimizer
                            currentRevenue={allFinance.income}
                            currentMargin={allFinance.margin}
                            currency={currency}
                        />
                    )}

                </View>
            </ScrollView>

            <FooterNav />
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
                <Text style={styles.cardTitle}>COGS Analysis</Text>
                <StatRow label="Total Stock Cost Value"    value={`${currency}${totalStockCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}   color={Colors.expense} />
                <StatRow label="Potential Revenue"         value={`${currency}${potentialRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}  color={Colors.income} />
                <StatRow label="Potential Gross Profit"    value={`${currency}${potentialProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}   color={potentialProfit >= 0 ? Colors.income : Colors.expense} bold />
                <StatRow label="Gross Margin %"            value={`${grossMargin.toFixed(1)}%`}                                                              color={Colors.textMuted} />
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
                <Text style={styles.cardTitle}>Inventory-to-Revenue Ratio</Text>
                <StatRow label="Stock Value"    value={`${currency}${totalStockCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}  color={Colors.asset} />
                <StatRow label="Total Revenue"  value={`${currency}${totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}    color={Colors.income} />
                <StatRow label="Ratio"          value={`${stockToRevRatio.toFixed(1)}%`}                                                        color={ratioColor} bold />
                <Text style={styles.note}>
                    For every $1 of revenue you have ${(totalRevenue > 0 ? totalStockCost / totalRevenue : 0).toFixed(2)} of stock tied up
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
            const yr  = (Date.now() - new Date(a.purchaseDate).getTime()) / (1000 * 60 * 60 * 24 * 365);
            const dep = Math.min(yr * (a.purchaseCost - a.residualValue) / a.usefulLifeYears, a.purchaseCost - a.residualValue);
            return sum + Math.max(a.residualValue, a.purchaseCost - dep);
        }, 0);

    const manualAssets    = parseFloat(openingAssets) || 0;
    const otherAssets     = parseFloat(openingOtherAssets) || 0;
    const manualLiab      = parseFloat(openingLiabilities) || 0;
    const loans           = parseFloat(openingLoans) || 0;
    const currentAssets   = finance.cashBalance + wcMetrics.accountsReceivable;
    const totalAssets     = currentAssets + registeredAssetValue + manualAssets + otherAssets;
    const totalLiab       = wcMetrics.accountsPayable + manualLiab + loans;
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
                <StatRow label="Cash on Hand"                       value={`${currency}${finance.cashBalance.toLocaleString()}`}              color={Colors.income} />
                <StatRow label="  Money Owed to You by Customers"   value={`${currency}${wcMetrics.accountsReceivable.toLocaleString()}`}     color={Colors.income} indent />
                <StatRow label="Short-Term Assets Total"            value={`${currency}${currentAssets.toLocaleString()}`}                   color={Colors.asset} bold />
                <StatRow label="  Equipment & Property (Asset Register)" value={`${currency}${registeredAssetValue.toLocaleString()}`}       color={Colors.asset} indent />
                <StatRow label="  Equipment & Property (Manual Entry)"   value={`${currency}${manualAssets.toLocaleString()}`}               color={Colors.asset} indent />
                <StatRow label="  Other Assets You Own"             value={`${currency}${otherAssets.toLocaleString()}`}                     color={Colors.asset} indent />
                <StatRow label="Everything You Own"                 value={`${currency}${totalAssets.toLocaleString()}`}                     color={Colors.asset} bold />

                <SectionHeader label="WHAT YOU OWE (DEBTS)" />
                <StatRow label="  Bills Owed to Suppliers"          value={`${currency}${wcMetrics.accountsPayable.toLocaleString()}`}       color={Colors.liability} indent />
                <StatRow label="  Bank Loans & Other Debt"          value={`${currency}${loans.toLocaleString()}`}                          color={Colors.liability} indent />
                <StatRow label="  Other Amounts Owed"               value={`${currency}${manualLiab.toLocaleString()}`}                     color={Colors.liability} indent />
                <StatRow label="Everything You Owe"                 value={`${currency}${totalLiab.toLocaleString()}`}                      color={Colors.liability} bold />

                <SectionHeader label="YOUR BUSINESS VALUE" />
                <StatRow label="Net Worth (Assets − Debts)"         value={`${currency}${equity.toLocaleString()}`}                         color={equity >= 0 ? Colors.equity : Colors.expense} bold />
                <StatRow label="Day-to-Day Cash Buffer"             value={`${currency}${wcMetrics.netWorkingCapital.toLocaleString()}`}     color={wcMetrics.netWorkingCapital >= 0 ? Colors.income : Colors.expense} />

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
                            label="Bank Loans & Debt"
                            hint="Total outstanding loan balances, overdrafts, credit lines"
                            value={openingLoans}
                            onChange={setOpeningLoans}
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

function StatRow({ label, value, color, bold, indent }: { label: string; value: string; color: string; bold?: boolean; indent?: boolean }) {
    return (
        <View style={rowStyles.row}>
            <Text style={[rowStyles.label, bold && rowStyles.labelBold, indent && rowStyles.labelIndent]}>{label}</Text>
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

    card:          { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 16 },
    cardTitle:     { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 12 },
    cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    note:          { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic', marginTop: 10, lineHeight: 16 },
    sizeBadge:     { fontSize: 11, color: Colors.primary, fontWeight: '600', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.primary, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
    exportBtn:     { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: Colors.primary, borderRadius: 8 },
    exportText:    { fontSize: 11, color: Colors.textPrimary, fontWeight: '600' },
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
