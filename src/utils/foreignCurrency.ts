import { CurrencyAccount } from '../types';

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

// Shared by the foreign-currency transaction field (TransactionsScreen) and
// CurrencyAccountsModal -- not the full ISO 4217 list, just the currencies
// that show up across the same countries SettingsScreen's own CURRENCIES
// list already supports as a base currency.
export const FOREIGN_CURRENCY_CODES = ['USD', 'GBP', 'EUR', 'NGN', 'ZAR', 'KES', 'GHS', 'EGP', 'AED', 'INR', 'CNY', 'CAD', 'AUD'];

/**
 * Total value of every currency account, converted to the business's base
 * currency using each account's own exchangeRateToBase -- the informational
 * "what do I hold, across currencies" figure CurrencyAccountsModal shows
 * alongside each account's own native-currency balance. Deliberately never
 * fed into finance.cashBalance or any engine that assumes one base
 * currency (runway, DSCR, forecasts, etc.) -- this is an owner-maintained
 * record, not a reconciled accounting fact, same reasoning CashPocket's
 * own total already follows for cash-in-base-currency.
 */
export function computeCurrencyAccountsTotal(accounts: CurrencyAccount[]): number {
    return Math.round(accounts.reduce((s, a) => s + a.balance * a.exchangeRateToBase, 0) * 100) / 100;
}
