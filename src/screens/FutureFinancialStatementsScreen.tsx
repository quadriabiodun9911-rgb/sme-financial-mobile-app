import React, { useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import Icon from '../components/ui/Icon';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import { buildFutureFinancialStatements, NO_ADJUSTMENTS, ForecastAdjustments } from '../utils/futureFinancialStatements';
import { computeForecastSummary, describeCashFlowPressure, ForecastPeriod, PERIOD_LABELS } from '../utils/forecastSummary';
import { getEconomicReference } from '../utils/economicContext';
import { DRIVER_LABEL } from '../utils/externalRiskInsights';

type Statement = 'pnl' | 'cashflow' | 'balance';

function Row({ label, value, valueColor, bold }: { label: string; value: string; valueColor?: string; bold?: boolean }) {
    return (
        <View style={s.row}>
            <Text style={[s.rowLabel, bold && s.rowLabelBold]}>{label}</Text>
            <Text style={[s.rowValue, bold && s.rowValueBold, valueColor ? { color: valueColor } : null]}>{value}</Text>
        </View>
    );
}

function AdjustmentInput({ label, value, onChange, suffix }: { label: string; value: string; onChange: (v: string) => void; suffix: string }) {
    return (
        <View style={s.inputRow}>
            <Text style={s.inputLabel}>{label}</Text>
            <View style={s.inputWrap}>
                <TextInput
                    style={s.input}
                    value={value}
                    onChangeText={onChange}
                    keyboardType="numbers-and-punctuation"
                    placeholder="0"
                    placeholderTextColor={Colors.textSecondary}
                />
                <Text style={s.inputSuffix}>{suffix}</Text>
            </View>
        </View>
    );
}

export default function FutureFinancialStatementsScreen() {
    const { transactions, loans, finance, settings, staff, goBack } = useApp();
    const { currency } = settings;

    const [activeStatement, setActiveStatement] = useState<Statement>('pnl');
    const [horizon, setHorizon] = useState<6 | 12>(6);
    const [selectedMonthIdx, setSelectedMonthIdx] = useState(0);
    const [forecastPeriod, setForecastPeriod] = useState<ForecastPeriod>('90d');

    const [revenueGrowth, setRevenueGrowth] = useState('0');
    const [expenseGrowth, setExpenseGrowth] = useState('0');
    const [extraMonthlyCost, setExtraMonthlyCost] = useState('0');
    const [newLoanAmount, setNewLoanAmount] = useState('0');
    const [newLoanRate, setNewLoanRate] = useState('0');
    const [newLoanTerm, setNewLoanTerm] = useState('0');

    const adjustments: ForecastAdjustments = useMemo(() => ({
        revenueGrowthPctPerMonth: parseFloat(revenueGrowth) || 0,
        expenseGrowthPctPerMonth: parseFloat(expenseGrowth) || 0,
        oneOffMonthlyCostAdd: parseFloat(extraMonthlyCost) || 0,
        newLoanAmount: parseFloat(newLoanAmount) || 0,
        newLoanAnnualRatePct: parseFloat(newLoanRate) || 0,
        newLoanTermMonths: parseFloat(newLoanTerm) || 0,
    }), [revenueGrowth, expenseGrowth, extraMonthlyCost, newLoanAmount, newLoanRate, newLoanTerm]);

    const hasAdjustments = JSON.stringify(adjustments) !== JSON.stringify(NO_ADJUSTMENTS);

    const macroAssumptions = settings.macroAssumptions ?? [];
    const forecast = useMemo(
        () => buildFutureFinancialStatements(transactions, loans, finance, adjustments, horizon, staff, macroAssumptions),
        [transactions, loans, finance, adjustments, horizon, staff, macroAssumptions],
    );
    const baseline = useMemo(
        () => buildFutureFinancialStatements(transactions, loans, finance, NO_ADJUSTMENTS, horizon, staff, macroAssumptions),
        [transactions, loans, finance, horizon, staff, macroAssumptions],
    );
    // Headline summary + revenue/expense/profit breakdowns, driven by the
    // same adjustments as the detailed statements below but on the
    // shorter, glance-friendly 30/60/90-day/12-month periods this section
    // is framed around, rather than the 6/12-month statement horizon.
    const forecastSummary = useMemo(
        () => computeForecastSummary(transactions, loans, finance, forecastPeriod, staff, macroAssumptions, adjustments),
        [transactions, loans, finance, forecastPeriod, staff, macroAssumptions, adjustments],
    );

    const notEnoughData = forecast.baselineMonthsUsed === 0;
    const econRef = useMemo(() => getEconomicReference(currency), [currency]);
    const month = forecast.months[selectedMonthIdx];
    const baselineMonth = baseline.months[selectedMonthIdx];

    const fmt = (n: number) => `${currency}${Math.round(n).toLocaleString()}`;

    const actualRevRows = forecastSummary.revenueTable.filter(r => r.actual !== null);
    const forecastRevRows = forecastSummary.revenueTable.filter(r => r.forecast !== null);
    const avgActualRevenue = actualRevRows.length > 0 ? actualRevRows.reduce((s, r) => s + (r.actual ?? 0), 0) / actualRevRows.length : 0;
    const avgForecastRevenue = forecastRevRows.length > 0 ? forecastRevRows.reduce((s, r) => s + (r.forecast ?? 0), 0) / forecastRevRows.length : 0;
    const revenueChangePct = avgActualRevenue > 0 ? ((avgForecastRevenue - avgActualRevenue) / avgActualRevenue) * 100 : 0;
    const largestExpenseCategory = forecastSummary.expenseByCategory[0];
    const pb = forecastSummary.profitBridge;

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
                <TouchableOpacity onPress={goBack}><Text style={s.back}>← Back</Text></TouchableOpacity>
                <View style={s.titleRow}>
                    <Text style={s.titleEmoji}>🔮</Text>
                    <Text style={s.title}>Financial Forecast</Text>
                </View>
                <Text style={s.subtitle}>
                    See where your business is heading before you make your next decision. A projection, not a
                    guarantee — built from your recent revenue and costs, plus whatever adjustments you enter below.
                </Text>

                {notEnoughData ? (
                    <View style={s.card}>
                        <Text style={s.cardTitle}>Not enough recorded history yet</Text>
                        <Text style={s.emptyText}>
                            Log at least one month of transactions so Quad360 has a real revenue and expense
                            run-rate to project forward from.
                        </Text>
                    </View>
                ) : (
                    <>
                        {/* Period selector */}
                        <View style={s.periodRow}>
                            {(Object.keys(PERIOD_LABELS) as ForecastPeriod[]).map(p => (
                                <TouchableOpacity
                                    key={p}
                                    style={[s.periodBtn, forecastPeriod === p && s.periodBtnActive]}
                                    onPress={() => setForecastPeriod(p)}
                                >
                                    <Text style={[s.periodBtnText, forecastPeriod === p && s.periodBtnTextActive]}>{PERIOD_LABELS[p]}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Headline numbers */}
                        <View style={s.headlineGrid}>
                            <View style={s.headlineBox}>
                                <Text style={s.headlineLabel}>Expected Revenue</Text>
                                <Text style={[s.headlineVal, { color: Colors.income }]}>{fmt(forecastSummary.headline.expectedRevenue)}</Text>
                            </View>
                            <View style={s.headlineBox}>
                                <Text style={s.headlineLabel}>Expected Expenses</Text>
                                <Text style={[s.headlineVal, { color: Colors.expense }]}>{fmt(forecastSummary.headline.expectedExpenses)}</Text>
                            </View>
                            <View style={s.headlineBox}>
                                <Text style={s.headlineLabel}>Expected Profit</Text>
                                <Text style={[s.headlineVal, { color: forecastSummary.headline.expectedProfit >= 0 ? Colors.income : Colors.expense }]}>
                                    {fmt(forecastSummary.headline.expectedProfit)}
                                </Text>
                            </View>
                            <View style={s.headlineBox}>
                                <Text style={s.headlineLabel}>Expected Cash Position</Text>
                                <Text style={[s.headlineVal, { color: Colors.asset }]}>{fmt(forecastSummary.headline.expectedCashPosition)}</Text>
                            </View>
                        </View>

                        {/* Cash Flow Forecast — the centerpiece */}
                        <View style={s.card}>
                            <Text style={s.cardTitle}>💵 Cash Flow Forecast</Text>
                            <Text style={s.baselineNote}>
                                The most important number to watch — when cash actually comes in and goes out, month by month.
                            </Text>
                            {forecastSummary.cashFlowMonths.map((cf, i) => {
                                const pressureText = describeCashFlowPressure(cf);
                                return (
                                    <View key={i} style={[s.cashFlowMonthCard, cf.pressured && s.cashFlowMonthCardPressured]}>
                                        <Text style={s.cashFlowMonthTitle}>📅 {cf.monthLabel}</Text>
                                        <Row label="Expected inflow" value={fmt(cf.inflow)} valueColor={Colors.income} />
                                        <Row label="Expected outflow" value={fmt(cf.outflow)} valueColor={Colors.expense} />
                                        <Row
                                            label="Net cash movement"
                                            value={`${cf.net >= 0 ? '+' : ''}${fmt(cf.net)}${cf.pressured ? ' ⚠️' : ''}`}
                                            valueColor={cf.net >= 0 ? Colors.income : Colors.expense}
                                            bold
                                        />
                                        {pressureText && <Text style={s.cashFlowPressureText}>{pressureText}</Text>}
                                    </View>
                                );
                            })}
                        </View>

                        {/* Revenue Forecast */}
                        <View style={s.card}>
                            <Text style={s.cardTitle}>📈 Revenue Forecast</Text>
                            <Text style={s.baselineNote}>Next {PERIOD_LABELS[forecastPeriod]}</Text>
                            <View style={s.tableHeaderRow}>
                                <Text style={[s.tableCell, s.tableHeaderText, { flex: 1.3 }]}>Period</Text>
                                <Text style={[s.tableCell, s.tableHeaderText]}>Actual</Text>
                                <Text style={[s.tableCell, s.tableHeaderText]}>Forecast</Text>
                            </View>
                            {forecastSummary.revenueTable.map((row, i) => (
                                <View key={i} style={s.tableRow}>
                                    <Text style={[s.tableCell, { flex: 1.3, color: Colors.textSecondary }]}>{row.monthLabel}</Text>
                                    <Text style={s.tableCell}>{row.actual != null ? fmt(row.actual) : '—'}</Text>
                                    <Text style={[s.tableCell, { color: Colors.income }]}>{row.forecast != null ? fmt(row.forecast) : '—'}</Text>
                                </View>
                            ))}
                            {avgActualRevenue > 0 && (
                                <View style={s.insightBox}>
                                    <Text style={s.insightBoxTitle}>🤖 Quad360 Insight</Text>
                                    <Text style={s.insightBoxText}>
                                        Revenue is projected to {revenueChangePct >= 0 ? 'increase' : 'decrease'} approximately {Math.abs(revenueChangePct).toFixed(0)}%
                                        over the next {PERIOD_LABELS[forecastPeriod].toLowerCase()}, based on your recent sales trend.
                                    </Text>
                                    <Text style={s.confidenceText}>Forecast confidence: {forecastSummary.confidencePct}%</Text>
                                </View>
                            )}
                        </View>

                        {/* Expense Forecast */}
                        <View style={s.card}>
                            <Text style={s.cardTitle}>💸 Expense Forecast</Text>
                            <Text style={s.baselineNote}>Expected next {PERIOD_LABELS[forecastPeriod].toLowerCase()}</Text>
                            {forecastSummary.expenseByCategory.map(c => (
                                <Row key={c.category} label={c.category} value={fmt(c.amount)} />
                            ))}
                            <Row label="Total projected expenses" value={fmt(forecastSummary.headline.expectedExpenses)} bold />
                            {largestExpenseCategory && (
                                <Text style={s.insightLine}>
                                    ⚠️ {largestExpenseCategory.category} purchases are expected to be your largest cash outflow over the next {PERIOD_LABELS[forecastPeriod].toLowerCase()}.
                                </Text>
                            )}
                        </View>

                        {/* Profit Forecast */}
                        <View style={s.card}>
                            <Text style={s.cardTitle}>📊 Profit Forecast</Text>
                            <Row label="Projected Revenue" value={fmt(pb.revenue)} />
                            <Row label="Projected COGS" value={`−${fmt(pb.cogs)}`} valueColor={Colors.expense} />
                            <Row label="Gross Profit" value={fmt(pb.grossProfit)} bold />
                            <Row label="Operating Expenses" value={`−${fmt(pb.operatingExpenses)}`} valueColor={Colors.expense} />
                            <Row label="Projected Net Profit" value={fmt(pb.netProfit)} valueColor={pb.netProfit >= 0 ? Colors.income : Colors.expense} bold />
                            <Row label="Projected Margin" value={`${pb.forecastMarginPct.toFixed(1)}%`} />
                            <View style={s.marginCompareBox}>
                                <Text style={s.marginCompareLine}>Current margin: {pb.currentMarginPct.toFixed(1)}%</Text>
                                <Text style={s.marginCompareLine}>Forecast margin: {pb.forecastMarginPct.toFixed(1)}%</Text>
                                <Text style={[s.marginCompareDelta, { color: pb.marginDeltaPct >= 0 ? Colors.income : Colors.expense }]}>
                                    {pb.marginDeltaPct >= 0 ? '🟢 +' : '🔴 '}{pb.marginDeltaPct.toFixed(1)} percentage points
                                </Text>
                            </View>
                        </View>

                        <View style={s.card}>
                            <Text style={s.cardTitle}>Already factored in from your data</Text>
                            <Text style={s.baselineNote}>
                                This forecast doesn't just extrapolate a trend — it pulls in what's actually
                                recorded elsewhere in the app.
                            </Text>
                            <Row label="Active staff payroll" value={fmt(forecast.activePayrollMonthlyCost)} />
                            {forecast.payrollGapIncluded > 0 && (
                                <Row
                                    label="↳ not yet in your expense average — added automatically"
                                    value={fmt(forecast.payrollGapIncluded)}
                                    valueColor={Colors.warning}
                                />
                            )}
                            <Row label="Existing loan payments" value={`${fmt(forecast.existingLoanMonthlyPayment)}/mo`} />
                            {forecast.unpaidInventoryPurchases > 0 && (
                                <Row label="Unpaid inventory/supplier bills" value={fmt(forecast.unpaidInventoryPurchases)} valueColor={Colors.warning} />
                            )}
                            {forecast.knownReceivables > 0 && (
                                <Row label="Unpaid customer invoices" value={fmt(forecast.knownReceivables)} />
                            )}
                        </View>

                        {forecast.riskAdjustedCategory && (
                            <View style={s.riskCard}>
                                <View style={s.riskTitleRow}>
                                    <Icon name="alert-triangle" size={14} color={Colors.warning} />
                                    <Text style={[s.riskTitle, s.riskTitleInRow]}>Rising Cost Trend Factored In</Text>
                                </View>
                                <Text style={s.riskText}>
                                    <Text style={s.riskBold}>{forecast.riskAdjustedCategory}</Text> is currently{' '}
                                    {fmt(forecast.riskAdjustedCategoryMonthlySpend)}/mo and has been growing about{' '}
                                    {forecast.riskAdjustedCategoryGrowthPct.toFixed(0)}% every {forecast.riskAdjustedCategoryWindowMonths} months
                                    {forecast.riskAdjustedCategoryInsight ? ` — tied to the ${DRIVER_LABEL[forecast.riskAdjustedCategoryInsight.driver]} assumption you noted in Macro Assumptions` : ''}.
                                    {' '}Rather than blend it into a flat cost-growth %, this forecast projects it forward at its own pace, so the numbers below already reflect it continuing to outrun the rest of your expenses.
                                </Text>
                                <Text style={s.riskProjected}>
                                    Projected by {month.monthLabel}:{' '}
                                    {fmt(forecast.riskAdjustedCategoryMonthlySpend * Math.pow(1 + forecast.riskAdjustedCategoryGrowthPct / 100, (selectedMonthIdx + 1) / forecast.riskAdjustedCategoryWindowMonths))}/mo
                                </Text>
                            </View>
                        )}

                        <View style={s.refCard}>
                            <View style={s.refTitleRow}>
                                <Icon name="map-pin" size={13} color={Colors.textPrimary} />
                                <Text style={[s.refTitle, s.refTitleInRow]}>Reference for {econRef.marketLabel}</Text>
                            </View>
                            <Text style={s.refLine}>Typical inflation: {econRef.inflationBandPct}  ·  Typical SME lending rate: {econRef.lendingRateBandPct}</Text>
                            <Text style={s.refCaveat}>
                                Illustrative, approximate bands — not live data. Use these to sanity-check the
                                adjustments below (e.g. is your price rise keeping up with inflation, is a loan
                                rate you're considering in the normal range), and verify current figures before
                                relying on them.
                            </Text>
                        </View>

                        <View style={s.card}>
                            <Text style={s.cardTitle}>Adjust the business</Text>
                            <Text style={s.baselineNote}>
                                Baseline: {fmt(forecast.baselineMonthlyRevenue)}/mo revenue, {fmt(forecast.baselineMonthlyExpense)}/mo
                                expenses — averaged over your last {forecast.baselineMonthsUsed} recorded month{forecast.baselineMonthsUsed === 1 ? '' : 's'}.
                            </Text>
                            <AdjustmentInput label="Price / revenue adjustment" value={revenueGrowth} onChange={setRevenueGrowth} suffix="%/mo" />
                            <AdjustmentInput label="Cost growth" value={expenseGrowth} onChange={setExpenseGrowth} suffix="%/mo" />
                            <AdjustmentInput label="Extra new hire(s), beyond current staff" value={extraMonthlyCost} onChange={setExtraMonthlyCost} suffix={currency} />
                            <AdjustmentInput label="New loan amount" value={newLoanAmount} onChange={setNewLoanAmount} suffix={currency} />
                            {parseFloat(newLoanAmount) > 0 && (
                                <>
                                    <AdjustmentInput label="Loan interest rate" value={newLoanRate} onChange={setNewLoanRate} suffix="%/yr" />
                                    <AdjustmentInput label="Loan term" value={newLoanTerm} onChange={setNewLoanTerm} suffix="months" />
                                </>
                            )}

                            <View style={s.horizonRow}>
                                {([6, 12] as const).map(h => (
                                    <TouchableOpacity
                                        key={h}
                                        style={[s.horizonBtn, horizon === h && s.horizonBtnActive]}
                                        onPress={() => { setHorizon(h); setSelectedMonthIdx(0); }}
                                    >
                                        <Text style={[s.horizonBtnText, horizon === h && s.horizonBtnTextActive]}>{h} months</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {hasAdjustments && (
                            <View style={s.impactCard}>
                                <Text style={s.impactTitle}>Effect by Month {horizon}</Text>
                                <Text style={s.impactLine}>
                                    Cash: {fmt(baseline.months[horizon - 1].endingCash)} → {fmt(forecast.months[horizon - 1].endingCash)}
                                    {'  '}
                                    <Text style={{ color: forecast.months[horizon - 1].endingCash >= baseline.months[horizon - 1].endingCash ? Colors.income : Colors.expense }}>
                                        ({forecast.months[horizon - 1].endingCash >= baseline.months[horizon - 1].endingCash ? '+' : ''}
                                        {fmt(forecast.months[horizon - 1].endingCash - baseline.months[horizon - 1].endingCash)})
                                    </Text>
                                </Text>
                                <Text style={s.impactLine}>
                                    Monthly profit: {fmt(baseline.months[horizon - 1].profit)} → {fmt(forecast.months[horizon - 1].profit)}
                                </Text>
                            </View>
                        )}

                        {/* Month selector */}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.monthScroll} contentContainerStyle={s.monthScrollContent}>
                            {forecast.months.map((mo, i) => (
                                <TouchableOpacity
                                    key={i}
                                    style={[s.monthChip, selectedMonthIdx === i && s.monthChipActive]}
                                    onPress={() => setSelectedMonthIdx(i)}
                                >
                                    <Text style={[s.monthChipText, selectedMonthIdx === i && s.monthChipTextActive]}>{mo.monthLabel}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        {/* Statement tabs */}
                        <View style={s.tabRow}>
                            {([
                                { key: 'pnl', label: 'P&L' },
                                { key: 'cashflow', label: 'Cash Flow' },
                                { key: 'balance', label: 'Balance Sheet' },
                            ] as { key: Statement; label: string }[]).map(t => (
                                <TouchableOpacity
                                    key={t.key}
                                    style={[s.tab, activeStatement === t.key && s.tabActive]}
                                    onPress={() => setActiveStatement(t.key)}
                                >
                                    <Text style={[s.tabText, activeStatement === t.key && s.tabTextActive]}>{t.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <View style={s.card}>
                            <Text style={s.cardTitle}>{month.monthLabel} — Projected {activeStatement === 'pnl' ? 'Profit & Loss' : activeStatement === 'cashflow' ? 'Cash Flow' : 'Balance Sheet'}</Text>

                            {activeStatement === 'pnl' && (
                                <>
                                    <Row label="Revenue" value={fmt(month.revenue)} />
                                    <Row label="Operating expenses" value={fmt(month.operatingExpenses)} />
                                    <Row label="Profit" value={fmt(month.profit)} valueColor={month.profit >= 0 ? Colors.income : Colors.expense} bold />
                                    <Row label="Profit margin" value={`${month.profitMargin.toFixed(1)}%`} />
                                </>
                            )}

                            {activeStatement === 'cashflow' && (
                                <>
                                    <Row label="Operating cash flow" value={fmt(month.operatingCashFlow)} valueColor={month.operatingCashFlow >= 0 ? Colors.income : Colors.expense} />
                                    <Row label="Financing cash flow" value={fmt(month.financingCashFlow)} valueColor={month.financingCashFlow >= 0 ? Colors.income : Colors.expense} />
                                    <Row label="Net change in cash" value={fmt(month.netCashChange)} valueColor={month.netCashChange >= 0 ? Colors.income : Colors.expense} bold />
                                    <Row label="Ending cash" value={fmt(month.endingCash)} bold />
                                </>
                            )}

                            {activeStatement === 'balance' && (
                                <>
                                    <Row label="Cash" value={fmt(month.endingCash)} />
                                    <Row label="Receivables (estimated)" value={fmt(month.receivables)} />
                                    <Row label="Other assets" value={fmt(month.otherAssets)} />
                                    <Row label="Total assets" value={fmt(month.totalAssets)} bold />
                                    <Row label="Loan balance" value={fmt(month.loanBalance)} />
                                    <Row label="Payables (estimated)" value={fmt(month.payables)} />
                                    <Row label="Other liabilities" value={fmt(month.otherLiabilities)} />
                                    <Row label="Total liabilities" value={fmt(month.totalLiabilities)} bold />
                                    <Row label="Equity" value={fmt(month.equity)} valueColor={month.equity >= 0 ? Colors.income : Colors.expense} bold />
                                </>
                            )}
                        </View>

                        <Text style={s.disclaimer}>
                            Receivables and payables are estimated from your recent collection/payment speed, not
                            tracked individually. Equity is assets minus liabilities, not independently tracked.
                            This is a planning tool, not an accounting record or a promise of future performance.
                        </Text>
                    </>
                )}
            </ScrollView>
            <FooterNav />
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: Spacing.lg, paddingBottom: 100 },
    back: { color: Colors.primary, fontSize: 15, marginBottom: Spacing.sm },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xs },
    titleEmoji: { fontSize: 22 },
    title: { fontSize: 24, fontWeight: 'bold', color: Colors.textPrimary },
    subtitle: { fontSize: 13, color: Colors.textSecondary, marginBottom: Spacing.lg, lineHeight: 18 },

    periodRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
    periodBtn: { flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.sm, backgroundColor: Colors.surfaceVariant, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
    periodBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    periodBtnText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
    periodBtnTextActive: { color: '#fff' },

    headlineGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: 14 },
    headlineBox: {
        flexBasis: '47%', flexGrow: 1, backgroundColor: Colors.surface, borderRadius: 14, padding: Spacing.md,
        borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
    },
    headlineLabel: { fontSize: 11, color: Colors.textSecondary, marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: 0.3 },
    headlineVal: { fontSize: 20, fontWeight: '800' },

    tableHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border, paddingBottom: 6, marginBottom: 4 },
    tableHeaderText: { fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase' as const, fontSize: 10 },
    tableRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
    tableCell: { flex: 1, fontSize: 13, color: Colors.textPrimary },

    insightBox: { backgroundColor: Colors.surfaceVariant, borderRadius: Radius.md, padding: Spacing.md, marginTop: Spacing.md },
    insightBoxTitle: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
    insightBoxText: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18, marginBottom: 6 },
    confidenceText: { fontSize: 11.5, fontWeight: '600', color: Colors.textMuted },
    insightLine: { fontSize: 12.5, color: Colors.warning, lineHeight: 18, marginTop: Spacing.sm },

    marginCompareBox: { backgroundColor: Colors.surfaceVariant, borderRadius: Radius.md, padding: Spacing.md, marginTop: Spacing.sm },
    marginCompareLine: { fontSize: 12.5, color: Colors.textSecondary, marginBottom: 2 },
    marginCompareDelta: { fontSize: 13, fontWeight: '700', marginTop: 4 },

    cashFlowMonthCard: {
        backgroundColor: Colors.surfaceVariant, borderRadius: Radius.md, padding: Spacing.md,
        marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.border,
    },
    cashFlowMonthCardPressured: { borderColor: Colors.warning },
    cashFlowMonthTitle: { fontSize: 13.5, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
    cashFlowPressureText: { fontSize: 12, color: Colors.warning, lineHeight: 17, marginTop: 6 },
    card: {
        backgroundColor: Colors.surface, borderRadius: 14, padding: Spacing.lg, marginBottom: 14,
        borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
    },
    cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 10 },
    emptyText: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
    baselineNote: { fontSize: 12, color: Colors.textSecondary, marginBottom: 14, lineHeight: 17 },
    refCard: {
        backgroundColor: Colors.surfaceVariant, borderRadius: Radius.md, padding: 14, marginBottom: 14,
        borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
    },
    riskCard: { backgroundColor: Colors.surface, borderRadius: 14, padding: Spacing.lg, marginBottom: 14, borderWidth: 1, borderColor: Colors.warning, ...Shadow.sm },
    riskTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
    riskTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
    riskTitleInRow: { marginBottom: 0 },
    riskText: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 19, marginBottom: Spacing.sm },
    riskBold: { fontWeight: '800', color: Colors.textPrimary },
    riskProjected: { fontSize: 12.5, fontWeight: '700', color: Colors.warning },

    refTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xs },
    refTitle: { fontSize: 13.5, fontWeight: '700', color: Colors.textPrimary },
    refTitleInRow: { marginBottom: 0 },
    refLine: { fontSize: 12.5, color: Colors.textPrimary, marginBottom: 6 },
    refCaveat: { fontSize: 11, color: Colors.textSecondary, lineHeight: 15 },

    inputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    inputLabel: { fontSize: 13, color: Colors.textPrimary, flex: 1, marginRight: Spacing.sm },
    inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceVariant, borderRadius: Radius.sm, paddingHorizontal: 10, borderWidth: 1, borderColor: Colors.border },
    input: { color: Colors.textPrimary, fontSize: 14, paddingVertical: Spacing.sm, width: 70, textAlign: 'right' },
    inputSuffix: { color: Colors.textSecondary, fontSize: 12, marginLeft: Spacing.xs },

    horizonRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: 6 },
    horizonBtn: { flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.sm, backgroundColor: Colors.surfaceVariant, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
    horizonBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    horizonBtnText: { fontSize: 12.5, color: Colors.textSecondary, fontWeight: '600' },
    horizonBtnTextActive: { color: '#fff' },

    impactCard: { backgroundColor: Colors.primary + '15', borderRadius: Radius.md, padding: 14, marginBottom: 14, borderLeftWidth: 3, borderLeftColor: Colors.primary, ...Shadow.sm },
    impactTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
    impactLine: { fontSize: 13, color: Colors.textPrimary, marginBottom: 3 },

    monthScroll: { marginBottom: 10 },
    monthScrollContent: { gap: Spacing.sm, paddingRight: Spacing.sm },
    monthChip: { paddingVertical: Spacing.sm, paddingHorizontal: 14, borderRadius: Radius.xl, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
    monthChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    monthChipText: { fontSize: 12.5, color: Colors.textSecondary, fontWeight: '600' },
    monthChipTextActive: { color: '#fff' },

    tabRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
    tab: { flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: Colors.surface, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
    tabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    tabText: { fontSize: 12.5, color: Colors.textSecondary, fontWeight: '600' },
    tabTextActive: { color: '#fff' },

    row: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border,
    },
    rowLabel: { fontSize: 13.5, color: Colors.textSecondary, flex: 1 },
    rowLabelBold: { color: Colors.textPrimary, fontWeight: '700' },
    rowValue: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, textAlign: 'right', flexShrink: 0, marginLeft: Spacing.sm },
    rowValueBold: { fontSize: 15.5, fontWeight: '800' },

    disclaimer: { fontSize: 11.5, color: Colors.textSecondary, lineHeight: 16, marginBottom: Spacing.xl },
});
