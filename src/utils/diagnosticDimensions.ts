/**
 * The 8-Dimension Diagnosis — Quad360's Diagnostic Engine should "search
 * for the financial truth behind a business," not just report numbers.
 * This is the assembly layer that turns the eight dimensions a business
 * owner actually needs answered (Cash health, Profitability, Working
 * capital, Debt health, Business performance, Risk & resilience, Decision
 * readiness, Financing readiness) into one consistent structure, each with
 * a real, already-computed Output -- never a new, independently-tuned
 * score for something another screen already measures.
 *
 * Four of the eight (Cash, Profitability, Working Capital, Debt) are
 * genuinely owned here: performFinancialDiagnosis's own FinancialMetrics
 * already carries every number these need, and this screen is already the
 * canonical "full diagnosis" destination for them. The other four
 * (Business performance, Risk & resilience, Decision readiness, Financing
 * readiness) each have a canonical home elsewhere (Scoreboard, Risk
 * Management, Analysis & Decisions, Credit-Worthiness) -- this builds a
 * real, grounded summary from the exact same engines those screens use,
 * then links onward for the full picture, the same teaser-to-canonical
 * -home pattern used everywhere else in this app.
 */

import { Screen } from '../types';
import { DiagnosisResult, RootCauseAnalysis } from './financialDiagnosisEngine';
import { RiskScore } from './finance';
import { DirectionVsStatusResult } from './directionVsStatus';
import { RiskRadar } from './riskRadar';
import { BusinessResilience } from './businessExposure';
import { LendingCapacityEstimate } from './lendingCapacity';

export type DiagnosticStatus = 'strong' | 'watch' | 'high-risk' | 'info';

export interface DiagnosticOutput {
    label: string;
    value: string;
}

export interface DiagnosticDimension {
    key: 'cashHealth' | 'profitability' | 'workingCapital' | 'debtHealth' | 'businessPerformance' | 'riskResilience' | 'decisionReadiness' | 'financingReadiness';
    title: string;
    question: string;
    status: DiagnosticStatus;
    statusLabel: string;
    outputs: DiagnosticOutput[];
    // Early Warning Signal problem titles (already shown in full further
    // down this screen) that belong to this dimension -- named here so the
    // dimension card and the detailed signal are visibly the same finding,
    // not two independent-looking lists.
    relatedProblems: string[];
    seeFullDetail: { text: string; screen: Screen; params?: Record<string, any> } | null;
}

function fmtMoney(currency: string, n: number): string {
    return `${currency}${Math.round(Math.abs(n)).toLocaleString()}`;
}

function fmtRunway(days: number | null): string {
    if (days === null) return 'Not enough data yet';
    if (days >= 999) return 'Very healthy';
    if (days > 365) return 'Over a year';
    if (days > 60) return `${Math.round(days / 30)} months`;
    return `${Math.max(0, Math.round(days))} days`;
}

function problemsFor(diagnoses: RootCauseAnalysis[], dimensions: string[]): string[] {
    return diagnoses.filter(d => dimensions.includes(d.dimension)).map(d => d.problem);
}

// HealthCategory/RiskFactor status -> this file's 3-level status.
function fromCategoryStatus(status: 'strong' | 'watch' | 'high-risk'): DiagnosticStatus { return status; }
function fromFactorStatus(status: 'good' | 'warning' | 'danger'): DiagnosticStatus {
    return status === 'good' ? 'strong' : status === 'warning' ? 'watch' : 'high-risk';
}

export interface BuildDiagnosticDimensionsInput {
    diagnosis: DiagnosisResult;
    risk: RiskScore;
    currency: string;
    directionVsStatus: DirectionVsStatusResult;
    riskRadar: RiskRadar;
    resilience: BusinessResilience;
    reserveCoverageMonths: number | null; // computeFinancialResilience's reserveCoverageMonths, null when not available
    financingReadinessScore: number; // computeFinancingReadinessScore(risk.factors).score
    lendingCapacity: LendingCapacityEstimate | null; // null when too little data (< 5 transactions)
}

