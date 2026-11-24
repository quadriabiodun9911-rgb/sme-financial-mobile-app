/**
 * Quad360 SME Productivity Assessment — pulls the productivity-relevant
 * signals already computed elsewhere in the app into one scored view,
 * rather than leaving an owner to piece it together from five different
 * screens (Margin Watch, Inventory, Cash Flow, Scoreboard, Analysis).
 * Every factor reuses an existing, already-shipped computation; this file
 * adds no new financial logic of its own beyond the weighting and bands
 * used to combine them.
 *
 * Deliberately distinct from computeRiskScore / computeFinancingReadinessScore
 * (finance.ts, fundingReadiness.ts): those ask "how healthy / fundable is
 * this business," weighted toward solvency and lending risk. This asks a
 * different question -- "how efficiently is this business using the
 * money, inventory and time it already has" -- so it reuses some of the
 * SAME underlying numbers (cash conversion cycle, slow-moving inventory
 * %, via scoreCashConversionCycle/scoreSlowMovingInventoryPct, finance.ts)
 * but never the same overall SCORE, and deliberately excludes signals
 * that matter for lending (customer/supplier concentration, cash runway)
 * but say nothing about resource efficiency.
 *
 * Labour productivity is reported but never scored: this app has no
 * reliable way to tell whether high output-per-employee reflects genuine
 * efficiency or overwork, understaffing, or declining quality, so scoring
 * it would claim a judgment the underlying data can't support -- the same
 * caution the product brief for this feature states explicitly.
 *
 * Inventory Efficiency is excluded (not penalized, and not scored as
 * neutral either) for a business with no inventory recorded at all --
 * "not every metric applies to every business" -- and the overall score
 * reweights across whatever factors genuinely apply, the same
 * available-factors-only blend computeBudgetHealth/computeRiskScore
 * already use elsewhere in this app.
 */

import { Transaction, Asset, InventoryItem, StaffMember, Loan, BadDebtProvision, ReceivableWriteOff, InventoryWriteDown } from '../types';
import { computeEnhancedPnL, scoreProfitabilityMargin, scoreCashConversionCycle, scoreSlowMovingInventoryPct, computeWorkingCapitalMetrics, RiskScore } from './finance';
import { computeStockVelocity, computeInventoryValue } from './stockVelocity';
import { computeLaborProductivity } from './laborProductivity';
import { computeQualityOfGrowth } from './qualityOfGrowth';

export type ProductivityFactorKey = 'profitability' | 'costEfficiency' | 'inventoryEfficiency' | 'cashVelocity' | 'trajectory';

export interface ProductivityFactor {
    key: ProductivityFactorKey;
    label: string;
    available: boolean;
    score: number;  // meaningless when available is false
    weight: number; // the weight actually used in the blend -- 0 when unavailable
    value: string;  // headline figure, e.g. "42 days", "18% of inventory value"
    explanation: string;
}

export interface LaborProductivitySnapshot {
    available: boolean;
    reason?: string;
    revenuePerEmployee: number;
    laborCostPctOfRevenue: number;
    activeStaffCount: number;
    periodLabel: string;
    note?: string;
}

export interface ProductivityAssessment {
    available: boolean;
    reason?: string;
    score: number; // 0-100, meaningless when available is false
    band: RiskScore['band'];
    factors: ProductivityFactor[];
    // Reported alongside the scored factors, never folded into the score
    // itself -- see this file's own header comment for why.
    laborProductivity: LaborProductivitySnapshot;
    priorityFactor: ProductivityFactor | null; // the lowest-scoring AVAILABLE factor
    narrative: string;
}

const WEIGHTS: Record<ProductivityFactorKey, number> = {
    profitability: 20,
    costEfficiency: 20,
    inventoryEfficiency: 15,
    cashVelocity: 20,
    trajectory: 25,
};

// Same band cutoffs RiskScore's own band already uses (finance.ts) --
// reused by name (RiskScore['band']) so a reader sees one consistent
// banding vocabulary across this app's scores, not a second scale that
// happens to use the same five words for different cutoffs.
const BAND_CUTOFFS = { Excellent: 85, Strong: 70, Moderate: 50, Weak: 30 } as const;

function bandForScore(score: number): RiskScore['band'] {
    if (score >= BAND_CUTOFFS.Excellent) return 'Excellent';
    if (score >= BAND_CUTOFFS.Strong) return 'Strong';
    if (score >= BAND_CUTOFFS.Moderate) return 'Moderate';
    if (score >= BAND_CUTOFFS.Weak) return 'Weak';
    return 'Critical';
}

