import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Colors } from '../src/theme/colors';
import { FinanceData, Transaction, Asset } from '../src/types';
import {
    classifyBusinessSize, sizeLabel, getThresholds,
    computeWorkingCapitalMetrics, computeEnhancedPnL,
} from '../src/utils/finance';

interface Props {
    finance: FinanceData;
    transactions: Transaction[];
    assets: Asset[];
    currency: string;
    minReserve: string;
    targetMargin: string;
}

type Health = 'strong' | 'stable' | 'concerning';

function score(val: number, strongThreshold: number, stableThreshold: number, higherIsBetter = true): Health {
    if (higherIsBetter) {
        if (val >= strongThreshold) return 'strong';
        if (val >= stableThreshold) return 'stable';
        return 'concerning';
    } else {
        if (val <= strongThreshold) return 'strong';
        if (val <= stableThreshold) return 'stable';
        return 'concerning';
    }
}

function healthColor(h: Health) {
    return h === 'strong' ? Colors.income : h === 'stable' ? Colors.warning : Colors.expense;
}

function healthLabel(h: Health) {
    return h === 'strong' ? 'Strong' : h === 'stable' ? 'Stable' : 'Concerning';
}

function RatioRow({ label, value, health, benchmark }: { label: string; value: string; health: Health; benchmark: string }) {
    return (
        <View style={s.ratioRow}>
            <View style={{ flex: 1 }}>
                <Text style={s.ratioLabel}>{label}</Text>
                <Text style={s.ratioBench}>{benchmark}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
                <Text style={[s.ratioVal, { color: healthColor(health) }]}>{value}</Text>
                <Text style={[s.ratioHealth, { color: healthColor(health) }]}>{healthLabel(health)}</Text>
            </View>
        </View>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <View style={s.section}>
            <Text style={s.sectionTitle}>{title}</Text>
            {children}
        </View>
    );
}

function StatLine({ label, value, color }: { label: string; value: string; color?: string }) {
    return (
        <View style={s.statLine}>
            <Text style={s.statLabel}>{label}</Text>
            <Text style={[s.statValue, color ? { color } : {}]}>{value}</Text>
        </View>
    );
}

