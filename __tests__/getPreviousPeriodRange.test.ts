import { getPreviousPeriodRange } from '../src/utils/finance';

describe('getPreviousPeriodRange — like-for-like day comparison', () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    it('month: compares the same number of elapsed days, not a partial month against a full one', () => {
        // 5 days into August — regression case for the Analysis screen's
        // "Why is your profit changing?" headline comparing 5 days of
        // August against a full 31-day July.
        jest.useFakeTimers().setSystemTime(new Date('2026-08-05T12:00:00'));
        const { current, previous } = getPreviousPeriodRange('month');
        expect(current).toEqual({ from: '2026-08-01', to: '2026-08-05' });
        expect(previous).toEqual({ from: '2026-07-01', to: '2026-07-05' });
    });

    it('month: caps the previous range at month end when the current month has more days than the previous one', () => {
        // 31 days into a 31-day month (e.g. October), comparing against
        // February — must cap at Feb 28/29, not roll into March.
        jest.useFakeTimers().setSystemTime(new Date('2026-03-31T12:00:00'));
        const { previous } = getPreviousPeriodRange('month');
        expect(previous).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    });

    it('month: on the 1st of the month, compares exactly 1 day against 1 day', () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-08-01T09:00:00'));
        const { current, previous } = getPreviousPeriodRange('month');
        expect(current).toEqual({ from: '2026-08-01', to: '2026-08-01' });
        expect(previous).toEqual({ from: '2026-07-01', to: '2026-07-01' });
    });

    it('quarter: compares elapsed days within the rolling 3-month window, not the full prior quarter', () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-08-05T12:00:00'));
        const { current, previous } = getPreviousPeriodRange('quarter');
        // this quarter: Jun 1 (month-2) through today
        expect(current).toEqual({ from: '2026-06-01', to: '2026-08-05' });
        // days elapsed = Jun1..Aug5 = 66 days; previous quarter starts Mar 1
        const daysElapsed = Math.floor((new Date('2026-08-05T12:00:00').getTime() - new Date('2026-06-01').getTime()) / 86400000) + 1;
        const expectedTo = new Date('2026-03-01');
        expectedTo.setDate(expectedTo.getDate() + daysElapsed - 1);
        expect(previous.from).toBe('2026-03-01');
        expect(previous.to).toBe(expectedTo.toISOString().split('T')[0]);
        // previous quarter's own end (May 31) must not be exceeded
        expect(new Date(previous.to).getTime()).toBeLessThanOrEqual(new Date('2026-05-31').getTime());
    });

    it('year: compares the same number of elapsed days into last year', () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-02-10T12:00:00'));
        const { current, previous } = getPreviousPeriodRange('year');
        expect(current).toEqual({ from: '2026-01-01', to: '2026-02-10' });
        expect(previous).toEqual({ from: '2025-01-01', to: '2025-02-10' });
    });
});
