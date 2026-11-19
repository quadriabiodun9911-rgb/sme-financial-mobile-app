import { computeLiabilitiesWorklist } from '../src/utils/liabilitiesWorklist';
import { liabilityStatusMeta } from '../src/components/LiabilitiesWorklistCard';
import { Colors } from '../src/theme/colors';
import { Transaction, Loan, Bill } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2026-06-01',
    description: 'Test',
    type: 'expense',
    category: 'Supplies',
    amount: 1000,
    status: 'pending',
    ...overrides,
});

const makeBill = (overrides: Partial<Bill>): Bill => ({
    id: `bill-${Math.random()}`,
    vendorName: 'Vendor',
    lineItems: [],
    status: 'needs_review',
    subtotal: 10000,
    taxTotal: 0,
    total: 10000,
    currency: '₦',
    createdAt: '2026-06-01',
    source: 'manual',
    ...overrides,
});

const makeLoan = (overrides: Partial<Loan>): Loan => ({
    id: `loan-${Math.random()}`, lenderName: 'Bank', principal: 1000000, interestRate: 15, termMonths: 12,
    startDate: '2026-01-15', status: 'active', purpose: 'WC', payments: [], createdAt: '2026-01-15',
    ...overrides,
} as Loan);

const finance = { cashBalance: 5000000, totalTaxCollected: 0, totalTaxPaid: 0 };

