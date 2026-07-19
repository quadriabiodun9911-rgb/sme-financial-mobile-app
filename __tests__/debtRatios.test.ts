import { computeLiveLoanBalance, computeLeverageRatios, scoreDebtToAssets, scoreDebtToEquity, scoreEquityRatio, scoreROA, scoreROE } from '../src/utils/debtRatios';
import { FinanceData, Loan } from '../src/types';

const baseFinance: FinanceData = {
    income: 10000, expense: 5000, profit: 5000, margin: 50, cashBalance: 8000,
    totalRevenue: 10000, totalCosts: 5000, assets: 20000, liabilities: 0, equity: 20000,
    totalTaxCollected: 0, totalTaxPaid: 0, netTaxPosition: 0,
    annualDepreciation: 0, depreciationAdjustedProfit: 0,
};

const makeLoan = (overrides: Partial<Loan>): Loan => ({
    id: 'l1', lenderName: 'Bank', purpose: 'Equipment', principal: 10000,
    interestRate: 10, termMonths: 12, startDate: '2024-01-01', status: 'active',
    payments: [], createdAt: '2024-01-01',
    ...overrides,
});

describe('computeLiveLoanBalance', () => {
    it('sums outstanding balance across active loans only', () => {
        const loans = [
            makeLoan({ principal: 10000, payments: [{ id: 'p1', amount: 2000, date: '2024-02-01' }] }),
            makeLoan({ id: 'l2', principal: 5000, status: 'paid_off' }),
        ];
        expect(computeLiveLoanBalance(loans)).toBe(8000);
    });

    it('never goes negative if overpaid', () => {
        const loans = [makeLoan({ principal: 1000, payments: [{ id: 'p1', amount: 5000, date: '2024-02-01' }] })];
        expect(computeLiveLoanBalance(loans)).toBe(0);
    });
});

describe('computeLeverageRatios', () => {
    it('folds live loan balance into finance.liabilities, not just the manual figure', () => {
        const loans = [makeLoan({ principal: 10000 })];
        const r = computeLeverageRatios(baseFinance, loans);
        expect(r.liabilities).toBe(10000); // finance.liabilities (0) + live loan balance (10000)
        expect(r.debtToAssets).toBe(50); // 10000/20000
    });

    it('reports Infinity debt-to-equity when equity is zero but debt exists', () => {
        const r = computeLeverageRatios({ ...baseFinance, equity: 0 }, [makeLoan({ principal: 5000 })]);
        expect(r.debtToEquity).toBe(Infinity);
    });
});

describe('score functions — the canonical thresholds both debt UI cards now share', () => {
    it('scoreDebtToAssets: <=30% strong, <=50% stable, >50% concerning', () => {
        expect(scoreDebtToAssets(20)).toBe('strong');
        expect(scoreDebtToAssets(45)).toBe('stable');
        expect(scoreDebtToAssets(55)).toBe('concerning'); // this exact case previously disagreed between DebtAnalysis and EnhancedDebtManagement
    });

    it('scoreDebtToEquity: <=0.5 strong, <=1 stable, >1 or Infinity concerning', () => {
        expect(scoreDebtToEquity(0.3)).toBe('strong');
        expect(scoreDebtToEquity(0.8)).toBe('stable');
        expect(scoreDebtToEquity(1.5)).toBe('concerning');
        expect(scoreDebtToEquity(Infinity)).toBe('concerning');
    });

    it('scoreEquityRatio/ROA/ROE use their documented breakpoints', () => {
        expect(scoreEquityRatio(80)).toBe('strong');
        expect(scoreROA(12)).toBe('strong');
        expect(scoreROE(20)).toBe('strong');
        expect(scoreROA(2)).toBe('concerning');
    });
});
