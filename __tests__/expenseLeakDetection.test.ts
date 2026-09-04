import { computeExpenseLeaks } from '../src/utils/expenseLeakDetection';
import { Transaction } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2026-01-01',
    description: 'Test',
    type: 'expense',
    category: 'Software & Subscriptions',
    amount: 5000,
    status: 'paid',
    ...overrides,
});

describe('computeExpenseLeaks', () => {
    it('is unavailable with no expense history', () => {
        const result = computeExpenseLeaks([]);
        expect(result.available).toBe(false);
    });

    it('does not treat a one-off or twice-only vendor charge as recurring', () => {
        const txs = [
            makeTx({ description: 'Netflix', amount: 5000, date: '2026-01-05' }),
            makeTx({ description: 'Netflix', amount: 5000, date: '2026-02-05' }),
        ];
        const result = computeExpenseLeaks(txs);
        expect(result.recurringGroups).toHaveLength(0);
    });

    it('detects a vendor charge recurring across 3+ distinct months', () => {
        const txs = [
            makeTx({ description: 'Netflix', amount: 5000, date: '2026-01-05' }),
            makeTx({ description: 'Netflix', amount: 5000, date: '2026-02-05' }),
            makeTx({ description: 'Netflix', amount: 5000, date: '2026-03-05' }),
        ];
        const result = computeExpenseLeaks(txs);
        expect(result.recurringGroups).toHaveLength(1);
        expect(result.recurringGroups[0].displayName).toBe('Netflix');
        expect(result.recurringGroups[0].occurrenceCount).toBe(3);
        expect(result.recurringGroups[0].avgAmount).toBe(5000);
    });

    it('groups by vendorCustomer over description when both are present', () => {
        const txs = [
            makeTx({ vendorCustomer: 'Adobe Inc | acct-1', description: 'Card payment', amount: 10000, date: '2026-01-05' }),
            makeTx({ vendorCustomer: 'Adobe Inc | acct-1', description: 'Card payment', amount: 10000, date: '2026-02-05' }),
            makeTx({ vendorCustomer: 'Adobe Inc | acct-1', description: 'Card payment', amount: 10000, date: '2026-03-05' }),
        ];
        const result = computeExpenseLeaks(txs);
        expect(result.recurringGroups).toHaveLength(1);
        expect(result.recurringGroups[0].displayName).toBe('Adobe Inc');
    });

    // Same case-insensitive identity computeCustomerConcentration/
    // computeSupplierConcentration group by (see entityName.ts) -- a
    // subscription charge typed once and imported once, differently cased,
    // must still be recognized as the same recurring vendor.
    it('groups differently-cased spellings of the same vendor as one recurring charge', () => {
        const txs = [
            makeTx({ vendorCustomer: 'Adobe Inc', amount: 10000, date: '2026-01-05' }),
            makeTx({ vendorCustomer: 'ADOBE INC', amount: 10000, date: '2026-02-05' }),
            makeTx({ vendorCustomer: '  adobe inc  ', amount: 10000, date: '2026-03-05' }),
        ];
        const result = computeExpenseLeaks(txs);
        expect(result.recurringGroups).toHaveLength(1);
        expect(result.recurringGroups[0].occurrenceCount).toBe(3);
    });

    it('excludes loan repayments from recurring-charge detection', () => {
        const txs = [
            makeTx({ description: 'Loan Repayment', category: 'Loan Repayment', amount: 20000, date: '2026-01-05' }),
            makeTx({ description: 'Loan Repayment', category: 'Loan Repayment', amount: 20000, date: '2026-02-05' }),
            makeTx({ description: 'Loan Repayment', category: 'Loan Repayment', amount: 20000, date: '2026-03-05' }),
        ];
        const result = computeExpenseLeaks(txs);
        expect(result.recurringGroups).toHaveLength(0);
    });

    it('flags price creep when the latest charge is meaningfully higher than the first', () => {
        const txs = [
            makeTx({ description: 'Zoom', amount: 5000, date: '2026-01-05' }),
            makeTx({ description: 'Zoom', amount: 5500, date: '2026-02-05' }),
            makeTx({ description: 'Zoom', amount: 7000, date: '2026-03-05' }), // 40% up vs first
        ];
        const result = computeExpenseLeaks(txs, '₦');
        expect(result.leaks.some(f => f.reason === 'price-creep' && f.message.match(/zoom has grown 40%/i))).toBe(true);
    });

    it('does not flag price creep for a stable-priced subscription', () => {
        const txs = [
            makeTx({ description: 'Zoom', amount: 5000, date: '2026-01-05' }),
            makeTx({ description: 'Zoom', amount: 5000, date: '2026-02-05' }),
            makeTx({ description: 'Zoom', amount: 5100, date: '2026-03-05' }), // 2% up, within normal noise
        ];
        const result = computeExpenseLeaks(txs);
        expect(result.leaks.some(f => f.reason === 'price-creep')).toBe(false);
    });

    it('flags many recurring charges as a portfolio-level review item', () => {
        const vendors = ['Netflix', 'Zoom', 'Adobe', 'Slack', 'Dropbox'];
        const txs = vendors.flatMap(v => [
            makeTx({ description: v, amount: 3000, date: '2026-01-05' }),
            makeTx({ description: v, amount: 3000, date: '2026-02-05' }),
            makeTx({ description: v, amount: 3000, date: '2026-03-05' }),
        ]);
        const result = computeExpenseLeaks(txs);
        expect(result.recurringGroups).toHaveLength(5);
        expect(result.leaks.some(f => f.reason === 'many-recurring-charges' && f.group === null)).toBe(true);
    });

    it('does not flag many-recurring-charges below the threshold', () => {
        const vendors = ['Netflix', 'Zoom'];
        const txs = vendors.flatMap(v => [
            makeTx({ description: v, amount: 3000, date: '2026-01-05' }),
            makeTx({ description: v, amount: 3000, date: '2026-02-05' }),
            makeTx({ description: v, amount: 3000, date: '2026-03-05' }),
        ]);
        const result = computeExpenseLeaks(txs);
        expect(result.leaks.some(f => f.reason === 'many-recurring-charges')).toBe(false);
    });

    it('sorts recurring groups by average charge size descending', () => {
        const txs = [
            makeTx({ description: 'Small Sub', amount: 1000, date: '2026-01-05' }),
            makeTx({ description: 'Small Sub', amount: 1000, date: '2026-02-05' }),
            makeTx({ description: 'Small Sub', amount: 1000, date: '2026-03-05' }),
            makeTx({ description: 'Big Sub', amount: 50000, date: '2026-01-05' }),
            makeTx({ description: 'Big Sub', amount: 50000, date: '2026-02-05' }),
            makeTx({ description: 'Big Sub', amount: 50000, date: '2026-03-05' }),
        ];
        const result = computeExpenseLeaks(txs);
        expect(result.recurringGroups[0].displayName).toBe('Big Sub');
        expect(result.recurringGroups[1].displayName).toBe('Small Sub');
    });
});
