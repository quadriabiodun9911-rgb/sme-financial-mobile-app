import { recordFxSnapshot, computeFxChangeSuggestion, MIN_SNAPSHOT_AGE_DAYS } from '../src/utils/macroFeed';
import { FxRateSnapshot } from '../src/types';

describe('recordFxSnapshot', () => {
    it('appends a new snapshot', () => {
        const result = recordFxSnapshot([], 'USD', 'NGN', 1650, '2026-08-28');
        expect(result).toEqual([{ base: 'USD', quote: 'NGN', rate: 1650, date: '2026-08-28' }]);
    });

    it('replaces (not duplicates) a same-day snapshot for the same pair', () => {
        const existing: FxRateSnapshot[] = [{ base: 'USD', quote: 'NGN', rate: 1600, date: '2026-08-28' }];
        const result = recordFxSnapshot(existing, 'USD', 'NGN', 1650, '2026-08-28');
        expect(result).toHaveLength(1);
        expect(result[0].rate).toBe(1650);
    });

    it('keeps snapshots for different currency pairs separate', () => {
        const existing: FxRateSnapshot[] = [{ base: 'USD', quote: 'NGN', rate: 1600, date: '2026-08-28' }];
        const result = recordFxSnapshot(existing, 'USD', 'GHS', 15, '2026-08-28');
        expect(result).toHaveLength(2);
    });

    it('keeps snapshots sorted by date', () => {
        let history: FxRateSnapshot[] = [];
        history = recordFxSnapshot(history, 'USD', 'NGN', 1600, '2026-08-20');
        history = recordFxSnapshot(history, 'USD', 'NGN', 1610, '2026-08-01');
        expect(history.map(s => s.date)).toEqual(['2026-08-01', '2026-08-20']);
    });
});

describe('computeFxChangeSuggestion', () => {
    const base = 'USD';
    const quote = 'NGN';

    it('returns null with no snapshot history', () => {
        expect(computeFxChangeSuggestion([], base, quote, 1650, '2026-08-28', 3)).toBeNull();
    });

    it('returns null when the only snapshot is too recent (under MIN_SNAPSHOT_AGE_DAYS)', () => {
        const snapshots: FxRateSnapshot[] = [{ base, quote, rate: 1600, date: '2026-08-25' }]; // 3 days old
        expect(computeFxChangeSuggestion(snapshots, base, quote, 1650, '2026-08-28', 3)).toBeNull();
    });

    it('computes a real % change against a snapshot old enough to qualify', () => {
        const oldEnough = new Date('2026-08-28T00:00:00');
        oldEnough.setDate(oldEnough.getDate() - MIN_SNAPSHOT_AGE_DAYS - 1);
        const fromDate = oldEnough.toISOString().split('T')[0];
        const snapshots: FxRateSnapshot[] = [{ base, quote, rate: 1500, date: fromDate }];
        const result = computeFxChangeSuggestion(snapshots, base, quote, 1650, '2026-08-28', 3);
        expect(result).not.toBeNull();
        expect(result!.changePct).toBeCloseTo(10, 5); // (1650-1500)/1500 * 100
        expect(result!.fromRate).toBe(1500);
        expect(result!.toRate).toBe(1650);
    });

    it('picks the snapshot closest to (not after) the requested period, not just the oldest', () => {
        const snapshots: FxRateSnapshot[] = [
            { base, quote, rate: 1400, date: '2026-01-01' }, // ~8 months back -- too far
            { base, quote, rate: 1500, date: '2026-05-28' }, // ~3 months back -- the right one
            { base, quote, rate: 1600, date: '2026-08-20' }, // 8 days back -- too recent to use directly, but not chosen anyway
        ];
        const result = computeFxChangeSuggestion(snapshots, base, quote, 1650, '2026-08-28', 3);
        expect(result!.fromDate).toBe('2026-05-28');
        expect(result!.fromRate).toBe(1500);
    });

    it('falls back to the oldest snapshot when history doesn\'t reach back the full period yet, labeling the real span', () => {
        const oldEnough = new Date('2026-08-28T00:00:00');
        oldEnough.setDate(oldEnough.getDate() - MIN_SNAPSHOT_AGE_DAYS - 5); // ~19 days, not the full 3 months requested
        const fromDate = oldEnough.toISOString().split('T')[0];
        const snapshots: FxRateSnapshot[] = [{ base, quote, rate: 1600, date: fromDate }];
        const result = computeFxChangeSuggestion(snapshots, base, quote, 1650, '2026-08-28', 3);
        expect(result).not.toBeNull();
        expect(result!.fromDate).toBe(fromDate);
        expect(result!.actualMonthsSpanned).toBeLessThan(1);
    });

    it('ignores snapshots for a different currency pair', () => {
        const oldEnough = new Date('2026-08-28T00:00:00');
        oldEnough.setDate(oldEnough.getDate() - 60);
        const fromDate = oldEnough.toISOString().split('T')[0];
        const snapshots: FxRateSnapshot[] = [{ base: 'USD', quote: 'GHS', rate: 15, date: fromDate }];
        expect(computeFxChangeSuggestion(snapshots, base, quote, 1650, '2026-08-28', 3)).toBeNull();
    });
});
