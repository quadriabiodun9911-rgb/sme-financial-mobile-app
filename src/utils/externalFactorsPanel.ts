/**
 * Turns the owner's own Macro Assumptions into a scored panel (impact,
 * exposure, probability) and combines them with what's actually happening
 * inside the business into plain-language insights -- the "internal +
 * external should interact" principle from the product vision.
 *
 * Every number here is derived from something real, never invented:
 *  - impactPct is |changePct| scaled by how much of the business's own
 *    recent revenue actually runs through the linked categories (reusing
 *    costExposure.ts's own "% of revenue" figures, not a fresh guess).
 *  - probability is 'high' only when the assumption is corroborated --
 *    the linked category is ALSO rising in the business's own transactions
 *    right now (the same corroboration test externalRiskInsights.ts uses),
 *    not a made-up likelihood. An uncorroborated belief stays 'medium': a
 *    real macro trend the owner logged, just not yet visible in this
 *    business's own books.
 *  - Market Demand (driver: 'demand') has no linked categories to
 *    corroborate against a cost signal, so it's corroborated instead
 *    against the business's own recent revenue trend -- demand claimed to
 *    be strengthening is corroborated when revenue is actually growing,
 *    and vice versa.
 */

import { Transaction, MacroAssumption, MacroDriver } from '../types';
import { computeAllTimeMonthlyBuckets } from './trendAnalysis';
import { computeCostExposure, CostExposureResult } from './costExposure';
import { ExternalRiskInsight, DRIVER_LABEL } from './externalRiskInsights';
import { MarginRiskWarning } from './discountForecast';

export type ImpactLevel = 'high' | 'medium' | 'low' | 'positive';
export type ProbabilityLevel = 'high' | 'medium' | 'low';

export interface ExternalFactorItem {
    id: string;
    driver: MacroDriver;
    label: string;
    changePct: number;
    periodMonths: number;
    linkedCategories: string[];
    impactLevel: ImpactLevel;
    impactPct: number;      // magnitude, percentage points of revenue -- always >= 0
    exposurePct: number;    // 0-100, share of recent revenue running through the linked categories (100 for demand, business-wide by definition)
    corroborated: boolean;  // whether the business's own transactions actually confirm this
    probability: ProbabilityLevel;
    sentence: string;
}

export interface ExternalFactorsPanel {
    items: ExternalFactorItem[];
    summarySentence: string | null; // the single highest-impact item's "potential forecast impact" line, or null when nothing material
}

export interface RiskRadarRow {
    label: string;
    driver: MacroDriver;
    impact: ImpactLevel;
    probability: ProbabilityLevel;
    exposure: 'high' | 'medium' | 'low';
}

export interface CombinedInsight {
    icon: string;
    title: string;
    text: string;
    tone: 'risk' | 'opportunity';
}

const COST_IMPACT_HIGH_PP = 3;
const COST_IMPACT_MEDIUM_PP = 1;
const EXPOSURE_HIGH_PCT = 15;
const EXPOSURE_MEDIUM_PCT = 5;
const DEMAND_IMPACT_HIGH_PCT = 15;
const DEMAND_IMPACT_MEDIUM_PCT = 5;

// The same 3-month-vs-prior-3-month comparison computeRiskScore's
// Efficiency factor already uses (finance.ts) -- reused here as the
// "internal sales trend" signal rather than a second growth-rate formula.
export function computeInternalRevenueGrowthPct(transactions: Transaction[]): number | null {
    const buckets = computeAllTimeMonthlyBuckets(transactions).slice(-3);
    if (buckets.length < 2) return null;
    const first = buckets[0];
    const last = buckets[buckets.length - 1];
    if (first.revenue <= 0) return null;
    return ((last.revenue - first.revenue) / first.revenue) * 100;
}

function exposureLevel(pct: number): 'high' | 'medium' | 'low' {
    if (pct >= EXPOSURE_HIGH_PCT) return 'high';
    if (pct >= EXPOSURE_MEDIUM_PCT) return 'medium';
    return 'low';
}

function buildCostSideItem(assumption: MacroAssumption, exposure: CostExposureResult): ExternalFactorItem {
    const driverLabel = DRIVER_LABEL[assumption.driver];
    const linkedSignals = exposure.available
        ? exposure.signals.filter(s => assumption.linkedCategories.some(c => c.trim().toLowerCase() === s.category.trim().toLowerCase()))
        : [];
    const exposurePct = linkedSignals.reduce((sum, s) => sum + s.currentPctOfRevenue, 0);
    const corroborated = linkedSignals.some(s => s.pctPointChange > 0);
    const impactPct = (Math.abs(assumption.changePct) / 100) * exposurePct;

    const impactLevel: ImpactLevel = impactPct >= COST_IMPACT_HIGH_PP ? 'high' : impactPct >= COST_IMPACT_MEDIUM_PP ? 'medium' : 'low';
    const probability: ProbabilityLevel = corroborated ? 'high' : 'medium';

    const direction = assumption.changePct >= 0 ? 'up' : 'down';
    const sentence = `${assumption.label}: ${direction} ${Math.abs(assumption.changePct).toFixed(0)}% over ${assumption.periodMonths} months. ` +
        `${assumption.linkedCategories.join(', ')} make up about ${exposurePct.toFixed(0)}% of your recent revenue` +
        (corroborated ? ' — and this is already showing up in your own spending.' : ' — not yet clearly showing in your recent numbers.');

    return {
        id: assumption.id, driver: assumption.driver, label: assumption.label,
        changePct: assumption.changePct, periodMonths: assumption.periodMonths, linkedCategories: assumption.linkedCategories,
        impactLevel, impactPct, exposurePct, corroborated, probability, sentence,
    };
}

