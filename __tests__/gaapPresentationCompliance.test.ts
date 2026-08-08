// Regression coverage for the second GAAP/IFRS pass: a proper multi-step
// income statement (explicit Interest Expense + Profit Before Tax, and an
// EBITDA that genuinely excludes interest) and a classified balance sheet
// (loans split into the portion due within 12 months vs. after, per
// IAS 1.60 / ASC 210-10-45).
import { computeEnhancedPnL } from '../src/utils/finance';
import { computeBalanceSheetTrend } from '../src/utils/balanceSheetTrend';
import { Transaction, Loan } from '../src/types';

const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

describe('multi-step income statement', () => {
    const base: Transaction[] = [
        { id: '1', date: daysAgo(60), description: 'Sales', type: 'income', category: 'Sales', amount: 1_000_000, status: 'paid' },
        { id: '2', date: daysAgo(60), description: 'Rent',  type: 'expense', category: 'Rent',  amount: 400_000, status: 'paid' },
    ];
    const withInterest: Transaction[] = [
        ...base,
        { id: '3', date: daysAgo(30), description: 'Loan repayment: Test Bank', type: 'expense', category: 'Loan Repayment', amount: 300_000, principalPortion: 250_000, status: 'paid' },
    ];

    it('EBITDA excludes interest as well as depreciation', () => {
        const pnl = computeEnhancedPnL(withInterest, []);
        // sga no longer contains the 50k interest, so EBITDA must be exactly
        // grossProfit - sga(rent only) -- unaffected by the loan payment.
        const pnlNoLoan = computeEnhancedPnL(base, []);
        expect(pnl.ebitda).toBe(pnlNoLoan.ebitda);
        expect(pnl.interestExpense).toBe(50_000);
    });

    it('Operating Profit (EBIT) still excludes interest', () => {
        const pnl = computeEnhancedPnL(withInterest, []);
        const pnlNoLoan = computeEnhancedPnL(base, []);
        expect(pnl.ebit).toBe(pnlNoLoan.ebit);
    });

    it('Profit Before Tax = EBIT - Interest Expense, and equals Net Profit (no income tax modeled)', () => {
        const pnl = computeEnhancedPnL(withInterest, []);
        expect(pnl.profitBeforeTax).toBe(pnl.ebit - pnl.interestExpense);
        expect(pnl.netProfit).toBe(pnl.profitBeforeTax);
    });
});

describe('classified balance sheet: current vs non-current debt', () => {
    it('splits a loan into the portion due within 12 months and the rest', () => {
        const loans: Loan[] = [
            { id: 'L1', lenderName: 'Test Bank', principal: 1_200_000, interestRate: 12, termMonths: 24, startDate: daysAgo(30), status: 'active', payments: [], purpose: 'working_capital' as any, createdAt: daysAgo(30) },
        ];
        const todayKey = new Date().toISOString().slice(0, 7);
        const points = computeBalanceSheetTrend('monthly', [todayKey], [], [], loans);
        expect(points).toHaveLength(1);
        const p = points[0];
        // A 24-month loan roughly half paid off in the next 12 months --
        // both buckets should be meaningfully non-zero and sum to the total.
        expect(p.loansCurrentPortion).toBeGreaterThan(0);
        expect(p.loansNonCurrentPortion).toBeGreaterThan(0);
        expect(p.loansCurrentPortion + p.loansNonCurrentPortion).toBeCloseTo(p.loansOutstanding, 6);
        expect(p.currentLiabilities).toBeCloseTo(p.loansCurrentPortion, 6);
        expect(p.nonCurrentLiabilities).toBe(p.loansNonCurrentPortion);
    });

    it('a loan close to payoff is entirely a current liability', () => {
        const loans: Loan[] = [
            { id: 'L2', lenderName: 'Test Bank', principal: 120_000, interestRate: 0, termMonths: 6,
              startDate: daysAgo(150), status: 'active',
              payments: Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, date: daysAgo(150 - i * 30), amount: 20_000 })),
              purpose: 'working_capital' as any, createdAt: daysAgo(150) },
        ];
        const todayKey = new Date().toISOString().slice(0, 7);
        const points = computeBalanceSheetTrend('monthly', [todayKey], [], [], loans);
        const p = points[0];
        expect(p.loansOutstanding).toBe(20_000); // one installment left
        expect(p.loansCurrentPortion).toBeCloseTo(20_000, 2);
        expect(p.loansNonCurrentPortion).toBeCloseTo(0, 2);
    });
});
