import { computeBusinessTimeline } from '../src/utils/businessTimeline';
import { Loan, FinancialGoal, ReadinessSnapshot, Transaction } from '../src/types';

const makeSnapshot = (overrides: Partial<ReadinessSnapshot>): ReadinessSnapshot => ({
    id: `snap-${Math.random()}`,
    date: '2024-01-01',
    score: 60,
    grade: 'C',
    band: 'Moderate',
    factors: [],
    ...overrides,
});

const makeLoan = (overrides: Partial<Loan>): Loan => ({
    id: `loan-${Math.random()}`,
    lenderName: 'First Bank',
    purpose: 'Stock',
    principal: 500000,
    interestRate: 15,
    termMonths: 12,
    startDate: '2024-02-01',
    status: 'active',
    payments: [],
    createdAt: '2024-02-01',
    ...overrides,
});

const makeGoal = (overrides: Partial<FinancialGoal>): FinancialGoal => ({
    id: `goal-${Math.random()}`,
    type: 'revenue_growth',
    title: 'Grow revenue 20%',
    description: '',
    targetValue: 20,
    unit: '%',
    baselineValue: 0,
    currentValue: 0,
    deadline: '2024-12-31',
    createdAt: '2024-03-01',
    status: 'on_track',
    progress: 10,
    ...overrides,
});

describe('computeBusinessTimeline', () => {
    it('adds an account_created event from accountCreatedAt when present', () => {
        const events = computeBusinessTimeline([], [], [], [], '₦', '2024-01-15');
        expect(events.some(e => e.type === 'account_created' && e.date === '2024-01-15')).toBe(true);
    });

    it('falls back to the earliest transaction date when accountCreatedAt is missing', () => {
        const txs: Transaction[] = [
            { id: 't1', date: '2024-05-01', description: 'x', type: 'income', category: 'Sales', amount: 100, status: 'paid' },
            { id: 't2', date: '2024-02-01', description: 'x', type: 'income', category: 'Sales', amount: 100, status: 'paid' },
        ];
        const events = computeBusinessTimeline(txs, [], [], [], '₦', undefined);
        const started = events.find(e => e.type === 'account_created');
        expect(started?.date).toBe('2024-02-01');
    });

    it('emits a score_change event only when the move crosses the noise threshold', () => {
        const history = [
            makeSnapshot({ id: 's1', date: '2024-01-01', score: 60 }),
            makeSnapshot({ id: 's2', date: '2024-01-08', score: 62 }), // +2, too small
            makeSnapshot({ id: 's3', date: '2024-01-15', score: 70 }), // +8, real move
        ];
        const events = computeBusinessTimeline([], [], [], history);
        const scoreEvents = events.filter(e => e.type === 'score_change');
        expect(scoreEvents).toHaveLength(1);
        expect(scoreEvents[0].detail).toContain('62 to 70');
        expect(scoreEvents[0].positive).toBe(true);
    });

    it('adds a loan_taken event for every loan', () => {
        const loans = [makeLoan({ id: 'l1' })];
        const events = computeBusinessTimeline([], loans, [], []);
        expect(events.some(e => e.type === 'loan_taken' && e.id === 'loan_taken_l1')).toBe(true);
    });

    it('adds a loan_repaid event dated by the last payment when a loan is paid off', () => {
        const loans = [makeLoan({
            id: 'l1', status: 'paid_off',
            payments: [
                { id: 'p1', date: '2024-03-01', amount: 200000 } as any,
                { id: 'p2', date: '2024-06-01', amount: 300000 } as any,
            ],
        })];
        const events = computeBusinessTimeline([], loans, [], []);
        const repaid = events.find(e => e.type === 'loan_repaid');
        expect(repaid?.date).toBe('2024-06-01');
        expect(repaid?.positive).toBe(true);
    });

    it('does not add a loan_repaid event for an active loan', () => {
        const loans = [makeLoan({ id: 'l1', status: 'active' })];
        const events = computeBusinessTimeline([], loans, [], []);
        expect(events.some(e => e.type === 'loan_repaid')).toBe(false);
    });

    it('adds a goal_created event for every goal, dated by createdAt', () => {
        const goals = [makeGoal({ id: 'g1', createdAt: '2024-03-05' })];
        const events = computeBusinessTimeline([], [], goals, []);
        const created = events.find(e => e.type === 'goal_created');
        expect(created?.date).toBe('2024-03-05');
    });

    it('never invents a dated "goal achieved" event', () => {
        const goals = [makeGoal({ id: 'g1', status: 'achieved' })];
        const events = computeBusinessTimeline([], [], goals, []);
        expect(events.every(e => e.type !== ('goal_achieved' as any))).toBe(true);
    });

    it('sorts all events chronologically ascending', () => {
        const loans = [makeLoan({ id: 'l1', startDate: '2024-06-01' })];
        const goals = [makeGoal({ id: 'g1', createdAt: '2024-02-01' })];
        const events = computeBusinessTimeline([], loans, goals, [], '₦', '2024-01-01');
        const dates = events.map(e => e.date);
        expect(dates).toEqual([...dates].sort());
    });

    it('de-duplicates account_created between the fallback and an ACCOUNT_SETUP audit row, keeping the earliest', () => {
        const auditEntries = [
            { id: 'a1', action: 'ACCOUNT_SETUP' as const, details: null, severity: 'low' as const, timestamp: '2024-03-01T00:00:00.000Z' },
        ];
        const events = computeBusinessTimeline([], [], [], [], '₦', '2024-01-01', auditEntries);
        const accountEvents = events.filter(e => e.type === 'account_created');
        expect(accountEvents).toHaveLength(1);
        expect(accountEvents[0].date).toBe('2024-01-01');
    });
});
