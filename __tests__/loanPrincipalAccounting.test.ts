// Regression coverage for the GAAP/IFRS loan-accounting fix: loan
// principal repayments were previously posted as a full-amount 'expense'
// transaction, so principal repaid understated Net Profit/EBITDA like a
// real operating cost, and DSCR double-counted debt service (once via that
// inflated expense, again via the independently-computed scheduled
// payment). Fixed by tagging loan-repayment transactions with
// `principalPortion` (OptimizedContexts.addLoanPayment computes the split
// via standard amortization) and excluding it from every P&L calculation.
import { computeEnhancedPnL, computeFinance, computeDSCR, computeProperCashFlow } from '../src/utils/finance';
import { Transaction, Loan, BusinessSettings } from '../src/types';

const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

const settings = { openingAssets: '0', openingLiabilities: '0', openingLoans: '0', openingOtherAssets: '0' } as Pick<BusinessSettings, 'openingAssets' | 'openingLiabilities' | 'openingLoans' | 'openingOtherAssets'>;

describe('loan principal repayment accounting', () => {
    const base: Transaction[] = [
        { id: '1', date: daysAgo(60), description: 'Sales', type: 'income', category: 'Sales', amount: 1_000_000, status: 'paid' },
        { id: '2', date: daysAgo(60), description: 'Rent',  type: 'expense', category: 'Rent',  amount: 400_000, status: 'paid' },
    ];
    // A 300k payment of which 250k is principal, 50k is interest -- exactly
    // what OptimizedContexts.addLoanPayment posts for a real payment.
    const loanTx: Transaction = { id: '3', date: daysAgo(30), description: 'Loan repayment: Test Bank', type: 'expense', category: 'Loan Repayment', amount: 300_000, principalPortion: 250_000, status: 'paid' };
    const withLoanPayment = [...base, loanTx];

    it('computeEnhancedPnL only expenses the interest portion', () => {
        const pnlBefore = computeEnhancedPnL(base, []);
        const pnlAfter = computeEnhancedPnL(withLoanPayment, []);
        expect(pnlBefore.netProfit - pnlAfter.netProfit).toBe(50_000);
    });

    it('computeFinance profit only drops by interest, cashBalance drops by the full payment', () => {
        const financeBefore = computeFinance(base, settings);
        const financeAfter = computeFinance(withLoanPayment, settings);
        expect(financeBefore.profit - financeAfter.profit).toBe(50_000);
        // Cash-basis: the full 300k really left the bank account.
        expect(financeBefore.cashBalance - financeAfter.cashBalance).toBe(300_000);
    });

    it('computeProperCashFlow moves principal to Financing, not Operating, with no change to total cash impact', () => {
        const cfBefore = computeProperCashFlow(base, []);
        const cfAfter = computeProperCashFlow(withLoanPayment, []);
        expect(cfBefore.operatingCF - cfAfter.operatingCF).toBe(50_000); // interest only
        expect(cfAfter.financingCF).toBe(-250_000); // principal, as a financing outflow
        expect(cfBefore.netCashChange - cfAfter.netCashChange).toBe(300_000); // total unchanged
    });

    it('computeDSCR is unaffected by whether a loan payment was logged', () => {
        const loans: Loan[] = [
            { id: 'L1', lenderName: 'Test Bank', principal: 3_000_000, interestRate: 15, termMonths: 12, startDate: daysAgo(300), status: 'active', payments: [], purpose: 'working_capital' as any, createdAt: daysAgo(300) },
        ];
        const monthlyIncome: Transaction[] = Array.from({ length: 10 }, (_, i) => ({
            id: `inc-${i}`, date: daysAgo(300 - i * 30), description: 'Sales', type: 'income' as const, category: 'Sales', amount: 600_000, status: 'paid' as const,
        }));
        const monthlyRent: Transaction[] = Array.from({ length: 10 }, (_, i) => ({
            id: `rent-${i}`, date: daysAgo(300 - i * 30), description: 'Rent', type: 'expense' as const, category: 'Rent', amount: 200_000, status: 'paid' as const,
        }));
        const bizBase = [...monthlyIncome, ...monthlyRent];
        const bizWithPayment = [...bizBase, { ...loanTx, date: daysAgo(150), amount: 270_000, principalPortion: 245_000 }];

        const dscrWith = computeDSCR(bizWithPayment, loans);
        const dscrWithout = computeDSCR(bizBase, loans);
        expect(dscrWith.dscr).toBeCloseTo(dscrWithout.dscr, 6);
    });
});
