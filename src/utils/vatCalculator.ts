// VAT/tax helpers that stay deliberately small and currency-aware rather
// than hardcoded into the transaction form -- Quad360 supports businesses
// outside Nigeria too (see settings.currencyCode), so nothing here assumes
// a 7.5% rate; callers always pass the business's own tax rate.

export interface VatSplit {
    exclusive: number; // the pre-tax amount
    taxAmount: number; // the tax portion
}

// Splits a tax-inclusive total into its pre-tax and tax portions, given a
// tax rate as a percentage (e.g. 7.5 for Nigeria's standard VAT rate).
// exclusive = inclusive / (1 + rate/100); taxAmount = inclusive - exclusive.
export function splitTaxInclusive(totalInclusive: number, ratePercent: number): VatSplit {
    if (!isFinite(totalInclusive) || !isFinite(ratePercent) || ratePercent <= 0) {
        return { exclusive: totalInclusive, taxAmount: 0 };
    }
    const exclusive = totalInclusive / (1 + ratePercent / 100);
    return { exclusive, taxAmount: totalInclusive - exclusive };
}

// Nigeria's VAT Act (as amended by the Finance Act 2019) exempted small
// businesses below this annual turnover from VAT registration, filing and
// payment entirely. NOT independently re-verified against the Nigeria Tax
// Act 2025/2026 reform text at the time this was written -- that reform
// changed the Companies Income Tax small-company threshold to NGN100m, and
// may or may not have changed this VAT-specific figure too. Confirm against
// the Nigeria Tax Act or NRS directly before relying on this for a real
// filing decision -- the banner that uses this always says so too, and this
// is deliberately advisory-only, never a hard "you don't need to file" claim.
export const NGN_VAT_REGISTRATION_THRESHOLD = 25_000_000;

export interface VatExemptionStatus {
    trailing12moRevenue: number;
    likelyExempt: boolean;
    thresholdNgn: number;
}

// Trailing 365-day income, annualized off a shorter history when the
// business is younger than a year (bounded to a 12x multiplier, i.e. never
// inferred from less than ~30 days of data) -- same bounded-annualization
// approach finance.ts's DSCR calculation already uses for the identical
// "not enough history yet" problem.
export function computeVatExemptionStatus(
    transactions: { type: string; amount: number; date: string }[],
    referenceDate: Date = new Date(),
): VatExemptionStatus {
    const refMs = referenceDate.getTime();
    const cutoffMs = refMs - 365 * 86400000;
    const incomeTx = transactions.filter(t => t.type === 'income');

    const windowIncome = incomeTx
        .filter(t => {
            const ms = new Date(t.date).getTime();
            return ms >= cutoffMs && ms <= refMs;
        })
        .reduce((sum, t) => sum + t.amount, 0);

    const oldestMs = incomeTx.length > 0
        ? Math.min(...incomeTx.map(t => new Date(t.date).getTime()))
        : refMs;
    const daysOfHistory = Math.max(1, Math.round((refMs - oldestMs) / 86400000));

    const trailing12moRevenue = daysOfHistory >= 365
        ? windowIncome
        : windowIncome * Math.min(12, 365 / Math.max(30, daysOfHistory));

    return {
        trailing12moRevenue,
        likelyExempt: trailing12moRevenue < NGN_VAT_REGISTRATION_THRESHOLD,
        thresholdNgn: NGN_VAT_REGISTRATION_THRESHOLD,
    };
}
