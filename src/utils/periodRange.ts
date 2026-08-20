import { Transaction } from '../types';

export interface WeekRanges {
    weekStartStr: string;
    todayStr: string;
    lastWeekStartStr: string;
    lastWeekEndStr: string;
}

/**
 * The canonical "this week vs last week" boundary — Sunday-start, so every
 * screen that reports on "this week" (Weekly CFO Summary, Weekly Dashboard,
 * etc.) agrees on exactly the same days. Previously this date math was
 * copy-pasted independently in finance.ts and weeklySummary.ts; a fix to one
 * would silently diverge from the other.
 *
 * lastWeekEnd is capped to the SAME NUMBER OF ELAPSED DAYS as this week —
 * not the full previous week — so e.g. 4 days into this week is compared
 * against the same first 4 days of last week, not all 7. Comparing a
 * partial current week against a full previous week made "this week" look
 * like it was underperforming purely because fewer days had elapsed,
 * regardless of actual pace (WeeklyDashboardScreen's own copy already
 * claimed "comparisons are against the same days last week" — this makes
 * that true).
 */
export function getWeekRanges(referenceDate: Date = new Date()): WeekRanges {
    const today = referenceDate;
    const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay());
    const lastWeekStart = new Date(weekStart); lastWeekStart.setDate(weekStart.getDate() - 7);

    const daysElapsed = Math.floor((today.getTime() - weekStart.getTime()) / 86400000) + 1;
    const lastWeekEnd = new Date(lastWeekStart); lastWeekEnd.setDate(lastWeekStart.getDate() + daysElapsed - 1);

    return {
        weekStartStr: weekStart.toISOString().split('T')[0],
        todayStr: today.toISOString().split('T')[0],
        lastWeekStartStr: lastWeekStart.toISOString().split('T')[0],
        lastWeekEndStr: lastWeekEnd.toISOString().split('T')[0],
    };
}

export function transactionsInRange(transactions: Transaction[], startStr: string, endStr: string): Transaction[] {
    return transactions.filter(t => t.date >= startStr && t.date <= endStr);
}

export function sumByType(transactions: Transaction[], type: 'income' | 'expense'): number {
    return transactions.filter(t => t.type === type).reduce((s, t) => s + (t.amount ?? 0), 0);
}
