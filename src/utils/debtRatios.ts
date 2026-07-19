import { FinanceData, Loan } from '../types';

export type RatioScore = 'strong' | 'stable' | 'concerning';

export interface LeverageRatios {
    liabilities: number;
    assets: number;
    equity: number;
    profit: number;
    debtToAssets: number;   // %
    debtToEquity: number;   // x, Infinity if equity <= 0 and liabilities > 0
    equityRatio: number;    // %
    returnOnAssets: number; // %
    returnOnEquity: number; // %
}

/**
 * The one place "how much is still owed on active loans" gets computed.
 * finance.liabilities only ever reflects Settings' manual "opening
 * liabilities" figure — computeFinance never folds in the live Loan
 * Register — so every screen that wants a true liabilities figure has to
 * add this itself. Previously DebtAnalysis.tsx and EnhancedDebtManagement.tsx
 * both did, with copy-pasted code (each file's own comment cross-referenced
 * the other about it) — now there's exactly one implementation.
 */
export function computeLiveLoanBalance(loans: Loan[]): number {
    return loans
        .filter(l => l.status === 'active')
        .reduce((sum, l) => {
            const paid = (l.payments ?? []).reduce((s, p) => s + (p.amount || 0), 0);
            return sum + Math.max(0, (l.principal || 0) - paid);
        }, 0);
}

export function computeLeverageRatios(finance: FinanceData, loans: Loan[]): LeverageRatios {
    const liabilities = finance.liabilities + computeLiveLoanBalance(loans);
    const assets = finance.assets;
    const equity = finance.equity;
    const profit = finance.profit;

    return {
        liabilities,
        assets,
        equity,
        profit,
        debtToAssets: assets > 0 ? (liabilities / assets) * 100 : 0,
        debtToEquity: equity > 0 ? liabilities / equity : liabilities > 0 ? Infinity : 0,
        equityRatio: assets > 0 ? (equity / assets) * 100 : 100,
        returnOnAssets: assets > 0 ? (profit / assets) * 100 : 0,
        returnOnEquity: equity > 0 ? (profit / equity) * 100 : 0,
    };
}

/**
 * Canonical strong/stable/concerning verdicts for each leverage ratio.
 * Previously DebtAnalysis.tsx and EnhancedDebtManagement.tsx scored the same
 * debt-to-assets/debt-to-equity figures with different breakpoints (e.g. a
 * 55% debt-to-assets ratio read "concerning" on one card and "stable" on
 * the other, rendered on the same Reports tab) — both now call these.
 */
export function scoreByThreshold(val: number, [strongAt, stableAt]: [number, number]): RatioScore {
    if (val >= strongAt) return 'strong';
    if (val >= stableAt) return 'stable';
    return 'concerning';
}

export function scoreDebtToAssets(debtToAssetsPct: number): RatioScore {
    return scoreByThreshold(100 - debtToAssetsPct, [70, 50]); // <=30% strong, <=50% stable, >50% concerning
}

export function scoreDebtToEquity(debtToEquity: number): RatioScore {
    if (debtToEquity === Infinity) return 'concerning';
    if (debtToEquity <= 0.5) return 'strong';
    if (debtToEquity <= 1) return 'stable';
    return 'concerning';
}

export function scoreEquityRatio(equityRatioPct: number): RatioScore {
    return scoreByThreshold(equityRatioPct, [70, 50]);
}

export function scoreROA(returnOnAssetsPct: number): RatioScore {
    return scoreByThreshold(returnOnAssetsPct, [10, 5]);
}

export function scoreROE(returnOnEquityPct: number): RatioScore {
    return scoreByThreshold(returnOnEquityPct, [15, 8]);
}
