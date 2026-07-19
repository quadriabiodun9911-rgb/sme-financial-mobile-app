import { Transaction, Invoice, BusinessSettings } from '../types';
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
}

/**
 * Whether a business's records are clean enough to HAND TO an accountant
 * or a certified filing partner — this never files anything itself. Quad360
 * has no e-filing certification in any jurisdiction; that requires a real
 * partnership per country (e.g. becoming HMRC-recognised software in the
 * UK, or an IRS Authorized e-file Provider in the US). This checklist is
 * groundwork for that day, not a substitute for it.
 */
export function computeTaxFilingReadiness(
    transactions: Transaction[],
    invoices: Invoice[],
    settings: BusinessSettings,
): TaxFilingReadiness {
    const checks: ReadinessCheck[] = [];

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
    };
}
