import { computeUnusualSpending } from '../src/utils/unusualSpending';
import { Transaction } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2026-01-01',
    description: 'Test',
    type: 'expense',
    category: 'Utilities',
    amount: 10000,
    status: 'paid',
    ...overrides,
});

describe('computeUnusualSpending', () => {
    it('is unavailable with no expense history', () => {
        const result = computeUnusualSpending([]);
        expect(result.available).toBe(false);
    });

    it('is unavailable with fewer than 3 months of expense history', () => {
        const txs = [
            makeTx({ date: '2026-01-05', category: 'Rent', amount: 50000 }),
            makeTx({ date: '2026-02-05', category: 'Rent', amount: 50000 }),
        ];
        const result = computeUnusualSpending(txs);
        expect(result.available).toBe(false);
    });

    it('flags a category that spiked well above its recent average', () => {
        const txs = [
            makeTx({ date: '2026-01-05', category: 'Utilities', amount: 20000 }),
            makeTx({ date: '2026-02-05', category: 'Utilities', amount: 20000 }),
            // spike: normally ~20,000/month, jumps to 60,000 (200% above baseline)
            makeTx({ date: '2026-03-05', category: 'Utilities', amount: 60000 }),
            // filler so the category isn't the entire month's expense (keeps other assertions meaningful)
            makeTx({ date: '2026-03-10', category: 'Rent', amount: 10000 }),
        ];
        const result = computeUnusualSpending(txs, '₦');
        expect(result.available).toBe(true);
        expect(result.flags.some(f => f.category === 'Utilities' && f.growthPct !== null && f.growthPct > 75)).toBe(true);
        const flag = result.flags.find(f => f.category === 'Utilities')!;
        expect(flag.message).toMatch(/jumped/i);
    });

    it('does not flag a category that stayed within normal month-to-month range', () => {
        const txs = [
            makeTx({ date: '2026-01-05', category: 'Utilities', amount: 20000 }),
            makeTx({ date: '2026-02-05', category: 'Utilities', amount: 21000 }),
            makeTx({ date: '2026-03-05', category: 'Utilities', amount: 22000 }), // ~10% up, normal noise
        ];
        const result = computeUnusualSpending(txs);
        expect(result.flags.some(f => f.category === 'Utilities')).toBe(false);
    });

    it('flags a brand-new expense category as unusual, distinct from a spike', () => {
        const txs = [
            makeTx({ date: '2026-01-05', category: 'Rent', amount: 50000 }),
            makeTx({ date: '2026-02-05', category: 'Rent', amount: 50000 }),
            makeTx({ date: '2026-03-05', category: 'Rent', amount: 50000 }),
            makeTx({ date: '2026-03-10', category: 'Legal Fees', amount: 30000 }), // never appeared before
        ];
        const result = computeUnusualSpending(txs, '₦');
        const flag = result.flags.find(f => f.category === 'Legal Fees')!;
        expect(flag).toBeDefined();
        expect(flag.growthPct).toBeNull();
        expect(flag.message).toMatch(/new expense category/i);
    });

    it('ignores a tiny new/spiking category that is not a meaningful share of the month\'s spend', () => {
        const txs = [
            makeTx({ date: '2026-01-05', category: 'Rent', amount: 500000 }),
            makeTx({ date: '2026-02-05', category: 'Rent', amount: 500000 }),
            makeTx({ date: '2026-03-05', category: 'Rent', amount: 500000 }),
            makeTx({ date: '2026-03-10', category: 'Office Snacks', amount: 2000 }), // negligible vs 500,000 rent
        ];
        const result = computeUnusualSpending(txs);
        expect(result.flags.some(f => f.category === 'Office Snacks')).toBe(false);
    });

    it('excludes loan repayments from spike detection', () => {
        const txs = [
            makeTx({ date: '2026-01-05', category: 'Loan Repayment', amount: 20000 }),
            makeTx({ date: '2026-02-05', category: 'Loan Repayment', amount: 20000 }),
            makeTx({ date: '2026-03-05', category: 'Loan Repayment', amount: 100000 }), // would look like a spike otherwise
        ];
        const result = computeUnusualSpending(txs);
        expect(result.flags.some(f => f.category === 'Loan Repayment')).toBe(false);
    });

    it('sorts flags by the absolute dollar size of the deviation, largest first', () => {
        const txs = [
            makeTx({ date: '2026-01-05', category: 'Utilities', amount: 20000 }),
            makeTx({ date: '2026-02-05', category: 'Utilities', amount: 20000 }),
            makeTx({ date: '2026-03-05', category: 'Utilities', amount: 40000 }), // +20,000 deviation
            makeTx({ date: '2026-01-06', category: 'Marketing', amount: 100000 }),
            makeTx({ date: '2026-02-06', category: 'Marketing', amount: 100000 }),
            makeTx({ date: '2026-03-06', category: 'Marketing', amount: 500000 }), // +400,000 deviation
        ];
        const result = computeUnusualSpending(txs);
        expect(result.flags[0].category).toBe('Marketing');
    });
});
