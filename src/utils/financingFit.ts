/**
 * Financing Fit Engine — scores a business against a lender's published
 * criteria using the same figures already computed for Credit-Worthiness /
 * Funding Readiness (computeDSCR, computeLiveLoanBalance, the trailing
 * monthly-revenue run-rate used throughout analysis.ts and
 * futureFinancialStatements.ts). Deliberately not a second, independently-
 * tuned score.
 *
 * Every criterion is either met, unmet, or -- for the handful of things
 * Quad360 genuinely has no data for, like planned equity contribution --
 * honestly marked unknown rather than silently assumed to pass. The fit
 * score never implies a lending decision: Quad360 doesn't lend and has no
 * visibility into any lender's actual approval process.
 */

import { Transaction, Loan, BusinessSettings, Industry, FinancingProduct, User } from '../types';
import { computeDSCR } from './finance';
import { computeAllTimeMonthlyBuckets } from './trendAnalysis';
import { computeLiveLoanBalance } from './debtRatios';
import { computeDataQuality } from './dataQuality';

export interface FinancingFitInput {
    avgMonthlyRevenue: number;
    annualRevenue: number;
    businessAgeMonths: number;
    dscr: number;
    industry: Industry;
    existingDebt: number;
    transactionHistoryMonths: number;
    requestedAmount?: number;
}

/** Assembles a FinancingFitInput from live app state -- one place so every product is scored against the same numbers. */
export function buildFinancingFitInput(
    transactions: Transaction[],
    loans: Loan[],
    settings: BusinessSettings,
    user: Pick<User, 'daysActive'> | null | undefined,
    requestedAmount?: number,
): FinancingFitInput {
    // Trailing up-to-3-months run-rate -- the same convention
    // computeMonthlyBaseline (analysis.ts) and buildFutureFinancialStatements
    // use, so "your revenue" here agrees with those screens.
    const monthly = computeAllTimeMonthlyBuckets(transactions);
    const recent = monthly.slice(-3);
    const avgMonthlyRevenue = recent.length > 0 ? recent.reduce((s, m) => s + m.revenue, 0) / recent.length : 0;

    return {
        avgMonthlyRevenue,
        annualRevenue: avgMonthlyRevenue * 12,
        businessAgeMonths: Math.floor((user?.daysActive || 0) / 30),
        dscr: computeDSCR(transactions, loans).dscr,
        industry: settings.industry || 'general',
        existingDebt: computeLiveLoanBalance(loans),
        transactionHistoryMonths: computeDataQuality(transactions).monthsWithData,
        requestedAmount,
    };
}

export type CriterionStatus = 'met' | 'unmet' | 'unknown';

export interface FinancingFitCriterion {
    label: string;
    status: CriterionStatus;
    businessValue: string;
    required: string;
    note?: string; // only set for 'unknown' -- why Quad360 can't verify this one
}

export type FinancingFitVerdict = 'strong' | 'moderate' | 'weak' | 'not_eligible';

export interface FinancingFitResult {
    product: FinancingProduct;
    fitScore: number; // 0-100, over evaluated (met+unmet) criteria only -- 'unknown' criteria don't count for or against
    verdict: FinancingFitVerdict;
    criteria: FinancingFitCriterion[];
    metCount: number;
    unmetCount: number;
    unknownCount: number;
    improvementTips: string[]; // one per unmet criterion, plain language
}

function fmtAmt(currency: string, n: number): string {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `${currency}${(n / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${currency}${(n / 1_000).toFixed(0)}K`;
    return `${currency}${Math.round(n).toLocaleString()}`;
}

