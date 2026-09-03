/**
 * Converts a foreign-currency transaction amount into the business's own
 * base currency, for the "Paid or received in a different currency?" field
 * on Add/Edit Transaction (see Transaction.originalCurrencyCode/
 * originalAmount/exchangeRate). `exchangeRate` is units of the business's
 * base currency per 1 unit of the foreign currency, matching the field's
 * own label ("1 USD = ? ₦"). Rounded to 2dp -- the smallest unit either
 * currency's amount fields ever display.
 */
export function convertToBaseCurrency(originalAmount: number, exchangeRate: number): number {
    return Math.round(originalAmount * exchangeRate * 100) / 100;
}
