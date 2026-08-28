import { transactionKey, isDuplicateTransaction, filterNewTransactions, DedupableTransaction } from '../src/utils/transactionDedup';

const makeTx = (overrides: Partial<DedupableTransaction> = {}): DedupableTransaction => ({
    date: '2026-06-15',
    description: 'Sales — Ankara dresses',
    amount: 85000,
    type: 'income',
    ...overrides,
});

describe('transactionKey', () => {
    it('normalizes description case and whitespace so trivial formatting differences still match', () => {
        const a = makeTx({ description: 'Sales — Ankara dresses' });
        const b = makeTx({ description: '  SALES — Ankara Dresses  ' });
        expect(transactionKey(a)).toBe(transactionKey(b));
    });

    it('rounds amount to the nearest cent so floating-point noise never breaks a match', () => {
        const a = makeTx({ amount: 85000 });
        const b = makeTx({ amount: 85000.001 });
        expect(transactionKey(a)).toBe(transactionKey(b));
    });

    it('treats a different date as a different transaction', () => {
        const a = makeTx({ date: '2026-06-15' });
        const b = makeTx({ date: '2026-06-16' });
        expect(transactionKey(a)).not.toBe(transactionKey(b));
    });

    it('treats a different amount as a different transaction', () => {
        const a = makeTx({ amount: 85000 });
        const b = makeTx({ amount: 85001 });
        expect(transactionKey(a)).not.toBe(transactionKey(b));
    });

    it('treats a different type (income vs expense) as a different transaction even with identical date/description/amount', () => {
        const a = makeTx({ type: 'income' });
        const b = makeTx({ type: 'expense' });
        expect(transactionKey(a)).not.toBe(transactionKey(b));
    });
});

describe('isDuplicateTransaction', () => {
    it('catches a re-uploaded row that exactly matches an already-recorded transaction', () => {
        const existing = [makeTx()];
        const candidate = makeTx();
        expect(isDuplicateTransaction(candidate, existing)).toBe(true);
    });

    it('never flags a genuinely different transaction as a duplicate', () => {
        const existing = [makeTx({ amount: 85000 })];
        const candidate = makeTx({ amount: 42000, description: 'Sales — Shoes & handbags' });
        expect(isDuplicateTransaction(candidate, existing)).toBe(false);
    });
});

describe('filterNewTransactions', () => {
    it('drops every candidate that matches an existing transaction, keeping only genuinely new ones', () => {
        const existing = [makeTx({ description: 'Rent' }), makeTx({ description: 'Utilities' })];
        const candidates = [
            makeTx({ description: 'Rent' }),        // re-uploaded duplicate of an existing transaction
            makeTx({ description: 'New sale' }),     // genuinely new
        ];
        const fresh = filterNewTransactions(candidates, existing);
        expect(fresh).toHaveLength(1);
        expect(fresh[0].description).toBe('New sale');
    });

    it('also drops a duplicate that only appears twice within the same incoming batch, not just against existing data', () => {
        const candidates = [
            makeTx({ description: 'Sale A' }),
            makeTx({ description: 'Sale A' }), // same statement row parsed/pasted twice in this one batch
        ];
        const fresh = filterNewTransactions(candidates, []);
        expect(fresh).toHaveLength(1);
    });

    it('returns every candidate unchanged when nothing overlaps with existing data', () => {
        const existing = [makeTx({ description: 'Rent' })];
        const candidates = [makeTx({ description: 'Sale A' }), makeTx({ description: 'Sale B', amount: 10000 })];
        const fresh = filterNewTransactions(candidates, existing);
        expect(fresh).toHaveLength(2);
    });
});
