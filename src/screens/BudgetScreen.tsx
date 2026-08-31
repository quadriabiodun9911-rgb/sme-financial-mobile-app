import React, { useState, useMemo, useRef } from 'react';
import {
    SafeAreaView, ScrollView, View, Text,
    TouchableOpacity, StyleSheet, TextInput, Modal, Platform, useWindowDimensions,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { computeBudgetVsActual, getMonthlyExpenseAverage } from '../utils/finance';
import { totalMonthlyLoanBurden } from '../utils/loanMath';
import { performFinancialDiagnosis } from '../utils/financialDiagnosisEngine';
import { generateExpenseReductionActions } from '../utils/actionRecommendationEngine';
import { generateAutoBudget, AutoBudgetSuggestion } from '../utils/budgetEngine';
import { isBudgetPeriodLapsed } from '../utils/budgetPeriod';
import { computeGoalBudgetAlignment } from '../utils/goalAlignment';
import { computeSmartBudgetRevenue } from '../utils/smartBudget';
import { computeBudgetIntelligence } from '../utils/budgetIntelligence';
import NextStepLink from '../components/NextStepLink';
import ProfitCashImpactCard from '../components/ProfitCashImpactCard';
import { computeProfitCashImpact } from '../utils/impactChain';
import { Budget } from '../types';
import { showAlert, confirmAction } from '../utils/webAlert';
import Icon from '../components/ui/Icon';
import { Radius, Shadow, Spacing } from '../theme/tokens';

const FAVORABILITY_COLOR: Record<'favorable' | 'unfavorable' | 'on_track', string> = {
    favorable: Colors.income, unfavorable: Colors.expense, on_track: Colors.textMuted,
};

const EXPENSE_CATEGORIES = [
    'Office & Admin', 'Salaries', 'Marketing', 'Equipment', 'Software',
    'Rent', 'Utilities', 'Transport', 'Insurance', 'Professional Fees',
    'Supplies', 'Maintenance', 'Travel', 'Training', 'Other',
];

export default function BudgetScreen() {
    const { transactions, budgets, addBudget, updateBudget, deleteBudget, settings, navigate, finance, loans, invoices, inventory, goals, assets } = useApp();
    const { currency } = settings;

    // Modal renders via a portal on web, outside App.tsx's width constraint --
    // see FooterNav.tsx for the reference fix. Applied here to the bottom
    // sheets so they don't stretch full-bleed on desktop.
    const { width: windowWidth } = useWindowDimensions();
    const constrainSheetWidth = Platform.OS === 'web' && windowWidth >= 720;

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel   = now.toLocaleString('default', { month: 'long', year: 'numeric' });

    const [showForm,    setShowForm]    = useState(false);
    const [editingId,   setEditingId]   = useState<string | null>(null);
    const [category,    setCategory]    = useState('');
    const [amount,      setAmount]      = useState('');
    const [customCat,   setCustomCat]   = useState('');
    const [showCatPick, setShowCatPick] = useState(false);
    const [showAutoGen, setShowAutoGen] = useState(false);
    const [excludedCats, setExcludedCats] = useState<Set<string>>(new Set());
    const [adjustMode, setAdjustMode] = useState(false);
    const [adjustedAmounts, setAdjustedAmounts] = useState<Record<string, string>>({});

    const bva = useMemo(() => computeBudgetVsActual(transactions, budgets, currentMonth), [transactions, budgets, currentMonth]);

    // Smart Budget Builder's revenue half -- see smartBudget.ts's own doc
    // comment. No revenue-budget UI exists yet, so the Base scenario also
    // doubles as the revenue figure Budget Intelligence below measures
    // actual revenue against, unless/until an owner-set revenue target
    // exists elsewhere in the app.
    const smartRevenue = useMemo(() => computeSmartBudgetRevenue(transactions, currency), [transactions, currency]);
    const budgetIntel = useMemo(
        () => computeBudgetIntelligence(transactions, budgets, currentMonth, smartRevenue.available ? smartRevenue.scenarios.base : 0, currency),
        [transactions, budgets, currentMonth, smartRevenue, currency],
    );

    // budgets is never empty here and computeBudgetVsActual now filters to
    // the current period only (see finance.ts) -- when every category is
    // from a past period, bva comes back empty even though budgets isn't,
    // which is the moment to say so instead of just showing a bare table.
    const budgetPeriodLapsed = useMemo(() => isBudgetPeriodLapsed(budgets), [budgets]);

    // Does this month's budget actually support any active cost-reduction,
    // cash-reserve, or margin-improvement goal? Those are the goal types a
    // budget can literally help or hurt (see goalAlignment.ts) -- revenue
    // goals have no cost lever to check. Flags the first misaligned one so
    // setting a budget and setting a goal don't silently drift apart.
    const misalignedGoal = useMemo(() => {
        for (const goal of goals ?? []) {
            if (goal.status === 'achieved') continue;
            if (goal.type !== 'cost_reduction' && goal.type !== 'cash_reserve' && goal.type !== 'margin_improvement') continue;
            const alignment = computeGoalBudgetAlignment(goal, budgets, transactions, finance, loans);
            if (alignment.applicable && alignment.status !== 'aligned') {
                return { goal, alignment };
            }
        }
        return null;
    }, [goals, budgets, transactions, finance, loans]);

    const totalBudgeted = budgets.reduce((s, b) => s + b.monthlyAmount, 0);
    const totalActual   = bva.reduce((s, b) => s + b.actual, 0);
    const totalVariance = totalBudgeted - totalActual;
    const overCount     = bva.filter(b => b.status === 'over').length;

    // Active loan repayments are a real monthly cash commitment on top of the
    // budget, so the plan must account for them.
    const loanBurden = totalMonthlyLoanBurden(loans ?? []);

    // Loan repayments are a real monthly commitment (addLoanPayment posts a
    // "Loan Repayment" expense transaction), but they never had a budget
    // category — meaning they never showed up anywhere in this table or the
    // month summary, only as a separate line in the Budget Strategy card
    // below. This synthesizes a "Loan Repayments" row so they're visible
    // and tracked side by side with every other category, unless the user
    // has already manually budgeted a loan-related category themselves.
    const hasManualLoanBudget = budgets.some(b => b.category.toLowerCase().includes('loan'));
    const loanActualThisMonth = transactions
        .filter(t => t.type === 'expense' && t.category === 'Loan Repayment' && (t.date || '').startsWith(currentMonth))
        .reduce((s, t) => s + (t.amount ?? 0), 0);
    const displayBva = useMemo(() => {
        if (hasManualLoanBudget || loanBurden <= 0) return bva;
        const variance = loanBurden - loanActualThisMonth;
        const variancePct = loanBurden > 0 ? (variance / loanBurden) * 100 : 0;
        const loanRow = {
            category: 'Loan Repayments',
            budgeted: loanBurden,
            actual: loanActualThisMonth,
            variance,
            variancePct,
            status: (Math.abs(variancePct) <= 5 ? 'on_track' : variance < 0 ? 'over' : 'under') as 'on_track' | 'over' | 'under',
        };
        return [loanRow, ...bva];
    }, [bva, hasManualLoanBudget, loanBurden, loanActualThisMonth]);
    const displayTotalBudgeted = totalBudgeted + (hasManualLoanBudget || loanBurden <= 0 ? 0 : loanBurden);
    const displayTotalActual   = displayBva.reduce((s, b) => s + b.actual, 0);
    const displayTotalVariance = displayTotalBudgeted - displayTotalActual;
    const displayOverCount     = displayBva.filter(b => b.status === 'over').length;
    const displayOverAmount    = displayBva.filter(b => b.status === 'over').reduce((s, b) => s + Math.abs(b.variance), 0);

    // Average monthly spend per category from past transactions — used to suggest
    // a realistic budget instead of guessing.
    const pastAvgByCat = useMemo(() => {
        const acc: Record<string, { total: number; months: Set<string> }> = {};
        transactions.filter(t => t.type === 'expense').forEach(t => {
            const cat = (t.category || 'Other');
            const month = (t.date || '').slice(0, 7);
            if (!acc[cat]) acc[cat] = { total: 0, months: new Set() };
            acc[cat].total += (t.amount ?? 0);
            if (month) acc[cat].months.add(month);
        });
        const avg: Record<string, number> = {};
        Object.entries(acc).forEach(([cat, v]) => { avg[cat] = v.total / Math.max(1, v.months.size); });
        return avg;
    }, [transactions]);

    // Budget strategy: how the planned spend sits against revenue, cash & profit.
    const monthlyRevenue = finance?.income ?? 0;
    const cashBalance = finance?.cashBalance ?? 0;
    // Total monthly cash commitments = planned spend + loan repayments.
    const totalCommitments = totalBudgeted + loanBurden;
    // Projected profit if you spend your full budget and cover loan repayments.
    const projectedProfit = monthlyRevenue - totalCommitments;
    // A safe cap: keep total commitments within revenue (never plan a loss). For
    // a healthy ~20% margin, aim to keep them under 80% of revenue.
    const safeCap = monthlyRevenue * 0.8;
    const overRevenue = totalCommitments > monthlyRevenue;
    const overSafeCap = totalCommitments > safeCap && !overRevenue;

    // Adjust & Simulate: lets a user drag category amounts around and watch
    // the profit/cash effect and solution update live, before committing
    // anything — rather than editing one category at a time and having to
    // mentally recompute the total effect themselves.
    const scrollRef = useRef<ScrollView>(null);
    const openAdjustMode = () => {
        const seed: Record<string, string> = {};
        budgets.forEach(b => { seed[b.id] = String(b.monthlyAmount); });
        setAdjustedAmounts(seed);
        setAdjustMode(true);
        // The adjust panel lives inside the Budget Strategy card near the
        // top of the scroll — jump there so triggering it from the sticky
        // header (reachable from anywhere on the page) doesn't leave users
        // staring at whatever section they'd scrolled down to.
        scrollRef.current?.scrollTo({ y: 0, animated: true });
    };
    const cancelAdjustMode = () => { setAdjustMode(false); setAdjustedAmounts({}); };
    const applyAdjustments = () => {
        budgets.forEach(b => {
            const newAmt = parseFloat(adjustedAmounts[b.id]);
            if (!isNaN(newAmt) && newAmt >= 0 && newAmt !== b.monthlyAmount) {
                updateBudget(b.id, { monthlyAmount: newAmt });
            }
        });
        setAdjustMode(false);
        setAdjustedAmounts({});
    };
    const adjustedTotalBudgeted = adjustMode
        ? budgets.reduce((s, b) => s + (parseFloat(adjustedAmounts[b.id]) || 0), 0)
        : totalBudgeted;
    const adjustedTotalCommitments = adjustedTotalBudgeted + loanBurden;
    const adjustedProjectedProfit = monthlyRevenue - adjustedTotalCommitments;
    const adjustedOverRevenue = adjustedTotalCommitments > monthlyRevenue;
    const adjustedOverSafeCap = adjustedTotalCommitments > safeCap && !adjustedOverRevenue;
    const pastSuggestion = pastAvgByCat[customCat.trim() || category];

    // Concrete reduction tactics for the categories actually driving spend —
    // reuses the same diagnosis + action engine as the AI Advisor, so budget
    // guidance is specific ("negotiate X vendor, target 15% cut") instead of
    // a generic "you're over budget" flag.
    const expenseTactics = useMemo(() => {
        if (transactions.length < 5) return [];
        const diagnosis = performFinancialDiagnosis(transactions, invoices, finance.cashBalance, getMonthlyExpenseAverage(finance.expense, transactions), settings.currency, loans, inventory, assets);
        return generateExpenseReductionActions(diagnosis, diagnosis.metrics, settings.currency).slice(0, 3);
    }, [transactions, invoices, finance.cashBalance, finance.expense, settings.currency, loans, inventory, assets]);

    // Auto-generated budget: sized against forward-looking revenue (via
    // computeRevenueForecast inside generateAutoBudget), scaled down if
    // trailing spend would exceed a safe share of that projection, so it's
    // an actual affordable plan and not just relabeled spending history.
    const autoBudget = useMemo(
        () => generateAutoBudget(transactions, finance, loans ?? []),
        [transactions, finance, loans]
    );

    function openAutoGen() {
        setExcludedCats(new Set());
        setShowAutoGen(true);
    }

    function applyAutoBudget() {
        const toApply = autoBudget.suggestions.filter(s => !excludedCats.has(s.category));
        toApply.forEach((s: AutoBudgetSuggestion) => {
            const existing = budgets.find(b => b.category.toLowerCase() === s.category.toLowerCase());
            if (existing) {
                updateBudget(existing.id, { monthlyAmount: s.monthlyAmount, period: currentMonth });
            } else {
                addBudget({ id: '', category: s.category, monthlyAmount: s.monthlyAmount, period: currentMonth });
            }
        });
        setShowAutoGen(false);
    }

    function openAdd() {
        setEditingId(null);
        setCategory('');
        setAmount('');
        setCustomCat('');
        setShowForm(true);
    }

    function openEdit(b: Budget) {
        setEditingId(b.id);
        setCategory(b.category);
        setAmount(String(b.monthlyAmount));
        setCustomCat('');
        setShowForm(true);
    }

    function handleSave() {
        const cat = customCat.trim() || category;
        const amt = parseFloat(amount);
        if (!cat) { showAlert('Error', 'Please select or enter a category.'); return; }
        if (!amt || amt <= 0) { showAlert('Error', 'Please enter a valid amount.'); return; }

        if (editingId) {
            updateBudget(editingId, { category: cat, monthlyAmount: amt, period: currentMonth });
        } else {
            // Check duplicate category
            if (budgets.find(b => b.category.toLowerCase() === cat.toLowerCase())) {
                showAlert('Duplicate', `A budget for "${cat}" already exists. Edit the existing one.`);
                return;
            }
            addBudget({ id: '', category: cat, monthlyAmount: amt, period: currentMonth });
        }
        setShowForm(false);
    }

    function handleDelete(id: string, cat: string) {
        confirmAction('Delete Budget', `Remove budget for "${cat}"?`, 'Delete', () => deleteBudget(id));
    }

    function statusColor(status: string) {
        if (status === 'over')     return Colors.expense;
        if (status === 'on_track') return Colors.income;
        return Colors.textMuted;
    }

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <View style={s.headerRow}>
                <TouchableOpacity onPress={() => navigate('dashboard')}>
                    <Text style={s.backBtn}>← Dashboard</Text>
                </TouchableOpacity>
                <Text style={s.screenTitle}>Budget</Text>
                {budgets.length > 0 && (
                    <TouchableOpacity
                        style={[s.autoBtn, adjustMode && { backgroundColor: Colors.primary }]}
                        onPress={() => (adjustMode ? cancelAdjustMode() : openAdjustMode())}
                    >
                        <View style={s.btnIconRow}>
                            <Icon name={adjustMode ? 'x' : 'sliders'} size={13} color={adjustMode ? '#fff' : Colors.primary} />
                            <Text style={[s.autoBtnText, adjustMode && { color: '#fff' }]}>
                                {adjustMode ? 'Cancel Adjust' : 'Adjust'}
                            </Text>
                        </View>
                    </TouchableOpacity>
                )}
                {transactions.length >= 5 && (
                    <TouchableOpacity style={s.autoBtn} onPress={openAutoGen}>
                        <View style={s.btnIconRow}>
                            <Icon name="cpu" size={13} color={Colors.primary} />
                            <Text style={s.autoBtnText}>Auto</Text>
                        </View>
                    </TouchableOpacity>
                )}
                <TouchableOpacity style={s.addBtn} onPress={openAdd}>
                    <Text style={s.addBtnText}>+ Add</Text>
                </TouchableOpacity>
            </View>

            <ScrollView ref={scrollRef} style={s.scroll} contentContainerStyle={s.pad}>
                {budgetPeriodLapsed && (
                    <TouchableOpacity style={s.lapsedBanner} onPress={openAutoGen} activeOpacity={0.8}>
                        <Icon name="calendar" size={16} color={Colors.warning} />
                        <View style={{ flex: 1 }}>
                            <Text style={s.lapsedBannerTitle}>No budget set for {monthLabel}</Text>
                            <Text style={s.lapsedBannerText}>
                                You've budgeted before, but nothing's active this month — overspending won't be tracked. Tap to auto-generate, or edit a category below to renew it.
                            </Text>
                        </View>
                    </TouchableOpacity>
                )}

                {misalignedGoal && (
                    <TouchableOpacity
                        style={s.goalMisalignBanner}
                        onPress={() => navigate('goals', { goalId: misalignedGoal.goal.id, planTab: 'alignment' })}
                        activeOpacity={0.8}
                    >
                        <Icon name="git-merge" size={16} color={Colors.expense} />
                        <View style={{ flex: 1 }}>
                            <Text style={s.goalMisalignBannerTitle}>Budget doesn't yet support "{misalignedGoal.goal.title}"</Text>
                            <Text style={s.goalMisalignBannerText}>{misalignedGoal.alignment.message}</Text>
                        </View>
                    </TouchableOpacity>
                )}

                {/* Month summary */}
                <View style={s.summaryCard}>
                    <Text style={s.summaryMonth}>{monthLabel}</Text>
                    <View style={s.summaryRow}>
                        <View style={s.summaryBox}>
                            <Text style={s.summaryLabel}>Budgeted</Text>
                            <Text style={[s.summaryVal, { color: Colors.primary }]}>{currency}{displayTotalBudgeted.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                        </View>
                        <View style={s.summaryDivider} />
                        <View style={s.summaryBox}>
                            <Text style={s.summaryLabel}>Actual</Text>
                            <Text style={[s.summaryVal, { color: Colors.expense }]}>{currency}{displayTotalActual.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                        </View>
                        <View style={s.summaryDivider} />
                        <View style={s.summaryBox}>
                            <Text style={s.summaryLabel}>Variance</Text>
                            <Text style={[s.summaryVal, { color: displayTotalVariance >= 0 ? Colors.income : Colors.expense }]}>
                                {displayTotalVariance >= 0 ? '+' : ''}{currency}{displayTotalVariance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </Text>
                        </View>
                    </View>
                    {!hasManualLoanBudget && loanBurden > 0 && (
                        <Text style={s.loanIncludedNote}>Includes {currency}{Math.round(loanBurden).toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo in loan repayments</Text>
                    )}
                    {displayOverCount > 0 && (
                        <View style={s.overAlertRow}>
                            <Icon name="alert-triangle" size={13} color={Colors.expense} />
                            <Text style={s.overAlert}>{displayOverCount} categor{displayOverCount > 1 ? 'ies' : 'y'} over budget by {currency}{displayOverAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })} combined</Text>
                        </View>
                    )}
                </View>

                {/* Budget Strategy — revenue, cash, and profit impact of the plan.
                    Show whenever there's something meaningful to assess: a budget,
                    an active loan (so its repayment burden is visible), or revenue. */}
                {(budgets.length > 0 || loanBurden > 0 || monthlyRevenue > 0) && (() => {
                    const dCommitments = adjustMode ? adjustedTotalCommitments : totalCommitments;
                    const dProfit      = adjustMode ? adjustedProjectedProfit  : projectedProfit;
                    const dOverRevenue = adjustMode ? adjustedOverRevenue      : overRevenue;
                    const dOverSafeCap = adjustMode ? adjustedOverSafeCap      : overSafeCap;
                    const dBudgeted    = adjustMode ? adjustedTotalBudgeted    : totalBudgeted;
                    // Real current profit (not revenue) — computeProfitCashImpact's severity
                    // check reads "monthlyDelta as a % of currentProfit", so feeding it revenue
                    // here (as this card used to) silently checked "% of revenue" instead,
                    // which flags almost any real budget as "caution" even at a healthy margin,
                    // contradicting the "Healthy plan" verdict shown right above it. Deriving the
                    // delta as dProfit - actualCurrentProfit keeps the displayed projected-profit
                    // figure identical to dProfit above while fixing the severity math.
                    const actualCurrentProfit = finance?.profit ?? 0;
                    return (
                    <View style={s.strategyCard}>
                        <View style={s.strategyHeaderRow}>
                            <View style={s.titleIconRow}>
                                <Icon name="bar-chart-2" size={14} color={Colors.textPrimary} />
                                <Text style={s.strategyTitle}>Budget Strategy</Text>
                            </View>
                            {budgets.length > 0 && !adjustMode && (
                                <TouchableOpacity onPress={openAdjustMode}>
                                    <View style={s.btnIconRow}>
                                        <Icon name="sliders" size={12} color={Colors.primary} />
                                        <Text style={s.adjustToggle}>Adjust & Simulate</Text>
                                    </View>
                                </TouchableOpacity>
                            )}
                        </View>

                        <View style={s.strategyRow}>
                            <Text style={s.strategyLabel}>Monthly revenue</Text>
                            <Text style={s.strategyVal}>{currency}{monthlyRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                        </View>
                        <View style={s.strategyRow}>
                            <Text style={s.strategyLabel}>Cash balance</Text>
                            <Text style={[s.strategyVal, { color: cashBalance < 0 ? Colors.expense : Colors.textPrimary }]}>{currency}{cashBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                        </View>

                        {adjustMode ? (
                            <View style={s.adjustList}>
                                {budgets.map(b => (
                                    <View key={b.id} style={s.adjustRow}>
                                        <Text style={s.adjustCat} numberOfLines={1}>{b.category}</Text>
                                        <View style={s.adjustInputWrap}>
                                            <Text style={s.adjustCurrency}>{currency}</Text>
                                            <TextInput
                                                style={s.adjustInput}
                                                value={adjustedAmounts[b.id] ?? String(b.monthlyAmount)}
                                                onChangeText={v => setAdjustedAmounts(prev => ({ ...prev, [b.id]: v }))}
                                                keyboardType="decimal-pad"
                                            />
                                        </View>
                                    </View>
                                ))}
                            </View>
                        ) : (
                            <View style={s.strategyRow}>
                                <Text style={s.strategyLabel}>Total planned spend</Text>
                                <Text style={s.strategyVal}>{currency}{dBudgeted.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                            </View>
                        )}

                        {loanBurden > 0 && (
                            <>
                                <View style={s.strategyRow}>
                                    <Text style={s.strategyLabel}>+ Loan repayments (monthly)</Text>
                                    <Text style={[s.strategyVal, { color: Colors.expense }]}>{currency}{loanBurden.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                                </View>
                                <View style={s.strategyRow}>
                                    <Text style={[s.strategyLabel, { fontWeight: '700', color: Colors.textPrimary }]}>= Total monthly commitments</Text>
                                    <Text style={[s.strategyVal, { fontWeight: '700' }]}>{currency}{dCommitments.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                                </View>
                            </>
                        )}
                        <View style={[s.strategyRow, { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 8, marginTop: 4 }]}>
                            <Text style={[s.strategyLabel, { fontWeight: '700', color: Colors.textPrimary }]}>Projected profit after spend{loanBurden > 0 ? ' & loans' : ''}</Text>
                            <Text style={[s.strategyVal, { color: dProfit >= 0 ? Colors.income : Colors.expense, fontWeight: '800' }]}>
                                {currency}{dProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </Text>
                        </View>

                        <View style={[s.strategyVerdict, { backgroundColor: (dOverRevenue ? Colors.expense : dOverSafeCap ? Colors.warning : Colors.income) + '18', borderColor: dOverRevenue ? Colors.expense : dOverSafeCap ? Colors.warning : Colors.income }]}>
                            <Icon name={dOverRevenue || dOverSafeCap ? 'alert-triangle' : 'check-circle'} size={14} color={dOverRevenue ? Colors.expense : dOverSafeCap ? Colors.warning : Colors.income} />
                            <Text style={[s.strategyVerdictText, { color: dOverRevenue ? Colors.expense : dOverSafeCap ? Colors.warning : Colors.income }]}>
                                {dOverRevenue
                                    ? `Your monthly commitments (${currency}${dCommitments.toLocaleString(undefined, { maximumFractionDigits: 0 })}${loanBurden > 0 ? ', incl. loan repayments' : ''}) exceed monthly revenue — this plans a ${currency}${Math.abs(dProfit).toLocaleString(undefined, { maximumFractionDigits: 0 })} loss and will draw down cash. Cut about ${currency}${(dCommitments - safeCap).toLocaleString(undefined, { maximumFractionDigits: 0 })} to protect profit.`
                                    : dOverSafeCap
                                        ? `Commitments are within revenue but above the safe cap (${currency}${safeCap.toLocaleString(undefined, { maximumFractionDigits: 0 })}, 80% of revenue). Leaves a thin ${currency}${dProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })} profit buffer.`
                                        : `Healthy plan: keeps ${currency}${dProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })} profit (${monthlyRevenue > 0 ? ((dProfit / monthlyRevenue) * 100).toFixed(0) : 0}% margin). Recommended max spend: ${currency}${safeCap.toLocaleString(undefined, { maximumFractionDigits: 0 })}.`}
                            </Text>
                        </View>

                        {adjustMode ? (
                            <>
                                <ProfitCashImpactCard
                                    impact={computeProfitCashImpact(actualCurrentProfit, cashBalance, dProfit - actualCurrentProfit)}
                                    source="budget"
                                    currency={currency}
                                    onSeeFullPicture={() => navigate('business-passport')}
                                />
                                <View style={s.adjustBtnRow}>
                                    <TouchableOpacity style={s.adjustCancelBtn} onPress={cancelAdjustMode}>
                                        <Text style={s.adjustCancelText}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={s.adjustApplyBtn} onPress={applyAdjustments}>
                                        <Text style={s.adjustApplyText}>Apply Changes</Text>
                                    </TouchableOpacity>
                                </View>
                            </>
                        ) : (
                            <>
                                {budgets.length > 0 && (
                                    <NextStepLink text="See how this budget affects your 13-week cash forecast" onPress={() => navigate('cashflow')} />
                                )}
                                <NextStepLink text="Model revenue/cost growth scenarios instead" onPress={() => navigate('reports', { reportSection: 'growth', reportTab: 'growth' })} />
                                {budgets.length > 0 && (
                                    <ProfitCashImpactCard
                                        impact={computeProfitCashImpact(actualCurrentProfit, cashBalance, dProfit - actualCurrentProfit)}
                                        source="budget"
                                        currency={currency}
                                        onSeeFullPicture={() => navigate('business-passport')}
                                    />
                                )}
                            </>
                        )}
                    </View>
                    );
                })()}

                {/* Concrete reduction tactics for your biggest expense categories */}
                {expenseTactics.length > 0 && (
                    <View style={s.strategyCard}>
                        <View style={s.titleIconRow}>
                            <Icon name="scissors" size={14} color={Colors.textPrimary} />
                            <Text style={s.strategyTitle}>Cost Reduction Tactics</Text>
                        </View>
                        {expenseTactics.map((tac) => (
                            <View key={tac.id} style={s.tacticRow}>
                                <Text style={s.tacticTitle}>{tac.title}</Text>
                                <Text style={s.tacticRationale}>{tac.rationale}</Text>
                                <View style={s.tacticMetaRow}>
                                    <Text style={[s.tacticMeta, { color: Colors.income, fontWeight: '700' }]}>
                                        Save ~{currency}{Math.round(tac.expectedImpact).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    </Text>
                                    <View style={s.tacticMetaIconRow}>
                                        <Icon name="clock" size={10} color={Colors.textMuted} />
                                        <Text style={s.tacticMeta}>{tac.timeframe}</Text>
                                    </View>
                                    <View style={s.tacticMetaIconRow}>
                                        <Icon name="check" size={10} color={Colors.textMuted} />
                                        <Text style={s.tacticMeta}>{(tac.successProbability * 100).toFixed(0)}% likely</Text>
                                    </View>
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {/* Budget Intelligence -- Revenue vs. target, Net Cash Flow,
                    a synthesized narrative, and a WHY explanation per
                    over-budget category. Doesn't replace the per-category
                    table below (still the place to edit a budget); this is
                    the "don't stop at the table" layer on top of it. */}
                {budgetIntel.available && (
                    <View style={s.summaryCard}>
                        <View style={s.sheetTitleRow}>
                            <Icon name="zap" size={16} color={Colors.textPrimary} />
                            <Text style={[s.sheetTitle, { marginBottom: 0 }]}>Budget Intelligence</Text>
                        </View>
                        <Text style={s.intelNarrative}>{budgetIntel.narrative}</Text>

                        {budgetIntel.revenueLine && (
                            <View style={[s.intelRow, { borderLeftColor: FAVORABILITY_COLOR[budgetIntel.revenueLine.favorability] }]}>
                                <Text style={s.intelRowLabel}>Revenue</Text>
                                <Text style={s.intelRowVal}>
                                    {currency}{Math.round(budgetIntel.revenueLine.actual).toLocaleString()} vs {currency}{Math.round(budgetIntel.revenueLine.budgeted).toLocaleString()} target
                                    {' '}({budgetIntel.revenueLine.variancePct >= 0 ? '+' : ''}{budgetIntel.revenueLine.variancePct.toFixed(0)}%)
                                </Text>
                            </View>
                        )}
                        {budgetIntel.netCashFlowLine && (
                            <View style={[s.intelRow, { borderLeftColor: FAVORABILITY_COLOR[budgetIntel.netCashFlowLine.favorability] }]}>
                                <Text style={s.intelRowLabel}>Net Cash Flow</Text>
                                <Text style={s.intelRowVal}>
                                    {currency}{Math.round(budgetIntel.netCashFlowLine.actual).toLocaleString()} vs {currency}{Math.round(budgetIntel.netCashFlowLine.budgeted).toLocaleString()} planned
                                </Text>
                            </View>
                        )}

                        {budgetIntel.explanations.length > 0 && (
                            <View style={{ marginTop: Spacing.sm }}>
                                <Text style={s.intelWhyLabel}>Why?</Text>
                                {budgetIntel.explanations.map((ex, i) => (
                                    <Text key={i} style={[s.intelWhyText, { color: ex.verdict === 'review-needed' ? Colors.expense : Colors.textSecondary }]}>
                                        {ex.message}
                                    </Text>
                                ))}
                            </View>
                        )}

                        {smartRevenue.available && (
                            <Text style={s.intelFootnote}>
                                Revenue target is Quad360's suggested base case ({currency}{Math.round(smartRevenue.scenarios.base).toLocaleString()}/mo) — not yet something you've set yourself.
                            </Text>
                        )}
                    </View>
                )}

                {/* Budget vs actual table */}
                {budgets.length === 0 && displayBva.length === 0 ? (
                    <View style={s.emptyState}>
                        <Text style={s.emptyTitle}>No budgets yet</Text>
                        <Text style={s.emptySub}>
                            {transactions.length >= 5
                                ? 'Auto-generate a budget from your spending history, or add one manually'
                                : 'Tap "+ Add" to set monthly spending targets per category'}
                        </Text>
                        {transactions.length >= 5 && (
                            <TouchableOpacity style={s.emptyBtn} onPress={openAutoGen}>
                                <View style={s.btnIconRow}>
                                    <Icon name="cpu" size={14} color="#fff" />
                                    <Text style={s.emptyBtnText}>Auto-Generate Budget</Text>
                                </View>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity style={[s.emptyBtn, transactions.length >= 5 && s.emptyBtnSecondary]} onPress={openAdd}>
                            <Text style={[s.emptyBtnText, transactions.length >= 5 && s.emptyBtnTextSecondary]}>Add Manually</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <>
                        {/* Table header */}
                        <View style={s.tableHeader}>
                            <Text style={[s.th, { flex: 2 }]}>Category</Text>
                            <Text style={s.th}>Budget</Text>
                            <Text style={s.th}>Actual</Text>
                            <Text style={s.th}>vs Budget</Text>
                        </View>

                        {displayBva.map((row, i) => {
                            const budget = budgets.find(b => b.category === row.category);
                            // Show the % over/under from the spender's point of view
                            // (spent more than planned = positive/red "over"), not the
                            // raw budget-remaining variance, which showed confusing
                            // signs like "-100%" for a category that was 100% overspent.
                            const overUnderPct = -row.variancePct;
                            return (
                                <TouchableOpacity key={i} style={[s.tableRow, row.status === 'over' && s.overRow]} onPress={() => budget && openEdit(budget)}>
                                    <View style={[s.statusDot, { backgroundColor: statusColor(row.status) }]} />
                                    <Text style={[s.td, { flex: 2, color: Colors.textPrimary, fontWeight: '600' }]} numberOfLines={1}>{row.category}</Text>
                                    <Text style={[s.td, { color: Colors.textSecondary }]}>{currency}{row.budgeted.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                                    <Text style={[s.td, { color: row.status === 'over' ? Colors.expense : Colors.textSecondary }]}>{currency}{row.actual.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                                    <Text style={[s.td, { color: statusColor(row.status), fontWeight: '700' }]}>
                                        {overUnderPct >= 0 ? '+' : ''}{overUnderPct.toFixed(0)}% {row.status === 'over' ? 'over' : row.status === 'under' ? 'under' : ''}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}

                        {/* Show budgets with no transactions */}
                        {budgets
                            .filter(b => !displayBva.find(r => r.category === b.category))
                            .map((b, i) => (
                                <TouchableOpacity key={`no-tx-${i}`} style={s.tableRow} onPress={() => openEdit(b)}>
                                    <View style={[s.statusDot, { backgroundColor: Colors.textMuted }]} />
                                    <Text style={[s.td, { flex: 2, color: Colors.textPrimary, fontWeight: '600' }]} numberOfLines={1}>{b.category}</Text>
                                    <Text style={[s.td, { color: Colors.textSecondary }]}>{currency}{b.monthlyAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                                    <Text style={[s.td, { color: Colors.textMuted, fontSize: 10 }]}>No spending yet</Text>
                                    <Text style={[s.td, { color: Colors.textMuted, fontWeight: '700' }]}>-</Text>
                                </TouchableOpacity>
                            ))
                        }
                    </>
                )}

                {/* Over-budget callout — kept short: the full profit/cash effect
                    of the budget as a whole is already shown once above in
                    Budget Strategy, so repeating that same full card per
                    category just duplicated the same numbers over and over.
                    Each callout here only adds what's specific to it: how
                    much this one category overspent, and by how much. */}
                {displayBva.filter(r => r.status === 'over').map((r, i) => {
                    const overage = r.actual - r.budgeted;
                    return (
                        <View key={i} style={s.overCard}>
                            <Text style={s.overCardTitle}>Over Budget: {r.category}</Text>
                            <Text style={s.overCardText}>
                                Spent {currency}{r.actual.toLocaleString(undefined, { maximumFractionDigits: 0 })} vs {currency}{r.budgeted.toLocaleString(undefined, { maximumFractionDigits: 0 })} budget
                                {' '}({Math.abs(r.variancePct).toFixed(0)}% over) — {currency}{Math.round(overage).toLocaleString(undefined, { maximumFractionDigits: 0 })} extra coming out of profit.
                            </Text>
                        </View>
                    );
                })}
            </ScrollView>

            {/* Add/Edit modal */}
            <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}>
                <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowForm(false)} />
                <View style={[s.sheet, constrainSheetWidth && s.sheetWide]}>
                    <View style={s.sheetHandle} />
                    <Text style={s.sheetTitle}>{editingId ? 'Edit Budget' : 'Add Budget'}</Text>

                    {/* Category picker */}
                    <TouchableOpacity style={s.catSelector} onPress={() => setShowCatPick(v => !v)}>
                        <Text style={[s.catSelectorText, !category && { color: Colors.textMuted }]}>
                            {category || 'Select category...'}
                        </Text>
                        <Icon name={showCatPick ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.textMuted} />
                    </TouchableOpacity>
                    {showCatPick && (
                        <ScrollView style={s.catList} nestedScrollEnabled>
                            {EXPENSE_CATEGORIES.map(cat => (
                                <TouchableOpacity key={cat} style={[s.catOption, category === cat && s.catOptionActive]} onPress={() => { setCategory(cat); setCustomCat(''); setShowCatPick(false); }}>
                                    <Text style={[s.catOptionText, category === cat && s.catOptionTextActive]}>{cat}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    )}
                    <TextInput
                        style={s.input}
                        placeholder="Or type custom category..."
                        placeholderTextColor={Colors.textMuted}
                        value={customCat}
                        onChangeText={v => { setCustomCat(v); setCategory(''); }}
                    />
                    <TextInput
                        style={s.input}
                        placeholder={`Monthly budget amount (${currency})`}
                        placeholderTextColor={Colors.textMuted}
                        keyboardType="decimal-pad"
                        value={amount}
                        onChangeText={setAmount}
                    />

                    {/* Suggest a budget from this category's past average spend */}
                    {pastSuggestion > 0 && (
                        <TouchableOpacity
                            style={s.suggestChip}
                            onPress={() => setAmount(String(Math.round(pastSuggestion)))}
                        >
                            <View style={[s.btnIconRow, { alignItems: 'flex-start' }]}>
                                <Icon name="zap" size={12} color={Colors.primary} />
                                <Text style={[s.suggestChipText, { flex: 1 }]}>
                                    You spent ~{currency}{Math.round(pastSuggestion).toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo here on average — tap to use
                                </Text>
                            </View>
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
                        <Text style={s.saveBtnText}>{editingId ? 'Save Changes' : 'Add Budget'}</Text>
                    </TouchableOpacity>

                    {editingId && (
                        <TouchableOpacity style={s.deleteBtn} onPress={() => {
                            const b = budgets.find(b => b.id === editingId);
                            if (b) { setShowForm(false); setTimeout(() => handleDelete(b.id, b.category), 300); }
                        }}>
                            <Text style={s.deleteBtnText}>Delete Budget</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </Modal>

            {/* Auto-generate review modal */}
            <Modal visible={showAutoGen} transparent animationType="slide" onRequestClose={() => setShowAutoGen(false)}>
                <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowAutoGen(false)} />
                <View style={[s.sheet, constrainSheetWidth && s.sheetWide]}>
                    <View style={s.sheetHandle} />
                    <View style={s.sheetTitleRow}>
                        <Icon name="cpu" size={16} color={Colors.textPrimary} />
                        <Text style={[s.sheetTitle, { marginBottom: 0 }]}>Auto-Generated Budget</Text>
                    </View>
                    <Text style={s.autoGenSub}>
                        Based on your last 3 months of spending, sized against{' '}
                        {currency}{Math.round(autoBudget.projectedRevenue).toLocaleString(undefined, { maximumFractionDigits: 0 })} projected revenue next month
                        {autoBudget.loanBurden > 0 ? ` (after ${currency}${Math.round(autoBudget.loanBurden).toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo loan repayments)` : ''}.
                    </Text>

                    {/* Smart Budget Builder's revenue half -- "don't ask the
                        owner what revenue to expect, suggest a realistic
                        starting point instead" (smartBudget.ts). Informational
                        here, not yet wired to re-scale the expense suggestions
                        below against a chosen scenario. */}
                    {smartRevenue.available && (
                        <View style={s.revenueScenarioBox}>
                            <Text style={s.revenueScenarioTitle}>{smartRevenue.recommendationLabel}</Text>
                            <View style={s.revenueScenarioRow}>
                                <View style={s.revenueScenarioCell}>
                                    <Text style={s.revenueScenarioLabel}>Conservative</Text>
                                    <Text style={s.revenueScenarioVal}>{currency}{Math.round(smartRevenue.scenarios.conservative).toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                                </View>
                                <View style={[s.revenueScenarioCell, s.revenueScenarioCellBase]}>
                                    <Text style={s.revenueScenarioLabel}>Base</Text>
                                    <Text style={[s.revenueScenarioVal, { color: Colors.primary }]}>{currency}{Math.round(smartRevenue.scenarios.base).toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                                </View>
                                <View style={s.revenueScenarioCell}>
                                    <Text style={s.revenueScenarioLabel}>Growth</Text>
                                    <Text style={s.revenueScenarioVal}>{currency}{Math.round(smartRevenue.scenarios.growth).toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                                </View>
                            </View>
                            <Text style={s.revenueScenarioFootnote}>
                                Based on your last {smartRevenue.windowMonths} month{smartRevenue.windowMonths !== 1 ? 's' : ''} (revenue {smartRevenue.volatility}
                                {smartRevenue.growthTrendPct !== null ? `, trending ${smartRevenue.growthTrendPct >= 0 ? '+' : ''}${smartRevenue.growthTrendPct.toFixed(0)}%` : ''}).
                            </Text>
                        </View>
                    )}

                    {autoBudget.scaled && (
                        <View style={s.autoGenScaledNote}>
                            <Icon name="alert-triangle" size={14} color={Colors.warning} />
                            <Text style={s.autoGenScaledNoteText}>
                                Your recent spending ({currency}{Math.round(autoBudget.totalRaw).toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo) is above what your
                                projected revenue can safely support — every category below has been scaled down to fit within
                                {' '}{currency}{Math.round(autoBudget.safeCap).toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo.
                            </Text>
                        </View>
                    )}

                    <ScrollView style={s.autoGenList} nestedScrollEnabled>
                        {autoBudget.suggestions.map(sug => {
                            const excluded = excludedCats.has(sug.category);
                            return (
                                <TouchableOpacity
                                    key={sug.category}
                                    style={[s.autoGenRow, excluded && s.autoGenRowExcluded]}
                                    onPress={() => setExcludedCats(prev => {
                                        const next = new Set(prev);
                                        if (next.has(sug.category)) next.delete(sug.category); else next.add(sug.category);
                                        return next;
                                    })}
                                >
                                    <Icon name={excluded ? 'square' : 'check-square'} size={16} color={excluded ? Colors.textMuted : Colors.primary} />
                                    <Text style={[s.autoGenCat, excluded && s.autoGenTextExcluded]} numberOfLines={1}>{sug.category}</Text>
                                    <View style={{ alignItems: 'flex-end' }}>
                                        <Text style={[s.autoGenAmt, excluded && s.autoGenTextExcluded]}>
                                            {currency}{sug.monthlyAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                        </Text>
                                        {sug.monthlyAmount !== sug.rawAverage && (
                                            <Text style={s.autoGenRaw}>was {currency}{sug.rawAverage.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                                        )}
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    <View style={s.autoGenTotalRow}>
                        <Text style={s.autoGenTotalLabel}>Total budget</Text>
                        <Text style={s.autoGenTotalVal}>
                            {currency}{autoBudget.suggestions.filter(s2 => !excludedCats.has(s2.category)).reduce((sum, s2) => sum + s2.monthlyAmount, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </Text>
                    </View>

                    <TouchableOpacity style={s.saveBtn} onPress={applyAutoBudget}>
                        <Text style={s.saveBtnText}>Apply Budget</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.deleteBtn} onPress={() => setShowAutoGen(false)}>
                        <Text style={[s.deleteBtnText, { color: Colors.textMuted }]}>Cancel</Text>
                    </TouchableOpacity>
                </View>
            </Modal>

            <FooterNav />
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe:         { flex: 1, backgroundColor: Colors.bg },
    scroll:       { flex: 1, backgroundColor: Colors.bg },
    pad:          { padding: Spacing.lg, paddingBottom: 100 },

    lapsedBanner: {
        flexDirection: 'row', gap: 10, alignItems: 'flex-start',
        backgroundColor: Colors.warning + '18', borderWidth: 1, borderColor: Colors.warning,
        borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.lg,
    },
    lapsedBannerTitle: { fontSize: 13.5, fontWeight: '700', color: Colors.textPrimary, marginBottom: 3 },
    lapsedBannerText:  { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },

    goalMisalignBanner: {
        flexDirection: 'row', gap: 10, alignItems: 'flex-start',
        backgroundColor: Colors.expense + '18', borderWidth: 1, borderColor: Colors.expense,
        borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.lg,
    },
    goalMisalignBannerTitle: { fontSize: 13.5, fontWeight: '700', color: Colors.textPrimary, marginBottom: 3 },
    goalMisalignBannerText:  { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },

    // flexWrap is the safety net: back-link + title + up to 3 conditional
    // buttons (Adjust/Cancel Adjust, Auto, + Add) don't all fit one row on
    // a phone-width screen -- confirmed clipping "+ Add" off-screen at
    // 320-375px CSS width with even just 2 of the 3 buttons showing.
    headerRow:    { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, gap: Spacing.md },
    backBtn:      { color: Colors.primary, fontSize: 14 },
    screenTitle:  { flex: 1, fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary },
    addBtn:       { backgroundColor: Colors.primary, borderRadius: Radius.sm, paddingHorizontal: 14, paddingVertical: 7 },
    addBtnText:   { color: '#fff', fontSize: 13, fontWeight: '700' },
    autoBtn:      { backgroundColor: Colors.primary + '18', borderWidth: 1, borderColor: Colors.primary, borderRadius: Radius.sm, paddingHorizontal: Spacing.md, paddingVertical: 6 },
    autoBtnText:  { color: Colors.primary, fontSize: 13, fontWeight: '700' },
    btnIconRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    titleIconRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },

    summaryCard:   { backgroundColor: Colors.surface, borderRadius: 14, padding: Spacing.lg, marginBottom: Spacing.lg, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    summaryMonth:  { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },
    summaryRow:    { flexDirection: 'row', alignItems: 'center' },
    summaryBox:    { flex: 1, alignItems: 'center' },
    summaryLabel:  { fontSize: 10, color: Colors.textMuted, marginBottom: 4 },
    summaryVal:    { fontSize: 18, fontWeight: 'bold' },
    summaryDivider:{ width: 1, backgroundColor: Colors.border, alignSelf: 'stretch', marginHorizontal: Spacing.sm },
    overAlertRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, marginTop: 10 },
    overAlert:     { fontSize: 13, color: Colors.expense, fontWeight: '600', textAlign: 'center' },
    loanIncludedNote: { marginTop: Spacing.sm, fontSize: 11, color: Colors.textMuted, textAlign: 'center' },

    strategyCard:  { backgroundColor: Colors.surface, borderRadius: 14, padding: Spacing.lg, marginBottom: Spacing.lg, borderLeftWidth: 3, borderLeftColor: Colors.primary, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    strategyHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    strategyTitle: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },
    adjustToggle:  { fontSize: 12, color: Colors.primary, fontWeight: '700' },

    adjustList:    { marginVertical: 6, gap: 6 },
    adjustRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
    adjustCat:     { flex: 1, fontSize: 12, color: Colors.textSecondary },
    adjustInputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bg, borderRadius: 6, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 8 },
    adjustCurrency:  { fontSize: 12, color: Colors.textMuted, marginRight: 2 },
    adjustInput:     { width: 90, fontSize: 12, color: Colors.textPrimary, paddingVertical: 6, textAlign: 'right' },

    adjustBtnRow:   { flexDirection: 'row', gap: 10, marginTop: Spacing.md },
    adjustCancelBtn:{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingVertical: Spacing.md, alignItems: 'center' },
    adjustCancelText:{ color: Colors.textSecondary, fontWeight: '700', fontSize: 13 },
    adjustApplyBtn: { flex: 1, backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: Spacing.md, alignItems: 'center' },
    adjustApplyText:{ color: '#fff', fontWeight: '700', fontSize: 13 },
    strategyRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
    strategyLabel: { fontSize: 12, color: Colors.textSecondary },
    strategyVal:   { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
    strategyVerdict:     { marginTop: Spacing.md, borderRadius: Radius.sm, borderWidth: 1, padding: 10, flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
    strategyVerdictText: { flex: 1, fontSize: 11, fontWeight: '600', lineHeight: 16 },
    forecastLink:        { marginTop: 10, paddingVertical: Spacing.sm },
    forecastLinkText:    { fontSize: 12, color: Colors.primary, fontWeight: '700', textAlign: 'center' },

    suggestChip:     { backgroundColor: Colors.primary + '15', borderRadius: Radius.sm, paddingVertical: Spacing.sm, paddingHorizontal: 10, marginTop: Spacing.sm, marginBottom: 4 },
    suggestChipText: { fontSize: 11, color: Colors.primary, fontWeight: '600' },

    tacticRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.border },
    tacticTitle: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, marginBottom: 3 },
    tacticRationale: { fontSize: 11, color: Colors.textSecondary, lineHeight: 16, marginBottom: 6 },
    tacticMetaRow: { flexDirection: 'row', gap: 12 },
    tacticMeta: { fontSize: 10, color: Colors.textMuted, fontWeight: '600' },
    tacticMetaIconRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },

    emptyState:    { alignItems: 'center', paddingVertical: 40 },
    emptyTitle:    { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: Spacing.sm },
    emptySub:      { fontSize: 13, color: Colors.textMuted, textAlign: 'center', marginBottom: 20, lineHeight: 20 },
    emptyBtn:      { backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: Spacing.xxl, paddingVertical: Spacing.md, marginBottom: 10 },
    emptyBtnText:  { color: '#fff', fontWeight: '700', fontSize: 14 },
    emptyBtnSecondary:     { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.border },
    emptyBtnTextSecondary: { color: Colors.textSecondary },

    autoGenSub:        { fontSize: 12, color: Colors.textSecondary, lineHeight: 18, marginBottom: Spacing.md },
    autoGenScaledNote: { backgroundColor: Colors.warning + '18', borderWidth: 1, borderColor: Colors.warning, borderRadius: Radius.sm, padding: 10, marginBottom: Spacing.md, flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
    autoGenScaledNoteText: { flex: 1, fontSize: 11, color: Colors.warning, fontWeight: '600', lineHeight: 16 },
    autoGenList:       { maxHeight: 320, marginBottom: Spacing.md },
    autoGenRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 10 },
    autoGenRowExcluded:{ opacity: 0.45 },
    autoGenCat:        { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
    autoGenAmt:        { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    autoGenRaw:        { fontSize: 10, color: Colors.textMuted },
    autoGenTextExcluded: { color: Colors.textMuted },
    autoGenTotalRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.border, marginBottom: Spacing.md },
    autoGenTotalLabel: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    autoGenTotalVal:   { fontSize: 15, fontWeight: '800', color: Colors.primary },

    tableHeader:   { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingLeft: Spacing.xl },
    th:            { flex: 1, fontSize: 10, color: Colors.textMuted, fontWeight: '700', textAlign: 'right' },

    tableRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: 'rgba(51,65,85,0.4)' },
    overRow:       { backgroundColor: 'rgba(239,68,68,0.06)' },
    statusDot:     { width: 8, height: 8, borderRadius: 4, marginRight: Spacing.sm, marginLeft: Spacing.xs },
    td:            { flex: 1, fontSize: 12, textAlign: 'right', color: Colors.textSecondary },

    overCard:      { backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: Colors.expense, borderRadius: 10, padding: Spacing.md, marginBottom: 10 },
    overCardTitle: { fontSize: 13, fontWeight: '700', color: Colors.expense, marginBottom: 4 },
    overCardText:  { fontSize: 12, color: Colors.textSecondary },

    intelNarrative:  { fontSize: 13, color: Colors.textPrimary, lineHeight: 19, marginBottom: Spacing.md },
    intelRow:        { borderLeftWidth: 3, borderRadius: 8, backgroundColor: Colors.bg, padding: Spacing.sm, marginBottom: Spacing.sm },
    intelRowLabel:   { fontSize: 10.5, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
    intelRowVal:     { fontSize: 12.5, color: Colors.textPrimary, fontWeight: '600' },
    intelWhyLabel:   { fontSize: 11, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
    intelWhyText:    { fontSize: 12, lineHeight: 17, marginBottom: 6 },
    intelFootnote:   { fontSize: 10.5, color: Colors.textMuted, fontStyle: 'italic', marginTop: 4 },

    revenueScenarioBox:       { backgroundColor: Colors.bg, borderRadius: 10, padding: Spacing.md, marginBottom: Spacing.md },
    revenueScenarioTitle:     { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
    revenueScenarioRow:       { flexDirection: 'row', gap: Spacing.sm },
    revenueScenarioCell:      { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm, borderRadius: 8, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
    revenueScenarioCellBase:  { borderColor: Colors.primary },
    revenueScenarioLabel:     { fontSize: 10, color: Colors.textMuted, fontWeight: '700', textTransform: 'uppercase', marginBottom: 2 },
    revenueScenarioVal:       { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    revenueScenarioFootnote:  { fontSize: 10.5, color: Colors.textMuted, marginTop: Spacing.sm },

    overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet:        { backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.xl, paddingBottom: Spacing.huge, ...Shadow.md },
    sheetWide:    { maxWidth: 560, width: '100%', alignSelf: 'center' },
    sheetHandle:  { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.lg },
    sheetTitle:   { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.lg },
    sheetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.lg },

    catSelector:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.bg, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: 10 },
    catSelectorText: { fontSize: 14, color: Colors.textPrimary },
    catList:       { maxHeight: 180, backgroundColor: Colors.bg, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, marginBottom: 10 },
    catOption:     { padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
    catOptionActive: { backgroundColor: 'rgba(37,99,235,0.15)' },
    catOptionText: { fontSize: 14, color: Colors.textSecondary },
    catOptionTextActive: { color: Colors.primary, fontWeight: '700' },

    input:        { backgroundColor: Colors.bg, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, color: Colors.textPrimary, marginBottom: Spacing.md, fontSize: 14 },
    saveBtn:      { backgroundColor: Colors.primary, borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 10 },
    saveBtnText:  { color: '#fff', fontWeight: '700', fontSize: 15 },
    deleteBtn:    { borderRadius: 10, padding: Spacing.md, alignItems: 'center' },
    deleteBtnText:{ color: Colors.expense, fontWeight: '600', fontSize: 14 },
});
