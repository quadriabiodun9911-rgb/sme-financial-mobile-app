/**
 * Financial Health Score — 8 Pillars: a REGROUPING of the same canonical
 * computeRiskScore into the 8-pillar taxonomy from the product-vision
 * document (Cash Health, Profitability, Working Capital, Expense Health,
 * Revenue Health, Debt Health, Resilience, Financial Readiness) -- not a
 * second, independently-computed score that could disagree with the one
 * already shown everywhere else in the app.
 *
 * The headline score/band returned here is EXACTLY riskScore.score/.band.
 * Every pillar below is either:
 *  - one of computeRiskScore's existing factors relabeled (Profitability,
 *    Debt),
 *  - a weight-blended pair of two existing factors, combined because the
 *    product-vision doc's own sub-items group them together (Cash Health =
 *    Liquidity + Operating Cash Flow; Working Capital = Working Capital +
 *    Inventory, since the doc explicitly lists inventory as a working-
 *    capital sub-item),
 *  - a customer-only reading of the SAME concentration data and SAME
 *    thresholds the existing Concentration factor uses, isolating the
 *    customer half the doc's "Revenue Health" pillar actually asks about
 *    (the existing factor takes the worse of customer OR supplier, which
 *    isn't specific enough for this pillar), or
 *  - reused verbatim from an already-existing standalone engine that has
 *    no slot in computeRiskScore's own factor list at all (Resilience ←
 *    computeBusinessResilience; Financial Readiness ← the same reweighted
 *    Financing Readiness score already shown on Credit-Worthiness).
 *
 * Nothing here invents new score math. See each pillar's inline comment
 * for exactly which existing computation it comes from.
 */

import { RiskScore, RiskFactor, computeCustomerConcentration, computeFinancingReadinessScore } from './finance';
import { BusinessResilience } from './businessExposure';
import { FinancialResilience } from './cashReservePlanning';
import { QualityOfGrowthResult } from './qualityOfGrowth';
import { Transaction } from './../types';

export type PillarStatus = 'good' | 'warning' | 'danger';

export interface FinancialHealthPillar {
    key: 'cash' | 'profitability' | 'workingCapital' | 'expense' | 'revenue' | 'debt' | 'resilience' | 'readiness';
    label: string;
    score: number; // 0-100
    status: PillarStatus;
    explanation: string;
}

export interface FinancialHealthPillarsResult {
    score: number; // == riskScore.score -- the one canonical Financial Health Score
    band: RiskScore['band'];
    pillars: FinancialHealthPillar[];
}

// Optional narrative-only enrichments -- these never change a pillar's
// SCORE (that would risk inventing new, disagreeing math), only add a
// supporting sentence to the two pillars whose product-vision sub-items
// reach beyond any single existing factor (Expense Health's "unusual
// spending"/"subscription leakage", Revenue Health's "recurring vs
// irregular"/"volatility").
export interface FinancialHealthPillarExtras {
    revenueVolatility?: 'stable' | 'variable' | 'volatile';
    revenueRecurringPct?: number;
    expenseLeakCount?: number;
    unusualSpendingCount?: number;
}

const STATUS_RANK: Record<PillarStatus, number> = { good: 0, warning: 1, danger: 2 };
function worseStatus(a: PillarStatus, b: PillarStatus): PillarStatus {
    return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;
}

function findFactor(factors: RiskFactor[], name: string): RiskFactor {
    const f = factors.find(x => x.name === name);
    if (!f) throw new Error(`computeFinancialHealthPillars: expected a "${name}" factor on the RiskScore passed in`);
    return f;
}

// Blends two existing factors by their own weights -- the same math
// computeGeneralHealthScore/computeFinancingReadinessScore already use to
// combine an arbitrary factor list into one score, just applied to a pair.
function blend(a: RiskFactor, b: RiskFactor): { score: number; status: PillarStatus } {
    const totalWeight = a.weight + b.weight;
    const score = totalWeight > 0
        ? Math.round((a.score * a.weight + b.score * b.weight) / totalWeight)
        : Math.round((a.score + b.score) / 2);
    return { score, status: worseStatus(a.status as PillarStatus, b.status as PillarStatus) };
}

