import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ScrollView, View, Text,
    TouchableOpacity, StyleSheet, Animated, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import RadialGauge from '../components/RadialGauge';
import { computeCashFlowForecast, computeDSCR } from '../utils/finance';
import { computeCashRunway } from '../utils/cashRunway';
import { computeCashRunwayIntelligence } from '../utils/metricIntelligence';
import { computeBurnRateAnalysis } from '../utils/burnRateAnalysis';
import { computeBreakeven } from '../utils/profitability';
import BreakevenAnalysis from '../components/BreakevenAnalysis';
import NextStepLink from '../components/NextStepLink';
import { suggestSolution } from '../utils/impactChain';
import Icon, { IconName } from '../components/ui/Icon';
import { Radius, Shadow, Spacing } from '../theme/tokens';

type Tab = 'forecast' | 'runway' | 'ar' | 'breakeven';

const TAB_ICON: Record<Tab, IconName> = { forecast: 'calendar', runway: 'clock', ar: 'mail', breakeven: 'crosshair' };
const TAB_LABEL: Record<Tab, string> = { forecast: 'Forecast', runway: 'Runway', ar: 'AR Risk', breakeven: 'Break-Even' };

// One animated inflow/outflow bar in the weekly forecast chart -- owns its
// own Animated.Value so each row grows in from 0 independently, the same
// pattern GoalsScreen's progress bars use.
function WeekBar({ pct, color }: { pct: number; color: string }) {
    const anim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.timing(anim, {
            toValue: Math.min(Math.max(pct, 0), 1) * 100,
            duration: 600,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
    }, [pct]);
    return (
        <View style={styles.barTrack}>
            <Animated.View style={[styles.barFill, {
                backgroundColor: color,
                width: anim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
            }]} />
        </View>
    );
}

