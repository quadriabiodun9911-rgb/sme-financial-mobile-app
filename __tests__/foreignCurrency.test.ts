import { convertToBaseCurrency, computeCurrencyAccountsTotal } from '../src/utils/foreignCurrency';
import { CurrencyAccount } from '../src/types';

describe('convertToBaseCurrency', () => {
    it('multiplies the original amount by the exchange rate', () => {
        expect(convertToBaseCurrency(300, 1500)).toBe(450000);
    });

    it('rounds to 2 decimal places', () => {
        expect(convertToBaseCurrency(99.999, 1.111)).toBeCloseTo(111.10, 2);
    });

    it('returns 0 for a zero original amount', () => {
        expect(convertToBaseCurrency(0, 1500)).toBe(0);
    });

    it('handles fractional exchange rates', () => {
        expect(convertToBaseCurrency(1000, 0.0012)).toBeCloseTo(1.2, 2);
    });
});

function makeAccount(overrides: Partial<CurrencyAccount> = {}): CurrencyAccount {
    return {
        id: 'acct-1', label: 'USD Domiciliary', currencyCode: 'USD',
        balance: 1000, exchangeRateToBase: 1500, updatedAt: '2026-01-01T00:00:00.000Z',
        ...overrides,
    };
}

describe('computeCurrencyAccountsTotal', () => {
    it('returns 0 for no accounts', () => {
        expect(computeCurrencyAccountsTotal([])).toBe(0);
    });

    it('converts a single account to base currency', () => {
        expect(computeCurrencyAccountsTotal([makeAccount()])).toBe(1500000);
    });

    it('sums multiple accounts, each at its own rate', () => {
        const accounts = [
            makeAccount({ id: 'a', balance: 1000, exchangeRateToBase: 1500 }), // 1,500,000
            makeAccount({ id: 'b', currencyCode: 'GBP', balance: 500, exchangeRateToBase: 1900 }), // 950,000
        ];
        expect(computeCurrencyAccountsTotal(accounts)).toBe(2450000);
    });

    it('rounds to 2 decimal places', () => {
        const accounts = [makeAccount({ balance: 99.999, exchangeRateToBase: 1.111 })];
        expect(computeCurrencyAccountsTotal(accounts)).toBeCloseTo(111.10, 2);
    });
});
