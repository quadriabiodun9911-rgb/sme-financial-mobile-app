/**
 * Revenue Stress Test — "what happens if sales suddenly slow down?" as a
 * genuine decision tool, not a historical report: runs several revenue-
 * decline scenarios side by side (Current, -10%, -20%, -30%) and shows the
 * projected cash position, runway, and risk tier for each, then identifies
 * the specific revenue-decline percentage at which the business tips into
 * real vulnerability.
 *
 * Distinct from cfoMetrics.ts's computeRevenueShockImpact (Q6 on the CFO
 * Questions tab): that function answers ONE scenario at a time (a single
 * user-chosen miss %) and only returns a runway figure, no projected cash
 * balance and no multi-scenario comparison. This builds the table-shaped
 * view the product-vision document actually asks for, and adds the
 * genuinely new piece: a fine-grained scan (1% steps) for the exact
 * "vulnerability threshold" -- the smallest revenue drop at which risk
 * first reaches the 'warning' tier -- rather than only reporting whatever
 * three preset percentages happen to be shown.
 *
 * The four-tier risk scale (safe/caution/warning/critical) mirrors this
 * app's own "3+ months of runway = healthy" convention (finance.ts's
 * Liquidity factor, cfoMetrics.ts's CAUTION_BELOW_DAYS), split one tier
 * finer to match the product-vision example's four traffic-light colors.
 */

import { Transaction } from '../types';
import { computeAllTimeMonthlyBuckets } from './trendAnalysis';

export type StressRiskTier = 'safe' | 'caution' | 'warning' | 'critical';

export interface RevenueStressScenario {
    label: string; // 'Current', 'Revenue -10%', ...
    revenueDropPct: number;
    monthlyRevenue: number; // revenue AFTER applying the drop
    cashPosition: number;   // projected cash one month out under this scenario, floored at 0
    runwayMonths: number;   // Infinity when the scenario isn't net-burning cash
    risk: StressRiskTier;
}

export interface RevenueStressTestResult {
    available: boolean;
    reason?: string;
    currentMonthlyRevenue: number;
    currentMonthlyExpense: number;
    cashBalance: number;
    scenarios: RevenueStressScenario[];
    vulnerabilityThresholdPct: number | null; // smallest 1-99% drop where risk first reaches 'warning'; null if not reached within 99%
    insight: string;
}

const SCENARIO_DROPS_PCT = [0, 10, 20, 30];
const TRAILING_WINDOW_MONTHS = 3;

const EMPTY_RESULT = (reason: string): RevenueStressTestResult => ({
    available: false,
    reason,
    currentMonthlyRevenue: 0,
    currentMonthlyExpense: 0,
    cashBalance: 0,
    scenarios: [],
    vulnerabilityThresholdPct: null,
    insight: '',
});

function riskTierForRunway(runwayMonths: number): StressRiskTier {
    if (!Number.isFinite(runwayMonths)) return 'safe';
    if (runwayMonths > 6) return 'safe';
    if (runwayMonths > 3) return 'caution';
    if (runwayMonths > 1) return 'warning';
    return 'critical';
}

function buildScenario(
    dropPct: number,
    label: string,
    monthlyRevenue: number,
    monthlyExpense: number,
    cashBalance: number,
): RevenueStressScenario {
    const stressedRevenue = monthlyRevenue * (1 - dropPct / 100);
    const monthlyNetBurn = monthlyExpense - stressedRevenue; // negative = still cash-generating
    // A negative net burn genuinely ADDS to cash one month out -- flooring
    // the subtraction at "no change" would make every still-profitable
    // scenario show the same flat cash figure regardless of how much
    // profit shrank, hiding the very trend this table exists to show.
    const cashPosition = Math.max(0, cashBalance - monthlyNetBurn);
    const runwayMonths = monthlyNetBurn > 0 ? cashBalance / monthlyNetBurn : Infinity;
    return { label, revenueDropPct: dropPct, monthlyRevenue: stressedRevenue, cashPosition, runwayMonths, risk: riskTierForRunway(runwayMonths) };
}

export function computeRevenueStressTest(
    transactions: Transaction[],
    cashBalance: number,
    currency: string = '₦',
): RevenueStressTestResult {
    const monthly = computeAllTimeMonthlyBuckets(transactions);
    if (monthly.length === 0) {
        return EMPTY_RESULT('No transaction history yet — record some income and expenses to run a revenue stress test.');
    }

    const window = monthly.slice(-TRAILING_WINDOW_MONTHS);
    const currentMonthlyRevenue = window.reduce((s, m) => s + m.revenue, 0) / window.length;
    const currentMonthlyExpense = window.reduce((s, m) => s + m.expense, 0) / window.length;

    if (currentMonthlyRevenue <= 0) {
        return EMPTY_RESULT('No revenue recorded yet — a stress test needs a current revenue baseline to reduce.');
    }

    const scenarios = SCENARIO_DROPS_PCT.map(drop =>
        buildScenario(drop, drop === 0 ? 'Current' : `Revenue -${drop}%`, currentMonthlyRevenue, currentMonthlyExpense, cashBalance)
    );

    // Fine-grained (1%) scan for the exact tipping point into 'warning' or
    // worse -- the specific number the coarse -10/-20/-30 table can't show
    // on its own.
    let vulnerabilityThresholdPct: number | null = null;
    for (let pct = 1; pct <= 99; pct++) {
        const scenario = buildScenario(pct, '', currentMonthlyRevenue, currentMonthlyExpense, cashBalance);
        if (scenario.risk === 'warning' || scenario.risk === 'critical') {
            vulnerabilityThresholdPct = pct;
            break;
        }
    }

    const insight = vulnerabilityThresholdPct !== null
        ? `Your business becomes financially vulnerable if revenue falls approximately ${vulnerabilityThresholdPct}% without a corresponding reduction in expenses.`
        : 'Your business can absorb even a severe revenue drop without breaching a 3-month cash buffer — current cash reserves and cost structure provide strong protection.';

    return { available: true, currentMonthlyRevenue, currentMonthlyExpense, cashBalance, scenarios, vulnerabilityThresholdPct, insight };
}
