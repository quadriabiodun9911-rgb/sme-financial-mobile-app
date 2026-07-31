/**
 * Food cost % — the metric food-service businesses actually think in: what
 * share of a menu item's selling price goes to the ingredients that made
 * it. Built directly on top of Inventory's existing cost-per-unit data
 * (ingredients ARE inventory items, same as fabric or cement is for other
 * commerce businesses) rather than a separate, disconnected ingredient list.
 *
 * The 28-35% "healthy" band is a commonly cited industry range, not a rule
 * this app enforces or a claim about any specific business's real margin
 * requirements — labeled as a reference point, same discipline as the
 * lending-capacity ranges elsewhere.
 */

export type FoodCostVerdict = 'excellent' | 'healthy' | 'caution' | 'high';

export interface RecipeIngredientCost {
    name: string;
    quantity: number;
    costPerUnit: number;
}

export interface RecipeCostResult {
    totalIngredientCost: number;
    sellingPrice: number;
    foodCostPct: number; // 0-100+; Infinity-safe (0 if sellingPrice is 0)
    grossProfit: number;
    verdict: FoodCostVerdict;
    reason: string;
}

const EXCELLENT_BELOW_PCT = 28;
const HEALTHY_BELOW_PCT = 35;
const CAUTION_BELOW_PCT = 40;

export function computeRecipeCost(sellingPrice: number, ingredients: RecipeIngredientCost[]): RecipeCostResult {
    const totalIngredientCost = ingredients.reduce((sum, i) => sum + i.quantity * i.costPerUnit, 0);
    const grossProfit = sellingPrice - totalIngredientCost;
    const foodCostPct = sellingPrice > 0 ? (totalIngredientCost / sellingPrice) * 100 : 0;

    let verdict: FoodCostVerdict;
    let reason: string;

    if (sellingPrice <= 0) {
        verdict = 'high';
        reason = 'Set a selling price to see food cost % and gross profit for this item.';
    } else if (foodCostPct < EXCELLENT_BELOW_PCT) {
        verdict = 'excellent';
        reason = `Food cost is ${foodCostPct.toFixed(1)}% of selling price — well within the commonly cited 28-35% healthy range for food service.`;
    } else if (foodCostPct < HEALTHY_BELOW_PCT) {
        verdict = 'healthy';
        reason = `Food cost is ${foodCostPct.toFixed(1)}% — within the commonly cited 28-35% healthy range.`;
    } else if (foodCostPct < CAUTION_BELOW_PCT) {
        verdict = 'caution';
        reason = `Food cost is ${foodCostPct.toFixed(1)}% — above the commonly cited 35% healthy ceiling. Worth a closer look at portion sizes, ingredient prices, or the menu price.`;
    } else {
        verdict = 'high';
        reason = `Food cost is ${foodCostPct.toFixed(1)}% of selling price — this item may be losing money once labour and overhead are added on top.`;
    }

    return { totalIngredientCost, sellingPrice, foodCostPct, grossProfit, verdict, reason };
}