// Identical thresholds/scores to computeRiskScore's own Concentration
// factor (finance.ts) -- see that factor's own comment for why 0% (no
// data) reads as neutral/warning rather than a guessed extreme.
function concentrationTier(pct: number): { score: number; status: PillarStatus } {
    if (pct === 0) return { score: 50, status: 'warning' };
    if (pct <= 20) return { score: 100, status: 'good' };
    if (pct <= 40) return { score: 60, status: 'warning' };
    return { score: 20, status: 'danger' };
}

export function computeFinancialHealthPillars(
    riskScore: RiskScore,
    transactions: Transaction[],
    resilienceResult: BusinessResilience,
    extras: FinancialHealthPillarExtras = {},
): FinancialHealthPillarsResult {
    const f = (name: string) => findFactor(riskScore.factors, name);

    // 1. Cash Health = Liquidity + Operating Cash Flow.
    const liquidity = f('Liquidity');
    const ocf = f('Operating Cash Flow');
    const cash = blend(liquidity, ocf);

    // 2. Profitability -- the existing factor, unchanged.
    const profitability = f('Profitability');

    // 3. Working Capital = Working Capital + Inventory (the product-vision
    // doc explicitly lists inventory as a working-capital sub-item).
    const workingCapitalFactor = f('Working Capital');
    const inventoryFactor = f('Inventory');
    const workingCapital = blend(workingCapitalFactor, inventoryFactor);

    // 4. Expense Health -- the existing Efficiency factor, score/status
    // unchanged; explanation enriched with expense-leak/unusual-spending
    // counts when supplied, since those sub-items (subscription leakage,
    // unusual spending) have no numeric slot in the Efficiency factor
    // itself.
    const efficiency = f('Efficiency');
    const expenseExtra: string[] = [];
    if (extras.expenseLeakCount && extras.expenseLeakCount > 0) {
        expenseExtra.push(`${extras.expenseLeakCount} recurring vendor charge${extras.expenseLeakCount !== 1 ? 's are' : ' is'} worth a review.`);
    }
    if (extras.unusualSpendingCount && extras.unusualSpendingCount > 0) {
        expenseExtra.push(`${extras.unusualSpendingCount} category${extras.unusualSpendingCount !== 1 ? 'ies show' : ' shows'} unusual spending this month.`);
    }
    const expense: FinancialHealthPillar = {
        key: 'expense', label: 'Expense Health', score: efficiency.score, status: efficiency.status as PillarStatus,
        explanation: [efficiency.explanation, ...expenseExtra].join(' '),
    };

    // 5. Revenue Health -- a customer-only concentration reading (the
    // existing Concentration factor takes the WORSE of customer or
    // supplier, which conflates two different risks; this pillar is
    // specifically about revenue, so it isolates the customer half),
    // enriched with revenue volatility / recurring-share when supplied.
    const custConc = computeCustomerConcentration(transactions);
    const topCustomerPct = custConc[0]?.percentage ?? 0;
    const revenueTier = concentrationTier(topCustomerPct);
    const revenueParts: string[] = [
        topCustomerPct === 0
            ? 'Not enough revenue history yet to assess customer concentration.'
            : `Your largest customer makes up ${topCustomerPct.toFixed(0)}% of revenue -- ${topCustomerPct <= 20 ? 'well diversified.' : topCustomerPct <= 40 ? 'moderate concentration risk.' : 'high concentration risk.'}`,
    ];
    if (extras.revenueVolatility) {
        revenueParts.push(`Month-to-month revenue is ${extras.revenueVolatility === 'stable' ? 'stable' : extras.revenueVolatility === 'variable' ? 'somewhat variable' : 'highly volatile'}.`);
    }
    if (extras.revenueRecurringPct !== undefined) {
        revenueParts.push(`${extras.revenueRecurringPct.toFixed(0)}% of this month's revenue is recurring.`);
    }
    const revenue: FinancialHealthPillar = {
        key: 'revenue', label: 'Revenue Health', score: revenueTier.score, status: revenueTier.status,
        explanation: revenueParts.join(' '),
    };

    // 6. Debt Health -- the existing factor, unchanged.
    const debt = f('Debt');

    // 7. Resilience -- reused verbatim from the caller's own
    // computeBusinessResilience(exposure) result, which already models
    // exactly this pillar's intent (shock/stress resilience across FX,
    // rates, concentration, debt, cash-flow, regulatory exposure) and has
    // no equivalent slot in computeRiskScore. Taken as a parameter rather
    // than recomputed here since computeBusinessExposure needs several
    // inputs (macro assumptions, tax deadline, currency) this function has
    // no reason to also require -- every existing caller of this pillar
    // view already computes it for its own "Shock Resilience" card.
    const resilienceStatus: PillarStatus = resilienceResult.score >= 70 ? 'good' : resilienceResult.score >= 45 ? 'warning' : 'danger';
    const resilience: FinancialHealthPillar = {
        key: 'resilience', label: 'Shock Resilience', score: resilienceResult.score, status: resilienceStatus,
        explanation: resilienceResult.topConcerns.length > 0
            ? `Biggest exposure: ${resilienceResult.topConcerns[0].label} -- ${resilienceResult.topConcerns[0].detail}`
            : 'No significant shock exposure identified right now.',
    };

    // 8. Financial Readiness -- the same reweighted Financing Readiness
    // score already shown on the Credit-Worthiness screen (Debt weighted
    // far higher, since repayment capacity is what a lender actually
    // asks), reused as-is rather than a third independently-tuned reading
    // of the same underlying factors.
    const readinessScore = computeFinancingReadinessScore(riskScore.factors);
    const readinessStatus: PillarStatus = readinessScore.band === 'Excellent' || readinessScore.band === 'Strong' ? 'good'
        : readinessScore.band === 'Moderate' ? 'warning' : 'danger';
    const readiness: FinancialHealthPillar = {
        key: 'readiness', label: 'Financial Readiness', score: readinessScore.score, status: readinessStatus,
        explanation: `${readinessScore.score}/100 (${readinessScore.band}) when weighted the way a lender would -- repayment capacity and cash generation count for more here than in the overall health score.`,
    };

    const pillars: FinancialHealthPillar[] = [
        { key: 'cash', label: 'Cash Health', score: cash.score, status: cash.status, explanation: `${liquidity.explanation} ${ocf.explanation}` },
        { key: 'profitability', label: 'Profitability', score: profitability.score, status: profitability.status as PillarStatus, explanation: profitability.explanation },
        { key: 'workingCapital', label: 'Working Capital', score: workingCapital.score, status: workingCapital.status, explanation: `${workingCapitalFactor.explanation} ${inventoryFactor.explanation}` },
        expense,
        revenue,
        { key: 'debt', label: 'Debt Health', score: debt.score, status: debt.status as PillarStatus, explanation: debt.explanation },
        resilience,
        readiness,
    ];

    return { score: riskScore.score, band: riskScore.band, pillars };
}

