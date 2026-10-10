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
import { Transaction, Loan, Invoice, Budget, GoalType } from '../types';
import { DiagnosisResult, RootCauseAnalysis, INDUSTRY_BENCHMARKS } from './financialDiagnosisEngine';
import { computeCashFlowForecast } from './finance';
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

// "Your Business Health Report" -- the single headline finding the owner
// should see first, before the 8-dimension breakdown: one plain-language
// diagnosis (what was found, why it matters, what to do, and the one
// decision it bears on) built from whichever of the four priority
// dimensions (cash, profitability, debt, trends) is currently most
// urgent -- never a fifth, independently-written assessment.
export interface BusinessHealthReport {
    status: 'critical' | 'warning' | 'healthy';
    statusLabel: string;
    sourceDimension: 'cashHealth' | 'profitability' | 'debtHealth' | 'businessPerformance';
    whatWeFound: string;
    metrics: DiagnosticOutput[];
    whyThisMatters: string;
    nextSteps: string[];
    nextDecision: { text: string; screen: Screen; params?: Record<string, any> };
    // Which trackable GoalType (goals.ts) "What you should do next" above
    // actually corresponds to, if any -- lets the screen offer a one-tap
    // "set this up as a goal" straight into a pre-filled, still-editable
    // Goal form (goalDefaults() already grounds the target in this
    // business's own pattern) instead of making the owner re-derive the
    // same plan by hand on a different screen. Null when nothing in
    // goals.ts cleanly represents this finding (debt reduction and
    // trend-reversal have no dedicated GoalType today) -- never forced
    // into the closest-but-wrong type.
    suggestedGoalType: GoalType | null;
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

// HealthCategory status -> this file's 3-level status.
function fromCategoryStatus(status: 'strong' | 'watch' | 'high-risk'): DiagnosticStatus { return status; }

// Same thresholds risk.factors' own Profitability/Liquidity factors use
// (finance.ts: margin >= 20 good, runway >= 6 months good, etc.) -- but
// applied to THIS MONTH's own metrics (m), never risk.factors' all-time
// aggregate. risk.factors is computed from EVERY transaction ever recorded
// (computeFinance has no date filter), which can disagree with this screen's
// own current-month numbers -- a dimension's status badge used to come from
// that all-time figure while its narrative quoted this month's, so a
// business with a strong current month but a weaker history could see
// "Needs attention" right above numbers that plainly look fine. Deriving
// status from the same `m` the narrative already reads keeps the two always
// in agreement.
function profitabilityStatus(profitMarginPct: number): DiagnosticStatus {
    return profitMarginPct >= 20 ? 'strong' : profitMarginPct >= 0 ? 'watch' : 'high-risk';
}
function cashHealthStatus(runwayDays: number | null): DiagnosticStatus {
    if (runwayDays === null) return 'info';
    const runwayMonths = runwayDays / 30;
    return runwayMonths >= 6 ? 'strong' : runwayMonths >= 3 ? 'watch' : 'high-risk';
}

export interface BuildDiagnosticDimensionsInput {
    diagnosis: DiagnosisResult;
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

export interface BuildDiagnosticDimensionsResult {
    dimensions: DiagnosticDimension[];
    report: BusinessHealthReport;
}

export function buildDiagnosticDimensions(input: BuildDiagnosticDimensionsInput): BuildDiagnosticDimensionsResult {
    const { diagnosis, currency, directionVsStatus, riskRadar, resilience, reserveCoverageMonths, financingReadinessScore, lendingCapacity, transactions, loans, invoices, budgets } = input;
    const m = diagnosis.metrics;
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
        status: cashHealthStatus(m.runwayDays),
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
        status: profitabilityStatus(m.profitMargin),
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
        // m.dscrStatus is already this month's own healthy/warning/danger
        // read on the same m.dscr the narrative quotes -- no debt at all is
        // never a risk in itself, so it reads as strong rather than 'info'.
        status: m.monthlyDebtService > 0 ? (m.dscrStatus === 'healthy' ? 'strong' : m.dscrStatus === 'warning' ? 'watch' : 'high-risk') : 'strong',
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

    // "Your Business Health Report" -- the one headline finding, picked
    // from whichever of the four priority dimensions is currently most
    // urgent (high-risk beats watch beats strong, in cash > profitability >
    // debt > trends order when tied), so the owner sees one coherent story
    // instead of four competing ones.
    const severityRank = (s: DiagnosticStatus) => (s === 'high-risk' ? 0 : s === 'watch' ? 1 : s === 'strong' ? 2 : 3);
    const priorityDims = [dims[0], dims[1], dims[3], dims[4]]; // cashHealth, profitability, debtHealth, businessPerformance
    const worst = priorityDims.reduce((a, b) => (severityRank(b.status) < severityRank(a.status) ? b : a));
    const reportStatus: BusinessHealthReport['status'] = worst.status === 'high-risk' ? 'critical' : worst.status === 'watch' ? 'warning' : 'healthy';
    const reportStatusLabel = reportStatus === 'critical' ? 'Needs urgent attention' : reportStatus === 'warning' ? 'Needs attention' : 'Looking good';

    let report: BusinessHealthReport;
    if (worst.key === 'cashHealth' && worst.status !== 'strong') {
        report = {
            status: reportStatus, statusLabel: reportStatusLabel, sourceDimension: 'cashHealth',
            whatWeFound: cashAfterCommitments < 0
                ? "Your business has cash in the bank, but known upcoming payments already exceed what's currently available -- putting pressure on your ability to restock and meet everyday expenses."
                : "Your business has cash in the bank, but upcoming payments could put pressure on your ability to restock and meet everyday expenses.",
            metrics: [
                { label: 'Current bank balance', value: fmtMoney(currency, m.cashBalance) },
                { label: 'Known upcoming payments', value: fmtMoney(currency, upcomingPayments) },
            ],
            whyThisMatters: cashAfterCommitments >= 0
                ? `After those known payments, ${fmtMoney(currency, cashAfterCommitments)} remains before other expenses and reserves. Your bank balance therefore does not represent the amount you can safely spend.`
                : `After those known payments, you'd be short by ${fmtMoney(currency, Math.abs(cashAfterCommitments))} before other expenses and reserves even arise. Your bank balance alone cannot cover what's already committed.`,
            nextSteps: [
                'Confirm all outstanding bills and loan repayments.',
                'Calculate how much cash is needed to keep operating.',
                hasInventory ? 'Review your next stock purchase before committing the money.' : 'Review any new spending before committing the money.',
            ],
            nextDecision: {
                text: hasInventory
                    ? `Before spending on new stock, check it against ${fmtMoney(currency, Math.max(0, cashAfterCommitments))} -- what's left after your known upcoming payments, not your full bank balance.`
                    : `Before taking on new spending, check it against ${fmtMoney(currency, Math.max(0, cashAfterCommitments))} -- what's left after your known upcoming payments, not your full bank balance.`,
                screen: 'analysis', params: { tab: 'decide' },
            },
            suggestedGoalType: 'cash_reserve',
        };
    } else if (worst.key === 'profitability' && worst.status !== 'strong') {
        report = {
            status: reportStatus, statusLabel: reportStatusLabel, sourceDimension: 'profitability',
            whatWeFound: m.netProfit < 0
                ? 'Your business is spending more than it earns, and the gap is coming straight out of cash.'
                : 'Your margins are thinner than they look once real costs are accounted for, leaving little room for error.',
            metrics: [
                { label: 'Revenue', value: fmtMoney(currency, m.totalRevenue) },
                { label: 'Net profit', value: `${m.netProfit >= 0 ? '' : '-'}${fmtMoney(currency, m.netProfit)}` },
            ],
            whyThisMatters: `Revenue of ${fmtMoney(currency, m.totalRevenue)} against ${fmtMoney(currency, m.totalExpenses)} in expenses leaves ${m.netProfit >= 0 ? `only ${fmtMoney(currency, m.netProfit)}` : `a loss of ${fmtMoney(currency, m.netProfit)}`} -- a ${m.profitMargin.toFixed(1)}% margin. A small rise in costs or a slow month could erase this entirely.`,
            nextSteps: [
                'Review your biggest expense categories for quick wins.',
                'Check whether recent pricing still covers your real costs.',
                'Confirm which costs are fixed and which can flex if sales slow down.',
            ],
            nextDecision: {
                text: `Before committing to new costs or a price change, check it against your current ${m.profitMargin.toFixed(1)}% margin -- the 20% benchmark is the line where a small shock stops being survivable.`,
                screen: 'analysis', params: { tab: 'decide' },
            },
            suggestedGoalType: 'margin_improvement',
        };
    } else if (worst.key === 'debtHealth' && worst.status !== 'strong') {
        report = {
            status: reportStatus, statusLabel: reportStatusLabel, sourceDimension: 'debtHealth',
            whatWeFound: m.dscrStatus === 'danger'
                ? 'Your monthly debt payments are higher than your cash flow can comfortably support.'
                : "Your debt payments are manageable today, but there's little room to absorb a slow month.",
            metrics: [
                { label: 'Monthly debt payments', value: fmtMoney(currency, m.monthlyDebtService) },
                { label: 'Coverage ratio', value: `${m.dscr.toFixed(2)}x` },
            ],
            whyThisMatters: `Monthly debt payments of ${fmtMoney(currency, m.monthlyDebtService)} are covered ${m.dscr.toFixed(2)}x by operating cash flow. A ratio below 1.25x means thin coverage, and a slower month could put a repayment at risk.`,
            nextSteps: [
                'Confirm your next repayment dates and amounts.',
                'Check how a slower sales month would affect your coverage ratio.',
                'Talk to your lender about restructuring before a payment is missed.',
            ],
            nextDecision: {
                text: `Before taking on any new costs or debt, check it against your current ${m.dscr.toFixed(2)}x coverage ratio -- it needs to stay above 1.25x to leave room for a slow month.`,
                screen: 'loans',
            },
            suggestedGoalType: null,
        };
    } else if (worst.key === 'businessPerformance' && worst.status !== 'strong' && directionVsStatus.directionAvailable) {
        report = {
            status: reportStatus, statusLabel: reportStatusLabel, sourceDimension: 'businessPerformance',
            whatWeFound: 'More of your business is trending in the wrong direction than the right one right now.',
            metrics: [
                { label: 'Improving', value: `${improving}` },
                { label: 'Declining', value: `${declining}` },
            ],
            whyThisMatters: `${declining} of the trends being tracked are getting worse, against ${improving} improving. Left unaddressed, this usually shows up in cash and profit within a few months.`,
            nextSteps: [
                'Identify exactly which trend is declining and why.',
                "Decide whether it's seasonal, one-off, or a real shift.",
                "Set a check-in date to confirm whether it's turned around.",
            ],
            nextDecision: {
                text: `Before planning new growth spending, check whether it depends on the ${declining} trend${declining === 1 ? '' : 's'} currently moving the wrong way, or on the ${improving} that's still working.`,
                screen: 'scoreboard',
            },
            suggestedGoalType: null,
        };
    } else {
        report = {
            status: 'healthy', statusLabel: 'Looking good', sourceDimension: 'cashHealth',
            whatWeFound: 'Across cash, profitability, debt and recent trends, nothing is currently flashing a warning.',
            metrics: [
                { label: 'Current bank balance', value: fmtMoney(currency, m.cashBalance) },
                { label: 'Known upcoming payments', value: fmtMoney(currency, upcomingPayments) },
            ],
            whyThisMatters: 'This is a good position to plan from -- you have room to consider growth, not just defend what you have.',
            nextSteps: [
                'Keep tracking upcoming payments and recent trends so you catch pressure early.',
                'Consider whether this is a good time to invest in growth.',
                "Revisit this report after your next few transactions to confirm it's holding.",
            ],
            nextDecision: {
                text: `If you're considering a new investment or expansion, test it against your current ${fmtMoney(currency, m.cashBalance)} balance and ${m.profitMargin.toFixed(1)}% margin before committing.`,
                screen: 'analysis', params: { tab: 'decide' },
            },
            suggestedGoalType: 'revenue_growth',
        };
    }

    return { dimensions: dims, report };
}
