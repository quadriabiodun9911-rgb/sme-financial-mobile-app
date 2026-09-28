import { transactionKey, isDuplicateTransaction, filterNewTransactions, reconcileExternalTransactions, DedupableTransaction, ExternalTransaction, ExistingSyncedTransaction } from '../src/utils/transactionDedup';

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

describe('reconcileExternalTransactions', () => {
    const makeExisting = (overrides: Partial<ExistingSyncedTransaction> = {}): ExistingSyncedTransaction => ({
        id: 'local-1', externalId: 'qbo-101', date: '2026-06-15', description: 'Office rent',
        amount: 50000, type: 'expense', category: 'Rent', ...overrides,
    });
    const makeExt = (overrides: Partial<ExternalTransaction> = {}): ExternalTransaction => ({
        externalId: 'qbo-101', date: '2026-06-15', description: 'Office rent',
        amount: 50000, type: 'expense', category: 'Rent', ...overrides,
    });

    it('treats an unchanged already-imported row as neither fresh nor changed', () => {
        const result = reconcileExternalTransactions([makeExt()], [makeExisting()]);
        expect(result.fresh).toHaveLength(0);
        expect(result.changed).toHaveLength(0);
    });

    it('flags a row as changed (not fresh) when the accountant edited it in the source system', () => {
        // The whole point: a content-based key would treat this edited
        // description as a brand-new transaction and duplicate-import it.
        // externalId must still recognize it as the same real-world
        // transaction and route it to an update, not a fresh insert.
        const result = reconcileExternalTransactions(
            [makeExt({ description: 'Office rent — June (revised)' })],
            [makeExisting()],
        );
        expect(result.fresh).toHaveLength(0);
        expect(result.changed).toHaveLength(1);
        expect(result.changed[0].id).toBe('local-1');
        expect(result.changed[0].candidate.description).toBe('Office rent — June (revised)');
    });

    it('detects a changed amount, date, type, or category individually', () => {
        expect(reconcileExternalTransactions([makeExt({ amount: 55000 })], [makeExisting()]).changed).toHaveLength(1);
        expect(reconcileExternalTransactions([makeExt({ date: '2026-06-16' })], [makeExisting()]).changed).toHaveLength(1);
        expect(reconcileExternalTransactions([makeExt({ type: 'income' })], [makeExisting()]).changed).toHaveLength(1);
        expect(reconcileExternalTransactions([makeExt({ category: 'Utilities' })], [makeExisting()]).changed).toHaveLength(1);
    });

    it('keeps a candidate with a genuinely new externalId as fresh', () => {
        const result = reconcileExternalTransactions([makeExt({ externalId: 'qbo-202' })], [makeExisting()]);
        expect(result.fresh).toHaveLength(1);
        expect(result.fresh[0].externalId).toBe('qbo-202');
        expect(result.changed).toHaveLength(0);
    });

    it('drops a duplicate externalId that appears twice within the same incoming batch, keeping only the first', () => {
        const result = reconcileExternalTransactions(
            [makeExt({ externalId: 'qbo-202' }), makeExt({ externalId: 'qbo-202', description: 'Same row, fetched twice' })],
            [],
        );
        expect(result.fresh).toHaveLength(1);
    });

    it('ignores existing rows with no externalId (native/manual transactions) rather than matching against undefined', () => {
        const existing = [makeExisting({ id: 'local-2', externalId: undefined }), makeExisting()];
        const result = reconcileExternalTransactions([makeExt({ externalId: 'qbo-202' })], existing);
        expect(result.fresh).toHaveLength(1);
        expect(result.changed).toHaveLength(0);
    });
});
