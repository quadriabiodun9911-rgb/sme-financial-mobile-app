import { ExportData } from './pdfExport';
import { BusinessFinancialDNA, DNADeviation } from './businessFinancialDNA';

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

export interface FinancialPassportInput {
    dna: BusinessFinancialDNA;
    deviations: DNADeviation[];
    currency: string;
    generatedAt: Date;
}

/**
 * The fuller companion to buildLenderSummaryExport above: that function
 * turns the credit score alone into a document; this turns the whole
 * Business Financial DNA profile into one — identity, behaviour, and risk,
 * not just a score. Deliberately doesn't restate the credit score or
 * lending checklist (buildLenderSummaryExport already owns that document);
 * a business wanting both shares two focused exports rather than one
 * bloated one.
 *
 * This is a record of recorded behaviour, not a credit decision or a
 * funding offer — Quad360 doesn't lend and doesn't guarantee an outcome,
 * it gives whoever the owner shares this with real evidence to decide from.
 */
export function buildFinancialPassportExport(input: FinancialPassportInput): ExportData {
    const { dna, deviations, currency, generatedAt } = input;
    const fmt = (n: number) => fmtCurrency(currency, n);

    return {
        title: `${dna.identity.businessName} — Financial Passport`,
        date: generatedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        summary: [
            { label: 'Recorded History', value: `${dna.identity.monthsOfRecordedHistory} month(s)` },
            { label: 'Avg. Monthly Revenue', value: fmt(dna.financial.avgMonthlyRevenue) },
            { label: 'Avg. Profit Margin', value: `${dna.financial.avgMonthlyProfitMargin.toFixed(1)}%` },
            { label: 'Business Risk Score', value: `${dna.risk.riskScore.score} / 100 (${dna.risk.riskScore.grade})` },
        ],
        sections: [
            {
                name: 'Business Identity',
                data: [
                    { label: 'Business type', value: dna.identity.businessType },
                    { label: 'Industry', value: dna.identity.industry },
                    { label: 'Profile maturity', value: dna.identity.dataMaturity },
                ],
            },
            {
                name: 'Financial Behaviour',
                data: [
                    { label: 'Revenue predictability', value: dna.financial.revenueVolatility },
                    { label: 'Year-over-year revenue growth', value: dna.financial.yoyRevenueGrowthPct !== null ? `${dna.financial.yoyRevenueGrowthPct.toFixed(1)}%` : 'Not yet available' },
                    { label: 'Days sales outstanding', value: `${dna.financial.dso} days` },
                    { label: 'Days payable outstanding', value: `${dna.financial.dpo} days` },
                    { label: 'Cash conversion cycle', value: `${dna.financial.cashConversionCycleDays} days` },
                    { label: 'Monthly debt obligation', value: fmt(dna.financial.monthlyDebtObligation) },
                    { label: 'Historically slow months', value: dna.financial.seasonalLowMonths.length ? dna.financial.seasonalLowMonths.join(', ') : 'None identified yet' },
                ],
            },
            {
                name: 'Operational Behaviour',
                data: [
                    { label: 'Inventory value (at cost)', value: fmt(dna.operational.inventoryValue) },
                    { label: 'Slow-moving stock', value: `${dna.operational.slowMovingItemCount} of ${dna.operational.totalInventoryItems} items` },
                    { label: 'Outstanding receivables', value: fmt(dna.operational.outstandingReceivables) },
                    { label: 'Outstanding payables', value: fmt(dna.operational.outstandingPayables) },
                    { label: 'Top customer share of revenue', value: `${dna.operational.topCustomerConcentrationPct.toFixed(0)}%` },
                    { label: 'Top supplier share of spend', value: `${dna.operational.topSupplierConcentrationPct.toFixed(0)}%` },
                ],
            },
            {
                name: 'Risk Behaviour',
                data: [
                    { label: 'Customer concentration risk', value: dna.risk.customerConcentrationRisk },
                    { label: 'Supplier concentration risk', value: dna.risk.supplierConcentrationRisk },
                    { label: 'Margin trend (last 3 months)', value: dna.risk.marginTrendDirection },
                ],
            },
            ...(deviations.length > 0 ? [{
                name: 'Recent Changes vs. This Business\'s Own History',
                data: deviations.map(d => ({ label: d.metric, value: d.changeDescription })),
            }] : []),
        ],
    };
}
