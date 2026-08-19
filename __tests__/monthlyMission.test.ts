import { resolveMonthlyMission, selectMissionCandidate, currentPeriodString, StoredMission } from '../src/utils/monthlyMission';
import { PriorityItem } from '../src/utils/dashboardPriorities';

function makePriority(overrides: Partial<PriorityItem>): PriorityItem {
    return {
        id: 'priority-1',
        kind: 'overdue_invoices',
        tier: 'attention',
        title: '3 Customers Overdue',
        subtitle: '₦450,000 to collect',
        impactAmount: 450000,
        ...overrides,
    };
}

describe('selectMissionCandidate', () => {
    it('picks the first eligible priority item', () => {
        const priorities = [
            makePriority({ kind: 'low_cash', impactAmount: 900000 }), // not eligible -- no direction to "clear"
            makePriority({ kind: 'overdue_invoices', impactAmount: 450000 }),
        ];
        expect(selectMissionCandidate(priorities)?.kind).toBe('overdue_invoices');
    });

    it('skips an eligible kind with a zero impact amount', () => {
        const priorities = [makePriority({ kind: 'overdue_invoices', impactAmount: 0 })];
        expect(selectMissionCandidate(priorities)).toBeNull();
    });

    it('returns null when nothing is eligible', () => {
        expect(selectMissionCandidate([makePriority({ kind: 'financing_opportunity', impactAmount: 0 })])).toBeNull();
    });
});

describe('resolveMonthlyMission', () => {
    const referenceDate = new Date('2026-08-15');
    const period = currentPeriodString(referenceDate);

    it('selects a fresh mission on first run (no stored mission)', () => {
        const priorities = [makePriority({ kind: 'overdue_invoices', impactAmount: 450000, title: '3 Customers Overdue' })];
        const { mission, toPersist } = resolveMonthlyMission(priorities, null, referenceDate);
        expect(mission?.kind).toBe('overdue_invoices');
        expect(mission?.baselineAmount).toBe(450000);
        expect(mission?.currentAmount).toBe(450000);
        expect(mission?.progressPct).toBe(0);
        expect(toPersist).toEqual({ period, kind: 'overdue_invoices', baselineAmount: 450000, title: 'Collect Outstanding Invoices' });
    });

    it('keeps the stored mission and computes real progress as the amount shrinks', () => {
        const stored: StoredMission = { period, kind: 'overdue_invoices', baselineAmount: 450000, title: 'Collect Outstanding Invoices' };
        const priorities = [makePriority({ kind: 'overdue_invoices', impactAmount: 180000 })];
        const { mission, toPersist } = resolveMonthlyMission(priorities, stored, referenceDate);
        expect(mission?.baselineAmount).toBe(450000);
        expect(mission?.currentAmount).toBe(180000);
        expect(mission?.progressPct).toBeCloseTo(60, 5); // (450000-180000)/450000
        expect(toPersist).toBeNull(); // nothing to persist -- baseline unchanged
    });

    it('does not switch missions mid-month just because a different item became larger', () => {
        const stored: StoredMission = { period, kind: 'overdue_invoices', baselineAmount: 450000, title: 'Collect Outstanding Invoices' };
        const priorities = [
            makePriority({ kind: 'overdue_invoices', impactAmount: 300000 }),
            makePriority({ kind: 'overdue_loan_payments', impactAmount: 900000, title: '1 Loan Payment Overdue' }),
        ];
        const { mission } = resolveMonthlyMission(priorities, stored, referenceDate);
        expect(mission?.kind).toBe('overdue_invoices');
    });

    it('picks a fresh mission immediately once the stored one is fully cleared', () => {
        const stored: StoredMission = { period, kind: 'overdue_invoices', baselineAmount: 450000, title: 'Collect Outstanding Invoices' };
        const priorities = [makePriority({ kind: 'overspent_budget', impactAmount: 60000, title: '1 Budget Exceeded' })];
        const { mission, toPersist } = resolveMonthlyMission(priorities, stored, referenceDate);
        expect(mission?.kind).toBe('overspent_budget');
        expect(mission?.baselineAmount).toBe(60000);
        expect(mission?.progressPct).toBe(0);
        expect(toPersist?.kind).toBe('overspent_budget');
    });

    it('picks a fresh mission when the stored one is from a past calendar period', () => {
        const stored: StoredMission = { period: '2026-06', kind: 'overdue_invoices', baselineAmount: 450000, title: 'Collect Outstanding Invoices' };
        const priorities = [makePriority({ kind: 'overdue_transactions', impactAmount: 75000, title: '1 Payment Overdue' })];
        const { mission, toPersist } = resolveMonthlyMission(priorities, stored, referenceDate);
        expect(mission?.kind).toBe('overdue_transactions');
        expect(mission?.baselineAmount).toBe(75000);
        expect(toPersist?.period).toBe(period);
    });

    it('returns no mission (and nothing to persist) when nothing is eligible at all', () => {
        const { mission, toPersist } = resolveMonthlyMission([], null, referenceDate);
        expect(mission).toBeNull();
        expect(toPersist).toBeNull();
    });

    it('never lets progress exceed 100 even if the current amount somehow rises above baseline', () => {
        const stored: StoredMission = { period, kind: 'overdue_invoices', baselineAmount: 100000, title: 'Collect Outstanding Invoices' };
        const priorities = [makePriority({ kind: 'overdue_invoices', impactAmount: 999999999 })];
        const { mission } = resolveMonthlyMission(priorities, stored, referenceDate);
        expect(mission?.progressPct).toBe(0);
    });
});