describe('computeLiabilitiesWorklist', () => {
    it('returns an empty, reassuring result with nothing recorded', () => {
        const result = computeLiabilitiesWorklist([], [], [], finance, '₦');
        expect(result.items).toEqual([]);
        expect(result.total).toBe(0);
        expect(result.totalLoans).toBe(0);
        expect(result.totalAccountsPayable).toBe(0);
        expect(result.totalBillsNeedingReview).toBe(0);
        expect(result.totalTax).toBe(0);
        expect(result.hiddenTotal).toBe(0);
        expect(result.narrative).toMatch(/No outstanding liabilities/);
    });

    describe('loans', () => {
        it('lists an active loan with its real outstanding balance and next due date, and skips an inactive one', () => {
            const loans: Loan[] = [
                makeLoan({ id: 'l1', lenderName: 'First Bank', startDate: '2026-01-15', status: 'active' }),
                makeLoan({ id: 'l2', lenderName: 'Paid Off Bank', principal: 500000, startDate: '2025-01-15', status: 'paid_off' }),
            ];
            const result = computeLiabilitiesWorklist(loans, [], [], finance, '₦');
            expect(result.totalLoans).toBe(1000000);
            const loanItems = result.items.filter(i => i.kind === 'loan');
            expect(loanItems).toHaveLength(1);
            expect(loanItems[0].label).toBe('First Bank');
            expect(loanItems[0].amount).toBe(1000000);
            expect(loanItems[0].dueDate).toBe('2026-02-15');
        });

        it('shows the correct local due date rather than one day earlier in a positive-UTC-offset timezone', () => {
            const originalTZ = process.env.TZ;
            process.env.TZ = 'Africa/Lagos';
            try {
                const loans = [makeLoan({ startDate: '2026-01-15' })];
                const result = computeLiabilitiesWorklist(loans, [], [], finance, '₦');
                const loanItem = result.items.find(i => i.kind === 'loan')!;
                // Would read '2026-02-14' if due-date formatting used
                // toISOString() (UTC conversion) instead of a local-date format.
                expect(loanItem.dueDate).toBe('2026-02-15');
            } finally {
                process.env.TZ = originalTZ;
            }
        });

        it('computes the exact number of days overdue, not just "some positive number"', () => {
            // Loan started 2026-01-15, no payments -> next due date 2026-02-15.
            // "Now" fixed at 2026-04-16 -> exactly 60 days overdue (13 days
            // left in Feb + 31 days of March + 16 days of April).
            const loans = [makeLoan({ startDate: '2026-01-15' })];
            const now = new Date(2026, 3, 16);
            const result = computeLiabilitiesWorklist(loans, [], [], finance, '₦', now);
            const loanItem = result.items.find(i => i.kind === 'loan')!;
            expect(loanItem.daysOverdue).toBe(60);
        });

        it('does not crash and omits the due date for a loan with a missing or malformed startDate', () => {
            const loans = [
                makeLoan({ id: 'l1', lenderName: 'No Start Date', startDate: undefined as unknown as string }),
                makeLoan({ id: 'l2', lenderName: 'Garbled Start Date', startDate: 'not-a-date' }),
            ];
            expect(() => computeLiabilitiesWorklist(loans, [], [], finance, '₦')).not.toThrow();
            const result = computeLiabilitiesWorklist(loans, [], [], finance, '₦');
            const loanItems = result.items.filter(i => i.kind === 'loan');
            expect(loanItems).toHaveLength(2);
            for (const item of loanItems) {
                expect(item.dueDate).toBeNull();
                expect(item.daysOverdue).toBeNull();
                expect(item.detail).not.toMatch(/next payment due/);
            }
            // The balance is still counted -- only the due date is unknown.
            expect(result.totalLoans).toBe(2000000);
        });
    });

    describe('accounts payable', () => {
        it('lists accounts payable from pending/overdue expense transactions, matching the same aging source AgingReport.tsx uses', () => {
            const txs: Transaction[] = [
                makeTx({ vendorCustomer: 'Main Supplier', amount: 50000, status: 'overdue', dueDate: '2026-01-01' }),
                makeTx({ vendorCustomer: 'Other Supplier', amount: 20000, status: 'pending', dueDate: '2099-01-01' }),
                makeTx({ type: 'income', amount: 999999, status: 'pending', dueDate: '2026-01-01' }), // income, must not count as AP
            ];
            const result = computeLiabilitiesWorklist([], txs, [], finance, '₦');
            expect(result.totalAccountsPayable).toBe(70000);
            const apItems = result.items.filter(i => i.kind === 'accountsPayable');
            expect(apItems).toHaveLength(2);
            expect(apItems.some(i => i.label === 'Main Supplier')).toBe(true);
        });

        it('groups untagged payables into one combined line instead of several rows all literally labeled "Supplier"', () => {
            const txs: Transaction[] = [
                makeTx({ amount: 1000, status: 'pending', dueDate: '2026-05-01' }),
                makeTx({ amount: 2000, status: 'pending', dueDate: '2026-03-01' }),
                makeTx({ amount: 3000, status: 'overdue', dueDate: '2020-01-01' }),
                makeTx({ vendorCustomer: 'Named Supplier', amount: 9000, status: 'pending', dueDate: '2026-01-01' }),
            ];
            const result = computeLiabilitiesWorklist([], txs, [], finance, '₦', new Date(2026, 5, 1));
            const apItems = result.items.filter(i => i.kind === 'accountsPayable');
            // One row for the named supplier, one combined row for the 3 untagged ones.
            expect(apItems).toHaveLength(2);
            const grouped = apItems.find(i => i.label.startsWith('Uncategorized'))!;
            expect(grouped.label).toBe('Uncategorized (3 payables)');
            expect(grouped.amount).toBe(6000);
            expect(grouped.dueDate).toBe('2020-01-01'); // earliest (most overdue) of the three
            expect(grouped.daysOverdue).toBeGreaterThan(0);
            expect(result.totalAccountsPayable).toBe(15000);
        });

        it('does not overcount days overdue in the afternoon by comparing against the live time instead of local midnight', () => {
            const txs = [makeTx({ vendorCustomer: 'Supplier', amount: 1000, status: 'overdue', dueDate: '2026-06-01' })];
            // Exactly 4 calendar days later, but at 2pm local -- a naive
            // diff against raw "now" (not midnight) would round this up to 5.
            const afternoon = new Date(2026, 5, 5, 14, 0, 0);
            const result = computeLiabilitiesWorklist([], txs, [], finance, '₦', afternoon);
            const apItem = result.items.find(i => i.kind === 'accountsPayable')!;
            expect(apItem.daysOverdue).toBe(4);
        });
    });

    it('includes a bill still needing review as a hidden obligation, but excludes an already-recorded bill', () => {
        const bills: Bill[] = [
            makeBill({ vendorName: 'Scanned Vendor', total: 15000, status: 'needs_review', dueDate: '2026-01-01' }),
            makeBill({ vendorName: 'Already Recorded Vendor', total: 25000, status: 'recorded', linkedTransactionId: 'tx-1' }),
            makeBill({ vendorName: 'Dismissed Vendor', total: 5000, status: 'dismissed' }),
        ];
        const result = computeLiabilitiesWorklist([], [], bills, finance, '₦');
        expect(result.totalBillsNeedingReview).toBe(15000);
        expect(result.hiddenTotal).toBe(15000);
        const billItems = result.items.filter(i => i.kind === 'billNeedsReview');
        expect(billItems).toHaveLength(1);
        expect(billItems[0].label).toBe('Scanned Vendor');
        expect(result.narrative).toMatch(/not yet reflected in your Accounts Payable or Balance Sheet/);
    });

    it('includes tax collected but not yet remitted as a hidden liability with no exact due date', () => {
        const taxFinance = { cashBalance: 5000000, totalTaxCollected: 300000, totalTaxPaid: 100000 };
        const result = computeLiabilitiesWorklist([], [], [], taxFinance, '₦');
        expect(result.totalTax).toBe(200000);
        expect(result.hiddenTotal).toBe(200000);
        const taxItem = result.items.find(i => i.kind === 'tax')!;
        expect(taxItem.amount).toBe(200000);
        expect(taxItem.dueDate).toBeNull();
    });

    it('does not add a tax line when nothing is owed', () => {
        const result = computeLiabilitiesWorklist([], [], [], { cashBalance: 5000000, totalTaxCollected: 100000, totalTaxPaid: 100000 }, '₦');
        expect(result.items.some(i => i.kind === 'tax')).toBe(false);
    });

    it('sorts the most overdue item first, then undated items by amount', () => {
        const bills: Bill[] = [
            makeBill({ vendorName: 'Barely Overdue', total: 1000, status: 'needs_review', dueDate: '2020-01-05' }),
            makeBill({ vendorName: 'Very Overdue', total: 2000, status: 'needs_review', dueDate: '2020-01-01' }),
            makeBill({ vendorName: 'Undated Big', total: 50000, status: 'needs_review', dueDate: undefined }),
            makeBill({ vendorName: 'Undated Small', total: 5000, status: 'needs_review', dueDate: undefined }),
        ];
        const result = computeLiabilitiesWorklist([], [], bills, finance, '₦');
        const labels = result.items.map(i => i.label);
        expect(labels[0]).toBe('Very Overdue'); // more overdue days than Barely Overdue
        expect(labels[1]).toBe('Barely Overdue');
        expect(labels[2]).toBe('Undated Big'); // undated, sorted by amount desc, after any overdue item
        expect(labels[3]).toBe('Undated Small');
    });

    it('totals loans, accounts payable, bills needing review and tax into one grand total', () => {
        const loans = [makeLoan({ startDate: '2026-01-15' })];
        const txs = [makeTx({ vendorCustomer: 'Supplier', amount: 50000, status: 'overdue', dueDate: '2026-01-01' })];
        const bills = [makeBill({ vendorName: 'Scanned Vendor', total: 15000, status: 'needs_review' })];
        const taxFinance = { cashBalance: 5000000, totalTaxCollected: 10000, totalTaxPaid: 0 };
        const result = computeLiabilitiesWorklist(loans, txs, bills, taxFinance, '₦');
        expect(result.total).toBe(1000000 + 50000 + 15000 + 10000);
    });
});

