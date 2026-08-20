import { getUndecryptedFields } from '../src/utils/encryption';
import { auditDataIntegrity } from '../src/utils/dataIntegrity';

describe('getUndecryptedFields', () => {
    it('flags a field whose ciphertext exists but never decrypted', () => {
        const broken = {
            id: 't1',
            amount_encrypted: 'U2FsdGVkX1garbage==',
            // amount is absent -- decryptValue failed and never set it
            category: 'Sales',
        };
        expect(getUndecryptedFields(broken, 'transactions')).toEqual(['amount']);
    });

    it('does not flag a record that decrypted cleanly', () => {
        const ok = { id: 't2', amount: 500, description: 'Sale', category: 'Sales' };
        expect(getUndecryptedFields(ok, 'transactions')).toEqual([]);
    });

    it('does not flag a field that was simply never encrypted', () => {
        const neverEncrypted = { id: 't3', amount: 100 };
        expect(getUndecryptedFields(neverEncrypted, 'transactions')).toEqual([]);
    });

    it('flags multiple broken fields on the same record', () => {
        const broken = {
            id: 'inv1',
            amount_encrypted: 'ciphertext',
            description_encrypted: 'ciphertext',
            clientName: 'Acme',
        };
        expect(getUndecryptedFields(broken, 'invoices').sort()).toEqual(['amount', 'description']);
    });
});

describe('auditDataIntegrity', () => {
    it('finds broken records across every entity type and leaves clean ones out', () => {
        const issues = auditDataIntegrity({
            transactions: [
                { id: 't1', date: '2026-01-01', amount_encrypted: 'x' } as any,
                { id: 't2', date: '2026-01-02', amount: 50, description: 'ok', category: 'Sales' } as any,
            ],
            invoices: [{ id: 'i1', invoiceNumber: 'INV-1', amount_encrypted: 'x' } as any],
            assets: [],
            inventory: [],
            goals: [],
            loans: [],
            budgets: [],
        });

        expect(issues).toHaveLength(2);
        expect(issues.find(i => i.entityType === 'transactions')?.id).toBe('t1');
        expect(issues.find(i => i.entityType === 'invoices')?.id).toBe('i1');
    });

    it('returns an empty list when nothing is broken', () => {
        const issues = auditDataIntegrity({
            transactions: [{ id: 't1', date: '2026-01-01', amount: 10, description: 'x', category: 'y' } as any],
            invoices: [],
            assets: [],
            inventory: [],
            goals: [],
            loans: [],
            budgets: [],
        });
        expect(issues).toEqual([]);
    });
});