export default function CashFlowScreen() {
    const { transactions, loans, invoices, budgets, finance, settings, setCurrentScreen, navigate, navParams } = useApp();
    const [tab, setTab] = useState<Tab>(
        (['forecast', 'runway', 'ar', 'breakeven'] as Tab[]).includes(navParams?.tab as Tab) ? (navParams!.tab as Tab) : 'forecast'
    );
    // Chart is the original view (proportional inflow/outflow bars, good for
    // scanning shape at a glance); Table is the classic CFO "13-Week Cash
    // Forecast" ledger format (opening/inflow/outflow/closing/runway per
    // week) -- added alongside, not in place of, the chart.
    const [weeklyView, setWeeklyView] = useState<'chart' | 'table'>('chart');
    const sym = settings.currency || '₦';

    const fmt = (n: number) => {
        const abs = Math.abs(n);
        const s = abs >= 1_000_000
            ? (abs / 1_000_000).toFixed(1) + 'M'
            : abs >= 1_000 ? (abs / 1_000).toFixed(0) + 'K'
            : abs.toFixed(0);
        return (n < 0 ? '-' : '') + sym + s;
    };

    // 90-day weekly cash flow forecast
    const weeks = useMemo(() => computeCashFlowForecast(transactions, loans, invoices, budgets, finance.cashBalance), [transactions, loans, invoices, budgets, finance.cashBalance]);
    const usesBudget = weeks.some(w => w.usedBudget);

    // Cash runway
    const { runwayDays, dailyBurn, cashBalance } = useMemo(
        () => computeCashRunway(transactions, finance.cashBalance),
        [transactions, finance.cashBalance]
    );

    const runwayColor = runwayDays < 30 ? Colors.expense : runwayDays < 90 ? Colors.warning : Colors.income;

    const runwayAnim = useRef(new Animated.Value(0)).current;
    const [animatedRunwayDays, setAnimatedRunwayDays] = useState(0);
    useEffect(() => {
        if (!Number.isFinite(runwayDays)) { setAnimatedRunwayDays(0); return; }
        const id = runwayAnim.addListener(({ value }) => setAnimatedRunwayDays(value));
        Animated.timing(runwayAnim, { toValue: runwayDays, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
        return () => runwayAnim.removeListener(id);
    }, [runwayDays]);

    // Metric Intelligence pilot -- same Definition/Owner-confidence/Trigger
    // treatment as the Dashboard's Business Health Score. See
    // metricIntelligence.ts for exactly what's reused vs new.
    const runwayIntelligence = useMemo(
        () => computeCashRunwayIntelligence({ runwayDays, dailyBurn, cashBalance }, transactions),
        [runwayDays, dailyBurn, cashBalance, transactions],
    );
    const [runwayWhyOpen, setRunwayWhyOpen] = useState(false);

    // Startup Burn Rate -- the complementary "at the actual rate you're
    // going, revenue included" view alongside the worst-case gross-burn
    // runway above (see burnRateAnalysis.ts's own doc comment for why this
    // is additive, not a replacement).
    const burnRate = useMemo(
        () => computeBurnRateAnalysis(transactions, finance.cashBalance, sym),
        [transactions, finance.cashBalance, sym]
    );
    const burnRateColor = burnRate.status === 'danger' ? Colors.expense : burnRate.status === 'warning' ? Colors.warning : Colors.income;

    // Automated from real recorded transactions -- fixed/variable costs are
    // derived from this period's actual categorized expenses, not entered
    // by hand. Moved here from Growth Intelligence: breaking even is a cash
    // flow question (how much sales revenue actually needs to come in to
    // cover the bills), not a growth-trend one.
    const breakeven = useMemo(() => computeBreakeven(transactions, settings), [transactions, settings]);

    // Debt service is a cash outflow like any other -- "can we afford our
    // loans" belongs in the same place as runway and breakeven. Delegates
    // to the one canonical computeDSCR (also used by Loans, Credit-
    // Worthiness, and Financing Marketplace) rather than recomputing it;
    // this is a teaser linking to the Loans screen's full "Can You Afford
    // Your Loans?" card and Interest Rate Shock, not a second copy of them.
    const dscr = useMemo(() => computeDSCR(transactions, loans), [transactions, loans]);
    const dscrColor = dscr.status === 'healthy' ? Colors.income : dscr.status === 'warning' ? Colors.warning : Colors.expense;

    // AR risk scoring — O(n) with pre-computed client history Map
    const arRisk = useMemo(() => {
        // Single pass: build overdue count per client
        const overdueByClient = new Map<string, number>();
        for (const i of invoices) {
            if (i.status === 'overdue') {
                const client = i.clientName || 'Unknown';
                overdueByClient.set(client, (overdueByClient.get(client) ?? 0) + 1);
            }
        }
        const now = Date.now();
        const unpaid = invoices.filter(i => i.status === 'sent' || i.status === 'overdue');
        return unpaid.map(inv => {
            const overdueHistory = overdueByClient.get(inv.clientName || 'Unknown') ?? 0;
            const daysUntilDue = inv.dueDate
                ? Math.ceil((new Date(inv.dueDate).getTime() - now) / 86400000)
                : null;
            const isOverdue = daysUntilDue !== null && daysUntilDue < 0;
            const risk: 'high' | 'medium' | 'low' = isOverdue || overdueHistory > 0 ? 'high'
                : daysUntilDue !== null && daysUntilDue <= 7 ? 'medium' : 'low';
            return { inv, daysUntilDue, risk };
        }).sort((a, b) => {
            const order = { high: 0, medium: 1, low: 2 };
            return order[a.risk] - order[b.risk];
        });
    }, [invoices]);

    const totalAR = arRisk.reduce((s, r) => s + (r.inv.total ?? 0), 0);
    const atRiskAR = arRisk.filter(r => r.risk === 'high').reduce((s, r) => s + (r.inv.total ?? 0), 0);

    // Summary metrics
    const totalInflow  = weeks.reduce((s, w) => s + w.projectedInflow, 0);
    const totalOutflow = weeks.reduce((s, w) => s + w.projectedOutflow, 0);
    const alertWeeks   = weeks.filter(w => w.alert).length;
    const worstCumulative = weeks.length > 0 ? Math.min(...weeks.map(w => w.cumulativeCash)) : 0;
    const maxOut = Math.max(...weeks.map(w => Math.max(w.projectedInflow, w.projectedOutflow)), 1);

    // Cash reserve gap — how much more cash a 3-month (90-day) runway would
    // take at today's burn rate, reusing the same dailyBurn/runwayDays the
    // Runway card above already shows (never a separately-estimated figure).
    const reserveGap = dailyBurn > 0 && runwayDays < 90 ? dailyBurn * (90 - runwayDays) : 0;

    return (
        <SafeAreaView style={styles.safe}>
            <Header />

            {/* Tabs */}
            <View style={styles.tabRow}>
                {(['forecast', 'runway', 'ar', 'breakeven'] as Tab[]).map(t => (
                    <TouchableOpacity
                        key={t}
                        style={[styles.tab, tab === t && styles.tabActive]}
                        onPress={() => setTab(t)}
                    >
                        <View style={styles.tabLabelRow}>
                            <Icon name={TAB_ICON[t]} size={13} color={tab === t ? Colors.primary : Colors.muted} />
                            <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>
                                {TAB_LABEL[t]}
                            </Text>
                        </View>
                    </TouchableOpacity>
                ))}
            </View>

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

                {/* ── FORECAST TAB ── */}
                {tab === 'forecast' && (
                    <>
                        {/* Summary cards */}
                        <View style={styles.row3}>
                            <View style={styles.miniCard}>
                                <Text style={styles.miniLabel}>90-Day Inflow</Text>
                                <Text style={[styles.miniVal, { color: Colors.income }]}>{fmt(totalInflow)}</Text>
                            </View>
                            <View style={styles.miniCard}>
                                <Text style={styles.miniLabel}>90-Day Outflow</Text>
                                <Text style={[styles.miniVal, { color: Colors.expense }]}>{fmt(totalOutflow)}</Text>
                            </View>
                            <View style={styles.miniCard}>
                                <Text style={styles.miniLabel}>Alert Weeks</Text>
                                <Text style={[styles.miniVal, { color: alertWeeks > 0 ? Colors.expense : Colors.income }]}>
                                    {alertWeeks}
                                </Text>
                            </View>
                        </View>

                        {alertWeeks > 0 && (
                            <View style={styles.alertBanner}>
                                <Icon name="alert-triangle" size={16} color={Colors.expense} />
                                <Text style={styles.alertText}>
                                    {alertWeeks} week{alertWeeks > 1 ? 's' : ''} with negative projected cash flow in the next 90 days
                                    {worstCumulative < 0 && ` — at the worst point your projected cumulative cash goes ${fmt(Math.abs(worstCumulative))} negative`}. Review your outflows or accelerate collections.
                                </Text>
                            </View>
                        )}

                        {alertWeeks > 0 && (() => {
                            const solution = suggestSolution('budget');
                            return (
                                <View style={styles.solutionBanner}>
                                    <View style={styles.solutionTitleRow}>
                                        <Icon name="zap" size={14} color={Colors.primary} />
                                        <Text style={styles.solutionTitle}>{solution.title}</Text>
                                    </View>
                                    <Text style={styles.solutionDetail}>{solution.detail}</Text>
                                    <NextStepLink text="See the full profit → cash picture" onPress={() => setCurrentScreen('business-passport')} />
                                </View>
                            );
                        })()}

                        <View style={styles.weeklyHeaderRow}>
                            <Text style={styles.sectionTitle}>Weekly Cash Flow — Next 13 Weeks</Text>
                            <View style={styles.viewToggle}>
                                {(['chart', 'table'] as const).map(v => (
                                    <TouchableOpacity key={v} style={[styles.viewToggleBtn, weeklyView === v && styles.viewToggleBtnActive]} onPress={() => setWeeklyView(v)}>
                                        <Text style={[styles.viewToggleText, weeklyView === v && styles.viewToggleTextActive]}>{v === 'chart' ? 'Chart' : 'Table'}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {weeklyView === 'chart' ? (
                            <>
                                {weeks.map((w, i) => {
                                    const inflowPct = w.projectedInflow / maxOut;
                                    const outflowPct = w.projectedOutflow / maxOut;
                                    return (
                                        <View key={i} style={[styles.weekRow, w.alert && styles.weekRowAlert]}>
                                            <Text style={styles.weekLabel}>{w.week}</Text>
                                            <View style={styles.barCol}>
                                                <WeekBar pct={inflowPct} color={Colors.income} />
                                                <WeekBar pct={outflowPct} color={Colors.expense} />
                                            </View>
                                            <View style={styles.weekNums}>
                                                <Text style={[styles.weekNet, { color: w.netCash >= 0 ? Colors.income : Colors.expense }]}>
                                                    {fmt(w.netCash)}
                                                </Text>
                                                <Text style={styles.weekCumLabel}>
                                                    Cum: {fmt(w.cumulativeCash)}
                                                </Text>
                                            </View>
                                        </View>
                                    );
                                })}

                                <View style={styles.legend}>
                                    <View style={styles.legendItem}>
                                        <View style={[styles.legendDot, { backgroundColor: Colors.income }]} />
                                        <Text style={styles.legendLabel}>Projected Inflow</Text>
                                    </View>
                                    <View style={styles.legendItem}>
                                        <View style={[styles.legendDot, { backgroundColor: Colors.expense }]} />
                                        <Text style={styles.legendLabel}>Projected Outflow</Text>
                                    </View>
                                </View>
                            </>
                        ) : (
                            <>
                                <View style={styles.table}>
                                    <View style={styles.tableHeaderRow}>
                                        <Text style={[styles.tableHeaderCell, styles.tableColWeek]}>Week</Text>
                                        <Text style={[styles.tableHeaderCell, styles.tableColMoney]}>Opening</Text>
                                        <Text style={[styles.tableHeaderCell, styles.tableColMoney]}>In</Text>
                                        <Text style={[styles.tableHeaderCell, styles.tableColMoney]}>Out</Text>
                                        <Text style={[styles.tableHeaderCell, styles.tableColMoney]}>Closing</Text>
                                        <Text style={[styles.tableHeaderCell, styles.tableColRunway]}>Runway</Text>
                                    </View>
                                    {weeks.map((w, i) => (
                                        <View key={i} style={[styles.tableRow, w.closingCash < 0 && styles.tableRowAlert]}>
                                            <Text style={[styles.tableCell, styles.tableColWeek]}>{w.week}</Text>
                                            <Text style={[styles.tableCell, styles.tableColMoney]}>{fmt(w.openingCash)}</Text>
                                            <Text style={[styles.tableCell, styles.tableColMoney, { color: Colors.income }]}>{fmt(w.projectedInflow)}</Text>
                                            <Text style={[styles.tableCell, styles.tableColMoney, { color: Colors.expense }]}>{fmt(w.projectedOutflow)}</Text>
                                            <Text style={[styles.tableCell, styles.tableColMoney, { fontWeight: '800', color: w.closingCash < 0 ? Colors.expense : Colors.text }]}>{fmt(w.closingCash)}</Text>
                                            <Text style={[styles.tableCell, styles.tableColRunway]}>
                                                {w.closingCash <= 0 ? '—' : Number.isFinite(w.runwayWeeks) ? `${w.runwayWeeks.toFixed(1)}w` : '∞'}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                                <Text style={styles.tableAssumptions}>
                                    Built from: invoices due each week, your trailing 90-day pattern of ordinary (non-recurring) and recurring transactions, active loan payments, and this month's committed budget where it's higher than recent spend. Runway is that week's closing cash divided by that week's own projected outflow — how long it alone would last with no further income.
                                </Text>
                            </>
                        )}

                        <View style={styles.noteBoxRow}>
                            <Icon name="zap" size={14} color={Colors.primary} />
                            <Text style={styles.noteText}>
                                Inflows are pending invoice due dates plus your average weekly sales from the last 90 days. Outflows use your recurring expenses, average ordinary spending, active loan payments{usesBudget ? ', and this month\'s committed budget' : ''}. Add more transactions to improve accuracy.
                            </Text>
                        </View>

                        {totalInflow === 0 && totalOutflow === 0 && (
                            <View style={styles.alertBanner}>
                                <Icon name="info" size={16} color={Colors.textMuted} />
                                <Text style={[styles.alertText, { color: Colors.textMuted }]}>
                                    Every week shows {fmt(0)} because there's no recorded activity to project from yet — no paid transactions in the last 90 days, no unpaid invoices due soon, no active loans, and no budget set. Record some transactions to see a real forecast here.
                                </Text>
                            </View>
                        )}

                        <NextStepLink
                            emphasis="button"
                            text={usesBudget ? 'This forecast reflects your budget — Review it' : 'Set a budget to sharpen this forecast'}
                            onPress={() => setCurrentScreen('budget')}
                        />
                    </>
                )}

                {/* ── RUNWAY TAB ── */}
                {tab === 'runway' && (
                    <>
                        <View style={[styles.runwayCard, { borderColor: runwayColor }]}>
                            <Text style={styles.runwayLabel}>Cash Runway</Text>
                            <RadialGauge
                                displayValue={Number.isFinite(runwayDays) ? `${Math.round(animatedRunwayDays)}` : '∞'}
                                label="days"
                                progress={Number.isFinite(runwayDays) ? Math.min(runwayDays / 90, 1) : 1}
                                color={runwayColor}
                                size={128}
                                strokeWidth={10}
                            />
                            <View style={styles.runwaySubRow}>
                                <Icon
                                    name={runwayDays < 30 ? 'alert-circle' : runwayDays < 90 ? 'alert-triangle' : 'check-circle'}
                                    size={13}
                                    color={runwayColor}
                                />
                                <Text style={styles.runwaySub}>
                                    {runwayDays < 30
                                        ? 'Critical — less than 30 days of cash remaining'
                                        : runwayDays < 90
                                        ? 'Caution — less than 3 months of runway'
                                        : 'Healthy — more than 3 months of runway'}
                                </Text>
                            </View>

                            <TouchableOpacity style={styles.runwayWhyBtn} onPress={() => setRunwayWhyOpen(o => !o)}>
                                <Text style={styles.runwayWhyBtnText}>Why? What is this built on?</Text>
                                <Text style={styles.runwayWhyBtnText}>{runwayWhyOpen ? '▲' : '▼'}</Text>
                            </TouchableOpacity>
                            {runwayWhyOpen && (
                                <View style={styles.runwayWhyBox}>
                                    <Text style={styles.runwayWhyLabel}>Definition</Text>
                                    <Text style={styles.runwayWhyText}>{runwayIntelligence.definition}</Text>

                                    <Text style={styles.runwayWhyLabel}>Data confidence</Text>
                                    <Text style={styles.runwayWhyText}>{runwayIntelligence.dataQuality.summary}</Text>
                                    {runwayIntelligence.builtOn.map((line, i) => (
                                        <Text key={i} style={styles.runwayWhyBullet}>• {line}</Text>
                                    ))}

                                    <Text style={styles.runwayWhyLabel}>Trigger</Text>
                                    <Text style={[styles.runwayWhyText, { color: Colors.warning, fontWeight: '700' }]}>⚠️ {runwayIntelligence.trigger}</Text>
                                </View>
                            )}
                        </View>

                        <View style={styles.row2}>
                            <View style={styles.card2}>
                                <Text style={styles.card2Label}>Cash Balance</Text>
                                <Text style={[styles.card2Val, { color: Colors.income }]}>{fmt(cashBalance)}</Text>
                            </View>
                            <View style={styles.card2}>
                                <Text style={styles.card2Label}>Daily Burn Rate</Text>
                                <Text style={[styles.card2Val, { color: Colors.expense }]}>{fmt(dailyBurn)}</Text>
                            </View>
                        </View>

                        <TouchableOpacity style={[styles.dscrCard, { borderColor: dscrColor }]} onPress={() => navigate('loans')} activeOpacity={0.85}>
                            <View style={styles.dscrHeaderRow}>
                                <Icon name="briefcase" size={13} color={Colors.muted} />
                                <Text style={styles.dscrTitle}>Debt Coverage</Text>
                                <Text style={[styles.dscrBadge, { color: dscrColor, backgroundColor: dscrColor + '20' }]}>
                                    {dscr.status === 'healthy' ? 'HEALTHY' : dscr.status === 'warning' ? 'BORDERLINE' : 'AT RISK'}
                                </Text>
                            </View>
                            <Text style={styles.dscrSummary}>
                                {dscr.totalDebtService <= 0
                                    ? 'No active loan repayments to cover right now.'
                                    : dscr.status === 'healthy'
                                    ? `Income comfortably covers your ${fmt(dscr.totalDebtService)}/year in scheduled loan payments (${dscr.dscr.toFixed(2)}x coverage).`
                                    : dscr.status === 'warning'
                                    ? `Income barely covers your ${fmt(dscr.totalDebtService)}/year in loan payments (${dscr.dscr.toFixed(2)}x) — little room for a bad month.`
                                    : `Income may not fully cover your ${fmt(dscr.totalDebtService)}/year in loan payments (${dscr.dscr.toFixed(2)}x).`}
                                {' '}Full breakdown & Interest Rate Shock on Loans →
                            </Text>
                        </TouchableOpacity>

                        {/* Startup Burn Rate -- Gross Burn / Net Burn / a
                            net-burn-based runway, plus what's actually
                            changing it. Distinct from the Cash Runway card
                            above (which assumes revenue stops entirely);
                            this one nets in actual revenue and explains
                            WHY the trend is moving. */}
                        {burnRate.available && (
                            <View style={[styles.runwayCard, { borderColor: burnRateColor }]}>
                                <Text style={styles.runwayLabel}>
                                    {burnRate.status === 'danger' ? '🔴' : burnRate.status === 'warning' ? '🟡' : '🟢'} {burnRate.headline}
                                </Text>
                                <Text style={styles.runwaySub}>{burnRate.narrative}</Text>

                                <View style={[styles.row2, { marginTop: Spacing.md }]}>
                                    <View style={styles.card2}>
                                        <Text style={styles.card2Label}>Gross Burn / mo</Text>
                                        <Text style={[styles.card2Val, { color: Colors.expense }]}>{fmt(burnRate.grossBurn)}</Text>
                                    </View>
                                    <View style={styles.card2}>
                                        <Text style={styles.card2Label}>Net Burn / mo</Text>
                                        <Text style={[styles.card2Val, { color: burnRate.netBurn > 0 ? Colors.expense : Colors.income }]}>
                                            {fmt(burnRate.netBurn)}
                                        </Text>
                                    </View>
                                </View>

                                {burnRate.trend.direction !== 'insufficient-data' && burnRate.trend.driver && (
                                    <>
                                        <Text style={[styles.dscrTitle, { marginTop: Spacing.md, marginBottom: 4 }]}>What changed?</Text>
                                        {burnRate.trend.driver.revenueGrowthPct !== null && (
                                            <Text style={styles.runwaySub}>
                                                • Revenue {burnRate.trend.driver.revenueGrowthPct >= 0 ? '↑' : '↓'} {Math.abs(burnRate.trend.driver.revenueGrowthPct).toFixed(0)}%
                                            </Text>
                                        )}
                                        {burnRate.trend.driver.topExpenseDrivers.map(d => (
                                            <Text key={d.category} style={styles.runwaySub}>
                                                • {d.category} {d.growthPct !== null && d.growthPct >= 0 ? '↑' : '↓'} {d.growthPct !== null ? Math.abs(d.growthPct).toFixed(0) : '—'}%
                                            </Text>
                                        ))}
                                    </>
                                )}

                                {burnRate.trend.insight && (
                                    <View style={styles.infoCard}>
                                        <Text style={styles.dscrTitle}>Quad360 Insight</Text>
                                        <Text style={styles.runwaySub}>{burnRate.trend.insight}</Text>
                                    </View>
                                )}
                            </View>
                        )}

                        <Text style={styles.sectionTitle}>What Affects Your Runway</Text>
                        <View style={styles.infoCard}>
                            {([
                                { icon: 'trending-down' as IconName, text: 'Reduce burn rate by cutting non-essential recurring expenses' },
                                {
                                    icon: 'trending-up' as IconName,
                                    text: atRiskAR > 0
                                        ? `Increase inflow by accelerating invoice collections — ${fmt(atRiskAR)} is currently at high risk of late payment`
                                        : 'Increase inflow by accelerating invoice collections',
                                },
                                {
                                    icon: 'shield' as IconName,
                                    text: reserveGap > 0
                                        ? `Build a minimum 3-month cash reserve as your safety net — you're ${fmt(reserveGap)} short of that cushion at today's burn rate`
                                        : 'Build a minimum 3-month cash reserve as your safety net',
                                },
                                { icon: 'refresh-cw' as IconName, text: 'Review loan repayment schedule — refinancing can extend runway' },
                            ]).map((item, i) => (
                                <View key={i} style={styles.infoRowLine}>
                                    <Icon name={item.icon} size={13} color={Colors.muted} />
                                    <Text style={styles.infoRow}>{item.text}</Text>
                                </View>
                            ))}
                        </View>

                        <TouchableOpacity style={styles.actionBtn} onPress={() => setCurrentScreen('invoices')}>
                            <Text style={styles.actionBtnText}>Chase Outstanding Invoices →</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: 'rgba(239,68,68,0.12)', borderColor: Colors.expense }]} onPress={() => setCurrentScreen('transactions')}>
                            <Text style={[styles.actionBtnText, { color: Colors.expense }]}>Review Recurring Expenses →</Text>
                        </TouchableOpacity>
                    </>
                )}

                {/* ── AR RISK TAB ── */}
                {tab === 'ar' && (
                    <>
                        <View style={styles.row2}>
                            <View style={styles.card2}>
                                <Text style={styles.card2Label}>Total Outstanding AR</Text>
                                <Text style={[styles.card2Val, { color: Colors.income }]}>{fmt(totalAR)}</Text>
                            </View>
                            <View style={styles.card2}>
                                <Text style={styles.card2Label}>At-Risk AR</Text>
                                <Text style={[styles.card2Val, { color: Colors.expense }]}>{fmt(atRiskAR)}</Text>
                            </View>
                        </View>

                        {arRisk.length === 0 ? (
                            <View style={styles.emptyBox}>
                                <View style={styles.emptyIconWrap}>
                                    <Icon name="check-circle" size={48} color={Colors.income} />
                                </View>
                                <Text style={styles.emptyTitle}>No Outstanding Invoices</Text>
                                <Text style={styles.emptyText}>All invoices have been paid. Great work on collections!</Text>
                            </View>
                        ) : (
                            <>
                                <Text style={styles.sectionTitle}>Invoice Collection Risk</Text>
                                {arRisk.map(({ inv, daysUntilDue, risk }) => (
                                    <View key={inv.id} style={[styles.arCard, {
                                        borderLeftColor: risk === 'high' ? Colors.expense : risk === 'medium' ? Colors.warning : Colors.income
                                    }]}>
                                        <View style={styles.arTop}>
                                            <Text style={styles.arClient}>{inv.clientName}</Text>
                                            <Text style={[styles.arAmount, { color: risk === 'high' ? Colors.expense : Colors.income }]}>
                                                {fmt(inv.total)}
                                            </Text>
                                        </View>
                                        <View style={styles.arBottom}>
                                            <Text style={styles.arRef}>#{inv.invoiceNumber}</Text>
                                            <View style={[styles.riskBadge, {
                                                backgroundColor: risk === 'high' ? 'rgba(239,68,68,0.1)' : risk === 'medium' ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)'
                                            }]}>
                                                <Icon
                                                    name={risk === 'high' ? 'alert-circle' : risk === 'medium' ? 'alert-triangle' : 'check-circle'}
                                                    size={11}
                                                    color={risk === 'high' ? Colors.expense : risk === 'medium' ? Colors.warning : Colors.income}
                                                />
                                                <Text style={[styles.riskText, {
                                                    color: risk === 'high' ? Colors.expense : risk === 'medium' ? Colors.warning : Colors.income
                                                }]}>
                                                    {risk === 'high' ? 'High Risk' : risk === 'medium' ? 'Due Soon' : 'On Track'}
                                                </Text>
                                            </View>
                                            <Text style={styles.arDue}>
                                                {daysUntilDue === null ? '' : daysUntilDue < 0
                                                    ? `${Math.abs(daysUntilDue)}d overdue`
                                                    : `Due in ${daysUntilDue}d`}
                                            </Text>
                                        </View>
                                    </View>
                                ))}
                            </>
                        )}

                        <TouchableOpacity style={styles.actionBtn} onPress={() => setCurrentScreen('invoices')}>
                            <Text style={styles.actionBtnText}>Manage Invoices →</Text>
                        </TouchableOpacity>
                    </>
                )}

                {/* ── BREAK-EVEN TAB ── */}
                {tab === 'breakeven' && (
                    <>
                        <BreakevenAnalysis result={breakeven} currency={sym} />
                        <NextStepLink
                            text="Planning a new price or product? Use the unit-economics Break-Even Calculator instead"
                            onPress={() => navigate('cfo', { tab: 'finance' })}
                        />
                        <NextStepLink
                            text="See profit by category and customer"
                            onPress={() => navigate('growth', { tab: 'drivers' })}
                        />
                    </>
                )}

                <View style={{ height: 100 }} />
            </ScrollView>
            <FooterNav />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe:     { flex: 1, backgroundColor: Colors.bg },
    scroll:   { padding: Spacing.lg },
    tabRow:   { flexDirection: 'row', borderBottomWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg },
    tab:      { flex: 1, paddingVertical: Spacing.md, alignItems: 'center' },
    tabActive:{ borderBottomWidth: 2, borderColor: Colors.primary },
    tabLabelRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    tabLabel: { fontSize: 13, color: Colors.muted, fontWeight: '600' },
    tabLabelActive: { color: Colors.primary },

    row3:     { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
    miniCard: { flex: 1, backgroundColor: Colors.card, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    miniLabel:{ fontSize: 10, color: Colors.muted, marginBottom: Spacing.xs },
    miniVal:  { fontSize: 14, fontWeight: '800' },

    alertBanner: { flexDirection: 'row', backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)', borderRadius: 10, padding: Spacing.md, gap: Spacing.sm, marginBottom: Spacing.lg, alignItems: 'flex-start' },
    alertText:   { flex: 1, fontSize: 13, color: Colors.muted, lineHeight: 18 },

    solutionBanner: { backgroundColor: Colors.card, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.lg, ...Shadow.sm },
    solutionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.xs },
    solutionTitle:  { fontSize: 13, fontWeight: '700', color: Colors.text },
    solutionDetail: { fontSize: 12, color: Colors.muted, lineHeight: 17 },

    sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 10, marginTop: Spacing.sm },

    weeklyHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    viewToggle: { flexDirection: 'row', backgroundColor: Colors.card, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.border, padding: 2 },
    viewToggleBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.pill },
    viewToggleBtnActive: { backgroundColor: Colors.primary },
    viewToggleText: { fontSize: 11, fontWeight: '700', color: Colors.muted },
    viewToggleTextActive: { color: '#fff' },

    table: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, overflow: 'hidden', marginTop: Spacing.xs },
    tableHeaderRow: { flexDirection: 'row', backgroundColor: Colors.card, paddingVertical: 8, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
    tableHeaderCell: { fontSize: 10, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase' },
    tableRow: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
    tableRowAlert: { backgroundColor: 'rgba(239,68,68,0.06)' },
    tableCell: { fontSize: 11, color: Colors.text },
    tableColWeek: { width: 46 },
    tableColMoney: { flex: 1, textAlign: 'right' },
    tableColRunway: { width: 48, textAlign: 'right' },
    tableAssumptions: { fontSize: 10.5, color: Colors.muted, lineHeight: 15, marginTop: Spacing.sm, fontStyle: 'italic' },

    weekRow:      { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: Spacing.sm },
    weekRowAlert: { backgroundColor: 'rgba(239,68,68,0.05)', borderRadius: Radius.sm, padding: Spacing.xs },
    weekLabel:    { width: 52, fontSize: 11, color: Colors.muted },
    barCol:       { flex: 1, gap: 3 },
    barTrack:     { height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden' },
    barFill:      { height: '100%', borderRadius: 3 },
    weekNums:     { width: 72, alignItems: 'flex-end' },
    weekNet:      { fontSize: 12, fontWeight: '700' },
    weekCumLabel: { fontSize: 10, color: Colors.muted },

    legend:       { flexDirection: 'row', gap: Spacing.lg, justifyContent: 'center', marginTop: Spacing.md, marginBottom: Spacing.sm },
    legendItem:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot:    { width: 10, height: 10, borderRadius: 5 },
    legendLabel:  { fontSize: 12, color: Colors.muted },

    noteBoxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: Colors.card, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: Colors.border, marginTop: Spacing.sm },
    noteText: { flex: 1, fontSize: 12, color: Colors.muted, lineHeight: 18 },

    // Runway
    runwayCard:   { backgroundColor: Colors.card, borderRadius: Radius.lg, padding: Spacing.xxl, borderWidth: 2, marginBottom: Spacing.lg, alignItems: 'center', ...Shadow.sm },
    runwayLabel:  { fontSize: 13, color: Colors.muted, marginBottom: Spacing.sm },
    runwaySubRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginTop: Spacing.sm },
    runwaySub:    { fontSize: 13, color: Colors.muted, textAlign: 'center' },
    runwayWhyBtn: { alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border },
    runwayWhyBtnText: { fontSize: 11.5, fontWeight: '600', color: Colors.muted },
    runwayWhyBox: { alignSelf: 'stretch', backgroundColor: Colors.bg, borderRadius: Radius.md, padding: Spacing.md, marginTop: 8, gap: 2 },
    runwayWhyLabel: { fontSize: 10, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 8 },
    runwayWhyText: { fontSize: 12, color: Colors.text, lineHeight: 17, textAlign: 'left' },
    runwayWhyBullet: { fontSize: 11, color: Colors.muted, lineHeight: 16, marginTop: 2, textAlign: 'left' },

    row2:  { flexDirection: 'row', gap: 10, marginBottom: Spacing.lg },
    card2: { flex: 1, backgroundColor: Colors.card, borderRadius: Radius.md, padding: 14, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    card2Label: { fontSize: 11, color: Colors.muted, marginBottom: Spacing.xs },
    card2Val:   { fontSize: 18, fontWeight: '800' },

    dscrCard: { backgroundColor: Colors.card, borderRadius: Radius.md, padding: 14, borderWidth: 1.5, marginBottom: Spacing.lg, ...Shadow.sm },
    dscrHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
    dscrTitle: { fontSize: 13, fontWeight: '700', color: Colors.text },
    dscrBadge: { marginLeft: 'auto', fontSize: 10.5, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.pill, overflow: 'hidden' },
    dscrSummary: { fontSize: 12.5, color: Colors.muted, lineHeight: 18 },

    infoCard: { backgroundColor: Colors.card, borderRadius: Radius.md, padding: 14, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.lg, gap: 10, ...Shadow.sm },
    infoRowLine: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
    infoRow:  { flex: 1, fontSize: 13, color: Colors.muted, lineHeight: 18 },

    actionBtn: { backgroundColor: 'rgba(59,130,246,0.12)', borderWidth: 1, borderColor: Colors.primary, borderRadius: Radius.md, padding: 14, alignItems: 'center', marginBottom: 10 },
    actionBtnText: { fontSize: 14, fontWeight: '700', color: Colors.primary },

    // AR Risk
    arCard: { backgroundColor: Colors.card, borderRadius: Radius.md, padding: 14, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 4, marginBottom: 10, ...Shadow.sm },
    arTop:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    arClient: { fontSize: 14, fontWeight: '700', color: Colors.text, flex: 1 },
    arAmount: { fontSize: 14, fontWeight: '800' },
    arBottom: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
    arRef:    { fontSize: 11, color: Colors.muted },
    riskBadge:{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, paddingHorizontal: Spacing.sm, paddingVertical: 3 },
    riskText: { fontSize: 11, fontWeight: '700' },
    arDue:    { fontSize: 11, color: Colors.muted, marginLeft: 'auto' },

    emptyBox:      { alignItems: 'center', paddingVertical: Spacing.huge },
    emptyIconWrap: { marginBottom: Spacing.md },
    emptyTitle: { fontSize: 18, fontWeight: '800', color: Colors.text, marginBottom: 6 },
    emptyText:  { fontSize: 14, color: Colors.muted, textAlign: 'center' },
});
