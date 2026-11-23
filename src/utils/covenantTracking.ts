/**
 * Covenant Tracking — "a business can be profitable and never miss a
 * repayment, and still be in breach of its loan." DSCR (computeDSCR,
 * finance.ts) only ever reports where the business stands RIGHT NOW,
 * checked against Quad360's own generic benchmark (DSCR_THRESHOLDS,
 * 1.25x) -- neither that nor a single snapshot catches a covenant
 * breach coming months ahead, because neither tracks the ratio over
 * time against the SPECIFIC number a lender actually wrote into the
 * facility letter (Loan.covenantMinDSCR).
 *
 * This reconstructs DSCR quarter by quarter and classifies the trend
 * against the loan's own covenant threshold, so a declining trend reads
 * as a forward warning instead of only a backward-looking pass/fail the
 * day the covenant is actually tested. Reuses the same up-to-4-quarters
 * convention, and the same "don't call a trend from a quarter with less
 * data than its neighbours" discipline, as cashFlowHealth.ts's own OCF
 * trajectory -- a quarter with fewer populated months than the others
 * being compared isn't a real signal, it's a data gap.
 *
 * Deliberately self-contained rather than reusing computeAllTimeMonthlyBuckets's
 * revenue/expense buckets for the quarterly reconstruction: DSCR's own
 * Net Operating Income excludes the ENTIRE 'Loan Repayment' category
 * (principal AND interest, so neither double-counts against the
 * theoretical debt-service schedule in the denominator) -- a different,
 * narrower exclusion than the P&L buckets use (principalPortion only,
 * since interest is a real GAAP expense there). Mirrors computeDSCR's
 * own exclusion exactly so "current" and "historical" DSCR are computed
 * the same way.
 */

import { Transaction, Loan } from '../types';
import { loanMonthlyPayment, computeDSCR } from './finance';
import { computeAllTimeMonthlyBuckets, computeQuarterlyTrend } from './trendAnalysis';
import { quarterDateRange } from './cashFlowHealth';
import { localDateStr } from './localDate';

export type CovenantTrendDirection = 'improving' | 'weakening' | 'volatile' | 'flat' | 'insufficient-data';

export interface CovenantQuarterPoint {
    quarter: string;   // 'YYYY-Qn'
    label: string;     // 'Qn YYYY'
    dscr: number | null; // null when no debt service was scheduled that quarter
    monthsWithData: number;
}

export type CovenantSeverity = 'critical' | 'warning' | 'info' | 'none';

export interface CovenantTrackingResult {
    available: boolean;
    reason?: string;
    covenantMinDSCR: number;
    currentDSCR: number;
    inBreach: boolean;
    headroomMultiple: number; // currentDSCR - covenantMinDSCR; negative when already in breach
    // How much revenue could fall, as a % of trailing revenue, before Net
    // Operating Income drops enough to breach the covenant -- holding
    // costs flat, the same conservative "costs rarely fall as fast as
    // sales do" convention growthAffordability.ts already uses elsewhere.
    // Illustrative, not a guarantee -- a real revenue drop usually brings
    // some cost down with it. Null when there's no trailing revenue to
    // measure a % against.
    headroomAsRevenuePct: number | null;
    points: CovenantQuarterPoint[]; // chronological, up to the last 4 quarters with data
    direction: CovenantTrendDirection;
    narrative: string;
    severity: CovenantSeverity;
    // A simple linear projection from the trend's own average quarterly
    // decline -- not a forecast model, just "if this exact pace
    // continues." Set only when the trend is genuinely declining, not
    // already in breach, and the projection lands within 20 quarters (a
    // sanity cap against runaway extrapolation from two noisy points).
    quartersUntilBreach: number | null;
    projectedBreachLabel: string | null;
}

const UNAVAILABLE = (reason: string, covenantMinDSCR: number): CovenantTrackingResult => ({
    available: false, reason, covenantMinDSCR, currentDSCR: 0, inBreach: false,
    headroomMultiple: 0, headroomAsRevenuePct: null, points: [], direction: 'insufficient-data',
    narrative: reason, severity: 'none', quartersUntilBreach: null, projectedBreachLabel: null,
});

