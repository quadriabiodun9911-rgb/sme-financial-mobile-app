/**
 * Goal Risk Linkage — answers "what could stop me from reaching THIS goal,
 * specifically" instead of the general, goal-independent risk view
 * riskRadar.ts already provides on the Dashboard/Scoreboard.
 *
 * Deliberately does not compute anything new: it filters three already-real,
 * already-computed signals down to whichever ones are actually relevant to
 * a given goal type --
 *   - financialDiagnosisEngine's RootCauseAnalysis[] (severity, real
 *     financialImpact, root cause, opportunity), narrowed by `dimension`
 *   - riskRadar's categories (debt coverage, customer/supplier/lender
 *     concentration, seasonal, economic), narrowed by category key
 *   - externalFactorsPanel's items -- the owner's own macro assumptions
 *     (inflation, FX, demand...) scored against how much of THIS business's
 *     revenue/costs actually run through what they affect (exposurePct,
 *     corroborated), narrowed by MacroDriver. This is what answers "how
 *     sensitive is this goal to micro/macro economics" -- never a predicted
 *     inflation number of its own, only the real % change the owner logged,
 *     translated into what it would mean for their own books.
 *   - inventoryIntelligence's InventoryGoalSignal -- real restocking pace
 *     and stockout risk (buildInventoryGoalSignal), surfaced wherever
 *     inventory could actually undermine the goal in question: a cost-
 *     cutting target that would have to bite into restocking spend, or a
 *     revenue/cash/concentration goal that depends on having stock to sell
 *     while items are already close to running out.
 * -- then combines all of that with Goal Bridge's already-computed
 * successProbability into one "Growth Readiness" score. No probability or
 * impact number here is invented: growthReadiness is a deterministic
 * function of two real inputs (successProbability and the count/severity of
 * real risks found), the same way riskRadar's own overallLevel is derived
 * from its real category levels rather than a separately guessed number.
 *
 * `custom` goals have no clean dimension/category/driver mapping (same
 * reasoning financialDiagnosisEngine's suggestedGoalType already applies) --
 * for those, every diagnosis/risk category/external factor is considered
 * relevant rather than silently showing nothing.
 */

import { GoalType } from '../types';
import { RootCauseAnalysis, HealthCategory } from './financialDiagnosisEngine';
import { RiskRadar, RiskRadarCategory } from './riskRadar';
import { ExternalFactorsPanel, ImpactLevel } from './externalFactorsPanel';
import { MacroDriver } from '../types';
import { InventoryGoalSignal } from './inventoryIntelligence';

export type GoalRiskSeverity = 'high' | 'medium' | 'low';

export interface GoalRiskItem {
    source: 'diagnosis' | 'riskRadar' | 'external' | 'inventory';
    label: string;
    /** A short phrase for the narrative sentence ("it's ___") -- `label` for a
     *  diagnosis-sourced risk is a full formatted sentence with its own
     *  numbers ("Debt Service Coverage Ratio is 0.18..."), which reads as a
     *  run-on when concatenated after "it's"; this is the same real signal
     *  named briefly instead. */
    shortLabel: string;
    severity: GoalRiskSeverity;
    /** Real currency figure from the diagnosis engine; 0 when the source (a riskRadar category or external factor) has no dollar figure of its own. */
    financialImpact: number;
    summary: string;
    action: string;
}

// Brief, narrative-friendly name for each diagnosis dimension -- riskRadar
// category labels are already short (e.g. "Debt Coverage") and used as-is.
const DIMENSION_SHORT_LABEL: Record<HealthCategory['key'], string> = {
    profitability: 'your profit margin',
    liquidity: 'your cash position',
    workingCapital: 'your cash conversion cycle',
    debt: 'your debt service coverage',
    inventory: 'slow-moving inventory',
    concentration: 'customer or supplier concentration',
    efficiency: 'rising costs relative to revenue',
    // No diagnosis currently sets dimension: 'cashFlow' (financialDiagnosisEngine.ts
    // has no diagnoseCashFlow yet -- the Cash Flow factor only feeds the
    // overall score today), but HealthCategory['key'] requires every key be
    // covered here regardless.
    cashFlow: 'weak cash conversion',
};

