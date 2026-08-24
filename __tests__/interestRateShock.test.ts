import { computeInterestRateShock, computeDSCR, loanMonthlyPayment } from '../src/utils/finance';
import { Transaction, Loan } from '../src/types';

const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

const makeLoan = (overrides: Partial<Loan>): Loan => ({
    id: 'loan', lenderName: 'Lender', purpose: '', principal: 1_000_000,
    interestRate: 15, termMonths: 24, startDate: daysAgo(300),
    status: 'active', payments: [], createdAt: daysAgo(300),
    ...overrides,
});

// Steady healthy monthly income/expense so netOperatingIncome is
// predictable and DSCR isn't dominated by a single noisy month.
const steadyTransactions: Transaction[] = Array.from({ length: 10 }, (_, i) => [
    { id: `inc-${i}`, date: daysAgo(300 - i * 30), description: 'Sales', type: 'income' as const, category: 'Sales', amount: 800_000, status: 'paid' as const },
    { id: `exp-${i}`, date: daysAgo(300 - i * 30), description: 'Rent', type: 'expense' as const, category: 'Rent', amount: 200_000, status: 'paid' as const },
]).flat();

describe('computeInterestRateShock', () => {
    it('matches computeDSCR exactly at a 0-point shock', () => {
        const loans = [makeLoan({})];
        const dscr = computeDSCR(steadyTransactions, loans);
        const shock = computeInterestRateShock(loans, steadyTransactions, 0);

        expect(shock.currentMonthlyDebtService).toBeCloseTo(dscr.totalDebtService / 12);
        expect(shock.newMonthlyDebtService).toBeCloseTo(shock.currentMonthlyDebtService);
        expect(shock.newDSCR).toBeCloseTo(dscr.dscr);
        expect(shock.newStatus).toBe(dscr.status);
        expect(shock.extraMonthlyCost).toBeCloseTo(0);
    });

    it('raises monthly debt service and lowers DSCR for a positive shock', () => {
        const loans = [makeLoan({})];
        const shock = computeInterestRateShock(loans, steadyTransactions, 2);

        const expectedNewMonthly = loanMonthlyPayment(1_000_000, 17, 24);
        expect(shock.newMonthlyDebtService).toBeCloseTo(expectedNewMonthly);
        expect(shock.newMonthlyDebtService).toBeGreaterThan(shock.currentMonthlyDebtService);
        expect(shock.extraMonthlyCost).toBeGreaterThan(0);
        expect(shock.newDSCR).toBeLessThan(shock.currentDSCR);
    });

    it('reports hasActiveLoans=false and zero debt service with no active loans', () => {
        const shock = computeInterestRateShock([], steadyTransactions, 3);
        expect(shock.hasActiveLoans).toBe(false);
        expect(shock.currentMonthlyDebtService).toBe(0);
        expect(shock.newMonthlyDebtService).toBe(0);
    });

    it('never applies a negative effective rate even for a large negative shock', () => {
        const loans = [makeLoan({ interestRate: 1 })];
        const shock = computeInterestRateShock(loans, steadyTransactions, -10);
        expect(shock.newMonthlyDebtService).toBeCloseTo(loanMonthlyPayment(1_000_000, 0, 24));
    });

    it('ignores paid-off/inactive loans in both current and shocked totals', () => {
        const loans = [
            makeLoan({ id: 'active', status: 'active' }),
            makeLoan({ id: 'paid', status: 'paid_off', principal: 5_000_000, interestRate: 40 }),
        ];
        const shock = computeInterestRateShock(loans, steadyTransactions, 2);
        const expectedCurrent = loanMonthlyPayment(1_000_000, 15, 24);
        expect(shock.currentMonthlyDebtService).toBeCloseTo(expectedCurrent);
    });
});
