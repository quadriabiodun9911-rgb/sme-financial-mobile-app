/**
 * Morning briefing -- "what does this business need to do today, and why,"
 * plus the daily financial pulse: yesterday's numbers and the current cash
 * position, the same content a WhatsApp "good morning" message would carry
 * (see whatsapp-webhook's header for that channel), delivered locally for
 * now since nothing needs a live WhatsApp sender to show it in-app.
 *
 * Deliberately thin on the priorities half: reuses dashboardPriorities.ts's
 * already-ranked real priority list (never recomputes alerts here) and
 * weekdayPattern.ts's already-detected day-of-week shape. This file's job
 * is composing those, plus the pulse numbers a caller hands in, into one
 * short, same-day-actionable message -- it never invents a priority, a
 * pattern, or a number of its own.
 *
 * Always returns something real to say, even with zero urgent items: "no
 * fires today" is itself useful information for a business owner deciding
 * how to spend the morning, so this is never gated behind an "unavailable"
 * state the way a detection engine would be.
 */

import { PriorityItem } from './dashboardPriorities';
import { WeekdayPatternResult } from './weekdayPattern';

// Only the numbers this file can't compute itself -- yesterday's actual
// revenue/expense bucket (computeDailyTrend, trendAnalysis.ts) and the
// current cash position (finance.ts / cashRunway.ts), both already
// computed once per Dashboard render. Kept separate from priorities/
// weekdayPattern above since those are themselves already-built engines
// this file composes, while these are just numbers.
export interface DailyPulseInput {
    yesterdayRevenue: number;
    yesterdayExpense: number;
    cashBalance: number;
    runwayDays: number | null; // null = no meaningful burn rate to project from (see cashRunway.ts)
    currency: string;
    businessName?: string;
}

export interface DailyPulse {
    yesterdayRevenue: number;
    yesterdayExpense: number;
    netMovement: number;
    cashBalance: number;
    runwayDays: number | null;
    currency: string;
}

export interface DailyBriefingResult {
    title: string;
    body: string;
    topPriorities: PriorityItem[]; // capped at 3, for in-app rendering alongside the text
    weekdayNote: string | null;
    pulse: DailyPulse;
    greeting: string; // "Good morning" / "Good morning, <Business Name>" -- for the in-app card's header
}

const MAX_PRIORITIES = 3;

function weekdayNoteFor(pattern: WeekdayPatternResult, now: Date): string | null {
    if (!pattern.available) return null;
    const today = pattern.indices.find(i => i.weekday === now.getDay());
    if (!today) return null;

    if (today.revenueIndex <= 0.05) {
        return `${today.weekdayName}s historically bring in almost no revenue for this business -- a good day for stock, admin, or supplier calls instead of expecting sales to carry it.`;
    }
    if (today.revenueIndex <= 0.85) {
        return `${today.weekdayName}s historically run below average here -- keep discretionary spend light today.`;
    }
    if (today.revenueIndex >= 1.15) {
        return `${today.weekdayName}s are historically this business's strongest day -- make sure stock and staffing can handle it.`;
    }
    return null;
}

// A short, single-line cash pulse for the push notification body -- the
// full breakdown (money in/out, net movement, cash, runway, each on their
// own line) is a rich in-app card's job, not a phone notification's, which
// most OSes truncate well before a five-line emoji block would finish
// rendering. See DailyPulseCard for that fuller view.
function pulseLine(pulse: DailyPulse): string {
    const netSign = pulse.netMovement >= 0 ? '+' : '-';
    const runwayPart = pulse.runwayDays !== null ? `, ${pulse.runwayDays}d runway` : '';
    return `Cash: ${pulse.currency}${Math.round(pulse.cashBalance).toLocaleString()}${runwayPart}. Yesterday: ${netSign}${pulse.currency}${Math.round(Math.abs(pulse.netMovement)).toLocaleString()} net.`;
}

export function buildDailyBriefing(
    priorities: PriorityItem[],
    weekdayPattern: WeekdayPatternResult,
    pulseInput: DailyPulseInput,
    now: Date = new Date(),
): DailyBriefingResult {
    const topPriorities = priorities.slice(0, MAX_PRIORITIES);
    const weekdayNote = weekdayNoteFor(weekdayPattern, now);

    const pulse: DailyPulse = {
        yesterdayRevenue: pulseInput.yesterdayRevenue,
        yesterdayExpense: pulseInput.yesterdayExpense,
        netMovement: pulseInput.yesterdayRevenue - pulseInput.yesterdayExpense,
        cashBalance: pulseInput.cashBalance,
        runwayDays: pulseInput.runwayDays,
        currency: pulseInput.currency,
    };

    const bodyParts: string[] = [pulseLine(pulse)];
    if (topPriorities.length > 0) {
        const first = topPriorities[0];
        bodyParts.push(`${first.title}${first.subtitle ? ` -- ${first.subtitle}` : ''}.`);
        if (topPriorities.length > 1) {
            bodyParts.push(`Plus ${topPriorities.length - 1} more thing${topPriorities.length - 1 === 1 ? '' : 's'} worth a look today.`);
        }
    } else {
        bodyParts.push('Nothing urgent flagged for today.');
    }
    if (weekdayNote) bodyParts.push(weekdayNote);

    const title = topPriorities.length > 0
        ? `${topPriorities.length} thing${topPriorities.length === 1 ? '' : 's'} for today`
        : 'Your morning check-in';

    return {
        title,
        body: bodyParts.join(' '),
        topPriorities,
        weekdayNote,
        pulse,
        greeting: pulseInput.businessName ? `Good morning, ${pulseInput.businessName}` : 'Good morning',
    };
}
