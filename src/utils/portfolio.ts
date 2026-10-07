// Combined/portfolio view across every business one login OWNS -- see
// Header.tsx and migration 040's own comments for the "shadow identity"
// design this builds on. Phase 2a, same-currency only: an owner with
// businesses in different currencies sees each business's own figures
// (computed exactly like its own single-business Dashboard does, via the
// same computeFinance call) but no combined total, rather than a
// misleading sum of two different currencies. Currency conversion is a
// deliberate Phase 2b, not bundled here -- see the design discussion this
// was scoped from.
import { Asset, BusinessSettings, Transaction } from '../types';
import { computeAssetCurrentValue, computeFinance } from './finance';

export interface PortfolioBusinessInput {
    ownerId: string;
    businessName: string;
    currency: string;
    currencyCode: string;
    transactions: Transaction[];
    assets: Asset[];
    settings: Pick<BusinessSettings, 'openingAssets' | 'openingLiabilities' | 'openingLoans' | 'openingOtherAssets'>;
}

export interface PortfolioBusinessSummary {
    ownerId: string;
    businessName: string;
    currency: string;
    currencyCode: string;
    cashBalance: number;
    income: number;
    expense: number;
    profit: number;
    // Not meaningfully summable across businesses (a combined "margin"
    // would have to be revenue-weighted, and runway isn't additive at
    // all) -- shown per business in a breakdown table instead of folded
    // into the combined totals below.
    margin: number;
    runway: number;
}

export interface PortfolioSummary {
    businesses: PortfolioBusinessSummary[];
    // False the moment two businesses report different currencyCodes --
    // the combined* fields below are null in that case rather than a
    // silently-wrong sum of incompatible currencies.
    sameCurrency: boolean;
    combinedCurrency: string | null;
    combinedCashBalance: number | null;
    combinedIncome: number | null;
    combinedExpense: number | null;
    combinedProfit: number | null;
}

export function computePortfolioSummary(data: PortfolioBusinessInput[]): PortfolioSummary {
    const businesses: PortfolioBusinessSummary[] = data.map(b => {
        const activeAssets = b.assets.filter(a => a.status === 'active');
        const registeredAssetsValue = activeAssets.reduce((sum, a) => sum + computeAssetCurrentValue(a), 0);
        const finance = computeFinance(b.transactions, b.settings, registeredAssetsValue, activeAssets);
        return {
            ownerId: b.ownerId,
            businessName: b.businessName,
            currency: b.currency,
            currencyCode: b.currencyCode,
            cashBalance: finance.cashBalance,
            income: finance.income,
            expense: finance.expense,
            profit: finance.profit,
            margin: finance.margin,
            runway: finance.runway,
        };
    });

    const sameCurrency = businesses.length > 0 && businesses.every(b => b.currencyCode === businesses[0].currencyCode);

    return {
        businesses,
        sameCurrency,
        combinedCurrency: sameCurrency ? businesses[0].currency : null,
        combinedCashBalance: sameCurrency ? businesses.reduce((s, b) => s + b.cashBalance, 0) : null,
        combinedIncome: sameCurrency ? businesses.reduce((s, b) => s + b.income, 0) : null,
        combinedExpense: sameCurrency ? businesses.reduce((s, b) => s + b.expense, 0) : null,
        combinedProfit: sameCurrency ? businesses.reduce((s, b) => s + b.profit, 0) : null,
    };
}
