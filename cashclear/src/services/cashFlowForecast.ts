import { CashFlowAlert, CashFlowProjectionPoint, Invoice, Transaction } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(from: Date, to: Date): number {
    return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

// Naive trailing-average projection - a placeholder for the LSTM time-series
// model in the architecture doc. Same inputs/outputs shape, so the model can
// swap in later without touching dashboard code.
export function projectCashFlow(transactions: Transaction[], currentBalance: number): CashFlowProjectionPoint[] {
    const now = new Date();
    const last30 = transactions.filter((tx) => daysBetween(new Date(tx.date), now) <= 30);
    const dailyNet = last30.reduce((sum, tx) => sum + tx.amount, 0) / 30;

    return [30, 60, 90].map((daysAhead) => {
        const projectedBalance = Math.round(currentBalance + dailyNet * daysAhead);
        return {
            daysAhead: daysAhead as 30 | 60 | 90,
            projectedBalance,
            shortfall: projectedBalance < 0,
        };
    });
}

export function receivablesAging(invoices: Invoice[]): Array<Invoice & { daysOverdue: number }> {
    const now = new Date();
    return invoices
        .filter((inv) => !inv.paid)
        .map((inv) => ({ ...inv, daysOverdue: Math.max(0, daysBetween(new Date(inv.dueDate), now)) }))
        .sort((a, b) => b.daysOverdue - a.daysOverdue);
}

export function buildCashFlowAlerts(
    projections: CashFlowProjectionPoint[],
    invoices: Invoice[],
    upcomingRentDueInDays: number,
): CashFlowAlert[] {
    const alerts: CashFlowAlert[] = [];
    const outstanding = invoices.filter((inv) => !inv.paid);
    const outstandingTotal = outstanding.reduce((sum, inv) => sum + inv.amount, 0);

    if (outstanding.length > 0 && upcomingRentDueInDays <= 21) {
        alerts.push({
            id: 'alert-receivables-rent',
            severity: 'warning',
            message: `You have ₦${outstandingTotal.toLocaleString()} in pending invoices from ${outstanding.length} client${outstanding.length > 1 ? 's' : ''}. Your rent is due in ${upcomingRentDueInDays} days. Follow up on invoices now to cover it.`,
        });
    }

    const shortfallPoint = projections.find((p) => p.shortfall);
    if (shortfallPoint) {
        alerts.push({
            id: `alert-shortfall-${shortfallPoint.daysAhead}`,
            severity: 'critical',
            message: `Projected cash shortfall within ${shortfallPoint.daysAhead} days at current spending pace. Collect outstanding invoices or reduce discretionary spend.`,
        });
    }

    const overdue = receivablesAgingSeverity(invoices);
    if (overdue) alerts.push(overdue);

    return alerts;
}

function receivablesAgingSeverity(invoices: Invoice[]): CashFlowAlert | null {
    const now = new Date();
    const badlyOverdue = invoices.filter((inv) => !inv.paid && daysBetween(new Date(inv.dueDate), now) > 30);
    if (badlyOverdue.length === 0) return null;
    return {
        id: 'alert-aging-invoices',
        severity: 'critical',
        message: `${badlyOverdue.length} invoice${badlyOverdue.length > 1 ? 's are' : ' is'} over 30 days past due. Aging receivables like this drag down your Cash Flow Consistency pillar.`,
    };
}
