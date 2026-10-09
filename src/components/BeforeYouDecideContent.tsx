import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import Collapsible from './Collapsible';
import GrowthAffordabilityCalculator from './GrowthAffordabilityCalculator';
import BuyVsFinanceCalculator from './BuyVsFinanceCalculator';
import AssetAcquisitionCalculator from './AssetAcquisitionCalculator';
import ProjectDecisionSimulator from './ProjectDecisionSimulator';
import LoanAffordabilityChecker from './LoanAffordabilityChecker';
import NextStepLink from './NextStepLink';
import DecisionSimulator from './DecisionSimulator';
import CapitalCommitmentTracker, { CommitmentPrefill } from './CapitalCommitmentTracker';
import DecisionComparisonTable from './DecisionComparisonTable';
import DecisionEvidencePanel from './DecisionEvidencePanel';
import { computeDecisionEvidence } from '../utils/decisionEvidence';
import { computeCashRunway } from '../utils/cashRunway';
import { computeRiskScore, loanMonthlyPayment } from '../utils/finance';
import { computeBreakeven } from '../utils/profitability';
import { computeBreakEven as computeHypotheticalBreakEven } from '../utils/finance';
import { computeInventoryDecisions, summarizeInventoryDecisions } from '../utils/inventoryDecisions';
import { computeBusinessExposure, computeBusinessResilience } from '../utils/businessExposure';
import { computeFinancialHealthPillars } from '../utils/financialHealthPillars';
import { localDateStr } from '../utils/localDate';

/**
 * "Before You Decide" -- formerly its own top-level screen, now the Decide
 * tab of Analysis & Decisions. These two used to be separate nav
 * destinations; a business owner reported that having "Analysis &
 * Decisions" and "Before You Decide" sit right next to each other in the
 * nav read as two versions of the same thing rather than two different
 * tools. They ARE genuinely different (this is a guided set of decision
 * -specific wizards with their own stress tests; the What If? tab next to
 * this one is an open sandbox for exploring any lever) -- but the fix for
 * that is literally putting them under one roof, not just a cross-link
 * between two screens. Content and logic are unchanged from the old
 * screen; only the SafeAreaView/Header/ScrollView/FooterNav wrapper and
 * the now-redundant "Before You Decide" back-link/title were stripped,
 * since AnalysisScreen already provides all of that.
 *
 * The checks below already existed elsewhere before this screen did --
 * GrowthAffordabilityCalculator and BuyVsFinanceCalculator were only
 * reachable inside Loans & Debt's "Manual Tools" accordion,
 * LoanAffordabilityChecker sat next to them, and the interactive
 * discount-impact calculator (BreakevenAnalysis) lives on Cash Flow's
 * "Break-Even" tab. None of that is wrong on its own, but a business
 * owner deciding whether to hire, buy, discount, or borrow shouldn't have
 * to already know which deep-dive screen the relevant tool is filed
 * under. This adds no new financial logic -- it just gives the decision
 * itself top billing, grouped by the question a business owner is
 * actually asking, with the same components (and therefore the same
 * numbers) reused as-is -- except for the breakeven/discount tool
 * itself, which stays canonically on Cash Flow and is linked to here
 * rather than re-rendered, since that one genuinely was the same full
 * component duplicated in two places.
 */
