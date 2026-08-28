/**
 * Evening recap -- "here's what today actually did, and how it compares to
 * a typical day like it." Deliberately thin, same discipline as
 * behavioralProfile.ts: reuses trendAnalysis.ts's own daily bucket for
 * today's real numbers and weekdayPattern.ts's own per-weekday baseline for
 * the comparison, and accepts an already-built behavioral narrative and an
 * optional budget/goal note from the caller rather than recomputing either
 * (Budget and Goal status are BudgetScreen's and GoalsScreen's own domain).
 *
 * Unlike dailyBriefing.ts, this can be genuinely unavailable: a day with no
 * transactions logged has nothing real to recap, and this says exactly
 * that instead of reporting a fabricated zero as if it meant something.
 */

import { Transaction } from '../types';
import { computeDailyTrend } from './trendAnalysis';
import { WeekdayPatternResult } from './weekdayPattern';

export interface DailyRecapResult {
    available: boolean;
    title: string;
    body: string;
    todayRevenue: number;
    todayExpense: number;
    todayProfit: number;
    vsTypicalWeekdayPct: number | null; // null when weekdayPattern has no baseline for today
}

export function buildDailyRecap(
    transactions: Transaction[],
    weekdayPattern: WeekdayPatternResult,
    behavioralNarrative: string | null,
    budgetGoalNote: string | null,
    currency: string,
    now: Date = new Date(),
): DailyRecapResult {
    // Local Y-M-D, not toISOString() -- toISOString() converts to UTC, which
    // reports yesterday's date for part of the local day in any positive
    // UTC offset (e.g. Nigeria, WAT = UTC+1), so a recap run soon after
    // local midnight would look up the wrong day's bucket.
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const today = computeDailyTrend(transactions).find(d => d.date === todayStr);

    if (!today || (today.revenue === 0 && today.expense === 0)) {
        return {
            available: false,
            title: "Today's recap",
            body: 'Nothing logged today yet -- add a transaction and this will fill in.',
            todayRevenue: 0,
            todayExpense: 0,
            todayProfit: 0,
            vsTypicalWeekdayPct: null,
        };
    }

    let vsTypicalWeekdayPct: number | null = null;
    const weekdayComparison: string[] = [];
    if (weekdayPattern.available) {
        const todayIndex = weekdayPattern.indices.find(i => i.weekday === now.getDay());
        const typicalRevenue = todayIndex ? weekdayPattern.overallAvgDailyRevenue * todayIndex.revenueIndex : 0;
        if (typicalRevenue > 0) {
            vsTypicalWeekdayPct = ((today.revenue - typicalRevenue) / typicalRevenue) * 100;
            const direction = vsTypicalWeekdayPct >= 0 ? 'above' : 'below';
            weekdayComparison.push(`That's ${Math.abs(Math.round(vsTypicalWeekdayPct))}% ${direction} a typical ${todayIndex!.weekdayName} for this business.`);
        }
    }

    const bodyParts: string[] = [
        `Today: ${currency}${Math.round(today.revenue).toLocaleString()} in, ${currency}${Math.round(today.expense).toLocaleString()} out, ${currency}${Math.round(today.profit).toLocaleString()} profit.`,
        ...weekdayComparison,
    ];
    if (budgetGoalNote) bodyParts.push(budgetGoalNote);
    if (behavioralNarrative) bodyParts.push(behavioralNarrative);

    return {
        available: true,
        title: "Today's recap",
        body: bodyParts.join(' '),
        todayRevenue: today.revenue,
        todayExpense: today.expense,
        todayProfit: today.profit,
        vsTypicalWeekdayPct,
    };
}
