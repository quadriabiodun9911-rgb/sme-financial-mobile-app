import { transactionKey, isDuplicateTransaction, filterNewTransactions, filterNewExternalTransactions, DedupableTransaction, ExternalTransaction } from '../src/utils/transactionDedup';

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

describe('filterNewExternalTransactions', () => {
    const makeExt = (externalId: string, extra: Partial<{ description: string }> = {}): ExternalTransaction & { description: string } => ({
        externalId, description: `Row ${externalId}`, ...extra,
    });

    it('drops a candidate whose externalId already exists, even if every other field changed', () => {
        // The whole point: the accountant edited the description in
        // QuickBooks after the first sync, so a content-based key would
        // treat this as a brand-new transaction. externalId must still
        // catch it as the same one.
        const existing = [{ externalId: 'qbo-101' }];
        const candidates = [makeExt('qbo-101', { description: 'Edited description' })];
        expect(filterNewExternalTransactions(candidates, existing)).toHaveLength(0);
    });

    it('keeps a candidate with a genuinely new externalId', () => {
        const existing = [{ externalId: 'qbo-101' }];
        const candidates = [makeExt('qbo-202')];
        const fresh = filterNewExternalTransactions(candidates, existing);
        expect(fresh).toHaveLength(1);
        expect(fresh[0].externalId).toBe('qbo-202');
    });

    it('drops a duplicate externalId that appears twice within the same incoming batch', () => {
        const candidates = [makeExt('qbo-101'), makeExt('qbo-101', { description: 'Same row, fetched twice' })];
        expect(filterNewExternalTransactions(candidates, [])).toHaveLength(1);
    });

    it('ignores existing rows with no externalId (native/manual transactions) rather than matching against undefined', () => {
        const existing = [{ externalId: undefined }, { externalId: 'qbo-101' }];
        const candidates = [makeExt('qbo-202')];
        expect(filterNewExternalTransactions(candidates, existing)).toHaveLength(1);
    });
});
