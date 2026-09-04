/**
 * Same offline, one-sentence quick-add pattern as the other quick-add
 * parsers, applied to Invoices: "Invoice Chidinma 45000 for rice due in 7
 * days" -> a client + amount + description + due-in-days guess, as a
 * simplified single-line-item alternative to the full itemized invoice
 * form (still available for anyone who needs more than one line item, tax
 * rates, or the other invoice fields).
 *
 * Returns a day offset rather than a resolved date so the parser stays a
 * pure function of the text -- the caller adds it to "today" using its own
 * date utility (localDateStr) when applying the guess to the form.
 *
 * Same "landing point for other input channels" design as the other
 * quick-add parsers -- a future voice transcript is just text and goes
 * through this same function.
 */

import { extractAmount } from './textCaptureShared';

export interface ParsedInvoiceQuickAdd {
    clientName: string;
    amount: number | null;
    description: string;
    dueInDays: number | null;
}

const LEADING_VERBS = /^\s*(invoice|invoiced|bill|billed|billing)\s+/i;

export function parseInvoiceQuickAddText(text: string): ParsedInvoiceQuickAdd {
    const trimmed = text.trim();
    let rest = trimmed.replace(LEADING_VERBS, '');

    let dueInDays: number | null = null;
    const dueMatch = rest.match(/\bdue\s+(?:in\s+)?(\d+)\s*(days|day|weeks|week)\b/i);
    if (dueMatch && dueMatch.index !== undefined) {
        const n = parseInt(dueMatch[1], 10);
        dueInDays = dueMatch[2].toLowerCase().startsWith('week') ? n * 7 : n;
        rest = rest.slice(0, dueMatch.index) + rest.slice(dueMatch.index + dueMatch[0].length);
    }

    let description = '';
    let beforeFor = rest;
    const forMatch = rest.match(/\bfor\s+(.+)$/i);
    if (forMatch && forMatch.index !== undefined) {
        description = forMatch[1].trim();
        beforeFor = rest.slice(0, forMatch.index);
    }

    const { amount, start, end } = extractAmount(beforeFor);
    let clientName = start >= 0 ? beforeFor.slice(0, start) + beforeFor.slice(end) : beforeFor;
    clientName = clientName.replace(/\s+/g, ' ').trim();

    return { clientName, amount, description, dueInDays };
}
