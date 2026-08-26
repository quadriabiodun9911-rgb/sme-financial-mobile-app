import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Colors } from '../theme/colors';
import { FinanceData, Transaction } from '../types';
import { computeMonthlyTrend, latestTransactionDate } from '../utils/finance';
import { computeMarginPct } from '../utils/priceHistory';
import NextStepLink from './NextStepLink';
import GroupedBarChart from './GroupedBarChart';
import TrendSparkline from './TrendSparkline';
import Collapsible from './Collapsible';

interface Props {
    finance: FinanceData;
    transactions: Transaction[];
    currency: string;
    targetMargin: string;
    onSeeBudget?: () => void;
}

// Merges what used to be two separately-placed "growth scenario" features
// that answered different questions but shared confusingly similar names:
// Growth Scenarios (Planning & Forecasts) modeled hypothetical revenue/cost
// paths under 3 presets, while Growth Trends (Growth Analytics) measured
// actual historical revenue growth and buried its own, differently-scoped
// "Growth Scenario Planner" inside it. One flow now: what your growth has
// actually been doing, what it could look like under different automatic
// assumptions, then an optional manual tool for testing your own target.
export default function GrowthOutlook({ finance, transactions, currency, targetMargin, onSeeBudget }: Props) {
    // ── Section 1: actual revenue history (was GrowthMetrics) ───────────
    const monthlyRevenue = useMemo(() => {
        const months = new Map<string, number>();
        // Read the month directly from the "YYYY-MM-DD" string instead of
        // via `new Date(tx.date)`, which parses as UTC midnight; reading it
        // back with getFullYear/getMonth (local time) moves the 1st of any
        // month into the previous month for any positive UTC offset (e.g.
        // Nigeria, UTC+1).
        for (const tx of transactions.filter(t => t.type === 'income')) {
            const monthKey = tx.date.slice(0, 7);
            if (monthKey.length !== 7) continue;
            months.set(monthKey, (months.get(monthKey) || 0) + (tx.amount ?? 0));
        }
        return Array.from(months.entries())
            .map(([month, revenue]) => ({ month, revenue, date: new Date(month + '-01') }))
            .sort((a, b) => a.date.getTime() - b.date.getTime())
            .slice(-12);
    }, [transactions]);

    const growthMetrics = useMemo(() => {
        if (monthlyRevenue.length < 2) {
            // finance.income is an all-time cumulative total, not a
            // monthly/quarterly/annual figure — reusing it for all three
            // period labels here would show the same (potentially
            // years-old-and-accumulated) number as if it were this
            // month's, this quarter's, AND this year's revenue. With fewer
            // than 2 recorded months there's no real quarterly or annual
            // figure yet, so those stay 0 rather than fabricated; only
            // "this month" gets a value, and only from the one real month
            // of data actually recorded (not the all-time total).
            const onlyMonth = monthlyRevenue.length === 1 ? monthlyRevenue[0].revenue : 0;
            return {
                currentMonthRevenue: onlyMonth, lastMonthRevenue: 0, monthlyGrowthRate: 0,
                quarterlyRevenue: 0, quarterlyGrowthRate: 0, annualRevenue: 0, annualGrowthRate: 0,
                avgMonthlyRevenue: onlyMonth, trend: 'stable' as const,
            };
        }
        const current = monthlyRevenue[monthlyRevenue.length - 1];
        const previous = monthlyRevenue[monthlyRevenue.length - 2];
        const threeMonthsAgo = monthlyRevenue.length >= 4 ? monthlyRevenue[monthlyRevenue.length - 4] : null;
        const twelveMonthsAgo = monthlyRevenue.length >= 13 ? monthlyRevenue[0] : null;

        const currentMonthRevenue = current.revenue;
        const lastMonthRevenue = previous.revenue;
        const monthlyGrowthRate = lastMonthRevenue > 0
            ? ((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : 0;

        const quarterlyRevenue = monthlyRevenue.slice(-3).reduce((sum, m) => sum + m.revenue, 0);
        const previousQuarterRevenue = threeMonthsAgo
            ? monthlyRevenue.slice(-6, -3).reduce((sum, m) => sum + m.revenue, 0) : quarterlyRevenue;
        const quarterlyGrowthRate = previousQuarterRevenue > 0
            ? ((quarterlyRevenue - previousQuarterRevenue) / previousQuarterRevenue) * 100 : 0;

        const annualRevenue = monthlyRevenue.reduce((sum, m) => sum + m.revenue, 0);
        const previousAnnualRevenue = twelveMonthsAgo
            ? monthlyRevenue.slice(0, -12).reduce((sum, m) => sum + m.revenue, 0) + monthlyRevenue.slice(-11).reduce((sum, m) => sum + m.revenue, 0)
            : annualRevenue;
        const annualGrowthRate = previousAnnualRevenue > 0
            ? ((annualRevenue - previousAnnualRevenue) / previousAnnualRevenue) * 100 : 0;

        // Scoped to this component's own trailing-12-data-months chart
        // window — a different figure, by design, from the canonical
        // `user.avgMonthlyRevenue` (total income / active months) that
        // CreditWorthinessScreen/FinancingMarketplaceScreen use for lending
        // decisions. Not a duplicate to consolidate; just don't assume the
        // two will match.
        const avgMonthlyRevenue = monthlyRevenue.reduce((sum, m) => sum + m.revenue, 0) / monthlyRevenue.length;

        let trend: 'growing' | 'declining' | 'stable' = 'stable';
        if (monthlyGrowthRate > 5) trend = 'growing';
        if (monthlyGrowthRate < -5) trend = 'declining';

        return {
            currentMonthRevenue, lastMonthRevenue, monthlyGrowthRate,
            quarterlyRevenue, quarterlyGrowthRate, annualRevenue, annualGrowthRate,
            avgMonthlyRevenue, trend,
        };
    }, [monthlyRevenue]);

    const revenueStdDev = monthlyRevenue.length > 1
        ? Math.sqrt(monthlyRevenue.reduce((sum, m) => sum + Math.pow(m.revenue - growthMetrics.avgMonthlyRevenue, 2), 0) / monthlyRevenue.length)
        : 0;
    const coefficientOfVariation = growthMetrics.avgMonthlyRevenue > 0
        ? (revenueStdDev / growthMetrics.avgMonthlyRevenue) * 100 : 0;

    const trendColor =
        growthMetrics.trend === 'growing' ? Colors.income
            : growthMetrics.trend === 'declining' ? Colors.expense
            : Colors.warning;

    // ── Section 2: scenario forecast (was BudgetForecast) ───────────────
    const [horizon, setHorizon] = useState<3 | 6 | 12>(6);
    const [activeScenario, setScenario] = useState<ScenarioKey>('base');
    const [customIncome, setCustomIncome] = useState(0);
    const [customCost, setCustomCost] = useState(0);

    // Anchored to the latest transaction date, not real-world "now" -- an
    // account with no activity in the literal current calendar month would
    // otherwise see this trend window fall back to the coarser lifetime
    // average below even though it has real recent history to trend from.
    const trend6mo = useMemo(() => computeMonthlyTrend(transactions, 6, latestTransactionDate(transactions) ?? undefined), [transactions]);
    const monthsWithData = trend6mo.filter(p => p.income > 0 || p.expense > 0).length;

    // Scoped to this forecast's own trailing-6-month trend window (falling
    // back to a lifetime/12 estimate only when there's no trend data at
    // all) — deliberately not the canonical `user.avgMonthlyRevenue` used
    // for lending decisions elsewhere, since a forward projection should
    // react to recent months, not a business's full history.
    const avgMonthlyIncome = monthsWithData > 0 ? trend6mo.reduce((s, p) => s + p.income, 0) / Math.max(monthsWithData, 1) : finance.income / 12;
    const avgMonthlyExpense = monthsWithData > 0 ? trend6mo.reduce((s, p) => s + p.expense, 0) / Math.max(monthsWithData, 1) : finance.expense / 12;

    const scenarios = useMemo(() => {
        return (Object.keys(SCENARIO_CONFIG) as ScenarioKey[]).map(key => {
            const cfg = SCENARIO_CONFIG[key];
            const ig = key === 'base' ? customIncome : cfg.incomeGrowth;
            const cg = key === 'base' ? customCost : cfg.costGrowth;
            const months = Array.from({ length: horizon }, (_, i) => {
                const d = new Date(); d.setMonth(d.getMonth() + i + 1);
                const label = d.toLocaleString('default', { month: 'short', year: '2-digit' });
                const income = avgMonthlyIncome * (1 + ig);
                const expense = avgMonthlyExpense * (1 + cg);
                return { label, income, expense, profit: income - expense };
            });
            const totalIncome = months.reduce((s, p) => s + p.income, 0);
            const totalExpense = months.reduce((s, p) => s + p.expense, 0);
            const totalProfit = totalIncome - totalExpense;
            const margin = computeMarginPct(totalIncome, totalExpense);
            return { key, cfg, months, totalIncome, totalExpense, totalProfit, margin };
        });
    }, [horizon, avgMonthlyIncome, avgMonthlyExpense, customIncome, customCost]);

    const active = scenarios.find(sc => sc.key === activeScenario)!;
    const targetM = parseFloat(targetMargin) || 0;

    const STEP = 0.05;
    const adj = (setter: (v: number) => void, cur: number, dir: number, min: number, max: number) =>
        setter(Math.max(min, Math.min(max, Math.round((cur + dir * STEP) * 100) / 100)));

    // ── Section 3: manual target planner (was GrowthMetrics' embedded
    // "Growth Scenario Planner") ─────────────────────────────────────────
    const [targetGrowthRate, setTargetGrowthRate] = useState('15');
    const [monthsToTarget, setMonthsToTarget] = useState('12');

    const targetPlan = useMemo(() => {
        const targetRate = parseFloat(targetGrowthRate) || 0;
        const months = parseFloat(monthsToTarget) || 1;
        const currentRevenue = growthMetrics.currentMonthRevenue || growthMetrics.avgMonthlyRevenue;

        const targetRevenue = currentRevenue * Math.pow(1 + targetRate / 100, months / 12);
        const additionalRevenueNeeded = targetRevenue - currentRevenue;
        const monthlyIncreaseNeeded = additionalRevenueNeeded / Math.max(1, months);
        const profitMargin = finance.margin || 0.25;
        const additionalCashGenerated = additionalRevenueNeeded * (profitMargin / 100);

        return {
            targetRevenue: Math.round(targetRevenue),
            additionalRevenueNeeded: Math.round(additionalRevenueNeeded),
            monthlyIncreaseNeeded: Math.round(monthlyIncreaseNeeded),
            additionalCashGenerated: Math.round(additionalCashGenerated),
            achievable: monthlyIncreaseNeeded < currentRevenue * 0.5,
        };
    }, [targetGrowthRate, monthsToTarget, growthMetrics, finance.margin]);

    const targetActions = useMemo(() => {
        const actions: string[] = [];
        if (growthMetrics.monthlyGrowthRate < 5) actions.push('Increase sales/marketing efforts');
        if (targetPlan.monthlyIncreaseNeeded > growthMetrics.currentMonthRevenue * 0.3) actions.push('May need to expand team or operations');
        if (finance.cashBalance < targetPlan.additionalCashGenerated) actions.push('Secure additional funding for growth investments');
        if (actions.length === 0) actions.push('On track! Maintain current growth trajectory.');
        return actions;
    }, [growthMetrics, targetPlan, finance.cashBalance]);

    return (
        <View>
            {/* ── 1. YOUR GROWTH SO FAR ─────────────────────────────────── */}
            <Text style={s.sectionLabel}>YOUR GROWTH SO FAR</Text>
            <Text style={s.sectionSub}>Real revenue history — updates automatically as you log income.</Text>

            {monthlyRevenue.length === 0 ? (
                <View style={s.card}>
                    <Text style={s.emptyText}>No revenue history yet. Add income transactions to see growth metrics.</Text>
                </View>
            ) : (
                <>
                    <View style={s.kpiRow}>
                        <KpiCard label="This Month" value={`${currency}${growthMetrics.currentMonthRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} color={Colors.income} />
                        <KpiCard label="Monthly Growth" value={`${growthMetrics.monthlyGrowthRate > 0 ? '+' : ''}${growthMetrics.monthlyGrowthRate.toFixed(1)}%`} color={growthMetrics.monthlyGrowthRate > 0 ? Colors.income : Colors.expense} />
                    </View>
                    <View style={s.kpiRow}>
                        <KpiCard label="Last 3 Months" value={`${currency}${growthMetrics.quarterlyRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} color={Colors.income} />
                        <KpiCard label="Quarterly Growth" value={`${growthMetrics.quarterlyGrowthRate > 0 ? '+' : ''}${growthMetrics.quarterlyGrowthRate.toFixed(1)}%`} color={growthMetrics.quarterlyGrowthRate > 0 ? Colors.income : Colors.expense} />
                    </View>

                    {monthlyRevenue.length >= 2 && (
                        <View style={s.card}>
                            <Text style={s.cardSub}>Revenue, last {monthlyRevenue.length} months</Text>
                            <TrendSparkline data={monthlyRevenue.map(m => m.revenue)} color={trendColor} height={56} />
                        </View>
                    )}

                    <View style={[s.trendCard, { borderLeftColor: trendColor }]}>
                        <Text style={[s.trendLabel, { color: trendColor }]}>
                            {growthMetrics.trend === 'growing' ? 'Growing' : growthMetrics.trend === 'declining' ? 'Declining' : 'Stable'}
                        </Text>
                        <Text style={s.trendDescription}>
                            {growthMetrics.trend === 'growing'
                                ? `Revenue increasing at ${growthMetrics.monthlyGrowthRate.toFixed(1)}% monthly`
                                : growthMetrics.trend === 'declining'
                                ? `Revenue declining at ${Math.abs(growthMetrics.monthlyGrowthRate).toFixed(1)}% monthly`
                                : 'Revenue growth is stable'}
                        </Text>
                    </View>

                    <View style={s.card}>
                        <Text style={s.cardTitle}>Growth Insights</Text>
                        {growthMetrics.monthlyGrowthRate > 10 && (
                            <InsightRow type="success" text={`Strong momentum — growing ${growthMetrics.monthlyGrowthRate.toFixed(1)}% monthly. Scale operations to capitalize.`} />
                        )}
                        {growthMetrics.monthlyGrowthRate > 0 && growthMetrics.monthlyGrowthRate <= 10 && (
                            <InsightRow type="info" text={`Steady growth at ${growthMetrics.monthlyGrowthRate.toFixed(1)}% monthly. Focus on consistency.`} />
                        )}
                        {growthMetrics.monthlyGrowthRate < -10 && (
                            <InsightRow type="warning" text="Revenue declining. Investigate causes and activate growth initiatives." />
                        )}
                        {coefficientOfVariation < 20 ? (
                            <InsightRow type="success" text="Revenue is predictable and stable. Good foundation for planning." />
                        ) : (
                            <InsightRow type="warning" text={`Revenue is variable (${coefficientOfVariation.toFixed(0)}% volatility). Work on predictability.`} />
                        )}
                    </View>
                </>
            )}

            {/* ── 2. SCENARIO FORECAST ─────────────────────────────────── */}
            <Text style={s.sectionLabel}>SCENARIO FORECAST</Text>
            <Text style={s.sectionSub}>
                Projects revenue and costs forward under different growth assumptions — separate from your
                category-by-category spending plan on the Budget screen.
            </Text>
            {onSeeBudget && (
                <NextStepLink text="Go to your actual Budget (spending by category)" onPress={onSeeBudget} />
            )}

            <View style={[s.row, { marginTop: 14 }]}>
                <Text style={s.rowLabel}>Forecast horizon:</Text>
                {([3, 6, 12] as const).map(h => (
                    <TouchableOpacity key={h} style={[s.chip, horizon === h && s.chipActive]} onPress={() => setHorizon(h)}>
                        <Text style={[s.chipText, horizon === h && s.chipTextActive]}>{h}mo</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <View style={s.row}>
                {(Object.keys(SCENARIO_CONFIG) as ScenarioKey[]).map(k => (
                    <TouchableOpacity key={k} style={[s.scenBtn, activeScenario === k && { borderColor: SCENARIO_CONFIG[k].color, backgroundColor: SCENARIO_CONFIG[k].color + '22' }]} onPress={() => setScenario(k)}>
                        <Text style={[s.scenLabel, { color: activeScenario === k ? SCENARIO_CONFIG[k].color : Colors.textMuted }]}>{SCENARIO_CONFIG[k].label}</Text>
                        <Text style={[s.scenSub, { color: activeScenario === k ? SCENARIO_CONFIG[k].color : Colors.textMuted }]}>
                            Rev {pct(SCENARIO_CONFIG[k].incomeGrowth)} / Cost {pct(SCENARIO_CONFIG[k].costGrowth)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {activeScenario === 'base' && (
                <View style={s.card}>
                    <Text style={s.cardTitle}>Adjust Base Case Assumptions</Text>
                    <AdjRow label="Revenue growth" value={customIncome} onMinus={() => adj(setCustomIncome, customIncome, -1, -0.5, 1.0)} onPlus={() => adj(setCustomIncome, customIncome, 1, -0.5, 1.0)} />
                    <AdjRow label="Cost growth" value={customCost} onMinus={() => adj(setCustomCost, customCost, -1, -0.5, 1.0)} onPlus={() => adj(setCustomCost, customCost, 1, -0.5, 1.0)} />
                </View>
            )}

            <View style={s.kpiRow}>
                <KpiCard label={`${horizon}mo Revenue`} value={`${currency}${Math.round(active.totalIncome).toLocaleString()}`} color={Colors.income} />
                <KpiCard label={`${horizon}mo Costs`} value={`${currency}${Math.round(active.totalExpense).toLocaleString()}`} color={Colors.expense} />
                <KpiCard label="Proj. Margin" value={`${active.margin.toFixed(1)}%`} color={active.margin >= targetM ? Colors.income : Colors.expense} />
            </View>

            <View style={s.card}>
                <Text style={s.cardTitle}>Scenario Comparison ({horizon} months)</Text>
                <View style={s.compHeader}>
                    <Text style={[s.compCell, { flex: 1.6 }]}>Scenario</Text>
                    <Text style={s.compCell}>Revenue</Text>
                    <Text style={s.compCell}>Profit</Text>
                    <Text style={s.compCell}>Margin</Text>
                </View>
                {scenarios.map(sc => (
                    <TouchableOpacity key={sc.key} style={[s.compRow, activeScenario === sc.key && s.compRowActive]} onPress={() => setScenario(sc.key)}>
                        <Text style={[s.compCell, { flex: 1.6, color: sc.cfg.color, fontWeight: '600' }]}>{sc.cfg.label}</Text>
                        <Text style={[s.compCell, { color: Colors.income }]}>{currency}{Math.round(sc.totalIncome / 1000)}k</Text>
                        <Text style={[s.compCell, { color: sc.totalProfit >= 0 ? Colors.income : Colors.expense }]}>
                            {sc.totalProfit >= 0 ? '+' : ''}{currency}{Math.round(sc.totalProfit / 1000)}k
                        </Text>
                        <Text style={[s.compCell, { color: sc.margin >= targetM ? Colors.income : Colors.expense }]}>{sc.margin.toFixed(1)}%</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <View style={s.card}>
                <Text style={s.cardTitle}>Monthly Projection — {SCENARIO_CONFIG[activeScenario].label}</Text>
                <GroupedBarChart
                    labels={active.months.map(pt => pt.label)}
                    series={[
                        { label: 'Revenue', color: Colors.income, values: active.months.map(pt => pt.income) },
                        { label: 'Cost', color: Colors.expense, values: active.months.map(pt => pt.expense) },
                    ]}
                />
            </View>

            <View style={s.card}>
                <Text style={s.cardTitle}>Month-by-Month — {SCENARIO_CONFIG[activeScenario].label}</Text>
                <View style={s.tableHeader}>
                    <Text style={s.tableMonth}>Month</Text>
                    <Text style={[s.tableVal, { color: Colors.income }]}>Revenue</Text>
                    <Text style={[s.tableVal, { color: Colors.expense }]}>Cost</Text>
                    <Text style={s.tableVal}>Profit</Text>
                </View>
                {active.months.map((pt, i) => (
                    <View key={i} style={s.tableRow}>
                        <Text style={s.tableMonth}>{pt.label}</Text>
                        <Text style={[s.tableVal, { color: Colors.income }]}>{currency}{Math.round(pt.income).toLocaleString()}</Text>
                        <Text style={[s.tableVal, { color: Colors.expense }]}>{currency}{Math.round(pt.expense).toLocaleString()}</Text>
                        <Text style={[s.tableVal, { color: pt.profit >= 0 ? Colors.income : Colors.expense }]}>
                            {pt.profit >= 0 ? '+' : ''}{currency}{Math.round(pt.profit).toLocaleString()}
                        </Text>
                    </View>
                ))}
                <View style={[s.tableRow, s.tableTotal]}>
                    <Text style={[s.tableMonth, { fontWeight: 'bold', color: Colors.textPrimary }]}>Total</Text>
                    <Text style={[s.tableVal, { color: Colors.income, fontWeight: 'bold' }]}>{currency}{Math.round(active.totalIncome).toLocaleString()}</Text>
                    <Text style={[s.tableVal, { color: Colors.expense, fontWeight: 'bold' }]}>{currency}{Math.round(active.totalExpense).toLocaleString()}</Text>
                    <Text style={[s.tableVal, { color: active.totalProfit >= 0 ? Colors.income : Colors.expense, fontWeight: 'bold' }]}>
                        {active.totalProfit >= 0 ? '+' : ''}{currency}{Math.round(active.totalProfit).toLocaleString()}
                    </Text>
                </View>
                <Text style={s.disc}>
                    Based on {monthsWithData > 0 ? `last ${monthsWithData} months` : 'overall averages'}.
                    {activeScenario !== 'base' ? ` ${SCENARIO_CONFIG[activeScenario].label}: revenue ${pct(SCENARIO_CONFIG[activeScenario].incomeGrowth)}, costs ${pct(SCENARIO_CONFIG[activeScenario].costGrowth)} vs average.` : ''}
                </Text>
            </View>

            {/* ── 3. MANUAL TOOLS ──────────────────────────────────────── */}
            <Text style={s.sectionLabel}>MANUAL TOOLS</Text>
            <Text style={s.sectionSub}>Set your own growth target and see what it would take to hit it.</Text>

            <Collapsible title="Target Growth Planner">
                <View style={s.card}>
                    <View style={s.inputRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={s.inputLabel}>Target Growth Rate (%/year)</Text>
                            <TextInput style={s.input} placeholder="15" placeholderTextColor={Colors.textMuted} value={targetGrowthRate} onChangeText={setTargetGrowthRate} keyboardType="decimal-pad" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.inputLabel}>Timeline (months)</Text>
                            <TextInput style={s.input} placeholder="12" placeholderTextColor={Colors.textMuted} value={monthsToTarget} onChangeText={setMonthsToTarget} keyboardType="number-pad" />
                        </View>
                    </View>

                    <View style={[s.targetCard, { borderLeftColor: targetPlan.achievable ? Colors.income : Colors.warning }]}>
                        <View style={s.targetHeader}>
                            <Text style={s.targetTitle}>If you grow {targetGrowthRate}% annually...</Text>
                            <Text style={[s.targetFeasibility, { color: targetPlan.achievable ? Colors.income : Colors.warning }]}>
                                {targetPlan.achievable ? '✓ Achievable' : '⚠ Aggressive'}
                            </Text>
                        </View>
                        <View style={{ gap: 8 }}>
                            <TargetMetric label="Target Revenue" value={`${currency}${targetPlan.targetRevenue.toLocaleString()}`} />
                            <TargetMetric label="Need to Add" value={`${currency}${targetPlan.additionalRevenueNeeded.toLocaleString()}`} />
                            <TargetMetric label="Monthly Increase" value={`${currency}${targetPlan.monthlyIncreaseNeeded.toLocaleString()}`} />
                            <TargetMetric label="Cash Generated" value={`${currency}${targetPlan.additionalCashGenerated.toLocaleString()}`} highlight />
                        </View>
                    </View>

                    <Text style={[s.cardTitle, { marginTop: 14 }]}>Growth Action Items</Text>
                    {targetActions.map((action, i) => (
                        <View key={i} style={s.actionItem}><Text style={s.actionText}>• {action}</Text></View>
                    ))}
                </View>
            </Collapsible>
        </View>
    );
}

type ScenarioKey = 'pessimistic' | 'base' | 'optimistic';

const SCENARIO_CONFIG: Record<ScenarioKey, { label: string; incomeGrowth: number; costGrowth: number; color: string }> = {
    pessimistic: { label: 'Pessimistic', incomeGrowth: -0.15, costGrowth: 0.10, color: Colors.expense },
    base: { label: 'Base Case', incomeGrowth: 0.00, costGrowth: 0.00, color: Colors.primary },
    optimistic: { label: 'Optimistic', incomeGrowth: 0.15, costGrowth: -0.05, color: Colors.income },
};

function pct(n: number) { return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(0)}%`; }

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>{label}</Text>
            <Text style={[s.kpiValue, { color }]}>{value}</Text>
        </View>
    );
}

function AdjRow({ label, value, onMinus, onPlus }: { label: string; value: number; onMinus: () => void; onPlus: () => void }) {
    return (
        <View style={s.adjRow}>
            <Text style={s.adjLabel}>{label}</Text>
            <TouchableOpacity style={s.adjBtn} onPress={onMinus}><Text style={s.adjBtnText}>−</Text></TouchableOpacity>
            <Text style={[s.adjVal, { color: value >= 0 ? Colors.income : Colors.expense }]}>{pct(value)}</Text>
            <TouchableOpacity style={s.adjBtn} onPress={onPlus}><Text style={s.adjBtnText}>+</Text></TouchableOpacity>
        </View>
    );
}

function InsightRow({ type, text }: { type: 'success' | 'warning' | 'info'; text: string }) {
    const color = type === 'success' ? Colors.income : type === 'warning' ? Colors.expense : Colors.warning;
    return (
        <View style={[s.insight, { borderLeftColor: color }]}>
            <Text style={s.insightText}>{text}</Text>
        </View>
    );
}

function TargetMetric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
    return (
        <View style={[s.targetMetric, highlight && { backgroundColor: Colors.primary + '15', borderLeftColor: Colors.primary, borderLeftWidth: 3 }]}>
            <Text style={s.targetMetricLabel}>{label}</Text>
            <Text style={[s.targetMetricValue, highlight && { color: Colors.primary, fontWeight: '700' }]}>{value}</Text>
        </View>
    );
}

const s = StyleSheet.create({
    sectionLabel: { fontSize: 11.5, fontWeight: '800', color: Colors.textMuted, letterSpacing: 0.6, marginTop: 6, marginBottom: 3 },
    sectionSub: { fontSize: 12, color: Colors.textMuted, marginBottom: 12, lineHeight: 17 },

    emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },

    kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    kpiCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: 10, padding: 12 },
    kpiLabel: { fontSize: 11, color: Colors.textSecondary, marginBottom: 6 },
    kpiValue: { fontSize: 16, fontWeight: 'bold' },

    card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12 },
    cardTitle: { fontSize: 14, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 12 },
    cardSub: { fontSize: 11, color: Colors.textSecondary, marginBottom: 8 },

    trendCard: { backgroundColor: Colors.surface, borderRadius: 10, padding: 12, borderLeftWidth: 4, marginBottom: 12 },
    trendLabel: { fontSize: 13, fontWeight: 'bold', marginBottom: 4 },
    trendDescription: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },

    insight: { backgroundColor: Colors.bg, borderRadius: 6, padding: 10, borderLeftWidth: 3, marginBottom: 8 },
    insightText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },

    row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    rowLabel: { fontSize: 12, color: Colors.textMuted },
    chip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
    chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    chipText: { fontSize: 12, color: Colors.textMuted },
    chipTextActive: { color: Colors.textPrimary, fontWeight: 'bold' },

    scenBtn: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 8, alignItems: 'center' },
    scenLabel: { fontSize: 11, fontWeight: '700', marginBottom: 2 },
    scenSub: { fontSize: 9 },

    adjRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
    adjLabel: { flex: 1, fontSize: 13, color: Colors.textSecondary },
    adjBtn: { width: 30, height: 30, borderRadius: 6, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
    adjBtnText: { fontSize: 18, color: Colors.textPrimary, lineHeight: 22 },
    adjVal: { width: 56, textAlign: 'center', fontSize: 13, fontWeight: '700' },

    compHeader: { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: 4 },
    compRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
    compRowActive: { backgroundColor: Colors.bg, borderRadius: 6 },
    compCell: { flex: 1, fontSize: 12, color: Colors.textMuted, textAlign: 'right' },

    tableHeader: { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: 2 },
    tableRow: { flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: Colors.border },
    tableTotal: { borderBottomWidth: 0, borderTopWidth: 1, borderTopColor: Colors.textMuted, marginTop: 4, paddingTop: 8 },
    tableMonth: { fontSize: 12, color: Colors.textMuted, width: 48 },
    tableVal: { flex: 1, fontSize: 11, fontWeight: '500', textAlign: 'right' },
    disc: { fontSize: 10, color: Colors.textMuted, marginTop: 10, fontStyle: 'italic', lineHeight: 15 },

    inputRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    inputLabel: { fontSize: 11, color: Colors.textSecondary, marginBottom: 6, fontWeight: '600' },
    input: { backgroundColor: Colors.bg, borderRadius: 6, borderWidth: 1, borderColor: Colors.border, padding: 10, fontSize: 14, color: Colors.textPrimary },

    targetCard: { backgroundColor: Colors.bg, borderRadius: 10, padding: 14, borderLeftWidth: 4, marginBottom: 4 },
    targetHeader: { marginBottom: 12 },
    targetTitle: { fontSize: 13, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
    targetFeasibility: { fontSize: 12, fontWeight: '600' },
    targetMetric: { backgroundColor: Colors.surface, borderRadius: 6, padding: 10 },
    targetMetricLabel: { fontSize: 11, color: Colors.textSecondary, marginBottom: 4 },
    targetMetricValue: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },

    actionItem: { paddingVertical: 6 },
    actionText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
});
