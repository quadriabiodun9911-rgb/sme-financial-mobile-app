import { computeBudgetIntelligence, computeBudgetVarianceStreak } from '../src/utils/budgetIntelligence';
import { Transaction, Budget } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2026-03-10',
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

const PERIOD = '2026-03';

describe('computeBudgetIntelligence', () => {
    it('is unavailable with no budgets and no revenue target', () => {
        const result = computeBudgetIntelligence([], [], PERIOD, 0);
        expect(result.available).toBe(false);
    });

    it('matches the product-vision example table: Revenue -15%, Marketing +55%, Rent on track, Net Cash Flow shortfall', () => {
        const budgets: Budget[] = [
            { id: 'b1', category: 'Marketing', monthlyAmount: 200000, period: PERIOD },
            { id: 'b2', category: 'Rent', monthlyAmount: 250000, period: PERIOD },
        ];
        const txs: Transaction[] = [
            makeTx({ type: 'income', category: 'Sales', amount: 1700000, date: '2026-03-10' }), // Revenue actual
            makeTx({ type: 'expense', category: 'Marketing', amount: 310000, date: '2026-03-05' }),
            makeTx({ type: 'expense', category: 'Rent', amount: 250000, date: '2026-03-01' }),
        ];
        const result = computeBudgetIntelligence(txs, budgets, PERIOD, 2000000, '₦');

        expect(result.available).toBe(true);
        expect(result.revenueLine!.variancePct).toBeCloseTo(-15, 0);
        expect(result.revenueLine!.favorability).toBe('unfavorable');

        const marketing = result.expenseLines.find(l => l.metric === 'Marketing')!;
        expect(marketing.variancePct).toBeCloseTo(55, 0);
        expect(marketing.favorability).toBe('unfavorable');

        const rent = result.expenseLines.find(l => l.metric === 'Rent')!;
        expect(rent.favorability).toBe('on_track');

        // Budgeted net cash flow = 2.0m - (200k + 250k) = 1.55m
        // Actual net cash flow = 1.7m - (310k + 250k) = 1.14m
        expect(result.netCashFlowLine!.budgeted).toBeCloseTo(1550000, 0);
        expect(result.netCashFlowLine!.actual).toBeCloseTo(1140000, 0);
        expect(result.netCashFlowLine!.favorability).toBe('unfavorable');
    });

    it('synthesizes a narrative naming the revenue miss, the worst expense overrun, and the cash impact', () => {
        const budgets: Budget[] = [
            { id: 'b1', category: 'Marketing', monthlyAmount: 200000, period: PERIOD },
        ];
        const txs: Transaction[] = [
            makeTx({ type: 'income', amount: 1700000, date: '2026-03-10' }),
            makeTx({ type: 'expense', category: 'Marketing', amount: 310000, date: '2026-03-05' }),
        ];
        const result = computeBudgetIntelligence(txs, budgets, PERIOD, 2000000, '₦');
        expect(result.narrative).toMatch(/revenue was 15% below budget/i);
        expect(result.narrative).toMatch(/marketing expenditure was 55% above budget/i);
        expect(result.narrative).toMatch(/reduced expected cash generation by approximately ₦/i);
    });

    it('reports a clean narrative when revenue and spending are on or ahead of budget', () => {
        const budgets: Budget[] = [
            { id: 'b1', category: 'Rent', monthlyAmount: 250000, period: PERIOD },
        ];
        const txs: Transaction[] = [
            makeTx({ type: 'income', amount: 2200000, date: '2026-03-10' }),
            makeTx({ type: 'expense', category: 'Rent', amount: 250000, date: '2026-03-01' }),
        ];
        const result = computeBudgetIntelligence(txs, budgets, PERIOD, 2000000, '₦');
        expect(result.narrative).toMatch(/more cash than planned/i);
    });

    describe('WHY explanations', () => {
        it('flags "review needed" when a category overspends while revenue declines, matching the product-vision example', () => {
            const budgets: Budget[] = [{ id: 'b1', category: 'Marketing', monthlyAmount: 200000, period: PERIOD }];
            const txs: Transaction[] = [
                // Prior month (Feb): baseline revenue and marketing spend
                makeTx({ type: 'income', amount: 1000000, date: '2026-02-10' }),
                makeTx({ type: 'expense', category: 'Marketing', amount: 200000, date: '2026-02-05' }),
                // Current month (Mar): marketing +50%, revenue -10%
                makeTx({ type: 'income', amount: 900000, date: '2026-03-10' }),
                makeTx({ type: 'expense', category: 'Marketing', amount: 300000, date: '2026-03-05' }),
            ];
            const result = computeBudgetIntelligence(txs, budgets, PERIOD, 1000000, '₦');
            const explanation = result.explanations.find(e => e.category === 'Marketing')!;
            expect(explanation.verdict).toBe('review-needed');
            expect(explanation.message).toMatch(/review whether this spend is delivering results/i);
        });

        it('flags "revenue-aligned" when a category overspends while revenue grows meaningfully, matching the product-vision example', () => {
            const budgets: Budget[] = [{ id: 'b1', category: 'Marketing', monthlyAmount: 200000, period: PERIOD }];
            const txs: Transaction[] = [
                makeTx({ type: 'income', amount: 1000000, date: '2026-02-10' }),
                makeTx({ type: 'expense', category: 'Marketing', amount: 200000, date: '2026-02-05' }),
                // Current month: marketing +50%, revenue +40%
                makeTx({ type: 'income', amount: 1400000, date: '2026-03-10' }),
                makeTx({ type: 'expense', category: 'Marketing', amount: 300000, date: '2026-03-05' }),
            ];
            const result = computeBudgetIntelligence(txs, budgets, PERIOD, 1000000, '₦');
            const explanation = result.explanations.find(e => e.category === 'Marketing')!;
            expect(explanation.verdict).toBe('revenue-aligned');
            expect(explanation.message).toMatch(/worth confirming the spend is what's driving it/i);
        });

        it('never produces a WHY explanation for a category tracking within budget', () => {
            const budgets: Budget[] = [{ id: 'b1', category: 'Rent', monthlyAmount: 250000, period: PERIOD }];
            const txs: Transaction[] = [
                makeTx({ type: 'income', amount: 1000000, date: '2026-03-10' }),
                makeTx({ type: 'expense', category: 'Rent', amount: 250000, date: '2026-03-01' }),
            ];
            const result = computeBudgetIntelligence(txs, budgets, PERIOD, 1000000, '₦');
            expect(result.explanations.find(e => e.category === 'Rent')).toBeUndefined();
        });
    });

    it('never disagrees with computeBudgetVsActual\'s own per-category variance', () => {
        const { computeBudgetVsActual } = require('../src/utils/finance');
        const budgets: Budget[] = [
            { id: 'b1', category: 'Marketing', monthlyAmount: 200000, period: PERIOD },
            { id: 'b2', category: 'Payroll', monthlyAmount: 600000, period: PERIOD },
        ];
        const txs: Transaction[] = [
            makeTx({ type: 'expense', category: 'Marketing', amount: 310000, date: '2026-03-05' }),
            makeTx({ type: 'expense', category: 'Payroll', amount: 610000, date: '2026-03-05' }),
        ];
        const result = computeBudgetIntelligence(txs, budgets, PERIOD, 2000000, '₦');
        const direct = computeBudgetVsActual(txs, budgets, PERIOD);
        for (const line of result.expenseLines) {
            const match = direct.find((d: any) => d.category === line.metric)!;
            expect(line.actual).toBe(match.actual);
            // Sign conventions deliberately differ: computeBudgetVsActual's
            // variance is budgeted-minus-actual (positive = under budget);
            // this engine's is actual-minus-budgeted (positive = over),
            // kept consistent across revenue/expense/net-cash-flow rows.
            // Same magnitude, opposite sign.
            expect(line.variance).toBe(-match.variance);
        }
    });
});

describe('computeBudgetVarianceStreak', () => {
    const makeTx = (overrides: Partial<Transaction>): Transaction => ({
        id: `tx-${Math.random()}`, date: '2026-01-01', description: 'Test',
        type: 'expense', category: 'Marketing', amount: 0, status: 'paid', ...overrides,
    });

    function monthBudget(month: string, amount: number): Budget {
        return { id: `b-${month}`, category: 'Marketing', monthlyAmount: amount, period: month };
    }
    function monthActual(month: string, amount: number): Transaction {
        return makeTx({ category: 'Marketing', amount, date: `${month}-10` });
    }

    const NOW = new Date('2026-06-15');

    it('is unavailable with no active budgets in the lookback window', () => {
        const result = computeBudgetVarianceStreak([], [], 6, NOW);
        expect(result.available).toBe(false);
    });

    it('counts a single over-budget month without producing a narrative', () => {
        const budgets = [monthBudget('2026-06', 100000)];
        const txs = [monthActual('2026-06', 150000)]; // +50%, well over the 5% band
        const result = computeBudgetVarianceStreak(txs, budgets, 6, NOW);
        expect(result.available).toBe(true);
        expect(result.currentStreak).toBe(1);
        expect(result.narrative).toBeNull();
    });

    it('matches the product-vision example: 3 consecutive over-budget months produce the exact narrative', () => {
        const months = ['2026-04', '2026-05', '2026-06'];
        const budgets = months.map(m => monthBudget(m, 100000));
        const txs = months.map(m => monthActual(m, 130000)); // +30% each month
        const result = computeBudgetVarianceStreak(txs, budgets, 6, NOW);
        expect(result.currentStreak).toBe(3);
        expect(result.narrative).toBe('Your budget is becoming less reliable because actual expenses have exceeded forecast for 3 consecutive months.');
    });

    it('only counts the TRAILING consecutive run, not the total number of over-budget months', () => {
        const budgets = ['2026-03', '2026-04', '2026-05', '2026-06'].map(m => monthBudget(m, 100000));
        const txs = [
            monthActual('2026-03', 150000), // over
            monthActual('2026-04', 90000),  // on track -- breaks the streak
            monthActual('2026-05', 150000), // over
            monthActual('2026-06', 150000), // over
        ];
        const result = computeBudgetVarianceStreak(txs, budgets, 6, NOW);
        expect(result.currentStreak).toBe(2); // only May + June
    });

    it('is 0 when the most recent budgeted month is on track', () => {
        const budgets = ['2026-05', '2026-06'].map(m => monthBudget(m, 100000));
        const txs = [monthActual('2026-05', 150000), monthActual('2026-06', 100000)]; // June on track
        const result = computeBudgetVarianceStreak(txs, budgets, 6, NOW);
        expect(result.currentStreak).toBe(0);
        expect(result.narrative).toBeNull();
    });

    it('skips months with no active budget rather than treating them as under-budget', () => {
        const budgets = [monthBudget('2026-06', 100000)]; // only June has a budget
        const txs = [monthActual('2026-01', 999999), monthActual('2026-06', 100000)];
        const result = computeBudgetVarianceStreak(txs, budgets, 6, NOW);
        expect(result.months).toHaveLength(1);
        expect(result.months[0].month).toBe('2026-06');
    });
});