// No existing exported score function for this ratio to reuse: the
// Operating Expense Ratio computation in quickHealthCheck.ts takes manual
// onboarding-estimate inputs, not real transaction history, so it isn't a
// canonical figure this file can reuse for a different purpose.
function scoreOpexRatio(pct: number): number {
    return pct <= 50 ? 100 : pct <= 65 ? 70 : pct <= 80 ? 40 : 10;
}

const UNAVAILABLE = (reason: string): ProductivityAssessment => ({
    available: false, reason, score: 0, band: 'Critical', factors: [],
    laborProductivity: { available: false, reason: 'No transaction history yet.', revenuePerEmployee: 0, laborCostPctOfRevenue: 0, activeStaffCount: 0, periodLabel: '' },
    priorityFactor: null, narrative: '',
});

export function computeProductivityAssessment(
    transactions: Transaction[],
    assets: Asset[],
    inventory: InventoryItem[],
    staff: StaffMember[],
    loans: Loan[],
    badDebtProvisions: BadDebtProvision[] = [],
    receivableWriteOffs: ReceivableWriteOff[] = [],
    inventoryWriteDowns: InventoryWriteDown[] = [],
): ProductivityAssessment {
    if (transactions.length === 0) {
        return UNAVAILABLE('No transaction history yet — record income and expenses to run a productivity assessment.');
    }

    const pnl = computeEnhancedPnL(transactions, assets, badDebtProvisions, receivableWriteOffs, inventoryWriteDowns);
    const hasRevenueHistory = pnl.revenue > 0;

    const factors: ProductivityFactor[] = [];

    // 1. Profitability -- gross margin (COGS-based), the same
    // scoreProfitabilityMargin computeRiskScore's own Profitability
    // factor uses.
    factors.push({
        key: 'profitability', label: 'Profitability (Gross Margin)',
        available: hasRevenueHistory,
        score: hasRevenueHistory ? scoreProfitabilityMargin(pnl.grossMargin) : 0,
        weight: hasRevenueHistory ? WEIGHTS.profitability : 0,
        value: hasRevenueHistory ? `${pnl.grossMargin.toFixed(1)}%` : 'No revenue recorded yet',
        explanation: hasRevenueHistory
            ? `Gross margin is ${pnl.grossMargin.toFixed(1)}% -- ${pnl.grossMargin >= 20 ? 'strong' : pnl.grossMargin >= 10 ? 'moderate' : pnl.grossMargin >= 0 ? 'thin' : 'negative'}, after direct/COGS costs.`
            : 'No revenue recorded yet to measure a margin from.',
    });

    // 2. Cost efficiency -- operating (SG&A) expenses as a share of
    // revenue, distinct from gross margin above (which is COGS-based) so
    // the two factors never score the same underlying signal twice.
    const opexRatioPct = hasRevenueHistory ? (pnl.sgaExpenses / pnl.revenue) * 100 : null;
    factors.push({
        key: 'costEfficiency', label: 'Cost Efficiency (Operating Expense Ratio)',
        available: opexRatioPct !== null,
        score: opexRatioPct !== null ? scoreOpexRatio(opexRatioPct) : 0,
        weight: opexRatioPct !== null ? WEIGHTS.costEfficiency : 0,
        value: opexRatioPct !== null ? `${opexRatioPct.toFixed(0)}% of revenue` : 'No revenue recorded yet',
        explanation: opexRatioPct !== null
            ? `Operating expenses take up ${opexRatioPct.toFixed(0)}% of revenue -- ${
                opexRatioPct <= 50 ? 'efficient overhead.' :
                opexRatioPct <= 65 ? 'manageable, but worth watching.' :
                opexRatioPct <= 80 ? 'overhead is eating heavily into margin.' :
                                     'overhead is consuming nearly all of revenue.'
            }`
            : 'No revenue recorded yet to measure an expense ratio from.',
    });

    // 3. Inventory efficiency -- % of stock value sitting in slow movers.
    // Excluded entirely (not scored, not penalized) for a business with
    // no inventory recorded -- "not every metric applies to every
    // business" -- rather than defaulting it to neutral-good the way
    // computeRiskScore's own Inventory factor does for a different
    // purpose (a general risk score crediting "nothing to flag").
    let inventoryFactor: ProductivityFactor;
    if (inventory.length === 0) {
        inventoryFactor = {
            key: 'inventoryEfficiency', label: 'Inventory Efficiency',
            available: false, score: 0, weight: 0,
            value: 'No inventory recorded',
            explanation: 'This business doesn\'t track inventory — not applicable to this assessment.',
        };
    } else {
        const totalValue = computeInventoryValue(inventory);
        const slowValue = inventory
            .filter(i => computeStockVelocity(i, transactions).tier === 'slow')
            .reduce((s, i) => s + i.quantity * (i.costPrice ?? 0), 0);
        const slowPct = totalValue > 0 ? (slowValue / totalValue) * 100 : 0;
        inventoryFactor = {
            key: 'inventoryEfficiency', label: 'Inventory Efficiency',
            available: true,
            score: scoreSlowMovingInventoryPct(slowPct),
            weight: WEIGHTS.inventoryEfficiency,
            value: `${slowPct.toFixed(0)}% of inventory value in slow movers`,
            explanation: `${slowPct.toFixed(0)}% of inventory value is sitting in slow-moving stock -- ${
                slowPct <= 15 ? 'a healthy turnover.' :
                slowPct <= 35 ? 'worth reviewing which items aren\'t selling.' :
                                'a lot of cash tied up in stock that isn\'t moving.'
            }`,
        };
    }
    factors.push(inventoryFactor);

    // 4. Cash velocity -- cash conversion cycle, the same
    // scoreCashConversionCycle computeRiskScore's own Working Capital
    // factor uses.
    const wc = computeWorkingCapitalMetrics(transactions);
    const hasWcData = transactions.some(t => t.status === 'paid');
    factors.push({
        key: 'cashVelocity', label: 'Cash Velocity (Conversion Cycle)',
        available: hasWcData,
        score: hasWcData ? scoreCashConversionCycle(wc.ccc) : 0,
        weight: hasWcData ? WEIGHTS.cashVelocity : 0,
        value: hasWcData ? `${Math.round(wc.ccc)} days` : 'Not enough paid transaction history',
        explanation: hasWcData
            ? `Cash is tied up for about ${Math.round(wc.ccc)} days between paying suppliers and collecting from customers -- ${
                wc.ccc <= 15 ? 'cash returns quickly.' :
                wc.ccc <= 30 ? 'a reasonable cycle.' :
                wc.ccc <= 60 ? 'longer than ideal.' :
                               'a major drag on available cash.'
            }`
            : 'Not enough paid transaction history yet to measure a cash conversion cycle.',
    });

    // 5. Trajectory -- is the business becoming MORE productive over
    // time, not just where it stands today. Reuses computeQualityOfGrowth
    // verbatim -- never a second "is this improving" formula.
    const growth = computeQualityOfGrowth(transactions, assets, loans);
    factors.push({
        key: 'trajectory', label: 'Trajectory (Quality of Growth)',
        available: growth.available,
        score: growth.available ? growth.score : 0,
        weight: growth.available ? WEIGHTS.trajectory : 0,
        value: growth.available ? `${growth.band} (${growth.periodLabel})` : 'Not enough history yet',
        explanation: growth.available ? growth.verdict : (growth.reason ?? 'Not enough history yet to call a trend.'),
    });

    const availableFactors = factors.filter(f => f.available);
    const totalWeight = availableFactors.reduce((s, f) => s + f.weight, 0);
    const score = totalWeight > 0
        ? Math.round(availableFactors.reduce((s, f) => s + f.score * f.weight, 0) / totalWeight)
        : 0;

    // Labour productivity -- reported, never scored. See this file's own
    // header comment for why.
    const labor = computeLaborProductivity(transactions, staff);
    const laborProductivity: LaborProductivitySnapshot = labor.available
        ? {
            available: true,
            revenuePerEmployee: labor.revenuePerEmployee,
            laborCostPctOfRevenue: labor.laborCostPctOfRevenue,
            activeStaffCount: labor.activeStaffCount,
            periodLabel: labor.periodLabel,
            note: labor.note,
        }
        : { available: false, reason: labor.reason, revenuePerEmployee: 0, laborCostPctOfRevenue: 0, activeStaffCount: 0, periodLabel: '' };

    const priorityFactor = availableFactors.length > 0
        ? availableFactors.reduce((worst, f) => (f.score < worst.score ? f : worst))
        : null;

    const narrative = availableFactors.length === 0
        ? 'Not enough data yet to assess productivity.'
        : (priorityFactor ? `Priority to address: ${priorityFactor.label} — ${priorityFactor.explanation}` : '');

    return {
        available: availableFactors.length > 0,
        reason: availableFactors.length === 0 ? 'Not enough data yet to assess productivity.' : undefined,
        score, band: bandForScore(score), factors, laborProductivity, priorityFactor, narrative,
    };
}
