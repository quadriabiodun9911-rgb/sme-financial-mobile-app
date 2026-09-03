import { buildDailyBriefing, DailyPulseInput } from '../src/utils/dailyBriefing';
import { PriorityItem } from '../src/utils/dashboardPriorities';
import { WeekdayPatternResult, WEEKDAY_MIN_DAYS } from '../src/utils/weekdayPattern';

const makePriority = (overrides: Partial<PriorityItem> = {}): PriorityItem => ({
    id: 'p1',
    kind: 'low_cash',
    tier: 'attention',
    title: 'Cash running low',
    subtitle: 'Only 3 days of runway left',
    impactAmount: 50000,
    ...overrides,
});

const NOT_AVAILABLE_PATTERN: WeekdayPatternResult = {
    available: false, daysOfHistory: 0, minDaysRequired: WEEKDAY_MIN_DAYS, indices: [],
    peakRevenueDays: [], troughRevenueDays: [], peakExpenseDays: [], troughExpenseDays: [],
    zeroRevenueWeekdayNames: [], topRevenueDaysSharePct: 0, overallAvgDailyRevenue: 0, overallAvgDailyExpense: 0,
};

function patternWithTodayIndex(weekday: number, revenueIndex: number): WeekdayPatternResult {
    return {
        ...NOT_AVAILABLE_PATTERN,
        available: true,
        daysOfHistory: 30,
        indices: [{ weekday, weekdayName: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekday], revenueIndex, expenseIndex: 1, sampleCount: 4 }],
    };
}

const PULSE: DailyPulseInput = {
    yesterdayRevenue: 45000,
    yesterdayExpense: 12000,
    cashBalance: 177500,
    runwayDays: 36,
    currency: '₦',
};

describe('buildDailyBriefing', () => {
    it('reports nothing urgent when there are no real priorities and no weekday pattern', () => {
        const result = buildDailyBriefing([], NOT_AVAILABLE_PATTERN, PULSE, new Date('2026-06-15T09:00:00')); // a Monday
        expect(result.topPriorities).toEqual([]);
        expect(result.weekdayNote).toBeNull();
        expect(result.body).toContain('Nothing urgent');
    });

    it('leads with the highest-ranked real priority and caps the list at 3', () => {
        const priorities = [
            makePriority({ id: 'p1', title: 'Cash running low' }),
            makePriority({ id: 'p2', title: 'Invoices overdue' }),
            makePriority({ id: 'p3', title: 'Budget exceeded' }),
            makePriority({ id: 'p4', title: 'Low stock' }),
        ];
        const result = buildDailyBriefing(priorities, NOT_AVAILABLE_PATTERN, PULSE, new Date('2026-06-15T09:00:00'));
        expect(result.topPriorities).toHaveLength(3);
        expect(result.body).toContain('Cash running low');
        expect(result.body).toContain('Only 3 days of runway left');
        expect(result.body).toContain('2 more things');
    });

    it('never surfaces a weekday note when the pattern is unavailable', () => {
        const result = buildDailyBriefing([], NOT_AVAILABLE_PATTERN, PULSE, new Date('2026-06-16T09:00:00')); // a Tuesday
        expect(result.weekdayNote).toBeNull();
    });

    it('flags a real zero-revenue weekday with the exact "no sales day" framing', () => {
        // 2026-06-16 is a Tuesday
        const pattern = patternWithTodayIndex(2, 0.02);
        const result = buildDailyBriefing([], pattern, PULSE, new Date('2026-06-16T09:00:00'));
        expect(result.weekdayNote).toContain('Tuesday');
        expect(result.weekdayNote).toContain('almost no revenue');
    });

    it('flags a real peak weekday with a stock/staffing framing', () => {
        // 2026-06-20 is a Saturday
        const pattern = patternWithTodayIndex(6, 1.5);
        const result = buildDailyBriefing([], pattern, PULSE, new Date('2026-06-20T09:00:00'));
        expect(result.weekdayNote).toContain('Saturday');
        expect(result.weekdayNote).toContain('strongest day');
    });

    it('computes net movement as yesterday revenue minus expense, not just copied through', () => {
        const result = buildDailyBriefing([], NOT_AVAILABLE_PATTERN, PULSE, new Date('2026-06-15T09:00:00'));
        expect(result.pulse.netMovement).toBe(33000);
        expect(result.pulse.cashBalance).toBe(177500);
        expect(result.pulse.runwayDays).toBe(36);
    });

    it('reports a negative net movement honestly rather than clamping to zero', () => {
        const losingDay: DailyPulseInput = { ...PULSE, yesterdayRevenue: 5000, yesterdayExpense: 20000 };
        const result = buildDailyBriefing([], NOT_AVAILABLE_PATTERN, losingDay, new Date('2026-06-15T09:00:00'));
        expect(result.pulse.netMovement).toBe(-15000);
        expect(result.body).toContain('-₦15,000');
    });

    it('greets with the business name when given one, and a plain greeting otherwise', () => {
        const named = buildDailyBriefing([], NOT_AVAILABLE_PATTERN, { ...PULSE, businessName: 'Adunola Fashion Store' }, new Date('2026-06-15T09:00:00'));
        expect(named.greeting).toBe('Good morning, Adunola Fashion Store');

        const anonymous = buildDailyBriefing([], NOT_AVAILABLE_PATTERN, PULSE, new Date('2026-06-15T09:00:00'));
        expect(anonymous.greeting).toBe('Good morning');
    });

    it('omits the runway clause in the notification body when runway is not meaningful', () => {
        const noRunway: DailyPulseInput = { ...PULSE, runwayDays: null };
        const result = buildDailyBriefing([], NOT_AVAILABLE_PATTERN, noRunway, new Date('2026-06-15T09:00:00'));
        expect(result.body).not.toContain('runway');
        expect(result.pulse.runwayDays).toBeNull();
    });
});