export function buildDiagnosticDimensions(input: BuildDiagnosticDimensionsInput): DiagnosticDimension[] {
    const { diagnosis, risk, currency, directionVsStatus, riskRadar, resilience, reserveCoverageMonths, financingReadinessScore, lendingCapacity } = input;
    const m = diagnosis.metrics;
    const factor = (name: string) => risk.factors.find(f => f.name === name);
    const liquidityFactor = factor('Liquidity');
    const profitFactor = factor('Profitability');
    const debtFactor = factor('Debt');
    const wcCategory = diagnosis.categories.find(c => c.key === 'workingCapital');

    const dims: DiagnosticDimension[] = [];

    // 1. Cash health
    dims.push({
        key: 'cashHealth',
        title: 'Cash Health',
        question: 'Do I have money to operate?',
        status: liquidityFactor ? fromFactorStatus(liquidityFactor.status) : 'info',
        statusLabel: fmtRunway(m.runwayDays),
        outputs: [
            { label: 'Cash on hand', value: fmtMoney(currency, m.cashBalance) },
            { label: 'Cash runway', value: fmtRunway(m.runwayDays) },
            { label: 'Months of reserve', value: reserveCoverageMonths !== null ? (isFinite(reserveCoverageMonths) ? `${reserveCoverageMonths.toFixed(1)} months` : 'No ongoing burn') : 'Not enough data yet' },
            { label: 'Operating cash flow', value: `${m.operatingCashFlow >= 0 ? '+' : '-'}${fmtMoney(currency, m.operatingCashFlow)}/mo` },
        ],
        relatedProblems: problemsFor(diagnosis.diagnoses, ['liquidity', 'cashFlow']),
        seeFullDetail: { text: 'Full cash flow forecast & 13-week outlook', screen: 'cashflow' },
    });

    // 2. Profitability
    dims.push({
        key: 'profitability',
        title: 'Profitability',
        question: 'Am I actually making money?',
        status: profitFactor ? fromFactorStatus(profitFactor.status) : 'info',
        statusLabel: `${m.profitMargin.toFixed(1)}% margin`,
        outputs: [
            { label: 'Revenue', value: fmtMoney(currency, m.totalRevenue) },
            { label: 'Expenses', value: fmtMoney(currency, m.totalExpenses) },
            { label: 'Estimated net profit', value: `${m.netProfit >= 0 ? '' : '-'}${fmtMoney(currency, m.netProfit)}` },
            { label: 'Profit margin', value: `${m.profitMargin.toFixed(1)}%` },
        ],
        relatedProblems: problemsFor(diagnosis.diagnoses, ['profitability', 'efficiency']),
        seeFullDetail: { text: 'Full margin & cost breakdown', screen: 'reports', params: { reportSection: 'statements', reportTab: 'pnl' } },
    });

    // 3. Working capital
    dims.push({
        key: 'workingCapital',
        title: 'Working Capital',
        question: 'Is my money trapped in the business?',
        status: wcCategory ? fromCategoryStatus(wcCategory.status) : 'info',
        statusLabel: `${Math.round(m.cashConversionCycleDays)}-day cash cycle`,
        outputs: [
            { label: 'Customers owe you', value: fmtMoney(currency, m.accountsReceivable) },
            { label: 'You owe suppliers', value: fmtMoney(currency, m.accountsPayable) },
            { label: 'Stock on hand', value: fmtMoney(currency, m.inventoryValue) },
            { label: 'Cash conversion cycle', value: `${Math.round(m.cashConversionCycleDays)} days` },
        ],
        relatedProblems: problemsFor(diagnosis.diagnoses, ['workingCapital', 'inventory']),
        seeFullDetail: { text: 'Full working capital & inventory detail', screen: 'reports', params: { reportSection: 'statements', reportTab: 'workingcapitalhealth' } },
    });

    // 4. Debt health
    dims.push({
        key: 'debtHealth',
        title: 'Debt Health',
        question: 'Can my business handle what it owes?',
        status: debtFactor ? fromFactorStatus(debtFactor.status) : 'info',
        statusLabel: m.monthlyDebtService > 0 ? `${m.dscr.toFixed(2)}x coverage` : 'No active debt',
        outputs: [
            { label: 'Monthly debt obligations', value: fmtMoney(currency, m.monthlyDebtService) },
            { label: 'Debt Service Coverage Ratio', value: m.monthlyDebtService > 0 ? `${m.dscr.toFixed(2)}x` : 'N/A' },
            { label: 'Repayment capacity', value: m.monthlyDebtService > 0 ? (m.dscrStatus === 'healthy' ? 'Comfortable' : m.dscrStatus === 'warning' ? 'Tight' : 'Insufficient') : 'No debt to service' },
        ],
        relatedProblems: problemsFor(diagnosis.diagnoses, ['debt']),
        seeFullDetail: { text: 'Full DSCR, rate shock & repayment strategy', screen: 'loans' },
    });

    // 5. Business performance
    const improving = directionVsStatus.rows.filter(r => r.direction === 'improving').length;
    const declining = directionVsStatus.rows.filter(r => r.direction === 'deteriorating').length;
    dims.push({
        key: 'businessPerformance',
        title: 'Business Performance',
        question: 'Is the business getting better or worse?',
        status: !directionVsStatus.directionAvailable ? 'info' : declining > improving ? 'high-risk' : declining > 0 ? 'watch' : 'strong',
        statusLabel: !directionVsStatus.directionAvailable ? 'Not enough history yet' : `${improving} improving, ${declining} declining`,
        outputs: directionVsStatus.directionAvailable
            ? directionVsStatus.rows.map(r => ({ label: r.label, value: r.direction ? `${r.direction === 'improving' ? '↑' : r.direction === 'deteriorating' ? '↓' : '→'} ${r.directionEvidence ?? r.direction}` : 'No baseline yet' }))
            : [{ label: 'Status', value: directionVsStatus.directionUnavailableReason ?? 'Needs more transaction history' }],
        relatedProblems: [],
        seeFullDetail: { text: 'Full Direction vs. Status & Quality of Growth', screen: 'scoreboard' },
    });

    // 6. Risk and resilience
    dims.push({
        key: 'riskResilience',
        title: 'Risk & Resilience',
        question: 'What could hurt my business next?',
        status: riskRadar.overallLevel === 'high' ? 'high-risk' : riskRadar.overallLevel === 'medium' ? 'watch' : 'strong',
        statusLabel: `${riskRadar.overallLevel === 'high' ? 'High' : riskRadar.overallLevel === 'medium' ? 'Moderate' : 'Low'} risk`,
        outputs: [
            ...(riskRadar.topRisks.length > 0 ? [{ label: 'Biggest risk', value: riskRadar.topRisks[0].summary }] : [{ label: 'Biggest risk', value: 'Nothing standing out right now' }]),
            { label: 'Shock resilience', value: `${resilience.score}/100 (${resilience.band})` },
            ...(resilience.topConcerns.length > 0 ? [{ label: 'Top exposure', value: resilience.topConcerns[0].detail }] : []),
        ],
        relatedProblems: problemsFor(diagnosis.diagnoses, ['concentration']),
        seeFullDetail: { text: 'Full risk radar & shock resilience', screen: 'risk-management' },
    });

    // 7. Decision readiness -- not a current-state score (there's no
    // "decision" to score until the owner has one in mind), so this is a
    // launcher into the real, interactive tool rather than a static output.
    dims.push({
        key: 'decisionReadiness',
        title: 'Decision Readiness',
        question: 'Can I afford to make this move?',
        status: 'info',
        statusLabel: 'Check before you commit',
        outputs: [
            { label: 'What it checks', value: 'A specific hire, purchase, loan, discount, or expansion against your real cash flow -- not a general score.' },
        ],
        relatedProblems: [],
        seeFullDetail: { text: 'Pressure-test a real decision → Analysis & Decisions', screen: 'analysis', params: { tab: 'decide' } },
    });

    // 8. Financing readiness
    dims.push({
        key: 'financingReadiness',
        title: 'Financing Readiness',
        question: 'Should I borrow, and what could I qualify for?',
        status: !lendingCapacity ? 'info' : lendingCapacity.conclusion === 'risk' ? 'high-risk' : lendingCapacity.conclusion === 'improve' ? 'watch' : lendingCapacity.conclusion === 'insufficient-data' ? 'info' : 'strong',
        statusLabel: !lendingCapacity ? 'Not enough data yet' : lendingCapacity.tierLabel,
        outputs: !lendingCapacity
            ? [{ label: 'Status', value: 'Log at least 5 transactions to estimate this.' }]
            : [
                { label: 'Readiness score', value: `${Math.round(financingReadinessScore)}/100` },
                { label: 'Estimated capacity', value: `${fmtMoney(currency, lendingCapacity.minAmount)}–${fmtMoney(currency, lendingCapacity.maxAmount)}` },
                { label: 'Verdict', value: lendingCapacity.reason },
            ],
        relatedProblems: [],
        seeFullDetail: { text: 'Full financing readiness & matched options', screen: 'credit-worthiness' },
    });

    return dims;
}
