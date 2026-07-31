import {
    computeFreeCashFlow,
    computeCashConversionCycle,
    computeObligationsWaterfall,
    computeRevenueShockImpact,
    computeFullCapitalCapacity,
} from '../src/utils/cfoMetrics';
import { Loan } from '../src/types';

const today = new Date();
const d = (daysAgo: number) => {
    const date = new Date(today);
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString().split('T')[0];
};

const makeLoan = (overrides: Partial<Loan> = {}): Loan => ({
    id: 'l1',
    lenderName: 'Test Bank',
    purpose: 'Working capital',
    principal: 120000,
    interestRate: 12,
    termMonths: 12,
    startDate: d(0),
    status: 'active',
    payments: [],
    createdAt: d(0),
    ...overrides,
});

describe('computeFreeCashFlow', () => {
    it('subtracts committed obligations and reserve target from cash balance', () => {
        const r = computeFreeCashFlow(100000, 20000, 15000, 10000);
        expect(r.deployableCash).toBe(55000);
    });

    it('never goes negative when obligations exceed cash', () => {
        const r = computeFreeCashFlow(10000, 20000, 15000, 10000);
        expect(r.deployableCash).toBe(0);
    });
});

describe('computeCashConversionCycle', () => {
    it('computes DSO/DPO/DIO from receivables/payables/inventory against accrual figures', () => {
        const r = computeCashConversionCycle(30000, 100000, 15000, 50000, 10000);
        expect(r.dso).toBeCloseTo(9, 5);  // 30000/100000*30
        expect(r.dpo).toBeCloseTo(9, 5);  // 15000/50000*30
        expect(r.dio).toBeCloseTo(6, 5);  // 10000/50000*30
        expect(r.ccc).toBeCloseTo(6, 5);  // dso + dio - dpo
    });

    it('returns zero for any leg when its base figure is zero', () => {
        const r = computeCashConversionCycle(0, 0, 0, 0, 0);
        expect(r.dso).toBe(0);
        expect(r.dpo).toBe(0);
        expect(r.dio).toBe(0);
    });
});

describe('computeObligationsWaterfall', () => {
    it('includes a 12-month loan\'s payment across all 4 quarters', () => {
        const loans = [makeLoan({ startDate: d(0), termMonths: 12 })];
        const r = computeObligationsWaterfall(loans, 5000, 2000);
        // Every quarter should have nonzero debt service for a fresh 12-month loan
        r.quarters.forEach(q => expect(q.debtService).toBeGreaterThan(0));
    });

    it('only applies payablesDue to the first quarter', () => {
        const r = computeObligationsWaterfall([], 8000, 0);
        expect(r.quarters[0].payablesDue).toBe(8000);
        expect(r.quarters[1].payablesDue).toBe(0);
        expect(r.quarters[2].payablesDue).toBe(0);
        expect(r.quarters[3].payablesDue).toBe(0);
    });

    it('applies the quarterly tax estimate to every quarter', () => {
        const r = computeObligationsWaterfall([], 0, 3000);
        r.quarters.forEach(q => expect(q.taxDue).toBe(3000));
    });

    it('excludes a loan that has already finished its term', () => {
        const loans = [makeLoan({ startDate: d(400), termMonths: 6 })]; // ended long ago
        const r = computeObligationsWaterfall(loans, 0, 0);
        r.quarters.forEach(q => expect(q.debtService).toBe(0));
    });

    it('sums total committed across all quarters', () => {
        const r = computeObligationsWaterfall([], 1000, 500);
        const expectedTotal = r.quarters.reduce((s, q) => s + q.total, 0);
        expect(r.totalCommitted).toBe(expectedTotal);
    });
});

describe('computeRevenueShockImpact', () => {
    it('increases effective daily burn by the lost revenue share', () => {
        const r = computeRevenueShockImpact(300000, 5000, 150000, 20);
        // lost monthly = 30000, lost daily = 1000, stressed burn = 6000
        expect(r.lostMonthlyRevenue).toBe(30000);
        expect(r.stressedRunwayDays).toBeCloseTo(50, 5); // 300000/6000
    });

    it('flags critical when stressed runway drops under 30 days', () => {
        const r = computeRevenueShockImpact(50000, 3000, 200000, 50);
        expect(r.verdict).toBe('critical');
    });

    it('flags safe when runway stays healthy despite the miss', () => {
        const r = computeRevenueShockImpact(2000000, 2000, 50000, 10);
        expect(r.verdict).toBe('safe');
    });

    it('treats zero burn and zero lost revenue as infinite runway', () => {
        const r = computeRevenueShockImpact(10000, 0, 0, 20);
        expect(r.stressedRunwayDays).toBe(Infinity);
        expect(r.verdict).toBe('safe');
    });
});

describe('computeFullCapitalCapacity', () => {
    it('sums all three sources', () => {
        const r = computeFullCapitalCapacity(50000, 200000, 80000);
        expect(r.total).toBe(330000);
        expect(r.sources).toHaveLength(3);
    });

    it('excludes zero-value sources from the list', () => {
        const r = computeFullCapitalCapacity(50000, 0, 0);
        expect(r.sources).toHaveLength(1);
        expect(r.total).toBe(50000);
    });
});
