import { ExportData } from './pdfExport';
import { Transaction } from '../types';
import { TaxTotals } from './finance';

/**
 * Every other major report in this app (Financial Statements, Business
 * Passport, Funding Readiness Pack) can be exported as a document to hand
 * to someone else -- the Tax Overview (TaxSummary.tsx) couldn't. A business
 * owner reviewing their tax-collected/tax-paid figures for a filing period
 * had no way to get them to their accountant except retyping or
 * screenshotting the numbers.
 *
 * Deliberately generic "tax," never a VAT-specific claim: Transaction.
 * taxRate/taxAmount is one undifferentiated field (Settings' own label
 * covers it as "VAT return, Corporation Tax, or equivalent") with no
 * taxType to tell VAT apart from withholding tax or anything else --
 * asserting this is a "VAT Return" would overclaim a distinction the data
 * doesn't actually carry. This hands over exactly what's real: the
 * period's own totals plus every taxed transaction behind them, so
 * whoever is actually filing (the business's own accountant, this app
 * never files anything itself) can classify and use it correctly.
 */
export const TAX_SUMMARY_DISCLAIMER =
    'This is a summary for internal tracking only, built from whatever Tax Rate (%) was recorded per transaction -- not a filed return and not a substitute for a qualified accountant or tax advisor, who should classify and confirm every figure before any official filing.';

export function buildTaxSummaryExport(
    periodLabel: string,
    totals: TaxTotals,
    taxByCategory: { label: string; amount: number }[],
    periodTransactions: Transaction[],
    currency: string,
): ExportData {
    const fmt = (n: number) => `${currency}${Math.round(n).toLocaleString()}`;

    const taxedTransactions = periodTransactions
        .filter(t => (t.taxAmount ?? 0) > 0)
        .sort((a, b) => a.date.localeCompare(b.date));

    const taxableIncome = periodTransactions
        .filter(t => t.type === 'income' && (t.taxAmount ?? 0) > 0)
        .reduce((s, t) => s + (t.amount ?? 0), 0);
    const effectiveTaxRate = taxableIncome > 0 ? (totals.totalTaxCollected / taxableIncome) * 100 : 0;

    return {
        title: `Tax Summary — ${periodLabel}`,
        date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        summary: [
            { label: 'Tax Collected (on income)', value: fmt(totals.totalTaxCollected) },
            { label: 'Tax Paid (on expenses)', value: fmt(totals.totalTaxPaid) },
            { label: 'Net Tax Position', value: `${totals.netTaxPosition >= 0 ? '+' : ''}${fmt(totals.netTaxPosition)}` },
            { label: 'Effective Tax Rate on Revenue', value: `${effectiveTaxRate.toFixed(2)}%` },
            // Only shown when the owner has actually marked a transaction
            // zero-rated/exempt -- most businesses never touch this
            // distinction, so it stays out of the way until it's relevant.
            ...(totals.zeroRatedSalesTotal > 0 ? [{ label: 'Zero-Rated Sales', value: fmt(totals.zeroRatedSalesTotal) }] : []),
            ...(totals.exemptSalesTotal > 0 ? [{ label: 'Exempt Sales', value: fmt(totals.exemptSalesTotal) }] : []),
        ],
        sections: [
            ...(taxByCategory.length > 0 ? [{
                name: 'Tax by Category',
                data: taxByCategory.map(c => ({ label: c.label, value: fmt(c.amount) })),
            }] : []),
            {
                // The one genuinely new piece: a line-level record an
                // accountant can check against source documents (receipts,
                // invoices) rather than only ever seeing the rolled-up
                // totals above.
                name: 'Taxed Transactions',
                data: taxedTransactions.length > 0
                    ? taxedTransactions.map(t => ({
                        label: `${t.date} — ${t.description || t.category} (${t.type}, ${t.taxRate ?? 0}%)`,
                        value: fmt(t.taxAmount ?? 0),
                    }))
                    : [{ label: 'No transactions with a recorded tax amount in this period', value: '' }],
            },
            {
                name: 'Note',
                data: [{ label: 'Disclaimer', value: TAX_SUMMARY_DISCLAIMER }],
            },
        ],
    };
}
