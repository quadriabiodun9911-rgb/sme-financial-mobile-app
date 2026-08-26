import AsyncStorage from '@react-native-async-storage/async-storage';
import { Invoice } from '../types';
import { DEFAULT_THRESHOLDS } from './alertEngine';

// Escalating follow-up points -- 1x/2x/4x the same overdue threshold the
// alert bell already uses (7/14/28 days by default) -- so a reminder is
// offered again as an invoice gets progressively more overdue instead of
// once and never again.
const MILESTONE_MULTIPLIERS = [1, 2, 4];

// invoiceId -> milestone day-counts already reminded at, e.g. { 'inv-1': [7, 14] }.
export type InvoiceReminderState = Record<string, number[]>;

const STORAGE_KEY = '@quad360/invoice_reminder_state';

export async function loadReminderState(): Promise<InvoiceReminderState> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

export async function markReminderSent(invoiceId: string, milestone: number): Promise<InvoiceReminderState> {
    const state = await loadReminderState();
    const sent = state[invoiceId] ?? [];
    if (sent.includes(milestone)) return state;

    const next = { ...state, [invoiceId]: [...sent, milestone] };
    try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
        // Fail silently -- worst case the same reminder gets offered again
        // next time, which is better than losing the invoice's history.
    }
    return next;
}

export interface ReminderDue {
    invoice: Invoice;
    daysOverdue: number;
    milestone: number;
}

// Pure -- no IO -- so it can be unit tested with a plain state object
// instead of mocking AsyncStorage.
export function getInvoicesDueForReminder(
    invoices: Invoice[],
    state: InvoiceReminderState,
    baseThresholdDays: number = DEFAULT_THRESHOLDS.overdueInvoiceThreshold,
    now: Date = new Date()
): ReminderDue[] {
    const milestones = MILESTONE_MULTIPLIERS.map(m => baseThresholdDays * m);
    const due: ReminderDue[] = [];

    for (const invoice of invoices) {
        // Draft isn't sent yet and paid needs no follow-up; everything else
        // (sent, overdue) is a real invoice waiting on the client.
        if (invoice.status === 'paid' || invoice.status === 'draft') continue;
        if (!invoice.clientPhone) continue; // nothing to send a reminder to

        // `new Date(invoice.dueDate)` (a bare "YYYY-MM-DD" string) parses as
        // UTC midnight, not local midnight -- in any positive-UTC-offset
        // timezone (Nigeria, UAE, etc.) that shifts the reference point
        // within the day, and diffing it against the raw current
        // time-of-day (rather than today's local midnight) compounds it:
        // together they could under-count how many days an invoice has
        // been overdue by a full day, most visibly in the early morning.
        // Verified: an invoice due 4 calendar days ago computed as "3 days
        // overdue" at 3am in UTC+4. Both sides now anchor to local midnight.
        const dueDate = new Date(invoice.dueDate + 'T00:00:00');
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysOverdue < milestones[0]) continue;

        const sent = state[invoice.id] ?? [];
        // Furthest milestone already crossed that hasn't been reminded yet
        // -- if the app was only opened once a month and two milestones
        // were skipped, offer one reminder for the one actually reached
        // rather than queuing up every milestone in between.
        const nextMilestone = [...milestones].reverse().find(m => daysOverdue >= m && !sent.includes(m));
        if (nextMilestone !== undefined) {
            due.push({ invoice, daysOverdue, milestone: nextMilestone });
        }
    }

    return due.sort((a, b) => b.daysOverdue - a.daysOverdue);
}
