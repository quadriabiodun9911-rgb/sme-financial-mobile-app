// Every financial decision chain in the app ultimately answers one question:
// does this help or hurt profit, and does that flow through to cash balance?
// This is the shared engine behind that judgment — used wherever a screen
// previews the effect of a decision (a new loan, a budget, a price change,
// an asset purchase, a payroll run) before or after it's committed.

export type ImpactSource = 'loan' | 'budget' | 'pricing' | 'asset' | 'payroll' | 'expense';

export type ImpactSeverity = 'none' | 'caution' | 'harmful';

export interface ProfitCashImpact {
    currentProfit: number;
    projectedProfit: number;
    profitChange: number;
    currentCashBalance: number;
    projectedCashBalance: number;
    cashChange: number;
    severity: ImpactSeverity;
    isHarmful: boolean;
}

// monthlyDelta: the decision's effect on monthly profit AND cash for the
// same period (negative = costs money / reduces profit, positive = helps).
// Kept as a single delta rather than separate profit/cash deltas because at
// decision time (before it's booked as a transaction) the two move together
// — the distinction between accrual profit and cash-in-hand only diverges
// once something is unpaid, which these previews don't yet know about.
export function computeProfitCashImpact(
    currentProfit: number,
    currentCashBalance: number,
    monthlyDelta: number,
): ProfitCashImpact {
    const projectedProfit = currentProfit + monthlyDelta;
    const projectedCashBalance = currentCashBalance + monthlyDelta;

    let severity: ImpactSeverity = 'none';
    if (projectedProfit < 0 || projectedCashBalance < 0) {
        severity = 'harmful';
    } else if (monthlyDelta < 0 && currentProfit > 0 && Math.abs(monthlyDelta) / currentProfit > 0.2) {
        // Costs more than 20% of current profit — survivable but worth flagging.
        severity = 'caution';
    }

    return {
        currentProfit,
        projectedProfit,
        profitChange: monthlyDelta,
        currentCashBalance,
        projectedCashBalance,
        cashChange: monthlyDelta,
        severity,
        isHarmful: severity !== 'none',
    };
}

export interface SolutionSuggestion {
    title: string;
    detail: string;
}

// Every "this could hurt your finances" moment pairs with a concrete next
// move, not just a warning — matches the rest of the app's "advice comes
// with an action" convention (generateExpenseReductionActions, etc.).
export function suggestSolution(source: ImpactSource): SolutionSuggestion {
    switch (source) {
        case 'loan':
            return {
                title: 'Stretch the term or reduce the amount',
                detail: 'A longer repayment term lowers the monthly hit to profit. Check the Debt Payoff Strategy on the Loans screen for the cheapest way to restructure existing debt too.',
            };
        case 'budget':
            return {
                title: 'Scale the budget back to a safe level',
                detail: 'Use Auto-Generate Budget to rebalance planned spend against what your revenue can actually support, or cut the category driving the overspend.',
            };
        case 'pricing':
            return {
                title: 'Try a smaller change, or pair it with a cost cut',
                detail: 'A smaller price adjustment is lower-risk. Combining it with even a modest expense reduction often reaches the same profit target with less exposure.',
            };
        case 'asset':
            return {
                title: 'Consider leasing instead of buying outright',
                detail: 'Leasing spreads the cost over time instead of one lump sum — revisit the acquisition method comparison before committing to a purchase.',
            };
        case 'payroll':
            return {
                title: 'Review staff structure before the next run',
                detail: 'Check Run Business for your payroll-to-expense ratio, and consider whether every role needs to be full-time.',
            };
        case 'expense':
        default:
            return {
                title: 'Find room elsewhere before committing',
                detail: 'Check Budget for categories with slack to trim so this commitment does not push you into a loss.',
            };
    }
}
