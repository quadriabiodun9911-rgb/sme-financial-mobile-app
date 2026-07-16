import { computeGoalProgress, computeGoalStatus, refreshGoal, generateStrategy, goalDefaults, buildNewGoal, sanitizeStoredGoals } from '../src/utils/goals';
import { FinancialGoal, FinanceData, Transaction } from '../src/types';

const makeFinance = (overrides: Partial<FinanceData> = {}): FinanceData => ({
    income: 100000, expense: 60000, profit: 40000, margin: 40,
    cashBalance: 40000, totalRevenue: 100000, totalCosts: 60000,
    assets: 40000, liabilities: 0, equity: 40000,
    totalTaxCollected: 0, totalTaxPaid: 0, netTaxPosition: 0,
    annualDepreciation: 0, depreciationAdjustedProfit: 40000,
    ...overrides,
});

const makeGoal = (overrides: Partial<FinancialGoal> = {}): FinancialGoal => ({
    id: 'g1', type: 'revenue_growth', title: 'Grow Revenue',
    description: '', targetValue: 120000, baselineValue: 100000,
    currentValue: 110000, deadline: '2027-01-01',
    createdAt: new Date().toISOString().split('T')[0],
    status: 'on_track', progress: 50, unit: '$',
    ...overrides,
});

const settings = {
    businessType: 'both' as const, currency: '$', currencyCode: 'USD', minReserve: '5000',
    targetMargin: '65', openingAssets: '0', openingLiabilities: '0', openingLoans: '0', openingOtherAssets: '0', defaultTaxRate: '0',
};

// ─── computeGoalProgress ─────────────────────────────────────────────────────

describe('computeGoalProgress', () => {
    it('returns 50% when halfway to revenue target', () => {
        const goal = makeGoal({ type: 'revenue_growth', baselineValue: 100000, targetValue: 120000, currentValue: 110000 });
        expect(computeGoalProgress(goal)).toBeCloseTo(50);
    });

    it('returns 100% when target is reached', () => {
        const goal = makeGoal({ baselineValue: 100000, targetValue: 120000, currentValue: 120000 });
        expect(computeGoalProgress(goal)).toBe(100);
    });

    it('clamps to 100 when current exceeds target', () => {
        const goal = makeGoal({ baselineValue: 100000, targetValue: 120000, currentValue: 150000 });
        expect(computeGoalProgress(goal)).toBe(100);
    });

    it('returns 0 when no progress has been made', () => {
        const goal = makeGoal({ baselineValue: 100000, targetValue: 120000, currentValue: 100000 });
        expect(computeGoalProgress(goal)).toBe(0);
    });

    it('calculates progress correctly for cost_reduction (lower is better)', () => {
        // Need to reduce from 60000 to 50000 — currently at 55000
        const goal = makeGoal({ type: 'cost_reduction', baselineValue: 60000, targetValue: 50000, currentValue: 55000 });
        expect(computeGoalProgress(goal)).toBeCloseTo(50);
    });

    it('cost_reduction returns 100 when target is met', () => {
        const goal = makeGoal({ type: 'cost_reduction', baselineValue: 60000, targetValue: 50000, currentValue: 50000 });
        expect(computeGoalProgress(goal)).toBe(100);
    });
});

// ─── computeGoalStatus ───────────────────────────────────────────────────────

describe('computeGoalStatus', () => {
    it('returns achieved when progress is 100', () => {
        const goal = makeGoal({ progress: 100 });
        expect(computeGoalStatus(goal)).toBe('achieved');
    });

    it('returns on_track when progress matches expected pace', () => {
        const now = new Date();
        const created = new Date(now); created.setDate(created.getDate() - 30);
        const deadline = new Date(now); deadline.setDate(deadline.getDate() + 30);
        const goal = makeGoal({
            progress: 50,
            createdAt: created.toISOString().split('T')[0],
            deadline: deadline.toISOString().split('T')[0],
        });
        expect(computeGoalStatus(goal)).toBe('on_track');
    });

    it('returns off_track when significantly behind expected pace', () => {
        const now = new Date();
        const created = new Date(now); created.setDate(created.getDate() - 90);
        const deadline = new Date(now); deadline.setDate(deadline.getDate() + 10);
        const goal = makeGoal({
            progress: 5,
            createdAt: created.toISOString().split('T')[0],
            deadline: deadline.toISOString().split('T')[0],
        });
        expect(computeGoalStatus(goal)).toBe('off_track');
    });
});