describe('liabilityStatusMeta', () => {
    it('prioritizes overdue styling over hidden/on-schedule styling', () => {
        expect(liabilityStatusMeta({ kind: 'billNeedsReview', daysOverdue: 5 })).toEqual({ dotColor: Colors.expense, statusText: '5d overdue' });
        expect(liabilityStatusMeta({ kind: 'loan', daysOverdue: 2 })).toEqual({ dotColor: Colors.expense, statusText: '2d overdue' });
    });

    it('shows "not yet in ledger" for a hidden (bill-needs-review or tax) item that is not overdue', () => {
        expect(liabilityStatusMeta({ kind: 'billNeedsReview', daysOverdue: null })).toEqual({ dotColor: Colors.warning, statusText: 'not yet in ledger' });
        expect(liabilityStatusMeta({ kind: 'tax', daysOverdue: null })).toEqual({ dotColor: Colors.warning, statusText: 'not yet in ledger' });
    });

    it('shows "on schedule" for a non-hidden item that is not overdue', () => {
        expect(liabilityStatusMeta({ kind: 'loan', daysOverdue: null })).toEqual({ dotColor: Colors.textMuted, statusText: 'on schedule' });
        expect(liabilityStatusMeta({ kind: 'accountsPayable', daysOverdue: null })).toEqual({ dotColor: Colors.textMuted, statusText: 'on schedule' });
    });
});
