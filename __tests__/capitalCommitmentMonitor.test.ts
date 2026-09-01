import { computeCommitmentMonitor } from '../src/utils/capitalCommitmentMonitor';
import { CapitalCommitment } from '../src/types';

function makeCommitment(overrides: Partial<CapitalCommitment>): CapitalCommitment {
    return {
        id: 'c1',
        name: 'New POS system',
        amountApproved: 10000000,
        purpose: 'Reduce manual processing time',
        approvedDate: '2026-01-01',
        kpis: [],
        status: 'not-started',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        ...overrides,
    };
}

describe('computeCommitmentMonitor', () => {
    it('reports not-started with no fabricated decision when no KPIs are set', () => {
        const result = computeCommitmentMonitor(makeCommitment({ kpis: [] }), new Date('2026-02-01'));
        expect(result.overallAchievementPct).toBeNull();
        expect(result.suggestedStatus).toBe('not-started');
        expect(result.suggestedDecision).toBeNull();
        expect(result.decisionRationale).toMatch(/no kpis set/i);
    });

    it('computes a real (if low) achievement percentage once a target is set, even at actual=0 -- distinct from having no target at all', () => {
        const result = computeCommitmentMonitor(makeCommitment({
            kpis: [{ id: 'k1', name: 'Monthly cost savings', target: 500000, actual: 0 }],
        }), new Date('2026-02-01'));
        expect(result.overallAchievementPct).toBe(0);
        expect(result.suggestedStatus).toBe('off-track');
    });

    it('suggests "scale" when a KPI meets or exceeds its target', () => {
        const result = computeCommitmentMonitor(makeCommitment({
            approvedDate: '2025-01-01',
            kpis: [{ id: 'k1', name: 'Cost reduction', target: 500000, actual: 480000 }],
        }), new Date('2026-01-01'));
        expect(result.overallAchievementPct).toBeCloseTo(96, 0);
        expect(result.suggestedStatus).toBe('on-track');
        expect(result.suggestedDecision).toBe('scale');
    });

    it('suggests "continue" for solid but incomplete progress', () => {
        const result = computeCommitmentMonitor(makeCommitment({
            approvedDate: '2025-01-01',
            kpis: [{ id: 'k1', name: 'Cost reduction', target: 500000, actual: 350000 }],
        }), new Date('2026-01-01'));
        expect(result.suggestedDecision).toBe('continue');
    });

    it('suggests "adjust" and names the worst-performing KPI for partial, mixed progress', () => {
        const result = computeCommitmentMonitor(makeCommitment({
            approvedDate: '2025-01-01',
            kpis: [
                { id: 'k1', name: 'Cost reduction', target: 500000, actual: 300000 },
                { id: 'k2', name: 'Staff adoption', target: 100, actual: 15 },
            ],
        }), new Date('2026-01-01'));
        expect(result.suggestedDecision).toBe('adjust');
        expect(result.decisionRationale).toMatch(/staff adoption/i);
    });

    it('suggests "pause", never "stop", for genuinely poor progress -- stop is always the owner\'s own call', () => {
        const result = computeCommitmentMonitor(makeCommitment({
            approvedDate: '2025-01-01',
            kpis: [{ id: 'k1', name: 'Cost reduction', target: 500000, actual: 50000 }],
        }), new Date('2026-01-01'));
        expect(result.suggestedDecision).toBe('pause');
        expect(result.suggestedDecision).not.toBe('stop' as any);
    });

    it('withholds a decision as "too early to judge" when a target date hasn\'t arrived yet and achievement is still modest', () => {
        const result = computeCommitmentMonitor(makeCommitment({
            approvedDate: '2026-01-01',
            targetDate: '2026-06-01',
            kpis: [{ id: 'k1', name: 'Cost reduction', target: 500000, actual: 100000 }],
        }), new Date('2026-02-01'));
        expect(result.suggestedDecision).toBeNull();
        expect(result.decisionRationale).toMatch(/too early to judge/i);
    });

    it('never shows "off-track"/"at-risk" status while it\'s still too early to judge -- would contradict the "too early" rationale', () => {
        const result = computeCommitmentMonitor(makeCommitment({
            approvedDate: '2026-01-01',
            targetDate: '2026-04-01',
            kpis: [{ id: 'k1', name: 'Cost reduction', target: 500000, actual: 0 }],
        }), new Date('2026-01-02'));
        expect(result.suggestedDecision).toBeNull();
        expect(result.suggestedStatus).toBe('not-started');
    });

    it('still suggests "scale" for early, genuine over-performance even before the target date arrives', () => {
        const result = computeCommitmentMonitor(makeCommitment({
            approvedDate: '2026-01-01',
            targetDate: '2026-06-01',
            kpis: [{ id: 'k1', name: 'Cost reduction', target: 500000, actual: 480000 }],
        }), new Date('2026-02-01'));
        expect(result.suggestedDecision).toBe('scale');
    });

    it('gives a decision once the target date has passed, even at modest achievement', () => {
        const result = computeCommitmentMonitor(makeCommitment({
            approvedDate: '2026-01-01',
            targetDate: '2026-02-01',
            kpis: [{ id: 'k1', name: 'Cost reduction', target: 500000, actual: 100000 }],
        }), new Date('2026-03-01'));
        expect(result.suggestedDecision).not.toBeNull();
        expect(result.suggestedDecision).toBe('pause');
    });

    it('averages achievement across multiple KPIs with real targets, ignoring KPIs with a zero target', () => {
        const result = computeCommitmentMonitor(makeCommitment({
            approvedDate: '2025-01-01',
            kpis: [
                { id: 'k1', name: 'A', target: 100, actual: 80 },
                { id: 'k2', name: 'B', target: 200, actual: 200 },
                { id: 'k3', name: 'C', target: 0, actual: 999 },
            ],
        }), new Date('2026-01-01'));
        // (80% + 100%) / 2 = 90%, K3 excluded entirely (no target to judge against)
        expect(result.overallAchievementPct).toBeCloseTo(90, 0);
        expect(result.kpiProgress.find(k => k.name === 'C')?.achievementPct).toBeNull();
    });
});
