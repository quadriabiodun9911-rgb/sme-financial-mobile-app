/**
 * True cash-basis flow per period — money that actually moved, not accrual
 * figures. Distinct from the other two comparison tables that already exist:
 *   - PeriodComparisonTable (P&L) sums ALL transactions regardless of paid
 *     status — closer to accrual revenue recognition.
 *   - BalanceSheetComparisonTable's Cash on Hand is a CUMULATIVE running
 *     total as of each period-end, not a per-period flow.
 * This is the one place "how much cash moved in and out this month" is
 * actually shown — the classic cash flow statement question — using only
 * transactions marked paid, summed within each period.
 */

import { Transaction } from '../types';

export interface CashFlowTrendPoint {
    key: string;
    label: string;
    cashIn: number;
    cashOut: number;
    netCashFlow: number;
    // Direct-method split of cashOut by activity, mirroring the formal
    // Statement of Cash Flows' three sections (CashFlowFormalStatement.tsx)
    // -- but computed straight from each paid transaction's own category,
    // per period, rather than that statement's indirect (Net Income + D&A +
    // working-capital-change) method over full history. The two are
    // intentionally different bases (see this file's header comment) so
    // they won't total to identical figures, but the split still answers
    // the same real question: was cash going out to run the business, to
    // buy equipment, or to pay down debt?
    operatingOut: number;
    investingOut: number;
    financingOut: number;
}

export type CashFlowPeriodGrouping = 'monthly' | 'quarterly' | 'yearly';

const MONTH_SHORT = (y: number, m: number) => new Date(y, m - 1, 1).toLocaleString('default', { month: 'short' }) + ` '${String(y).slice(2)}`;

// Same category-string convention as finance.ts's COGS/opex classification
// (see classifyExpenseLine) -- asset purchases are investing activity, loan
// principal repayments are financing activity (the full paid amount here,
// not just the interest portion P&L uses -- this is a cash-basis table, and
// principal really did leave the bank account), everything else paying to
// run the business day-to-day is operating.
function classifyCashActivity(category: string | undefined): 'operating' | 'investing' | 'financing' {
    const cat = (category || '').toLowerCase();
    if (cat === 'loan repayment') return 'financing';
    if (cat.includes('asset')) return 'investing';
    return 'operating';
}

function monthlyCashFlowPoints(transactions: Transaction[]): CashFlowTrendPoint[] {
    const buckets = new Map<string, { in: number; out: number; opOut: number; invOut: number; finOut: number }>();
    for (const t of transactions) {
        if ((t.status ?? 'paid') !== 'paid') continue; // only money that actually moved
        if (!t.date || t.date.length < 7) continue;
        const month = t.date.slice(0, 7);
        if (!buckets.has(month)) buckets.set(month, { in: 0, out: 0, opOut: 0, invOut: 0, finOut: 0 });
        const b = buckets.get(month)!;
        if (t.type === 'income') {
            b.in += (t.amount ?? 0);
        } else {
            const amt = (t.amount ?? 0);
            b.out += amt;
            const activity = classifyCashActivity(t.category);
            if (activity === 'investing') b.invOut += amt;
            else if (activity === 'financing') b.finOut += amt;
            else b.opOut += amt;
        }
    }
    return Array.from(buckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, b]) => {
            const [y, mo] = month.split('-').map(Number);
            return {
                key: month, label: MONTH_SHORT(y, mo),
                cashIn: b.in, cashOut: b.out, netCashFlow: b.in - b.out,
                operatingOut: b.opOut, investingOut: b.invOut, financingOut: b.finOut,
            };
        });
}

function rollUp(monthly: CashFlowTrendPoint[], keyOf: (m: CashFlowTrendPoint) => string, labelOf: (key: string, m: CashFlowTrendPoint) => string): CashFlowTrendPoint[] {
    const buckets = new Map<string, { label: string; in: number; out: number; opOut: number; invOut: number; finOut: number }>();
    for (const m of monthly) {
        const key = keyOf(m);
        if (!buckets.has(key)) buckets.set(key, { label: labelOf(key, m), in: 0, out: 0, opOut: 0, invOut: 0, finOut: 0 });
        const b = buckets.get(key)!;
        b.in += m.cashIn;
        b.out += m.cashOut;
        b.opOut += m.operatingOut;
        b.invOut += m.investingOut;
        b.finOut += m.financingOut;
    }
    return Array.from(buckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, b]) => ({
            key, label: b.label,
            cashIn: b.in, cashOut: b.out, netCashFlow: b.in - b.out,
            operatingOut: b.opOut, investingOut: b.invOut, financingOut: b.finOut,
        }));
}

export function computeCashFlowTrend(grouping: CashFlowPeriodGrouping, transactions: Transaction[]): CashFlowTrendPoint[] {
    const monthly = monthlyCashFlowPoints(transactions);
    if (grouping === 'monthly' || monthly.length === 0) return monthly;

    if (grouping === 'quarterly') {
        return rollUp(
            monthly,
            m => { const [y, mo] = m.key.split('-').map(Number); return `${y}-Q${Math.ceil(mo / 3)}`; },
            (key, m) => { const [y, mo] = m.key.split('-').map(Number); return `Q${Math.ceil(mo / 3)} ${y}`; },
        );
    }

    // yearly
    return rollUp(monthly, m => m.key.slice(0, 4), key => key);
}
