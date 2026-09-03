import React, { useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import Icon from '../components/ui/Icon';
import NextStepLink from '../components/NextStepLink';
import Collapsible from '../components/Collapsible';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import { buildFutureFinancialStatements, NO_ADJUSTMENTS, ForecastAdjustments } from '../utils/futureFinancialStatements';
import { computeForecastSummary, describeCashFlowPressure, findReserveBreach, ForecastPeriod, PERIOD_LABELS } from '../utils/forecastSummary';
import { computeForecastAccuracy } from '../utils/forecastHistory';
import { computeAllTimeMonthlyBuckets } from '../utils/trendAnalysis';
import { DEFAULT_THRESHOLDS } from '../utils/alertEngine';
import { getEconomicReference } from '../utils/economicContext';
import { DRIVER_LABEL } from '../utils/externalRiskInsights';
import { RiskScore, RISK_BAND_STYLE, getMonthlyExpenseAverage } from '../utils/finance';
import { performFinancialDiagnosis } from '../utils/financialDiagnosisEngine';
import { generateActionPlan } from '../utils/actionRecommendationEngine';
import { scenarioAdjustments, summarizeScenario, SCENARIO_SWING, ScenarioName } from '../utils/scenarioForecast';
import { computeExternalScenarioStress, ImpactLevel, ProbabilityLevel } from '../utils/externalFactorsPanel';
import { explainForecastChange, explainForecastProfitChange, computeForecastWaterfallBasis } from '../utils/forecastChangeExplanation';
import { generateForecastRiskActions } from '../utils/forecastRiskRecommendations';
import { computeBiggestForecastRisk } from '../utils/forecastBiggestRisk';
import { monthlyPayment } from '../utils/loanMath';

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
    const { transactions, loans, finance, settings, staff, goBack, inventory, invoices, navigate, assets, forecastHistory } = useApp();
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
    const [discountChange, setDiscountChange] = useState('0');
    const [receivableDelay, setReceivableDelay] = useState('0');
    const [inventoryPurchase, setInventoryPurchase] = useState('0');
    const [applySeasonality, setApplySeasonality] = useState(false);

    const adjustments: ForecastAdjustments = useMemo(() => ({
        revenueGrowthPctPerMonth: parseFloat(revenueGrowth) || 0,
        expenseGrowthPctPerMonth: parseFloat(expenseGrowth) || 0,
        oneOffMonthlyCostAdd: parseFloat(extraMonthlyCost) || 0,
        newLoanAmount: parseFloat(newLoanAmount) || 0,
        newLoanAnnualRatePct: parseFloat(newLoanRate) || 0,
        newLoanTermMonths: parseFloat(newLoanTerm) || 0,
        discountPctChange: parseFloat(discountChange) || 0,
        receivableDelayDays: parseFloat(receivableDelay) || 0,
        oneOffInventoryPurchase: parseFloat(inventoryPurchase) || 0,
        applySeasonality,
    }), [revenueGrowth, expenseGrowth, extraMonthlyCost, newLoanAmount, newLoanRate, newLoanTerm, discountChange, receivableDelay, inventoryPurchase, applySeasonality]);

    const hasAdjustments = JSON.stringify(adjustments) !== JSON.stringify(NO_ADJUSTMENTS);

    const macroAssumptions = settings.macroAssumptions ?? [];
    const futureEvents = settings.futureEvents ?? [];
    const forecast = useMemo(
        () => buildFutureFinancialStatements(transactions, loans, finance, adjustments, horizon, staff, macroAssumptions, futureEvents),
        [transactions, loans, finance, adjustments, horizon, staff, macroAssumptions, futureEvents],
    );
    const baseline = useMemo(
        () => buildFutureFinancialStatements(transactions, loans, finance, NO_ADJUSTMENTS, horizon, staff, macroAssumptions, futureEvents),
        [transactions, loans, finance, horizon, staff, macroAssumptions, futureEvents],
    );
    // Headline summary + revenue/expense/profit breakdowns, driven by the
    // same adjustments as the detailed statements below but on the
    // shorter, glance-friendly 30/60/90-day/12-month periods this section
    // is framed around, rather than the 6/12-month statement horizon.
    const forecastSummary = useMemo(
        () => computeForecastSummary(transactions, loans, finance, forecastPeriod, staff, macroAssumptions, adjustments, inventory, futureEvents),
        [transactions, loans, finance, forecastPeriod, staff, macroAssumptions, adjustments, inventory, futureEvents],
    );
    // The same short period with no what-if levers applied, purely so the
    // What If? card can show "vs. no changes" next to the scenario numbers
    // above -- without this, a user would have to reset every input by
    // hand to see what they're being compared against.
    const noAdjustmentsSummary = useMemo(
        () => computeForecastSummary(transactions, loans, finance, forecastPeriod, staff, macroAssumptions, NO_ADJUSTMENTS, inventory, futureEvents),
        [transactions, loans, finance, forecastPeriod, staff, macroAssumptions, inventory, futureEvents],
    );
    // Rolling Forecast: "Forecast -> Actual -> Variance -> Update -> Forecast
    // again" -- forecastHistory (AppContext) is a monthly snapshot trail of
    // the 12-month annual revenue forecast (see forecastHistory.ts). This
    // just reads it and scores past snapshots against what actually
    // happened since, using real monthly revenue buckets already computed
    // the same way the rest of this app's trend views do.
    const monthlyRevenueByMonth = useMemo(() => {
        const map = new Map<string, number>();
        for (const b of computeAllTimeMonthlyBuckets(transactions)) map.set(b.month, b.revenue);
        return map;
    }, [transactions]);
    const forecastAccuracy = useMemo(
        () => computeForecastAccuracy(forecastHistory, monthlyRevenueByMonth),
        [forecastHistory, monthlyRevenueByMonth],
    );
    // Distinct from CashFlowMonth.pressured (net < 0 for one month) -- this
    // is "will the forecast dip below the reserve you've told Quad360 to
    // keep on hand", the question "12-Month Cash Forecast... identify
    // potential cash pressure" is actually asking. See findReserveBreach's
    // own comment for why the two can disagree.
    // Falls back to the same default low-cash threshold the Dashboard's
    // alert bell already uses (alertEngine.ts) when the owner hasn't set
    // their own reserve target in Settings -- otherwise this feature would
    // silently do nothing for the majority of accounts that have never
    // touched that field, including every fresh signup.
    const reserveBreach = useMemo(
        () => findReserveBreach(forecastSummary.cashFlowMonths, parseFloat(settings.minReserve || '') || DEFAULT_THRESHOLDS.lowCashThreshold),
        [forecastSummary.cashFlowMonths, settings.minReserve],
    );
    // Debt-service coverage under the What If? plan -- not part of
    // forecastSummary itself, computed here from the same annualized
    // projected profit plus the existing + any new loan's payment
    // (forecast.existingLoanMonthlyPayment already reflects today's real
    // active loans; the new loan's payment is the same monthlyPayment()
    // math the projected statements below use for it).
    const whatIfDscr = useMemo(() => {
        const newLoanMonthly = adjustments.newLoanAmount > 0
            ? monthlyPayment(adjustments.newLoanAmount, adjustments.newLoanAnnualRatePct, adjustments.newLoanTermMonths)
            : 0;
        const baseAnnualDebtService = forecast.existingLoanMonthlyPayment * 12;
        const adjustedAnnualDebtService = (forecast.existingLoanMonthlyPayment + newLoanMonthly) * 12;
        const baseAnnualProfit = (noAdjustmentsSummary.headline.expectedProfit / noAdjustmentsSummary.monthsInPeriod) * 12;
        const adjustedAnnualProfit = (forecastSummary.headline.expectedProfit / forecastSummary.monthsInPeriod) * 12;
        return {
            base: baseAnnualDebtService > 0 ? baseAnnualProfit / baseAnnualDebtService : null,
            adjusted: adjustedAnnualDebtService > 0 ? adjustedAnnualProfit / adjustedAnnualDebtService : null,
        };
    }, [adjustments.newLoanAmount, adjustments.newLoanAnnualRatePct, adjustments.newLoanTermMonths, forecast.existingLoanMonthlyPayment, noAdjustmentsSummary, forecastSummary]);
    // Runway under the What If? plan -- projected ending cash divided by
    // the scenario's own average monthly expense, so a hire, a loan draw,
    // or an inventory buy all show up in the one number an owner actually
    // asks "how long would this last me" with. Infinity (not a magnitude
    // sentinel) when the scenario's average expense is zero or negative,
    // matching computeCashRunway's own convention elsewhere in the app.
    const whatIfRunway = useMemo(() => {
        const baseMonthlyExpense = noAdjustmentsSummary.headline.expectedExpenses / noAdjustmentsSummary.monthsInPeriod;
        const adjustedMonthlyExpense = forecastSummary.headline.expectedExpenses / forecastSummary.monthsInPeriod;
        return {
            base: baseMonthlyExpense > 0 ? noAdjustmentsSummary.headline.expectedCashPosition / baseMonthlyExpense : Infinity,
            adjusted: adjustedMonthlyExpense > 0 ? forecastSummary.headline.expectedCashPosition / adjustedMonthlyExpense : Infinity,
        };
    }, [noAdjustmentsSummary, forecastSummary]);
    // Real, corroborated external pressure (from the same Macro
    // Assumptions the External Factors panel below reads) folds into the
    // scenario swing -- Conservative gets worse by however much cost
    // pressure is already showing up in the business's own spending, and
    // by any demand headwind; Optimistic only improves from a genuine
    // demand tailwind, matching the product vision's own Downside/Upside
    // examples (exchange rate, demand) rather than a purely internal ±10%.
    const externalStress = useMemo(
        () => computeExternalScenarioStress(forecastSummary.externalFactors),
        [forecastSummary.externalFactors],
    );
    // Conservative/Optimistic apply a fixed swing on top of whatever What
    // If? adjustments are already dialed in above -- so the range answers
    // "how resilient is THIS plan," not three numbers disconnected from
    // the rest of the screen. "Expected" is forecastSummary itself, not a
    // fourth computation, so it can never drift from the headline above.
    const conservativeSummary = useMemo(
        () => computeForecastSummary(transactions, loans, finance, forecastPeriod, staff, macroAssumptions, scenarioAdjustments(adjustments, 'conservative', externalStress), inventory, futureEvents),
        [transactions, loans, finance, forecastPeriod, staff, macroAssumptions, adjustments, inventory, externalStress, futureEvents],
    );
    const optimisticSummary = useMemo(
        () => computeForecastSummary(transactions, loans, finance, forecastPeriod, staff, macroAssumptions, scenarioAdjustments(adjustments, 'optimistic', externalStress), inventory, futureEvents),
        [transactions, loans, finance, forecastPeriod, staff, macroAssumptions, adjustments, inventory, externalStress, futureEvents],
    );
    const scenarioRange = useMemo(() => [
        summarizeScenario(conservativeSummary, 'conservative', 'Conservative', '🔴'),
        summarizeScenario(forecastSummary, 'expected', 'Expected', '🟡'),
        summarizeScenario(optimisticSummary, 'optimistic', 'Optimistic', '🟢'),
    ], [conservativeSummary, forecastSummary, optimisticSummary]);
    // Shared by both waterfalls below -- the true-zero baseline, the
    // label-detection statements, and the fully-adjusted final summary are
    // the exact same computeForecastSummary/buildFutureFinancialStatements
    // calls either way, since one ForecastSummary carries both
    // expectedCashPosition and expectedProfit. Computing this once instead
    // of twice avoids tripling this screen's already-heavy per-keystroke
    // forecast recomputation for no behavioral difference.
    const waterfallBasis = useMemo(
        () => computeForecastWaterfallBasis(transactions, loans, finance, forecastPeriod, staff, macroAssumptions, adjustments, inventory, futureEvents),
        [transactions, loans, finance, forecastPeriod, staff, macroAssumptions, adjustments, inventory, futureEvents],
    );
    // "Why did the forecast change" -- a waterfall of computeForecastSummary
    // calls, one lever at a time, so the breakdown reconciles exactly to
    // the cash-position delta the "If this happens" card above already
    // shows, rather than a second, hand-derived estimate.
    const changeExplanation = useMemo(
        () => explainForecastChange(transactions, loans, finance, forecastPeriod, staff, macroAssumptions, adjustments, inventory, futureEvents, waterfallBasis),
        [transactions, loans, finance, forecastPeriod, staff, macroAssumptions, adjustments, inventory, futureEvents, waterfallBasis],
    );
    // Same waterfall technique, decomposing projected PROFIT instead of
    // cash -- shows even with no What If? adjustments dialed in, since a
    // rising-cost-trend driver can fire on its own (see
    // forecastChangeExplanation.ts).
    const profitExplanation = useMemo(
        () => explainForecastProfitChange(transactions, loans, finance, forecastPeriod, staff, macroAssumptions, adjustments, inventory, futureEvents, waterfallBasis),
        [transactions, loans, finance, forecastPeriod, staff, macroAssumptions, adjustments, inventory, futureEvents, waterfallBasis],
    );
    // The single most severe thing the forecast is currently warning
    // about, synthesized from signals already computed above -- for the
    // headline "Biggest Risk" callout, not a new risk model.
    const biggestRisk = useMemo(
        () => computeBiggestForecastRisk(forecastSummary, currency),
        [forecastSummary, currency],
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
    const hf = forecastSummary.healthForecast;

    const BAND_COLOR: Record<RiskScore['band'], string> = {
        Excellent: Colors.income,
        Strong: '#10b981',
        Moderate: Colors.warning,
        Weak: '#fb923c',
        Critical: Colors.expense,
    };
    const SCENARIO_ACCENT: Record<ScenarioName, string> = {
        conservative: Colors.expense,
        expected: Colors.warning,
        optimistic: Colors.income,
    };
    const LEVEL_COLOR: Record<ImpactLevel | ProbabilityLevel, string> = {
        high: Colors.expense,
        medium: Colors.warning,
        low: Colors.textMuted,
        positive: Colors.income,
    };

    // Same lightweight diagnosis + action-plan pipeline CreditWorthinessScreen
    // uses -- reused as-is rather than writing a third recommendation
    // generator, so "what should I do" never disagrees between screens.
    const diagnosis = useMemo(
        () => performFinancialDiagnosis(transactions, invoices, finance.cashBalance, getMonthlyExpenseAverage(finance.expense, transactions), currency, loans, inventory, assets),
        [transactions, invoices, finance, currency, loans, inventory, assets],
    );
    const actionPlan = useMemo(
        () => generateActionPlan(diagnosis, diagnosis.metrics, currency),
        [diagnosis, currency],
    );
    const topActions = (actionPlan.immediateActions.length > 0 ? actionPlan.immediateActions : actionPlan.shortTermActions).slice(0, 3);

    // What the FORECAST itself is warning about (pressured months, corroborated
    // external risk, a declining health trajectory, a Conservative-scenario cash
    // shortfall) -- distinct from topActions above, which diagnoses HISTORICAL
    // performance and never reads the forecast at all. This is what the "Quad360
    // Financial Intelligence" card below actually shows, so its own claim ("based
    // on your forecast") is literally true rather than aspirational copy.
    const forecastRiskActions = useMemo(
        () => generateForecastRiskActions(forecastSummary, currency, scenarioRange[0]),
        [forecastSummary, currency, scenarioRange],
    ).slice(0, 3);

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
                    See where your business is heading before you make your next decision.{' '}
                    <Text style={{ fontWeight: '800', color: Colors.textPrimary }}>A projection, not a guarantee</Text>
                    {' '}— built from your recent revenue and costs, plus whatever adjustments you enter below. Every number below carries this same caveat, even where it isn't repeated.
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

                        {/* Headline numbers — each shown with its range, not
                            just a single false-precise figure, since a
                            projection this far out is never exactly right.
                            Range width and the shared confidence % both come
                            straight from forecastSummary's own honestly-
                            heuristic confidencePct -- nothing re-derived here. */}
                        <View style={s.headlineGrid}>
                            <View style={s.headlineBox}>
                                <Text style={s.headlineLabel}>Expected Revenue</Text>
                                <Text style={[s.headlineVal, { color: Colors.income }]}>{fmt(forecastSummary.headline.expectedRevenue)}</Text>
                                <Text style={s.headlineRange}>{fmt(forecastSummary.headline.revenueRange.low)} – {fmt(forecastSummary.headline.revenueRange.high)}</Text>
                            </View>
                            <View style={s.headlineBox}>
                                <Text style={s.headlineLabel}>Expected Expenses</Text>
                                <Text style={[s.headlineVal, { color: Colors.expense }]}>{fmt(forecastSummary.headline.expectedExpenses)}</Text>
                                <Text style={s.headlineRange}>{fmt(forecastSummary.headline.expensesRange.low)} – {fmt(forecastSummary.headline.expensesRange.high)}</Text>
                            </View>
                            <View style={s.headlineBox}>
                                <Text style={s.headlineLabel}>Expected Profit</Text>
                                <Text style={[s.headlineVal, { color: forecastSummary.headline.expectedProfit >= 0 ? Colors.income : Colors.expense }]}>
                                    {fmt(forecastSummary.headline.expectedProfit)}
                                </Text>
                                <Text style={s.headlineRange}>{fmt(forecastSummary.headline.profitRange.low)} – {fmt(forecastSummary.headline.profitRange.high)}</Text>
                            </View>
                            <View style={s.headlineBox}>
                                <Text style={s.headlineLabel}>Expected Cash Position</Text>
                                <Text style={[s.headlineVal, { color: Colors.asset }]}>{fmt(forecastSummary.headline.expectedCashPosition)}</Text>
                                <Text style={s.headlineRange}>{fmt(forecastSummary.headline.cashPositionRange.low)} – {fmt(forecastSummary.headline.cashPositionRange.high)}</Text>
                            </View>
                            <View style={s.headlineBox}>
                                <Text style={s.headlineLabel}>Financial Health</Text>
                                <View style={s.headlineHealthRow}>
                                    <Text style={[s.headlineVal, { fontSize: 17, color: BAND_COLOR[hf.currentScore.band] }]}>{hf.currentScore.score}</Text>
                                    <Text style={s.headlineHealthArrow}>→</Text>
                                    <Text style={[s.headlineVal, { fontSize: 17, color: BAND_COLOR[hf.projectedScore.band] }]}>{hf.projectedScore.score}</Text>
                                    {hf.projectedScore.score < hf.currentScore.score && <Text style={s.headlineHealthWarn}> ⚠️</Text>}
                                </View>
                                <Text style={s.headlineRange}>{RISK_BAND_STYLE[hf.projectedScore.band].emoji} {RISK_BAND_STYLE[hf.projectedScore.band].label}</Text>
                            </View>
                        </View>
                        <Text style={s.headlineConfidenceText}>Confidence: {forecastSummary.confidencePct}% — wider range on longer horizons and thinner history</Text>

                        {/* Biggest Risk -- the single most severe thing the
                            forecast is currently warning about, synthesized
                            from signals computed elsewhere on this screen
                            (cash-flow pressure ranks above a corroborated
                            external risk, which ranks above margin risk,
                            which ranks above a health decline). Omitted
                            entirely when nothing material is flagged. */}
                        {biggestRisk && (() => {
                            const accent = biggestRisk.icon === '🔴' ? Colors.expense : Colors.warning;
                            const BIGGEST_RISK_ACTION: Record<typeof biggestRisk.kind, { text: string; onPress: () => void }> = {
                                cashflow: { text: 'Work through this in Cash Flow', onPress: () => navigate('cashflow') },
                                external: { text: 'Review this in External Factors', onPress: () => navigate('macro-assumptions') },
                                margin: { text: 'Fix pricing to protect margin', onPress: () => navigate('inventory', { tab: 'pricing' }) },
                                health: { text: 'See the full health breakdown', onPress: () => navigate('financial-assessment') },
                            };
                            const action = BIGGEST_RISK_ACTION[biggestRisk.kind];
                            return (
                                <View style={[s.biggestRiskCard, { backgroundColor: accent + '14', borderColor: accent + '55' }]}>
                                    <Text style={[s.biggestRiskTitle, { color: accent }]}>{biggestRisk.icon} Biggest Risk</Text>
                                    <Text style={s.biggestRiskSubtitle}>{biggestRisk.title}</Text>
                                    <Text style={s.biggestRiskDetail}>{biggestRisk.detail}</Text>
                                    <NextStepLink text={action.text} onPress={action.onPress} />
                                </View>
                            );
                        })()}

                        {/* Forecast Assumptions -- what this projection is
                            actually built on, in one place, so "revenue will
                            be X" is explainable rather than a single
                            false-precise number. Every line reuses a value
                            computed elsewhere on this screen; nothing new is
                            modeled here. */}
                        <View style={s.card}>
                            <Text style={s.cardTitle}>📋 Forecast Assumptions</Text>
                            <Row
                                label="Historical sales trend"
                                value={forecastSummary.detectedRevenueGrowthPctPerMonth != null
                                    ? `${forecastSummary.detectedRevenueGrowthPctPerMonth >= 0 ? '+' : ''}${forecastSummary.detectedRevenueGrowthPctPerMonth.toFixed(1)}%/mo`
                                    : 'Not enough history'}
                            />
                            <Row
                                label="Sales growth assumption applied"
                                value={`${adjustments.revenueGrowthPctPerMonth >= 0 ? '+' : ''}${adjustments.revenueGrowthPctPerMonth.toFixed(1)}%/mo`}
                            />
                            <Row label="Average discount" value={`${forecastSummary.discountTrend.recentRatePct.toFixed(1)}%`} />
                            <Row
                                label="Cost growth assumption applied"
                                value={`${adjustments.expenseGrowthPctPerMonth >= 0 ? '+' : ''}${adjustments.expenseGrowthPctPerMonth.toFixed(1)}%/mo`}
                            />
                            {forecast.riskAdjustedCategory && (
                                <Row
                                    label={`Rising cost trend (${forecast.riskAdjustedCategory})`}
                                    value={`+${forecast.riskAdjustedCategoryGrowthPct.toFixed(0)}% / ${forecast.riskAdjustedCategoryWindowMonths}mo`}
                                    valueColor={Colors.warning}
                                />
                            )}
                            <Row
                                label="External factors considered"
                                value={forecastSummary.externalFactors.items.length === 0 ? 'None added' : `${forecastSummary.externalFactors.items.length}`}
                            />
                            <Row label="Expected collection period" value={`${Math.round(forecastSummary.expectedCollectionDays)} days`} />
                            <Row label="Forecast confidence" value={`${forecastSummary.confidencePct}%`} bold />

                            {/* Rolling Forecast -- both this and the rows above
                                are context ABOUT the forecast, shown before the
                                numbers themselves, so it lives in the same card
                                rather than a second one: replaces "set a budget
                                in January, compare it in December" with a
                                monthly trail (Forecast -> Actual -> Variance ->
                                Update -> Forecast again). Only shown once a
                                second monthly snapshot exists to form a trend. */}
                            {forecastHistory.length >= 2 && (
                                <>
                                    <Text style={[s.plSubheading, s.plSubheadingDivider, { marginTop: Spacing.md }]}>🔁 Rolling Forecast</Text>
                                    <Text style={s.riskText}>
                                        Every month Quad360 re-forecasts your annual revenue from the latest data, instead of comparing to a number set once and never revisited.
                                    </Text>
                                    {forecastHistory.map(snap => (
                                        <Row
                                            key={snap.id}
                                            label={new Date(snap.date).toLocaleString('default', { month: 'short', year: '2-digit' })}
                                            value={fmt(snap.annualRevenueForecast)}
                                        />
                                    ))}
                                    {forecastAccuracy.available && (
                                        <Text style={[s.riskText, { marginTop: Spacing.sm }]}>
                                            Past forecasts have been off by an average of {forecastAccuracy.meanAbsPctError.toFixed(0)}% once the forecasted period actually played out
                                            (forecast accuracy: <Text style={s.riskBold}>{forecastAccuracy.accuracyScore}/100</Text>, from {forecastAccuracy.comparisons} checkable snapshot{forecastAccuracy.comparisons !== 1 ? 's' : ''}).
                                        </Text>
                                    )}
                                </>
                            )}
                        </View>

                        {/* Reserve Breach -- "Quad360 can use [everything] to
                            create a 12-Month Cash Forecast and identify
                            potential cash pressure." Shown once, for the
                            first month the forecast dips below the owner's
                            own minimum reserve (set in Settings), ahead of
                            the month-by-month cards below. */}
                        {reserveBreach && (
                            <View style={s.riskCard}>
                                <View style={s.riskTitleRow}>
                                    <Icon name="alert-triangle" size={14} color={Colors.expense} />
                                    <Text style={[s.riskTitle, s.riskTitleInRow]}>🔴 Cash Pressure Expected</Text>
                                </View>
                                <Text style={s.riskText}>{reserveBreach.message}</Text>
                                <Text style={s.riskText}>
                                    Forecast balance: <Text style={s.riskBold}>{fmt(reserveBreach.endingCash)}</Text> vs. your{' '}
                                    <Text style={s.riskBold}>{fmt(reserveBreach.minReserve)}</Text> reserve target — a shortfall of{' '}
                                    <Text style={s.riskBold}>{fmt(reserveBreach.shortfall)}</Text>.
                                </Text>
                            </View>
                        )}

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

                        {/* P&L Forecast — Revenue, Expenses, and Profit used to be
                            three separate cards, but they're already one
                            computed object (profitBridge): revenue minus
                            expenses minus COGS is what profit IS, not a
                            fourth independent number. One card, three
                            sub-sections, so the arithmetic reads top to
                            bottom instead of being scattered across three
                            scrolls. */}
                        <View style={s.card}>
                            <Text style={s.cardTitle}>📊 P&amp;L Forecast</Text>

                            <Text style={s.plSubheading}>Revenue — Next {PERIOD_LABELS[forecastPeriod]}</Text>
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
                            {forecastSummary.detectedRevenueGrowthPctPerMonth != null && Math.abs(forecastSummary.detectedRevenueGrowthPctPerMonth - (parseFloat(revenueGrowth) || 0)) >= 1 && (
                                <View style={s.detectedTrendRow}>
                                    <Text style={s.detectedTrendText}>
                                        📈 Detected trend: sales have moved about {forecastSummary.detectedRevenueGrowthPctPerMonth >= 0 ? '+' : ''}{forecastSummary.detectedRevenueGrowthPctPerMonth.toFixed(1)}%/mo recently.
                                        Not applied automatically — you decide.
                                    </Text>
                                    <TouchableOpacity onPress={() => setRevenueGrowth(forecastSummary.detectedRevenueGrowthPctPerMonth!.toFixed(1))}>
                                        <Text style={s.detectedTrendLink}>Apply to Sales change →</Text>
                                    </TouchableOpacity>
                                </View>
                            )}

                            <Text style={[s.plSubheading, s.plSubheadingDivider, { marginTop: Spacing.md }]}>Expenses — Next {PERIOD_LABELS[forecastPeriod].toLowerCase()}</Text>
                            {forecastSummary.expenseByCategory.map(c => (
                                <Row key={c.category} label={c.category} value={fmt(c.amount)} />
                            ))}
                            <Row label="Total projected expenses" value={fmt(forecastSummary.headline.expectedExpenses)} bold />
                            {largestExpenseCategory && (
                                <Text style={s.insightLine}>
                                    ⚠️ {largestExpenseCategory.category} purchases are expected to be your largest cash outflow over the next {PERIOD_LABELS[forecastPeriod].toLowerCase()}.
                                </Text>
                            )}

                            <Text style={[s.plSubheading, s.plSubheadingDivider, { marginTop: Spacing.md }]}>Profit</Text>
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

                        {/* Margin Risk — only shown when recent discounting has actually climbed */}
                        {forecastSummary.marginRisk.show && (
                            <View style={s.riskCard}>
                                <View style={s.riskTitleRow}>
                                    <Icon name="alert-triangle" size={14} color={Colors.warning} />
                                    <Text style={[s.riskTitle, s.riskTitleInRow]}>Margin Risk</Text>
                                </View>
                                <Text style={s.riskText}>
                                    Your average discount has climbed from{' '}
                                    <Text style={s.riskBold}>{forecastSummary.discountTrend.priorRatePct.toFixed(1)}%</Text> to{' '}
                                    <Text style={s.riskBold}>{forecastSummary.discountTrend.recentRatePct.toFixed(1)}%</Text> over the last 30 days.
                                    If this pattern continues, it could reduce gross profit by approximately{' '}
                                    <Text style={s.riskBold}>{fmt(forecastSummary.marginRisk.estimatedProfitImpact)}</Text> over the next {PERIOD_LABELS[forecastPeriod].toLowerCase()}.
                                </Text>
                                <NextStepLink text="Fix pricing to protect margin" onPress={() => navigate('inventory', { tab: 'pricing' })} />
                            </View>
                        )}

                        {/* Inventory Forecast */}
                        <View style={s.card}>
                            <Text style={s.cardTitle}>📦 Inventory Forecast</Text>
                            <Row label="Current inventory value" value={fmt(forecastSummary.inventoryForecast.currentInventoryValue)} />
                            <Row label="Expected sales (at cost)" value={`−${fmt(forecastSummary.inventoryForecast.expectedSalesAtCost)}`} valueColor={Colors.expense} />
                            <Row label="Expected inventory purchases" value={`+${fmt(forecastSummary.inventoryForecast.expectedPurchases)}`} valueColor={Colors.income} />
                            <Row label="Projected inventory value" value={fmt(forecastSummary.inventoryForecast.projectedInventoryValue)} bold />
                            {forecastSummary.inventoryForecast.atRiskItemCount > 0 ? (
                                <>
                                    <Text style={s.insightLine}>
                                        🔴 {forecastSummary.inventoryForecast.atRiskItemCount} product{forecastSummary.inventoryForecast.atRiskItemCount === 1 ? '' : 's'} may reach low-stock levels within 14 days.
                                    </Text>
                                    <NextStepLink text="See which products" onPress={() => navigate('inventory')} />
                                </>
                            ) : forecastSummary.inventoryForecast.daysOfCoverage != null && (
                                <Text style={s.coverageInsightOk}>
                                    🟠 Sufficient stock for ~{Math.round(forecastSummary.inventoryForecast.daysOfCoverage)} days at your current sales pace.
                                </Text>
                            )}
                        </View>

                        {/* Financial Health Forecast */}
                        <View style={s.card}>
                            <Text style={s.cardTitle}>❤️ Financial Health Forecast</Text>
                            <View style={s.healthScoreRow}>
                                <View style={s.healthScoreBox}>
                                    <Text style={s.healthScoreLabel}>Current Score</Text>
                                    <Text style={[s.healthScoreVal, { color: BAND_COLOR[hf.currentScore.band] }]}>{hf.currentScore.score}/100</Text>
                                    <Text style={[s.healthScoreBand, { color: BAND_COLOR[hf.currentScore.band] }]}>
                                        {RISK_BAND_STYLE[hf.currentScore.band].emoji} {RISK_BAND_STYLE[hf.currentScore.band].label}
                                    </Text>
                                </View>
                                <Text style={s.healthScoreArrow}>→</Text>
                                <View style={s.healthScoreBox}>
                                    <Text style={s.healthScoreLabel}>{PERIOD_LABELS[forecastPeriod]} Projected</Text>
                                    <Text style={[s.healthScoreVal, { color: BAND_COLOR[hf.projectedScore.band] }]}>{hf.projectedScore.score}/100</Text>
                                    <Text style={[s.healthScoreBand, { color: BAND_COLOR[hf.projectedScore.band] }]}>
                                        {RISK_BAND_STYLE[hf.projectedScore.band].emoji} {RISK_BAND_STYLE[hf.projectedScore.band].label}
                                    </Text>
                                </View>
                            </View>

                            {hf.movedFactors.length > 0 ? (
                                <>
                                    <Text style={s.baselineNote}>What's driving the change:</Text>
                                    {hf.movedFactors.map(f => (
                                        <View key={f.name} style={s.healthDriverRow}>
                                            <Text style={s.healthDriverName}>
                                                {f.name}: {f.currentScore} → {f.projectedScore}
                                            </Text>
                                            <Text style={s.healthDriverExplanation}>{f.explanation}</Text>
                                        </View>
                                    ))}
                                </>
                            ) : (
                                <Text style={s.baselineNote}>No change projected in the factors this forecast can speak to.</Text>
                            )}
                            <Text style={s.healthUnchangedNote}>
                                Unchanged from today — not something a revenue/cash projection can predict: {hf.unchangedFactorNames.join(', ')}.
                            </Text>
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
                                {forecast.riskAdjustedCategoryInsight && (
                                    <NextStepLink text="Review this assumption" onPress={() => navigate('macro-assumptions')} />
                                )}
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

                        {/* External Factors, Known Future Events, Seasonality,
                            Risk Radar, and Combined Insights used to be five
                            separate always-visible cards -- they're all
                            genuinely "what's affecting this forecast, beyond
                            your own transaction history," just five different
                            lenses on that one question. Grouped under one tap
                            -to-expand section so the default scroll shows the
                            forecast itself first, not five cards of context
                            before it. Each sub-section keeps its own controls
                            (add a macro assumption, add a future event, etc.)
                            unchanged. */}
                        <Collapsible title="🔗 What's Affecting This Forecast">
                        <View style={s.card}>
                            <Text style={s.cardTitle}>🌍 External Factors</Text>
                            {forecastSummary.externalFactors.items.length === 0 ? (
                                <>
                                    <Text style={s.baselineNote}>
                                        Nothing outside the business is factored in yet. Add a Macro Assumption
                                        (inflation, FX, fuel costs, market demand...) to see its potential impact
                                        on this forecast — it's never applied automatically, only when you add it.
                                    </Text>
                                    <TouchableOpacity onPress={() => navigate('macro-assumptions')}>
                                        <Text style={s.aiCardLink}>Add a Macro Assumption →</Text>
                                    </TouchableOpacity>
                                </>
                            ) : (
                                <>
                                    {forecastSummary.externalFactors.items.map(item => (
                                        <View key={item.id} style={s.factorRow}>
                                            <View style={s.factorHeaderRow}>
                                                <Text style={s.factorLabel}>{item.label}</Text>
                                                <View style={[s.factorBadge, { borderColor: LEVEL_COLOR[item.impactLevel] }]}>
                                                    <Text style={[s.factorBadgeText, { color: LEVEL_COLOR[item.impactLevel] }]}>
                                                        {item.impactLevel === 'positive' ? '🟢 Positive' : `${item.impactLevel === 'high' ? '🔴' : item.impactLevel === 'medium' ? '🟠' : '⚪'} ${item.impactLevel[0].toUpperCase()}${item.impactLevel.slice(1)} impact`}
                                                    </Text>
                                                </View>
                                            </View>
                                            <Text style={s.factorSentence}>{item.sentence}</Text>
                                        </View>
                                    ))}
                                    {forecastSummary.externalFactors.summarySentence && (
                                        <View style={s.insightBox}>
                                            <Text style={s.insightBoxTitle}>Potential Forecast Impact</Text>
                                            <Text style={s.insightBoxText}>{forecastSummary.externalFactors.summarySentence}</Text>
                                        </View>
                                    )}
                                </>
                            )}
                        </View>

                        {/* Known Future Events */}
                        <View style={s.card}>
                            <Text style={s.cardTitle}>📅 Known Future Events</Text>
                            {futureEvents.length === 0 ? (
                                <>
                                    <Text style={s.baselineNote}>
                                        A new branch, a hire, a signed contract, an equipment purchase — plans you
                                        already know about aren't in your transaction history yet. Add one so this
                                        forecast can place it in the right month.
                                    </Text>
                                    <TouchableOpacity onPress={() => navigate('future-events')}>
                                        <Text style={s.aiCardLink}>Add a Known Future Event →</Text>
                                    </TouchableOpacity>
                                </>
                            ) : forecastSummary.includedFutureEvents.length === 0 ? (
                                <Text style={s.baselineNote}>
                                    You have {futureEvents.length} event{futureEvents.length === 1 ? '' : 's'} saved, but none fall within this {PERIOD_LABELS[forecastPeriod].toLowerCase()} window.
                                </Text>
                            ) : (
                                <>
                                    <Text style={s.baselineNote}>
                                        Already factored into the numbers below, landing in the month you specified.
                                    </Text>
                                    {forecastSummary.includedFutureEvents.map(ev => (
                                        <View key={ev.id} style={s.factorRow}>
                                            <View style={s.factorHeaderRow}>
                                                <Text style={s.factorLabel}>{ev.label}</Text>
                                                <Text style={[s.factorBadgeText, { color: ev.direction === 'inflow' ? Colors.income : Colors.expense }]}>
                                                    {ev.direction === 'inflow' ? '+' : '-'}{fmt(ev.amount)}{ev.recurring ? '/mo' : ''}
                                                </Text>
                                            </View>
                                            <Text style={s.factorSentence}>
                                                {ev.recurring ? 'Recurring from' : 'One-time in'} month {ev.startMonth} ({new Date(`${ev.date}T00:00:00`).toLocaleDateString()})
                                            </Text>
                                        </View>
                                    ))}
                                    <TouchableOpacity onPress={() => navigate('future-events')}>
                                        <Text style={s.aiCardLink}>Manage Future Events →</Text>
                                    </TouchableOpacity>
                                </>
                            )}
                        </View>

                        {/* Seasonality */}
                        <View style={s.card}>
                            <Text style={s.cardTitle}>📅 Seasonality</Text>
                            {!forecastSummary.seasonality.available ? (
                                <Text style={s.baselineNote}>
                                    Not enough history yet to detect a month-of-year pattern — you have {forecastSummary.seasonality.monthsOfHistory} recorded month{forecastSummary.seasonality.monthsOfHistory === 1 ? '' : 's'},
                                    {' '}need at least {forecastSummary.seasonality.minMonthsRequired}. Once you do, this will show whether certain months of the year historically run above or below your average.
                                </Text>
                            ) : forecastSummary.seasonality.peakMonths.length === 0 && forecastSummary.seasonality.troughMonths.length === 0 ? (
                                <Text style={s.baselineNote}>
                                    Based on {forecastSummary.seasonality.monthsOfHistory} months of history, your revenue doesn't show a strong month-of-year pattern — no single month consistently runs far above or below your average.
                                </Text>
                            ) : (
                                <>
                                    <Text style={s.baselineNote}>
                                        Based on {forecastSummary.seasonality.monthsOfHistory} months of history, compared to your own monthly average:
                                    </Text>
                                    {forecastSummary.seasonality.peakMonths.map(pm => (
                                        <View key={`peak-${pm.month}`} style={s.factorRow}>
                                            <View style={s.factorHeaderRow}>
                                                <Text style={s.factorLabel}>{pm.monthName}</Text>
                                                <Text style={[s.factorBadgeText, { color: Colors.income }]}>+{Math.round((pm.index - 1) * 100)}% typical</Text>
                                            </View>
                                            <Text style={s.factorSentence}>Based on {pm.sampleCount} year{pm.sampleCount === 1 ? '' : 's'} of {pm.monthName} in your records.</Text>
                                        </View>
                                    ))}
                                    {forecastSummary.seasonality.troughMonths.map(tm => (
                                        <View key={`trough-${tm.month}`} style={s.factorRow}>
                                            <View style={s.factorHeaderRow}>
                                                <Text style={s.factorLabel}>{tm.monthName}</Text>
                                                <Text style={[s.factorBadgeText, { color: Colors.expense }]}>{Math.round((tm.index - 1) * 100)}% typical</Text>
                                            </View>
                                            <Text style={s.factorSentence}>Based on {tm.sampleCount} year{tm.sampleCount === 1 ? '' : 's'} of {tm.monthName} in your records.</Text>
                                        </View>
                                    ))}
                                    <Text style={[s.baselineNote, { marginTop: Spacing.sm, marginBottom: 0 }]}>
                                        Not applied to the numbers above unless you turn on "Adjust for seasonality" in What If? below.
                                    </Text>
                                </>
                            )}
                        </View>

                        {/* Risk Radar */}
                        {forecastSummary.riskRadar.length > 0 && (
                            <View style={s.card}>
                                <Text style={s.cardTitle}>📡 Risk Radar</Text>
                                <Text style={s.baselineNote}>Impact: how much this could affect the business. Probability: how much your own numbers back it up. Exposure: how much of your business runs through it.</Text>
                                <View style={s.radarHeaderRow}>
                                    <Text style={[s.radarCell, s.radarHeaderText, { flex: 1.4 }]}>Factor</Text>
                                    <Text style={[s.radarCell, s.radarHeaderText]}>Impact</Text>
                                    <Text style={[s.radarCell, s.radarHeaderText]}>Probability</Text>
                                    <Text style={[s.radarCell, s.radarHeaderText]}>Exposure</Text>
                                </View>
                                {forecastSummary.riskRadar.map((row, i) => (
                                    <View key={i} style={s.radarRow}>
                                        <Text style={[s.radarCell, { flex: 1.4, color: Colors.textPrimary }]}>{row.label}</Text>
                                        <Text style={[s.radarCell, { color: LEVEL_COLOR[row.impact] }]}>{row.impact === 'positive' ? '—' : row.impact[0].toUpperCase() + row.impact.slice(1)}</Text>
                                        <Text style={[s.radarCell, { color: LEVEL_COLOR[row.probability] }]}>{row.probability[0].toUpperCase() + row.probability.slice(1)}</Text>
                                        <Text style={[s.radarCell, { color: LEVEL_COLOR[row.exposure] }]}>{row.exposure[0].toUpperCase() + row.exposure.slice(1)}</Text>
                                    </View>
                                ))}
                            </View>
                        )}

                        {/* Internal + External combined insights */}
                        {forecastSummary.combinedInsights.length > 0 && (
                            <View style={s.card}>
                                <Text style={s.cardTitle}>🔗 Combined Insights</Text>
                                {forecastSummary.combinedInsights.map((insight, i) => (
                                    <View key={i} style={[s.combinedInsightRow, insight.tone === 'opportunity' && s.combinedInsightRowOpportunity]}>
                                        <Text style={s.combinedInsightTitle}>{insight.icon} {insight.title}</Text>
                                        <Text style={s.combinedInsightText}>{insight.text}</Text>
                                    </View>
                                ))}
                            </View>
                        )}
                        </Collapsible>

                        <View style={s.card}>
                            <Text style={s.cardTitle}>🧪 What If? Scenario Planner</Text>
                            <Text style={s.baselineNote}>
                                Try a change and see how it plays out — nothing here is saved or applied to your
                                real records. Baseline: {fmt(forecast.baselineMonthlyRevenue)}/mo revenue, {fmt(forecast.baselineMonthlyExpense)}/mo
                                expenses — averaged over your last {forecast.baselineMonthsUsed} recorded month{forecast.baselineMonthsUsed === 1 ? '' : 's'}.
                            </Text>
                            <AdjustmentInput label="Sales change" value={revenueGrowth} onChange={setRevenueGrowth} suffix="%/mo" />
                            <AdjustmentInput label="Expense change" value={expenseGrowth} onChange={setExpenseGrowth} suffix="%/mo" />
                            <AdjustmentInput label="Discount change" value={discountChange} onChange={setDiscountChange} suffix="pp" />
                            <AdjustmentInput label="Extra new hire(s), beyond current staff" value={extraMonthlyCost} onChange={setExtraMonthlyCost} suffix={currency} />
                            <AdjustmentInput label="Buy more inventory now" value={inventoryPurchase} onChange={setInventoryPurchase} suffix={currency} />
                            <AdjustmentInput label="Customer payments delayed by" value={receivableDelay} onChange={setReceivableDelay} suffix="days" />
                            <AdjustmentInput label="Take a new loan" value={newLoanAmount} onChange={setNewLoanAmount} suffix={currency} />
                            {parseFloat(newLoanAmount) > 0 && (
                                <>
                                    <AdjustmentInput label="Loan interest rate" value={newLoanRate} onChange={setNewLoanRate} suffix="%/yr" />
                                    <AdjustmentInput label="Loan term" value={newLoanTerm} onChange={setNewLoanTerm} suffix="months" />
                                </>
                            )}
                            {forecastSummary.seasonality.available && (
                                <TouchableOpacity style={s.seasonalityToggleRow} onPress={() => setApplySeasonality(v => !v)}>
                                    <View style={[s.checkbox, applySeasonality && s.checkboxActive]}>
                                        {applySeasonality && <Icon name="check" size={12} color="#fff" />}
                                    </View>
                                    <Text style={s.checkboxLabel}>Adjust for seasonality (based on your own month-of-year history — see "What's Affecting This Forecast" above)</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {hasAdjustments && (
                            <View style={s.impactCard}>
                                <Text style={s.impactTitle}>🤖 If this happens, over the next {PERIOD_LABELS[forecastPeriod].toLowerCase()}</Text>
                                <Text style={s.impactLine}>
                                    Revenue: {fmt(noAdjustmentsSummary.headline.expectedRevenue)} → {fmt(forecastSummary.headline.expectedRevenue)}
                                </Text>
                                <Text style={s.impactLine}>
                                    Expenses: {fmt(noAdjustmentsSummary.headline.expectedExpenses)} → {fmt(forecastSummary.headline.expectedExpenses)}
                                </Text>
                                <Text style={s.impactLine}>
                                    Profit: {fmt(noAdjustmentsSummary.headline.expectedProfit)} → {fmt(forecastSummary.headline.expectedProfit)}
                                </Text>
                                <Text style={s.impactLine}>
                                    Cash position: {fmt(noAdjustmentsSummary.headline.expectedCashPosition)} → {fmt(forecastSummary.headline.expectedCashPosition)}
                                    {'  '}
                                    <Text style={{ color: forecastSummary.headline.expectedCashPosition >= noAdjustmentsSummary.headline.expectedCashPosition ? Colors.income : Colors.expense }}>
                                        ({forecastSummary.headline.expectedCashPosition >= noAdjustmentsSummary.headline.expectedCashPosition ? '+' : ''}
                                        {fmt(forecastSummary.headline.expectedCashPosition - noAdjustmentsSummary.headline.expectedCashPosition)})
                                    </Text>
                                </Text>
                                <Text style={s.impactLine}>
                                    Margin: {noAdjustmentsSummary.profitBridge.forecastMarginPct.toFixed(1)}% → {forecastSummary.profitBridge.forecastMarginPct.toFixed(1)}%
                                </Text>
                                <Text style={s.impactLine}>
                                    Runway: {Number.isFinite(whatIfRunway.base) ? `${whatIfRunway.base.toFixed(1)} months` : 'Not burning down'} → {Number.isFinite(whatIfRunway.adjusted) ? `${whatIfRunway.adjusted.toFixed(1)} months` : 'Not burning down'}
                                </Text>
                                {(whatIfDscr.base !== null || whatIfDscr.adjusted !== null) && (
                                    <Text style={s.impactLine}>
                                        Debt capacity (Debt Service Coverage Ratio -- income ÷ debt payments, 1.0x+ means income covers them): {whatIfDscr.base !== null ? `${whatIfDscr.base.toFixed(2)}x` : 'No debt'} → {whatIfDscr.adjusted !== null ? `${whatIfDscr.adjusted.toFixed(2)}x` : 'No debt'}
                                    </Text>
                                )}
                                <Text style={s.impactLine}>
                                    Financial health: {RISK_BAND_STYLE[noAdjustmentsSummary.healthForecast.projectedScore.band].emoji} {noAdjustmentsSummary.healthForecast.projectedScore.score} → {RISK_BAND_STYLE[forecastSummary.healthForecast.projectedScore.band].emoji} {forecastSummary.healthForecast.projectedScore.score}
                                </Text>
                            </View>
                        )}

                        {/* Impact Analysis -- profit first (the number owners
                            actually think in), cash second, then how
                            resilient the plan is to being wrong. These three
                            used to be three separate always-visible cards;
                            the "If this happens" summary above already gives
                            the headline numbers, so the WHY and the range
                            behind them are detail worth a tap, not a default
                            scroll. Shown whenever there's a driver to
                            explain, not just when What If? adjustments are
                            dialed in: a rising cost trend the engine
                            detected on its own is exactly the kind of thing
                            this section exists to surface. */}
                        <Collapsible title="📊 Impact Analysis — Why, and How Resilient">
                        {profitExplanation.drivers.length > 0 && (
                            <View style={s.card}>
                                <Text style={s.cardTitle}>Why is profit projected to change?</Text>
                                <Text style={s.baselineNote}>
                                    Projected profit {profitExplanation.totalImpact >= 0 ? 'increases' : 'decreases'} by {fmt(Math.abs(profitExplanation.totalImpact))} versus a flat, unchanged trend, because:
                                </Text>
                                {profitExplanation.drivers.map((d, i) => (
                                    <View key={i} style={s.row}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.rowLabel}>{d.label}</Text>
                                            {d.source === 'external' && <Text style={s.profitDriverExternalTag}>Tied to a Macro Assumption</Text>}
                                        </View>
                                        <Text style={[s.rowValue, { color: d.profitImpact >= 0 ? Colors.income : Colors.expense }]}>
                                            {d.profitImpact >= 0 ? '+' : ''}{fmt(d.profitImpact)}
                                        </Text>
                                    </View>
                                ))}
                                <Row label="Net projected change" value={`${profitExplanation.totalImpact >= 0 ? '+' : ''}${fmt(profitExplanation.totalImpact)}`} bold valueColor={profitExplanation.totalImpact >= 0 ? Colors.income : Colors.expense} />
                            </View>
                        )}

                        {changeExplanation.drivers.length > 0 && (
                            <View style={s.card}>
                                <Text style={s.cardTitle}>Why did the cash position change?</Text>
                                <Text style={s.baselineNote}>
                                    Projected cash position {changeExplanation.totalImpact >= 0 ? 'increased' : 'decreased'} by {fmt(Math.abs(changeExplanation.totalImpact))} versus a flat, unchanged trend, because:
                                </Text>
                                {changeExplanation.drivers.map((d, i) => (
                                    <Row
                                        key={i}
                                        label={d.label}
                                        value={`${d.cashImpact >= 0 ? '+' : ''}${fmt(d.cashImpact)}`}
                                        valueColor={d.cashImpact >= 0 ? Colors.income : Colors.expense}
                                    />
                                ))}
                                <Row label="Total impact" value={`${changeExplanation.totalImpact >= 0 ? '+' : ''}${fmt(changeExplanation.totalImpact)}`} bold valueColor={changeExplanation.totalImpact >= 0 ? Colors.income : Colors.expense} />
                            </View>
                        )}

                        {/* Scenario Range */}
                        <View style={s.card}>
                            <Text style={s.cardTitle}>🎯 Scenario Range</Text>
                            <Text style={s.baselineNote}>
                                How resilient is the plan above? Conservative assumes sales growth {Math.abs(SCENARIO_SWING.conservative.revenueGrowthDeltaPp)} points slower and costs growing {Math.abs(SCENARIO_SWING.conservative.expenseGrowthDeltaPp)} points faster than what you've entered; Optimistic assumes sales {Math.abs(SCENARIO_SWING.optimistic.revenueGrowthDeltaPp)} points faster, costs unchanged.
                            </Text>
                            {scenarioRange.map(sc => (
                                <View key={sc.name} style={[s.scenarioCard, { borderLeftColor: SCENARIO_ACCENT[sc.name] }]}>
                                    <Text style={s.scenarioTitle}>{sc.emoji} {sc.label}</Text>
                                    <Row label="Revenue" value={fmt(sc.revenue)} />
                                    <Row label="Expenses" value={fmt(sc.expenses)} />
                                    <Row label="Profit" value={fmt(sc.profit)} valueColor={sc.profit >= 0 ? Colors.income : Colors.expense} bold />
                                    <Row label="Ending cash" value={fmt(sc.endingCash)} bold />
                                    <Row label="Financial health" value={`${RISK_BAND_STYLE[sc.healthBand].emoji} ${RISK_BAND_STYLE[sc.healthBand].label}`} valueColor={BAND_COLOR[sc.healthBand]} />
                                    {sc.pressuredMonths > 0 && (
                                        <Text style={s.scenarioPressureNote}>
                                            ⚠️ Cash comes under pressure in {sc.pressuredMonths} of the {forecastSummary.cashFlowMonths.length} projected month{forecastSummary.cashFlowMonths.length === 1 ? '' : 's'}.
                                        </Text>
                                    )}
                                </View>
                            ))}
                        </View>
                        </Collapsible>

                        {/* AI recommendation box — driven by what the FORECAST itself
                            is warning about (forecastRiskActions), not the separate
                            historical diagnosis (topActions). Falls back to topActions
                            only when the forecast shows no risk at all, so there's
                            still something useful here rather than an empty card. */}
                        {(forecastRiskActions.length > 0 || topActions.length > 0) && (
                            <View style={s.aiCard}>
                                <Text style={s.aiCardTitle}>🤖 Quad360 Recommendation</Text>
                                <Text style={s.baselineNote}>
                                    {forecastRiskActions.length > 0
                                        ? 'Based on what your forecast is projecting, here\'s what to focus on:'
                                        : 'Your forecast shows no material risk right now. Based on your recent numbers, here\'s what to focus on:'}
                                </Text>
                                {(forecastRiskActions.length > 0 ? forecastRiskActions : topActions).map(action => (
                                    <View key={action.id} style={s.aiActionRow}>
                                        <Text style={s.aiActionTitle}>{action.title}</Text>
                                        <Text style={s.aiActionDesc}>{action.description}</Text>
                                        <Text style={[s.aiActionImpact, { color: action.impactType === 'revenue' ? Colors.income : action.impactType === 'expense_reduction' ? Colors.income : Colors.asset }]}>
                                            Potential impact: {fmt(action.expectedImpact)}{action.impactType === 'revenue' ? ' extra revenue' : action.impactType === 'expense_reduction' ? ' saved' : ' cash freed up'}
                                        </Text>
                                    </View>
                                ))}
                                <TouchableOpacity onPress={() => navigate('action-tracker')}>
                                    <Text style={s.aiCardLink}>See full action plan →</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        <View style={s.card}>
                            <Text style={s.cardTitle}>Detailed month-by-month statements</Text>
                            <Text style={s.baselineNote}>The same scenario above, broken out by full statement (P&L, Cash Flow, Balance Sheet) over a longer 6/12-month horizon.</Text>
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
    headlineRange: { fontSize: 10.5, color: Colors.textMuted, marginTop: 2 },
    headlineConfidenceText: { fontSize: 11, color: Colors.textMuted, marginTop: -6, marginBottom: 14, fontStyle: 'italic' },
    headlineHealthRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
    headlineHealthArrow: { fontSize: 13, color: Colors.textMuted },
    headlineHealthWarn: { fontSize: 13 },

    biggestRiskCard: {
        backgroundColor: Colors.expense + '14', borderRadius: 14, padding: Spacing.lg, marginBottom: 14,
        borderWidth: 1, borderColor: Colors.expense + '55', ...Shadow.sm,
    },
    biggestRiskTitle: { fontSize: 11, fontWeight: '800', color: Colors.expense, textTransform: 'uppercase' as const, letterSpacing: 0.3, marginBottom: 4 },
    biggestRiskSubtitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
    biggestRiskDetail: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },

    profitDriverExternalTag: { fontSize: 10, color: Colors.asset, fontWeight: '700', marginTop: 1 },

    tableHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border, paddingBottom: 6, marginBottom: 4 },
    tableHeaderText: { fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase' as const, fontSize: 10 },
    tableRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
    tableCell: { flex: 1, fontSize: 13, color: Colors.textPrimary },

    insightBox: { backgroundColor: Colors.surfaceVariant, borderRadius: Radius.md, padding: Spacing.md, marginTop: Spacing.md },
    insightBoxTitle: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
    insightBoxText: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18, marginBottom: 6 },
    confidenceText: { fontSize: 11.5, fontWeight: '600', color: Colors.textMuted },
    insightLine: { fontSize: 12.5, color: Colors.warning, lineHeight: 18, marginTop: Spacing.sm },
    detectedTrendRow: { backgroundColor: Colors.surfaceVariant, borderRadius: Radius.md, padding: Spacing.md, marginTop: Spacing.sm },
    detectedTrendText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
    detectedTrendLink: { fontSize: 12.5, fontWeight: '700', color: Colors.primary, marginTop: 6 },
    coverageInsightOk: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18, marginTop: Spacing.sm },

    healthScoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginBottom: Spacing.md },
    healthScoreBox: { alignItems: 'center', flex: 1 },
    healthScoreLabel: { fontSize: 11, color: Colors.textSecondary, marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: 0.3 },
    healthScoreVal: { fontSize: 24, fontWeight: '800' },
    healthScoreBand: { fontSize: 12, fontWeight: '600', marginTop: 2 },
    healthScoreArrow: { fontSize: 18, color: Colors.textMuted, paddingHorizontal: Spacing.sm },
    healthDriverRow: { marginBottom: Spacing.sm },
    healthDriverName: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary },
    healthDriverExplanation: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
    healthUnchangedNote: { fontSize: 11, color: Colors.textMuted, lineHeight: 16, marginTop: Spacing.sm },

    scenarioCard: {
        backgroundColor: Colors.surfaceVariant, borderRadius: Radius.md, padding: Spacing.md,
        marginBottom: Spacing.sm, borderLeftWidth: 3,
    },
    scenarioTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
    scenarioPressureNote: { fontSize: 11.5, color: Colors.warning, lineHeight: 16, marginTop: 6 },

    aiCard: {
        backgroundColor: Colors.surface, borderRadius: 14, padding: Spacing.lg, marginBottom: 14,
        borderWidth: 1, borderColor: Colors.primary, ...Shadow.sm,
    },
    aiCardTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
    aiActionRow: { marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
    aiActionTitle: { fontSize: 13.5, fontWeight: '700', color: Colors.textPrimary, marginBottom: 3 },
    aiActionDesc: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 17, marginBottom: 4 },
    aiActionImpact: { fontSize: 12, fontWeight: '600' },
    aiCardLink: { fontSize: 13, fontWeight: '700', color: Colors.primary, marginTop: Spacing.md },

    factorRow: { marginBottom: Spacing.md, paddingBottom: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
    factorHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: Spacing.sm },
    factorLabel: { fontSize: 13.5, fontWeight: '700', color: Colors.textPrimary, flexShrink: 1 },
    factorBadge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
    factorBadgeText: { fontSize: 10.5, fontWeight: '700' },
    factorSentence: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },

    seasonalityToggleRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: Spacing.sm },
    checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surfaceVariant },
    checkboxActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    checkboxLabel: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 16 },

    radarHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border, paddingBottom: 6, marginBottom: 4 },
    radarHeaderText: { fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase' as const, fontSize: 9.5 },
    radarRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
    radarCell: { flex: 1, fontSize: 12, fontWeight: '600' },

    combinedInsightRow: {
        backgroundColor: Colors.surfaceVariant, borderRadius: Radius.md, padding: Spacing.md,
        marginBottom: Spacing.sm, borderLeftWidth: 3, borderLeftColor: Colors.warning,
    },
    combinedInsightRowOpportunity: { borderLeftColor: Colors.income },
    combinedInsightTitle: { fontSize: 13.5, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
    combinedInsightText: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },

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
    plSubheading: { fontSize: 12, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
    plSubheadingDivider: { paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border },
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
