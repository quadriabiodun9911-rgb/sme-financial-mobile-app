/**
 * Return on Invested Capital -- NOPAT / (interest-bearing debt + equity).
 *
 * Deliberately distinct from Return on Assets/Equity (debtRatios.ts): those
 * measure return against everything the business owns, or against equity
 * alone, with non-interest-bearing operating liabilities (accounts payable)
 * folded into the balance-sheet identity but never treated as a capital
 * source of their own. ROIC isolates the return generated specifically on
 * capital that was deliberately invested by lenders and the owner -- so a
 * business leaning on supplier credit (cheap, non-financing leverage)
 * doesn't get graded as if that credit were investor capital.
 *
 * EBIT here is revenue - cogs - opex from the SAME monthly buckets
 * (trendAnalysis.ts's computeAllTimeMonthlyBuckets) the formal P&L's own
 * Operating Income line is built from -- otherExpense (interest, and any
 * other non-operating cost) is excluded by construction, so this can never
 * show a different operating profit than the P&L Statement does.
 *
 * The headline ROIC figure uses ALL-TIME cumulative EBIT against CURRENT
 * invested capital -- the same convention debtRatios.ts's own
 * returnOnAssets/returnOnEquity already use (all-time profit vs today's
 * balance sheet) -- so all three "return" ratios on the same screen agree
 * on what period they're each measuring.
 *
 * The trend reuses the exact quarterly-reconstruction pattern
 * cashFlowHealth.ts's own OCF trajectory already established: match
 * computeQuarterlyTrend's P&L quarters against computeBalanceSheetTrend's
 * dated balance-sheet reconstruction by quarter key, and classify direction
 * only once there's real multi-quarter data to support a verdict.
 */

import { Transaction, Asset, Loan } from '../types';
import { computeAllTimeMonthlyBuckets, computeQuarterlyTrend } from './trendAnalysis';
import { computeBalanceSheetTrend } from './balanceSheetTrend';
import { computeLiveLoanBalance } from './debtRatios';

export interface ROICQuarterPoint {
    quarter: string;
    label: string;
    roicPct: number | null; // null when that quarter's invested capital was <= 0
}

export type ROICTrendDirection = 'improving' | 'weakening' | 'volatile' | 'flat' | 'insufficient-data';

export interface ReturnOnInvestedCapitalResult {
    available: boolean;
    reason?: string;
    ebit: number;              // all-time cumulative operating profit
    nopat: number;              // ebit * (1 - taxRatePercent/100)
    taxRatePercent: number;
    investedCapital: number;    // current: outstanding loan principal + equity
    roicPct: number | null;     // null when investedCapital <= 0
    trend: {
        points: ROICQuarterPoint[]; // up to the last 4 quarters that have data
        direction: ROICTrendDirection;
        narrative: string;
    };
}

const UNAVAILABLE = (reason: string): ReturnOnInvestedCapitalResult => ({
    available: false, reason, ebit: 0, nopat: 0, taxRatePercent: 0, investedCapital: 0, roicPct: null,
    trend: { points: [], direction: 'insufficient-data', narrative: reason },
});

function clampPct(n: number): number {
    return Math.min(100, Math.max(0, n));
}

export function computeReturnOnInvestedCapital(
    transactions: Transaction[],
    assets: Asset[],
    loans: Loan[],
    equity: number,
    taxRatePercent: number,
): ReturnOnInvestedCapitalResult {
    if (transactions.length === 0) {
        return UNAVAILABLE('No transaction history yet.');
    }

    const monthly = computeAllTimeMonthlyBuckets(transactions);
    const rate = clampPct(taxRatePercent);
    const ebit = monthly.reduce((s, m) => s + (m.revenue - m.cogs - m.opex), 0);
    const nopat = ebit * (1 - rate / 100);
    const investedCapital = computeLiveLoanBalance(loans) + equity;
    const roicPct = investedCapital > 0 ? (nopat / investedCapital) * 100 : null;

    // ── Trend: up to the last 4 quarters that actually have data ──
    const quarterly = computeQuarterlyTrend(monthly);
    const recentQuarters = quarterly.slice(-4);
    const monthKeys = monthly.map(m => m.month);
    const bsTrend = computeBalanceSheetTrend('quarterly', monthKeys, transactions, assets, loans);

    const points: ROICQuarterPoint[] = recentQuarters.map(q => {
        const bs = bsTrend.find(p => p.key === q.quarter);
        const qEbit = q.revenue - q.cogs - q.opex;
        const qNopat = qEbit * (1 - rate / 100);
        const qInvestedCapital = bs ? bs.loansOutstanding + bs.netWorth : null;
        const qRoicPct = qInvestedCapital !== null && qInvestedCapital > 0 ? (qNopat / qInvestedCapital) * 100 : null;
        return { quarter: q.quarter, label: q.label, roicPct: qRoicPct };
    });

    let direction: ROICTrendDirection = 'insufficient-data';
    let narrative = "Not enough quarters of data yet to judge a trend — one quarter alone can't show whether return on invested capital is improving or weakening.";
    const scored = points.filter((p): p is ROICQuarterPoint & { roicPct: number } => p.roicPct !== null);
    if (scored.length >= 3) {
        const diffs: number[] = [];
        for (let i = 1; i < scored.length; i++) diffs.push(scored[i].roicPct - scored[i - 1].roicPct);
        const allImproving = diffs.every(d => d > 0);
        const allWeakening = diffs.every(d => d < 0);
        if (allImproving) {
            direction = 'improving';
            narrative = `Return on invested capital has improved for ${diffs.length} consecutive quarters.`;
        } else if (allWeakening) {
            direction = 'weakening';
            narrative = `Return on invested capital has declined for ${diffs.length} consecutive quarters.`;
        } else {
            const vals = scored.map(p => p.roicPct);
            const range = Math.max(...vals) - Math.min(...vals);
            const avgAbs = vals.reduce((s, v) => s + Math.abs(v), 0) / vals.length;
            if (avgAbs > 0 && range > avgAbs * 1.5) {
                direction = 'volatile';
                narrative = 'Return on invested capital has swung significantly between quarters — check for seasonality or one-off transactions before drawing a conclusion.';
            } else {
                direction = 'flat';
                narrative = 'Return on invested capital has stayed roughly stable across recent quarters.';
            }
        }
    } else if (scored.length === 2) {
        const diff = scored[1].roicPct - scored[0].roicPct;
        direction = diff > 0 ? 'improving' : diff < 0 ? 'weakening' : 'flat';
        narrative = diff > 0
            ? 'Return on invested capital improved vs the previous quarter — two points is early, but the direction is worth watching.'
            : diff < 0
                ? 'Return on invested capital declined vs the previous quarter — two points is early, but the direction is worth watching.'
                : 'Return on invested capital held flat vs the previous quarter.';
    }

    return {
        available: true,
        ebit, nopat, taxRatePercent: rate,
        investedCapital, roicPct,
        trend: { points, direction, narrative },
    };
}

// Strong when ROIC clears the benchmark (the business is creating value
// above its cost of capital), concerning when it falls meaningfully short
// -- a 5-point buffer (matching returnOnAssets' own 10%/5% spacing in
// debtRatios.ts) keeps a ROIC sitting right at the benchmark from flapping
// between verdicts.
export function scoreROICVsBenchmark(roicPct: number, benchmarkPct: number): 'strong' | 'stable' | 'concerning' {
    if (roicPct >= benchmarkPct) return 'strong';
    if (roicPct >= benchmarkPct - 5) return 'stable';
    return 'concerning';
}
