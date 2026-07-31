export type StressVerdict = 'safe' | 'caution' | 'critical';

export interface CashFlowStressTestInput {
    currentCashBalance: number;
    dailyBurn: number;              // canonical current daily burn (same source as Cash Runway)
    costIncreasePct: number;        // 0-100+, hypothetical fuel/freight/input cost inflation
    collectionsDelayDays: number;   // how many extra days before expected cash actually arrives
    delayedIncome: number;          // cash expected during that window that won't land on time (overdue AR, a delayed shipment's sale, etc.)
    inventoryValue?: number;        // total stock at cost price — when present, the cost-increase % is also shown against what it means for restocking
}

export interface StockRestockImpact {
    currentRestockCost: number;
    stressedRestockCost: number;
    extraCost: number;
}

export interface CashFlowStressTestResult {
    baselineRunwayDays: number;
    stressedDailyBurn: number;
    stressedRunwayDays: number;
    runwayLostDays: number;
    verdict: StressVerdict;
    reason: string;
    stockRestockImpact: StockRestockImpact | null;
}

const CRITICAL_BELOW_DAYS = 30;
const CAUTION_BELOW_DAYS = 90; // 3 months — same threshold Credit-Worthiness already uses for "healthy" cash flow

function runwayDays(cash: number, burn: number): number {
    if (cash <= 0) return 0;
    if (burn <= 0) return Infinity;
    return cash / burn;
}

// Not a forecast of what WILL happen — a "what if" the user sets themselves
// (cost inflation %, a specific delay), checked against real current cash
// and burn, the same honest framing as the other "what if" calculators on
// this tab. Quad360 has no live oil-price or FX feed to trigger this
// automatically; the input is deliberately the user's own assumption.
export function computeCashFlowStressTest(input: CashFlowStressTestInput): CashFlowStressTestResult {
    const { currentCashBalance, dailyBurn, costIncreasePct, collectionsDelayDays, delayedIncome, inventoryValue } = input;

    const baselineRunwayDays = runwayDays(currentCashBalance, dailyBurn);

    // Turns the abstract "cost increase %" into a concrete number for
    // inventory-carrying businesses: what would it actually cost to
    // restock what's currently on the shelf at the stressed price —
    // the number a retailer or distributor actually thinks in, rather
    // than an abstract daily-burn inflation figure.
    const stockRestockImpact: StockRestockImpact | null = (inventoryValue && inventoryValue > 0 && costIncreasePct > 0)
        ? (() => {
            const stressedRestockCost = inventoryValue * (1 + costIncreasePct / 100);
            return {
                currentRestockCost: inventoryValue,
                stressedRestockCost,
                extraCost: stressedRestockCost - inventoryValue,
            };
        })()
        : null;

    const stressedDailyBurn = dailyBurn * (1 + Math.max(0, costIncreasePct) / 100);
    // Cash that won't be there during the delay window is gone from the
    // buffer for the purposes of this test, same as it would be in reality.
    const effectiveCash = Math.max(0, currentCashBalance - Math.max(0, delayedIncome));
    const stressedRunwayDays = runwayDays(effectiveCash, stressedDailyBurn);

    const runwayLostDays = isFinite(baselineRunwayDays) && isFinite(stressedRunwayDays)
        ? baselineRunwayDays - stressedRunwayDays
        : 0;

    let verdict: StressVerdict;
    let reason: string;

    if (stressedRunwayDays < CRITICAL_BELOW_DAYS) {
        verdict = 'critical';
        reason = collectionsDelayDays > 0
            ? `Under this scenario, cash would run critically low in under a month — before the ${collectionsDelayDays}-day delay you're testing even resolves.`
            : `Under this scenario, cash would run critically low in under a month at the stressed cost level.`;
    } else if (stressedRunwayDays < CAUTION_BELOW_DAYS) {
        verdict = 'caution';
        reason = `Runway drops to ${Math.round(stressedRunwayDays)} days under this scenario — survivable, but with much less room to absorb anything else going wrong at the same time.`;
    } else {
        verdict = 'safe';
        reason = `Even under this scenario, runway stays above 3 months — the buffer can absorb this shock.`;
    }

    return { baselineRunwayDays, stressedDailyBurn, stressedRunwayDays, runwayLostDays, verdict, reason, stockRestockImpact };
}