/**
 * Budgeting connects directly to the Financial Health Score, rather than
 * living as a separate feature: this is the diagnosis a business owner
 * reads alongside their pillar scores -- which pillar is strongest, which
 * is weakest, and the handful of concrete supporting facts (reserve
 * months, receivables outpacing revenue, cash conversion weakening) that
 * explain WHY, drawn from the same engines the rest of the app already
 * trusts for those specific numbers rather than restated here.
 *
 * Every note below is either directly reused text from an existing,
 * gated engine (computeQualityOfGrowth's own flags, which already require
 * two full years of history before firing) or a single fact from
 * computeFinancialResilience -- nothing here computes a new number.
 */
export interface FinancialHealthDiagnosis {
    strongestPillar: FinancialHealthPillar;
    weakestPillar: FinancialHealthPillar;
    notes: string[];
}

export function diagnoseFinancialHealth(
    pillars: FinancialHealthPillarsResult,
    resilience: FinancialResilience,
    growthQuality?: QualityOfGrowthResult,
): FinancialHealthDiagnosis {
    const sorted = [...pillars.pillars].sort((a, b) => b.score - a.score);
    const strongestPillar = sorted[0];
    const weakestPillar = sorted[sorted.length - 1];

    const notes: string[] = [];
    if (resilience.available) {
        const monthsWord = resilience.reserveCoverageMonths === 1 ? 'month' : 'months';
        notes.push(`Cash reserves cover approximately ${resilience.reserveCoverageMonths.toFixed(1)} ${monthsWord} of essential expenses.`);
    }
    if (growthQuality?.available) {
        const receivablesFlag = growthQuality.flags.find(f => f.toLowerCase().includes('receivable'));
        if (receivablesFlag) notes.push(receivablesFlag);
        const cashConversionFlag = growthQuality.flags.find(f =>
            f.toLowerCase().includes("isn't converting into real cash") || f.toLowerCase().includes('draining cash reserves'));
        if (cashConversionFlag) notes.push(cashConversionFlag);
    }

    return { strongestPillar, weakestPillar, notes };
}