export interface GoalRiskDataGap {
    label: string;
    note: string; // riskRadar's own explanation of what's missing (e.g. "Add your economic assumptions in Settings to see this.")
}

export interface GoalRiskAssessment {
    risks: GoalRiskItem[]; // worst-first: severity desc, then financialImpact desc
    growthReadiness: number; // 0-100
    readinessBand: 'Strong' | 'Moderate' | 'Weak';
    narrative: string;
    // Risk-radar categories relevant to this goal type that couldn't be
    // assessed at all (riskRadar's own 'no-data' level) -- surfaced
    // separately from `risks` so a category like Economic Risk (inflation,
    // demand) doesn't just silently vanish when macro assumptions haven't
    // been set in Settings. Never a fabricated risk; just an honest "this
    // can't be assessed yet, and here's why."
    dataGaps: GoalRiskDataGap[];
}

// Which diagnosis dimensions and risk-radar categories actually threaten
// each goal type. A goal about margin doesn't care about seasonal timing;
// a goal about cash reserves doesn't care about supplier concentration.
const GOAL_RELEVANT_DIMENSIONS: Record<GoalType, HealthCategory['key'][]> = {
    revenue_growth: ['profitability', 'liquidity', 'workingCapital', 'concentration'],
    margin_improvement: ['profitability', 'efficiency', 'concentration'],
    cost_reduction: ['efficiency', 'concentration'],
    cash_reserve: ['liquidity', 'workingCapital', 'debt'],
    reduce_overdue_ar: ['liquidity', 'workingCapital', 'concentration'],
    customer_concentration: ['concentration'],
    supplier_concentration: ['concentration'],
    custom: [],
};

const GOAL_RELEVANT_RISK_CATEGORIES: Record<GoalType, RiskRadarCategory['key'][]> = {
    revenue_growth: ['customerConcentration', 'economic', 'seasonal'],
    margin_improvement: ['economic', 'supplierConcentration'],
    cost_reduction: ['supplierConcentration', 'economic'],
    cash_reserve: ['debtCoverage', 'lenderConcentration', 'seasonal'],
    reduce_overdue_ar: ['customerConcentration'],
    customer_concentration: ['customerConcentration'],
    supplier_concentration: ['supplierConcentration'],
    custom: [],
};

// Which of the owner's own macro assumptions (externalFactorsPanel.ts)
// actually bear on each goal type -- a revenue goal lives or dies on
// demand, a margin/cost goal on input costs, a cash goal on both. Empty
// list (custom) falls back to "everything," same convention as the two
// maps above.
const GOAL_RELEVANT_EXTERNAL_DRIVERS: Record<GoalType, MacroDriver[]> = {
    revenue_growth: ['demand'],
    margin_improvement: ['energy', 'fx', 'interestRate', 'inflation', 'commodity', 'supplyChain'],
    cost_reduction: ['energy', 'fx', 'interestRate', 'inflation', 'commodity', 'supplyChain'],
    cash_reserve: ['demand', 'interestRate', 'inflation'],
    reduce_overdue_ar: ['demand'],
    customer_concentration: ['demand'],
    supplier_concentration: ['supplyChain', 'fx', 'commodity'],
    custom: [],
};

