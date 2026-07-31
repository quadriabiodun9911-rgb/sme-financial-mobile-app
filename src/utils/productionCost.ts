/**
 * Cost per unit produced — the manufacturing equivalent of food cost %:
 * given the raw materials, labour, and overhead that went into a batch,
 * what did each unit actually cost to make, and how many units does a
 * batch need to sell before the fixed costs (labour + overhead) are
 * covered. Materials are drawn from the same Inventory cost-per-unit data
 * as every other commerce-business feature — no separate materials list
 * to maintain.
 */

export type ProductionCostVerdict = 'healthy' | 'caution' | 'high';

export interface MaterialCost {
    name: string;
    quantityPerBatch: number;
    costPerUnit: number;
}

export interface ProductionCostResult {
    totalMaterialCost: number;
    totalBatchCost: number; // materials + labour + overhead
    costPerUnit: number;
    profitPerUnit: number;
    marginPct: number;
    breakEvenUnits: number; // units needed to cover labour+overhead; Infinity if never
    verdict: ProductionCostVerdict;
    reason: string;
}

const HEALTHY_AT_OR_ABOVE_PCT = 20;
const CAUTION_AT_OR_ABOVE_PCT = 10;

export function computeProductionCost(
    unitsProduced: number,
    materials: MaterialCost[],
    laborCostPerBatch: number,
    overheadCostPerBatch: number,
    sellingPricePerUnit: number,
): ProductionCostResult {
    const totalMaterialCost = materials.reduce((sum, m) => sum + m.quantityPerBatch * m.costPerUnit, 0);
    const fixedCostPerBatch = Math.max(0, laborCostPerBatch) + Math.max(0, overheadCostPerBatch);
    const totalBatchCost = totalMaterialCost + fixedCostPerBatch;

    const costPerUnit = unitsProduced > 0 ? totalBatchCost / unitsProduced : 0;
    const profitPerUnit = sellingPricePerUnit - costPerUnit;
    const marginPct = sellingPricePerUnit > 0 ? (profitPerUnit / sellingPricePerUnit) * 100 : 0;

    const materialCostPerUnit = unitsProduced > 0 ? totalMaterialCost / unitsProduced : 0;
    const contributionMarginPerUnit = sellingPricePerUnit - materialCostPerUnit;
    const breakEvenUnits = contributionMarginPerUnit > 0
        ? Math.ceil(fixedCostPerBatch / contributionMarginPerUnit)
        : Infinity;

    let verdict: ProductionCostVerdict;
    let reason: string;

    if (sellingPricePerUnit <= 0) {
        verdict = 'high';
        reason = 'Set a selling price per unit to see margin and break-even.';
    } else if (marginPct >= HEALTHY_AT_OR_ABOVE_PCT) {
        verdict = 'healthy';
        reason = `Margin is ${marginPct.toFixed(1)}% per unit — healthy headroom above cost.`;
    } else if (marginPct >= CAUTION_AT_OR_ABOVE_PCT) {
        verdict = 'caution';
        reason = `Margin is ${marginPct.toFixed(1)}% per unit — thin. Worth a closer look at material costs, batch size, or the selling price.`;
    } else {
        verdict = 'high';
        reason = `Margin is ${marginPct.toFixed(1)}% per unit — this batch may not be covering its full cost once every unit is sold.`;
    }

    return { totalMaterialCost, totalBatchCost, costPerUnit, profitPerUnit, marginPct, breakEvenUnits, verdict, reason };
}
