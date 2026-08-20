import { ExportData } from './pdfExport';
import { FundingReadinessPack } from './fundingReadiness';
import { BusinessPassport } from './businessPassport';
import { Loan } from '../types';
import { PostFinancingMonitor } from './postFinancingMonitor';

export interface LenderSummaryFactor {
    name: string;
    score: number;
    weight: number;
    description: string;
    status: string;
}

export interface LenderSummaryCheckpoint {
    label: string;
    met: boolean;
    description: string;
}

export interface LenderSummaryInput {
    businessName: string;
    currency: string;
    overallCreditScore: number;
    creditRatingLabel: string;
    factors: LenderSummaryFactor[];
    checkpoints: LenderSummaryCheckpoint[];
    runwayDays: number;
    avgMonthlyRevenue: number;
    daysActive: number;
    generatedAt: Date;
}

function fmtCurrency(currency: string, n: number): string {
    return `${currency}${Math.round(n).toLocaleString()}`;
}

// SMMEs are locked out of credit not because the underlying business isn't
// viable, but because its financial signal never reaches the people who'd
// fund it — the credit worthiness score Quad360 already computes lives only
// inside the app. This turns that score into a document a lender can
// actually read: what it's assessing, why, and the record it's built on.
export function buildLenderSummaryExport(input: LenderSummaryInput): ExportData {
    const {
        businessName, currency, overallCreditScore, creditRatingLabel,
        factors, checkpoints, runwayDays, avgMonthlyRevenue, daysActive, generatedAt,
    } = input;

    return {
        title: `${businessName} — Lender-Ready Financial Summary`,
        date: generatedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        summary: [
            { label: 'Overall Credit Score', value: `${Math.round(overallCreditScore)} / 100 (${creditRatingLabel})` },
            { label: 'Monthly Revenue', value: fmtCurrency(currency, avgMonthlyRevenue) },
            { label: 'Cash Runway', value: `${Math.round(runwayDays)} days` },
            { label: 'Operating History', value: `${daysActive} days` },
        ],
        sections: [
            {
                name: 'Credit Score Breakdown',
                data: factors.map(f => ({
                    label: `${f.name} (${Math.round(f.weight * 100)}% weight) — ${f.status}`,
                    value: `${Math.round(f.score)} / 100`,
                })),
            },
            {
                name: 'Lender Checklist',
                data: checkpoints.map(c => ({
                    label: c.description,
                    value: c.met ? 'Met' : 'Not yet met',
                })),
            },
        ],
    };
}

/**
 * The fuller companion to buildLenderSummaryExport above: that function
 * turns the credit score alone into a document; this turns the whole
 * Business Passport into one — identity, financial identity, health, risk,
 * credit readiness, investment readiness, growth, and actions, not just a
 * score. Deliberately doesn't restate the funding-readiness document
 * (buildFundingReadinessPackExport already owns that); a business wanting
 * both shares two focused exports rather than one bloated one.
 *
 * This is a record of recorded behaviour, not a credit decision or a
 * funding offer — Quad360 doesn't lend and doesn't guarantee an outcome,
 * it gives whoever the owner shares this with real evidence to decide from.
 * Previously named buildFinancialPassportExport, titled "Financial
 * Passport" — renamed to stop colliding with the Business Passport screen
 * it now exports, which didn't exist when this was first written.
 */
