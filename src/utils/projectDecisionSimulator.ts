/**
 * Project Decision Simulator — "should I fund this with cash or borrow for
 * it, and does either choice actually survive a bad month?"
 *
 * The existing decision tools each answer one half of this question:
 * - buyVsFinance.ts compares cash-vs-debt for a one-time purchase, but only
 *   under today's numbers -- no stress scenario.
 * - financialDecisionSimulator.ts stress-tests a new ongoing monthly cost
 *   against a revenue-drop scenario, but never models debt financing at
 *   all -- it's cash-only.
 *
 * A "new project" (a second location, a new product line, an expansion)
 * usually has BOTH an upfront cost and an ongoing monthly cost/benefit, and
 * a business owner deciding whether to self-fund it or borrow for it needs
 * to know not just which is cheaper today, but which one still holds up if
 * revenue falls -- borrowing adds a FIXED payment that doesn't shrink when
 * revenue does, while paying cash removes that fixed payment but leaves
 * less cash on hand to begin with. This combines both existing engines'
 * mechanics (buyVsFinance's cash/finance split, financialDecisionSimulator's
 * downside revenue-drop convention) rather than inventing new math, so it
 * can never disagree with either about what "current" or "downside" mean.
 */

import { Transaction } from '../types';
import { computeRevenueStressTest } from './revenueStressTest';
import { loanMonthlyPayment } from './finance';

export interface ProjectFundingScenario {
    monthlySurplus: number;
    cashAfterUpfront: number;
    turnsNegative: boolean;
    // Months until the cash left after the upfront spend would run out at
    // this scenario's burn rate -- null whenever monthlySurplus isn't
    // actually negative (nothing to deplete).
    monthsUntilDepleted: number | null;
}

export interface ProjectFundingPath {
    upfrontCashSpent: number;
    monthlyDebtService: number; // 0 for the cash path
    normal: ProjectFundingScenario;
    stressed: ProjectFundingScenario;
}

export type ProjectFundingRecommendation = 'cash' | 'debt' | 'either' | 'neither';

export interface ProjectDecisionResult {
    available: boolean;
    reason?: string;
    downsideRevenueDropPct: number;
    cash: ProjectFundingPath;
    debt: ProjectFundingPath & { financedAmount: number; totalInterestPaid: number };
    recommendation: ProjectFundingRecommendation;
    recommendationReason: string;
}

export interface ProjectDecisionInput {
    transactions: Transaction[];
    currentCashBalance: number;
    currency?: string;
    upfrontCost: number;
    additionalMonthlyCost: number;
    loanInterestRate: number;
    loanTermMonths: number;
    downPaymentPct?: number;
    downsideRevenueDropPct?: number;
}

const DEFAULT_DOWNSIDE_DROP_PCT = 20;

const EMPTY_SCENARIO: ProjectFundingScenario = { monthlySurplus: 0, cashAfterUpfront: 0, turnsNegative: false, monthsUntilDepleted: null };
const EMPTY_PATH: ProjectFundingPath = { upfrontCashSpent: 0, monthlyDebtService: 0, normal: EMPTY_SCENARIO, stressed: EMPTY_SCENARIO };

function buildScenario(monthlyRevenue: number, monthlyExpense: number, extraMonthlyCost: number, cashAfterUpfront: number, revenueDropPct: number): ProjectFundingScenario {
    const revenue = monthlyRevenue * (1 - revenueDropPct / 100);
    const monthlySurplus = revenue - monthlyExpense - extraMonthlyCost;
    const turnsNegative = monthlySurplus < 0;
    const monthsUntilDepleted = turnsNegative
        ? (cashAfterUpfront > 0 ? cashAfterUpfront / Math.abs(monthlySurplus) : 0)
        : null;
    return { monthlySurplus, cashAfterUpfront, turnsNegative, monthsUntilDepleted };
}

