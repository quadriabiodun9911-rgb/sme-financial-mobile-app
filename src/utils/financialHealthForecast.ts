/**
 * Financial Health Forecast — the same canonical computeRiskScore
 * (finance.ts) run twice: once against the business's real current
 * finances, once against a projected finance snapshot for the forecast
 * period, so "current score" and "projected score" always agree with
 * every other screen's score and never drift into a second scoring
 * formula.
 *
 * Only Profitability and Liquidity read their numbers from the `finance`
 * argument computeRiskScore is given — Working Capital, Debt, Efficiency,
 * Inventory, and Concentration are all computed from transactions/loans/
 * inventory directly. Passing a projected finance snapshot alongside the
 * SAME (real, historical) transactions/loans/inventory therefore moves
 * only the factors that a revenue/expense/cash projection can honestly
 * speak to, and leaves the rest exactly as they are today -- rather than
 * fabricating a future transaction history to re-derive things like
 * customer concentration or inventory turnover that this forecast has no
 * real basis for projecting.
 */

import { Transaction, Loan, InventoryItem, FinanceData } from '../types';
import { computeRiskScore, RiskScore } from './finance';

export interface HealthScoreDriver {
    name: string;
    currentScore: number;
    projectedScore: number;
    weight: number;
    explanation: string; // the projected factor's own explanation, not a separately-written one
}

export interface FinancialHealthForecast {
    currentScore: RiskScore;
    projectedScore: RiskScore;
    movedFactors: HealthScoreDriver[];    // factors whose score actually changed, biggest weighted swing first
    unchangedFactorNames: string[];       // factors this projection has no basis to move
}

export function computeFinancialHealthForecast(
    finance: Pick<FinanceData, 'income' | 'profit' | 'cashBalance'>,
    projectedFinance: Pick<FinanceData, 'income' | 'profit' | 'cashBalance'>,
    loans: Loan[],
    transactions: Transaction[],
    inventory: InventoryItem[] = [],
): FinancialHealthForecast {
    const currentScore = computeRiskScore(finance, loans, transactions, inventory);
    const projectedScore = computeRiskScore(projectedFinance, loans, transactions, inventory);

    const movedFactors: HealthScoreDriver[] = [];
    const unchangedFactorNames: string[] = [];
    currentScore.factors.forEach((cf, i) => {
        const pf = projectedScore.factors[i];
        if (cf.score !== pf.score) {
            movedFactors.push({ name: cf.name, currentScore: cf.score, projectedScore: pf.score, weight: cf.weight, explanation: pf.explanation });
        } else {
            unchangedFactorNames.push(cf.name);
        }
    });
    movedFactors.sort((a, b) => Math.abs((b.projectedScore - b.currentScore) * b.weight) - Math.abs((a.projectedScore - a.currentScore) * a.weight));

    return { currentScore, projectedScore, movedFactors, unchangedFactorNames };
}
