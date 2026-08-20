import { Transaction, Invoice, Asset, InventoryItem, FinancialGoal, Loan, Budget } from '../types';
import { getUndecryptedFields, ENCRYPTED_FIELDS } from './encryption';

export type IntegrityEntityType = keyof typeof ENCRYPTED_FIELDS;

export interface IntegrityIssue {
    entityType: IntegrityEntityType;
    id: string;
    label: string;
    brokenFields: string[];
}

// Finds every record still carrying leftover ciphertext this device's
// current encryption key can't read (see getUndecryptedFields) -- the
// aftermath of a PIN reset that happened before syncFieldEncryptionKey
// existed. Surfaced by DataIntegrityScreen so the user can see exactly
// which records are affected and remove them, rather than the app quietly
// showing them as zero/blank forever.
export function auditDataIntegrity(data: {
    transactions: Transaction[];
    invoices: Invoice[];
    assets: Asset[];
    inventory: InventoryItem[];
    goals: FinancialGoal[];
    loans: Loan[];
    budgets: Budget[];
}): IntegrityIssue[] {
    const issues: IntegrityIssue[] = [];

    const scan = <T extends { id: string }>(
        records: T[],
        entityType: IntegrityEntityType,
        label: (r: T) => string,
    ) => {
        for (const record of records) {
            const brokenFields = getUndecryptedFields(record as unknown as Record<string, any>, entityType);
            if (brokenFields.length > 0) {
                issues.push({ entityType, id: record.id, label: label(record), brokenFields });
            }
        }
    };

    scan(data.transactions, 'transactions', t => `${t.date || 'Undated'} transaction`);
    scan(data.invoices, 'invoices', i => `Invoice ${i.invoiceNumber || i.id}`);
    scan(data.assets, 'assets', a => a.name || `Asset ${a.id}`);
    scan(data.inventory, 'inventory', i => i.name || `Inventory item ${i.id}`);
    scan(data.goals, 'goals', g => g.title || `Goal ${g.id}`);
    scan(data.loans, 'loans', l => `Loan from ${l.lenderName || 'unknown lender'}`);
    scan(data.budgets, 'budgets', b => `Budget: ${b.category || b.id}`);

    return issues;
}

export const ENTITY_LABELS: Record<IntegrityEntityType, string> = {
    transactions: 'Transactions',
    invoices: 'Invoices',
    assets: 'Assets',
    inventory: 'Inventory Items',
    goals: 'Goals',
    loans: 'Loans',
    budgets: 'Budgets',
};
