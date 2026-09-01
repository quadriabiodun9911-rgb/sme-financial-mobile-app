import { computeQuickHealthCheck } from '../src/utils/quickHealthCheck';

describe('computeQuickHealthCheck', () => {
    it('marks a profitable business (revenue >= expenses) as green with infinite runway, never a fabricated number', () => {
        const result = computeQuickHealthCheck({ lastMonthRevenue: 50000, monthlyExpenses: 38000, cashInBank: 120000 });
        expect(result.isProfitable).toBe(true);
        expect(result.netMonthlyBurn).toBe(0);
        expect(result.runwayMonths).toBe(Infinity);
        expect(result.riskStatus).toBe('green');
        expect(result.riskLabel).toBe('Stable');
    });

    it('computes a real runway in months from cash / net burn when expenses exceed revenue', () => {
        // burn = 45000 - 40000 = 5000/mo; cash 15000 -> 3 months runway
        const result = computeQuickHealthCheck({ lastMonthRevenue: 40000, monthlyExpenses: 45000, cashInBank: 15000 });
        expect(result.isProfitable).toBe(false);
        expect(result.netMonthlyBurn).toBe(5000);
        expect(result.runwayMonths).toBe(3);
    });

    it('bands runway into green/yellow/red using the same 60/30-day (2/1-month) cutoffs the real Cash Runway trigger uses', () => {
        // 2+ months -> green
        expect(computeQuickHealthCheck({ lastMonthRevenue: 40000, monthlyExpenses: 45000, cashInBank: 10000 }).riskStatus).toBe('green'); // 2 months exactly
        // 1-2 months -> yellow
        expect(computeQuickHealthCheck({ lastMonthRevenue: 40000, monthlyExpenses: 45000, cashInBank: 7500 }).riskStatus).toBe('yellow'); // 1.5 months
        // <1 month -> red
        expect(computeQuickHealthCheck({ lastMonthRevenue: 40000, monthlyExpenses: 45000, cashInBank: 2000 }).riskStatus).toBe('red'); // 0.4 months
    });

    it('computes the expense ratio honestly, and states it in the diagnosis', () => {
        const result = computeQuickHealthCheck({ lastMonthRevenue: 45000, monthlyExpenses: 38000, cashInBank: 120000 });
        expect(result.expenseRatioPct).toBeCloseTo((38000 / 45000) * 100);
        expect(result.diagnosis).toContain('84%');
    });

    it('returns a null expense ratio when revenue is zero, rather than dividing by zero into a fake number', () => {
        const result = computeQuickHealthCheck({ lastMonthRevenue: 0, monthlyExpenses: 10000, cashInBank: 5000 });
        expect(result.expenseRatioPct).toBeNull();
        expect(result.diagnosis).not.toContain('NaN');
        expect(result.diagnosis).not.toContain('Infinity');
    });

    it('never phrases the financing preview as a score, approval, or credit decision -- only a caveated qualitative read', () => {
        const green = computeQuickHealthCheck({ lastMonthRevenue: 50000, monthlyExpenses: 30000, cashInBank: 100000 });
        const red = computeQuickHealthCheck({ lastMonthRevenue: 40000, monthlyExpenses: 45000, cashInBank: 2000 });
        for (const result of [green, red]) {
            expect(result.financingPreview).not.toMatch(/\d+\s*\/\s*100/);
            expect(result.financingPreview).not.toMatch(/approved|denied|score of \d/i);
        }
    });
});