// Whether inventory could realistically undermine a given goal type at
// all -- a receivables-collection or customer-diversification goal has no
// real inventory dependency, so it's left out rather than showing a
// stockout warning that has nothing to do with the goal.
const GOAL_CARES_ABOUT_INVENTORY: Record<GoalType, boolean> = {
    revenue_growth: true,       // can't sell what's out of stock
    margin_improvement: true,   // restocking is a real cost pressure on margin
    cost_reduction: true,       // this is the one most likely to bite into restocking spend
    cash_reserve: true,         // restocking spend is lumpy, not a smooth monthly draw
    reduce_overdue_ar: false,
    customer_concentration: false,
    supplier_concentration: true, // a second supplier is exactly how this goal protects stock continuity
    custom: true,
};

// Grounded in what the driver actually is, not a generic "watch this
// closely" -- a concrete, driver-specific move the owner can make before
// the assumption (if it plays out) actually hits.
const EXTERNAL_DRIVER_ACTION: Record<MacroDriver, string> = {
    energy: 'Lock in supplier rates where possible and build the extra cost into pricing before it erodes margin.',
    fx: 'Price with a buffer, or hold some reserves in the currency you actually pay suppliers in.',
    interestRate: 'Avoid new variable-rate debt until this settles, or lock in a fixed rate now.',
    inflation: 'Review pricing on a shorter cycle so costs don\'t quietly outrun what you charge.',
    commodity: 'Qualify an alternate supplier or material so this goal isn\'t fully exposed to one price.',
    regulation: 'Confirm the real compliance cost before it takes effect, not after.',
    supplyChain: 'Build buffer stock or a backup supplier for anything on a single, fragile supply line.',
    demand: 'Watch conversion and repeat-purchase rate closely, and hold off on fixed-cost commitments until demand is confirmed.',
};

// A generic, category-level playbook line -- riskRadar categories don't
// carry their own recommended action the way a diagnosis's `opportunity`
// does, so this supplies one static line per category rather than
// inventing a number or leaving the action blank.
const RISK_CATEGORY_ACTION: Record<RiskRadarCategory['key'], string> = {
    debtCoverage: 'Improve income before taking on more debt-funded growth.',
    customerConcentration: "Diversify the customer base so this goal doesn't depend on one buyer.",
    supplierConcentration: 'Qualify a second supplier to protect this goal from a single vendor.',
    lenderConcentration: "Line up a second lending relationship so this goal doesn't depend on one bank line.",
    seasonal: 'Time major pushes toward this goal around your strongest historical months.',
    economic: "Watch input costs closely — rising costs can erase progress toward this goal.",
    cashFlow: 'Tighten collection on outstanding invoices so this goal is funded by real cash, not just paper profit.',
};

const SEVERITY_RANK: Record<GoalRiskSeverity, number> = { high: 0, medium: 1, low: 2 };

function diagnosisSeverity(s: RootCauseAnalysis['severity']): GoalRiskSeverity {
    return s === 'critical' ? 'high' : s === 'warning' ? 'medium' : 'low';
}

function riskLevelSeverity(level: RiskRadarCategory['level']): GoalRiskSeverity | null {
    if (level === 'high') return 'high';
    if (level === 'medium') return 'medium';
    if (level === 'low') return 'low';
    return null; // 'no-data' is never shown as a risk
}

// 'positive' means this factor is a tailwind (e.g. strengthening demand) --
// real, but an opportunity rather than something that could stop the goal,
// so it's left out of the risk list entirely rather than forced into a
// severity that misrepresents it.
function externalImpactSeverity(level: ImpactLevel): GoalRiskSeverity | null {
    if (level === 'high') return 'high';
    if (level === 'medium') return 'medium';
    if (level === 'low') return 'low';
    return null;
}

