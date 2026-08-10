import { computePostFinancingMonitor } from '../src/utils/postFinancingMonitor';
import { Loan, Transaction, ReadinessSnapshot } from '../src/types';
import { DSCRResult } from '../src/utils/finance';

const now = new Date('2026-08-10');

function makeLoan(overrides: Partial<Loan> = {}): Loan {
    return {
        id: 'l1',
        lenderName: 'Sample Bank',
        purpose: 'Working capital',
        principal: 1_000_000,
        interestRate: 15,
        termMonths: 12,
        startDate: '2026-02-01',
        status: 'active',
        payments: [],
        createdAt: '2026-02-01',
        fromMarketplace: true,
        ...overrides,
    };
}

function healthyDscr(): DSCRResult {
    return { dscr: 2.0, netOperatingIncome: 500_000, totalDebtService: 250_000, status: 'healthy' };
}

function unhealthyDscr(): DSCRResult {
    return { dscr: 0.7, netOperatingIncome: 100_000, totalDebtService: 140_000, status: 'danger' };
}

function tx(date: string, type: 'income' | 'expense', amount: number): Transaction {
    return { id: `${date}-${amount}-${Math.random()}`, date, type, category: 'Sales', amount, description: '' } as Transaction;
}

describe('computePostFinancingMonitor', () => {
    it('reports healthy when DSCR is fine, revenue is not declining, and repayment is on pace', () => {
        const loan = makeLoan({ startDate: '2026-06-01', payments: [{ id: 'p1', date: '2026-07-01', amount: 200_000 }] });
        const transactions = [tx('2026-06-15', 'income', 300_000), tx('2026-07-15', 'income', 350_000), tx('2026-08-01', 'income', 400_000)];
        const monitor = computePostFinancingMonitor(loan, transactions, [], healthyDscr(), now);
        expect(monitor.status).toBe('healthy');
        expect(monitor.signals.every(s => !s.tripped)).toBe(true);
    });

    it('is at-risk whenever DSCR is below 1x, regardless of the other signals', () => {
        const loan = makeLoan({ startDate: '2026-06-01' });
        const transactions = [tx('2026-06-15', 'income', 300_000), tx('2026-07-15', 'income', 350_000)];
        const monitor = computePostFinancingMonitor(loan, transactions, [], unhealthyDscr(), now);
        expect(monitor.status).toBe('at-risk');
        expect(monitor.signals.find(s => s.label === 'Debt-service coverage')?.tripped).toBe(true);
    });

    it('flags a declining revenue trend across 3 consecutive months since funding', () => {
        const loan = makeLoan({ startDate: '2026-05-01' });
        const transactions = [
            tx('2026-05-10', 'income', 500_000),
            tx('2026-06-10', 'income', 400_000),
            tx('2026-07-10', 'income', 300_000),
        ];
        const monitor = computePostFinancingMonitor(loan, transactions, [], healthyDscr(), now);
        const revenueSignal = monitor.signals.find(s => s.label === 'Revenue trend since funding');
        expect(revenueSignal?.tripped).toBe(true);
    });

    it('ignores revenue months before the loan was funded', () => {
        const loan = makeLoan({ startDate: '2026-07-01' });
        // Declining trend entirely BEFORE funding -- shouldn't be blamed on this loan.
        const transactions = [
            tx('2026-02-10', 'income', 500_000),
            tx('2026-03-10', 'income', 400_000),
            tx('2026-04-10', 'income', 300_000),
            tx('2026-07-10', 'income', 350_000),
        ];
        const monitor = computePostFinancingMonitor(loan, transactions, [], healthyDscr(), now);
        const revenueSignal = monitor.signals.find(s => s.label === 'Revenue trend since funding');
        expect(revenueSignal?.tripped).toBe(false);
    });

    it('flags being meaningfully behind on repayment pace', () => {
        // 6 months into a 12-month term (50% elapsed) but almost nothing repaid.
        const loan = makeLoan({ startDate: '2026-02-01', termMonths: 12, principal: 1_000_000, payments: [{ id: 'p1', date: '2026-03-01', amount: 10_000 }] });
        const monitor = computePostFinancingMonitor(loan, [], [], healthyDscr(), now);
        const paceSignal = monitor.signals.find(s => s.label === 'Repayment pace');
        expect(paceSignal?.tripped).toBe(true);
    });

    it('does not flag repayment pace in the first month after funding', () => {
        const loan = makeLoan({ startDate: '2026-08-01', payments: [] });
        const monitor = computePostFinancingMonitor(loan, [], [], healthyDscr(), now);
        const paceSignal = monitor.signals.find(s => s.label === 'Repayment pace');
        expect(paceSignal?.tripped).toBe(false);
    });

    it('computes a readiness delta scoped to snapshots since the loan was funded', () => {
        const loan = makeLoan({ startDate: '2026-05-01' });
        const history: ReadinessSnapshot[] = [
            { id: '1', date: '2026-01-01', score: 30, grade: 'F', band: 'Critical', factors: [] }, // before funding, excluded
            { id: '2', date: '2026-05-15', score: 60, grade: 'C', band: 'Moderate', factors: [] },
            { id: '3', date: '2026-08-01', score: 75, grade: 'B', band: 'Strong', factors: [] },
        ];
        const monitor = computePostFinancingMonitor(loan, [], history, healthyDscr(), now);
        expect(monitor.readinessSinceFunding?.fromScore).toBe(60);
        expect(monitor.readinessSinceFunding?.toScore).toBe(75);
    });

    it('is null for readinessSinceFunding when fewer than two snapshots exist since funding', () => {
        const loan = makeLoan({ startDate: '2026-08-01' });
        const monitor = computePostFinancingMonitor(loan, [], [], healthyDscr(), now);
        expect(monitor.readinessSinceFunding).toBeNull();
    });

    it('produces a matching tactic for each tripped signal', () => {
        const loan = makeLoan({ startDate: '2026-02-01', payments: [] });
        const monitor = computePostFinancingMonitor(loan, [], [], unhealthyDscr(), now);
        expect(monitor.tactics.length).toBeGreaterThan(0);
    });
});
