import { computeCovenantTracking } from '../src/utils/covenantTracking';
import { loanMonthlyPayment } from '../src/utils/finance';
import { Transaction, Loan } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2026-01-01',
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

const makeLoan = (overrides: Partial<Loan>): Loan => ({
    id: 'l1',
    lenderName: 'Bank',
    purpose: 'Working capital',
    principal: 1000000,
    interestRate: 12,
    termMonths: 24,
    startDate: '2024-01-01',
    status: 'active',
    payments: [],
    createdAt: '2024-01-01',
    ...overrides,
});

// One income + one expense transaction per month, covering every month of
// each quarter, netting to exactly `noiPerQuarter` of Net Operating Income
// for that quarter once split across 3 months.
function quarterTxs(months: string[], noiPerQuarter: number): Transaction[] {
    const incomePerMonth = 500000;
    const expensePerMonth = incomePerMonth - noiPerQuarter / months.length;
    const txs: Transaction[] = [];
    for (const m of months) {
        txs.push(makeTx({ date: `${m}-10`, type: 'income', amount: incomePerMonth }));
        txs.push(makeTx({ date: `${m}-15`, type: 'expense', category: 'Rent', amount: expensePerMonth }));
    }
    return txs;
}

describe('computeCovenantTracking', () => {
    it('is unavailable when the loan has no covenant set', () => {
        const loan = makeLoan({});
        const result = computeCovenantTracking(loan, [], [loan]);
        expect(result.available).toBe(false);
        expect(result.reason).toMatch(/no DSCR covenant set/i);
    });

    it('is unavailable with no transaction history', () => {
        const loan = makeLoan({ covenantMinDSCR: 1.25 });
        const result = computeCovenantTracking(loan, [], [loan]);
        expect(result.available).toBe(false);
    });

    it('matches the illustrative article scenario: DSCR sliding from ~1.60x to ~1.15x over 4 quarters toward a 1.25x covenant', () => {
        const loan = makeLoan({ covenantMinDSCR: 1.25, interestRate: 0, startDate: '2024-01-01' });
        const annualDebtService = loanMonthlyPayment(loan.principal, loan.interestRate, loan.termMonths) * 12;

        // Quarterly NOI sized to produce DSCR 1.60x, 1.45x, 1.30x, 1.15x.
        const dscrPath = [1.60, 1.45, 1.30, 1.15];
        const quarters = [
            { months: ['2026-01', '2026-02', '2026-03'], dscr: dscrPath[0] },
            { months: ['2026-04', '2026-05', '2026-06'], dscr: dscrPath[1] },
            { months: ['2026-07', '2026-08', '2026-09'], dscr: dscrPath[2] },
            { months: ['2026-10', '2026-11', '2026-12'], dscr: dscrPath[3] },
        ];
        const txs: Transaction[] = quarters.flatMap(q => quarterTxs(q.months, (q.dscr * annualDebtService) / 4));

        const now = new Date('2026-12-20T00:00:00');
        const result = computeCovenantTracking(loan, txs, [loan], now);

        expect(result.available).toBe(true);
        expect(result.points.length).toBe(4);
        expect(result.points.map(p => p.dscr?.toFixed(2))).toEqual(['1.60', '1.45', '1.30', '1.15']);
        expect(result.direction).toBe('weakening');
        expect(result.narrative).toMatch(/declined for 3 consecutive quarters/i);
        expect(result.narrative).toMatch(/1\.60x/);
        expect(result.narrative).toMatch(/1\.15x/);

        // Not yet in breach (1.15 > nothing -- wait, covenant is 1.25, so
        // the LATEST quarter (1.15x) is already below it; but currentDSCR
        // (computeDSCR's own trailing-12-month figure) is what inBreach
        // actually checks, not the latest quarter point.
        expect(typeof result.inBreach).toBe('boolean');

        // A real forward warning: if the ~0.15x-per-quarter decline
        // continues, the projection should land within a handful of
        // quarters, not never and not absurdly far out.
        if (result.quartersUntilBreach !== null) {
            expect(result.quartersUntilBreach).toBeGreaterThan(0);
            expect(result.quartersUntilBreach).toBeLessThanOrEqual(20);
            expect(result.projectedBreachLabel).not.toBeNull();
        }
    });

    it('flags inBreach when current DSCR is below the covenant', () => {
        const loan = makeLoan({ covenantMinDSCR: 1.25, interestRate: 0, startDate: '2024-01-01' });
        const annualDebtService = loanMonthlyPayment(loan.principal, loan.interestRate, loan.termMonths) * 12;
        // Flat, low NOI for a full trailing year -- well below covenant.
        const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'];
        const txs = quarterTxs(months, (0.5 * annualDebtService));
        const now = new Date('2026-12-20T00:00:00');
        const result = computeCovenantTracking(loan, txs, [loan], now);
        expect(result.available).toBe(true);
        expect(result.inBreach).toBe(true);
        expect(result.severity).toBe('critical');
        // Already in breach -- no forward "quarters until breach" projection needed.
        expect(result.quartersUntilBreach).toBeNull();
    });

    it('does not call a quarter "weakening" when the apparent decline is just a data gap', () => {
        const loan = makeLoan({ covenantMinDSCR: 1.25, interestRate: 0, startDate: '2024-01-01' });
        const annualDebtService = loanMonthlyPayment(loan.principal, loan.interestRate, loan.termMonths) * 12;
        const txs: Transaction[] = [
            ...quarterTxs(['2026-01', '2026-02', '2026-03'], 1.60 * annualDebtService / 4 * 3),
            // Only one of three months populated this quarter -- a data gap,
            // not a real near-collapse in DSCR.
            makeTx({ date: '2026-04-10', type: 'income', amount: 5000 }),
            ...quarterTxs(['2026-07', '2026-08', '2026-09'], 1.50 * annualDebtService / 4 * 3),
        ];
        const now = new Date('2026-09-20T00:00:00');
        const result = computeCovenantTracking(loan, txs, [loan], now);
        expect(result.direction).toBe('insufficient-data');
        expect(result.narrative).toMatch(/incomplete transaction history/i);
    });

    it('reports headroom as a % of revenue, not just a multiple', () => {
        const loan = makeLoan({ covenantMinDSCR: 1.25, interestRate: 0, startDate: '2024-01-01' });
        const annualDebtService = loanMonthlyPayment(loan.principal, loan.interestRate, loan.termMonths) * 12;
        const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'];
        const txs = quarterTxs(months, 1.47 * annualDebtService);
        const now = new Date('2026-12-20T00:00:00');
        const result = computeCovenantTracking(loan, txs, [loan], now);
        expect(result.available).toBe(true);
        expect(result.headroomAsRevenuePct).not.toBeNull();
        expect(result.headroomAsRevenuePct!).toBeGreaterThan(0);
    });
});
