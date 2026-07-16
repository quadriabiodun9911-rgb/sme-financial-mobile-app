import React, { useState, useMemo } from 'react';
import {
    SafeAreaView, ScrollView, View, Text,
    TouchableOpacity, StyleSheet, TextInput, Modal, Alert, Platform,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { computeBudgetVsActual } from '../utils/finance';
import { totalMonthlyLoanBurden } from '../utils/loanMath';
import { performFinancialDiagnosis } from '../utils/financialDiagnosisEngine';
import { generateExpenseReductionActions } from '../utils/actionRecommendationEngine';
import { generateAutoBudget, AutoBudgetSuggestion } from '../utils/budgetEngine';
import NextStepLink from '../components/NextStepLink';
import ProfitCashImpactCard from '../components/ProfitCashImpactCard';
import { computeProfitCashImpact } from '../utils/impactChain';
import { Budget } from '../types';

const EXPENSE_CATEGORIES = [
    'Office & Admin', 'Salaries', 'Marketing', 'Equipment', 'Software',
    'Rent', 'Utilities', 'Transport', 'Insurance', 'Professional Fees',
    'Supplies', 'Maintenance', 'Travel', 'Training', 'Other',
];

export default function BudgetScreen() {
    const { transactions, budgets, addBudget, updateBudget, deleteBudget, settings, navigate, finance, loans, invoices } = useApp();
    const { currency } = settings;

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

    const bva = useMemo(() => computeBudgetVsActual(transactions, budgets, currentMonth), [transactions, budgets, currentMonth]);

    const totalBudgeted = budgets.reduce((s, b) => s + b.monthlyAmount, 0);
    const totalActual   = bva.reduce((s, b) => s + b.actual, 0);
    const totalVariance = totalBudgeted - totalActual;
    const overCount     = bva.filter(b => b.status === 'over').length;

    // Average monthly spend per category from past transactions — used to suggest
    // a realistic budget instead of guessing.
    const pastAvgByCat = useMemo(() => {
        const acc: Record<string, { total: number; months: Set<string> }> = {};
        transactions.filter(t => t.type === 'expense').forEach(t => {
            const cat = (t.category || 'Other');
            const month = (t.date || '').slice(0, 7);
            if (!acc[cat]) acc[cat] = { total: 0, months: new Set() };
            acc[cat].total += t.amount;
            if (month) acc[cat].months.add(month);
        });
        const avg: Record<string, number> = {};
        Object.entries(acc).forEach(([cat, v]) => { avg[cat] = v.total / Math.max(1, v.months.size); });
        return avg;
    }, [transactions]);

    // Budget strategy: how the planned spend sits against revenue, cash & profit.
    const monthlyRevenue = finance?.income ?? 0;
    const cashBalance = finance?.cashBalance ?? 0;
    // Active loan repayments are a real monthly cash commitment on top of the
    // budget, so the plan must account for them.
    const loanBurden = totalMonthlyLoanBurden(loans ?? []);
    // Total monthly cash commitments = planned spend + loan repayments.
    const totalCommitments = totalBudgeted + loanBurden;
    // Projected profit if you spend your full budget and cover loan repayments.
    const projectedProfit = monthlyRevenue - totalCommitments;
    // A safe cap: keep total commitments within revenue (never plan a loss). For
    // a healthy ~20% margin, aim to keep them under 80% of revenue.
    const safeCap = monthlyRevenue * 0.8;
    const overRevenue = totalCommitments > monthlyRevenue;
    const overSafeCap = totalCommitments > safeCap && !overRevenue;
    const pastSuggestion = pastAvgByCat[customCat.trim() || category];

    // Concrete reduction tactics for the categories actually driving spend —
    // reuses the same diagnosis + action engine as the AI Advisor, so budget
    // guidance is specific ("negotiate X vendor, target 15% cut") instead of
    // a generic "you're over budget" flag.
    const expenseTactics = useMemo(() => {
        if (transactions.length < 5) return [];
        const diagnosis = performFinancialDiagnosis(transactions, invoices, finance.cashBalance, finance.expense || 1, settings.currency);
        return generateExpenseReductionActions(diagnosis, diagnosis.metrics, settings.currency).slice(0, 3);
    }, [transactions, invoices, finance.cashBalance, finance.expense, settings.currency]);

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
        if (!cat) { Alert.alert('Error', 'Please select or enter a category.'); return; }
        if (!amt || amt <= 0) { Alert.alert('Error', 'Please enter a valid amount.'); return; }

        if (editingId) {
            updateBudget(editingId, { category: cat, monthlyAmount: amt, period: currentMonth });
        } else {
            // Check duplicate category
            if (budgets.find(b => b.category.toLowerCase() === cat.toLowerCase())) {
                Alert.alert('Duplicate', `A budget for "${cat}" already exists. Edit the existing one.`);
                return;
            }
            addBudget({ id: '', category: cat, monthlyAmount: amt, period: currentMonth });
        }
        setShowForm(false);
    }

    function handleDelete(id: string, cat: string) {
        if (Platform.OS === 'web') {
            if (window.confirm(`Remove budget for "${cat}"?`)) {
                deleteBudget(id);
            }
        } else {
            Alert.alert('Delete Budget', `Remove budget for "${cat}"?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => deleteBudget(id) },
            ]);
        }
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
                {transactions.length >= 5 && (
                    <TouchableOpacity style={s.autoBtn} onPress={openAutoGen}>
                        <Text style={s.autoBtnText}>🤖 Auto</Text>
                    </TouchableOpacity>
                )}
                <TouchableOpacity style={s.addBtn} onPress={openAdd}>
                    <Text style={s.addBtnText}>+ Add</Text>
                </TouchableOpacity>
            </View>

            <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
                {/* Month summary */}
                <View style={s.summaryCard}>
                    <Text style={s.summaryMonth}>{monthLabel}</Text>
                    <View style={s.summaryRow}>
                        <View style={s.summaryBox}>
                            <Text style={s.summaryLabel}>Budgeted</Text>
                            <Text style={[s.summaryVal, { color: Colors.primary }]}>{currency}{totalBudgeted.toLocaleString()}</Text>
                        </View>
                        <View style={s.summaryDivider} />
                        <View style={s.summaryBox}>
                            <Text style={s.summaryLabel}>Actual</Text>
                            <Text style={[s.summaryVal, { color: Colors.expense }]}>{currency}{totalActual.toLocaleString()}</Text>
                        </View>
                        <View style={s.summaryDivider} />
                        <View style={s.summaryBox}>
                            <Text style={s.summaryLabel}>Variance</Text>
                            <Text style={[s.summaryVal, { color: totalVariance >= 0 ? Colors.income : Colors.expense }]}>
                                {totalVariance >= 0 ? '+' : ''}{currency}{totalVariance.toLocaleString()}
                            </Text>
                        </View>
                    </View>
                    {overCount > 0 && (
                        <Text style={s.overAlert}>⚠ {overCount} categor{overCount > 1 ? 'ies' : 'y'} over budget</Text>
                    )}
                </View>

                {/* Budget Strategy — revenue, cash, and profit impact of the plan.
                    Show whenever there's something meaningful to assess: a budget,
                    an active loan (so its repayment burden is visible), or revenue. */}
                {(budgets.length > 0 || loanBurden > 0 || monthlyRevenue > 0) && (
                    <View style={s.strategyCard}>
                        <Text style={s.strategyTitle}>📊 Budget Strategy</Text>
                        <View style={s.strategyRow}>
                            <Text style={s.strategyLabel}>Monthly revenue</Text>
                            <Text style={s.strategyVal}>{currency}{monthlyRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                        </View>
                        <View style={s.strategyRow}>
                            <Text style={s.strategyLabel}>Cash balance</Text>
                            <Text style={[s.strategyVal, { color: cashBalance < 0 ? Colors.expense : Colors.textPrimary }]}>{currency}{cashBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                        </View>
                        <View style={s.strategyRow}>
                            <Text style={s.strategyLabel}>Total planned spend</Text>
                            <Text style={s.strategyVal}>{currency}{totalBudgeted.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                        </View>
                        {loanBurden > 0 && (
                            <>
                                <View style={s.strategyRow}>
                                    <Text style={s.strategyLabel}>+ Loan repayments (monthly)</Text>
                                    <Text style={[s.strategyVal, { color: Colors.expense }]}>{currency}{loanBurden.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                                </View>
                                <View style={s.strategyRow}>
                                    <Text style={[s.strategyLabel, { fontWeight: '700', color: Colors.textPrimary }]}>= Total monthly commitments</Text>
                                    <Text style={[s.strategyVal, { fontWeight: '700' }]}>{currency}{totalCommitments.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                                </View>
                            </>
                        )}
                        <View style={[s.strategyRow, { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 8, marginTop: 4 }]}>
                            <Text style={[s.strategyLabel, { fontWeight: '700', color: Colors.textPrimary }]}>Projected profit after spend{loanBurden > 0 ? ' & loans' : ''}</Text>
                            <Text style={[s.strategyVal, { color: projectedProfit >= 0 ? Colors.income : Colors.expense, fontWeight: '800' }]}>
                                {currency}{projectedProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </Text>
                        </View>

                        <View style={[s.strategyVerdict, { backgroundColor: (overRevenue ? Colors.expense : overSafeCap ? Colors.warning : Colors.income) + '18', borderColor: overRevenue ? Colors.expense : overSafeCap ? Colors.warning : Colors.income }]}>
                            <Text style={[s.strategyVerdictText, { color: overRevenue ? Colors.expense : overSafeCap ? Colors.warning : Colors.income }]}>
                                {overRevenue
                                    ? `⚠ Your monthly commitments (${currency}${totalCommitments.toLocaleString(undefined, { maximumFractionDigits: 0 })}${loanBurden > 0 ? ', incl. loan repayments' : ''}) exceed monthly revenue — this plans a ${currency}${Math.abs(projectedProfit).toLocaleString(undefined, { maximumFractionDigits: 0 })} loss and will draw down cash. Cut about ${currency}${(totalCommitments - safeCap).toLocaleString(undefined, { maximumFractionDigits: 0 })} to protect profit.`
                                    : overSafeCap
                                        ? `⚠ Commitments are within revenue but above the safe cap (${currency}${safeCap.toLocaleString(undefined, { maximumFractionDigits: 0 })}, 80% of revenue). Leaves a thin ${currency}${projectedProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })} profit buffer.`
                                        : `✓ Healthy plan: keeps ${currency}${projectedProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })} profit (${monthlyRevenue > 0 ? ((projectedProfit / monthlyRevenue) * 100).toFixed(0) : 0}% margin). Recommended max spend: ${currency}${safeCap.toLocaleString(undefined, { maximumFractionDigits: 0 })}.`}
                            </Text>
                        </View>

                        {budgets.length > 0 && (
                            <NextStepLink text="See how this budget affects your 13-week cash forecast" onPress={() => navigate('cashflow')} />
                        )}

                        {budgets.length > 0 && (
                            <ProfitCashImpactCard
                                impact={computeProfitCashImpact(monthlyRevenue, cashBalance, -totalCommitments)}
                                source="budget"
                                currency={currency}
                                onSeeFullPicture={() => navigate('clarity')}
                            />
                        )}
                    </View>
                )}

                {/* Concrete reduction tactics for your biggest expense categories */}
                {expenseTactics.length > 0 && (
                    <View style={s.strategyCard}>
                        <Text style={s.strategyTitle}>✂️ Cost Reduction Tactics</Text>
                        {expenseTactics.map((tac) => (
                            <View key={tac.id} style={s.tacticRow}>
                                <Text style={s.tacticTitle}>{tac.title}</Text>
                                <Text style={s.tacticRationale}>{tac.rationale}</Text>
                                <View style={s.tacticMetaRow}>
                                    <Text style={[s.tacticMeta, { color: Colors.income, fontWeight: '700' }]}>
                                        Save ~{currency}{Math.round(tac.expectedImpact).toLocaleString()}
                                    </Text>
                                    <Text style={s.tacticMeta}>⏱ {tac.timeframe}</Text>
                                    <Text style={s.tacticMeta}>✓ {(tac.successProbability * 100).toFixed(0)}% likely</Text>
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {/* Budget vs actual table */}
                {budgets.length === 0 ? (
                    <View style={s.emptyState}>
                        <Text style={s.emptyTitle}>No budgets yet</Text>
                        <Text style={s.emptySub}>
                            {transactions.length >= 5
                                ? 'Auto-generate a budget from your spending history, or add one manually'
                                : 'Tap "+ Add" to set monthly spending targets per category'}
                        </Text>
                        {transactions.length >= 5 && (
                            <TouchableOpacity style={s.emptyBtn} onPress={openAutoGen}>
                                <Text style={s.emptyBtnText}>🤖 Auto-Generate Budget</Text>
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
                            <Text style={s.th}>Var %</Text>
                        </View>

                        {bva.map((row, i) => {
                            const budget = budgets.find(b => b.category === row.category);
                            return (
                                <TouchableOpacity key={i} style={[s.tableRow, row.status === 'over' && s.overRow]} onPress={() => budget && openEdit(budget)}>
                                    <View style={[s.statusDot, { backgroundColor: statusColor(row.status) }]} />
                                    <Text style={[s.td, { flex: 2, color: Colors.textPrimary, fontWeight: '600' }]} numberOfLines={1}>{row.category}</Text>
                                    <Text style={[s.td, { color: Colors.textSecondary }]}>{currency}{row.budgeted.toLocaleString()}</Text>
                                    <Text style={[s.td, { color: row.status === 'over' ? Colors.expense : Colors.textSecondary }]}>{currency}{row.actual.toLocaleString()}</Text>
                                    <Text style={[s.td, { color: statusColor(row.status), fontWeight: '700' }]}>
                                        {row.variancePct >= 0 ? '+' : ''}{row.variancePct.toFixed(0)}%
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}

                        {/* Show budgets with no transactions */}
                        {budgets
                            .filter(b => !bva.find(r => r.category === b.category))
                            .map((b, i) => (
                                <TouchableOpacity key={`no-tx-${i}`} style={s.tableRow} onPress={() => openEdit(b)}>
                                    <View style={[s.statusDot, { backgroundColor: Colors.textMuted }]} />
                                    <Text style={[s.td, { flex: 2, color: Colors.textPrimary, fontWeight: '600' }]} numberOfLines={1}>{b.category}</Text>
                                    <Text style={[s.td, { color: Colors.textSecondary }]}>{currency}{b.monthlyAmount.toLocaleString()}</Text>
                                    <Text style={[s.td, { color: Colors.textMuted, fontSize: 10 }]}>No spending yet</Text>
                                    <Text style={[s.td, { color: Colors.textMuted, fontWeight: '700' }]}>-</Text>
                                </TouchableOpacity>
                            ))
                        }
                    </>
                )}

                {/* Over-budget callout */}
                {bva.filter(r => r.status === 'over').map((r, i) => (
                    <View key={i} style={s.overCard}>
                        <Text style={s.overCardTitle}>Over Budget: {r.category}</Text>
                        <Text style={s.overCardText}>
                            Spent {currency}{r.actual.toLocaleString()} vs {currency}{r.budgeted.toLocaleString()} budget
                            {' '}({Math.abs(r.variancePct).toFixed(0)}% over)
                        </Text>
                    </View>
                ))}
            </ScrollView>

            {/* Add/Edit modal */}
            <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}>
                <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowForm(false)} />
                <View style={s.sheet}>
                    <View style={s.sheetHandle} />
                    <Text style={s.sheetTitle}>{editingId ? 'Edit Budget' : 'Add Budget'}</Text>

                    {/* Category picker */}
                    <TouchableOpacity style={s.catSelector} onPress={() => setShowCatPick(v => !v)}>
                        <Text style={[s.catSelectorText, !category && { color: Colors.textMuted }]}>
                            {category || 'Select category...'}
                        </Text>
                        <Text style={s.catArrow}>{showCatPick ? '▲' : '▼'}</Text>
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
                            <Text style={s.suggestChipText}>
                                💡 You spent ~{currency}{Math.round(pastSuggestion).toLocaleString()}/mo here on average — tap to use
                            </Text>
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
                <View style={s.sheet}>
                    <View style={s.sheetHandle} />
                    <Text style={s.sheetTitle}>🤖 Auto-Generated Budget</Text>
                    <Text style={s.autoGenSub}>
                        Based on your last 3 months of spending, sized against{' '}
                        {currency}{Math.round(autoBudget.projectedRevenue).toLocaleString()} projected revenue next month
                        {autoBudget.loanBurden > 0 ? ` (after ${currency}${Math.round(autoBudget.loanBurden).toLocaleString()}/mo loan repayments)` : ''}.
                    </Text>

                    {autoBudget.scaled && (
                        <View style={s.autoGenScaledNote}>
                            <Text style={s.autoGenScaledNoteText}>
                                ⚠ Your recent spending ({currency}{Math.round(autoBudget.totalRaw).toLocaleString()}/mo) is above what your
                                projected revenue can safely support — every category below has been scaled down to fit within
                                {' '}{currency}{Math.round(autoBudget.safeCap).toLocaleString()}/mo.
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
                                    <Text style={[s.autoGenCheck, excluded && s.autoGenCheckOff]}>{excluded ? '☐' : '☑'}</Text>
                                    <Text style={[s.autoGenCat, excluded && s.autoGenTextExcluded]} numberOfLines={1}>{sug.category}</Text>
                                    <View style={{ alignItems: 'flex-end' }}>
                                        <Text style={[s.autoGenAmt, excluded && s.autoGenTextExcluded]}>
                                            {currency}{sug.monthlyAmount.toLocaleString()}
                                        </Text>
                                        {sug.monthlyAmount !== sug.rawAverage && (
                                            <Text style={s.autoGenRaw}>was {currency}{sug.rawAverage.toLocaleString()}</Text>
                                        )}
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    <View style={s.autoGenTotalRow}>
                        <Text style={s.autoGenTotalLabel}>Total budget</Text>
                        <Text style={s.autoGenTotalVal}>
                            {currency}{autoBudget.suggestions.filter(s2 => !excludedCats.has(s2.category)).reduce((sum, s2) => sum + s2.monthlyAmount, 0).toLocaleString()}
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
    pad:          { padding: 16, paddingBottom: 100 },

    headerRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 12 },
    backBtn:      { color: Colors.primary, fontSize: 14 },
    screenTitle:  { flex: 1, fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary },
    addBtn:       { backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
    addBtnText:   { color: '#fff', fontSize: 13, fontWeight: '700' },
    autoBtn:      { backgroundColor: Colors.primary + '18', borderWidth: 1, borderColor: Colors.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
    autoBtnText:  { color: Colors.primary, fontSize: 13, fontWeight: '700' },

    summaryCard:   { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 16 },
    summaryMonth:  { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 12 },
    summaryRow:    { flexDirection: 'row', alignItems: 'center' },
    summaryBox:    { flex: 1, alignItems: 'center' },
    summaryLabel:  { fontSize: 10, color: Colors.textMuted, marginBottom: 4 },
    summaryVal:    { fontSize: 18, fontWeight: 'bold' },
    summaryDivider:{ width: 1, backgroundColor: Colors.border, alignSelf: 'stretch', marginHorizontal: 8 },
    overAlert:     { marginTop: 10, fontSize: 13, color: Colors.expense, fontWeight: '600', textAlign: 'center' },

    strategyCard:  { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: Colors.primary },
    strategyTitle: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary, marginBottom: 10 },
    strategyRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
    strategyLabel: { fontSize: 12, color: Colors.textSecondary },
    strategyVal:   { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
    strategyVerdict:     { marginTop: 12, borderRadius: 8, borderWidth: 1, padding: 10 },
    strategyVerdictText: { fontSize: 11, fontWeight: '600', lineHeight: 16 },
    forecastLink:        { marginTop: 10, paddingVertical: 8 },
    forecastLinkText:    { fontSize: 12, color: Colors.primary, fontWeight: '700', textAlign: 'center' },

    suggestChip:     { backgroundColor: Colors.primary + '15', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, marginTop: 8, marginBottom: 4 },
    suggestChipText: { fontSize: 11, color: Colors.primary, fontWeight: '600' },

    tacticRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.border },
    tacticTitle: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, marginBottom: 3 },
    tacticRationale: { fontSize: 11, color: Colors.textSecondary, lineHeight: 16, marginBottom: 6 },
    tacticMetaRow: { flexDirection: 'row', gap: 12 },
    tacticMeta: { fontSize: 10, color: Colors.textMuted, fontWeight: '600' },

    emptyState:    { alignItems: 'center', paddingVertical: 40 },
    emptyTitle:    { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 8 },
    emptySub:      { fontSize: 13, color: Colors.textMuted, textAlign: 'center', marginBottom: 20, lineHeight: 20 },
    emptyBtn:      { backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12, marginBottom: 10 },
    emptyBtnText:  { color: '#fff', fontWeight: '700', fontSize: 14 },
    emptyBtnSecondary:     { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.border },
    emptyBtnTextSecondary: { color: Colors.textSecondary },

    autoGenSub:        { fontSize: 12, color: Colors.textSecondary, lineHeight: 18, marginBottom: 12 },
    autoGenScaledNote: { backgroundColor: Colors.warning + '18', borderWidth: 1, borderColor: Colors.warning, borderRadius: 8, padding: 10, marginBottom: 12 },
    autoGenScaledNoteText: { fontSize: 11, color: Colors.warning, fontWeight: '600', lineHeight: 16 },
    autoGenList:       { maxHeight: 320, marginBottom: 12 },
    autoGenRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 10 },
    autoGenRowExcluded:{ opacity: 0.45 },
    autoGenCheck:      { fontSize: 16, color: Colors.primary },
    autoGenCheckOff:   { color: Colors.textMuted },
    autoGenCat:        { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
    autoGenAmt:        { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    autoGenRaw:        { fontSize: 10, color: Colors.textMuted },
    autoGenTextExcluded: { color: Colors.textMuted },
    autoGenTotalRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.border, marginBottom: 12 },
    autoGenTotalLabel: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    autoGenTotalVal:   { fontSize: 15, fontWeight: '800', color: Colors.primary },

    tableHeader:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingLeft: 20 },
    th:            { flex: 1, fontSize: 10, color: Colors.textMuted, fontWeight: '700', textAlign: 'right' },

    tableRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(51,65,85,0.4)' },
    overRow:       { backgroundColor: 'rgba(239,68,68,0.06)' },
    statusDot:     { width: 8, height: 8, borderRadius: 4, marginRight: 8, marginLeft: 4 },
    td:            { flex: 1, fontSize: 12, textAlign: 'right', color: Colors.textSecondary },

    overCard:      { backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: Colors.expense, borderRadius: 10, padding: 12, marginBottom: 10 },
    overCardTitle: { fontSize: 13, fontWeight: '700', color: Colors.expense, marginBottom: 4 },
    overCardText:  { fontSize: 12, color: Colors.textSecondary },

    overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet:        { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 },
    sheetHandle:  { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
    sheetTitle:   { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: 16 },

    catSelector:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.bg, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, padding: 12, marginBottom: 10 },
    catSelectorText: { fontSize: 14, color: Colors.textPrimary },
    catArrow:      { fontSize: 12, color: Colors.textMuted },
    catList:       { maxHeight: 180, backgroundColor: Colors.bg, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, marginBottom: 10 },
    catOption:     { padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
    catOptionActive: { backgroundColor: 'rgba(37,99,235,0.15)' },
    catOptionText: { fontSize: 14, color: Colors.textSecondary },
    catOptionTextActive: { color: Colors.primary, fontWeight: '700' },

    input:        { backgroundColor: Colors.bg, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, padding: 12, color: Colors.textPrimary, marginBottom: 12, fontSize: 14 },
    saveBtn:      { backgroundColor: Colors.primary, borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 10 },
    saveBtnText:  { color: '#fff', fontWeight: '700', fontSize: 15 },
    deleteBtn:    { borderRadius: 10, padding: 12, alignItems: 'center' },
    deleteBtnText:{ color: Colors.expense, fontWeight: '600', fontSize: 14 },
});
