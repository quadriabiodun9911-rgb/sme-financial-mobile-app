/**
 * Direction vs Status — a business has two questions a single health score
 * conflates: "where are we today" and "where are we heading". A business
 * can be fully current on every obligation (status: healthy) while the
 * underlying trend is worsening month over month (direction: deteriorating)
 * — the single Financial Health score alone can't show that split, and a
 * business that's improving off a weak base looks identical to one that's
 * deteriorating from a strong one until the two axes are shown separately.
 *
 * Deliberately a pure combinator, not a new scoring model:
 *  - Status per row is computeRiskScore's own RiskFactor (finance.ts) —
 *    same status level and same plain-English explanation the Scoreboard's
 *    Financial Health breakdown already shows for that factor, so this view
 *    can never quietly disagree with it.
 *  - Direction per row is computeQualityOfGrowth's own GrowthSignal
 *    (qualityOfGrowth.ts) — same year-over-year judgment (already weighed
 *    against revenue growth, not a naive "did the balance go up" check) the
 *    Quality of Growth tab's own flags and verdict are built from.
 *  - Direction is only ever `null` when computeQualityOfGrowth itself has
 *    no year-over-year baseline to judge from (under two full years of
 *    history, or no prior-period value for that specific signal) — this
 *    module never estimates a shorter-window substitute, which would be a
 *    different, less-tested judgment than the one Quality of Growth backs
 *    everywhere else it's shown.
 *
 * Four rows, not the generic "everything a health score covers": Revenue is
 * left out on purpose. For every other row, status (a level today) and
 * direction (a trend over time) are genuinely two different questions with
 * two different answers. For revenue alone this app has no separate
 * "current status" concept apart from its own trend — showing it twice
 * would look like independent confirmation when it's the same number restated.
 */

import { RiskScore, RiskFactor } from './finance';
import { QualityOfGrowthResult, GrowthDirection } from './qualityOfGrowth';

export type StatusLevel = RiskFactor['status'];

export interface DirectionVsStatusRow {
    key: 'profitability' | 'liquidity' | 'debt' | 'receivables';
    label: string;
    statusLevel: StatusLevel;
    // Verbatim RiskFactor.explanation — never a second, independently
    // worded status line for the same factor.
    statusExplanation: string;
    direction: GrowthDirection | null;
    // e.g. "+18% year over year" / "−6% year over year"; null alongside
    // direction === null.
    directionEvidence: string | null;
    // A flag from computeQualityOfGrowth that names this same signal, when
    // one fired — the "why" behind a deteriorating direction, verbatim.
    directionFlag: string | null;
}

export interface DirectionVsStatusResult {
    rows: DirectionVsStatusRow[];
    directionAvailable: boolean;
    directionUnavailableReason: string | null;
    periodLabel: string | null; // e.g. "2026 vs 2025", set only when directionAvailable
}

const ROW_DEFS: { key: DirectionVsStatusRow['key']; label: string; factorName: string; signalKey: 'profit' | 'cash' | 'debt' | 'receivables'; flagKeyword: string }[] = [
    { key: 'profitability', label: 'Profitability', factorName: 'Profitability', signalKey: 'profit', flagKeyword: 'profit' },
    { key: 'liquidity', label: 'Cash', factorName: 'Liquidity', signalKey: 'cash', flagKeyword: 'cash' },
    { key: 'debt', label: 'Debt', factorName: 'Debt', signalKey: 'debt', flagKeyword: 'debt' },
    { key: 'receivables', label: 'Receivables', factorName: 'Working Capital', signalKey: 'receivables', flagKeyword: 'receivable' },
];

function directionEvidenceFor(growthPct: number | null): string | null {
    if (growthPct === null) return null;
    const sign = growthPct >= 0 ? '+' : '−';
    return `${sign}${Math.abs(growthPct).toFixed(0)}% year over year`;
}

export function computeDirectionVsStatus(risk: RiskScore, growthQuality: QualityOfGrowthResult): DirectionVsStatusResult {
    const rows: DirectionVsStatusRow[] = ROW_DEFS.map(def => {
        const factor = risk.factors.find(f => f.name === def.factorName);
        const signal = growthQuality.available ? growthQuality.signals.find(s => s.key === def.signalKey) : undefined;
        const flag = growthQuality.available
            ? growthQuality.flags.find(f => f.toLowerCase().includes(def.flagKeyword)) ?? null
            : null;

        return {
            key: def.key,
            label: def.label,
            // Every RiskFactor above is always present in computeRiskScore's
            // output (a fixed list of factors, not a filtered one) — the
            // fallback here is just to satisfy the type checker, never
            // expected to actually be hit.
            statusLevel: factor?.status ?? 'warning',
            statusExplanation: factor?.explanation ?? 'Not enough data yet.',
            direction: signal?.direction ?? null,
            directionEvidence: signal ? directionEvidenceFor(signal.growthPct) : null,
            directionFlag: flag,
        };
    });

    return {
        rows,
        directionAvailable: growthQuality.available,
        directionUnavailableReason: growthQuality.available ? null : (growthQuality.reason ?? 'Not enough history yet to judge a year-over-year direction.'),
        periodLabel: growthQuality.available ? growthQuality.periodLabel : null,
    };
}
