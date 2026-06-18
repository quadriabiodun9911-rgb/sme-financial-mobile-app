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

type Tab = 'pulse' | 'forecast' | 'finance' | 'risk' | 'growth';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtRunway(days: number): string {
    if (days > 365) return 'Very healthy';
    if (days > 90)  return Math.round(days / 30) + ' months';
    if (days > 0)   return days + ' days';
    return 'Unknown';
}

function healthLabel(score: number): { label: string; color: string; emoji: string } {
    if (score >= 80) return { label: 'Excellent',  color: Colors.income,   emoji: '🟢' };
    if (score >= 60) return { label: 'Good',        color: Colors.income,   emoji: '🟡' };
    if (score >= 40) return { label: 'Fair',        color: Colors.warning,  emoji: '🟠' };
    return               { label: 'Needs Work',  color: Colors.expense,  emoji: '🔴' };
}

function statusColor(status: string) {
    if (status === 'good' || status === 'healthy') return Colors.income;
    if (status === 'warning') return Colors.warning;
    return Colors.expense;
}

// Mini horizontal bar
function MiniBar({ pct, color }: { pct: number; color: string }) {
    return (
        <View style={{ height: 5, backgroundColor: Colors.border, borderRadius: 3, flex: 1, marginLeft: 8 }}>
            <View style={{ height: 5, width: `${Math.min(100, pct)}%` as any, backgroundColor: color, borderRadius: 3 }} />
        </View>
    );
}

