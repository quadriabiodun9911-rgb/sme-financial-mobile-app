import { Transaction, Invoice, BusinessSettings, FinanceData } from '../types';
import { computeDataQuality } from './dataQuality';

export interface ReadinessCheck {
    id: string;
    label: string;
    passed: boolean;
    detail: string;
}

export interface TaxFilingReadiness {
    checks: ReadinessCheck[];
    passedCount: number;
    totalChecks: number;
    overallReady: boolean;
    countryCode: string;
    hasCertifiedFilingPartner: boolean; // always false today — see note in TaxFilingReadinessScreen
    daysUntilDeadline: number | null; // null when no deadline is set; negative means overdue
}

/**
 * Whether a business's records are clean enough to HAND TO an accountant
 * or a certified filing partner — this never files anything itself. Quad360
 * has no e-filing certification in any jurisdiction; that requires a real
 * partnership per country (e.g. becoming HMRC-recognised software in the
 * UK, or an IRS Authorized e-file Provider in the US). This checklist is
 * groundwork for that day, not a substitute for it.
 */
function fmtGBP(currency: string, n: number): string {
    return `${currency}${Math.round(Math.abs(n)).toLocaleString()}`;
}

export function computeTaxFilingReadiness(
    transactions: Transaction[],
    invoices: Invoice[],
    settings: BusinessSettings,
    finance?: FinanceData,
    referenceDate: Date = new Date(),
): TaxFilingReadiness {
    const checks: ReadinessCheck[] = [];
    const currency = settings.currency || '';

    // Deadline proximity — the study behind this feature (Premium Credit,
    // 2026) found missed deadlines, not messy books, are the single
    // biggest driver of SME tax problems: 55% filed late in the past 3
    // years, 40% missed up to 4 deadlines. A clean-books checklist alone
    // never surfaces "you have 4 days left" — this does.
    let daysUntilDeadline: number | null = null;
    if (settings.nextTaxDeadline) {
        const deadline = new Date(settings.nextTaxDeadline + 'T00:00:00');
        const today = new Date(referenceDate.toISOString().split('T')[0] + 'T00:00:00');
        daysUntilDeadline = Math.round((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    }
    checks.push({
        id: 'deadline',
        label: 'Next tax filing deadline is tracked and not imminent',
        passed: daysUntilDeadline !== null && daysUntilDeadline > 14,
        detail: daysUntilDeadline === null
            ? 'No deadline set in Settings — add your next VAT/Corporation Tax due date.'
            : daysUntilDeadline < 0
                ? `OVERDUE by ${Math.abs(daysUntilDeadline)} day${Math.abs(daysUntilDeadline) === 1 ? '' : 's'} — file as soon as possible to limit penalties.`
                : daysUntilDeadline === 0
                    ? 'Due today.'
                    : `${daysUntilDeadline} day${daysUntilDeadline === 1 ? '' : 's'} left`,
    });

    // Ability to pay — the study found Time to Pay scheme usage jumped
    // from 12% to 30% year over year, i.e. a rising share of SMEs file on
    // time but can't cover the bill. totalTaxCollected - totalTaxPaid is
    // tax already charged to customers but not yet remitted — the closest
    // proxy available to "what you'll owe" without a real tax computation.
    if (finance) {
        const estimatedLiability = Math.max(0, (finance.totalTaxCollected || 0) - (finance.totalTaxPaid || 0));
        const canCover = finance.cashBalance >= estimatedLiability;
        checks.push({
            id: 'ability-to-pay',
            label: 'Cash on hand covers what you likely owe',
            passed: canCover,
            detail: estimatedLiability === 0
                ? 'No outstanding tax liability tracked right now.'
                : canCover
                    ? `${fmtGBP(currency, finance.cashBalance)} in cash against ~${fmtGBP(currency, estimatedLiability)} estimated owed — covered.`
                    : `Estimated ${fmtGBP(currency, estimatedLiability)} owed, but only ${fmtGBP(currency, finance.cashBalance)} in cash — you may be short by ${fmtGBP(currency, estimatedLiability - finance.cashBalance)}.`,
        });
    }

    const quality = computeDataQuality(transactions);
    checks.push({
        id: 'data-quality',
        label: 'Transaction history is dated and complete',
        passed: quality.confidence === 'strong' || quality.confidence === 'partial',
        detail: quality.confidence === 'none'
            ? 'No transactions recorded yet.'
            : quality.summary,
    });

    const uncategorized = transactions.filter(t => !t.category || t.category.trim() === '' || t.category === 'Other');
    checks.push({
        id: 'categorization',
        label: 'Transactions are categorized (not left as "Other")',
        passed: transactions.length > 0 && uncategorized.length / Math.max(1, transactions.length) < 0.1,
        detail: transactions.length === 0
            ? 'No transactions to check.'
            : `${uncategorized.length} of ${transactions.length} transaction${transactions.length === 1 ? '' : 's'} uncategorized`,
    });

    const staleInvoices = invoices.filter(inv => inv.status === 'draft');
    checks.push({
        id: 'invoice-status',
        label: 'No invoices stuck in draft (should be sent, paid, or voided)',
        passed: staleInvoices.length === 0,
        detail: staleInvoices.length === 0
            ? 'All invoices are in a resolved status.'
            : `${staleInvoices.length} invoice${staleInvoices.length === 1 ? '' : 's'} still in draft`,
    });

    const taxRateSet = settings.defaultTaxRate !== undefined && settings.defaultTaxRate !== '' && !isNaN(parseFloat(settings.defaultTaxRate));
    checks.push({
        id: 'tax-rate',
        label: 'A default tax rate is configured',
        passed: taxRateSet,
        detail: taxRateSet ? `Set to ${settings.defaultTaxRate}%` : 'Not set in Settings',
    });

    const businessNameSet = !!(settings.businessName && settings.businessName.trim());
    checks.push({
        id: 'business-identity',
        label: 'Business name is set (needed on any filing)',
        passed: businessNameSet,
        detail: businessNameSet ? settings.businessName! : 'Not set in Settings',
    });

    const passedCount = checks.filter(c => c.passed).length;

    return {
        checks,
        passedCount,
        totalChecks: checks.length,
        overallReady: passedCount === checks.length,
        countryCode: settings.currencyCode || 'unknown',
        hasCertifiedFilingPartner: false,
        daysUntilDeadline,
    };
}
