/**
 * Goal Risk Linkage — answers "what could stop me from reaching THIS goal,
 * specifically" instead of the general, goal-independent risk view
 * riskRadar.ts already provides on the Dashboard/Scoreboard.
 *
 * Deliberately does not compute anything new: it filters two already-real,
 * already-computed signals down to whichever ones are actually relevant to
 * a given goal type --
 *   - financialDiagnosisEngine's RootCauseAnalysis[] (severity, real
 *     financialImpact, root cause, opportunity), narrowed by `dimension`
 *   - riskRadar's categories (debt coverage, customer/supplier/lender
 *     concentration, seasonal, economic), narrowed by category key
 * -- then combines that with Goal Bridge's already-computed
 * successProbability into one "Growth Readiness" score. No probability or
 * impact number here is invented: growthReadiness is a deterministic
 * function of two real inputs (successProbability and the count/severity of
 * real risks found), the same way riskRadar's own overallLevel is derived
 * from its real category levels rather than a separately guessed number.
 *
 * `custom` goals have no clean dimension/category mapping (same reasoning
 * financialDiagnosisEngine's suggestedGoalType already applies) -- for
 * those, every diagnosis/risk category is considered relevant rather than
 * silently showing nothing.
 */

import { GoalType } from '../types';
import { RootCauseAnalysis, HealthCategory } from './financialDiagnosisEngine';
import { RiskRadar, RiskRadarCategory } from './riskRadar';

export type GoalRiskSeverity = 'high' | 'medium' | 'low';

export interface GoalRiskItem {
    source: 'diagnosis' | 'riskRadar';
    label: string;
    /** A short phrase for the narrative sentence ("it's ___") -- `label` for a
     *  diagnosis-sourced risk is a full formatted sentence with its own
     *  numbers ("Debt Service Coverage Ratio is 0.18..."), which reads as a
     *  run-on when concatenated after "it's"; this is the same real signal
     *  named briefly instead. */
    shortLabel: string;
    severity: GoalRiskSeverity;
    /** Real currency figure from the diagnosis engine; 0 when the source (a riskRadar category) has no dollar figure of its own. */
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
};

export interface GoalRiskAssessment {
    risks: GoalRiskItem[]; // worst-first: severity desc, then financialImpact desc
    growthReadiness: number; // 0-100
    readinessBand: 'Strong' | 'Moderate' | 'Weak';
    narrative: string;
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
    custom: [],
};

const GOAL_RELEVANT_RISK_CATEGORIES: Record<GoalType, RiskRadarCategory['key'][]> = {
    revenue_growth: ['customerConcentration', 'economic', 'seasonal'],
    margin_improvement: ['economic', 'supplierConcentration'],
    cost_reduction: ['supplierConcentration', 'economic'],
    cash_reserve: ['debtCoverage', 'lenderConcentration', 'seasonal'],
    reduce_overdue_ar: ['customerConcentration'],
    custom: [],
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

export function assessGoalRisk(
    goalType: GoalType,
    diagnoses: RootCauseAnalysis[],
    riskRadar: RiskRadar,
    successProbability: number, // GoalBridge.successProbability, 0-1
): GoalRiskAssessment {
    const relevantDimensions = GOAL_RELEVANT_DIMENSIONS[goalType];
    const relevantCategories = GOAL_RELEVANT_RISK_CATEGORIES[goalType];
    // 'custom' has no mapping -- fall back to everything rather than showing nothing.
    const dimensionFilter = relevantDimensions.length > 0 ? relevantDimensions : null;
    const categoryFilter = relevantCategories.length > 0 ? relevantCategories : null;

    const risks: GoalRiskItem[] = [];

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
        const severity = riskLevelSeverity(c.level);
        if (!severity) continue;
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

    const narrative = risks.length === 0
        ? 'No major risks currently threaten this goal — a clear runway to hit your target.'
        : `Your biggest constraint right now isn't the goal itself — it's ${risks[0].shortLabel}.`;

    return { risks, growthReadiness, readinessBand, narrative };
}
