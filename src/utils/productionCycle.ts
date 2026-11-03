/**
 * Production-cycle economics: cost per unit, revenue per unit sold, profit
 * per unit, and a break-even selling price -- the question an ordinary P&L
 * can't answer on its own, because it has no concept of how many physical
 * units (birds, loaves, batches) a period's COGS/revenue actually produced.
 *
 * Deliberately reuses computeEnhancedPnL (finance.ts) for every currency
 * figure rather than re-deriving revenue/COGS/opex a second way -- the only
 * new arithmetic here is dividing those already-trusted totals by the
 * cycle's own unit counts. See ProductionCycle's own doc comment (types/
 * index.ts) for why a cycle itself carries no financial weight of its own.
 */
import { Transaction, Asset, BadDebtProvision, ReceivableWriteOff, InventoryWriteDown, ProductionCycle } from '../types';
import { computeEnhancedPnL } from './finance';
import { transactionsInRange } from './periodRange';

export interface ProductionCycleSummary {
    cycle: ProductionCycle;
    transactions: Transaction[]; // exactly the transactions revenue/cogs/sgaExpenses below were summed from -- for a drill-down panel
    unitsSold: number; // cycle.unitsSold if set, otherwise cycle.unitsRaised (see ProductionCycle's own doc comment)
    revenue: number;
    cogs: number; // direct production cost -- feed, day-old chicks, medication, labour, whatever this business has categorized as COGS (see finance.ts's classifyExpenseLine/COGS_KEYWORDS)
    sgaExpenses: number; // overhead -- rent, admin, anything not a direct production cost
    grossProfit: number;
    costPerUnit: number; // cogs / unitsRaised -- the direct cost to produce one unit
    allInCostPerUnit: number; // (cogs + sgaExpenses) / unitsRaised -- the fully-loaded cost including overhead
    revenuePerUnitSold: number;
    profitPerUnitSold: number; // grossProfit / unitsSold
    breakEvenPricePerUnit: number; // same as costPerUnit, labeled for what it answers: the minimum price that covers direct production cost
}

export function computeProductionCycleSummary(
    cycle: ProductionCycle,
    transactions: Transaction[],
    assets: Asset[],
    badDebtProvisions: BadDebtProvision[] = [],
    receivableWriteOffs: ReceivableWriteOff[] = [],
    inventoryWriteDowns: InventoryWriteDown[] = [],
): ProductionCycleSummary {
    const cycleTx = transactionsInRange(transactions, cycle.startDate, cycle.endDate);
    const pnl = computeEnhancedPnL(cycleTx, assets, badDebtProvisions, receivableWriteOffs, inventoryWriteDowns, cycle.endDate);

    const unitsRaised = cycle.unitsRaised > 0 ? cycle.unitsRaised : 0;
    const unitsSold = cycle.unitsSold && cycle.unitsSold > 0 ? cycle.unitsSold : unitsRaised;

    const costPerUnit = unitsRaised > 0 ? pnl.cogs / unitsRaised : 0;
    const allInCostPerUnit = unitsRaised > 0 ? (pnl.cogs + pnl.sgaExpenses) / unitsRaised : 0;
    const revenuePerUnitSold = unitsSold > 0 ? pnl.revenue / unitsSold : 0;
    const profitPerUnitSold = unitsSold > 0 ? pnl.grossProfit / unitsSold : 0;

    return {
        cycle,
        transactions: cycleTx,
        unitsSold,
        revenue: pnl.revenue,
        cogs: pnl.cogs,
        sgaExpenses: pnl.sgaExpenses,
        grossProfit: pnl.grossProfit,
        costPerUnit,
        allInCostPerUnit,
        revenuePerUnitSold,
        profitPerUnitSold,
        breakEvenPricePerUnit: costPerUnit,
    };
}