// Same exclusion as computeDSCR's own Net Operating Income (finance.ts):
// the whole 'Loan Repayment' category, not just principalPortion, so
// neither principal nor interest double-counts against the theoretical
// debt-service schedule used in the denominator.
function quarterlyNOI(transactions: Transaction[], start: string, end: string): number {
    let income = 0, expense = 0;
    for (const t of transactions) {
        if (!t.date || t.date < start || t.date > end) continue;
        if (t.type === 'income') income += (t.amount ?? 0);
        else if (t.category !== 'Loan Repayment') expense += (t.amount ?? 0);
    }
    return income - expense;
}

// A loan counts as active "as of" a past quarter-end when it had already
// started and hadn't yet closed -- status/closedAt are current-state
// fields, not historically tracked, so this is the closest honest proxy
// this app's data can support for "was this loan on the books then."
// A loan still active today was necessarily active for every past quarter
// since it started. A loan that's since closed only counts for quarters
// before it closed -- and if we don't know exactly when (closedAt unset,
// e.g. a legacy record), the honest move is to leave it out rather than
// assume it was still active, the same "don't let a data gap pose as a
// signal" rule this file's header applies everywhere else.
function totalDebtServiceAsOf(loans: Loan[], quarterEnd: string): number {
    const activeThen = loans.filter(l => {
        if (l.startDate > quarterEnd) return false;
        if (l.status === 'active') return true;
        return l.closedAt != null && l.closedAt >= quarterEnd;
    });
    const monthly = activeThen.reduce((s, l) => s + loanMonthlyPayment(l.principal, l.interestRate, l.termMonths), 0);
    return monthly * 12;
}

function addQuarters(quarterKey: string, n: number): string {
    const [yearStr, qStr] = quarterKey.split('-Q');
    let year = parseInt(yearStr, 10);
    let q = parseInt(qStr, 10) + n;
    while (q > 4) { q -= 4; year += 1; }
    while (q < 1) { q += 4; year -= 1; }
    return `${year}-Q${q}`;
}

function quarterLabel(quarterKey: string): string {
    const [year, q] = quarterKey.split('-Q');
    return `Q${q} ${year}`;
}

