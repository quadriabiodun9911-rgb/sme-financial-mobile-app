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
import { Transaction, Loan, Invoice, Budget } from '../types';
import { DiagnosisResult, RootCauseAnalysis, INDUSTRY_BENCHMARKS } from './financialDiagnosisEngine';
import { RiskScore, computeCashFlowForecast } from './finance';
import { DirectionVsStatusResult } from './directionVsStatus';
import { RiskRadar } from './riskRadar';
import { BusinessResilience } from './businessExposure';
import { LendingCapacityEstimate } from './lendingCapacity';

export type DiagnosticStatus = 'strong' | 'watch' | 'high-risk' | 'info';

export interface DiagnosticOutput {
    label: string;
    value: string;
}

// The "what the business owner should actually see" format: not a wall of
// ratios but a short diagnosis narrative -- two headline figures, what they
// mean together, why that matters for the business, and what to actually do
// about it. Only built for the dimensions the Diagnostic Engine's strongest
// first version should focus on (cash health, profitability, debt pressure,
// financial trends); the other four stay output-only until the data behind
// a narrative (inventory turns, receivables aging, lender terms) is
// reliably available.
export interface DiagnosticNarrative {
    headline: string;
    metrics: DiagnosticOutput[]; // exactly the 2 figures the headline math is built from
    whatThisMeans: string;
    whyItMatters: string;
    recommendedSteps: string[];
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
    narrative?: DiagnosticNarrative;
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
    // Only needed to build the "known upcoming payments" figure in Cash
    // Health's narrative via computeCashFlowForecast -- the same real
    // 13-week forecast the Cash Flow screen uses, never a second estimate.
    transactions: Transaction[];
    loans: Loan[];
    invoices: Invoice[];
    budgets: Budget[];
}

