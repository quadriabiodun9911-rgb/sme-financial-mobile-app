import { analyzeOngoingFinancingToLease } from '../src/utils/ongoingFinancingLeaseCheck';

describe('analyzeOngoingFinancingToLease', () => {
    it('recommends keeping the loan when payments are comfortably covered by profit', () => {
        const result = analyzeOngoingFinancingToLease(
            { id: 'l1', lenderName: 'First Bank', principal: 1_000_000, interestRate: 15, termMonths: 24, payments: [{ amount: 40_000 }, { amount: 40_000 }] },
            500_000, 800_000, 200_000,
        );
        expect(result.verdict).toBe('keep_loan');
        expect(result.sameTermExtraCost).toBeGreaterThan(0);
    });

    it('never reports leasing as cheaper: same-term lease cost is always >= finishing the loan', () => {
        const result = analyzeOngoingFinancingToLease(
            { id: 'l2', lenderName: 'Acme Micro', principal: 3_000_000, interestRate: 10, termMonths: 36, payments: [] },
            300_000, 500_000, 100_000,
        );
        expect(result.sameTermLeaseMonthly).toBeGreaterThanOrEqual(result.currentMonthly);
        expect(result.sameTermExtraCost).toBeGreaterThanOrEqual(0);
    });

    it('flags near-payoff loans regardless of how strained the payment is', () => {
        const result = analyzeOngoingFinancingToLease(
            { id: 'l3', lenderName: 'Quick Cash', principal: 2_000_000, interestRate: 30, termMonths: 24, payments: Array(22).fill({ amount: 80_000 }) },
            50_000, 100_000, 200_000,
        );
        expect(result.remainingMonths).toBeLessThanOrEqual(3);
        expect(result.verdict).toBe('near_payoff');
    });

    it('recommends considering lease relief when the payment is straining profit and stretching the term actually lowers it', () => {
        const result = analyzeOngoingFinancingToLease(
            { id: 'l4', lenderName: 'Growth Capital', principal: 6_000_000, interestRate: 22, termMonths: 24, payments: [] },
            120_000, 50_000, 200_000,
        );
        expect(result.burdenPct).toBeGreaterThan(0.35);
        expect(result.verdict).toBe('consider_lease_relief');
        expect(result.reliefMonthly).toBeLessThan(result.currentMonthly);
        expect(result.reliefMonthlySavings).toBeGreaterThan(0);
    });

    it('treats zero or negative profit as maxed-out burden without dividing by zero', () => {
        const result = analyzeOngoingFinancingToLease(
            { id: 'l5', lenderName: 'Local Coop', principal: 1_500_000, interestRate: 18, termMonths: 18, payments: [] },
            0, 100_000, 50_000,
        );
        expect(result.burdenPct).toBe(Infinity);
        expect(Number.isFinite(result.currentMonthly)).toBe(true);
        expect(result.rationale).not.toContain('Infinity');
    });

    it('never reports zero extra cost just because extra/lump payments outpaced the original schedule', () => {
        // 21% of a 500,000/18%/12mo loan repaid in only 2 logged payments --
        // faster than the original schedule assumed. currentMonthly (fixed
        // at origination) recomputed against the now-smaller remaining
        // balance would make a strictly-higher-rate lease look free; the
        // same-term comparison must be re-based on today's actual balance
        // and term on BOTH sides so the lease premium always shows up.
        const result = analyzeOngoingFinancingToLease(
            { id: 'l7', lenderName: 'First Bank Nigeria', principal: 500_000, interestRate: 18, termMonths: 12, payments: [{ amount: 60_000 }, { amount: 44_000 }] },
            272_500, 177_500, 100_000,
        );
        expect(result.sameTermLeaseMonthly).toBeGreaterThan(result.sameTermLoanMonthly);
        expect(result.sameTermExtraCost).toBeGreaterThan(0);
    });

    it('computes remaining balance and remaining months from payments made, not elapsed calendar time', () => {
        const result = analyzeOngoingFinancingToLease(
            { id: 'l6', lenderName: 'Trade Finance Ltd', principal: 1_200_000, interestRate: 20, termMonths: 12, payments: [{ amount: 100_000 }, { amount: 100_000 }, { amount: 100_000 }] },
            300_000, 400_000, 100_000,
        );
        expect(result.remainingBalance).toBe(900_000);
        expect(result.remainingMonths).toBe(9);
    });
});