// ─── goalDefaults ─────────────────────────────────────────────────────────────

describe('goalDefaults', () => {
    const finance = makeFinance();

    it('revenue_growth target is 120% of current income', () => {
        const d = goalDefaults('revenue_growth', finance, settings);
        expect(d.targetValue).toBe(Math.round(finance.income * 1.2));
        expect(d.baselineValue).toBe(finance.income);
    });

    it('cost_reduction target is 85% of current expense', () => {
        const d = goalDefaults('cost_reduction', finance, settings);
        expect(d.targetValue).toBe(Math.round(finance.expense * 0.85));
    });

    it('margin_improvement target is current margin + 10', () => {
        const d = goalDefaults('margin_improvement', finance, settings);
        expect(d.targetValue).toBeCloseTo(finance.margin + 10);
    });

    it('cash_reserve target is double the min reserve', () => {
        const d = goalDefaults('cash_reserve', finance, settings);
        expect(d.targetValue).toBe(parseFloat(settings.minReserve) * 2);
    });
});

// ─── generateStrategy ─────────────────────────────────────────────────────────

describe('generateStrategy', () => {
    const finance = makeFinance();
    const transactions: Transaction[] = [];

    it('returns actions for revenue_growth goal', () => {
        const goal = makeGoal({ type: 'revenue_growth' });
        const strategy = generateStrategy(goal, finance, transactions, settings);
        expect(strategy.actions.length).toBeGreaterThan(0);
        expect(strategy.goalId).toBe(goal.id);
    });

    it('returns actions for margin_improvement goal', () => {
        const goal = makeGoal({ type: 'margin_improvement', targetValue: 60 });
        const strategy = generateStrategy(goal, finance, transactions, settings);
        expect(strategy.actions.length).toBeGreaterThan(0);
    });

    it('returns actions for cost_reduction goal', () => {
        const goal = makeGoal({ type: 'cost_reduction', targetValue: 50000 });
        const strategy = generateStrategy(goal, finance, transactions, settings);
        expect(strategy.actions.length).toBeGreaterThan(0);
    });

    it('all actions have required fields', () => {
        const goal = makeGoal({ type: 'cash_reserve', targetValue: 100000 });
        const strategy = generateStrategy(goal, finance, transactions, settings);
        strategy.actions.forEach(action => {
            expect(action.priority).toMatch(/^(high|medium|low)$/);
            expect(typeof action.title).toBe('string');
            expect(typeof action.detail).toBe('string');
        });
    });

    it('includes overdue AR context when present', () => {
        const txs: Transaction[] = [{
            id: 'ar1', date: '2026-01-01', description: 'Overdue invoice',
            type: 'income', category: 'Sales', amount: 15000,
            status: 'overdue', dueDate: '2026-01-15',
        }];
        const goal = makeGoal({ type: 'cash_reserve', targetValue: 100000 });
        const strategy = generateStrategy(goal, makeFinance({ cashBalance: 2000 }), txs, settings);
        const hasARAction = strategy.actions.some(a => a.detail.toLowerCase().includes('overdue') || a.detail.toLowerCase().includes('receivable'));
        expect(hasARAction).toBe(true);
    });
});

// ─── buildNewGoal ─────────────────────────────────────────────────────────────
//
// Regression coverage for a real production bug: the goal-creation screen
// used to call addGoal(type, {...}) — two arguments — against a single-
// argument addGoal(goal). JS silently drops the extra argument, so `goal`
// inside addGoal became the raw type STRING, and spreading a string
// ({...goal}) produces an object of indexed characters with none of the
// real fields (no title, no progress, nothing but a generated id). Every
// goal created through the UI was corrupted this way, and every screen that
// later rendered goal.progress.toFixed(0) or goal.status.replace(...)
// crashed on real user accounts while a fresh account never hit it.
//
// buildNewGoal is the single place that now assembles a new goal, called
// with ONE argument. These tests assert the object it returns is complete
// and well-typed, so that specific bug class cannot silently reappear.

