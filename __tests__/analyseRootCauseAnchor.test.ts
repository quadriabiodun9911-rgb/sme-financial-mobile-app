// Regression: analyseRootCause (Analysis & Decisions' "Why is your profit
// changing?") anchored its "current period" to the real-world calendar
// month, so a business whose most recent transaction predates the literal
// current month -- an imported historical statement, or simply no activity
// logged yet this month -- saw the current period filtered to zero
// transactions and reported a false "not enough data" despite having real
// history to diagnose. Fixed by anchoring to the latest date actually
// present in the data, mirroring financialDiagnosisEngine.ts's own
// "latest data month" fix.
import { analyseRootCause } from '../src/utils/analysis';
import { Transaction, BusinessSettings } from '../src/types';

const settings: Pick<BusinessSettings, 'currency' | 'targetMargin'> = { currency: '₦', targetMargin: '20' };

describe('analyseRootCause anchors "current period" to the latest data, not real-world now', () => {
    it('reports real revenue/profit for data dated months before the real current date', () => {
        // Real "now" (system clock) is whatever today actually is; this
        // data is deliberately dated far in the past relative to any
        // plausible test run date, the exact shape of the bug this session
        // found: a demo/imported dataset with no activity in the literal
        // current calendar month.
        const transactions: Transaction[] = [
            { id: '1', date: '2020-03-05', description: 'Sales', type: 'income', category: 'Sales', amount: 500_000, status: 'paid' },
            { id: '2', date: '2020-03-10', description: 'Rent',  type: 'expense', category: 'Rent',  amount: 200_000, status: 'paid' },
            { id: '3', date: '2020-02-05', description: 'Sales', type: 'income', category: 'Sales', amount: 400_000, status: 'paid' },
            { id: '4', date: '2020-02-10', description: 'Rent',  type: 'expense', category: 'Rent',  amount: 180_000, status: 'paid' },
        ];

        const result = analyseRootCause(transactions, 'month', settings);

        expect(result.currentIncome).toBe(500_000);
        expect(result.currentExpense).toBe(200_000);
        expect(result.currentProfit).toBe(300_000);
        expect(result.previousIncome).toBe(400_000);
    });

    it('still falls back to real "now" when there is no data at all (no false anchor invented)', () => {
        const result = analyseRootCause([], 'month', settings);
        expect(result.currentIncome).toBe(0);
        expect(result.currentExpense).toBe(0);
    });
});
