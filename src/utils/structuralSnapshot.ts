// When a business hasn't logged enough transactions for a transaction-based
// diagnosis, it usually still has *something* recorded: goals, a budget,
// loans, assets, unpaid invoices, stock. This builds a rough financial
// picture from that structural data instead of just saying "not enough
// data" — closer to what the app promises (a starting point even without a
// bank statement) than an empty screen.

import { Budget, Loan, Asset, Invoice, InventoryItem, StaffMember, FinancialGoal } from '../types';
import { totalMonthlyLoanBurden } from './loanMath';
import { computeAssetCurrentValue } from './finance';

export interface StructuralSnapshot {
    hasData: boolean;
    budgetedMonthlySpend: number;
    loanBurden: number;
    payrollCost: number;
    committedMonthlyCosts: number;
    outstandingReceivables: number;
    inventoryStockValue: number;
    inventoryPotentialRevenue: number;
    activeAssetValue: number;
    // A revenue estimate is only ever a proxy, not a measurement — sourced
    // from a revenue-growth goal's target if one exists, since that's the
    // closest thing to a stated revenue expectation.
    estimatedMonthlyRevenue: number | null;
    estimatedMonthlyProfit: number | null;
}

function monthlySalaryCost(m: StaffMember): number {
    if (m.salaryType === 'monthly') return m.salary;
    if (m.salaryType === 'weekly') return m.salary * 4.33;
    return m.salary * 22; // daily
}

export function buildStructuralSnapshot(
    budgets: Budget[],
    loans: Loan[],
    assets: Asset[],
    invoices: Invoice[],
    inventory: InventoryItem[],
    staff: StaffMember[],
    goals: FinancialGoal[],
): StructuralSnapshot {
    const hasData = budgets.length > 0 || loans.length > 0 || assets.length > 0
        || invoices.length > 0 || inventory.length > 0 || staff.length > 0;

    const budgetedMonthlySpend = budgets.reduce((s, b) => s + b.monthlyAmount, 0);
    const loanBurden = totalMonthlyLoanBurden(loans);
    const payrollCost = staff.filter(s => s.status === 'active').reduce((s, m) => s + monthlySalaryCost(m), 0);
    const committedMonthlyCosts = budgetedMonthlySpend + loanBurden + payrollCost;

    const outstandingReceivables = invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + (i.total ?? 0), 0);
    const inventoryStockValue = inventory.reduce((s, i) => s + i.quantity * i.costPrice, 0);
    const inventoryPotentialRevenue = inventory.reduce((s, i) => s + i.quantity * i.sellingPrice, 0);
    const activeAssetValue = assets.filter(a => a.status === 'active').reduce((s, a) => s + computeAssetCurrentValue(a), 0);

    const revenueGoal = goals.find(g => g.type === 'revenue_growth');
    const estimatedMonthlyRevenue = revenueGoal ? revenueGoal.targetValue : null;
    const estimatedMonthlyProfit = estimatedMonthlyRevenue !== null
        ? estimatedMonthlyRevenue - committedMonthlyCosts
        : null;

    return {
        hasData,
        budgetedMonthlySpend,
        loanBurden,
        payrollCost,
        committedMonthlyCosts,
        outstandingReceivables,
        inventoryStockValue,
        inventoryPotentialRevenue,
        activeAssetValue,
        estimatedMonthlyRevenue,
        estimatedMonthlyProfit,
    };
}
