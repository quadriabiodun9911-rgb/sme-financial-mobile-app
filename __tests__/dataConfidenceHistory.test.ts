import {
    computeDataConfidencePct, buildDataConfidenceSnapshot, shouldRecordDataConfidenceSnapshot,
    appendDataConfidenceSnapshot, describeDataConfidenceTrend,
} from '../src/utils/dataConfidenceHistory';
import { DataQuality } from '../src/utils/dataQuality';
import { DataConfidenceSnapshot } from '../src/types';

const makeQuality = (overrides: Partial<DataQuality> = {}): DataQuality => ({
    totalTransactions: 10, undatedCount: 0, monthsWithData: 3, monthsSpanned: 3,
    coveragePct: 100, oldestDate: '2025-01-01', newestDate: '2025-03-01',
    confidence: 'strong', summary: '',
    confidentCount: 8, needsReviewCount: 1, ambiguousCount: 1,
    confidentPct: 80, needsReviewPct: 10, ambiguousPct: 10,
    classificationSummary: '',
    ...overrides,
});

describe('computeDataConfidencePct', () => {
    it('is 0 with no transactions', () => {
        expect(computeDataConfidencePct(makeQuality({ totalTransactions: 0 }))).toBe(0);
    });

    it('blends coverage and classification confidence evenly', () => {
        expect(computeDataConfidencePct(makeQuality({ coveragePct: 60, confidentPct: 80 }))).toBe(70);
    });
});

describe('shouldRecordDataConfidenceSnapshot', () => {
    it('is always true for an empty history', () => {
        expect(shouldRecordDataConfidenceSnapshot([])).toBe(true);
    });

    it('is false within the minimum interval', () => {
        const history: DataConfidenceSnapshot[] = [{ id: '1', date: '2025-06-01', confidencePct: 50 }];
        expect(shouldRecordDataConfidenceSnapshot(history, new Date('2025-06-03'))).toBe(false);
    });

    it('is true once the minimum interval has passed', () => {
        const history: DataConfidenceSnapshot[] = [{ id: '1', date: '2025-06-01', confidencePct: 50 }];
        expect(shouldRecordDataConfidenceSnapshot(history, new Date('2025-06-10'))).toBe(true);
    });
});

describe('appendDataConfidenceSnapshot', () => {
    it('appends and caps history to 52 entries', () => {
        const history: DataConfidenceSnapshot[] = Array.from({ length: 52 }, (_, i) => ({ id: `${i}`, date: '2025-01-01', confidencePct: 10 }));
        const next = appendDataConfidenceSnapshot(history, { id: 'new', date: '2025-06-01', confidencePct: 90 });
        expect(next).toHaveLength(52);
        expect(next[next.length - 1].id).toBe('new');
        expect(next[0].id).toBe('1'); // oldest (index 0) dropped
    });
});

describe('describeDataConfidenceTrend', () => {
    it('returns null with fewer than 2 snapshots', () => {
        expect(describeDataConfidenceTrend([])).toBeNull();
        expect(describeDataConfidenceTrend([{ id: '1', date: '2025-01-01', confidencePct: 42 }])).toBeNull();
    });

    it('builds the growing-over-time narrative with elapsed-time labels', () => {
        const history: DataConfidenceSnapshot[] = [
            { id: '1', date: '2025-01-01', confidencePct: 42 },
            { id: '2', date: '2025-01-31', confidencePct: 61 },
            { id: '3', date: '2025-04-01', confidencePct: 78 },
        ];
        const trend = describeDataConfidenceTrend(history);
        expect(trend).toContain('Data confidence: 42% →');
        expect(trend).toContain('61% (30 days)');
        expect(trend).toContain('78% (3 months)');
    });
});