describe('buildNewGoal', () => {
    const finance = makeFinance();

    it('returns a complete FinancialGoal with every required field populated', () => {
        const goal = buildNewGoal(
            { type: 'revenue_growth', title: 'Grow Revenue', description: 'Reach 120k', targetValue: 120000, deadline: '2027-01-01' },
            finance,
            settings,
            []
        );
        expect(typeof goal.title).toBe('string');
        expect(goal.title).toBe('Grow Revenue');
        expect(typeof goal.targetValue).toBe('number');
        expect(goal.targetValue).toBe(120000);
        expect(typeof goal.progress).toBe('number');
        expect(goal.progress).toBe(0);
        expect(typeof goal.status).toBe('string');
        expect(goal.status).toBe('on_track');
        expect(typeof goal.deadline).toBe('string');
        expect(goal.deadline).toBe('2027-01-01');
        expect(typeof goal.createdAt).toBe('string');
        expect(typeof goal.baselineValue).toBe('number');
        expect(typeof goal.currentValue).toBe('number');
        expect(typeof goal.unit).toBe('string');
    });

    it('seeds baselineValue and currentValue from the live finance data for the chosen goal type', () => {
        const goal = buildNewGoal(
            { type: 'revenue_growth', title: 'Grow Revenue', description: '', targetValue: 150000, deadline: '2027-01-01' },
            finance,
            settings,
            []
        );
        expect(goal.baselineValue).toBe(finance.income);
        expect(goal.currentValue).toBe(finance.income);
    });

    it('is never accidentally passed as a second argument — the resulting object has no numeric-string keys from a spread type string', () => {
        const goal = buildNewGoal(
            { type: 'cost_reduction', title: 'Cut Costs', description: '', targetValue: 40000, deadline: '2027-01-01' },
            finance,
            settings,
            []
        ) as any;
        // The historical bug produced objects like {0:'c',1:'o',2:'s',...,id:'...'}.
        // A correctly-built goal must not have single-character-indexed keys.
        expect(goal['0']).toBeUndefined();
        expect(goal['1']).toBeUndefined();
    });

    it('carries an optional percentTarget through when provided', () => {
        const goal = buildNewGoal(
            { type: 'revenue_growth', title: 'Grow', description: '', targetValue: 120000, deadline: '2027-01-01', percentTarget: 20 },
            finance,
            settings,
            []
        );
        expect(goal.percentTarget).toBe(20);
    });
});

// ─── sanitizeStoredGoals ────────────────────────────────────────────────────
//
// Real corrupted records this bug produced looked exactly like a spread
// string: {"0":"r","1":"e","2":"v",...,"id":"id-123"} — no title, no
// targetValue, no deadline, no type. These tests use that exact shape.

describe('sanitizeStoredGoals', () => {
    const corruptedGoal = { '0': 'r', '1': 'e', '2': 'v', id: 'id-corrupt-1' } as unknown as ReturnType<typeof makeGoal>;

    it('drops goals corrupted by the string-spread bug (no title/targetValue/deadline/type)', () => {
        const cleaned = sanitizeStoredGoals([corruptedGoal]);
        expect(cleaned).toHaveLength(0);
    });

    it('keeps a well-formed goal untouched aside from backfilling', () => {
        const goal = makeGoal();
        const cleaned = sanitizeStoredGoals([goal]);
        expect(cleaned).toHaveLength(1);
        expect(cleaned[0].title).toBe(goal.title);
        expect(cleaned[0].progress).toBe(goal.progress);
    });

    it('backfills status/progress/createdAt on an otherwise-valid goal missing them', () => {
        const partial = { ...makeGoal(), status: undefined, progress: undefined, createdAt: undefined } as any;
        const cleaned = sanitizeStoredGoals([partial]);
        expect(cleaned).toHaveLength(1);
        expect(cleaned[0].status).toBe('on_track');
        expect(cleaned[0].progress).toBe(0);
        expect(typeof cleaned[0].createdAt).toBe('string');
    });

    it('filters a mixed list, keeping only the valid entries', () => {
        const good = makeGoal({ id: 'good-1' });
        const cleaned = sanitizeStoredGoals([corruptedGoal, good]);
        expect(cleaned).toHaveLength(1);
        expect(cleaned[0].id).toBe('good-1');
    });
});
