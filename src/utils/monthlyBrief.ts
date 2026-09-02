/**
 * Monthly CEO/CFO Brief -- the same "how did the business do this month"
 * question MonthlyReview.tsx already answers on demand, but delivered
 * automatically at the start of a new month (as a push notification, see
 * notifications.ts's scheduleMonthlyBrief) recapping the month that just
 * closed, instead of waiting for the owner to think to open the app and tap
 * into it. Reuses computeAllTimeMonthlyBuckets (trendAnalysis.ts) for the
 * real revenue/profit numbers -- no separate calculation, so this can never
 * disagree with what Reports or MonthlyReview would show for the same
 * month.
 */

import { Transaction, Invoice } from '../types';
import { computeAllTimeMonthlyBuckets } from './trendAnalysis';

export interface MonthlyBriefResult {
    available: boolean;
    title: string;
    body: string;
    month: string; // 'YYYY-MM' -- the month being recapped (the one that just closed)
    revenue: number;
    expense: number;
    profit: number;
    profitDeltaPct: number | null; // vs the month before; null when there's no prior month or it was exactly zero
    overdueInvoiceCount: number;
    overdueInvoiceAmount: number;
    topExpenseCategory: string | null;
}

function monthLabel(month: string): string {
    const [y, m] = month.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString('default', { month: 'long' });
}

export function buildMonthlyBrief(
    transactions: Transaction[],
    invoices: Invoice[],
    currency: string,
    now: Date = new Date(),
): MonthlyBriefResult {
    // The month that just closed -- if "now" is anytime in September, that's
    // August, regardless of which day of September it currently is.
    const closedMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const closedMonth = `${closedMonthDate.getFullYear()}-${String(closedMonthDate.getMonth() + 1).padStart(2, '0')}`;

    const buckets = computeAllTimeMonthlyBuckets(transactions);
    const bucketIndex = buckets.findIndex(b => b.month === closedMonth);
    const thisBucket = bucketIndex >= 0 ? buckets[bucketIndex] : null;

    if (!thisBucket || (thisBucket.revenue === 0 && thisBucket.expense === 0)) {
        return {
            available: false,
            title: `Your ${monthLabel(closedMonth)} brief`,
            body: 'Nothing was logged last month -- add transactions and this will fill in next month.',
            month: closedMonth,
            revenue: 0, expense: 0, profit: 0, profitDeltaPct: null,
            overdueInvoiceCount: 0, overdueInvoiceAmount: 0, topExpenseCategory: null,
        };
    }

    const priorBucket = bucketIndex > 0 ? buckets[bucketIndex - 1] : null;
    const profitDeltaPct = priorBucket && priorBucket.profit !== 0
        ? ((thisBucket.profit - priorBucket.profit) / Math.abs(priorBucket.profit)) * 100
        : null;

    const overdue = invoices.filter(i => i.status === 'overdue');
    const overdueInvoiceAmount = overdue.reduce((s, i) => s + i.total, 0);

    const catMap: Record<string, number> = {};
    transactions
        .filter(t => t.type === 'expense' && (t.date ?? '').startsWith(closedMonth))
        .forEach(t => {
            const cat = t.category || 'Uncategorized';
            catMap[cat] = (catMap[cat] || 0) + (Number(t.amount) || 0);
        });
    const topExpenseCategory = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    const bodyParts: string[] = [
        `${monthLabel(closedMonth)}: ${currency}${Math.round(thisBucket.revenue).toLocaleString()} in, ${currency}${Math.round(thisBucket.profit).toLocaleString()} profit.`,
    ];
    if (profitDeltaPct !== null) {
        bodyParts.push(`Profit ${profitDeltaPct >= 0 ? 'up' : 'down'} ${Math.abs(Math.round(profitDeltaPct))}% vs the month before.`);
    }
    if (overdue.length > 0) {
        bodyParts.push(`${overdue.length} invoice${overdue.length === 1 ? '' : 's'} overdue (${currency}${Math.round(overdueInvoiceAmount).toLocaleString()}).`);
    }

    return {
        available: true,
        title: `Your ${monthLabel(closedMonth)} brief 📊`,
        body: bodyParts.join(' '),
        month: closedMonth,
        revenue: thisBucket.revenue,
        expense: thisBucket.expense,
        profit: thisBucket.profit,
        profitDeltaPct,
        overdueInvoiceCount: overdue.length,
        overdueInvoiceAmount,
        topExpenseCategory,
    };
}
