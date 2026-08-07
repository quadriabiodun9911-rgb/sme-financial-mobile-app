/**
 * Turns a headline into a business-specific insight.
 *
 * Cost Exposure (costExposure.ts) already answers "which of my categories is
 * eating a bigger share of revenue" from transaction data alone. What it
 * can't do is answer *why* — that needs an external data point this app has
 * no live feed for (see costExposure.ts's own doc comment). Rather than
 * leave that as a permanent gap, this module lets the owner record their own
 * belief about an external factor (MacroAssumption — "diesel is up 20% this
 * quarter") and link it to the categories it actually touches. When that
 * category is *also* rising internally, the two combine into the kind of
 * insight the product vision describes:
 *
 *   "Your diesel expenditure has increased significantly relative to
 *   revenue. Based on your current cash position and operating expenses,
 *   continued energy-price increases could put pressure on your cash flow
 *   within the next few months."
 *
 * Deliberately conservative: an insight only fires when the linked category
 * is *actually* rising in the business's own transactions, not just because
 * the owner logged an external assumption. A national diesel price spike
 * that hasn't touched this business's books yet isn't this business's risk.
 */

import { Transaction, MacroAssumption, MacroDriver } from '../types';
import { computeCostExposure, CostCategorySignal, ProjectedImpact } from './costExposure';

export interface ExternalRiskInsight {
    driver: MacroDriver;
    title: string;
    category: string;
    whatChanged: string;
    whyItMatters: string;
    riskCreated: string;
    whatCouldHappenNext: string;
    // Set only when this category is also Cost Exposure's projected top
    // category — lets the UI render the same quantified "if this continues"
    // figures it already knows how to format, instead of this module baking
    // currency-less numbers into prose.
    projectedImpact: ProjectedImpact | null;
    recommendedActions: string[];
    creditReadinessImpact: string;
    growthImpact: string;
}

export interface ExternalRiskResult {
    available: boolean;        // enough transaction history to run Cost Exposure at all
    reason?: string;           // set when !available
    hasAssumptions: boolean;   // whether the owner has entered any macro assumptions
    insights: ExternalRiskInsight[];
}

export const DRIVER_LABEL: Record<MacroDriver, string> = {
    energy: 'Energy',
    fx: 'FX',
    interestRate: 'Interest Rate',
    inflation: 'Inflation',
    commodity: 'Commodity Price',
    regulation: 'Regulatory',
    supplyChain: 'Supply Chain',
};

const DRIVER_ACTIONS: Record<MacroDriver, string[]> = {
    energy: [
        'Review pricing and margins.',
        'Identify your most energy-intensive activities.',
        'Evaluate alternative energy sources.',
        'Protect your minimum cash reserve.',
    ],
    fx: [
        'Review pricing on anything priced against imported inputs.',
        'Look for local or fixed-currency alternatives to reduce exposure.',
        'Watch payment timing on FX-denominated invoices and bills.',
        'Protect your minimum cash reserve.',
    ],
    interestRate: [
        'Review how much of your debt is on variable rates.',
        'Consider locking in fixed-rate terms while available.',
        'Delay non-essential new borrowing.',
        'Protect your minimum cash reserve.',
    ],
    inflation: [
        'Review pricing and margins across your top categories.',
        'Renegotiate supplier contracts before renewal.',
        'Tighten payment terms with customers to protect cash timing.',
        'Protect your minimum cash reserve.',
    ],
    commodity: [
        'Review supplier contracts for price-lock or hedging options.',
        'Identify which products are most exposed to this input.',
        'Evaluate substitute materials or suppliers.',
        'Protect your minimum cash reserve.',
    ],
    regulation: [
        'Confirm compliance deadlines and their expected cost.',
        'Budget for one-off compliance spend separately from operating costs.',
        'Consult an advisor on your actual exposure.',
        'Protect your minimum cash reserve.',
    ],
    supplyChain: [
        'Diversify suppliers for your most critical inputs where possible.',
        'Build buffer stock ahead of known disruption windows.',
        'Review lead times and reorder points.',
        'Protect your minimum cash reserve.',
    ],
};

