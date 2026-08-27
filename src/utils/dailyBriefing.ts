/**
 * Morning briefing -- "what does this business need to do today, and why."
 * Deliberately thin: reuses dashboardPriorities.ts's already-ranked real
 * priority list (never recomputes alerts here) and weekdayPattern.ts's
 * already-detected day-of-week shape. This file's only job is composing
 * those into a short, same-day-actionable message -- it never invents a
 * priority or a pattern of its own.
 *
 * Always returns something real to say, even with zero urgent items: "no
 * fires today" is itself useful information for a business owner deciding
 * how to spend the morning, so this is never gated behind an "unavailable"
 * state the way a detection engine would be.
 */

import { PriorityItem } from './dashboardPriorities';
import { WeekdayPatternResult } from './weekdayPattern';

export interface DailyBriefingResult {
    title: string;
    body: string;
    topPriorities: PriorityItem[]; // capped at 3, for in-app rendering alongside the text
    weekdayNote: string | null;
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

export function buildDailyBriefing(
    priorities: PriorityItem[],
    weekdayPattern: WeekdayPatternResult,
    now: Date = new Date(),
): DailyBriefingResult {
    const topPriorities = priorities.slice(0, MAX_PRIORITIES);
    const weekdayNote = weekdayNoteFor(weekdayPattern, now);

    const bodyParts: string[] = [];
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
    };
}