// ── Tab: Pulse (was Overview) ─────────────────────────────────────────────────
function PulseTab() {
    const { transactions, goals, loans, finance, settings } = useApp();
    const { currency } = settings;
    const summary = useMemo(() => computeWeeklyCFOSummary(transactions, goals, loans, finance), [transactions, goals, loans, finance]);
    const risk    = useMemo(() => computeRiskScore(finance, loans, transactions), [finance, loans, transactions]);
    const ratios  = useMemo(() => computeFinancialRatios(finance, loans), [finance, loans]);

    const health  = healthLabel(risk.score);
    const profit  = finance.netProfit;
    const margin  = finance.income > 0 ? (profit / finance.income) * 100 : 0;

    // Plain-English daily briefing
    const briefing: string[] = useMemo(() => {
        const lines: string[] = [];
        if (summary.weeklyChange >= 10) lines.push(`Income is up ${summary.weeklyChange.toFixed(0)}% this week — great momentum.`);
        else if (summary.weeklyChange <= -10) lines.push(`Income dropped ${Math.abs(summary.weeklyChange).toFixed(0)}% this week — worth investigating.`);
        if (profit < 0) lines.push('You are currently running at a loss. Focus on cutting costs or increasing sales.');
        else if (margin > 20) lines.push(`Strong ${margin.toFixed(0)}% profit margin — you're keeping most of what you earn.`);
        else if (margin < 10 && margin >= 0) lines.push(`Profit margin is thin at ${margin.toFixed(0)}%. Review your biggest costs.`);
        if (summary.cashRunwayDays < 30 && summary.cashRunwayDays > 0) lines.push('Cash runway is under 30 days — prioritise collecting payments now.');
        if (ratios.currentRatio < 1) lines.push('Your short-term liabilities exceed assets — cash flow needs attention.');
        if (lines.length === 0) lines.push('Business looks stable. Keep monitoring your cash flow and margins.');
        return lines.slice(0, 3);
    }, [summary, profit, margin, ratios]);

    // Today's top focus
    const todayFocus: string = useMemo(() => {
        if (summary.cashRunwayDays < 30) return '💸 Chase any unpaid invoices today to protect your cash position.';
        if (profit < 0) return '✂️ Review your top 3 expenses and identify one to reduce this week.';
        if (summary.weeklyChange < -5) return '📞 Reach out to your top customers to understand any slowdown.';
        if (margin < 10 && finance.income > 0) return '💰 Your margins are low — consider a small price increase on key products.';
        return '📈 Things look healthy. Focus on winning your next customer.';
    }, [summary, profit, margin, finance]);

    return (
        <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
            {/* Business health card */}
            <View style={[s.card, { borderLeftWidth: 4, borderLeftColor: health.color }]}>
                <Text style={s.cardTitle}>Business Health</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                    <Text style={{ fontSize: 40 }}>{health.emoji}</Text>
                    <View style={{ marginLeft: 12 }}>
                        <Text style={[s.healthLabel, { color: health.color }]}>{health.label}</Text>
                        <Text style={s.healthScore}>{risk.score}/100 score</Text>
                    </View>
                </View>
                {briefing.map((line, i) => (
                    <Text key={i} style={s.briefingLine}>• {line}</Text>
                ))}
            </View>

            {/* Today's focus */}
            <View style={[s.card, { backgroundColor: Colors.primary + '15', borderColor: Colors.primary + '40', borderWidth: 1 }]}>
                <Text style={[s.cardTitle, { color: Colors.primary }]}>Today's Focus</Text>
                <Text style={s.focusText}>{todayFocus}</Text>
            </View>

            {/* Snapshot strip */}
            <View style={s.card}>
                <Text style={s.cardTitle}>This Week at a Glance</Text>
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
                        <Text style={s.metricLabel}>Spending</Text>
                        <Text style={[s.metricVal, { color: Colors.expense }]}>{currency}{summary.thisWeekExpense.toLocaleString()}</Text>
                        <Text style={s.metricSub}>Last: {currency}{summary.lastWeekExpense.toLocaleString()}</Text>
                    </View>
                    <View style={s.metricDivider} />
                    <View style={s.metricBox}>
                        <Text style={s.metricLabel}>Cash Runway</Text>
                        <Text style={[s.metricVal, { color: summary.cashRunwayDays < 30 ? Colors.expense : Colors.income, fontSize: 13 }]}>
                            {fmtRunway(summary.cashRunwayDays)}
                        </Text>
                        <Text style={s.metricSub}>of cash left</Text>
                    </View>
                </View>
            </View>

            {/* Score pillars */}
            <View style={s.card}>
                <Text style={s.cardTitle}>What's Driving Your Score</Text>
                {risk.factors.map(f => (
                    <View key={f.name} style={{ marginBottom: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3 }}>
                            <Text style={[s.pillarDot, { color: statusColor(f.status) }]}>●</Text>
                            <Text style={s.pillarName}>{f.name}</Text>
                            <Text style={[s.pillarScore, { color: statusColor(f.status) }]}>{f.score}/100</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <View style={{ width: 16 }} />
                            <MiniBar pct={f.score} color={statusColor(f.status)} />
                        </View>
                    </View>
                ))}
            </View>

            {/* Risks */}
            {summary.topRisks.length > 0 && (
                <View style={[s.card, { borderLeftWidth: 3, borderLeftColor: Colors.expense }]}>
                    <Text style={s.cardTitle}>Watch Out For</Text>
                    {summary.topRisks.map((r, i) => (
                        <Text key={i} style={s.riskItem}>⚠ {r}</Text>
                    ))}
                </View>
            )}

            {/* Actions */}
            {summary.topActions.length > 0 && (
                <View style={[s.card, { borderLeftWidth: 3, borderLeftColor: Colors.income }]}>
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

    const forecast  = useMemo(() => computeRevenueForecast(transactions, forecastMonths), [transactions, forecastMonths]);
    const cashFlow  = useMemo(() => computeCashFlowForecast(transactions, loans, invoices), [transactions, loans, invoices]);
    const maxVal    = Math.max(...forecast.map(f => f.bestCase), 1);

    return (
        <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
            {/* Revenue forecast */}
            <View style={s.card}>
                <Text style={s.cardTitle}>Revenue Forecast</Text>
                <Text style={s.cardSub}>Based on your historical trends — actual results may vary.</Text>
                <View style={s.toggleRow}>
                    {([3, 6, 12] as const).map(m => (
                        <TouchableOpacity
                            key={m}
                            style={[s.toggleBtn, forecastMonths === m && s.toggleActive]}
                            onPress={() => setForecastMonths(m)}
                        >
                            <Text style={[s.toggleText, forecastMonths === m && s.toggleTextActive]}>{m} months</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {forecast.map((f, i) => {
                    const barPct = (f.projected / maxVal) * 100;
                    return (
                        <View key={i} style={s.forecastRow}>
                            <Text style={s.forecastMonth}>{f.month}</Text>
                            <View style={{ flex: 1, marginHorizontal: 10 }}>
                                <View style={{ height: 8, backgroundColor: Colors.border, borderRadius: 4 }}>
                                    <View style={{ height: 8, width: `${barPct}%` as any, backgroundColor: Colors.primary + '80', borderRadius: 4 }} />
                                </View>
                                <Text style={s.forecastRange}>
                                    Best {currency}{Math.round(f.bestCase / 1000)}k · Worst {currency}{Math.round(f.worstCase / 1000)}k
                                </Text>
                            </View>
                            <Text style={[s.forecastVal]}>{currency}{Math.round(f.projected).toLocaleString()}</Text>
                        </View>
                    );
                })}
            </View>

            {/* 90-day cash flow */}
            <View style={s.card}>
                <Text style={s.cardTitle}>90-Day Cash Flow Outlook</Text>
                <Text style={s.cardSub}>Weekly projection of money in vs out. Red weeks need attention.</Text>
                <View style={s.tableHeader}>
                    <Text style={[s.th, { flex: 2, textAlign: 'left' }]}>Week</Text>
                    <Text style={s.th}>In</Text>
                    <Text style={s.th}>Out</Text>
                    <Text style={s.th}>Net</Text>
                </View>
                {cashFlow.map((w, i) => (
                    <View key={i} style={[s.tableRow, w.alert && s.alertRow]}>
                        <Text style={[s.td, { flex: 2, textAlign: 'left' }]}>{w.week}</Text>
                        <Text style={[s.td, { color: Colors.income }]}>{w.projectedInflow > 0 ? `${currency}${Math.round(w.projectedInflow / 1000)}k` : '-'}</Text>
                        <Text style={[s.td, { color: Colors.expense }]}>{currency}{Math.round(w.projectedOutflow / 1000)}k</Text>
                        <Text style={[s.td, { color: w.netCash >= 0 ? Colors.income : Colors.expense, fontWeight: '700' }]}>
                            {w.netCash >= 0 ? '+' : ''}{currency}{Math.round(Math.abs(w.netCash) / 1000)}k
                        </Text>
                    </View>
                ))}
            </View>
        </ScrollView>
    );
}

// ── Tab: Finance (was Ratios) ─────────────────────────────────────────────────
function FinanceTab() {
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

    const ratioCards: { label: string; value: string; good: boolean; explain: string }[] = [
        {
            label: 'Current Ratio',
            value: ratios.currentRatio.toFixed(2) + 'x',
            good: ratios.currentRatio >= 1.5,
            explain: ratios.currentRatio >= 1.5 ? 'Assets cover short-term debts' : 'Short-term debts may be hard to cover',
        },
        {
            label: 'Debt to Equity',
            value: ratios.debtToEquity.toFixed(2) + 'x',
            good: ratios.debtToEquity <= 0.8,
            explain: ratios.debtToEquity <= 0.8 ? 'Low reliance on debt' : 'High debt relative to equity',
        },
        {
            label: 'Return on Assets',
            value: ratios.returnOnAssets.toFixed(1) + '%',
            good: ratios.returnOnAssets >= 10,
            explain: ratios.returnOnAssets >= 10 ? 'Good asset productivity' : 'Assets could be working harder',
        },
        {
            label: 'Monthly Burn',
            value: `${currency}${Math.round(ratios.burnRate).toLocaleString()}`,
            good: true,
            explain: 'Average monthly spending',
        },
        {
            label: 'Profit Margin',
            value: ratios.profitMargin.toFixed(1) + '%',
            good: ratios.profitMargin >= 15,
            explain: ratios.profitMargin >= 15 ? 'Healthy margin' : 'Margin below 15% — review costs',
        },
    ];

    return (
        <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
            <Text style={s.sectionHdr}>Key Financial Ratios</Text>
            {ratioCards.map((r, i) => (
                <View key={i} style={[s.ratioRow, { borderLeftColor: r.good ? Colors.income : Colors.expense }]}>
                    <View style={{ flex: 1 }}>
                        <Text style={s.ratioLabel}>{r.label}</Text>
                        <Text style={s.ratioExplain}>{r.explain}</Text>
                    </View>
                    <Text style={[s.ratioVal, { color: r.good ? Colors.income : Colors.expense }]}>{r.value}</Text>
                </View>
            ))}

            {/* DSCR */}
            <Text style={[s.sectionHdr, { marginTop: 8 }]}>Loan Coverage</Text>
            <View style={[s.card, { borderLeftWidth: 3, borderLeftColor: statusColor(dscr.status) }]}>
                <Text style={s.cardTitle}>Can You Afford Your Loans?</Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                    <Text style={[s.bigNum, { color: statusColor(dscr.status) }]}>{dscr.dscr > 100 ? '∞' : dscr.dscr.toFixed(2)}x</Text>
                    <Text style={[s.statusBadge, {
                        backgroundColor: statusColor(dscr.status) + '20',
                        color: statusColor(dscr.status),
                    }]}>
                        {dscr.status === 'healthy' ? 'HEALTHY' : dscr.status === 'warning' ? 'BORDERLINE' : 'AT RISK'}
                    </Text>
                </View>
                <Text style={s.cardSub}>
                    {dscr.status === 'healthy'
                        ? '✓ Your income comfortably covers loan repayments.'
                        : dscr.status === 'warning'
                        ? '⚠ Your income barely covers loan repayments. Reduce debt or increase revenue.'
                        : '✗ Income may not cover loan repayments. Act now.'}
                </Text>
                <Text style={s.dscrHint}>
                    Above 1.0x = you cover repayments. Above 2.0x = excellent buffer.
                </Text>
                <View style={s.dscrRow}>
                    <Text style={s.dscrLabel}>Net Operating Income</Text>
                    <Text style={[s.dscrVal, { color: Colors.income }]}>{currency}{Math.round(dscr.netOperatingIncome).toLocaleString()}</Text>
                </View>
                <View style={s.dscrRow}>
                    <Text style={s.dscrLabel}>Annual Debt Payments</Text>
                    <Text style={[s.dscrVal, { color: Colors.expense }]}>{currency}{Math.round(dscr.totalDebtService).toLocaleString()}</Text>
                </View>
            </View>

            {/* Break-even calculator */}
            <Text style={[s.sectionHdr, { marginTop: 8 }]}>Break-Even Calculator</Text>
            <View style={s.card}>
                <Text style={s.cardSub}>Enter your cost and pricing to find out how many units you need to sell to cover costs.</Text>
                <TextInput style={s.input} placeholder={`Monthly Fixed Costs (${currency})`} placeholderTextColor={Colors.textMuted} keyboardType="decimal-pad" value={fixedCosts} onChangeText={setFixedCosts} />
                <TextInput style={s.input} placeholder={`Variable Cost per Unit (${currency})`} placeholderTextColor={Colors.textMuted} keyboardType="decimal-pad" value={varRate} onChangeText={setVarRate} />
                <TextInput style={s.input} placeholder={`Selling Price per Unit (${currency})`} placeholderTextColor={Colors.textMuted} keyboardType="decimal-pad" value={pricePerUnit} onChangeText={setPricePerUnit} />
                {breakEven && (
                    <View style={{ marginTop: 8 }}>
                        <View style={s.dscrRow}>
                            <Text style={s.dscrLabel}>Units Needed to Break Even</Text>
                            <Text style={[s.dscrVal, { color: Colors.primary }]}>{isFinite(breakEven.breakEvenUnits) ? Math.ceil(breakEven.breakEvenUnits).toLocaleString() : '∞'}</Text>
                        </View>
                        <View style={s.dscrRow}>
                            <Text style={s.dscrLabel}>Revenue Needed</Text>
                            <Text style={s.dscrVal}>{isFinite(breakEven.breakEvenRevenue) ? `${currency}${Math.ceil(breakEven.breakEvenRevenue).toLocaleString()}` : '∞'}</Text>
                        </View>
                        <View style={s.dscrRow}>
                            <Text style={s.dscrLabel}>Safety Buffer</Text>
                            <Text style={[s.dscrVal, { color: breakEven.marginOfSafety > 20 ? Colors.income : Colors.warning }]}>{breakEven.marginOfSafety.toFixed(1)}%</Text>
                        </View>
                        <Text style={s.dscrHint}>Safety buffer = how far sales can fall before you lose money. Higher is safer.</Text>
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

    const MONTHS_GRID = [seasonal.slice(0, 6), seasonal.slice(6, 12)];

    return (
        <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
            {/* Risk score */}
            <View style={s.card}>
                <Text style={s.cardTitle}>Business Risk Profile</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                    <View style={[s.riskGauge, { borderColor: healthLabel(risk.score).color }]}>
                        <Text style={[s.riskGradeText, { color: healthLabel(risk.score).color }]}>{risk.grade}</Text>
                        <Text style={s.riskScoreText}>{risk.score}/100</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 16 }}>
                        <Text style={[{ fontSize: 16, fontWeight: '700', color: healthLabel(risk.score).color, marginBottom: 4 }]}>
                            {healthLabel(risk.score).label}
                        </Text>
                        <Text style={s.cardSub}>Lower score = more risk. Above 70 is solid.</Text>
                    </View>
                </View>
                {risk.factors.map(f => (
                    <View key={f.name} style={{ marginBottom: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3 }}>
                            <Text style={[s.pillarDot, { color: statusColor(f.status) }]}>●</Text>
                            <Text style={s.pillarName}>{f.name}</Text>
                            <Text style={[s.pillarScore, { color: statusColor(f.status) }]}>{f.score}/100</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <View style={{ width: 16 }} />
                            <MiniBar pct={f.score} color={statusColor(f.status)} />
                        </View>
                    </View>
                ))}
            </View>

            {/* Customer concentration */}
            <View style={s.card}>
                <Text style={s.cardTitle}>Customer Dependency Risk</Text>
                <Text style={s.cardSub}>If one customer accounts for 40%+ of revenue, your business is exposed if they leave.</Text>
                {concentration.length === 0 ? (
                    <Text style={s.empty}>Add income transactions with customer names to see this.</Text>
                ) : (
                    concentration.slice(0, 8).map((c, i) => (
                        <View key={i} style={s.concRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={s.concName}>{c.customer}</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                                    <MiniBar pct={c.percentage} color={c.risk === 'high' ? Colors.expense : c.risk === 'medium' ? Colors.warning : Colors.income} />
                                    <Text style={[s.concPct, { marginLeft: 6 }]}>{c.percentage.toFixed(1)}%</Text>
                                </View>
                            </View>
                            <View style={[s.riskBadge, { backgroundColor: c.risk === 'high' ? Colors.expense + '20' : c.risk === 'medium' ? Colors.warning + '20' : Colors.income + '20' }]}>
                                <Text style={[s.riskBadgeText, { color: c.risk === 'high' ? Colors.expense : c.risk === 'medium' ? Colors.warning : Colors.income }]}>
                                    {c.risk === 'high' ? '⚠ HIGH' : c.risk === 'medium' ? '! MED' : '✓ LOW'}
                                </Text>
                            </View>
                        </View>
                    ))
                )}
            </View>

            {/* Seasonal calendar */}
            <View style={s.card}>
                <Text style={s.cardTitle}>Seasonal Patterns</Text>
                <Text style={s.cardSub}>Months where your revenue is historically low or high.</Text>
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

// ── Tab: Growth (was Debt) ────────────────────────────────────────────────────
function GrowthTab() {
    const { loans, transactions, invoices, finance, settings } = useApp();
    const { currency } = settings;
    const debtOpt    = useMemo(() => computeDebtOptimiser(loans), [loans]);
    const payActions = useMemo(() => computePaymentOptimiser(transactions, invoices, finance.cashBalance), [transactions, invoices, finance.cashBalance]);
    const ratios     = useMemo(() => computeFinancialRatios(finance, loans), [finance, loans]);

    // Pricing opportunity
    const avgTransaction = useMemo(() => {
        const inc = transactions.filter(t => t.type === 'income');
        return inc.length > 0 ? inc.reduce((s, t) => s + t.amount, 0) / inc.length : 0;
    }, [transactions]);

    // Revenue gap — what 10% price increase would mean
    const revenueGap10 = finance.income * 0.10;
    const revenueGap20 = finance.income * 0.20;

    // Top expense categories
    const topExpenses = useMemo(() => {
        const map = new Map<string, number>();
        transactions.filter(t => t.type === 'expense').forEach(t => {
            map.set(t.category || 'Uncategorised', (map.get(t.category || 'Uncategorised') ?? 0) + t.amount);
        });
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    }, [transactions]);

    const totalExpense = topExpenses.reduce((s, e) => s + e[1], 0) || 1;

    return (
        <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
            {/* Pricing opportunity */}
            <View style={s.card}>
                <Text style={s.cardTitle}>Pricing Opportunity</Text>
                <Text style={s.cardSub}>Small price increases have an outsized impact on profit.</Text>
                <View style={s.opportunityRow}>
                    <Text style={s.oppLabel}>Your average sale value</Text>
                    <Text style={[s.oppVal, { color: Colors.primary }]}>{currency}{Math.round(avgTransaction).toLocaleString()}</Text>
                </View>
                <View style={s.opportunityRow}>
                    <Text style={s.oppLabel}>Extra revenue with 10% price rise</Text>
                    <Text style={[s.oppVal, { color: Colors.income }]}>+{currency}{Math.round(revenueGap10).toLocaleString()}</Text>
                </View>
                <View style={s.opportunityRow}>
                    <Text style={s.oppLabel}>Extra revenue with 20% price rise</Text>
                    <Text style={[s.oppVal, { color: Colors.income }]}>+{currency}{Math.round(revenueGap20).toLocaleString()}</Text>
                </View>
                <View style={{ backgroundColor: Colors.primary + '10', borderRadius: 8, padding: 10, marginTop: 8 }}>
                    <Text style={{ fontSize: 12, color: Colors.textSecondary, lineHeight: 18 }}>
                        💡 Most small businesses under-price by 10–20%. If customers rarely push back on price, that's a sign you can charge more.
                    </Text>
                </View>
            </View>

            {/* Cost reduction */}
            <View style={s.card}>
                <Text style={s.cardTitle}>Where Your Money Goes</Text>
                <Text style={s.cardSub}>Focus cost reduction on your biggest categories first.</Text>
                {topExpenses.length === 0 ? (
                    <Text style={s.empty}>No expense data yet.</Text>
                ) : topExpenses.map(([cat, amt], i) => (
                    <View key={i} style={{ marginBottom: 10 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                            <Text style={s.pillarName}>{cat}</Text>
                            <Text style={[s.pillarScore, { color: Colors.expense }]}>{currency}{Math.round(amt).toLocaleString()}</Text>
                        </View>
                        <MiniBar pct={(amt / totalExpense) * 100} color={Colors.expense} />
                    </View>
                ))}
                <View style={{ backgroundColor: Colors.expense + '10', borderRadius: 8, padding: 10, marginTop: 4 }}>
                    <Text style={{ fontSize: 12, color: Colors.textSecondary, lineHeight: 18 }}>
                        💡 Cutting your top expense by just 10% is often easier than winning a new customer — and the profit impact is immediate.
                    </Text>
                </View>
            </View>

            {/* Debt repayment */}
            {loans.filter(l => l.status === 'active').length > 0 && (
                <View style={s.card}>
                    <Text style={s.cardTitle}>Loan Repayment Strategy</Text>
                    <Text style={s.cardSub}>Two proven methods — pick the one that suits you.</Text>
                    <View style={s.debtMethodRow}>
                        <View style={[s.debtMethod, { borderColor: Colors.primary }]}>
                            <Text style={[s.debtMethodLabel, { color: Colors.primary }]}>AVALANCHE</Text>
                            <Text style={s.debtMethodSub}>Pay highest interest first — saves most money long-term</Text>
                            {debtOpt.avalanche.order.map((name, i) => (
                                <Text key={i} style={s.debtLoan}>{i + 1}. {name}</Text>
                            ))}
                            <Text style={[s.debtSaved, { color: Colors.income }]}>Saves ~{currency}{Math.abs(debtOpt.avalanche.totalInterestSaved).toLocaleString()}</Text>
                            <Text style={s.debtMonths}>{debtOpt.avalanche.monthsToPayoff} months</Text>
                        </View>
                        <View style={[s.debtMethod, { borderColor: Colors.border }]}>
                            <Text style={[s.debtMethodLabel, { color: Colors.textMuted }]}>SNOWBALL</Text>
                            <Text style={s.debtMethodSub}>Pay smallest balance first — easier motivation</Text>
                            {debtOpt.snowball.order.map((name, i) => (
                                <Text key={i} style={s.debtLoan}>{i + 1}. {name}</Text>
                            ))}
                            <Text style={s.debtMonths}>{debtOpt.snowball.monthsToPayoff} months</Text>
                        </View>
                    </View>
                    <View style={s.recommendBox}>
                        <Text style={s.recommendText}>💡 {debtOpt.recommendation}</Text>
                    </View>
                </View>
            )}

            {/* Payment timing */}
            {payActions.length > 0 && (
                <View style={s.card}>
                    <Text style={s.cardTitle}>Payments & Collections Due</Text>
                    {payActions.map((a, i) => (
                        <View key={i} style={[s.payRow, { borderLeftColor: a.urgency === 'urgent' ? Colors.expense : a.urgency === 'soon' ? Colors.warning : Colors.income }]}>
                            <View style={s.payTop}>
                                <Text style={[s.payAction, { color: a.action === 'collect' ? Colors.income : Colors.expense }]}>
                                    {a.action === 'collect' ? '↓ COLLECT' : '↑ PAY'}
                                </Text>
                                <View style={[s.urgencyBadge, { backgroundColor: a.urgency === 'urgent' ? Colors.expense + '20' : a.urgency === 'soon' ? Colors.warning + '20' : Colors.income + '20' }]}>
                                    <Text style={[s.urgencyText, { color: a.urgency === 'urgent' ? Colors.expense : a.urgency === 'soon' ? Colors.warning : Colors.income }]}>
                                        {a.urgency.toUpperCase()}
                                    </Text>
                                </View>
                            </View>
                            <Text style={s.payDesc}>{a.description}</Text>
                            <Text style={s.payAmount}>{settings.currency}{a.amount.toLocaleString()} · Due {a.dueDate}</Text>
                            <Text style={s.payImpact}>{a.impact}</Text>
                        </View>
                    ))}
                </View>
            )}
        </ScrollView>
    );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function CFOScreen() {
    const { navigate, transactions, setCurrentScreen } = useApp();
    const [activeTab, setActiveTab] = useState<Tab>('pulse');

    const TABS: { key: Tab; label: string; icon: string }[] = [
        { key: 'pulse',    label: 'Pulse',    icon: '❤️' },
        { key: 'forecast', label: 'Forecast', icon: '📅' },
        { key: 'finance',  label: 'Finance',  icon: '📊' },
        { key: 'risk',     label: 'Risk',     icon: '🛡️' },
        { key: 'growth',   label: 'Growth',   icon: '🚀' },
    ];

    const hasEnoughData = transactions.length >= 3;

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <View style={s.headerRow}>
                <TouchableOpacity onPress={() => navigate('dashboard')}>
                    <Text style={s.backBtn}>← Dashboard</Text>
                </TouchableOpacity>
                <View>
                    <Text style={s.screenTitle}>Business Advisor</Text>
                    <Text style={s.screenSub}>Your AI-powered business coach</Text>
                </View>
            </View>

            {!hasEnoughData && (
                <View style={s.emptyState}>
                    <Text style={s.emptyIcon}>🧠</Text>
                    <Text style={s.emptyTitle}>Your Advisor is ready when you are</Text>
                    <Text style={s.emptyBody}>
                        Add at least 3 transactions to unlock forecasting, risk scoring, financial analysis, and personalised business advice.
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

            {hasEnoughData && (
                <>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBar} contentContainerStyle={s.tabBarContent}>
                        {TABS.map(tab => (
                            <TouchableOpacity
                                key={tab.key}
                                style={[s.tab, activeTab === tab.key && s.tabActive]}
                                onPress={() => setActiveTab(tab.key)}
                            >
                                <Text style={[s.tabIcon]}>{tab.icon}</Text>
                                <Text style={[s.tabText, activeTab === tab.key && s.tabTextActive]}>{tab.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    {activeTab === 'pulse'    && <PulseTab />}
                    {activeTab === 'forecast' && <ForecastTab />}
                    {activeTab === 'finance'  && <FinanceTab />}
                    {activeTab === 'risk'     && <RiskTab />}
                    {activeTab === 'growth'   && <GrowthTab />}
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

    headerRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
    backBtn:     { color: Colors.primary, fontSize: 14 },
    screenTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary },
    screenSub:   { fontSize: 11, color: Colors.textMuted, marginTop: 1 },

    emptyState:           { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    emptyIcon:            { fontSize: 56, marginBottom: 16 },
    emptyTitle:           { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary, textAlign: 'center', marginBottom: 12 },
    emptyBody:            { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
    emptyProgress:        { fontSize: 13, color: Colors.textSecondary, marginBottom: 8 },
    emptyProgressBarBg:   { width: '100%', height: 6, backgroundColor: Colors.border, borderRadius: 3, marginBottom: 24 },
    emptyProgressBarFill: { height: 6, backgroundColor: Colors.primary, borderRadius: 3 },
    emptyBtn:             { backgroundColor: Colors.primary, paddingVertical: 13, paddingHorizontal: 32, borderRadius: 10 },
    emptyBtnText:         { color: '#fff', fontWeight: 'bold', fontSize: 15 },

    tabBar:        { maxHeight: 52, backgroundColor: Colors.surface },
    tabBarContent: { paddingHorizontal: 8, gap: 2, alignItems: 'center' },
    tab:           { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
    tabActive:     { backgroundColor: Colors.primary },
    tabIcon:       { fontSize: 14, marginBottom: 1 },
    tabText:       { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
    tabTextActive: { color: '#fff' },

    sectionHdr:   { fontSize: 12, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.8, marginBottom: 8, marginTop: 4, textTransform: 'uppercase' },
    card:         { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 12 },
    cardTitle:    { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 },
    cardSub:      { fontSize: 12, color: Colors.textMuted, marginBottom: 10, lineHeight: 18 },
    bigNum:       { fontSize: 32, fontWeight: 'bold', color: Colors.textPrimary },
    empty:        { fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingVertical: 12 },
    statusBadge:  { fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },

    healthLabel:  { fontSize: 22, fontWeight: 'bold' },
    healthScore:  { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
    briefingLine: { fontSize: 13, color: Colors.textSecondary, marginBottom: 6, lineHeight: 18 },
    focusText:    { fontSize: 14, color: Colors.primary, fontWeight: '600', lineHeight: 20 },

    metricsRow:    { flexDirection: 'row', alignItems: 'center' },
    metricBox:     { flex: 1, alignItems: 'center' },
    metricLabel:   { fontSize: 10, color: Colors.textMuted, marginBottom: 4 },
    metricVal:     { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
    metricSub:     { fontSize: 10, color: Colors.textMuted, marginTop: 2, textAlign: 'center' },
    metricDivider: { width: 1, backgroundColor: Colors.border, alignSelf: 'stretch', marginHorizontal: 6 },

    pillarDot:    { fontSize: 10, marginRight: 6 },
    pillarName:   { flex: 1, fontSize: 12, color: Colors.textSecondary },
    pillarScore:  { fontSize: 12, fontWeight: '700' },

    riskGauge:     { alignItems: 'center', justifyContent: 'center', width: 80, height: 80, borderRadius: 40, borderWidth: 3 },
    riskGradeText: { fontSize: 28, fontWeight: 'bold' },
    riskScoreText: { fontSize: 11, color: Colors.textMuted },
    riskItem:      { fontSize: 13, color: Colors.expense, marginBottom: 6 },
    actionItem:    { fontSize: 13, color: Colors.income, marginBottom: 6 },

    toggleRow:        { flexDirection: 'row', gap: 8, marginBottom: 12 },
    toggleBtn:        { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.border },
    toggleActive:     { backgroundColor: Colors.primary },
    toggleText:       { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
    toggleTextActive: { color: '#fff' },

    forecastRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.border },
    forecastMonth: { fontSize: 12, color: Colors.textSecondary, width: 56 },
    forecastVal:   { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    forecastRange: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },

    tableHeader:   { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
    th:            { flex: 1, fontSize: 10, color: Colors.textMuted, fontWeight: '700', textAlign: 'right' },
    tableRow:      { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: Colors.border + '80' },
    alertRow:      { backgroundColor: Colors.expense + '10' },
    td:            { flex: 1, fontSize: 11, color: Colors.textSecondary, textAlign: 'right' },

    ratioRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 10, padding: 14, marginBottom: 8, borderLeftWidth: 3 },
    ratioLabel:   { fontSize: 13, color: Colors.textPrimary, fontWeight: '600' },
    ratioExplain: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
    ratioVal:     { fontSize: 18, fontWeight: 'bold' },

    dscrRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, borderTopWidth: 1, borderTopColor: Colors.border },
    dscrLabel:    { fontSize: 13, color: Colors.textSecondary },
    dscrVal:      { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
    dscrHint:     { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic', marginTop: 4, marginBottom: 6, lineHeight: 16 },

    input:        { backgroundColor: Colors.bg, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, padding: 12, color: Colors.textPrimary, marginBottom: 10, fontSize: 14 },

    concRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.border },
    concName:     { fontSize: 13, color: Colors.textPrimary, fontWeight: '600' },
    concPct:      { fontSize: 11, color: Colors.textMuted },
    riskBadge:    { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginLeft: 8 },
    riskBadgeText:{ fontSize: 10, fontWeight: '700' },

    seasonRow:    { flexDirection: 'row', gap: 4, marginBottom: 6 },
    seasonCell:   { flex: 1, alignItems: 'center', borderRadius: 6, padding: 5, borderWidth: 1, backgroundColor: Colors.bg },
    seasonMonth:  { fontSize: 8, color: Colors.textMuted },
    seasonRisk:   { fontSize: 13, fontWeight: 'bold' },
    seasonWarning:{ fontSize: 11, marginTop: 4, marginBottom: 2 },

    opportunityRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.border },
    oppLabel:       { fontSize: 13, color: Colors.textSecondary, flex: 1 },
    oppVal:         { fontSize: 15, fontWeight: '700' },

    debtMethodRow:   { flexDirection: 'row', gap: 10, marginBottom: 12 },
    debtMethod:      { flex: 1, borderWidth: 2, borderRadius: 12, padding: 12 },
    debtMethodLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
    debtMethodSub:   { fontSize: 10, color: Colors.textMuted, marginBottom: 8, lineHeight: 14 },
    debtLoan:        { fontSize: 12, color: Colors.textSecondary, marginBottom: 2 },
    debtSaved:       { fontSize: 13, fontWeight: '700', marginTop: 8 },
    debtMonths:      { fontSize: 11, color: Colors.textMuted },
    recommendBox:    { backgroundColor: Colors.primary + '15', borderRadius: 8, padding: 12 },
    recommendText:   { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },

    payRow:       { borderLeftWidth: 3, paddingLeft: 12, marginBottom: 12, paddingVertical: 4 },
    payTop:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    payAction:    { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
    payDesc:      { fontSize: 14, color: Colors.textPrimary, fontWeight: '600', marginBottom: 2 },
    payAmount:    { fontSize: 12, color: Colors.textSecondary, marginBottom: 2 },
    payImpact:    { fontSize: 11, color: Colors.textMuted },
    urgencyBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    urgencyText:  { fontSize: 9, fontWeight: '700' },
});
