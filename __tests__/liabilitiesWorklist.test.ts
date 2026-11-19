import { computeLiabilitiesWorklist } from '../src/utils/liabilitiesWorklist';
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

const finance = { cashBalance: 5000000, totalTaxCollected: 0, totalTaxPaid: 0 };

describe('computeLiabilitiesWorklist', () => {
    it('returns an empty, reassuring result with nothing recorded', () => {
        const result = computeLiabilitiesWorklist([], [], [], finance, '₦');
        expect(result.items).toEqual([]);
        expect(result.total).toBe(0);
        expect(result.narrative).toMatch(/No outstanding liabilities/);
    });

    it('lists an active loan with its real outstanding balance and next due date, and skips an inactive one', () => {
        const loans: Loan[] = [
            { id: 'l1', lenderName: 'First Bank', principal: 1000000, interestRate: 15, termMonths: 12, startDate: '2026-01-15', status: 'active', purpose: 'WC', payments: [], createdAt: '2026-01-15' } as Loan,
            { id: 'l2', lenderName: 'Paid Off Bank', principal: 500000, interestRate: 10, termMonths: 6, startDate: '2025-01-15', status: 'paid_off', purpose: 'WC', payments: [], createdAt: '2025-01-15' } as Loan,
        ];
        const result = computeLiabilitiesWorklist(loans, [], [], finance, '₦');
        expect(result.totalLoans).toBe(1000000);
        const loanItems = result.items.filter(i => i.kind === 'loan');
        expect(loanItems).toHaveLength(1);
        expect(loanItems[0].label).toBe('First Bank');
        expect(loanItems[0].amount).toBe(1000000);
        expect(loanItems[0].dueDate).toBe('2026-02-15');
    });

    it('flags an overdue loan payment with a positive daysOverdue', () => {
        const longPastStart = new Date();
        longPastStart.setMonth(longPastStart.getMonth() - 3);
        const loans: Loan[] = [{
            id: 'l1', lenderName: 'Overdue Bank', principal: 1000000, interestRate: 15, termMonths: 24,
            startDate: longPastStart.toISOString().split('T')[0], status: 'active', purpose: 'WC', payments: [], createdAt: longPastStart.toISOString().split('T')[0],
        } as Loan];
        const result = computeLiabilitiesWorklist(loans, [], [], finance, '₦');
        const loanItem = result.items.find(i => i.kind === 'loan')!;
        expect(loanItem.daysOverdue).not.toBeNull();
        expect(loanItem.daysOverdue as number).toBeGreaterThan(0);
    });

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
        const loans: Loan[] = [{
            id: 'l1', lenderName: 'Bank', principal: 1000000, interestRate: 15, termMonths: 12,
            startDate: '2026-01-15', status: 'active', purpose: 'WC', payments: [], createdAt: '2026-01-15',
        } as Loan];
        const txs = [makeTx({ vendorCustomer: 'Supplier', amount: 50000, status: 'overdue', dueDate: '2026-01-01' })];
        const bills = [makeBill({ vendorName: 'Scanned Vendor', total: 15000, status: 'needs_review' })];
        const taxFinance = { cashBalance: 5000000, totalTaxCollected: 10000, totalTaxPaid: 0 };
        const result = computeLiabilitiesWorklist(loans, txs, bills, taxFinance, '₦');
        expect(result.total).toBe(1000000 + 50000 + 15000 + 10000);
    });
});