export function computeCovenantTracking(
    loan: Loan,
    transactions: Transaction[],
    allLoans: Loan[],
    now: Date = new Date(),
): CovenantTrackingResult {
    const covenantMinDSCR = loan.covenantMinDSCR ?? 0;
    if (covenantMinDSCR <= 0) {
        return UNAVAILABLE("This loan has no DSCR covenant set — add the facility's minimum DSCR from the loan's edit screen to track it.", 0);
    }

    const monthly = computeAllTimeMonthlyBuckets(transactions);
    const quarterly = computeQuarterlyTrend(monthly);
    if (quarterly.length === 0) {
        return UNAVAILABLE('No transaction history yet to measure DSCR against.', covenantMinDSCR);
    }

    const recentQuarters = quarterly.slice(-4);
    const points: CovenantQuarterPoint[] = recentQuarters.map(q => {
        const { start, end } = quarterDateRange(q.quarter);
        const noi = quarterlyNOI(transactions, start, end);
        const debtService = totalDebtServiceAsOf(allLoans, end);
        const dscr = debtService > 0 ? (noi * 4) / debtService : null;
        return { quarter: q.quarter, label: q.label, dscr, monthsWithData: q.monthsWithData };
    });

    // Current DSCR: the same, already-established computeDSCR everywhere
    // else in the app shows for "right now" -- never a second, disagreeing
    // figure for the present moment, only for the historical quarters
    // above (which computeDSCR has no way to reconstruct itself).
    const current = computeDSCR(transactions, allLoans);
    const currentDSCR = current.dscr;
    const inBreach = currentDSCR < covenantMinDSCR;
    const headroomMultiple = currentDSCR - covenantMinDSCR;

    const trailingCutoff = new Date(now);
    trailingCutoff.setFullYear(trailingCutoff.getFullYear() - 1);
    const trailingCutoffStr = localDateStr(trailingCutoff);
    const trailingRevenue = transactions
        .filter(t => t.type === 'income' && t.date >= trailingCutoffStr)
        .reduce((s, t) => s + (t.amount ?? 0), 0);
    const requiredNOI = covenantMinDSCR * current.totalDebtService;
    const headroomAsRevenuePct = trailingRevenue > 0
        ? ((current.netOperatingIncome - requiredNOI) / trailingRevenue) * 100
        : null;

    const scored = points.filter((p): p is CovenantQuarterPoint & { dscr: number } => p.dscr !== null);

    let direction: CovenantTrendDirection = 'insufficient-data';
    let narrative = "Not enough quarters of debt-service history yet to call a covenant trend.";

    // A quarter with fewer populated months than its neighbours here isn't
    // comparable to them -- relative, not an absolute floor, so a business
    // that genuinely logs data evenly still gets a real verdict; see
    // cashFlowHealth.ts's own trajectory check for the full reasoning.
    const maxMonths = scored.length > 0 ? Math.max(...scored.map(p => p.monthsWithData)) : 0;
    const incompleteQuarters = scored.filter(p => p.monthsWithData < maxMonths);

    if (scored.length >= 2 && incompleteQuarters.length > 0) {
        const names = incompleteQuarters.map(p => `${p.label} (${p.monthsWithData}/3 months of data)`).join(', ');
        narrative = `Can't call a reliable covenant trend yet — ${names} has incomplete transaction history, so any apparent swing between quarters may just reflect that gap rather than a real change in DSCR.`;
    } else if (scored.length >= 3) {
        const diffs: number[] = [];
        for (let i = 1; i < scored.length; i++) diffs.push(scored[i].dscr - scored[i - 1].dscr);
        const allImproving = diffs.every(d => d > 0);
        const allWeakening = diffs.every(d => d < 0);
        if (allImproving) {
            direction = 'improving';
            narrative = `DSCR has improved for ${diffs.length} consecutive quarters (${scored[0].dscr.toFixed(2)}x → ${scored[scored.length - 1].dscr.toFixed(2)}x) — moving further from the ${covenantMinDSCR.toFixed(2)}x covenant, not closer to it.`;
        } else if (allWeakening) {
            direction = 'weakening';
            narrative = `DSCR has declined for ${diffs.length} consecutive quarters (${scored[0].dscr.toFixed(2)}x → ${scored[scored.length - 1].dscr.toFixed(2)}x) toward the ${covenantMinDSCR.toFixed(2)}x covenant — worth understanding why before it's tested, not after.`;
        } else {
            const vals = scored.map(p => p.dscr);
            const range = Math.max(...vals) - Math.min(...vals);
            const avgAbs = vals.reduce((s, v) => s + Math.abs(v), 0) / vals.length;
            if (avgAbs > 0 && range > avgAbs * 1.5) {
                direction = 'volatile';
                narrative = 'DSCR has swung significantly between quarters — check for a one-off transaction or seasonality before treating any single quarter as the new normal.';
            } else {
                direction = 'flat';
                narrative = 'DSCR has stayed roughly stable across recent quarters.';
            }
        }
    } else if (scored.length === 2) {
        const diff = scored[1].dscr - scored[0].dscr;
        direction = diff > 0 ? 'improving' : diff < 0 ? 'weakening' : 'flat';
        narrative = diff > 0
            ? 'DSCR improved vs the previous quarter — two points is early, but the direction is worth watching.'
            : diff < 0
                ? `DSCR declined vs the previous quarter, toward the ${covenantMinDSCR.toFixed(2)}x covenant — two points is early, but the direction is worth watching.`
                : 'DSCR held flat vs the previous quarter.';
    }

    // Simple linear projection from the trend's own average quarterly
    // decline -- "if this exact pace continues," not a forecast model.
    // Only when genuinely declining, not already in breach, and the
    // projection lands within a sane horizon.
    let quartersUntilBreach: number | null = null;
    let projectedBreachLabel: string | null = null;
    if (direction === 'weakening' && !inBreach && scored.length >= 2) {
        const avgDeclinePerQuarter = (scored[0].dscr - scored[scored.length - 1].dscr) / (scored.length - 1);
        if (avgDeclinePerQuarter > 0) {
            const quartersToGo = (currentDSCR - covenantMinDSCR) / avgDeclinePerQuarter;
            if (quartersToGo > 0 && quartersToGo <= 20) {
                quartersUntilBreach = Math.ceil(quartersToGo);
                projectedBreachLabel = quarterLabel(addQuarters(scored[scored.length - 1].quarter, quartersUntilBreach));
            }
        }
    }

    let severity: CovenantSeverity;
    if (inBreach) severity = 'critical';
    else if (direction === 'weakening' && quartersUntilBreach !== null && quartersUntilBreach <= 4) severity = 'warning';
    else if (direction === 'weakening') severity = 'info';
    else severity = 'none';

    return {
        available: true,
        covenantMinDSCR, currentDSCR, inBreach, headroomMultiple, headroomAsRevenuePct,
        points, direction, narrative, severity, quartersUntilBreach, projectedBreachLabel,
    };
}