function buildDemandItem(assumption: MacroAssumption, internalRevenueGrowthPct: number | null): ExternalFactorItem {
    const strengthening = assumption.changePct >= 0;
    const corroborated = internalRevenueGrowthPct != null && (strengthening ? internalRevenueGrowthPct > 0 : internalRevenueGrowthPct < 0);
    const impactPct = Math.abs(assumption.changePct);
    const impactLevel: ImpactLevel = strengthening
        ? 'positive'
        : impactPct >= DEMAND_IMPACT_HIGH_PCT ? 'high' : impactPct >= DEMAND_IMPACT_MEDIUM_PCT ? 'medium' : 'low';
    const probability: ProbabilityLevel = corroborated ? 'high' : 'medium';

    const sentence = `${assumption.label}: demand appears to be ${strengthening ? 'strengthening' : 'weakening'} ${Math.abs(assumption.changePct).toFixed(0)}% over ${assumption.periodMonths} months` +
        (corroborated
            ? ` — and matches your own recent revenue trend (${internalRevenueGrowthPct!.toFixed(0)}%).`
            : ' — not yet clearly reflected in your recent revenue trend.');

    return {
        id: assumption.id, driver: 'demand', label: assumption.label,
        changePct: assumption.changePct, periodMonths: assumption.periodMonths, linkedCategories: [],
        impactLevel, impactPct, exposurePct: 100, corroborated, probability, sentence,
    };
}

export function computeExternalFactorsPanel(transactions: Transaction[], macroAssumptions: MacroAssumption[]): ExternalFactorsPanel {
    if (macroAssumptions.length === 0) return { items: [], summarySentence: null };

    const exposure = computeCostExposure(transactions);
    const internalRevenueGrowthPct = computeInternalRevenueGrowthPct(transactions);

    const items = macroAssumptions.map(a =>
        a.driver === 'demand' ? buildDemandItem(a, internalRevenueGrowthPct) : buildCostSideItem(a, exposure)
    );

    const impactRank: Record<ImpactLevel, number> = { high: 3, medium: 2, low: 1, positive: 0 };
    const worst = [...items].filter(i => i.impactLevel !== 'positive').sort((a, b) => impactRank[b.impactLevel] - impactRank[a.impactLevel])[0];
    const bestPositive = [...items].filter(i => i.impactLevel === 'positive').sort((a, b) => b.impactPct - a.impactPct)[0];

    let summarySentence: string | null = null;
    if (worst && worst.impactLevel !== 'low') {
        summarySentence = worst.driver === 'demand'
            ? 'Weakening market demand could put pressure on your projected revenue over the coming months.'
            : `Rising ${DRIVER_LABEL[worst.driver].toLowerCase()} pressure could reduce your projected margin over the coming months.`;
    } else if (bestPositive) {
        summarySentence = `Strengthening ${DRIVER_LABEL[bestPositive.driver].toLowerCase()} could support continued revenue growth over the coming months.`;
    }

    return { items, summarySentence };
}

export interface ExternalScenarioStress {
    costStressPct: number;  // sum of corroborated cost-side assumptions' impact, in percentage points -- how much extra expense growth a Conservative scenario should assume on top of its own fixed swing
    demandSwingPct: number; // the demand assumption's own changePct, if one exists -- 0 otherwise
}

export const NO_EXTERNAL_STRESS: ExternalScenarioStress = { costStressPct: 0, demandSwingPct: 0 };

// Only CORROBORATED cost pressure feeds the Conservative scenario -- an
// assumption the owner logged but that isn't yet showing up in their own
// spending doesn't get to make the downside case look worse than the
// business's own numbers currently justify.
export function computeExternalScenarioStress(panel: ExternalFactorsPanel): ExternalScenarioStress {
    const costStressPct = panel.items
        .filter(i => i.driver !== 'demand' && i.corroborated)
        .reduce((sum, i) => sum + i.impactPct, 0);
    const demandItem = panel.items.find(i => i.driver === 'demand');
    return { costStressPct, demandSwingPct: demandItem ? demandItem.changePct : 0 };
}

