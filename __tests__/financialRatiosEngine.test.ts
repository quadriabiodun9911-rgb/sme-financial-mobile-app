import { computeFinancialRatiosDashboard } from '../src/utils/financialRatiosEngine';
import { Transaction, Loan, InventoryItem, FinanceData } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2024-06-01',
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

const finance: FinanceData = {
    income: 0, expense: 0, profit: 0, cashBalance: 500000, assets: 200000, liabilities: 100000, equity: 100000,
    totalTaxCollected: 0, totalTaxPaid: 0,
} as FinanceData;

function findReading(dashboard: ReturnType<typeof computeFinancialRatiosDashboard>, categoryKey: string, readingKey: string) {
    const category = dashboard.categories.find(c => c.key === categoryKey)!;
    return category.readings.find(r => r.key === readingKey)!;
}

describe('computeFinancialRatiosDashboard', () => {
    it('reports all 5 categories', () => {
        const dashboard = computeFinancialRatiosDashboard(finance, [], [], []);
        expect(dashboard.categories.map(c => c.key)).toEqual(['profitability', 'liquidity', 'efficiency', 'debt', 'growth']);
    });

    it('marks profitability, efficiency, and growth unavailable with no transaction history', () => {
        const dashboard = computeFinancialRatiosDashboard(finance, [], [], []);
        expect(findReading(dashboard, 'profitability', 'netMargin').tier).toBe('unavailable');
        expect(findReading(dashboard, 'efficiency', 'dso').tier).toBe('unavailable');
        expect(findReading(dashboard, 'growth', 'revenueGrowth').tier).toBe('unavailable');
    });

    it('builds Gross >= Operating >= Net margin from the same trailing-3-month revenue base', () => {
        const txs = [
            makeTx({ type: 'income', category: 'Sales', amount: 1000000, date: '2026-06-10' }),
            makeTx({ type: 'expense', category: 'COGS', amount: 400000, date: '2026-06-12' }),
            makeTx({ type: 'expense', category: 'Rent', amount: 200000, date: '2026-06-15' }),
        ];
        const dashboard = computeFinancialRatiosDashboard(finance, [], txs, []);
        const gross = findReading(dashboard, 'profitability', 'grossMargin');
        const operating = findReading(dashboard, 'profitability', 'operatingMargin');
        const net = findReading(dashboard, 'profitability', 'netMargin');
        expect(gross.value!).toBeGreaterThanOrEqual(operating.value!);
        expect(operating.value!).toBeGreaterThanOrEqual(net.value!);
    });

    it('rates Liquidity Moderate at the exact product-vision example (current ratio 1.18)', () => {
        // leverage.assets / leverage.liabilities = 1.18 -- assets/liabilities
        // chosen directly (no AR/AP/inventory passed) so the ratio is exact.
        const f: FinanceData = { ...finance, assets: 118000, liabilities: 100000 };
        const dashboard = computeFinancialRatiosDashboard(f, [], [], []);
        const currentRatio = findReading(dashboard, 'liquidity', 'currentRatio');
        expect(currentRatio.value).toBeCloseTo(1.18, 2);
        expect(currentRatio.tier).toBe('moderate');
        expect(currentRatio.plainLanguage).toBe('Liquidity: Moderate — your short-term assets currently provide limited headroom against short-term obligations.');
    });

    it('rates Liquidity Strong at 1.5x or above and Weak below 1.0x', () => {
        const strong = computeFinancialRatiosDashboard({ ...finance, assets: 200000, liabilities: 100000 }, [], [], []);
        expect(findReading(strong, 'liquidity', 'currentRatio').tier).toBe('strong');

        const weak = computeFinancialRatiosDashboard({ ...finance, assets: 80000, liabilities: 100000 }, [], [], []);
        expect(findReading(weak, 'liquidity', 'currentRatio').tier).toBe('weak');
    });

    it('marks Current Ratio and Cash Ratio unavailable with no liabilities recorded', () => {
        const dashboard = computeFinancialRatiosDashboard({ ...finance, assets: 200000, liabilities: 0 }, [], [], []);
        expect(findReading(dashboard, 'liquidity', 'currentRatio').tier).toBe('unavailable');
        expect(findReading(dashboard, 'liquidity', 'cashRatio').tier).toBe('unavailable');
    });

    it('computes Cash Ratio as cash balance over total liabilities (including live loan balance)', () => {
        const loans: Loan[] = [{
            id: 'l1', lenderName: 'Bank', principal: 400000, interestRate: 10, termMonths: 12,
            startDate: '2024-01-01', status: 'active', purpose: 'Working capital', payments: [], createdAt: '2024-01-01',
        } as Loan];
        const f: FinanceData = { ...finance, cashBalance: 250000, liabilities: 100000 };
        const dashboard = computeFinancialRatiosDashboard(f, loans, [], []);
        // liabilities = 100000 (finance) + 400000 (live loan balance) = 500000
        const cashRatio = findReading(dashboard, 'liquidity', 'cashRatio');
        expect(cashRatio.value).toBeCloseTo(250000 / 500000, 5);
    });

    it('never disagrees with computeDSCR\'s own status on the Debt Service Coverage reading', () => {
        const loans: Loan[] = [{
            id: 'l1', lenderName: 'Bank', principal: 5000000, interestRate: 24, termMonths: 12,
            startDate: '2024-01-01', status: 'active', purpose: 'Working capital', payments: [], createdAt: '2024-01-01',
        } as Loan];
        const txs = [makeTx({ type: 'income', amount: 10000, date: new Date().toISOString().slice(0, 10) })];
        const dashboard = computeFinancialRatiosDashboard(finance, loans, txs, []);
        const dscrReading = findReading(dashboard, 'debt', 'dscr');
        // Weak income vs a large loan -> DSCR should read danger/weak.
        expect(dscrReading.tier).toBe('weak');
    });

    it('reports Debt-to-Cash-Flow as Strong with no outstanding loans', () => {
        const dashboard = computeFinancialRatiosDashboard(finance, [], [], []);
        const debtToCF = findReading(dashboard, 'debt', 'debtToCashFlow');
        expect(debtToCF.tier).toBe('strong');
        expect(debtToCF.value).toBe(0);
    });

    it('computes Revenue/Expense/Profit Growth from the trailing 3 real-clock months, matching computeRiskScore\'s Efficiency convention', () => {
        const now = new Date();
        const monthKey = (monthsAgo: number) => {
            const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 10);
            return d.toISOString().slice(0, 10);
        };
        const txs = [
            makeTx({ type: 'income', amount: 100000, date: monthKey(2) }),
            makeTx({ type: 'expense', category: 'Rent', amount: 50000, date: monthKey(2) }),
            makeTx({ type: 'income', amount: 150000, date: monthKey(0) }),
            makeTx({ type: 'expense', category: 'Rent', amount: 40000, date: monthKey(0) }),
        ];
        const dashboard = computeFinancialRatiosDashboard(finance, [], txs, []);
        const revenueGrowth = findReading(dashboard, 'growth', 'revenueGrowth');
        const expenseGrowth = findReading(dashboard, 'growth', 'expenseGrowth');
        expect(revenueGrowth.value).toBeCloseTo(50, 0); // 100k -> 150k = +50%
        expect(expenseGrowth.value).toBeCloseTo(-20, 0); // 50k -> 40k = -20%
        expect(revenueGrowth.tier).toBe('strong');
        expect(expenseGrowth.tier).toBe('strong');
    });

    it('marks Inventory Days unavailable with no inventory recorded, even with real transaction history', () => {
        const txs = [
            makeTx({ type: 'income', amount: 100000, date: new Date().toISOString().slice(0, 10) }),
        ];
        const dashboard = computeFinancialRatiosDashboard(finance, [], txs, []);
        expect(findReading(dashboard, 'efficiency', 'dio').tier).toBe('unavailable');
    });

    it('never shows a different Cash Conversion Cycle than the same computeCashConversionCycle inputs would produce directly', () => {
        const { computeTrailingAccrualFigures, computeCashConversionCycle } = require('../src/utils/cfoMetrics');
        const { computeInventoryValue } = require('../src/utils/stockVelocity');
        const inventory: InventoryItem[] = [{
            id: 'i1', name: 'Widget', category: 'General', quantity: 10, unit: 'pcs',
            costPrice: 1000, sellingPrice: 1500, lowStockThreshold: 2, createdAt: '2024-01-01', updatedAt: '2024-01-01',
        } as InventoryItem];
        const txs = [
            makeTx({ type: 'income', amount: 100000, date: new Date().toISOString().slice(0, 10) }),
            makeTx({ type: 'expense', category: 'Rent', amount: 50000, date: new Date().toISOString().slice(0, 10) }),
        ];
        const dashboard = computeFinancialRatiosDashboard(finance, [], txs, inventory);
        const trailing = computeTrailingAccrualFigures(txs);
        const inventoryValue = computeInventoryValue(inventory);
        const direct = computeCashConversionCycle(trailing.unpaidIncome, trailing.trailing30AccrualRevenue, trailing.unpaidExpenses, trailing.trailing30AccrualExpenses, inventoryValue);
        expect(findReading(dashboard, 'efficiency', 'ccc').value).toBeCloseTo(direct.ccc, 5);
        expect(findReading(dashboard, 'efficiency', 'dio').value).toBeCloseTo(direct.dio, 5);
    });
});
