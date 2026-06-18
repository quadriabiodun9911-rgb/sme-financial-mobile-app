import React, { useState, useMemo } from 'react';
import {
    SafeAreaView, ScrollView, View, Text,
    TouchableOpacity, StyleSheet, TextInput,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import {
    computeWeeklyCFOSummary,
    computeRiskScore,
    computeRevenueForecast,
    computeCashFlowForecast,
    computeFinancialRatios,
    computeDSCR,
    computeBreakEven,
    computeCustomerConcentration,
    computeSeasonalRisk,
    computeDebtOptimiser,
    computePaymentOptimiser,
} from '../utils/finance';

type Tab = 'overview' | 'forecast' | 'ratios' | 'risk' | 'debt';

// ── Unicode bar chart helper ──────────────────────────────────────────────────
const BAR_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

function toBarChar(value: number, max: number): string {
    if (max === 0) return BAR_CHARS[0];
    const idx = Math.min(7, Math.floor((value / max) * 7));
    return BAR_CHARS[idx];
}

function TextBarChart({ data, label }: { data: { label: string; value: number }[]; label: string }) {
    const max = Math.max(...data.map(d => d.value), 1);
    return (
        <View style={barStyles.container}>
            <Text style={barStyles.label}>{label}</Text>
            <View style={barStyles.chartRow}>
                {data.map((d, i) => (
                    <View key={i} style={barStyles.barCol}>
                        <Text style={barStyles.barChar}>{toBarChar(d.value, max)}</Text>
                        <Text style={barStyles.barLabel}>{d.label}</Text>
                    </View>
                ))}
            </View>
        </View>
    );
}

const barStyles = StyleSheet.create({
    container: { marginVertical: 8 },
    label:     { fontSize: 12, color: Colors.textMuted, marginBottom: 6 },
    chartRow:  { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
    barCol:    { alignItems: 'center', flex: 1 },
    barChar:   { fontSize: 22, color: Colors.primary },
    barLabel:  { fontSize: 9, color: Colors.textMuted, marginTop: 2 },
});

// ── Grade color ───────────────────────────────────────────────────────────────
function gradeColor(grade: string) {
    switch (grade) {
        case 'A': return Colors.income;
        case 'B': return Colors.income;
        case 'C': return Colors.warning;
        case 'D': return Colors.expense;
        case 'F': return Colors.expense;
        default:  return Colors.textMuted;
    }
}

function statusColor(status: string) {
    if (status === 'good' || status === 'healthy') return Colors.income;
    if (status === 'warning') return Colors.warning;
    return Colors.expense;
}

// ── Tab: Overview ─────────────────────────────────────────────────────────────
function OverviewTab() {
    const { transactions, goals, loans, finance, settings } = useApp();
    const { currency } = settings;
    const summary = useMemo(() => computeWeeklyCFOSummary(transactions, goals, loans, finance), [transactions, goals, loans, finance]);
    const risk    = useMemo(() => computeRiskScore(finance, loans, transactions), [finance, loans, transactions]);

    return (
        <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
            {/* Weekly summary */}
            <View style={s.card}>
                <Text style={s.cardTitle}>This Week vs Last Week</Text>
                <View style={s.metricsRow}>
                    <View style={s.metricBox}>
                        <Text style={s.metricLabel}>Income</Text>
                        <Text style={[s.metricVal, { color: Colors.income }]}>{currency}{summary.thisWeekIncome.toLocaleString()}</Text>
                        <Text style={[s.metricSub, { color: summary.weeklyChange >= 0 ? Colors.income : Colors.expense }]}>
                            {summary.weeklyChange >= 0 ? '▲' : '▼'} {Math.abs(summary.weeklyChange).toFixed(1)}%
                        </Text>
                    </View>
                    <View style={s.metricDivider} />
                    <View style={s.metricBox}>
                        <Text style={s.metricLabel}>Expenses</Text>
                        <Text style={[s.metricVal, { color: Colors.expense }]}>{currency}{summary.thisWeekExpense.toLocaleString()}</Text>
                        <Text style={s.metricSub}>Last: {currency}{summary.lastWeekExpense.toLocaleString()}</Text>
                    </View>
                    <View style={s.metricDivider} />
                    <View style={s.metricBox}>
                        <Text style={s.metricLabel}>Cash Runway</Text>
                        <Text style={[s.metricVal, { color: summary.cashRunwayDays < 30 ? Colors.expense : Colors.income }]}>
                            {summary.cashRunwayDays > 365 ? 'Very healthy' : summary.cashRunwayDays > 90 ? Math.round(summary.cashRunwayDays / 30) + ' months' : summary.cashRunwayDays > 0 ? summary.cashRunwayDays + ' days' : '∞'}
                        </Text>
                        <Text style={s.metricSub}>days</Text>
                    </View>
                </View>
            </View>

            {/* Risk score gauge */}
            <View style={s.card}>
                <Text style={s.cardTitle}>Risk Score</Text>
                <View style={s.riskGaugeRow}>
                    <View style={s.riskGauge}>
                        <Text style={[s.riskGradeText, { color: gradeColor(risk.grade) }]}>{risk.grade}</Text>
                        <Text style={[s.riskScoreText, { color: gradeColor(risk.grade) }]}>{risk.score}/100</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        {risk.factors.map(f => (
                            <View key={f.name} style={s.factorRow}>
                                <Text style={[s.factorDot, { color: statusColor(f.status) }]}>●</Text>
                                <Text style={s.factorName}>{f.name}</Text>
                                <Text style={[s.factorScore, { color: statusColor(f.status) }]}>{f.score}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            </View>

            {/* Top risks */}
            {summary.topRisks.length > 0 && (
                <View style={[s.card, s.riskCard]}>
                    <Text style={s.cardTitle}>Top Risks</Text>
                    {summary.topRisks.map((r, i) => (
                        <Text key={i} style={s.riskItem}>⚠ {r}</Text>
                    ))}
                </View>
            )}

            {/* Top actions */}
            {summary.topActions.length > 0 && (
                <View style={[s.card, s.actionCard]}>
                    <Text style={s.cardTitle}>Recommended Actions</Text>
                    {summary.topActions.map((a, i) => (
                        <Text key={i} style={s.actionItem}>→ {a}</Text>
                    ))}
                </View>
            )}
        </ScrollView>
    );
}

// ── Tab: Forecast ─────────────────────────────────────────────────────────────
function ForecastTab() {
    const { transactions, loans, invoices, settings } = useApp();
    const { currency } = settings;
    const [forecastMonths, setForecastMonths] = useState<3 | 6 | 12>(3);

    const forecast   = useMemo(() => computeRevenueForecast(transactions, forecastMonths), [transactions, forecastMonths]);
    const cashFlow   = useMemo(() => computeCashFlowForecast(transactions, loans, invoices), [transactions, loans, invoices]);

    const chartData  = forecast.map(f => ({ label: f.month.split(' ')[0], value: f.projected }));

    return (
        <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
            {/* Revenue forecast */}
            <View style={s.card}>
                <Text style={s.cardTitle}>Revenue Forecast</Text>
                <View style={s.toggleRow}>
                    {([3, 6, 12] as const).map(m => (
                        <TouchableOpacity
                            key={m}
                            style={[s.toggleBtn, forecastMonths === m && s.toggleActive]}
                            onPress={() => setForecastMonths(m)}
                        >
                            <Text style={[s.toggleText, forecastMonths === m && s.toggleTextActive]}>{m}M</Text>
                        </TouchableOpacity>
                    ))}
                </View>
                <TextBarChart data={chartData} label="Projected Monthly Revenue" />
                {forecast.map((f, i) => (
                    <View key={i} style={s.forecastRow}>
                        <Text style={s.forecastMonth}>{f.month}</Text>
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={[s.forecastVal, { color: Colors.primary }]}>{currency}{Math.round(f.projected).toLocaleString()}</Text>
                            <Text style={s.forecastRange}>
                                <Text style={{ color: Colors.income }}>{currency}{Math.round(f.bestCase).toLocaleString()}</Text>
                                {' / '}
                                <Text style={{ color: Colors.expense }}>{currency}{Math.round(f.worstCase).toLocaleString()}</Text>
                            </Text>
                        </View>
                    </View>
                ))}
            </View>

            {/* 90-day cash flow */}
            <View style={s.card}>
                <Text style={s.cardTitle}>90-Day Cash Flow Forecast</Text>
                <View style={s.tableHeader}>
                    <Text style={[s.th, { flex: 2 }]}>Week</Text>
                    <Text style={s.th}>In</Text>
                    <Text style={s.th}>Out</Text>
                    <Text style={s.th}>Net</Text>
                </View>
                {cashFlow.map((w, i) => (
                    <View key={i} style={[s.tableRow, w.alert && s.alertRow]}>
                        <Text style={[s.td, { flex: 2 }]}>{w.week}</Text>
                        <Text style={[s.td, { color: Colors.income }]}>{w.projectedInflow > 0 ? `${Math.round(w.projectedInflow / 1000)}k` : '-'}</Text>
                        <Text style={[s.td, { color: Colors.expense }]}>{Math.round(w.projectedOutflow / 1000)}k</Text>
                        <Text style={[s.td, { color: w.netCash >= 0 ? Colors.income : Colors.expense }]}>
                            {w.netCash >= 0 ? '+' : ''}{Math.round(w.netCash / 1000)}k
                        </Text>
                    </View>
                ))}
            </View>
        </ScrollView>
    );
}

// ── Tab: Ratios ───────────────────────────────────────────────────────────────
function RatiosTab() {
    const { finance, loans, transactions, settings } = useApp();
    const { currency } = settings;
    const ratios = useMemo(() => computeFinancialRatios(finance, loans), [finance, loans]);
    const dscr   = useMemo(() => computeDSCR(transactions, loans), [transactions, loans]);

    const [fixedCosts, setFixedCosts]     = useState('');
    const [varRate, setVarRate]           = useState('');
    const [pricePerUnit, setPricePerUnit] = useState('');

    const breakEven = useMemo(() => {
        const fc = parseFloat(fixedCosts) || 0;
        const vr = parseFloat(varRate) || 0;
        const pp = parseFloat(pricePerUnit) || 0;
        if (fc > 0 && pp > 0) return computeBreakEven(fc, vr, pp);
        return null;
    }, [fixedCosts, varRate, pricePerUnit]);

    const ratioCards = [
        { label: 'Current Ratio', value: ratios.currentRatio.toFixed(2), good: ratios.currentRatio >= 1.5, unit: 'x' },
        { label: 'Debt to Equity', value: ratios.debtToEquity.toFixed(2), good: ratios.debtToEquity <= 0.8, unit: 'x' },
        { label: 'Return on Assets', value: ratios.returnOnAssets.toFixed(1), good: ratios.returnOnAssets >= 10, unit: '%' },
        { label: 'Monthly Burn Rate', value: `${currency}${Math.round(ratios.burnRate).toLocaleString()}`, good: true, unit: '/mo' },
        { label: 'Profit Margin', value: ratios.profitMargin.toFixed(1), good: ratios.profitMargin >= 15, unit: '%' },
    ];

    return (
        <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
            <View style={s.ratioGrid}>
                {ratioCards.map((r, i) => (
                    <View key={i} style={s.ratioCard}>
                        <Text style={s.ratioLabel}>{r.label}</Text>
                        <Text style={[s.ratioVal, { color: r.good ? Colors.income : Colors.expense }]}>
                            {r.value}{r.unit}
                        </Text>
                    </View>
                ))}
            </View>

            {/* DSCR */}
            <View style={[s.card, { borderLeftWidth: 3, borderLeftColor: statusColor(dscr.status) }]}>
                <Text style={s.cardTitle}>Debt Service Coverage Ratio (DSCR)</Text>
                <Text style={[s.bigNum, { color: statusColor(dscr.status) }]}>{dscr.dscr > 100 ? '∞' : dscr.dscr.toFixed(2)}x</Text>
                <Text style={s.cardSub}>{dscr.status === 'healthy' ? '✓ Healthy — income covers debt well' : dscr.status === 'warning' ? '⚠ Borderline — watch debt closely' : '✗ Danger — income may not cover debt'}</Text>
                <Text style={[s.cardSub, { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic', marginBottom: 6 }]}>
                    Above 1.0 means your income covers loan payments. Above 2.0 is excellent.
                </Text>
                <View style={s.dscrRow}>
                    <Text style={s.dscrLabel}>Net Operating Income</Text>
                    <Text style={[s.dscrVal, { color: Colors.income }]}>{currency}{Math.round(dscr.netOperatingIncome).toLocaleString()}</Text>
                </View>
                <View style={s.dscrRow}>
                    <Text style={s.dscrLabel}>Annual Debt Service</Text>
                    <Text style={[s.dscrVal, { color: Colors.expense }]}>{currency}{Math.round(dscr.totalDebtService).toLocaleString()}</Text>
                </View>
            </View>

            {/* Break-even calculator */}
            <View style={s.card}>
                <Text style={s.cardTitle}>Break-Even Calculator</Text>
                <TextInput style={s.input} placeholder={`Fixed Costs (${currency})`} placeholderTextColor={Colors.textMuted} keyboardType="decimal-pad" value={fixedCosts} onChangeText={setFixedCosts} />
                <TextInput style={s.input} placeholder={`Variable Cost per Unit (${currency})`} placeholderTextColor={Colors.textMuted} keyboardType="decimal-pad" value={varRate} onChangeText={setVarRate} />
                <TextInput style={s.input} placeholder={`Revenue per Unit (${currency})`} placeholderTextColor={Colors.textMuted} keyboardType="decimal-pad" value={pricePerUnit} onChangeText={setPricePerUnit} />
                {breakEven && (
                    <View style={s.breakEvenResult}>
                        <View style={s.dscrRow}>
                            <Text style={s.dscrLabel}>Break-Even Units</Text>
                            <Text style={s.dscrVal}>{isFinite(breakEven.breakEvenUnits) ? Math.ceil(breakEven.breakEvenUnits).toLocaleString() : '∞'}</Text>
                        </View>
                        <View style={s.dscrRow}>
                            <Text style={s.dscrLabel}>Break-Even Revenue</Text>
                            <Text style={s.dscrVal}>{isFinite(breakEven.breakEvenRevenue) ? `${currency}${Math.ceil(breakEven.breakEvenRevenue).toLocaleString()}` : '∞'}</Text>
                        </View>
                        <View style={s.dscrRow}>
                            <Text style={s.dscrLabel}>Margin of Safety</Text>
                            <Text style={[s.dscrVal, { color: breakEven.marginOfSafety > 20 ? Colors.income : Colors.warning }]}>{breakEven.marginOfSafety.toFixed(1)}%</Text>
                        </View>
                        <Text style={[s.cardSub, { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic', marginTop: 4 }]}>
                            How much your sales can fall before you start losing money. Higher is safer.
                        </Text>
                    </View>
                )}
            </View>
        </ScrollView>
    );
}

// ── Tab: Risk ─────────────────────────────────────────────────────────────────
function RiskTab() {
    const { transactions, loans, finance } = useApp();
    const concentration = useMemo(() => computeCustomerConcentration(transactions), [transactions]);
    const seasonal      = useMemo(() => computeSeasonalRisk(transactions), [transactions]);
    const risk          = useMemo(() => computeRiskScore(finance, loans, transactions), [finance, loans, transactions]);

    const MONTHS_GRID = [
        seasonal.slice(0, 6),
        seasonal.slice(6, 12),
    ];

    return (
        <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
            {/* Risk score breakdown */}
            <View style={s.card}>
                <Text style={s.cardTitle}>Risk Score Breakdown</Text>
                <View style={s.riskGaugeRow}>
                    <Text style={[s.riskGradeText, { color: gradeColor(risk.grade), fontSize: 48 }]}>{risk.grade}</Text>
                    <View style={{ flex: 1, marginLeft: 16 }}>
                        {risk.factors.map(f => (
                            <View key={f.name} style={{ marginBottom: 6 }}>
                                <View style={s.factorRow}>
                                    <Text style={s.factorName}>{f.name}</Text>
                                    <Text style={[s.factorScore, { color: statusColor(f.status) }]}>{f.score}/100</Text>
                                </View>
                                <View style={s.progressBar}>
                                    <View style={[s.progressFill, { width: `${f.score}%` as `${number}%`, backgroundColor: statusColor(f.status) }]} />
                                </View>
                            </View>
                        ))}
                    </View>
                </View>
            </View>

            {/* Customer concentration */}
            <View style={s.card}>
                <Text style={s.cardTitle}>Customer Concentration Risk</Text>
                {concentration.length === 0 ? (
                    <Text style={s.empty}>No income transactions with customer data</Text>
                ) : (
                    concentration.slice(0, 8).map((c, i) => (
                        <View key={i} style={s.concRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={s.concName}>{c.customer}</Text>
                                <Text style={s.concPct}>{c.percentage.toFixed(1)}% of revenue</Text>
                            </View>
                            <View style={[s.riskBadge, { backgroundColor: c.risk === 'high' ? Colors.expense : c.risk === 'medium' ? Colors.warning : Colors.income }]}>
                                <Text style={s.riskBadgeText}>{c.risk.toUpperCase()}</Text>
                            </View>
                        </View>
                    ))
                )}
            </View>

            {/* Seasonal calendar */}
            <View style={s.card}>
                <Text style={s.cardTitle}>Seasonal Revenue Risk</Text>
                {MONTHS_GRID.map((row, ri) => (
                    <View key={ri} style={s.seasonRow}>
                        {row.map((m, i) => (
                            <View key={i} style={[s.seasonCell, { borderColor: m.riskLevel === 'high' ? Colors.expense : m.riskLevel === 'medium' ? Colors.warning : Colors.income }]}>
                                <Text style={s.seasonMonth}>{m.month}</Text>
                                <Text style={[s.seasonRisk, { color: m.riskLevel === 'high' ? Colors.expense : m.riskLevel === 'medium' ? Colors.warning : Colors.income }]}>
                                    {m.riskLevel === 'high' ? '✗' : m.riskLevel === 'medium' ? '!' : '✓'}
                                </Text>
                            </View>
                        ))}
                    </View>
                ))}
                {seasonal.filter(m => m.riskLevel !== 'low').map((m, i) => (
                    <Text key={i} style={[s.seasonWarning, { color: m.riskLevel === 'high' ? Colors.expense : Colors.warning }]}>
                        {m.warning}
                    </Text>
                ))}
            </View>
        </ScrollView>
    );
}

// ── Tab: Debt ─────────────────────────────────────────────────────────────────
function DebtTab() {
    const { loans, transactions, invoices, finance, settings } = useApp();
    const { currency } = settings;
    const debtOpt     = useMemo(() => computeDebtOptimiser(loans), [loans]);
    const payActions  = useMemo(() => computePaymentOptimiser(transactions, invoices, finance.cashBalance), [transactions, invoices, finance.cashBalance]);

    return (
        <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
            {/* Debt optimiser */}
            <View style={s.card}>
                <Text style={s.cardTitle}>Debt Repayment Optimiser</Text>
                {loans.filter(l => l.status === 'active').length === 0 ? (
                    <Text style={s.empty}>No active loans.</Text>
                ) : (
                    <>
                        <View style={s.debtMethodRow}>
                            <View style={[s.debtMethod, { borderColor: Colors.primary }]}>
                                <Text style={[s.debtMethodLabel, { color: Colors.primary }]}>AVALANCHE</Text>
                                <Text style={s.debtMethodSub}>Pay highest interest first — saves most money</Text>
                                {debtOpt.avalanche.order.map((name, i) => (
                                    <Text key={i} style={s.debtLoan}>{i + 1}. {name}</Text>
                                ))}
                                <Text style={[s.debtSaved, { color: Colors.income }]}>Saves ~{currency}{Math.abs(debtOpt.avalanche.totalInterestSaved).toLocaleString()}</Text>
                                <Text style={s.debtMonths}>{debtOpt.avalanche.monthsToPayoff} months</Text>
                            </View>
                            <View style={[s.debtMethod, { borderColor: Colors.muted }]}>
                                <Text style={[s.debtMethodLabel, { color: Colors.textMuted }]}>SNOWBALL</Text>
                                <Text style={s.debtMethodSub}>Pay smallest balance first — easier to stay motivated</Text>
                                {debtOpt.snowball.order.map((name, i) => (
                                    <Text key={i} style={s.debtLoan}>{i + 1}. {name}</Text>
                                ))}
                                <Text style={s.debtMonths}>{debtOpt.snowball.monthsToPayoff} months</Text>
                            </View>
                        </View>
                        <View style={s.recommendBox}>
                            <Text style={s.recommendText}>💡 {debtOpt.recommendation}</Text>
                        </View>
                    </>
                )}
            </View>

            {/* Payment timing optimiser */}
            <View style={s.card}>
                <Text style={s.cardTitle}>Payment Timing Optimiser</Text>
                {payActions.length === 0 ? (
                    <Text style={s.empty}>No pending payments or collections.</Text>
                ) : (
                    payActions.map((a, i) => (
                        <View key={i} style={[s.payRow, { borderLeftColor: a.urgency === 'urgent' ? Colors.expense : a.urgency === 'soon' ? Colors.warning : Colors.income }]}>
                            <View style={s.payTop}>
                                <Text style={[s.payAction, { color: a.action === 'collect' ? Colors.income : Colors.expense }]}>
                                    {a.action === 'collect' ? '↓ COLLECT' : '↑ PAY'}
                                </Text>
                                <View style={[s.urgencyBadge, { backgroundColor: a.urgency === 'urgent' ? Colors.expense : a.urgency === 'soon' ? Colors.warning : Colors.muted }]}>
                                    <Text style={s.urgencyText}>{a.urgency.toUpperCase()}</Text>
                                </View>
                            </View>
                            <Text style={s.payDesc}>{a.description}</Text>
                            <Text style={s.payAmount}>{settings.currency}{a.amount.toLocaleString()} · Due {a.dueDate}</Text>
                            <Text style={s.payImpact}>{a.impact}</Text>
                        </View>
                    ))
                )}
            </View>
        </ScrollView>
    );
}

// ── Main CFO Screen ───────────────────────────────────────────────────────────
export default function CFOScreen() {
    const { navigate, transactions, setCurrentScreen } = useApp();
    const [activeTab, setActiveTab] = useState<Tab>('overview');

    const TABS: { key: Tab; label: string }[] = [
        { key: 'overview', label: 'Overview' },
        { key: 'forecast', label: 'Forecast' },
        { key: 'ratios',   label: 'Ratios'   },
        { key: 'risk',     label: 'Risk'      },
        { key: 'debt',     label: 'Debt'      },
    ];

    const hasEnoughData = transactions.length >= 3;

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <View style={s.headerRow}>
                <TouchableOpacity onPress={() => navigate('dashboard')}>
                    <Text style={s.backBtn}>← Dashboard</Text>
                </TouchableOpacity>
                <Text style={s.screenTitle}>CFO Advisor</Text>
            </View>

            {/* Empty state — shown when not enough data */}
            {!hasEnoughData && (
                <View style={s.emptyState}>
                    <Text style={s.emptyIcon}>🧠</Text>
                    <Text style={s.emptyTitle}>Your CFO is ready when you are</Text>
                    <Text style={s.emptyBody}>
                        Add at least 3 transactions to unlock forecasting, risk scoring, financial ratios, and your personalised CFO insights.
                    </Text>
                    <Text style={s.emptyProgress}>{transactions.length}/3 transactions added</Text>
                    <View style={s.emptyProgressBarBg}>
                        <View style={[s.emptyProgressBarFill, { width: `${Math.min(100, (transactions.length / 3) * 100)}%` as any }]} />
                    </View>
                    <TouchableOpacity style={s.emptyBtn} onPress={() => setCurrentScreen('transactions')}>
                        <Text style={s.emptyBtnText}>Add Transactions →</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Tab bar — only when data exists */}
            {hasEnoughData && (
                <>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBar} contentContainerStyle={s.tabBarContent}>
                        {TABS.map(tab => (
                            <TouchableOpacity
                                key={tab.key}
                                style={[s.tab, activeTab === tab.key && s.tabActive]}
                                onPress={() => setActiveTab(tab.key)}
                            >
                                <Text style={[s.tabText, activeTab === tab.key && s.tabTextActive]}>{tab.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    {activeTab === 'overview' && <OverviewTab />}
                    {activeTab === 'forecast' && <ForecastTab />}
                    {activeTab === 'ratios'   && <RatiosTab />}
                    {activeTab === 'risk'     && <RiskTab />}
                    {activeTab === 'debt'     && <DebtTab />}
                </>
            )}

            <FooterNav />
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe:        { flex: 1, backgroundColor: Colors.bg },
    scroll:      { flex: 1, backgroundColor: Colors.bg },
    pad:         { padding: 16, paddingBottom: 100 },

    headerRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 12 },
    backBtn:     { color: Colors.primary, fontSize: 14 },
    screenTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary },

    emptyState:           { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    emptyIcon:            { fontSize: 56, marginBottom: 16 },
    emptyTitle:           { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary, textAlign: 'center', marginBottom: 12 },
    emptyBody:            { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
    emptyProgress:        { fontSize: 13, color: Colors.textSecondary, marginBottom: 8 },
    emptyProgressBarBg:   { width: '100%', height: 6, backgroundColor: Colors.border, borderRadius: 3, marginBottom: 24 },
    emptyProgressBarFill: { height: 6, backgroundColor: Colors.primary, borderRadius: 3 },
    emptyBtn:             { backgroundColor: Colors.primary, paddingVertical: 13, paddingHorizontal: 32, borderRadius: 10 },
    emptyBtnText:         { color: '#fff', fontWeight: 'bold', fontSize: 15 },

    tabBar:        { maxHeight: 44, backgroundColor: Colors.surface },
    tabBarContent: { paddingHorizontal: 12, gap: 4, alignItems: 'center' },
    tab:           { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 6 },
    tabActive:     { backgroundColor: Colors.primary },
    tabText:       { fontSize: 13, color: Colors.textMuted },
    tabTextActive: { color: '#fff', fontWeight: '700' },

    card:         { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 12 },
    cardTitle:    { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 12 },
    cardSub:      { fontSize: 13, color: Colors.textSecondary, marginBottom: 8 },
    bigNum:       { fontSize: 32, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
    empty:        { fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingVertical: 12 },

    metricsRow:   { flexDirection: 'row', alignItems: 'center' },
    metricBox:    { flex: 1, alignItems: 'center' },
    metricLabel:  { fontSize: 10, color: Colors.textMuted, marginBottom: 4 },
    metricVal:    { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
    metricSub:    { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
    metricDivider:{ width: 1, backgroundColor: Colors.border, alignSelf: 'stretch', marginHorizontal: 8 },

    riskGaugeRow:  { flexDirection: 'row', alignItems: 'center', gap: 16 },
    riskGauge:     { alignItems: 'center', justifyContent: 'center', width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: Colors.border },
    riskGradeText: { fontSize: 28, fontWeight: 'bold' },
    riskScoreText: { fontSize: 11, color: Colors.textMuted },
    riskCard:      { borderLeftWidth: 3, borderLeftColor: Colors.expense },
    riskItem:      { fontSize: 13, color: Colors.expense, marginBottom: 6 },
    actionCard:    { borderLeftWidth: 3, borderLeftColor: Colors.income },
    actionItem:    { fontSize: 13, color: Colors.income, marginBottom: 6 },
    factorRow:     { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    factorDot:     { fontSize: 10, marginRight: 6 },
    factorName:    { flex: 1, fontSize: 12, color: Colors.textSecondary },
    factorScore:   { fontSize: 12, fontWeight: '700' },
    progressBar:   { height: 4, backgroundColor: Colors.border, borderRadius: 2, marginTop: 2 },
    progressFill:  { height: 4, borderRadius: 2 },

    toggleRow:     { flexDirection: 'row', gap: 8, marginBottom: 12 },
    toggleBtn:     { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.border },
    toggleActive:  { backgroundColor: Colors.primary },
    toggleText:    { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },
    toggleTextActive: { color: '#fff' },

    forecastRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.border },
    forecastMonth: { fontSize: 13, color: Colors.textSecondary },
    forecastVal:   { fontSize: 14, fontWeight: '700' },
    forecastRange: { fontSize: 11, color: Colors.textMuted },

    tableHeader:   { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
    th:            { flex: 1, fontSize: 10, color: Colors.textMuted, fontWeight: '700', textAlign: 'right' },
    tableRow:      { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: 'rgba(51,65,85,0.5)' },
    alertRow:      { backgroundColor: 'rgba(239,68,68,0.08)' },
    td:            { flex: 1, fontSize: 11, color: Colors.textSecondary, textAlign: 'right' },

    ratioGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
    ratioCard:     { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, width: '47%' },
    ratioLabel:    { fontSize: 11, color: Colors.textMuted, marginBottom: 4 },
    ratioVal:      { fontSize: 20, fontWeight: 'bold' },

    dscrRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderTopWidth: 1, borderTopColor: Colors.border },
    dscrLabel:     { fontSize: 13, color: Colors.textSecondary },
    dscrVal:       { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },

    input:         { backgroundColor: Colors.bg, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, padding: 12, color: Colors.textPrimary, marginBottom: 10, fontSize: 14 },
    breakEvenResult: { marginTop: 4 },

    concRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.border },
    concName:      { fontSize: 13, color: Colors.textPrimary, fontWeight: '600' },
    concPct:       { fontSize: 12, color: Colors.textMuted },
    riskBadge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    riskBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },

    seasonRow:     { flexDirection: 'row', gap: 6, marginBottom: 6 },
    seasonCell:    { flex: 1, alignItems: 'center', borderRadius: 6, padding: 6, borderWidth: 1, backgroundColor: Colors.bg },
    seasonMonth:   { fontSize: 9, color: Colors.textMuted },
    seasonRisk:    { fontSize: 14, fontWeight: 'bold' },
    seasonWarning: { fontSize: 11, marginTop: 4, marginBottom: 2 },

    debtMethodRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    debtMethod:    { flex: 1, borderWidth: 2, borderRadius: 12, padding: 12 },
    debtMethodLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 1 },
    debtMethodSub: { fontSize: 10, color: Colors.textMuted, marginBottom: 8 },
    debtLoan:      { fontSize: 12, color: Colors.textSecondary, marginBottom: 2 },
    debtSaved:     { fontSize: 13, fontWeight: '700', marginTop: 8 },
    debtMonths:    { fontSize: 11, color: Colors.textMuted },
    recommendBox:  { backgroundColor: 'rgba(37,99,235,0.1)', borderRadius: 8, padding: 12 },
    recommendText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },

    payRow:       { borderLeftWidth: 3, paddingLeft: 12, marginBottom: 12, paddingVertical: 4 },
    payTop:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    payAction:    { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
    payDesc:      { fontSize: 14, color: Colors.textPrimary, fontWeight: '600', marginBottom: 2 },
    payAmount:    { fontSize: 12, color: Colors.textSecondary, marginBottom: 2 },
    payImpact:    { fontSize: 11, color: Colors.textMuted },
    urgencyBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    urgencyText:  { fontSize: 9, fontWeight: '700', color: '#fff' },
});
