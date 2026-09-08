import { computeResilienceTrend } from '../src/utils/resilienceTrend';
import { Transaction, Loan } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2024-01-01',
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

const makeLoan = (overrides: Partial<Loan>): Loan => ({
    id: 'l1',
    lenderName: 'Bank',
    purpose: 'Working capital',
    principal: 12000,
    interestRate: 12,
    termMonths: 12,
    startDate: '2024-01-01',
    status: 'active',
    payments: [],
    createdAt: '2024-01-01',
    ...overrides,
});

describe('computeResilienceTrend', () => {
    it('returns an empty array with no transaction history', () => {
        expect(computeResilienceTrend([], [], [])).toEqual([]);
    });

    it('returns one point per month with data, labeled and keyed correctly', () => {
        const txs = [
            makeTx({ date: '2024-01-05', type: 'income', amount: 100000 }),
            makeTx({ date: '2024-01-10', type: 'expense', amount: 40000 }),
            makeTx({ date: '2024-02-05', type: 'income', amount: 100000 }),
            makeTx({ date: '2024-02-10', type: 'expense', amount: 40000 }),
        ];
        const points = computeResilienceTrend(txs, [], []);
        expect(points.map(p => p.key)).toEqual(['2024-01', '2024-02']);
        expect(points[0].label).toMatch(/Jan 2024/);
        expect(points[1].label).toMatch(/Feb 2024/);
    });

    it('reports a growing reserve-coverage trend as cash builds up month over month', () => {
        const txs = [
            makeTx({ date: '2024-01-05', type: 'income', amount: 100000 }),
            makeTx({ date: '2024-01-10', type: 'expense', amount: 40000 }),
            makeTx({ date: '2024-02-05', type: 'income', amount: 100000 }),
            makeTx({ date: '2024-02-10', type: 'expense', amount: 40000 }),
            makeTx({ date: '2024-03-05', type: 'income', amount: 100000 }),
            makeTx({ date: '2024-03-10', type: 'expense', amount: 40000 }),
        ];
        const points = computeResilienceTrend(txs, [], []);
        expect(points).toHaveLength(3);
        const months = points.map(p => p.reserveCoverageMonths as number);
        // Cumulative cash keeps growing by a fixed 60,000/month surplus while
        // the trailing burn rate the denominator uses stays roughly the same
        // shape -- so the coverage ratio should be monotonically increasing.
        expect(months[1]).toBeGreaterThan(months[0]);
        expect(months[2]).toBeGreaterThan(months[1]);
    });

    it('includes loansOutstanding per period from the balance sheet trend', () => {
        const txs = [makeTx({ date: '2024-01-05', type: 'income', amount: 50000 })];
        const loans = [makeLoan({ startDate: '2024-01-01', principal: 12000, termMonths: 12 })];
        const points = computeResilienceTrend(txs, [], loans);
        expect(points[0].loansOutstanding).toBeGreaterThan(0);
    });

    it('reports null (not a fabricated number) when essential expenses were zero that month', () => {
        const txs = [makeTx({ date: '2024-01-05', type: 'income', amount: 50000 })];
        const points = computeResilienceTrend(txs, [], []);
        expect(points[0].reserveCoverageMonths).toBeNull();
    });

    it('caps the number of points returned to maxPoints, keeping the most recent', () => {
        const txs = Array.from({ length: 6 }, (_, i) => {
            const month = String(i + 1).padStart(2, '0');
            return makeTx({ date: `2024-${month}-05`, type: 'income', amount: 50000 });
        });
        const points = computeResilienceTrend(txs, [], [], 3);
        expect(points.map(p => p.key)).toEqual(['2024-04', '2024-05', '2024-06']);
    });

    it('excludes a later-dated recurring expense from an earlier month\'s burn rate', () => {
        const txs = [
            makeTx({ date: '2024-01-05', type: 'income', amount: 100000 }),
            makeTx({ date: '2024-06-01', type: 'expense', amount: 20000, isRecurring: true, recurringFrequency: 'monthly' }),
        ];
        const points = computeResilienceTrend(txs, [], []);
        const januaryPoint = points.find(p => p.key === '2024-01')!;
        // No expense at all existed as of January -- the June-dated recurring
        // expense must not leak backward into January's projected burn.
        expect(januaryPoint.reserveCoverageMonths).toBeNull();
    });
});