// What running low on stock specifically threatens, per goal type -- the
// underlying fact (n items close to running out) is the same everywhere,
// but what it means for a revenue goal (can't sell it) is a different
// sentence than what it means for a cash goal (an unplanned cash draw) or
// a cost-cutting goal (a bad time to tighten spend).
function inventoryStockoutSummary(goalType: GoalType, n: number, plural: boolean): string {
    const are = plural ? 'are' : 'is';
    switch (goalType) {
        case 'revenue_growth':
            return `${n} item${plural ? 's' : ''} ${are} within about 2 weeks of running out -- you can't grow sales on stock you don't have.`;
        case 'cash_reserve':
            return `${n} item${plural ? 's' : ''} ${are} close to running out. Restocking them draws down cash sooner than a smooth monthly average would suggest.`;
        case 'margin_improvement':
            return `${n} item${plural ? 's' : ''} ${are} close to running out. A rushed, last-minute reorder usually costs more per unit than a planned one, eating into margin.`;
        case 'supplier_concentration':
            return `${n} item${plural ? 's' : ''} ${are} close to running out -- exactly where depending on a single supplier would hurt most.`;
        default:
            return `${n} item${plural ? 's' : ''} ${are} within about 2 weeks of running out. Cutting spend right now risks delaying a restock you actually need.`;
    }
}