export function computeFinancingFit(product: FinancingProduct, input: FinancingFitInput, currency: string): FinancingFitResult {
    const e = product.eligibility;
    const criteria: FinancingFitCriterion[] = [];

    if (e.minMonthlyRevenue !== undefined) {
        criteria.push({
            label: 'Monthly revenue',
            status: input.avgMonthlyRevenue >= e.minMonthlyRevenue ? 'met' : 'unmet',
            businessValue: `${fmtAmt(currency, input.avgMonthlyRevenue)}/mo`,
            required: `≥ ${fmtAmt(currency, e.minMonthlyRevenue)}/mo`,
        });
    }

    if (e.minBusinessAgeMonths !== undefined) {
        criteria.push({
            label: 'Business age',
            status: input.businessAgeMonths >= e.minBusinessAgeMonths ? 'met' : 'unmet',
            businessValue: `${input.businessAgeMonths} month${input.businessAgeMonths === 1 ? '' : 's'}`,
            required: `≥ ${e.minBusinessAgeMonths} month${e.minBusinessAgeMonths === 1 ? '' : 's'}`,
        });
    }

    if (e.minDSCR !== undefined) {
        criteria.push({
            label: 'Debt-service coverage (DSCR)',
            status: input.dscr >= e.minDSCR ? 'met' : 'unmet',
            businessValue: input.dscr >= 900 ? 'No existing debt' : `${input.dscr.toFixed(2)}x`,
            required: `≥ ${e.minDSCR.toFixed(2)}x`,
        });
    }

    if (e.eligibleIndustries && e.eligibleIndustries.length > 0) {
        criteria.push({
            label: 'Industry',
            status: e.eligibleIndustries.includes(input.industry) ? 'met' : 'unmet',
            businessValue: input.industry,
            required: e.eligibleIndustries.join(', '),
        });
    }

    if (e.maxDebtToRevenueRatio !== undefined) {
        if (input.annualRevenue <= 0) {
            criteria.push({
                label: 'Debt-to-revenue ratio',
                status: 'unknown',
                businessValue: 'Not enough revenue history',
                required: `≤ ${(e.maxDebtToRevenueRatio * 100).toFixed(0)}%`,
                note: 'Needs a real revenue history to compute this ratio.',
            });
        } else {
            const ratio = input.existingDebt / input.annualRevenue;
            criteria.push({
                label: 'Debt-to-revenue ratio',
                status: ratio <= e.maxDebtToRevenueRatio ? 'met' : 'unmet',
                businessValue: `${(ratio * 100).toFixed(0)}%`,
                required: `≤ ${(e.maxDebtToRevenueRatio * 100).toFixed(0)}%`,
            });
        }
    }

    if (e.minTransactionHistoryMonths !== undefined) {
        criteria.push({
            label: 'Recorded transaction history',
            status: input.transactionHistoryMonths >= e.minTransactionHistoryMonths ? 'met' : 'unmet',
            businessValue: `${input.transactionHistoryMonths} month${input.transactionHistoryMonths === 1 ? '' : 's'}`,
            required: `≥ ${e.minTransactionHistoryMonths} month${e.minTransactionHistoryMonths === 1 ? '' : 's'}`,
        });
    }

    if (e.minEquityContributionPct !== undefined) {
        criteria.push({
            label: 'Equity contribution',
            status: 'unknown',
            businessValue: 'Not tracked yet',
            required: `≥ ${e.minEquityContributionPct}% of asset cost`,
            note: "Quad360 doesn't track planned equity contribution for a specific purchase -- confirm this directly with the lender.",
        });
    }

    if (input.requestedAmount !== undefined && input.requestedAmount > 0) {
        criteria.push({
            label: 'Requested amount within range',
            status: input.requestedAmount >= product.minAmount && input.requestedAmount <= product.maxAmount ? 'met' : 'unmet',
            businessValue: fmtAmt(currency, input.requestedAmount),
            required: `${fmtAmt(currency, product.minAmount)} – ${fmtAmt(currency, product.maxAmount)}`,
        });
    }

    const metCount = criteria.filter(c => c.status === 'met').length;
    const unmetCount = criteria.filter(c => c.status === 'unmet').length;
    const unknownCount = criteria.filter(c => c.status === 'unknown').length;
    const evaluated = metCount + unmetCount;
    const fitScore = evaluated > 0 ? Math.round((metCount / evaluated) * 100) : 0;

    // Current income not covering existing debt service is a universal
    // "not ready for more debt" signal, independent of any single product's
    // stated DSCR requirement -- same hard gate lendingCapacity.ts uses.
    let verdict: FinancingFitVerdict;
    if (input.dscr < 1) verdict = 'not_eligible';
    else if (fitScore >= 80) verdict = 'strong';
    else if (fitScore >= 55) verdict = 'moderate';
    else verdict = 'weak';

    const improvementTips = criteria
        .filter(c => c.status === 'unmet')
        .map(c => `${c.label}: currently ${c.businessValue} — this lender wants ${c.required}.`);

    return { product, fitScore, verdict, criteria, metCount, unmetCount, unknownCount, improvementTips };
}

export function rankFinancingProducts(products: FinancingProduct[], input: FinancingFitInput, currency: string): FinancingFitResult[] {
    return products
        .map(p => computeFinancingFit(p, input, currency))
        .sort((a, b) => b.fitScore - a.fitScore);
}
