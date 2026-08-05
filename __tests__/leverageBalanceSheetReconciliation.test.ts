/**
 * computeLeverageRatios (debtRatios.ts, used by DebtAnalysis,
 * EnhancedDebtManagement, computeFinancialRatios and Credit-Worthiness's
 * Five C's Capital section) and computeBalanceSheetTrend (balanceSheetTrend.ts,
 * used by Reports > "What I Own & Owe") independently reconstruct the same
 * balance sheet from the same underlying data. They used to disagree —
 * computeLeverageRatios ignored accounts receivable, inventory and accounts
 * payable entirely. This test locks in that both now agree on total assets,
 * total liabilities and net worth for the same business (no registered
 * assets in this fixture, so equipment depreciation — computed independently
 * by each side today — can't mask a real mismatch in the parts that were
 * actually broken: cash, AR, inventory, AP and opening balances).
 */
import { computeFinance, computeWorkingCapitalMetrics } from '../src/utils/finance';
import { computeLeverageRatios } from '../src/utils/debtRatios';
import { computeBalanceSheetTrend } from '../src/utils/balanceSheetTrend';
import { Transaction, Loan, BusinessSettings } from '../src/types';

const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
};

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `t-${Math.random()}`,
    date: daysAgo(10),
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

const loan: Loan = {
    id: 'l1', lenderName: 'Bank', purpose: 'Working capital', principal: 8000,
    interestRate: 12, termMonths: 24, startDate: daysAgo(60), status: 'active',
    payments: [{ id: 'p1', date: daysAgo(30), amount: 1000 }], createdAt: daysAgo(60),
};

const settings: Pick<BusinessSettings, 'openingAssets' | 'openingLiabilities' | 'openingLoans' | 'openingOtherAssets'> = {
    openingAssets: '2000', openingLiabilities: '500', openingLoans: '0', openingOtherAssets: '1500',
};

const inventoryValue = 3000;

describe('computeLeverageRatios vs computeBalanceSheetTrend', () => {
    const transactions: Transaction[] = [
        makeTx({ type: 'income', amount: 20000, status: 'paid', date: daysAgo(15) }),
        makeTx({ type: 'expense', category: 'Rent', amount: 6000, status: 'paid', date: daysAgo(15) }),
        makeTx({ type: 'income', amount: 4000, status: 'pending', date: daysAgo(5) }), // accounts receivable
        makeTx({ type: 'expense', category: 'Supplies', amount: 2500, status: 'overdue', date: daysAgo(5) }), // accounts payable
    ];

    it('agree on total assets, total liabilities and net worth as of today', () => {
        const finance = computeFinance(transactions, settings, 0, []);
        const wc = computeWorkingCapitalMetrics(transactions);

        // Mirror exactly what a real caller (e.g. CreditWorthinessScreen)
        // does: finance.assets + AR + inventory. openingOtherAssets isn't
        // part of finance.assets by design, so it's folded in here the same
        // way balanceSheetTrend treats it (as an "other asset").
        const openingOtherAssets = parseFloat(settings.openingOtherAssets) || 0;
        const financeWithOtherAssets = { ...finance, assets: finance.assets + openingOtherAssets };
        const leverage = computeLeverageRatios(financeWithOtherAssets, [loan], wc.accountsReceivable, wc.accountsPayable, inventoryValue);

        const currentMonthKey = new Date().toISOString().slice(0, 7);
        const points = computeBalanceSheetTrend(
            'monthly', [currentMonthKey], transactions, [], [loan],
            { stockValue: inventoryValue, manualEquipment: parseFloat(settings.openingAssets) || 0, otherAssets: openingOtherAssets, otherLiabilities: parseFloat(settings.openingLiabilities) || 0 },
        );
        const todayPoint = points.find(p => p.key === currentMonthKey)!;
        expect(todayPoint).toBeDefined();
        expect(todayPoint.equipmentValue).toBe(0); // no registered assets in this fixture

        expect(leverage.assets).toBeCloseTo(todayPoint.totalAssets, 5);
        expect(leverage.liabilities).toBeCloseTo(todayPoint.totalLiabilities, 5);
        expect(leverage.equity).toBeCloseTo(todayPoint.netWorth, 5);
    });
});