export function assessGoalRisk(
    goalType: GoalType,
    diagnoses: RootCauseAnalysis[],
    riskRadar: RiskRadar,
    successProbability: number, // GoalBridge.successProbability, 0-1
    externalFactorsPanel: ExternalFactorsPanel, // computeExternalFactorsPanel(transactions, macroAssumptions)
    inventorySignal: InventoryGoalSignal, // buildInventoryGoalSignal(inventory, transactions, avgMonthlyExpense)
): GoalRiskAssessment {
    const relevantDimensions = GOAL_RELEVANT_DIMENSIONS[goalType];
    const relevantCategories = GOAL_RELEVANT_RISK_CATEGORIES[goalType];
    const relevantDrivers = GOAL_RELEVANT_EXTERNAL_DRIVERS[goalType];
    // 'custom' has no mapping -- fall back to everything rather than showing nothing.
    const dimensionFilter = relevantDimensions.length > 0 ? relevantDimensions : null;
    const categoryFilter = relevantCategories.length > 0 ? relevantCategories : null;
    const driverFilter = relevantDrivers.length > 0 ? relevantDrivers : null;

    const risks: GoalRiskItem[] = [];
    const dataGaps: GoalRiskDataGap[] = [];

    for (const d of diagnoses) {
        if (dimensionFilter && !dimensionFilter.includes(d.dimension)) continue;
        risks.push({
            source: 'diagnosis',
            label: d.problem,
            shortLabel: DIMENSION_SHORT_LABEL[d.dimension],
            severity: diagnosisSeverity(d.severity),
            financialImpact: Math.abs(d.financialImpact),
            summary: d.impact,
            action: d.opportunity,
        });
    }

    for (const c of riskRadar.categories) {
        if (categoryFilter && !categoryFilter.includes(c.key)) continue;
        // riskRadar's 'economic' category is one generic line averaged
        // across every assumption; the per-assumption loop below (real
        // exposurePct, corroboration, driver-specific action) replaces it
        // once assumptions actually exist, so skip the duplicate here --
        // but still fall through when there's genuinely no data, so the
        // "add your assumptions" dataGap prompt below still fires.
        if (c.key === 'economic' && externalFactorsPanel.items.length > 0) continue;
        const severity = riskLevelSeverity(c.level);
        if (!severity) {
            if (c.level === 'no-data') dataGaps.push({ label: c.label, note: c.summary });
            continue;
        }
        risks.push({
            source: 'riskRadar',
            label: c.label,
            shortLabel: c.label.toLowerCase(),
            severity,
            financialImpact: 0,
            summary: c.summary,
            action: RISK_CATEGORY_ACTION[c.key],
        });
    }

    // The owner's own macro assumptions, scored against how exposed THIS
    // business's own revenue/costs actually are (externalFactorsPanel.ts) --
    // the "how sensitive is this goal to micro/macro economics" signal,
    // one row per assumption rather than one averaged line.
    for (const item of externalFactorsPanel.items) {
        if (driverFilter && !driverFilter.includes(item.driver)) continue;
        const severity = externalImpactSeverity(item.impactLevel);
        if (!severity) continue; // 'positive' -- a tailwind, not a risk
        risks.push({
            source: 'external',
            label: item.label,
            shortLabel: item.driver === 'demand' ? 'demand for your products' : `${item.label.toLowerCase()} exposure`,
            severity,
            financialImpact: 0,
            summary: item.sentence,
            action: EXTERNAL_DRIVER_ACTION[item.driver],
        });
    }

    // Stockout risk -- real, dated items within computeInventoryForecast's
    // own low-stock window (inventoryIntelligence.ts), surfaced with what
    // it specifically means for THIS goal type rather than one generic
    // "restock soon" line.
    if (GOAL_CARES_ABOUT_INVENTORY[goalType] && inventorySignal.atRiskItemCount > 0) {
        const n = inventorySignal.atRiskItemCount;
        const plural = n > 1;
        risks.push({
            source: 'inventory',
            label: `${n} item${plural ? 's' : ''} close to running out of stock`,
            shortLabel: 'low stock risk',
            severity: n >= 3 ? 'high' : 'medium',
            financialImpact: 0,
            summary: inventoryStockoutSummary(goalType, n, plural),
            action: 'Reorder these items before they run out, and build that cost into this goal\'s near-term plan rather than treating it as a surprise.',
        });
    }

    // Inventory-heavy cost base -- only meaningful for a goal that's
    // literally about cutting spend: if restocking is already a large share
    // of expenses, hitting the target by cutting it indiscriminately risks
    // under-stocking just to make a number move.
    if (goalType === 'cost_reduction' && inventorySignal.purchasesPctOfExpenses !== null && inventorySignal.purchasesPctOfExpenses >= 20) {
        const pct = inventorySignal.purchasesPctOfExpenses;
        risks.push({
            source: 'inventory',
            label: `Inventory restocking is ${pct.toFixed(0)}% of your expenses`,
            shortLabel: 'inventory spend',
            severity: pct >= 40 ? 'high' : 'medium',
            financialImpact: 0,
            summary: 'A large share of what you spend goes toward keeping stock on hand. Cutting this category to hit your target risks under-stocking just to make the number move.',
            action: 'Set a lighter, separate target for inventory spend and focus the rest of the cut on other categories first.',
        });
    }

    risks.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.financialImpact - a.financialImpact);

    // Deterministic combination of two real signals: Goal Bridge's own
    // feasibility-derived successProbability, penalized by the real risks
    // found above -- never a separately invented number.
    const highCount = risks.filter(r => r.severity === 'high').length;
    const mediumCount = risks.filter(r => r.severity === 'medium').length;
    const growthReadiness = Math.max(0, Math.min(100,
        successProbability * 100 - highCount * 12 - mediumCount * 6,
    ));
    const readinessBand: GoalRiskAssessment['readinessBand'] =
        growthReadiness >= 70 ? 'Strong' : growthReadiness >= 45 ? 'Moderate' : 'Weak';

    // A 'low'-severity risk-radar item can mean "confirmed fine" rather
    // than "a small amount of risk" (e.g. debtCoverage/lenderConcentration
    // report 'low' for a business with no loans at all -- see riskRadar.ts)
    // -- risks[0] can land on one of those when it's the only thing found,
    // which would otherwise crown "no dependency on a single lender" as
    // "your biggest constraint." The severity-based growthReadiness penalty
    // already treats 'low' as no real risk (0 points docked); the narrative
    // now agrees, and only names a risk that's actually medium/high.
    const topRealRisk = risks.find(r => r.severity !== 'low');
    const narrative = !topRealRisk
        ? 'No major risks currently threaten this goal — a clear runway to hit your target.'
        : `Your biggest constraint right now isn't the goal itself — it's ${topRealRisk.shortLabel}.`;

    return { risks, growthReadiness, readinessBand, narrative, dataGaps };
}
