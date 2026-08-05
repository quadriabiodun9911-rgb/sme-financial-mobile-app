import { computeDebtOptimiser } from '../src/utils/finance';
import { Loan } from '../src/types';

const makeLoan = (overrides: Partial<Loan>): Loan => ({
    id: 'loan', lenderName: 'Lender', purpose: '', principal: 10000,
    interestRate: 10, termMonths: 12, startDate: '2024-01-01',
    status: 'active', payments: [], createdAt: '2024-01-01',
    ...overrides,
});

describe('computeDebtOptimiser', () => {
    it('reports no active loans when there are none', () => {
        const r = computeDebtOptimiser([]);
        expect(r.avalanche.order).toEqual([]);
        expect(r.recommendation).toContain('No active loans');
    });

    it('reports zero savings and identical payoff time for a single loan (no reallocation possible)', () => {
        const r = computeDebtOptimiser([makeLoan({ id: 'l1', lenderName: 'Solo Bank' })]);
        expect(r.avalanche.totalInterestSaved).toBe(0);
        expect(r.avalanche.monthsToPayoff).toBe(r.snowball.monthsToPayoff);
    });

    it('orders avalanche by highest interest rate first and snowball by smallest balance first', () => {
        const loans = [
            makeLoan({ id: 'l1', lenderName: 'Low Rate Big Balance', principal: 20000, interestRate: 5 }),
            makeLoan({ id: 'l2', lenderName: 'High Rate Small Balance', principal: 5000, interestRate: 25 }),
        ];
        const r = computeDebtOptimiser(loans);
        expect(r.avalanche.order).toEqual(['High Rate Small Balance', 'Low Rate Big Balance']);
        expect(r.snowball.order).toEqual(['High Rate Small Balance', 'Low Rate Big Balance']);
    });

    // The core regression this test guards: summing each loan's own
    // independently-computed interest is invariant to sort order
    // (a + b === b + a), so the old implementation always reported a $0
    // saving no matter how far apart the real rates were. A real payoff
    // simulation that redirects a paid-off loan's freed minimum payment
    // toward the next priority loan produces a genuine, non-zero
    // difference — but that redirection only has more than one possible
    // destination with 3+ loans (with only 2, whichever finishes first
    // always frees its payment to the sole remaining loan regardless of
    // "order", so total interest is identical either way — a real,
    // structural property of this reallocation model, not a bug).
    it('finds a real, non-zero interest saving when a small filler loan frees money that avalanche and snowball redirect to different targets', () => {
        const loans = [
            makeLoan({ id: 'filler', lenderName: 'Filler', principal: 3000, interestRate: 8, termMonths: 6 }),
            makeLoan({ id: 'cheap', lenderName: 'Cheap Big Balance', principal: 6000, interestRate: 4, termMonths: 24 }),
            makeLoan({ id: 'expensive', lenderName: 'Expensive Big Balance', principal: 15000, interestRate: 30, termMonths: 24 }),
        ];
        const r = computeDebtOptimiser(loans);
        // Avalanche prioritizes the expensive loan for the filler's freed
        // payment; snowball prioritizes the cheap (smaller-balance) loan
        // instead — so avalanche should end up cheaper overall.
        expect(r.avalanche.order[0]).toBe('Expensive Big Balance');
        expect(r.snowball.order[0]).toBe('Filler');
        expect(r.avalanche.totalInterestSaved).toBeGreaterThan(0);
        expect(r.recommendation).toContain('Avalanche method saves');
        expect(r.recommendation).toContain('Expensive Big Balance');
    });

    it('yields the same total interest for avalanche and snowball when all loans share one rate (order cannot matter)', () => {
        const loans = [
            makeLoan({ id: 'l1', lenderName: 'A', principal: 8000, interestRate: 12, termMonths: 12 }),
            makeLoan({ id: 'l2', lenderName: 'B', principal: 3000, interestRate: 12, termMonths: 12 }),
        ];
        const r = computeDebtOptimiser(loans);
        expect(r.avalanche.totalInterestSaved).toBe(0);
    });

    it('excludes paid-off and defaulted loans from the comparison', () => {
        const loans = [
            makeLoan({ id: 'l1', lenderName: 'Active', principal: 10000, interestRate: 10 }),
            makeLoan({ id: 'l2', lenderName: 'PaidOff', status: 'paid_off' }),
            makeLoan({ id: 'l3', lenderName: 'Defaulted', status: 'defaulted' }),
        ];
        const r = computeDebtOptimiser(loans);
        expect(r.avalanche.order).toEqual(['Active']);
    });
});