export default function FinancialHealthAssessment({ finance, transactions, assets, currency, minReserve, targetMargin }: Props) {
    const reserve = parseFloat(minReserve) || 0;

    const size    = useMemo(() => classifyBusinessSize(finance.income), [finance.income]);
    const thresh  = useMemo(() => getThresholds(size), [size]);
    const wc      = useMemo(() => computeWorkingCapitalMetrics(transactions), [transactions]);
    const pnl     = useMemo(() => computeEnhancedPnL(transactions, assets), [transactions, assets]);

    // Ratios
    const currentRatio   = finance.liabilities > 0 ? finance.assets / finance.liabilities : finance.assets > 0 ? 99 : 0;
    const debtToEquity   = finance.equity > 0 ? finance.liabilities / finance.equity : finance.liabilities > 0 ? 99 : 0;
    const roe            = finance.equity > 0 ? (finance.profit / finance.equity) * 100 : 0;
    const equityRatio    = finance.assets > 0 ? (finance.equity / finance.assets) * 100 : 0;

    // Health scores
    const hCurrent    = score(currentRatio,  thresh.currentRatioStrong,  thresh.currentRatioStable);
    const hDTE        = score(debtToEquity,  thresh.debtToEquityStrong,  thresh.debtToEquityStable, false);
    const hROE        = score(roe,           thresh.roeStrong,           thresh.roeStable);
    const hGrossMargin= score(pnl.grossMargin, thresh.grossMarginStrong, thresh.grossMarginStable);
    const hCash       = finance.cashBalance >= reserve ? 'strong' : finance.cashBalance >= reserve * 0.5 ? 'stable' : 'concerning' as Health;

    const scores = [hCurrent, hDTE, hROE, hGrossMargin, hCash];
    const strongCount    = scores.filter(h => h === 'strong').length;
    const concerningCount= scores.filter(h => h === 'concerning').length;
    const overall: Health = strongCount >= 3 ? 'strong' : concerningCount >= 3 ? 'concerning' : 'stable';

    // Real month-over-month trend from transactions
    const now = new Date();
    const thisMonthPfx  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}`;
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthPfx  = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2,'0')}`;

    const thisRevenue  = transactions.filter(t => t.type === 'income'  && t.date.startsWith(thisMonthPfx)).reduce((s, t) => s + t.amount, 0);
    const lastRevenue  = transactions.filter(t => t.type === 'income'  && t.date.startsWith(lastMonthPfx)).reduce((s, t) => s + t.amount, 0);
    const thisExpense  = transactions.filter(t => t.type === 'expense' && t.date.startsWith(thisMonthPfx)).reduce((s, t) => s + t.amount, 0);
    const lastExpense  = transactions.filter(t => t.type === 'expense' && t.date.startsWith(lastMonthPfx)).reduce((s, t) => s + t.amount, 0);

    const revGrowth  = lastRevenue  > 0 ? ((thisRevenue  - lastRevenue)  / lastRevenue)  * 100 : null;
    const costGrowth = lastExpense  > 0 ? ((thisExpense  - lastExpense)   / lastExpense)  * 100 : null;

    return (
        <ScrollView style={{ flex: 1 }}>
            {/* Overall health badge */}
            <View style={[s.badge, { borderColor: healthColor(overall) }]}>
                <Text style={s.sizeTag}>{sizeLabel(size)}</Text>
                <Text style={[s.overallLabel, { color: healthColor(overall) }]}>
                    {overall === 'strong' ? 'Financially Strong' : overall === 'stable' ? 'Financially Stable' : 'Needs Attention'}
                </Text>
                <Text style={s.badgeSub}>{strongCount}/5 metrics strong · {concerningCount}/5 concerning</Text>
            </View>

            {/* Income Statement */}
            <Section title="Income Statement">
                <StatLine label="Revenue"       value={`${currency}${finance.income.toLocaleString()}`}  color={Colors.income} />
                <StatLine label="Cost of Revenue (COGS)" value={`${currency}${pnl.cogs.toLocaleString()}`}   color={Colors.expense} />
                <StatLine label="Gross Profit"  value={`${currency}${pnl.grossProfit.toLocaleString()}`} color={pnl.grossProfit >= 0 ? Colors.income : Colors.expense} />
                <StatLine label="Gross Margin"  value={`${pnl.grossMargin.toFixed(1)}%`}                 color={healthColor(hGrossMargin)} />
                <StatLine label="Operating Expenses (SG&A)" value={`${currency}${pnl.sgaExpenses.toLocaleString()}`} color={Colors.expense} />
                <StatLine label="EBIT"          value={`${currency}${pnl.ebit.toLocaleString()}`}        color={pnl.ebit >= 0 ? Colors.income : Colors.expense} />
                <StatLine label="Depreciation (D&A)" value={`${currency}${Math.round(pnl.depreciation).toLocaleString()}`} color={Colors.textMuted} />
                <StatLine label="EBITDA"        value={`${currency}${Math.round(pnl.ebitda).toLocaleString()}`} color={pnl.ebitda >= 0 ? Colors.income : Colors.expense} />
                {revGrowth !== null && (
                    <StatLine
                        label="Revenue vs Last Month"
                        value={`${revGrowth >= 0 ? '+' : ''}${revGrowth.toFixed(1)}%`}
                        color={revGrowth >= 0 ? Colors.income : Colors.expense}
                    />
                )}
                {costGrowth !== null && (
                    <StatLine
                        label="Cost vs Last Month"
                        value={`${costGrowth >= 0 ? '+' : ''}${costGrowth.toFixed(1)}%`}
                        color={costGrowth <= 0 ? Colors.income : Colors.expense}
                    />
                )}
            </Section>

            {/* Balance Sheet */}
            <Section title="Balance Sheet">
                <StatLine label="Total Assets"      value={`${currency}${finance.assets.toLocaleString()}`}      color={Colors.income} />
                <StatLine label="Total Liabilities" value={`${currency}${finance.liabilities.toLocaleString()}`} color={Colors.expense} />
                <StatLine label="Owner's Equity"    value={`${currency}${finance.equity.toLocaleString()}`}      color={finance.equity >= 0 ? Colors.income : Colors.expense} />
                <StatLine label="Equity Ratio"      value={`${equityRatio.toFixed(1)}%`}                         color={equityRatio >= 50 ? Colors.income : Colors.warning} />
                <StatLine label="Cash Position"     value={`${currency}${finance.cashBalance.toLocaleString()}`} color={healthColor(hCash)} />
                <StatLine label="Reserve Coverage"  value={reserve > 0 ? `${Math.round((finance.cashBalance / reserve) * 100)}%` : 'N/A'} color={healthColor(hCash)} />
            </Section>

            {/* Working Capital */}
            <Section title="Working Capital">
                <StatLine label="Accounts Receivable" value={`${currency}${wc.accountsReceivable.toLocaleString()}`} color={Colors.warning} />
                <StatLine label="Accounts Payable"    value={`${currency}${wc.accountsPayable.toLocaleString()}`}    color={Colors.expense} />
                <StatLine label="Net Working Capital" value={`${currency}${wc.netWorkingCapital.toLocaleString()}`}  color={wc.netWorkingCapital >= 0 ? Colors.income : Colors.expense} />
                <StatLine label="Days Sales Outstanding (DSO)"  value={wc.dso > 0 ? `${wc.dso} days` : 'N/A'}  color={wc.dso <= 30 ? Colors.income : wc.dso <= 60 ? Colors.warning : Colors.expense} />
                <StatLine label="Days Payable Outstanding (DPO)" value={wc.dpo > 0 ? `${wc.dpo} days` : 'N/A'} color={Colors.textSecondary} />
                <StatLine label="Cash Conversion Cycle (CCC)"   value={wc.ccc !== 0 ? `${wc.ccc} days` : 'N/A'} color={wc.ccc <= 30 ? Colors.income : wc.ccc <= 60 ? Colors.warning : Colors.expense} />
            </Section>

            {/* Key Ratios */}
            <Section title={`Key Financial Ratios · ${sizeLabel(size)}`}>
                <RatioRow
                    label="Current Ratio (Assets ÷ Liabilities)"
                    value={isFinite(currentRatio) ? currentRatio.toFixed(2) : '—'}
                    health={hCurrent}
                    benchmark={`Strong ≥ ${thresh.currentRatioStrong} · Stable ≥ ${thresh.currentRatioStable}`}
                />
                <RatioRow
                    label="Debt-to-Equity"
                    value={isFinite(debtToEquity) && debtToEquity < 99 ? debtToEquity.toFixed(2) : '∞'}
                    health={hDTE}
                    benchmark={`Strong ≤ ${thresh.debtToEquityStrong} · Stable ≤ ${thresh.debtToEquityStable}`}
                />
                <RatioRow
                    label="Return on Equity (ROE)"
                    value={`${roe.toFixed(1)}%`}
                    health={hROE}
                    benchmark={`Strong ≥ ${thresh.roeStrong}% · Stable ≥ ${thresh.roeStable}%`}
                />
                <RatioRow
                    label="Gross Margin"
                    value={`${pnl.grossMargin.toFixed(1)}%`}
                    health={hGrossMargin}
                    benchmark={`Strong ≥ ${thresh.grossMarginStrong}% · Stable ≥ ${thresh.grossMarginStable}%`}
                />
                <RatioRow
                    label="Cash Reserve Coverage"
                    value={reserve > 0 ? `${Math.round((finance.cashBalance / reserve) * 100)}%` : 'N/A'}
                    health={hCash}
                    benchmark="Strong ≥ 100% of minimum reserve"
                />
            </Section>

            {/* Recommendations */}
            <View style={s.recs}>
                <Text style={s.recsTitle}>Strategic Recommendations</Text>
                {overall === 'concerning' && <Rec text="⚠ Multiple financial stress signals detected. Prioritise cash preservation and immediate cost review." />}
                {hCurrent === 'concerning' && <Rec text={`Current ratio is ${currentRatio.toFixed(2)} — below the ${thresh.currentRatioStable} stability threshold for your business size. Reduce short-term liabilities or convert AR to cash urgently.`} />}
                {hDTE === 'concerning' && <Rec text={`Debt-to-equity ratio of ${debtToEquity.toFixed(2)} is elevated. Consider paying down liabilities before taking on new debt obligations.`} />}
                {hROE === 'concerning' && <Rec text={`ROE of ${roe.toFixed(1)}% is below the ${thresh.roeStable}% minimum for ${sizeLabel(size)}. Profitability improvements or equity restructuring needed.`} />}
                {wc.dso > 45 && <Rec text={`DSO of ${wc.dso} days means receivables take over 6 weeks to collect on average. Tighten payment terms and follow up overdue invoices immediately.`} />}
                {wc.ccc > 60 && <Rec text={`Cash conversion cycle of ${wc.ccc} days is long. Accelerating collections (DSO) or extending supplier terms (DPO) would free up working capital.`} />}
                {pnl.cogs === 0 && pnl.sgaExpenses > 0 && <Rec text="No cost-of-revenue (COGS) transactions detected. Tag expense categories containing keywords like 'cost', 'material', or 'supplier' to enable gross profit analysis." />}
                {finance.profit >= 0 && finance.cashBalance >= reserve && hROE !== 'concerning' && <Rec text={`Business is performing well for a ${sizeLabel(size)}. Consider reinvesting surplus above the minimum reserve into growth or debt reduction.`} />}
                {revGrowth !== null && revGrowth < -10 && <Rec text={`Revenue declined ${Math.abs(revGrowth).toFixed(1)}% month-over-month. Investigate root cause before it becomes a sustained trend.`} />}
            </View>
        </ScrollView>
    );
}

function Rec({ text }: { text: string }) {
    return <Text style={s.recText}>• {text}</Text>;
}

const s = StyleSheet.create({
    badge: {
        borderRadius: 12, borderWidth: 2, padding: 16, marginBottom: 14, alignItems: 'center',
        backgroundColor: Colors.surface,
    },
    sizeTag:      { fontSize: 10, color: Colors.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
    overallLabel: { fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
    badgeSub:     { fontSize: 11, color: Colors.textMuted },

    section:      { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 12 },
    sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },

    statLine:  { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
    statLabel: { fontSize: 13, color: Colors.textSecondary, flex: 1 },
    statValue: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },

    ratioRow:    { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border, flexDirection: 'row', alignItems: 'center' },
    ratioLabel:  { fontSize: 13, color: Colors.textSecondary, marginBottom: 2 },
    ratioBench:  { fontSize: 10, color: Colors.textMuted, fontStyle: 'italic' },
    ratioVal:    { fontSize: 15, fontWeight: 'bold' },
    ratioHealth: { fontSize: 10, fontWeight: '600' },

    recs:      { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 20 },
    recsTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
    recText:   { fontSize: 12, color: Colors.textSecondary, lineHeight: 18, marginBottom: 8 },
});