export function buildDiagnosticDimensions(input: BuildDiagnosticDimensionsInput): DiagnosticDimension[] {
    const { diagnosis, risk, currency, directionVsStatus, riskRadar, resilience, reserveCoverageMonths, financingReadinessScore, lendingCapacity, transactions, loans, invoices, budgets } = input;
    const m = diagnosis.metrics;
    const factor = (name: string) => risk.factors.find(f => f.name === name);
    const liquidityFactor = factor('Liquidity');
    const profitFactor = factor('Profitability');
    const debtFactor = factor('Debt');
    const wcCategory = diagnosis.categories.find(c => c.key === 'workingCapital');

    const dims: DiagnosticDimension[] = [];

    // 1. Cash health
    // "Known upcoming payments" -- the next ~4 weeks of this business's own
    // 13-week cash flow forecast (recurring expenses, loan payments,
    // committed budget, invoice-linked outflows), not a fabricated figure.
    const forecastWeeks = computeCashFlowForecast(transactions, loans, invoices, budgets, m.cashBalance);
    const upcomingPayments = forecastWeeks.slice(0, 4).reduce((s, w) => s + w.projectedOutflow, 0);
    const cashAfterCommitments = m.cashBalance - upcomingPayments;
    const hasInventory = m.inventoryValue > 0;
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
        narrative: {
            headline: cashAfterCommitments < 0
                ? 'Your cash may be under pressure'
                : (m.runwayDays !== null && m.runwayDays < 30)
                ? 'Your cash position needs attention'
                : 'Your cash position looks healthy',
            metrics: [
                { label: 'Bank balance', value: fmtMoney(currency, m.cashBalance) },
                { label: 'Known upcoming payments', value: fmtMoney(currency, upcomingPayments) },
            ],
            whatThisMeans: cashAfterCommitments >= 0
                ? `Your bank balance is ${fmtMoney(currency, m.cashBalance)}, but after the known ${fmtMoney(currency, upcomingPayments)} in upcoming payments, only ${fmtMoney(currency, cashAfterCommitments)} remains before other expenses, reserves and obligations.`
                : `Your bank balance is ${fmtMoney(currency, m.cashBalance)}, which is less than the ${fmtMoney(currency, upcomingPayments)} already committed in upcoming payments -- a shortfall of ${fmtMoney(currency, Math.abs(cashAfterCommitments))}.`,
            whyItMatters: cashAfterCommitments < 0
                ? "You may not have enough to cover what's already committed. Prioritise collecting what you're owed or delay non-essential spending now, before a payment is missed."
                : cashAfterCommitments < upcomingPayments
                ? `Spending further now${hasInventory ? ', such as buying additional stock,' : ''} could leave you short for rent, suppliers, wages or loan repayments.`
                : 'This leaves a reasonable buffer, but keep tracking upcoming commitments closely rather than assuming the balance is all spare.',
            recommendedSteps: [
                'Confirm all upcoming payments are accurate and complete.',
                ...(hasInventory ? ['Check how quickly your current stock converts into cash.'] : []),
                'Forecast the next 13 weeks of cash flow.',
                hasInventory ? 'Determine how much you can safely spend before purchasing more stock.' : 'Determine how much you can safely commit before taking on new spending.',
            ],
        },
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
        narrative: {
            headline: m.netProfit < 0
                ? 'Your business is currently losing money'
                : m.profitMargin < INDUSTRY_BENCHMARKS.profitMargin
                ? 'Your profit margin may be slipping'
                : 'Your profitability looks solid',
            metrics: [
                { label: 'Revenue', value: fmtMoney(currency, m.totalRevenue) },
                { label: 'Net profit', value: `${m.netProfit >= 0 ? '' : '-'}${fmtMoney(currency, m.netProfit)}` },
            ],
            whatThisMeans: `Your revenue is ${fmtMoney(currency, m.totalRevenue)} against ${fmtMoney(currency, m.totalExpenses)} in expenses, leaving ${m.netProfit >= 0 ? `a net profit of ${fmtMoney(currency, m.netProfit)}` : `a net loss of ${fmtMoney(currency, m.netProfit)}`} -- a ${m.profitMargin.toFixed(1)}% margin.`,
            whyItMatters: m.netProfit < 0
                ? "You're spending more than you're bringing in. Left unaddressed, this draws down cash every month until reserves run out."
                : m.profitMargin < INDUSTRY_BENCHMARKS.profitMargin
                ? 'At this margin, a small rise in costs or a slow sales month could erase your profit entirely.'
                : 'This gives you room to absorb a cost increase or a slow month and stay profitable.',
            recommendedSteps: [
                'Review your biggest expense categories for quick wins.',
                'Check whether recent pricing still covers your real costs.',
                "Compare this month's margin against your own trend, not just an industry benchmark.",
            ],
        },
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
        narrative: m.monthlyDebtService > 0 ? {
            headline: m.dscrStatus === 'danger'
                ? 'Your debt payments may be more than your cash flow can handle'
                : m.dscrStatus === 'warning'
                ? "Your debt is manageable now, but there's little room to spare"
                : 'Your business comfortably covers what it owes',
            metrics: [
                { label: 'Monthly debt payments', value: fmtMoney(currency, m.monthlyDebtService) },
                { label: 'Coverage ratio', value: `${m.dscr.toFixed(2)}x` },
            ],
            whatThisMeans: `Your monthly debt payments are ${fmtMoney(currency, m.monthlyDebtService)}, covered ${m.dscr.toFixed(2)}x by operating cash flow -- a ratio below 1.25x means thin coverage, and below 1.0x means cash flow alone doesn't cover the payment.`,
            whyItMatters: m.dscrStatus === 'danger'
                ? 'At this coverage, a slow month could mean missing a repayment. Talk to your lender about restructuring before it happens, not after.'
                : m.dscrStatus === 'warning'
                ? "There isn't much room to absorb a slow month without the repayment becoming a strain."
                : 'Your cash flow comfortably covers what you owe each month, even allowing for some month-to-month variation.',
            recommendedSteps: [
                'Confirm your next repayment dates and amounts.',
                'Check how a slower sales month would affect your coverage ratio.',
                ...(m.dscrStatus !== 'healthy' ? ["Talk to your lender about restructuring before a payment is missed."] : []),
            ],
        } : {
            headline: 'You currently have no active debt to service',
            metrics: [
                { label: 'Monthly debt payments', value: fmtMoney(currency, 0) },
                { label: 'Coverage ratio', value: 'N/A' },
            ],
            whatThisMeans: "You're not carrying any active loan repayments right now.",
            whyItMatters: "This isn't a current risk, but it's worth modelling before taking on any debt -- know what a repayment would do to your monthly cash flow before you apply.",
            recommendedSteps: [
                "Model what a loan's repayment would do to your monthly cash flow before applying.",
                'Decide the maximum monthly repayment your cash flow could absorb without strain.',
            ],
        },
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
        narrative: directionVsStatus.directionAvailable ? {
            headline: declining > improving
                ? 'More is moving in the wrong direction than the right one'
                : declining > 0
                ? 'Mostly positive, but something is slipping'
                : 'The business is trending in the right direction',
            metrics: [
                { label: 'Improving', value: `${improving}` },
                { label: 'Declining', value: `${declining}` },
            ],
            whatThisMeans: `Of the trends being tracked, ${improving} are improving and ${declining} are getting worse right now.`,
            whyItMatters: declining > improving
                ? 'Left unaddressed, this usually shows up in cash and profit within a few months -- worth identifying the cause now rather than after it spreads.'
                : declining > 0
                ? "Most of the business is moving the right way, but keep an eye on what's slipping before it affects the rest."
                : 'A good time to plan growth rather than just defend cash -- see Decision Readiness before committing new spend.',
            recommendedSteps: [
                'Identify exactly which trend is declining and why (see the breakdown below).',
                'Decide whether it’s seasonal, one-off, or a real shift before reacting.',
                'Set a check-in date to confirm whether it has turned around.',
            ],
        } : undefined,
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
