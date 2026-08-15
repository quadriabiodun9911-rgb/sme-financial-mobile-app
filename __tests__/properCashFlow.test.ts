// Regression coverage for a real double-counting bug in
// computeProperCashFlow: `netProfit` was computed cash-basis (collected
// revenue minus paid expenses), then the indirect-method AR/AP adjustments
// were applied on top as if it were accrual net income -- since uncollected/
// unpaid amounts were already excluded from that cash-basis figure, the
// AR/AP adjustment subtracted/added them a second time, understating
// operating cash flow whenever any income or expense was still pending or
// overdue. Fixed by basing netProfit on accrual (all-status) revenue/expense,
// the correct starting point for that reconciliation.
import { computeProperCashFlow } from '../src/utils/finance';
import { Transaction } from '../src/types';

const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

describe('computeProperCashFlow: accrual net profit as the reconciliation base', () => {
    it('operating cash flow equals actual cash collected minus cash paid when some income is still uncollected', () => {
        const transactions: Transaction[] = [
            // $100 recognized, only $80 actually collected
            { id: '1', date: daysAgo(30), description: 'Paid sale',   type: 'income', category: 'Sales', amount: 80,  status: 'paid' },
            { id: '2', date: daysAgo(10), description: 'Unpaid sale', type: 'income', category: 'Sales', amount: 20,  status: 'pending' },
            // $50 recognized, all paid -- no accounts payable in this case
            { id: '3', date: daysAgo(30), description: 'Rent', type: 'expense', category: 'Rent', amount: 50, status: 'paid' },
        ];

        const cf = computeProperCashFlow(transactions, []);

        // Real cash movement: $80 in, $50 out = $30. No depreciation, no AP
        // in this scenario, so operatingCF should equal exactly that --
        // not $10, which is what the pre-fix double subtraction produced
        // (30 accrual profit - 20 uncollected AR, applied on top of an
        // already-cash-basis 30).
        expect(cf.operatingCF).toBe(30);
    });

    it('operating cash flow equals actual cash collected minus cash paid when some expense is still unpaid', () => {
        const transactions: Transaction[] = [
            { id: '1', date: daysAgo(30), description: 'Sale',        type: 'income',  category: 'Sales',   amount: 100, status: 'paid' },
            { id: '2', date: daysAgo(30), description: 'Paid bill',   type: 'expense', category: 'Supplies', amount: 40,  status: 'paid' },
            { id: '3', date: daysAgo(10), description: 'Unpaid bill', type: 'expense', category: 'Supplies', amount: 30,  status: 'pending' },
        ];

        const cf = computeProperCashFlow(transactions, []);

        // Real cash movement: $100 in, $40 out = $60.
        expect(cf.operatingCF).toBe(60);
    });

    it('accrual netProfit reflects all recognized revenue/expense regardless of paid status', () => {
        const transactions: Transaction[] = [
            { id: '1', date: daysAgo(30), description: 'Paid sale',   type: 'income',  category: 'Sales', amount: 80, status: 'paid' },
            { id: '2', date: daysAgo(10), description: 'Unpaid sale', type: 'income',  category: 'Sales', amount: 20, status: 'pending' },
            { id: '3', date: daysAgo(30), description: 'Rent',        type: 'expense', category: 'Rent',  amount: 50, status: 'paid' },
        ];

        const cf = computeProperCashFlow(transactions, []);
        expect(cf.netProfit).toBe(50); // 100 total revenue - 50 total expense, not 80 - 50 = 30
    });
});
