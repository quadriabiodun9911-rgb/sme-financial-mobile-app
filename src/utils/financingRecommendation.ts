/**
 * "I'm not sure what kind of financing I need" — a business owner
 * shouldn't have to already know the financing taxonomy (invoice
 * financing vs. asset financing vs. working capital) before the app will
 * help them. This engine maps signals Quad360 already computes elsewhere
 * (outstanding invoices, assets nearing end of life, debt-service
 * headroom, readiness trend) to a small ranked list of financing
 * categories, each with a plain-language reason grounded in a real number
 * from the business's own records — never a category recommended just
 * because it's the default or because nothing else matched.
 *
 * Deliberately conservative: a signal only fires past a real threshold
 * (see each rule's comment for why that threshold), and Working Capital
 * is the only fallback when nothing else clears its bar -- every business
 * has *some* short-term operating cash need, so it's the one category
 * that's always a defensible answer to "I don't know what I need."
 */

import { Asset, FinancingProductType, Invoice, Transaction, InventoryItem } from '../types';
import { FinancingFitInput } from './financingFit';
import { computeAssetsNearingReplacement } from './finance';
import { ReadinessTrend } from './readinessHistory';
import { computeStockVelocity } from './stockVelocity';
import { computeSeasonalityPattern } from './seasonality';

export interface FinancingRecommendation {
    productType: FinancingProductType;
    label: string;
    confidence: 'strong' | 'moderate';
    reasons: string[];
}

export interface FinancingRecommendationInput {
    fitInput: FinancingFitInput;
    invoices: Invoice[];
    assets: Asset[];
    readinessTrend: ReadinessTrend | null;
    transactions: Transaction[];
    inventory: InventoryItem[];
}

function fmtAmt(currency: string, n: number): string {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `${currency}${(n / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${currency}${(n / 1_000).toFixed(0)}K`;
    return `${currency}${Math.round(n).toLocaleString()}`;
}

