import React from 'react';
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
import { computeCashRunway } from '../utils/cashRunway';
import { loanMonthlyPayment } from '../utils/finance';
import { computeBreakeven } from '../utils/profitability';

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
    const { finance, transactions, loans, settings, navigate } = useApp();
    const { currency } = settings;

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
                    <Text style={styles.decisionQuestion}>Planning to hire or expand?</Text>
                    <Text style={styles.decisionHelp}>Can your cash survive the gap between paying for it and it paying for itself?</Text>
                </View>
                <Collapsible title="Growth Affordability Check">
                    <GrowthAffordabilityCalculator currency={currency} currentCashBalance={finance.cashBalance} monthlyBurn={monthlyBurn} />
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
});
