/**
 * Funding Readiness Pack — what a business is actually ready to hand a
 * lender, distinct from "will you get a loan." Quad360 doesn't lend and
 * has no visibility into any lender's actual decision — this assembles
 * the same real numbers already computed elsewhere in the app (never a
 * separate, independently-tuned score) into the shape a lender's own
 * assessment would look at, plus an honest checklist of what backs it up.
 */

import { Transaction, Invoice, Loan, InventoryItem, Asset, FinanceData, BusinessSettings } from '../types';
import { computeRiskScore, computeFinancingReadinessScore, RiskFactor, RiskScore, computeEnhancedPnL, computeWorkingCapitalMetrics, computeLoanAmortizationSplit } from './finance';
import { computeAllTimeMonthlyBuckets, MonthlyTrendPoint } from './trendAnalysis';
import { computeDataQuality } from './dataQuality';
import { computeTaxFilingReadiness } from './taxFilingReadiness';

export interface FundingReadinessProfile {
    revenue: number;
    grossProfit: number;
    grossMargin: number;
    netProfit: number;
    cash: number;
    receivables: number;
    debt: number;
    // Split per IAS 1.60 / ASC 210-10-45 -- a lender's own assessment cares
    // about debt maturity structure, not just the total outstanding.
    debtCurrentPortion: number;
    debtNonCurrentPortion: number;
}

export interface DocumentReadiness {
    id: string;
    label: string;
    ready: boolean;
    detail: string;
}

export interface FundingReadinessPack {
    businessName: string;
    generatedAt: string;
    profile: FundingReadinessProfile;
    trend: MonthlyTrendPoint[]; // up to the last 12 months with recorded data
    riskProfile: RiskFactor[];
    score: number;
    band: RiskScore['band'];
    documents: DocumentReadiness[];
}

/**
 * Trailing-12-month window for the headline P&L figures and the score that
 * summarizes them — a lender/investor cares about the last year's
 * performance, not a single current-month snapshot (that's what Financial
 * Health elsewhere in the app is for). Sub-calculations inside
 * computeRiskScore (DSCR, working capital, concentration, stock velocity)
 * still receive the FULL transaction history, not this trimmed set — each
 * already does its own correct windowing internally (DSCR trails 12
 * months itself, working capital's AR/AP has no date filter by design
 * since a receivable doesn't stop being owed after a year) and trimming
 * the input here would silently drop real outstanding amounts from those.
 */
function trailingTwelveMonths(transactions: Transaction[]): Transaction[] {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 365);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return transactions.filter(t => t.date >= cutoffStr);
}

export function buildFundingReadinessPack(
    transactions: Transaction[],
    invoices: Invoice[],
    loans: Loan[],
    inventory: InventoryItem[],
    assets: Asset[],
    finance: FinanceData,
    settings: BusinessSettings,
    businessName: string,
): FundingReadinessPack {
    const ttmTransactions = trailingTwelveMonths(transactions);
    const pnl = computeEnhancedPnL(ttmTransactions, assets);
    const wc = computeWorkingCapitalMetrics(transactions);

    let activeDebt = 0, debtCurrentPortion = 0, debtNonCurrentPortion = 0;
    for (const l of loans.filter(l => l.status === 'active')) {
        const balance = Math.max(0, l.principal - (l.payments ?? []).reduce((s, p) => s + (p.amount || 0), 0));
        activeDebt += balance;
        const split = computeLoanAmortizationSplit(l, balance);
        debtCurrentPortion += split.current;
        debtNonCurrentPortion += split.nonCurrent;
    }

    const risk = computeRiskScore(
        { income: pnl.revenue, profit: pnl.netProfit, cashBalance: finance.cashBalance },
        loans,
        transactions,
        inventory,
    );
    // Reweighted toward debt-service coverage and liquidity -- what a
    // lender's own assessment actually weighs -- rather than the general
    // Financial Health score this pack used to show unchanged. Same
    // underlying factor scores as `risk` above, just a different
    // aggregation suited to what this pack is for.
    const financingReadiness = computeFinancingReadinessScore(risk.factors);

    const allMonths = computeAllTimeMonthlyBuckets(transactions);
    const trend = allMonths.slice(-12);

    const dataQuality = computeDataQuality(transactions);
    const taxReadiness = computeTaxFilingReadiness(transactions, invoices, settings, finance, new Date(), businessName);
    const nonDraftInvoices = invoices.filter(i => i.status !== 'draft');

    // Quad360 has no document upload — "ready" here means "Quad360 has
    // enough real data to generate this from your records," not "a file is
    // on file." The pack's own copy has to say that plainly so this never
    // reads as a claim about paperwork that doesn't exist.
    const documents: DocumentReadiness[] = [
        {
            id: 'bank-statements',
            label: 'Bank statements',
            ready: dataQuality.confidence === 'strong' || dataQuality.confidence === 'partial',
            detail: dataQuality.summary,
        },
        {
            id: 'pnl',
            label: 'Profit & Loss statement',
            ready: transactions.length >= 5 && pnl.revenue > 0,
            detail: transactions.length >= 5
                ? `Generated from ${transactions.length} recorded transactions`
                : 'Needs at least 5 recorded transactions to generate',
        },
        {
            id: 'cashflow',
            label: 'Cash-flow report',
            ready: allMonths.length >= 3,
            detail: allMonths.length > 0
                ? `${allMonths.length} month${allMonths.length === 1 ? '' : 's'} of cash flow history recorded`
                : 'No cash flow history yet',
        },
        {
            id: 'invoices',
            label: 'Invoice history',
            ready: nonDraftInvoices.length > 0,
            detail: nonDraftInvoices.length > 0
                ? `${nonDraftInvoices.length} sent/paid invoice${nonDraftInvoices.length === 1 ? '' : 's'} on record`
                : 'No sent invoices recorded yet',
        },
        {
            id: 'tax',
            label: 'Tax documentation',
            ready: taxReadiness.overallReady,
            detail: `${taxReadiness.passedCount} of ${taxReadiness.totalChecks} tax readiness checks passed`,
        },
    ];

    return {
        businessName,
        generatedAt: new Date().toISOString(),
        profile: {
            revenue: pnl.revenue,
            grossProfit: pnl.grossProfit,
            grossMargin: pnl.grossMargin,
            netProfit: pnl.netProfit,
            cash: finance.cashBalance,
            receivables: wc.accountsReceivable,
            debt: activeDebt,
            debtCurrentPortion,
            debtNonCurrentPortion,
        },
        trend,
        riskProfile: financingReadiness.factors,
        score: financingReadiness.score,
        band: financingReadiness.band,
        documents,
    };
}
