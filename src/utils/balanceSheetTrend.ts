/**
 * Balance sheet figures at past period-ends, not just today.
 *
 * Revenue/expenses/profit (trendAnalysis.ts) are flows that sum cleanly
 * within any date range. A balance sheet is different — it's a snapshot,
 * and this app doesn't store historical snapshots of accounts receivable,
 * accounts payable or inventory value. What CAN be honestly reconstructed
 * for a past date, from data that already carries real dates, is cash
 * (transactions have dates), equipment value (depreciation is a function of
 * purchase date), and loan balances (each payment has a date). Those three
 * are what this file computes — deliberately not a full balance sheet.
 */

import { Transaction, Asset, Loan } from '../types';

export interface BalanceSheetTrendPoint {
    key: string;
    label: string;
    cashOnHand: number;
    equipmentValue: number;
    loansOutstanding: number;
    netPosition: number; // cashOnHand + equipmentValue - loansOutstanding
}

export type BalancePeriodGrouping = 'monthly' | 'quarterly' | 'yearly';

interface PeriodDef {
    key: string;
    label: string;
    endDate: string; // 'YYYY-MM-DD', inclusive
}

function monthEndDate(year: number, month1to12: number): string {
    return new Date(year, month1to12, 0).toISOString().slice(0, 10);
}

function cashOnHandAsOf(transactions: Transaction[], endDate: string): number {
    let cash = 0;
    for (const t of transactions) {
        if (!t.date || t.date > endDate) continue;
        if ((t.status ?? 'paid') !== 'paid') continue;
        cash += t.type === 'income' ? t.amount : -t.amount;
    }
    return cash;
}

function equipmentValueAsOf(assets: Asset[], endDate: string): number {
    const asOfMs = new Date(endDate + 'T23:59:59').getTime();
    let total = 0;
    for (const a of assets) {
        const purchaseMs = new Date(a.purchaseDate).getTime();
        if (isNaN(purchaseMs) || purchaseMs > asOfMs) continue; // not yet owned at this date
        if (a.disposalDate && new Date(a.disposalDate).getTime() <= asOfMs) continue; // already disposed by this date
        const cost = isNaN(a.purchaseCost) ? 0 : (a.purchaseCost || 0);
        const residual = isNaN(a.residualValue) ? 0 : (a.residualValue || 0);
        const lifeYears = (!a.usefulLifeYears || a.usefulLifeYears <= 0) ? 1 : a.usefulLifeYears;
        const yearsOwned = (asOfMs - purchaseMs) / (1000 * 60 * 60 * 24 * 365);
        const dep = Math.min(yearsOwned * (cost - residual) / lifeYears, cost - residual);
        total += Math.max(residual, cost - dep);
    }
    return total;
}

function loansOutstandingAsOf(loans: Loan[], endDate: string): number {
    let total = 0;
    for (const l of loans) {
        if (!l.startDate || l.startDate > endDate) continue; // loan not yet taken out
        const paidByThen = (l.payments ?? [])
            .filter(p => p.date && p.date <= endDate)
            .reduce((sum, p) => sum + (p.amount || 0), 0);
        total += Math.max(0, (l.principal || 0) - paidByThen);
    }
    return total;
}

function buildPoints(periods: PeriodDef[], transactions: Transaction[], assets: Asset[], loans: Loan[]): BalanceSheetTrendPoint[] {
    return periods.map(p => {
        const cashOnHand = cashOnHandAsOf(transactions, p.endDate);
        const equipmentValue = equipmentValueAsOf(assets, p.endDate);
        const loansOutstanding = loansOutstandingAsOf(loans, p.endDate);
        return {
            key: p.key,
            label: p.label,
            cashOnHand,
            equipmentValue,
            loansOutstanding,
            netPosition: cashOnHand + equipmentValue - loansOutstanding,
        };
    });
}

const MONTH_SHORT = (y: number, m: number) => new Date(y, m - 1, 1).toLocaleString('default', { month: 'short' }) + ` '${String(y).slice(2)}`;

export function computeBalanceSheetTrend(
    grouping: BalancePeriodGrouping,
    months: string[], // sorted 'YYYY-MM' keys that have transaction data, e.g. from computeMonthlyTrend
    transactions: Transaction[],
    assets: Asset[],
    loans: Loan[]
): BalanceSheetTrendPoint[] {
    if (months.length === 0) return [];

    if (grouping === 'monthly') {
        const periods: PeriodDef[] = months.map(m => {
            const [y, mo] = m.split('-').map(Number);
            return { key: m, label: MONTH_SHORT(y, mo), endDate: monthEndDate(y, mo) };
        });
        return buildPoints(periods, transactions, assets, loans);
    }

    if (grouping === 'quarterly') {
        const seen = new Map<string, PeriodDef>();
        for (const m of months) {
            const [y, mo] = m.split('-').map(Number);
            const q = Math.ceil(mo / 3);
            const key = `${y}-Q${q}`;
            if (!seen.has(key)) seen.set(key, { key, label: `Q${q} ${y}`, endDate: monthEndDate(y, q * 3) });
        }
        return buildPoints(Array.from(seen.values()).sort((a, b) => a.key.localeCompare(b.key)), transactions, assets, loans);
    }

    // yearly
    const seen = new Map<string, PeriodDef>();
    for (const m of months) {
        const y = Number(m.slice(0, 4));
        const key = String(y);
        if (!seen.has(key)) seen.set(key, { key, label: key, endDate: `${y}-12-31` });
    }
    return Array.from(seen.values())
        .sort((a, b) => a.key.localeCompare(b.key))
        .map(p => buildPoints([p], transactions, assets, loans)[0]);
}
