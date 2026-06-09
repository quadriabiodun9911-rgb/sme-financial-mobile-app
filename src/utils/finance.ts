import { Transaction, FinanceData, BusinessSettings } from '../types';

export function computeFinance(
    transactions: Transaction[],
    settings: Pick<BusinessSettings, 'openingAssets' | 'openingLiabilities'>
): FinanceData {
    const income = transactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);

    const expense = transactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);

    const profit = income - expense;
    const margin = income > 0 ? (profit / income) * 100 : 0;

    // Cash balance is the net of all cash transactions recorded
    const cashBalance = profit;

    // Balance sheet: opening balances + cash movements
    const openingAssets = parseFloat(settings.openingAssets) || 0;
    const openingLiabilities = parseFloat(settings.openingLiabilities) || 0;

    // Total assets = non-cash opening assets + current cash balance
    const assets = openingAssets + cashBalance;
    const liabilities = openingLiabilities;
    const equity = assets - liabilities;

    return {
        income,
        expense,
        profit,
        margin,
        cashBalance,
        totalRevenue: income,
        totalCosts: expense,
        assets,
        liabilities,
        equity,
    };
}

export function computeOneThingInsight(
    finance: FinanceData,
    settings: Pick<BusinessSettings, 'minReserve' | 'targetMargin' | 'currency'>
): { severity: 'critical' | 'warning' | 'healthy'; title: string; action: string; tag: string } {
    const { currency, minReserve, targetMargin } = settings;
    const reserveThreshold = parseFloat(minReserve) || 0;

    if (finance.cashBalance < reserveThreshold) {
        return {
            severity: 'critical',
            title: 'Capital Reserve Threshold Breached',
            action: `Your cash balance (${currency}${finance.cashBalance.toLocaleString()}) is below your minimum reserve of ${currency}${minReserve}. Immediate cost-reallocation advised.`,
            tag: 'LIQUIDITY WARNING',
        };
    }

    if (finance.margin < parseFloat(targetMargin)) {
        return {
            severity: 'warning',
            title: 'Margins Are Dropping Below Target',
            action: `Current profit margin is ${finance.margin.toFixed(1)}% vs your goal of ${targetMargin}%. Review top cost categories now.`,
            tag: 'MARGIN WARNING',
        };
    }

    return {
        severity: 'healthy',
        title: 'Everything Looks Healthy Today',
        action: 'Your core metrics are stable. Optional: review your top 3 highest-cost categories for optimization opportunities.',
        tag: 'HEALTHY',
    };
}

export function getTopCategories(
    transactions: Transaction[],
    type: 'income' | 'expense',
    limit = 3
): Array<{ category: string; amount: number }> {
    const map = new Map<string, number>();
    transactions
        .filter(t => t.type === type)
        .forEach(t => map.set(t.category, (map.get(t.category) ?? 0) + t.amount));

    return Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([category, amount]) => ({ category, amount }));
}
