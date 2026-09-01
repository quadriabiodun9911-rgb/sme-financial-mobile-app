/**
 * Quick Health Check — the landing page's 60-second, no-signup teaser.
 *
 * This computes a genuine PARTIAL Business Health Score: the same
 * Profitability and Liquidity factor-scoring functions and the same
 * weights computeRiskScore's real 8-factor score uses (scoreProfitabilityMargin,
 * scoreLiquidityRunwayMonths, GENERAL_HEALTH_WEIGHTS — all finance.ts),
 * renormalized over just these 2 factors (weight 35 of the real 100) --
 * the same "renormalize over whichever factors are actually available"
 * pattern budgetHealth.ts already uses for its own partial scores. It is
 * never the real 8-factor score: Working Capital, Debt, Efficiency,
 * Inventory, Concentration, and Operating Cash Flow all need real
 * transaction history (and for Debt, real loan records) that three typed
 * numbers can't honestly provide -- so the result is always labeled as a
 * partial preview, and the widget that renders this always tells the
 * visitor what closes the gap (uploading a bank statement / connecting
 * real transaction history inside the product).
 *
 * Runs entirely client-side, synchronous and pure -- nothing here is sent
 * anywhere, so "your data stays private" is literally true for this
 * widget, not just marketing copy.
 */

import {
    GENERAL_HEALTH_WEIGHTS,
    scoreProfitabilityMargin,
    scoreLiquidityRunwayMonths,
    RISK_BAND_CUTOFFS,
    RiskScore,
} from './finance';

export interface QuickHealthCheckResult {
    // The partial score itself -- 0-100, using the real band scale
    // (Excellent/Strong/Moderate/Weak/Critical) computeRiskScore's own
    // score uses, via the same RISK_BAND_CUTOFFS.
    partialScore: number;
    partialBand: RiskScore['band'];
    profitabilityScore: number; // 0-100, from the real scoreProfitabilityMargin
    liquidityScore: number; // 0-100, from the real scoreLiquidityRunwayMonths
    marginPct: number;

    // Separate from the score inputs above -- an honest, uncapped runway
    // for display (Infinity, not a sentinel, when there's no active burn),
    // same convention computeCashRunway uses elsewhere. The Liquidity
    // factor score above uses a different, capped-at-12-months figure
    // internally, matching computeRiskScore's own real Liquidity factor
    // exactly -- this field is for the headline number, not the score math.
    runwayMonths: number;
    isProfitable: boolean;
    netMonthlyBurn: number;
    expenseRatioPct: number | null; // null when revenue is 0 -- a ratio against zero revenue isn't a real number

    diagnosis: string; // names which of the 2 real factors is the bigger concern, and why
    financingPreview: string; // qualitative only, explicitly caveated -- never a fabricated approval/denial
}

export interface QuickHealthCheckInput {
    lastMonthRevenue: number;
    monthlyExpenses: number;
    cashInBank: number;
}

function partialBandFrom(score: number): RiskScore['band'] {
    return RISK_BAND_CUTOFFS.find(b => score >= b.min)!.band;
}

export function computeQuickHealthCheck(input: QuickHealthCheckInput): QuickHealthCheckResult {
    const { lastMonthRevenue, monthlyExpenses, cashInBank } = input;

    const isProfitable = monthlyExpenses <= lastMonthRevenue;
    const netMonthlyBurn = Math.max(monthlyExpenses - lastMonthRevenue, 0);
    const expenseRatioPct = lastMonthRevenue > 0 ? (monthlyExpenses / lastMonthRevenue) * 100 : null;

    // Honest, uncapped display runway -- same INDUSTRY_BENCHMARKS/Infinity
    // convention the real Cash Runway "Why?" trigger already uses.
    const runwayMonths = netMonthlyBurn > 0 ? cashInBank / netMonthlyBurn : Infinity;

    // Profitability factor -- identical formula to computeRiskScore's own
    // margin calculation (profit / income * 100, 0 when there's no income
    // to divide by).
    const marginPct = lastMonthRevenue > 0 ? ((lastMonthRevenue - monthlyExpenses) / lastMonthRevenue) * 100 : 0;
    const profitabilityScore = scoreProfitabilityMargin(marginPct);

    // Liquidity factor -- identical formula to computeRiskScore's own
    // runwayMonths: capped at 12 (not Infinity) when there's no burn and
    // cash on hand, 0 when there's neither burn nor cash. This is the real
    // formula's own convention, kept separate from the uncapped display
    // runwayMonths above.
    const scoringRunwayMonths = netMonthlyBurn > 0 ? cashInBank / netMonthlyBurn : (cashInBank > 0 ? 12 : 0);
    const liquidityScore = scoreLiquidityRunwayMonths(scoringRunwayMonths);

    const profitabilityWeight = GENERAL_HEALTH_WEIGHTS.Profitability;
    const liquidityWeight = GENERAL_HEALTH_WEIGHTS.Liquidity;
    const partialScore = Math.round(
        (profitabilityScore * profitabilityWeight + liquidityScore * liquidityWeight) / (profitabilityWeight + liquidityWeight)
    );
    const partialBand = partialBandFrom(partialScore);

    let diagnosis: string;
    if (profitabilityScore < liquidityScore) {
        diagnosis = expenseRatioPct !== null
            ? `Profitability is the bigger concern here: expenses are consuming ${expenseRatioPct.toFixed(0)}% of revenue, leaving a ${marginPct.toFixed(0)}% margin.`
            : `Profitability is the bigger concern here: expenses currently exceed revenue with none recorded yet.`;
    } else if (liquidityScore < profitabilityScore) {
        diagnosis = Number.isFinite(runwayMonths)
            ? `Liquidity is the bigger concern here: at the current burn rate, cash on hand covers about ${runwayMonths.toFixed(1)} month${runwayMonths === 1 ? '' : 's'}.`
            : `Liquidity is fine for now -- revenue currently covers expenses, so there's no active burn.`;
    } else {
        diagnosis = 'Profitability and liquidity are roughly in balance at this level -- neither is the standout weak point yet.';
    }

    let financingPreview: string;
    if (partialBand === 'Excellent' || partialBand === 'Strong') {
        financingPreview = 'Your basic numbers show the kind of cash discipline lenders respond well to.';
    } else if (partialBand === 'Moderate') {
        financingPreview = 'You\'re showing some of what lenders look for, but tighter expense control and a larger cash cushion would strengthen your position.';
    } else {
        financingPreview = 'Lenders typically want healthy cash coverage and controlled expenses before extending credit — your numbers suggest more groundwork is needed first.';
    }

    return {
        partialScore, partialBand, profitabilityScore, liquidityScore, marginPct,
        runwayMonths, isProfitable, netMonthlyBurn, expenseRatioPct,
        diagnosis, financingPreview,
    };
}

