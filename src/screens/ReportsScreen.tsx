import React, { useMemo, useState, useEffect } from 'react';
import {
    SafeAreaView, ScrollView, View, Text,
    TouchableOpacity, StyleSheet, Dimensions, Share,
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
import CashFlowStatement from '../components/CashFlowStatement';
import { filterByPeriod, computeFinance, computeMonthlyTrend, computeEnhancedPnL, computeWorkingCapitalMetrics, classifyBusinessSize, sizeLabel, transactionsToCSV, ReportPeriod, MonthlyPoint } from '../utils/finance';

// ─── Section groups ────────────────────────────────────────────────────────────
type SectionKey = 'statements' | 'operations' | 'planning' | 'analysis';

const SECTIONS: { key: SectionKey; label: string }[] = [
    { key: 'statements', label: 'Statements' },
    { key: 'operations', label: 'Operations' },
    { key: 'planning',   label: 'Planning' },
    { key: 'analysis',   label: 'Analysis' },
];

type SubTab =
    | 'balancesheet' | 'pnl'
    | 'aging' | 'tax'
    | 'budget' | 'cashflow' | 'cashmgmt' | 'debt'
    | 'health' | 'swot';

const SECTION_TABS: Record<SectionKey, { key: SubTab; label: string }[]> = {
    statements: [
        { key: 'balancesheet', label: 'Balance Sheet' },
        { key: 'pnl',          label: 'P & L' },
    ],
    operations: [
        { key: 'aging', label: 'AR / AP Aging' },
        { key: 'tax',   label: 'Tax Summary' },
    ],
    planning: [
        { key: 'budget',   label: 'Budget Forecast' },
        { key: 'cashflow', label: 'Cash Flow' },
        { key: 'cashmgmt', label: 'Cash Mgmt' },
        { key: 'debt',     label: 'Debt' },
    ],
    analysis: [
        { key: 'health', label: 'Health Score' },
        { key: 'swot',   label: 'SWOT' },
    ],
};

const PERIOD_AWARE: SubTab[] = ['balancesheet', 'pnl', 'aging', 'tax'];

const PERIODS: { key: ReportPeriod; label: string }[] = [
    { key: 'month',   label: 'This Month' },
    { key: 'quarter', label: '3 Months' },
    { key: 'year',    label: 'This Year' },
    { key: 'all',     label: 'All Time' },
];

export default function ReportsScreen() {
    const { finance: allFinance, settings, transactions, assets, navParams } = useApp();
    const { currency, minReserve, targetMargin } = settings;

    const [section, setSection]     = useState<SectionKey>('statements');
    const [activeTab, setActiveTab] = useState<SubTab>('balancesheet');
    const [period, setPeriod]       = useState<ReportPeriod>('all');

    const filteredTx = useMemo(
        () => filterByPeriod(transactions, period),
        [transactions, period]
    );
    const finance = useMemo(
        () => computeFinance(filteredTx, settings),
        [filteredTx, settings]
    );
    const trend      = useMemo(() => computeMonthlyTrend(transactions, 6), [transactions]);
    const enhPnL     = useMemo(() => computeEnhancedPnL(filteredTx, assets), [filteredTx, assets]);
    const wcMetrics  = useMemo(() => computeWorkingCapitalMetrics(filteredTx), [filteredTx]);
    const bizSize    = classifyBusinessSize(enhPnL.revenue);

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
                <View style={styles.periodRow}>
                    {PERIODS.map(p => (
                        <TouchableOpacity
                            key={p.key}
                            style={[styles.periodBtn, period === p.key && styles.periodBtnActive]}
                            onPress={() => setPeriod(p.key)}
                        >
                            <Text style={[styles.periodText, period === p.key && styles.periodTextActive]}>
                                {p.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            <ScrollView style={styles.scroll}>
                <View style={styles.pad}>

                    {/* ── BALANCE SHEET ────────────────────────────────── */}
                    {activeTab === 'balancesheet' && (
                        <View>
                            <PeriodLabel period={period} />
                            <View style={styles.card}>
                                <View style={styles.cardHeaderRow}>
                                    <Text style={styles.cardTitle}>Balance Sheet</Text>
                                    <Text style={styles.sizeBadge}>{sizeLabel(bizSize)}</Text>
                                </View>
                                <SectionHeader label="ASSETS" />
                                <StatRow label="Cash / Net Operating Cash"  value={`${currency}${finance.cashBalance.toLocaleString()}`}     color={Colors.income} />
                                <StatRow label="Accounts Receivable (AR)"  value={`${currency}${wcMetrics.accountsReceivable.toLocaleString()}`} color={Colors.income} />
                                <StatRow label="Current Assets Total"      value={`${currency}${(finance.cashBalance + wcMetrics.accountsReceivable).toLocaleString()}`} color={Colors.asset} bold />
                                <StatRow label="Fixed Assets (Opening)"    value={`${currency}${(parseFloat(settings.openingAssets)||0).toLocaleString()}`} color={Colors.asset} />
                                <StatRow label="Fixed Assets (Registered)" value={`${currency}${assets.filter(a=>a.status==='active').reduce((s,a)=>{const yr=(Date.now()-new Date(a.purchaseDate).getTime())/(1000*60*60*24*365);const dep=Math.min(yr*(a.purchaseCost-a.residualValue)/a.usefulLifeYears,a.purchaseCost-a.residualValue);return s+Math.max(a.residualValue,a.purchaseCost-dep);},0).toLocaleString()}`} color={Colors.asset} />
                                <StatRow label="Total Assets"              value={`${currency}${finance.assets.toLocaleString()}`}           color={Colors.asset} bold />
                                <SectionHeader label="LIABILITIES" />
                                <StatRow label="Accounts Payable (AP)"     value={`${currency}${wcMetrics.accountsPayable.toLocaleString()}`} color={Colors.liability} />
                                <StatRow label="Other Liabilities"         value={`${currency}${(parseFloat(settings.openingLiabilities)||0).toLocaleString()}`} color={Colors.liability} />
                                <StatRow label="Total Liabilities"         value={`${currency}${finance.liabilities.toLocaleString()}`}      color={Colors.liability} bold />
                                <SectionHeader label="EQUITY" />
                                <StatRow label="Owner's Equity"            value={`${currency}${finance.equity.toLocaleString()}`}           color={Colors.equity} bold />
                                <StatRow label="Net Working Capital"       value={`${currency}${wcMetrics.netWorkingCapital.toLocaleString()}`} color={wcMetrics.netWorkingCapital >= 0 ? Colors.income : Colors.expense} />
                                <Text style={styles.note}>
                                    Update opening balances in Settings → Opening Balance Sheet.
                                </Text>
                            </View>
                            <KpiRow items={[
                                { label: 'Revenue',  value: `${currency}${finance.income.toLocaleString()}`,  color: Colors.income },
                                { label: 'Expenses', value: `${currency}${finance.expense.toLocaleString()}`, color: Colors.expense },
                                { label: 'Profit',   value: `${currency}${finance.profit.toLocaleString()}`,  color: finance.profit >= 0 ? Colors.income : Colors.expense },
                            ]} />
                        </View>
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
                                <StatRow label="Revenue"           value={`${currency}${enhPnL.revenue.toLocaleString()}`}                       color={Colors.income} />
                                <StatRow label="  Cost of Goods Sold (COGS)" value={`-${currency}${enhPnL.cogs.toLocaleString()}`}              color={Colors.expense} indent />
                                <StatRow label="Gross Profit"      value={`${currency}${enhPnL.grossProfit.toLocaleString()}`}                   color={enhPnL.grossProfit >= 0 ? Colors.income : Colors.expense} bold />
                                <StatRow label="  Gross Margin"    value={`${enhPnL.grossMargin.toFixed(1)}%`}                                   color={Colors.textMuted} indent />
                                <StatRow label="  SG&A Expenses"   value={`-${currency}${enhPnL.sgaExpenses.toLocaleString()}`}                  color={Colors.expense} indent />
                                <StatRow label="EBIT"              value={`${enhPnL.ebit >= 0 ? '+' : ''}${currency}${enhPnL.ebit.toLocaleString()}`} color={enhPnL.ebit >= 0 ? Colors.income : Colors.expense} bold />
                                <StatRow label="  EBIT Margin"     value={`${enhPnL.ebitMargin.toFixed(1)}%`}                                    color={Colors.textMuted} indent />
                                <StatRow label="  Depreciation & Amortisation" value={`+${currency}${enhPnL.depreciation.toLocaleString()}`}     color={Colors.textMuted} indent />
                                <StatRow label="EBITDA"            value={`${enhPnL.ebitda >= 0 ? '+' : ''}${currency}${enhPnL.ebitda.toLocaleString()}`} color={enhPnL.ebitda >= 0 ? Colors.income : Colors.expense} bold />
                                <StatRow label="Net Profit"        value={`${enhPnL.netProfit >= 0 ? '+' : ''}${currency}${enhPnL.netProfit.toLocaleString()}`} color={enhPnL.netProfit >= 0 ? Colors.income : Colors.expense} bold />
                                <StatRow label="Net Margin"        value={`${enhPnL.netMargin.toFixed(1)}%`}                                     color={enhPnL.netMargin >= parseFloat(targetMargin) ? Colors.income : Colors.expense} />
                                <StatRow label="Target Margin"     value={`${targetMargin}%`}                                                     color={Colors.textMuted} />
                                <StatRow label="Tax Collected"     value={`${currency}${finance.totalTaxCollected.toLocaleString()}`}             color={Colors.warning} />
                                <StatRow label="Tax Paid"          value={`${currency}${finance.totalTaxPaid.toLocaleString()}`}                  color={Colors.warning} />
                            </View>

                            <View style={styles.card}>
                                <Text style={styles.cardTitle}>Working Capital</Text>
                                <StatRow label="Accounts Receivable"  value={`${currency}${wcMetrics.accountsReceivable.toLocaleString()}`}  color={Colors.income} />
                                <StatRow label="Accounts Payable"     value={`${currency}${wcMetrics.accountsPayable.toLocaleString()}`}     color={Colors.liability} />
                                <StatRow label="Net Working Capital"  value={`${currency}${wcMetrics.netWorkingCapital.toLocaleString()}`}   color={wcMetrics.netWorkingCapital >= 0 ? Colors.income : Colors.expense} bold />
                                <StatRow label="DSO (Days Sales Outstanding)" value={`${wcMetrics.dso.toFixed(0)} days`}                    color={Colors.textSecondary} />
                                <StatRow label="DPO (Days Payable Outstanding)" value={`${wcMetrics.dpo.toFixed(0)} days`}                  color={Colors.textSecondary} />
                                <StatRow label="CCC (Cash Conversion Cycle)" value={`${wcMetrics.ccc.toFixed(0)} days`}                     color={wcMetrics.ccc <= 30 ? Colors.income : wcMetrics.ccc <= 60 ? Colors.warning : Colors.expense} />
                            </View>

                            <MonthlyChart trend={trend} currency={currency} />
                        </View>
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

                    {/* ── DEBT ─────────────────────────────────────────── */}
                    {activeTab === 'debt' && (
                        <DebtAnalysis
                            finance={allFinance}
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

                </View>
            </ScrollView>

            <FooterNav />
        </SafeAreaView>
    );
}

// ─── Helper components ─────────────────────────────────────────────────────────

function PeriodLabel({ period }: { period: ReportPeriod }) {
    const labels: Record<ReportPeriod, string> = {
        month: 'Last 30 days', quarter: 'Last 3 months',
        year: 'Last 12 months', all: 'All time',
    };
    return <Text style={styles.periodLabel}>{labels[period]}</Text>;
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
