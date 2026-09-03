import React, { useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import Collapsible from '../components/Collapsible';
import GrowthAffordabilityCalculator from '../components/GrowthAffordabilityCalculator';
import BuyVsFinanceCalculator from '../components/BuyVsFinanceCalculator';
import BreakevenAnalysis from '../components/BreakevenAnalysis';
import LoanAffordabilityChecker from '../components/LoanAffordabilityChecker';
import DecisionSimulator from '../components/DecisionSimulator';
import CapitalCommitmentTracker, { CommitmentPrefill } from '../components/CapitalCommitmentTracker';
import DecisionComparisonTable from '../components/DecisionComparisonTable';
import { computeCashRunway } from '../utils/cashRunway';
import { computeRiskScore, loanMonthlyPayment } from '../utils/finance';
import { computeBreakeven } from '../utils/profitability';
import { computeInventoryDecisions, summarizeInventoryDecisions } from '../utils/inventoryDecisions';
import { computeBusinessExposure, computeBusinessResilience } from '../utils/businessExposure';
import { computeFinancialHealthPillars } from '../utils/financialHealthPillars';

/**
 * These four checks already existed — GrowthAffordabilityCalculator and
 * BuyVsFinanceCalculator were only reachable inside Loans & Debt's "Manual
 * Tools" accordion, LoanAffordabilityChecker sat next to them, and the
 * discount-impact view lives inside BreakevenAnalysis on the Analysis
 * screen. None of that is wrong on its own, but a business owner deciding
 * whether to hire, buy, discount, or borrow shouldn't have to already know
 * which deep-dive screen the relevant tool is filed under. This screen adds
 * no new financial logic -- it just gives the decision itself top billing,
 * grouped by the question a business owner is actually asking, with the
 * same components (and therefore the same numbers) reused as-is.
 */
export default function BeforeYouDecideScreen() {
    const { finance, transactions, loans, inventory, assets, settings, navigate } = useApp();
    const { currency } = settings;
    const [affordabilityMode, setAffordabilityMode] = useState<'quick' | 'detailed'>('quick');
    // Compare Decisions' "Track this decision" hands its scenario here,
    // which reveals and pre-fills Investment Decision Tracker below --
    // see CapitalCommitmentTracker's own prefill prop for why.
    const [commitmentPrefill, setCommitmentPrefill] = useState<CommitmentPrefill | null>(null);

    // Same risk/resilience/pillar pipeline the Scoreboard already computes
    // for its "Financial Health -- By Pillar" card -- reused here only for
    // the Decision Simulator's Expansion Readiness banner below, never a
    // second, independently-tuned score.
    const risk = useMemo(() => computeRiskScore(finance, loans, transactions, inventory), [finance, loans, transactions, inventory]);
    const exposure = useMemo(
        () => computeBusinessExposure(transactions, loans, inventory, settings?.macroAssumptions ?? [], finance, settings?.nextTaxDeadline, currency),
        [transactions, loans, inventory, settings?.macroAssumptions, finance, settings?.nextTaxDeadline, currency],
    );
    const resilience = useMemo(() => computeBusinessResilience(exposure), [exposure]);
    const pillars = useMemo(() => computeFinancialHealthPillars(risk, transactions, resilience), [risk, transactions, resilience]);

    // Same trailing-30-day burn/profit derivation LoansAndDebt.tsx already
    // uses for these exact same components -- kept identical so a number
    // shown here never disagrees with the same calculator opened from
    // Loans & Debt.
    const { dailyBurn } = computeCashRunway(transactions, finance.cashBalance);
    const monthlyBurn = dailyBurn * 30;

    const last30 = new Date();
    last30.setDate(last30.getDate() - 30);
    const last30Str = last30.toISOString().split('T')[0];
    const todayStr = new Date().toISOString().split('T')[0];
    const income30 = transactions
        .filter(t => t.type === 'income' && t.status === 'paid' && t.date >= last30Str && t.date <= todayStr)
        .reduce((s, t) => s + (t.amount ?? 0), 0);
    const monthlyProfit = income30 - monthlyBurn;

    const existingMonthlyDebtService = loans
        .filter(l => l.status === 'active')
        .reduce((s, l) => s + loanMonthlyPayment(l.principal, l.interestRate, l.termMonths), 0);

    const breakeven = computeBreakeven(transactions, settings);

    // Reuses the exact same reorder-affordability signal already shown on
    // Inventory & Stock's Pricing tab (InventoryPricingTab.tsx) -- this is
    // "Can I afford to hire/expand/borrow?" grouped alongside "Can I afford
    // to restock?", not a second, independently-computed affordability
    // check.
    const inventoryDecisions = computeInventoryDecisions(inventory, transactions, finance.cashBalance, currency);
    const inventorySummary = summarizeInventoryDecisions(inventoryDecisions);
    const reorderDecisions = inventoryDecisions.filter(d => d.action === 'reorder');
    const unaffordableReorders = reorderDecisions.filter(d => d.affordable === false);

    return (
        <SafeAreaView style={styles.safe}>
            <Header />
            <ScrollView style={styles.scroll} contentContainerStyle={styles.pad}>
                <TouchableOpacity onPress={() => navigate('dashboard')}>
                    <Text style={styles.backLink}>← Dashboard</Text>
                </TouchableOpacity>

                <Text style={styles.title}>🤔 Before You Decide</Text>
                <Text style={styles.subtitle}>
                    Check a real decision against your own numbers before you commit to it — not a
                    forecast of what will happen, but what your current cash flow can actually
                    absorb.
                </Text>

                <View style={styles.decisionCard}>
                    <Text style={styles.decisionQuestion}>Weighing more than one option?</Text>
                    <Text style={styles.decisionHelp}>Put a hire, a price change, and a loan side by side instead of checking them one at a time.</Text>
                </View>
                <Collapsible title="Compare Decisions">
                    <DecisionComparisonTable
                        currency={currency}
                        transactions={transactions}
                        currentCashBalance={finance.cashBalance}
                        onTrackDecision={setCommitmentPrefill}
                    />
                </Collapsible>

                <View style={styles.decisionCard}>
                    <Text style={styles.decisionQuestion}>Planning to hire or expand?</Text>
                    <Text style={styles.decisionHelp}>Can your cash survive the gap between paying for it and it paying for itself?</Text>
                </View>
                {/* One affordability check, not two -- Quick (just a new
                    monthly cost, no upfront/ramp-up assumed) and Detailed
                    (upfront cost, ramp-up months, expected added revenue)
                    are the same underlying question at two levels of
                    complexity, not two different tools. See
                    financialDecisionSimulator.ts / growthAffordability.ts
                    for why the math itself stays two separate engines. */}
                <Collapsible title="Can I Afford This? (Hire, Expand, or New Cost)">
                    <View style={styles.modeToggleRow}>
                        <TouchableOpacity
                            style={[styles.modeToggleBtn, affordabilityMode === 'quick' && styles.modeToggleBtnActive]}
                            onPress={() => setAffordabilityMode('quick')}
                        >
                            <Text style={[styles.modeToggleText, affordabilityMode === 'quick' && styles.modeToggleTextActive]}>Quick</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.modeToggleBtn, affordabilityMode === 'detailed' && styles.modeToggleBtnActive]}
                            onPress={() => setAffordabilityMode('detailed')}
                        >
                            <Text style={[styles.modeToggleText, affordabilityMode === 'detailed' && styles.modeToggleTextActive]}>Detailed (upfront cost + ramp-up)</Text>
                        </TouchableOpacity>
                    </View>
                    {affordabilityMode === 'quick' ? (
                        <DecisionSimulator currency={currency} transactions={transactions} currentCashBalance={finance.cashBalance} pillars={pillars.pillars} />
                    ) : (
                        <GrowthAffordabilityCalculator currency={currency} currentCashBalance={finance.cashBalance} monthlyBurn={monthlyBurn} />
                    )}
                </Collapsible>

                <View style={styles.decisionCard}>
                    <Text style={styles.decisionQuestion}>Making a big purchase?</Text>
                    <Text style={styles.decisionHelp}>Paying cash and financing it are both reasonable — see the actual liquidity trade-off first.</Text>
                </View>
                <Collapsible title="Buy vs. Finance">
                    <BuyVsFinanceCalculator currency={currency} currentCashBalance={finance.cashBalance} monthlyBurn={monthlyBurn} />
                </Collapsible>

                <View style={styles.decisionCard}>
                    <Text style={styles.decisionQuestion}>Giving customers a discount?</Text>
                    <Text style={styles.decisionHelp}>A discount doesn't change what a sale costs you — see how much more you'd need to sell to keep the same profit.</Text>
                </View>
                <Collapsible title="Discount & Breakeven Impact">
                    <BreakevenAnalysis result={breakeven} currency={currency} />
                </Collapsible>

                {reorderDecisions.length > 0 && (
                    <>
                        <View style={styles.decisionCard}>
                            <Text style={styles.decisionQuestion}>Planning to restock inventory?</Text>
                            <Text style={styles.decisionHelp}>Whether cash on hand actually covers what's due for reorder right now.</Text>
                        </View>
                        <Collapsible title="Restock Affordability">
                            <Text style={styles.decisionHelp}>
                                {inventorySummary.reorderCount} item{inventorySummary.reorderCount !== 1 ? 's' : ''} at or below reorder level, totalling about {currency}{Math.round(inventorySummary.reorderCost).toLocaleString()} to restock.
                                {unaffordableReorders.length > 0
                                    ? ` ${unaffordableReorders.length} of those would exceed your current cash on hand (${currency}${Math.round(finance.cashBalance).toLocaleString()}).`
                                    : ' Current cash on hand covers all of them.'}
                            </Text>
                            {reorderDecisions.slice(0, 8).map(d => (
                                <Text key={d.itemId} style={[styles.decisionHelp, { marginTop: 6, color: d.affordable ? Colors.textSecondary : Colors.expense }]}>
                                    {d.affordable ? '✓' : '✗'} {d.itemName} — {d.detail}
                                </Text>
                            ))}
                            <TouchableOpacity onPress={() => navigate('inventory', { tab: 'pricing' })}>
                                <Text style={[styles.decisionHelp, { color: Colors.primary, marginTop: 8 }]}>See full restock/reduce/discontinue list → Inventory</Text>
                            </TouchableOpacity>
                        </Collapsible>
                    </>
                )}

                <View style={styles.decisionCard}>
                    <Text style={styles.decisionQuestion}>Taking a loan?</Text>
                    <Text style={styles.decisionHelp}>Checks one specific loan against your real profit and cash flow — the way a lender's own affordability check would.</Text>
                </View>
                <Collapsible title="Loan Affordability Check">
                    <LoanAffordabilityChecker
                        currency={currency}
                        currentCashBalance={finance.cashBalance}
                        monthlyProfit={monthlyProfit}
                        existingMonthlyDebtService={existingMonthlyDebtService}
                        monthlyOperatingBurn={monthlyBurn}
                        transactions={transactions}
                    />
                </Collapsible>

                <View style={styles.decisionCard}>
                    <Text style={styles.decisionQuestion}>Already committed to something?</Text>
                    <Text style={styles.decisionHelp}>Track whether a past hire, purchase, or investment is actually delivering what you expected — not just what it cost.</Text>
                </View>
                <Collapsible title="Investment Decision Tracker" forceOpen={commitmentPrefill !== null}>
                    <CapitalCommitmentTracker
                        currency={currency}
                        prefill={commitmentPrefill}
                        onPrefillConsumed={() => setCommitmentPrefill(null)}
                    />
                </Collapsible>
            </ScrollView>
            <FooterNav />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: 16, paddingBottom: 80 },
    backLink: { color: Colors.primary, fontSize: 14, marginBottom: 12 },
    title: { fontSize: 28, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
    subtitle: { fontSize: 14, color: Colors.textSecondary, marginBottom: 20, lineHeight: 20 },
    decisionCard: {
        backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1,
        borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.xs,
        ...Shadow.sm,
    },
    decisionQuestion: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
    decisionHelp: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },

    modeToggleRow: { flexDirection: 'row', gap: 8, marginBottom: Spacing.sm },
    modeToggleBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg },
    modeToggleBtnActive: { backgroundColor: Colors.primary + '18', borderColor: Colors.primary },
    modeToggleText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
    modeToggleTextActive: { color: Colors.primary },
});
