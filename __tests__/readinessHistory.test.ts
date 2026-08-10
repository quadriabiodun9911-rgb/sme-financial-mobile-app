import {
    buildReadinessSnapshot,
    shouldRecordSnapshot,
    appendReadinessSnapshot,
    computeReadinessDelta,
} from '../src/utils/readinessHistory';
import { RiskScore } from '../src/utils/finance';
import { ReadinessSnapshot } from '../src/types';

function makeRisk(score: number, factors: Partial<Record<string, number>> = {}): RiskScore {
    const names = ['Profitability', 'Liquidity', 'Working Capital', 'Debt', 'Efficiency', 'Inventory', 'Concentration'];
    return {
        score,
        grade: score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F',
        band: score >= 90 ? 'Excellent' : score >= 75 ? 'Strong' : score >= 55 ? 'Moderate' : score >= 35 ? 'Weak' : 'Critical',
        factors: names.map(name => ({
            name,
            score: factors[name] ?? 60,
            weight: 100 / names.length,
            status: 'good' as const,
        })),
    };
}

function makeSnapshot(date: string, score: number, factors: Partial<Record<string, number>> = {}): ReadinessSnapshot {
    return buildReadinessSnapshot(makeRisk(score, factors), new Date(date));
}

describe('buildReadinessSnapshot', () => {
    it('captures the score, band, grade and each factor from a RiskScore', () => {
        const snap = buildReadinessSnapshot(makeRisk(73), new Date('2026-06-01'));
        expect(snap.score).toBe(73);
        expect(snap.band).toBe('Moderate');
        expect(snap.date).toBe('2026-06-01');
        expect(snap.factors).toHaveLength(7);
    });
});

describe('shouldRecordSnapshot', () => {
    it('is true when there is no history yet', () => {
        expect(shouldRecordSnapshot([])).toBe(true);
    });

    it('is false less than a week after the last snapshot', () => {
        const history = [makeSnapshot('2026-06-01', 60)];
        expect(shouldRecordSnapshot(history, new Date('2026-06-05'))).toBe(false);
    });

    it('is true a week or more after the last snapshot', () => {
        const history = [makeSnapshot('2026-06-01', 60)];
        expect(shouldRecordSnapshot(history, new Date('2026-06-08'))).toBe(true);
    });
});

describe('appendReadinessSnapshot', () => {
    it('caps history at 52 entries, dropping the oldest first', () => {
        let history: ReadinessSnapshot[] = [];
        for (let i = 0; i < 60; i++) {
            const day = new Date('2020-01-01');
            day.setDate(day.getDate() + i * 7); // one entry per week, well-formed dates
            history = appendReadinessSnapshot(history, makeSnapshot(day.toISOString().slice(0, 10), 50 + i));
        }
        expect(history).toHaveLength(52);
        expect(history[history.length - 1].score).toBe(50 + 59);
    });
});

describe('computeReadinessDelta', () => {
    it('is null with fewer than two snapshots', () => {
        expect(computeReadinessDelta([])).toBeNull();
        expect(computeReadinessDelta([makeSnapshot('2026-01-01', 60)])).toBeNull();
    });

    it('reports an improving trend and the factors that moved enough to matter', () => {
        const history = [
            makeSnapshot('2026-01-01', 54, { Liquidity: 40, Concentration: 20 }),
            makeSnapshot('2026-07-01', 72, { Liquidity: 70, Concentration: 20 }),
        ];
        const delta = computeReadinessDelta(history);
        expect(delta?.trend).toBe('improving');
        expect(delta?.scoreDelta).toBe(18);
        expect(delta?.improvedFactors.some(f => f.name === 'Liquidity')).toBe(true);
        // Concentration didn't move, so it should appear in neither list.
        expect(delta?.improvedFactors.some(f => f.name === 'Concentration')).toBe(false);
        expect(delta?.worsenedFactors.some(f => f.name === 'Concentration')).toBe(false);
    });

    it('reports a declining trend when the score drops meaningfully', () => {
        const history = [makeSnapshot('2026-01-01', 80), makeSnapshot('2026-03-01', 60)];
        const delta = computeReadinessDelta(history);
        expect(delta?.trend).toBe('declining');
    });

    it('reports stable when the score barely moves', () => {
        const history = [makeSnapshot('2026-01-01', 70), makeSnapshot('2026-03-01', 71)];
        const delta = computeReadinessDelta(history);
        expect(delta?.trend).toBe('stable');
    });

    it('does not flag a factor move smaller than the meaningful threshold', () => {
        const history = [
            makeSnapshot('2026-01-01', 65, { Debt: 60 }),
            makeSnapshot('2026-03-01', 66, { Debt: 65 }),
        ];
        const delta = computeReadinessDelta(history);
        expect(delta?.improvedFactors.some(f => f.name === 'Debt')).toBe(false);
    });
});