export function recommendFinancingTypes(input: FinancingRecommendationInput, currency: string): FinancingRecommendation[] {
    const { fitInput, invoices, assets, readinessTrend, transactions, inventory } = input;
    const recs: FinancingRecommendation[] = [];

    // Invoice financing: real, meaningful uncollected revenue sitting in
    // sent/overdue invoices. Threshold is relative to the business's own
    // monthly revenue (half a month's worth or more) rather than a fixed
    // amount, so it means the same thing for a small shop and a larger one.
    const outstanding = invoices
        .filter(i => i.status === 'sent' || i.status === 'overdue')
        .reduce((sum, i) => sum + i.total, 0);
    if (outstanding > 0 && fitInput.avgMonthlyRevenue > 0 && outstanding >= fitInput.avgMonthlyRevenue * 0.5) {
        const overdueCount = invoices.filter(i => i.status === 'overdue').length;
        recs.push({
            productType: 'invoice_financing',
            label: 'Invoice Financing',
            confidence: outstanding >= fitInput.avgMonthlyRevenue ? 'strong' : 'moderate',
            reasons: [
                `You have ${fmtAmt(currency, outstanding)} in unpaid customer invoices${overdueCount > 0 ? ` (${overdueCount} overdue)` : ''} — invoice financing advances that cash now instead of waiting for customers to pay.`,
            ],
        });
    }

    // Asset financing: real assets already down to 20% or less of their
    // original cost (computeAssetsNearingReplacement — same threshold
    // AssetsScreen's own replacement banner uses), so replacing them is a
    // genuine near-term need, not a hypothetical one.
    const agingAssets = computeAssetsNearingReplacement(assets);
    if (agingAssets.length > 0) {
        recs.push({
            productType: 'asset_financing',
            label: 'Asset Financing',
            confidence: agingAssets.length >= 2 ? 'strong' : 'moderate',
            reasons: [
                `${agingAssets.length} of your asset${agingAssets.length === 1 ? '' : 's'} — including ${agingAssets[0].name} — ${agingAssets.length === 1 ? 'is' : 'are'} nearing end of useful life. Asset financing spreads the cost of replacing ${agingAssets.length === 1 ? 'it' : 'them'} instead of paying upfront.`,
            ],
        });
    }

    // Trade / purchase-order financing: fast-moving inventory at real risk
    // of stocking out soon (computeStockVelocity's 'fast' tier -- days of
    // stock left below the threshold, the same signal the Dashboard's own
    // stockout alert uses) is exactly "demand exceeding current cash/stock
    // position": the textbook PO-financing scenario, whether the next
    // order is a confirmed customer commitment or just clearly needed to
    // keep shelves full.
    const fastMovingItems = inventory.filter(i => computeStockVelocity(i, transactions).tier === 'fast');
    if (fastMovingItems.length > 0) {
        recs.push({
            productType: 'trade_finance',
            label: 'Purchase Order / Trade Finance',
            confidence: fastMovingItems.length >= 3 ? 'strong' : 'moderate',
            reasons: [
                `${fastMovingItems.length} item${fastMovingItems.length === 1 ? ' is' : 's are'} selling fast enough to run out soon (including ${fastMovingItems[0].name}) — trade or purchase-order financing funds the next order now instead of losing sales to a stockout while cash is tied up elsewhere.`,
            ],
        });
    }

    // Overdraft / line of credit: a demonstrated seasonal swing in revenue
    // (computeSeasonalityPattern -- gated on a real year of history, not a
    // guess) is the textbook "recurring but variable" cash-flow shape a
    // revolving facility is built for, unlike a fixed-term loan sized for
    // the peak.
    const seasonality = computeSeasonalityPattern(transactions);
    if (seasonality.available && (seasonality.peakMonths.length > 0 || seasonality.troughMonths.length > 0)) {
        const swingMonth = seasonality.troughMonths[0] ?? seasonality.peakMonths[0];
        const swingPct = Math.round(Math.abs(swingMonth.index - 1) * 100);
        recs.push({
            productType: 'overdraft',
            label: 'Overdraft / Line of Credit',
            confidence: seasonality.troughMonths.length > 0 && seasonality.peakMonths.length > 0 ? 'strong' : 'moderate',
            reasons: [
                `Your revenue swings by about ${swingPct}% around ${swingMonth.monthName} most years — an overdraft or line of credit lets you draw only what you need through the slow stretch and repay as sales pick back up, instead of committing to a fixed loan sized for your peak.`,
            ],
        });
    }

    // Term loan (structural, longer-horizon growth financing): only makes
    // sense once the business demonstrably has repayment headroom AND
    // that headroom is trending the right way, not just adequate today.
    if (fitInput.dscr >= 1.3 && readinessTrend === 'improving') {
        recs.push({
            productType: 'term_loan',
            label: 'Term Loan',
            confidence: 'strong',
            reasons: [
                `Your debt-service coverage is healthy (${fitInput.dscr.toFixed(2)}x) and your financing readiness has been improving — that's real headroom to take on structured, longer-term financing for growth rather than just covering gaps.`,
            ],
        });
    }

    // Working capital: the always-defensible fallback. Fires on its own
    // signal (thin-but-positive coverage, or a young business) so it
    // still carries a real reason when it's the only recommendation, and
    // is force-included as a last resort so "not sure what I need" always
    // resolves to at least one answer.
    const thinCoverage = fitInput.dscr >= 1 && fitInput.dscr < 1.3;
    const youngBusiness = fitInput.businessAgeMonths > 0 && fitInput.businessAgeMonths < 12;
    if (thinCoverage || youngBusiness || recs.length === 0) {
        const reasons: string[] = [];
        if (thinCoverage) reasons.push(`Your income covers your obligations but with limited headroom (${fitInput.dscr.toFixed(2)}x debt-service coverage) — working capital financing is built for short-term operating gaps like this, without a long-term commitment.`);
        if (youngBusiness) reasons.push(`At ${fitInput.businessAgeMonths} month${fitInput.businessAgeMonths === 1 ? '' : 's'} old, most lenders' longer-term products aren't accessible yet — working capital products typically have the shortest track-record requirements.`);
        if (reasons.length === 0) reasons.push("Working capital is the most general-purpose financing type — a reasonable starting point when you're not yet sure what you need it for.");
        recs.push({
            productType: 'working_capital',
            label: 'Working Capital',
            confidence: 'moderate',
            reasons,
        });
    }

    // Strongest first; cap at 3 so this reads as a short, considered list,
    // not an exhaustive dump of every category that cleared some bar.
    return recs
        .sort((a, b) => (a.confidence === b.confidence ? 0 : a.confidence === 'strong' ? -1 : 1))
        .slice(0, 3);
}