export function computeRiskRadar(panel: ExternalFactorsPanel): RiskRadarRow[] {
    return panel.items.map(item => ({
        label: item.label,
        driver: item.driver,
        impact: item.impactLevel,
        probability: item.probability,
        exposure: exposureLevel(item.exposurePct),
    }));
}

export interface CombinedInsightsInput {
    transactions: Transaction[];
    macroAssumptions: MacroAssumption[];
    marginRisk: MarginRiskWarning;
    externalInsights: ExternalRiskInsight[];
    expectedInventoryPurchases: number;
    existingLoanMonthlyPayment: number;
    newLoanAmount: number;
}

// A small, fixed set of internal x external pairings -- deliberately not a
// generic rules engine that could fabricate a plausible-sounding sentence
// from a coincidence. Each rule only fires when both the internal signal
// and the external one are independently real (a real trend and a real,
// user-entered assumption), matching this module's header comment.
export function computeCombinedInsights(input: CombinedInsightsInput): CombinedInsight[] {
    const insights: CombinedInsight[] = [];
    const internalRevenueGrowthPct = computeInternalRevenueGrowthPct(input.transactions);
    const demandAssumption = input.macroAssumptions.find(a => a.driver === 'demand');
    const costDriverAssumptions = input.macroAssumptions.filter(a => a.driver !== 'demand');

    // Sales trend tempered by weakening demand.
    if (internalRevenueGrowthPct != null && internalRevenueGrowthPct > 0 && demandAssumption && demandAssumption.changePct < 0) {
        insights.push({
            icon: '📉', tone: 'risk', title: 'Growth May Moderate',
            text: `Your historical sales trend is positive (+${internalRevenueGrowthPct.toFixed(0)}%), but ${demandAssumption.label} suggests demand may be weakening (${demandAssumption.changePct.toFixed(0)}%) — future growth may be more moderate than the trend alone suggests.`,
        });
    }

    // Margin Risk (internal discounting) compounded by external cost pressure.
    if (input.marginRisk.show && input.externalInsights.length > 0) {
        const ext = input.externalInsights[0];
        insights.push({
            icon: '⚠️', tone: 'risk', title: 'Margin Risk',
            text: `Your discounting has increased AND ${ext.category} costs are rising — margin is being squeezed from both sides. Review pricing before your next order cycle.`,
        });
    }

    // Cash Flow Risk: planned inventory purchases meeting a corroborated
    // supply-side cost pressure.
    if (input.expectedInventoryPurchases > 0) {
        const supplySideRisk = costDriverAssumptions.find(a =>
            (a.driver === 'fx' || a.driver === 'commodity' || a.driver === 'supplyChain') &&
            input.externalInsights.some(ei => ei.driver === a.driver)
        );
        if (supplySideRisk) {
            insights.push({
                icon: '⚠️', tone: 'risk', title: 'Cash Flow Risk',
                text: `Your planned inventory purchases may cost more than expected because ${supplySideRisk.label} is pushing up costs. Budget extra cash to maintain the same stock level.`,
            });
        }
    }

    // Financing Risk: real debt obligations meeting a rising-rate assumption.
    const hasDebt = input.existingLoanMonthlyPayment > 0 || input.newLoanAmount > 0;
    const rateRisk = costDriverAssumptions.find(a => a.driver === 'interestRate' && a.changePct > 0);
    if (hasDebt && rateRisk) {
        insights.push({
            icon: '⚠️', tone: 'risk', title: 'Financing Risk',
            text: `${rateRisk.label} could increase the cost of your borrowing — your actual debt-service burden may end up higher than what's projected here.`,
        });
    }

    // Growth Opportunity: strong internal sales growth with either
    // corroborating external demand, or no material cost/margin/demand
    // headwind currently working against it. A weakening-demand assumption
    // disqualifies this the same way a cost risk does -- it wouldn't make
    // sense to call growth an "opportunity" in the same breath as warning
    // that demand may be moderating it (see the "Growth May Moderate" rule
    // above, which fires from the same weakening-demand signal).
    const demandTailwind = demandAssumption && demandAssumption.changePct > 0;
    const demandHeadwind = demandAssumption && demandAssumption.changePct < 0;
    const hasMaterialHeadwind = input.externalInsights.length > 0 || input.marginRisk.show || demandHeadwind;
    if (internalRevenueGrowthPct != null && internalRevenueGrowthPct >= 8 && (demandTailwind || !hasMaterialHeadwind)) {
        insights.push({
            icon: '🟢', tone: 'opportunity', title: 'Growth Opportunity',
            text: `Sales are growing (+${internalRevenueGrowthPct.toFixed(0)}%)${demandTailwind ? ` and ${demandAssumption!.label.toLowerCase()} looks supportive` : ' and there are currently no major cost pressures eating into it'} — consider whether your inventory and staffing can support continued growth.`,
        });
    }

    return insights;
}
