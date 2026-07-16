import { modelCombinedScenario, CombinedLever } from '../src/utils/analysis';
import { FinanceData } from '../src/types';

const makeFinance = (overrides: Partial<FinanceData> = {}): FinanceData => ({
    income: 100000, expense: 60000, profit: 40000, margin: 40,
    cashBalance: 40000, totalRevenue: 100000, totalCosts: 60000,
    assets: 40000, liabilities: 0, equity: 40000,
    totalTaxCollected: 0, totalTaxPaid: 0, netTaxPosition: 0,
    annualDepreciation: 0, depreciationAdjustedProfit: 40000,
    ...overrides,
});

describe('modelCombinedScenario', () => {
    it('returns the base finance unchanged when no levers are given', () => {
        const finance = makeFinance();
        const r = modelCombinedScenario(finance, [], '$');
        expect(r.newProfit).toBe(finance.profit);
        expect(r.profitImpact).toBe(0);
        expect(r.breakdown).toHaveLength(0);
    });

    it('applies a revenue % increase alone', () => {
        const finance = makeFinance();
        const levers: CombinedLever[] = [{ type: 'revenue', label: 'Price +20%', revenuePct: 20 }];
        const r = modelCombinedScenario(finance, levers, '$');
        // income 100000 -> 120000, expense unchanged 60000 -> profit 60000
        expect(r.newProfit).toBeCloseTo(60000);
        expect(r.profitImpact).toBeCloseTo(20000);
        expect(r.breakdown[0].profitImpact).toBeCloseTo(20000);
    });

    it('applies a cost reduction alone (negative costDelta)', () => {
        const finance = makeFinance();
        const levers: CombinedLever[] = [{ type: 'cost', label: 'Cut Salaries', costDelta: -6000 }];
        const r = modelCombinedScenario(finance, levers, '$');
        // expense 60000 -> 54000, profit 100000-54000=46000
        expect(r.newProfit).toBeCloseTo(46000);
        expect(r.profitImpact).toBeCloseTo(6000);
    });

    it('combines a price increase AND a salary cut, compounding correctly', () => {
        const finance = makeFinance();
        const levers: CombinedLever[] = [
            { type: 'revenue', label: 'Price +20%', revenuePct: 20 },
            { type: 'cost', label: 'Cut Salaries', costDelta: -6000 },
        ];
        const r = modelCombinedScenario(finance, levers, '$');
        // income -> 120000, expense -> 54000, profit -> 66000
        expect(r.newProfit).toBeCloseTo(66000);
        expect(r.profitImpact).toBeCloseTo(26000);
        expect(r.breakdown).toHaveLength(2);
        // Individual contributions should sum to the total profit impact
        const summed = r.breakdown.reduce((s, b) => s + b.profitImpact, 0);
        expect(summed).toBeCloseTo(r.profitImpact);
    });

    it('includes a loan lever, adding its annualized payment to expense', () => {
        const finance = makeFinance();
        const levers: CombinedLever[] = [
            { type: 'loan', label: 'Loan $50000 @ 0%', loanPrincipal: 50000, loanRatePercent: 0, loanTermMonths: 10 },
        ];
        const r = modelCombinedScenario(finance, levers, '$');
        // 0% loan over 10 months = 5000/mo = 60000/yr added to expense
        // profit: 100000 - (60000+60000) = -20000
        expect(r.newProfit).toBeCloseTo(-20000);
        expect(r.profitImpact).toBeCloseTo(-60000);
    });

    it('never lets expense go negative from a large cost cut', () => {
        const finance = makeFinance({ expense: 5000 });
        const levers: CombinedLever[] = [{ type: 'cost', label: 'Cut everything', costDelta: -50000 }];
        const r = modelCombinedScenario(finance, levers, '$');
        expect(r.newProfit).toBe(finance.income); // expense floored at 0
    });

    it('labels the scenario from the levers included', () => {
        const finance = makeFinance();
        const levers: CombinedLever[] = [
            { type: 'revenue', label: 'Price +20%', revenuePct: 20 },
            { type: 'cost', label: 'Cut Salaries', costDelta: -6000 },
        ];
        const r = modelCombinedScenario(finance, levers, '$');
        expect(r.label).toBe('Price +20% + Cut Salaries');
    });
});
