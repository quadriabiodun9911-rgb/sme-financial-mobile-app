import { autoDetectColumns, parseCSVWithMapping } from '../src/utils/flexibleBankStatementParser';

// This exact format — a single amount column plus an explicit "type" column
// of "credit"/"debit" strings — is the app's own documented sample CSV
// (SAMPLE_CSV in ReconciliationScreen.tsx). It used to import every row as
// an expense regardless of what the type column said: the correctly-parsed
// direction was computed into a local variable that was then discarded in
// favor of a description-keyword guess, which itself defaults any
// income/expense keyword tie to 'expense' — and "customer payment" ties
// against the generic expense keyword "payment".
const SAMPLE_CSV = `date,description,amount,type
2024-01-15,CUSTOMER PAYMENT - ACME CORP,150000,credit
2024-01-16,SUPPLIER PAYMENT - QUICK GOODS,45000,debit
2024-01-18,BANK CHARGES,1500,debit
2024-01-20,TRANSFER FROM CLIENT,75000,credit`;

describe('parseCSVWithMapping', () => {
    it('trusts an explicit type column over description-keyword guessing', () => {
        const rows = SAMPLE_CSV.trim().split('\n');
        const mapping = autoDetectColumns(rows)!;
        expect(mapping).not.toBeNull();
        expect(mapping.typeColumn).toBeDefined();

        const { transactions } = parseCSVWithMapping(SAMPLE_CSV, mapping);
        expect(transactions).toHaveLength(4);

        const byDesc = Object.fromEntries(transactions.map(t => [t.description, t]));
        expect(byDesc['CUSTOMER PAYMENT - ACME CORP'].type).toBe('income');
        expect(byDesc['SUPPLIER PAYMENT - QUICK GOODS'].type).toBe('expense');
        expect(byDesc['BANK CHARGES'].type).toBe('expense');
        expect(byDesc['TRANSFER FROM CLIENT'].type).toBe('income');
    });

    it('trusts separate credit/debit columns over description-keyword guessing', () => {
        const csv = `date,description,credit,debit
2024-02-01,SUPPLIER PAYMENT REFUND,20000,0
2024-02-02,CUSTOMER INVOICE SETTLEMENT,0,5000`;
        const rows = csv.trim().split('\n');
        const mapping = autoDetectColumns(rows)!;
        expect(mapping.creditColumn).toBeDefined();
        expect(mapping.debitColumn).toBeDefined();

        const { transactions } = parseCSVWithMapping(csv, mapping);
        const byDesc = Object.fromEntries(transactions.map(t => [t.description, t]));
        // Both descriptions are keyword-ambiguous/misleading on purpose
        // (a refund that's actually a credit column entry; an "invoice
        // settlement" that's actually a debit) — the explicit column must win.
        expect(byDesc['SUPPLIER PAYMENT REFUND'].type).toBe('income');
        expect(byDesc['CUSTOMER INVOICE SETTLEMENT'].type).toBe('expense');
    });

    it('falls back to description-keyword classification when the CSV gives no direction signal at all', () => {
        const csv = `date,description,amount
2024-03-01,Sale of goods to walk-in customer,50000
2024-03-02,Vendor supplier payment for stock,20000`;
        const rows = csv.trim().split('\n');
        const mapping = autoDetectColumns(rows)!;
        expect(mapping.typeColumn).toBeUndefined();
        expect(mapping.creditColumn).toBeUndefined();

        const { transactions } = parseCSVWithMapping(csv, mapping);
        const byDesc = Object.fromEntries(transactions.map(t => [t.description, t]));
        expect(byDesc['Sale of goods to walk-in customer'].type).toBe('income');
        expect(byDesc['Vendor supplier payment for stock'].type).toBe('expense');
    });
});
