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

    it('does not let a trailing running-Balance column overwrite the real Amount column', () => {
        // Balance here is a large, ever-growing cumulative total -- exactly
        // the shape that silently exploded totals when 'balance' was also
        // listed as an amount pattern and, appearing after Amount in the
        // header, overwrote the correct column match.
        const csv = `date,description,amount,type,balance
2024-01-15,CUSTOMER PAYMENT - ACME CORP,150000,credit,150000
2024-01-16,SUPPLIER PAYMENT - QUICK GOODS,45000,debit,105000
2024-01-18,BANK CHARGES,1500,debit,103500`;
        const rows = csv.trim().split('\n');
        const mapping = autoDetectColumns(rows)!;
        expect(mapping).not.toBeNull();
        expect(mapping.balanceColumn).toBeDefined();

        const { transactions, summary } = parseCSVWithMapping(csv, mapping);
        expect(transactions).toHaveLength(3);
        expect(transactions.map(t => t.amount)).toEqual([150000, 45000, 1500]);
        expect(summary.totalIncome).toBe(150000);
        expect(summary.totalExpenses).toBe(46500);
    });

    it('reads an ambiguous date as DD/MM/YYYY (this app\'s NGN/Nigerian format), not US MM/DD/YYYY', () => {
        const csv = `date,description,amount,type
05/03/2024,Test Payment,1000,credit
25/03/2024,Test Payment,1000,credit`;
        const rows = csv.trim().split('\n');
        const mapping = autoDetectColumns(rows)!;

        const { transactions } = parseCSVWithMapping(csv, mapping);
        // 05/03 is genuinely ambiguous (both <=12) -- must default to DD/MM (5 March), not MM/DD (May 3rd).
        expect(transactions[0].date).toBe('2024-03-05');
        // 25/03 is unambiguous (day > 12 forces DD/MM regardless of the default).
        expect(transactions[1].date).toBe('2024-03-25');
    });

    it('flips to MM/DD when the second number cannot be a valid month', () => {
        // 12/25/2024: DD/MM would need a 25th month, which doesn't exist --
        // this can only be 25 Dec, not month 25 rolling the date over.
        const csv = `date,description,amount,type
12/25/2024,Test Payment,1000,credit`;
        const rows = csv.trim().split('\n');
        const mapping = autoDetectColumns(rows)!;
        const { transactions } = parseCSVWithMapping(csv, mapping);
        expect(transactions[0].date).toBe('2024-12-25');
    });
});
