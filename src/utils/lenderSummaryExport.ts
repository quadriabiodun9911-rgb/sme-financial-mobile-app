import { ExportData } from './pdfExport';

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