export function computeProjectDecisionSimulation(input: ProjectDecisionInput): ProjectDecisionResult {
    const {
        transactions, currentCashBalance, currency = '₦', upfrontCost, additionalMonthlyCost,
        loanInterestRate, loanTermMonths, downPaymentPct = 0,
        downsideRevenueDropPct = DEFAULT_DOWNSIDE_DROP_PCT,
    } = input;

    const stress = computeRevenueStressTest(transactions, currentCashBalance, currency);
    if (!stress.available) {
        return {
            available: false,
            reason: stress.reason ?? 'Not enough transaction history yet to check this.',
            downsideRevenueDropPct,
            cash: EMPTY_PATH,
            debt: { ...EMPTY_PATH, financedAmount: 0, totalInterestPaid: 0 },
            recommendation: 'neither',
            recommendationReason: '',
        };
    }

    // Cash path: the full upfront cost comes out of the bank now, with no
    // new debt service -- so the project's own ongoing monthly cost is all
    // that changes the monthly surplus.
    const cashAfterUpfrontCash = currentCashBalance - upfrontCost;
    const cashNormal = buildScenario(stress.currentMonthlyRevenue, stress.currentMonthlyExpense, additionalMonthlyCost, cashAfterUpfrontCash, 0);
    const cashStressed = buildScenario(stress.currentMonthlyRevenue, stress.currentMonthlyExpense, additionalMonthlyCost, cashAfterUpfrontCash, downsideRevenueDropPct);
    const cash: ProjectFundingPath = { upfrontCashSpent: upfrontCost, monthlyDebtService: 0, normal: cashNormal, stressed: cashStressed };

    // Debt path: only the down payment (if any) leaves the bank now; the
    // rest is financed, adding a new FIXED monthly payment on top of the
    // project's own ongoing cost -- fixed being the key word, since unlike
    // the project's own cost this doesn't shrink if revenue does.
    const downPayment = upfrontCost * (Math.max(0, Math.min(100, downPaymentPct)) / 100);
    const financedAmount = Math.max(0, upfrontCost - downPayment);
    const monthlyPayment = loanMonthlyPayment(financedAmount, loanInterestRate, loanTermMonths);
    const cashAfterUpfrontDebt = currentCashBalance - downPayment;
    const debtNormal = buildScenario(stress.currentMonthlyRevenue, stress.currentMonthlyExpense, additionalMonthlyCost + monthlyPayment, cashAfterUpfrontDebt, 0);
    const debtStressed = buildScenario(stress.currentMonthlyRevenue, stress.currentMonthlyExpense, additionalMonthlyCost + monthlyPayment, cashAfterUpfrontDebt, downsideRevenueDropPct);
    const totalInterestPaid = Math.max(0, monthlyPayment * loanTermMonths - financedAmount);
    const debt = { upfrontCashSpent: downPayment, monthlyDebtService: monthlyPayment, normal: debtNormal, stressed: debtStressed, financedAmount, totalInterestPaid };

    // Survival under the stress scenario matters more than which is cheaper
    // day-to-day -- that's the whole reason to run this at all, rather than
    // just reusing buyVsFinance's today-only comparison.
    const cashSurvives = !cashStressed.turnsNegative;
    const debtSurvives = !debtStressed.turnsNegative;

    let recommendation: ProjectFundingRecommendation;
    let recommendationReason: string;
    if (!cashSurvives && !debtSurvives) {
        recommendation = 'neither';
        recommendationReason = `Neither option survives a ${downsideRevenueDropPct}% revenue drop without cash generation turning negative — this project may not be affordable right now under either funding choice.`;
    } else if (cashSurvives && !debtSurvives) {
        recommendation = 'cash';
        recommendationReason = `Paying cash is the safer choice here — financing adds a fixed monthly payment that would turn cash flow negative if revenue fell ${downsideRevenueDropPct}%, while paying upfront does not.`;
    } else if (!cashSurvives && debtSurvives) {
        recommendation = 'debt';
        recommendationReason = `Financing is the safer choice here — paying the full cost upfront would leave too little cash to survive a ${downsideRevenueDropPct}% revenue drop, while spreading the cost into payments does not.`;
    } else if (Math.abs(cashNormal.monthlySurplus - debtNormal.monthlySurplus) < 1) {
        recommendation = 'either';
        recommendationReason = `Both options hold up under a ${downsideRevenueDropPct}% revenue drop — the choice comes down to whether ${currency}${Math.round(totalInterestPaid).toLocaleString()} in interest is worth avoiding the larger upfront hit to cash.`;
    } else if (cashNormal.monthlySurplus > debtNormal.monthlySurplus) {
        recommendation = 'cash';
        recommendationReason = `Both options survive a ${downsideRevenueDropPct}% revenue drop, but paying cash leaves a larger monthly surplus since there's no new loan payment to carry.`;
    } else {
        recommendation = 'debt';
        recommendationReason = `Both options survive a ${downsideRevenueDropPct}% revenue drop, but financing leaves a larger monthly surplus by spreading the cost out instead of paying it all now.`;
    }

    return { available: true, downsideRevenueDropPct, cash, debt, recommendation, recommendationReason };
}