export function buildBusinessPassportExport(passport: BusinessPassport, currency: string): ExportData {
    const fmt = (n: number) => fmtCurrency(currency, n);

    return {
        title: `${passport.businessName} — Business Passport`,
        date: new Date(passport.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        summary: [
            { label: 'Recorded History', value: `${passport.trackRecord.monthsOfRecordedHistory} month(s) — ${passport.trackRecord.dataMaturity}` },
            { label: 'Avg. Monthly Revenue', value: fmt(passport.financialIdentity.avgMonthlyRevenue) },
            { label: 'Avg. Profit Margin', value: `${passport.financialIdentity.avgMonthlyProfitMargin.toFixed(1)}%` },
            { label: 'Health / Credit Readiness Score', value: `${passport.health.score} / 100 (${passport.health.band})` },
        ],
        sections: [
            {
                name: 'Business Identity',
                data: [
                    { label: 'Business type', value: passport.identity.businessType },
                    { label: 'Industry', value: passport.identity.industry },
                    { label: 'Profile maturity', value: passport.identity.dataMaturity },
                ],
            },
            {
                name: 'Financial Identity',
                data: [
                    { label: 'Revenue (TTM)', value: fmt(passport.financialIdentity.revenue) },
                    { label: 'Gross Profit (TTM)', value: `${fmt(passport.financialIdentity.grossProfit)} (${passport.financialIdentity.grossMargin.toFixed(0)}% margin)` },
                    { label: 'Net Profit (TTM)', value: fmt(passport.financialIdentity.netProfit) },
                    { label: 'Cash', value: fmt(passport.financialIdentity.cash) },
                    { label: 'Receivables', value: fmt(passport.financialIdentity.receivables) },
                    { label: 'Debt', value: fmt(passport.financialIdentity.debt) },
                    { label: '  — due within 1 year', value: fmt(passport.financialIdentity.debtCurrentPortion) },
                    { label: '  — due after 1 year', value: fmt(passport.financialIdentity.debtNonCurrentPortion) },
                    { label: 'Revenue predictability', value: passport.financialIdentity.revenueVolatility },
                ],
            },
            {
                name: 'Health',
                data: passport.health.categories.map(f => ({
                    label: f.name,
                    value: `${f.status === 'good' ? 'Strong' : f.status === 'warning' ? 'Watch' : 'High risk'} (${f.score}/100)`,
                })),
            },
            {
                name: 'Risk',
                data: [
                    { label: 'Customer concentration risk', value: passport.risk.customerConcentrationRisk },
                    { label: 'Supplier concentration risk', value: passport.risk.supplierConcentrationRisk },
                    ...passport.risk.deviations.map(d => ({ label: d.metric, value: d.changeDescription })),
                ],
            },
            {
                name: 'Credit Readiness',
                data: [
                    { label: 'Score', value: `${passport.creditReadiness.score} / 100 (${passport.creditReadiness.band})` },
                    { label: 'Supporting documents', value: `${passport.creditReadiness.documentsReady} of ${passport.creditReadiness.documentsTotal} ready` },
                ],
            },
            {
                name: 'Investment Readiness',
                data: [
                    ...(passport.investmentReadiness.valuation.hasReliableData ? [{
                        label: 'Illustrative valuation range',
                        value: `${fmt(passport.investmentReadiness.valuation.lowValuation)} – ${fmt(passport.investmentReadiness.valuation.highValuation)}`,
                    }] : []),
                    { label: 'Recurring revenue', value: `${passport.investmentReadiness.recurringRevenuePct.toFixed(0)}%` },
                    { label: 'Revenue growth (YoY)', value: passport.investmentReadiness.yoyRevenueGrowthPct !== null ? `${passport.investmentReadiness.yoyRevenueGrowthPct.toFixed(1)}%` : 'Not yet available' },
                    { label: 'Evidenced', value: passport.investmentReadiness.availableSignals.join(', ') },
                    { label: 'Not yet evidenced — needs owner input', value: passport.investmentReadiness.missingSignals.join(', ') },
                ],
            },
            {
                name: 'Growth',
                data: [
                    { label: 'Revenue growth (YoY)', value: passport.growth.yoyRevenueGrowthPct !== null ? `${passport.growth.yoyRevenueGrowthPct.toFixed(1)}%` : 'Not yet available' },
                    { label: 'Profit growth (YoY)', value: passport.growth.yoyProfitGrowthPct !== null ? `${passport.growth.yoyProfitGrowthPct.toFixed(1)}%` : 'Not yet available' },
                    { label: 'Margin trend (last 3 months)', value: passport.growth.marginTrend },
                ],
            },
            {
                name: 'Actions — What To Do Next',
                data: passport.topActions.map((a, i) => ({ label: `${i + 1}`, value: a })),
            },
        ],
    };
}

const STATUS_LABEL: Record<RiskFactorStatus, string> = { good: 'Strong', warning: 'Watch', danger: 'High risk' };
type RiskFactorStatus = 'good' | 'warning' | 'danger';

/**
 * The document this whole file exists to eventually produce: not a score
 * alone (buildLenderSummaryExport) or a behavioural profile alone
 * (buildFinancialPassportExport), but the full pack a business can hand a
 * lender — what it made, how it's trending, where the risk sits, how ready
 * it is, and what backs that up. Same "this is evidence, not a decision or
 * an offer" discipline as the other two exports in this file.
 */
export function buildFundingReadinessPackExport(pack: FundingReadinessPack, currency: string): ExportData {
    const fmt = (n: number) => fmtCurrency(currency, n);

    return {
        title: `${pack.businessName} — Funding Readiness Pack`,
        date: new Date(pack.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        summary: [
            { label: 'Funding Readiness', value: `${pack.score} / 100 (${pack.band})` },
            { label: 'Revenue (trailing 12 months)', value: fmt(pack.profile.revenue) },
            { label: 'Net Profit (trailing 12 months)', value: fmt(pack.profile.netProfit) },
            { label: 'Cash on hand', value: fmt(pack.profile.cash) },
        ],
        sections: [
            {
                name: 'Business Financial Profile',
                data: [
                    { label: 'Revenue (TTM)', value: fmt(pack.profile.revenue) },
                    { label: 'Gross Profit (TTM)', value: `${fmt(pack.profile.grossProfit)} (${pack.profile.grossMargin.toFixed(0)}% margin)` },
                    { label: 'Net Profit (TTM)', value: fmt(pack.profile.netProfit) },
                    { label: 'Cash', value: fmt(pack.profile.cash) },
                    { label: 'Receivables', value: fmt(pack.profile.receivables) },
                    { label: 'Debt (active loans, outstanding principal)', value: fmt(pack.profile.debt) },
                    { label: '  — due within 1 year', value: fmt(pack.profile.debtCurrentPortion) },
                    { label: '  — due after 1 year', value: fmt(pack.profile.debtNonCurrentPortion) },
                ],
            },
            {
                name: 'Financial Performance — Last 12 Months',
                data: pack.trend.map(m => ({
                    label: m.month,
                    value: `Revenue ${fmt(m.revenue)} · Profit ${fmt(m.profit)} (${m.profitMargin.toFixed(0)}%)`,
                })),
            },
            {
                name: 'Risk Profile',
                data: pack.riskProfile.map(f => ({ label: f.name, value: `${STATUS_LABEL[f.status]} (${f.score}/100)` })),
            },
            {
                name: 'Supporting Documents',
                data: pack.documents.map(d => ({
                    label: d.label,
                    value: `${d.ready ? 'Ready' : 'Not yet ready'} — ${d.detail}`,
                })),
            },
        ],
    };
}

const POST_FINANCING_STATUS_LABEL: Record<string, string> = { healthy: 'Healthy', watch: 'Watch', 'at-risk': 'At Risk' };
const POST_FINANCING_TREND_LABEL: Record<string, string> = { improving: 'Improving', declining: 'Declining', stable: 'Stable' };

/**
 * Post-Financing Intelligence, Phase 2a: what a business can choose to hand
 * the lender who funded a loan, once -- and only once -- they've explicitly
 * consented. Deliberately the coarsest export in this file: no transaction
 * data, no exact revenue or DSCR figures, not even the numeric detail
 * computePostFinancingMonitor's own signals carry -- only whether a category
 * of concern is flagged or clear. A status update, not a credit reference,
 * and says so explicitly.
 */
export function buildPostFinancingShareExport(
    loan: Loan,
    monitor: PostFinancingMonitor,
    businessName: string,
    generatedAt: Date = new Date(),
): ExportData {
    return {
        title: `${businessName} — Financing Status Update for ${loan.lenderName || 'your lender'}`,
        date: generatedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        summary: [
            { label: 'Status', value: POST_FINANCING_STATUS_LABEL[monitor.status] },
            { label: 'Trend since funding', value: monitor.readinessSinceFunding ? POST_FINANCING_TREND_LABEL[monitor.readinessSinceFunding.trend] : 'Not enough history yet' },
            { label: 'Loan', value: `${loan.lenderName || 'your lender'} — funded ${loan.startDate}` },
        ],
        sections: [
            {
                name: 'Signals Reviewed',
                data: monitor.signals.map(s => ({ label: s.label, value: s.tripped ? 'Flagged' : 'Clear' })),
            },
            {
                name: 'What This Is',
                data: [
                    { label: 'Scope', value: 'A coarse status signal only — no transaction data, exact revenue figures, or account details are included.' },
                    { label: 'Not a credit reference', value: "Quad360 doesn't make lending decisions, and this isn't a credit report, a repayment guarantee, or a request for any action." },
                    { label: 'Shared with consent', value: 'The business shared this directly and can revoke that consent at any time.' },
                ],
            },
        ],
    };
}
