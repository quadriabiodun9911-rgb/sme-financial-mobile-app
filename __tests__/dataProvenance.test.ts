import { transactionProvenance, aggregateFigureProvenance } from '../src/utils/dataProvenance';
import { Transaction } from '../src/types';

const makeTx = (overrides: Partial<Transaction> = {}): Transaction => ({
    id: 'tx',
    date: '2026-01-01',
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 100,
    status: 'paid',
    ...overrides,
});

describe('transactionProvenance', () => {
    it('treats a manually-entered transaction as recorded', () => {
        expect(transactionProvenance(makeTx({ source: 'manual' }))).toBe('recorded');
    });

    it('treats a transaction with no source as recorded (covers typed entry, Quick Add, bank-statement import, receipt scan, WhatsApp capture)', () => {
        expect(transactionProvenance(makeTx({ source: undefined }))).toBe('recorded');
    });

    it('treats a Mono-connected bank feed transaction as verified', () => {
        expect(transactionProvenance(makeTx({ source: 'mono' }))).toBe('verified');
    });

    it('treats a QuickBooks-synced transaction as imported', () => {
        expect(transactionProvenance(makeTx({ source: 'quickbooks' }))).toBe('imported');
    });

    it('treats a Xero-synced transaction as imported', () => {
        expect(transactionProvenance(makeTx({ source: 'xero' }))).toBe('imported');
    });
});

describe('aggregateFigureProvenance', () => {
    it('is missing when there are no transactions at all', () => {
        expect(aggregateFigureProvenance([], false)).toBe('missing');
    });

    it('is estimated when a completeness gap is flagged, regardless of how clean the sources look', () => {
        const txs = [makeTx({ source: 'mono' }), makeTx({ source: 'mono' })];
        expect(aggregateFigureProvenance(txs, true)).toBe('estimated');
    });

    it('is verified only when every transaction is Mono-verified', () => {
        const txs = [makeTx({ source: 'mono' }), makeTx({ source: 'mono' })];
        expect(aggregateFigureProvenance(txs, false)).toBe('verified');
    });

    it('is imported when transactions are a mix of verified and imported, with no manual entries', () => {
        const txs = [makeTx({ source: 'mono' }), makeTx({ source: 'quickbooks' })];
        expect(aggregateFigureProvenance(txs, false)).toBe('imported');
    });

    it('falls back to recorded (the conservative default) the moment even one transaction is manual, even if the rest are verified', () => {
        const txs = [makeTx({ source: 'mono' }), makeTx({ source: 'mono' }), makeTx({ source: 'manual' })];
        expect(aggregateFigureProvenance(txs, false)).toBe('recorded');
    });

    it('is recorded for an all-manual set, the overwhelmingly common real-world case', () => {
        const txs = [makeTx({ source: 'manual' }), makeTx({ source: undefined })];
        expect(aggregateFigureProvenance(txs, false)).toBe('recorded');
    });
});