function matchesCategory(assumption: MacroAssumption, category: string): boolean {
    return assumption.linkedCategories.some(c => c.trim().toLowerCase() === category.trim().toLowerCase());
}

function buildInsight(assumption: MacroAssumption, signal: CostCategorySignal, windowMonths: number, projectedImpact: ProjectedImpact | null): ExternalRiskInsight {
    const driverLabel = DRIVER_LABEL[assumption.driver];

    return {
        driver: assumption.driver,
        title: `⚠️ ${driverLabel} Risk Increasing`,
        category: signal.category,
        whatChanged:
            `Your ${signal.category} spend has gone from ${signal.priorPctOfRevenue.toFixed(0)}% to ` +
            `${signal.currentPctOfRevenue.toFixed(0)}% of revenue over the last ${windowMonths} months ` +
            `(+${signal.pctPointChange.toFixed(1)}pp) — around the same time you noted ${assumption.label} ` +
            `${assumption.changePct >= 0 ? 'up' : 'down'} ${Math.abs(assumption.changePct).toFixed(0)}% over ` +
            `${assumption.periodMonths} months.`,
        whyItMatters:
            `${driverLabel} pressure isn't just a headline for this business — it's already showing up in your ` +
            `own numbers: ${signal.category} is taking a bigger share of every revenue unit than it did before.`,
        riskCreated: projectedImpact
            ? `${signal.category} spend grew ${projectedImpact.observedGrowthPct.toFixed(0)}% over the last ${windowMonths} months. At that pace, the next ${windowMonths} months would keep cutting into monthly profit.`
            : `If ${signal.category} keeps climbing at this pace, it will keep taking a larger bite out of profit even if revenue holds steady.`,
        whatCouldHappenNext: projectedImpact
            ? `Based on your current cash position and operating expenses, continued ${driverLabel.toLowerCase()} increases could put pressure on your cash flow within the next few months.`
            : `Keep watching ${signal.category} against revenue — if the trend continues for another ${windowMonths}-month window, it will likely start showing up as a real profit hit.`,
        projectedImpact,
        recommendedActions: DRIVER_ACTIONS[assumption.driver],
        creditReadinessImpact:
            `Rising ${signal.category} costs erode the cash buffer lenders look at — check your reserve coverage ` +
            `on Credit-Worthiness before this compounds.`,
        growthImpact:
            `This is exactly what Quality of Growth is built to catch: revenue can still look healthy while ` +
            `${signal.category} quietly erodes the resilience behind it.`,
    };
}

export function computeExternalRiskInsights(
    transactions: Transaction[],
    macroAssumptions: MacroAssumption[] = [],
    windowMonths = 3
): ExternalRiskResult {
    const exposure = computeCostExposure(transactions, windowMonths);

    if (!exposure.available) {
        return { available: false, reason: exposure.reason, hasAssumptions: macroAssumptions.length > 0, insights: [] };
    }

    const hasAssumptions = macroAssumptions.length > 0;
    if (!hasAssumptions) {
        return { available: true, hasAssumptions: false, insights: [] };
    }

    const insights: ExternalRiskInsight[] = [];
    for (const assumption of macroAssumptions) {
        // Pick the linked category rising fastest, so one assumption produces
        // one insight rather than a flood of near-duplicates.
        const matches = exposure.signals
            .filter(s => matchesCategory(assumption, s.category) && s.pctPointChange > 0)
            .sort((a, b) => b.pctPointChange - a.pctPointChange);
        const signal = matches[0];
        if (!signal) continue;

        const projectedImpact = exposure.projectedImpact?.category === signal.category ? exposure.projectedImpact : null;
        insights.push(buildInsight(assumption, signal, windowMonths, projectedImpact));
    }

    return { available: true, hasAssumptions: true, insights };
}
