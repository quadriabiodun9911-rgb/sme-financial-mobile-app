import { Invoice, Transaction } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(from: Date, to: Date): number {
    return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

export interface CashFlowProjectionPoint {
    daysAhead: 30 | 60 | 90;
    projectedBalance: number;
    shortfall: boolean;
}

// Naive trailing-average model. Stands in for the LSTM time-series forecaster
// in the architecture doc - same shape in/out so the model can be swapped in
// behind this function later.
export function projectCashFlow(txs: Transaction[], currentBalance: number): CashFlowProjectionPoint[] {
    const now = new Date();
    const last30 = txs.filter((tx) => daysBetween(new Date(tx.date), now) <= 30);
    const dailyNet = last30.reduce((sum, tx) => sum + tx.amount, 0) / 30;

    return [30, 60, 90].map((daysAhead) => {
        const projectedBalance = Math.round(currentBalance + dailyNet * daysAhead);
        return { daysAhead: daysAhead as 30 | 60 | 90, projectedBalance, shortfall: projectedBalance < 0 };
    });
}

export function receivablesAging(invoices: Invoice[]) {
    const now = new Date();
    return invoices
        .filter((inv) => !inv.paid)
        .map((inv) => ({ ...inv, daysOverdue: Math.max(0, daysBetween(new Date(inv.dueDate), now)) }))
        .sort((a, b) => b.daysOverdue - a.daysOverdue);
}