export default function BeforeYouDecideContent() {
    const { finance, transactions, loans, inventory, assets, settings, navigate, goals } = useApp();
    const { currency } = settings;
    const [affordabilityMode, setAffordabilityMode] = useState<'quick' | 'detailed'>('quick');
    // Hypothetical break-even -- "if I priced a NEW product/service at X,
    // with Y variable cost and Z fixed cost, how many units to break even?"
    // Distinct from `breakeven` below (computeBreakeven), which reads the
    // business's OWN real cost structure to answer "how much more do I need
    // to sell to absorb a discount on what I already sell." Formerly its
    // own tab on Fractional CFO ("Finance"); moved here since planning a
    // new price/product is exactly the kind of real decision this screen
    // exists to pressure-test, not a ratio to monitor.
    const [hypFixedCosts, setHypFixedCosts] = useState('');
    const [hypVarCost, setHypVarCost]       = useState('');
    const [hypPrice, setHypPrice]           = useState('');
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

    // Confirmation-bias corrective: the case for and against committing to
    // more spending right now, side by side, built entirely from signals
    // already computed above/elsewhere -- see decisionEvidence.ts.
    const decisionEvidence = useMemo(
        () => computeDecisionEvidence(finance, transactions, loans, inventory, assets, currency),
        [finance, transactions, loans, inventory, assets, currency]
    );

    // Same trailing-30-day burn/profit derivation LoansAndDebt.tsx already
    // uses for these exact same components -- kept identical so a number
    // shown here never disagrees with the same calculator opened from
    // Loans & Debt.
    const { dailyBurn } = computeCashRunway(transactions, finance.cashBalance);
    const monthlyBurn = dailyBurn * 30;

    const last30 = new Date();
    last30.setDate(last30.getDate() - 30);
    const last30Str = localDateStr(last30);
    const todayStr = localDateStr();
    const income30 = transactions
        .filter(t => t.type === 'income' && t.status === 'paid' && t.date >= last30Str && t.date <= todayStr)
        .reduce((s, t) => s + (t.amount ?? 0), 0);
    const monthlyProfit = income30 - monthlyBurn;

    const existingMonthlyDebtService = loans
        .filter(l => l.status === 'active')
        .reduce((s, l) => s + loanMonthlyPayment(l.principal, l.interestRate, l.termMonths), 0);

    const breakeven = computeBreakeven(transactions, settings);
    const hypBreakEven = useMemo(() => {
        const fc = parseFloat(hypFixedCosts) || 0;
        const vc = parseFloat(hypVarCost) || 0;
        const pp = parseFloat(hypPrice) || 0;
        if (fc > 0 && pp > 0) return computeHypotheticalBreakEven(fc, vc, pp);
        return null;
    }, [hypFixedCosts, hypVarCost, hypPrice]);

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
        <>
            <Text style={styles.subtitle}>
                Check a real decision against your own numbers before you commit to it — not a
                forecast of what will happen, but what your current cash flow can actually
                absorb.
            </Text>

            <DecisionEvidencePanel evidence={decisionEvidence} />

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
                    <DecisionSimulator currency={currency} transactions={transactions} currentCashBalance={finance.cashBalance} pillars={pillars.pillars} goals={goals} navigate={navigate} />
                ) : (
                    <GrowthAffordabilityCalculator currency={currency} currentCashBalance={finance.cashBalance} monthlyBurn={monthlyBurn} currentMonthlySurplus={monthlyProfit} goals={goals} />
                )}
            </Collapsible>

            <View style={styles.decisionCard}>
                <Text style={styles.decisionQuestion}>Making a big purchase?</Text>
                <Text style={styles.decisionHelp}>Paying cash and financing it are both reasonable — see the actual liquidity trade-off first.</Text>
            </View>
            <Collapsible title="Buy vs. Finance">
                <BuyVsFinanceCalculator currency={currency} currentCashBalance={finance.cashBalance} monthlyBurn={monthlyBurn} currentMonthlySurplus={monthlyProfit} goals={goals} />
            </Collapsible>

            <View style={styles.decisionCard}>
                <Text style={styles.decisionQuestion}>Buying a vehicle, equipment, or machinery?</Text>
                <Text style={styles.decisionHelp}>Cash, a loan, and a lease all come out differently on total cost, cash flow, and ownership — see all three side by side before you commit to any of them.</Text>
            </View>
            <Collapsible title="Buy, Finance, or Lease an Asset">
                <AssetAcquisitionCalculator
                    currency={currency}
                    cashBalance={finance.cashBalance}
                    monthlyProfit={monthlyProfit}
                    minReserve={parseFloat(settings?.minReserve || '0') || 0}
                    onSeeFullPicture={() => navigate('business-passport')}
                />
            </Collapsible>

            <View style={styles.decisionCard}>
                <Text style={styles.decisionQuestion}>Taking on a bigger project — self-fund or borrow?</Text>
                <Text style={styles.decisionHelp}>A new location or product line usually has both an upfront cost and an ongoing monthly cost — see which funding choice still holds up if revenue drops, not just which is cheaper today.</Text>
            </View>
            <Collapsible title="Take On a New Project">
                <ProjectDecisionSimulator currency={currency} transactions={transactions} currentCashBalance={finance.cashBalance} />
            </Collapsible>

            <View style={styles.decisionCard}>
                <Text style={styles.decisionQuestion}>Giving customers a discount?</Text>
                <Text style={styles.decisionHelp}>A discount doesn't change what a sale costs you — see how much more you'd need to sell to keep the same profit.</Text>
            </View>
            {/* The full interactive breakeven/discount calculator lives on
                Cash Flow's own "Break-Even" tab -- this used to fully
                re-render it here too (same component, same numbers),
                which is exactly the kind of duplicate-destination
                confusion a business owner shouldn't have to untangle.
                A grounded one-line answer plus a direct link keeps this
                tab's own promise (the decision gets top billing) without
                maintaining a second copy of the same tool. */}
            <Collapsible title="Discount & Breakeven Impact">
                <Text style={styles.decisionHelp}>
                    {breakeven.costStructureUpsideDown
                        ? 'Variable costs alone exceed revenue right now — no sales volume reaches breakeven until the cost structure changes, so a discount would only make this worse.'
                        : breakeven.surplusOrGap >= 0
                        ? `You're ${currency}${Math.round(breakeven.surplusOrGap).toLocaleString()}/mo above breakeven. Use the interactive calculator to see exactly how much more you'd need to sell at a given discount to keep that cushion.`
                        : `You're ${currency}${Math.round(Math.abs(breakeven.surplusOrGap)).toLocaleString()}/mo short of breakeven before any discount is even considered.`}
                </Text>
                <NextStepLink text="Open the interactive Breakeven & Discount Calculator on Cash Flow" onPress={() => navigate('cashflow', { tab: 'breakeven' })} />
            </Collapsible>

            <View style={styles.decisionCard}>
                <Text style={styles.decisionQuestion}>Planning a new product or price?</Text>
                <Text style={styles.decisionHelp}>Not your existing business -- a hypothetical: enter a cost and price to see how many units you'd need to sell to break even.</Text>
            </View>
            {/* Formerly Fractional CFO's "Finance" tab -- a what-if tool,
                unrelated to the business's actual recorded costs (that's
                the card above). Kept distinct from it rather than merged
                into one card, since "what if I priced a new thing" and
                "how does a discount affect what I already sell" are
                different questions with different inputs. */}
            <Collapsible title="Break-Even Calculator (New Product or Price)">
                <TextInput style={styles.input} placeholder={`Monthly Fixed Costs (${currency})`} placeholderTextColor={Colors.textMuted} keyboardType="decimal-pad" value={hypFixedCosts} onChangeText={setHypFixedCosts} />
                <TextInput style={styles.input} placeholder={`Variable Cost per Unit (${currency})`} placeholderTextColor={Colors.textMuted} keyboardType="decimal-pad" value={hypVarCost} onChangeText={setHypVarCost} />
                <TextInput style={styles.input} placeholder={`Selling Price per Unit (${currency})`} placeholderTextColor={Colors.textMuted} keyboardType="decimal-pad" value={hypPrice} onChangeText={setHypPrice} />
                {hypBreakEven && (
                    <View>
                        <Text style={styles.decisionHelp}>
                            Units needed to break even: <Text style={{ fontWeight: '800', color: Colors.textPrimary }}>{isFinite(hypBreakEven.breakEvenUnits) ? Math.ceil(hypBreakEven.breakEvenUnits).toLocaleString() : '∞'}</Text>
                        </Text>
                        <Text style={styles.decisionHelp}>
                            Revenue needed: <Text style={{ fontWeight: '800', color: Colors.textPrimary }}>{isFinite(hypBreakEven.breakEvenRevenue) ? `${currency}${Math.ceil(hypBreakEven.breakEvenRevenue).toLocaleString()}` : '∞'}</Text>
                        </Text>
                        <Text style={styles.decisionHelp}>
                            Safety buffer: <Text style={{ fontWeight: '800', color: hypBreakEven.marginOfSafety > 20 ? Colors.income : Colors.warning }}>{hypBreakEven.marginOfSafety.toFixed(1)}%</Text> — how far sales can fall before you lose money. Higher is safer.
                        </Text>
                    </View>
                )}
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
        </>
    );
}

const styles = StyleSheet.create({
    subtitle: { fontSize: 13, color: Colors.textSecondary, marginBottom: Spacing.md, lineHeight: 19 },
    decisionCard: {
        backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1,
        borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.xs,
        ...Shadow.sm,
    },
    decisionQuestion: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
    decisionHelp: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },
    input: { backgroundColor: Colors.bg, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, padding: 12, color: Colors.textPrimary, marginBottom: 10, fontSize: 14 },

    modeToggleRow: { flexDirection: 'row', gap: 8, marginBottom: Spacing.sm },
    modeToggleBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg },
    modeToggleBtnActive: { backgroundColor: Colors.primary + '18', borderColor: Colors.primary },
    modeToggleText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
    modeToggleTextActive: { color: Colors.primary },
});
