/**
 * Quick Health Check — the landing page's 60-second, no-signup teaser.
 * Deliberately NOT the real Business Health Score or Financing Readiness
 * Score (both blend 8 weighted factors built from real transaction
 * history and DSCR — see finance.ts / metricIntelligence.ts). This
 * computes only what three raw numbers can honestly support: a simple
 * cash runway, an expense ratio, and a risk band — then hands off to the
 * real product (sign up / guest demo) for anything deeper. It never
 * invents a 0-100 score, and never phrases the financing preview as
 * anything resembling a lender's actual assessment.
 *
 * Pure and synchronous — this runs entirely client-side on the landing
 * page. Nothing here is sent anywhere, so "your data stays private" is
 * literally true for this widget, not just marketing copy.
 */

import { INDUSTRY_BENCHMARKS } from './financialDiagnosisEngine';

export type QuickRiskStatus = 'green' | 'yellow' | 'red';

export interface QuickHealthCheckInput {
    lastMonthRevenue: number;
    monthlyExpenses: number;
    cashInBank: number;
}

export interface QuickHealthCheckResult {
    runwayMonths: number; // Infinity when not currently burning cash (revenue >= expenses) -- same "Infinity, not a sentinel" convention computeCashRunway uses elsewhere
    isProfitable: boolean; // revenue >= expenses last month
    netMonthlyBurn: number; // max(expenses - revenue, 0)
    expenseRatioPct: number | null; // null when revenue is 0 -- a ratio against zero revenue isn't a real number
    riskStatus: QuickRiskStatus;
    riskLabel: string;
    diagnosis: string; // one sentence naming the single biggest driver, same "score -> diagnosis" shape the real product's Metric Intelligence panels use
    financingPreview: string; // qualitative only, explicitly caveated -- never a fabricated score
}

// Reuses the exact same runway-day thresholds diagnoseLiquidity and every
// real Cash Runway "Why?" trigger already key off (INDUSTRY_BENCHMARKS,
// financialDiagnosisEngine.ts) -- converted to months since this widget
// only has a single month's burn rate to work with, not the daily rate
// computeCashRunway derives from real transaction history.
const SAFE_MONTHS = INDUSTRY_BENCHMARKS.runwayDaysSafe / 30;
const CRITICAL_MONTHS = INDUSTRY_BENCHMARKS.runwayDaysCritical / 30;

export function computeQuickHealthCheck(input: QuickHealthCheckInput): QuickHealthCheckResult {
    const { lastMonthRevenue, monthlyExpenses, cashInBank } = input;

    const isProfitable = monthlyExpenses <= lastMonthRevenue;
    const netMonthlyBurn = Math.max(monthlyExpenses - lastMonthRevenue, 0);
    const runwayMonths = netMonthlyBurn > 0 ? cashInBank / netMonthlyBurn : Infinity;
    const expenseRatioPct = lastMonthRevenue > 0 ? (monthlyExpenses / lastMonthRevenue) * 100 : null;

    let riskStatus: QuickRiskStatus;
    let riskLabel: string;
    if (!Number.isFinite(runwayMonths) || runwayMonths >= SAFE_MONTHS) {
        riskStatus = 'green';
        riskLabel = 'Stable';
    } else if (runwayMonths >= CRITICAL_MONTHS) {
        riskStatus = 'yellow';
        riskLabel = 'Watch';
    } else {
        riskStatus = 'red';
        riskLabel = 'Action Required';
    }

    let diagnosis: string;
    if (isProfitable) {
        diagnosis = expenseRatioPct !== null
            ? `Revenue currently covers expenses, with ${expenseRatioPct.toFixed(0)}% of revenue going to costs — the priority now is protecting that margin, not survival.`
            : 'Revenue currently covers expenses — the priority now is protecting that margin, not survival.';
    } else if (expenseRatioPct !== null) {
        diagnosis = `Monthly expenses are consuming ${expenseRatioPct.toFixed(0)}% of revenue, leaving limited operating flexibility — that gap is what's burning through cash.`;
    } else {
        diagnosis = 'Monthly expenses currently exceed revenue with no revenue recorded yet — that gap is what\'s burning through cash.';
    }

    let financingPreview: string;
    if (riskStatus === 'green') {
        financingPreview = 'Your basic numbers show the kind of cash discipline lenders respond well to.';
    } else if (riskStatus === 'yellow') {
        financingPreview = 'You\'re showing some of what lenders look for, but tighter expense control and a larger cash cushion would strengthen your position.';
    } else {
        financingPreview = 'Lenders typically want healthy cash coverage and controlled expenses before extending credit — your numbers suggest more groundwork is needed first.';
    }

    return { runwayMonths, isProfitable, netMonthlyBurn, expenseRatioPct, riskStatus, riskLabel, diagnosis, financingPreview };
}
