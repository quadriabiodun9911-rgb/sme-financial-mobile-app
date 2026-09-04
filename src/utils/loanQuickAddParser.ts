/**
 * Same offline, one-sentence quick-add pattern as quickAddParser.ts and
 * assetQuickAddParser.ts, applied to Loans: "Borrowed 500000 from GTBank at
 * 20% for 12 months" -> a lender + principal + rate + term guess, so adding
 * a loan can start from a sentence instead of four separate fields.
 *
 * Rate and term are pulled out with their own narrow patterns ("20%", "12
 * months") and their matched spans are removed before picking the
 * principal, specifically so a small rate or term number never gets mistaken
 * for the loan amount -- unlike quickAddParser.ts and assetQuickAddParser.ts,
 * where there's only ever one number in play and "largest number wins" is
 * enough by itself.
 *
 * Same "landing point for other input channels" design as the other
 * quick-add parsers -- a future voice transcript is just text and goes
 * through this same function; a photographed loan document/statement
 * instead reuses statementScan.ts's structured extraction where applicable.
 */

import { extractAmount } from './textCaptureShared';

export interface ParsedLoanQuickAdd {
    lenderName: string;
    principal: number | null;
    interestRate: number | null;
    termMonths: number | null;
}

interface Span { start: number; end: number; }

export function parseLoanQuickAddText(text: string): ParsedLoanQuickAdd {
    const trimmed = text.trim();
    const spans: Span[] = [];

    let interestRate: number | null = null;
    const rateMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*%/);
    if (rateMatch && rateMatch.index !== undefined) {
        interestRate = parseFloat(rateMatch[1]);
        spans.push({ start: rateMatch.index, end: rateMatch.index + rateMatch[0].length });
    } else if (/interest[- ]?free/i.test(trimmed)) {
        interestRate = 0;
    }

    let termMonths: number | null = null;
    const termMatch = trimmed.match(/(\d+)\s*(months|month|mos|mo|years|year|yrs|yr)\b/i);
    if (termMatch && termMatch.index !== undefined) {
        const n = parseInt(termMatch[1], 10);
        termMonths = termMatch[2].toLowerCase().startsWith('y') ? n * 12 : n;
        spans.push({ start: termMatch.index, end: termMatch.index + termMatch[0].length });
    }

    let lenderName = '';
    const lenderMatch = trimmed.match(/\bfrom\s+([A-Za-z][A-Za-z0-9&.,'-]*(?:\s+[A-Za-z0-9&.,'-]+)*?)(?=\s+(?:at|for|interest|@)\b|[.,]|$)/i);
    if (lenderMatch && lenderMatch.index !== undefined) {
        lenderName = lenderMatch[1].trim();
        spans.push({ start: lenderMatch.index, end: lenderMatch.index + lenderMatch[0].length });
    }

    // Remove the matched spans (rightmost first, so earlier offsets stay
    // valid) before picking the principal out of what's left.
    let remainder = trimmed;
    for (const span of spans.sort((a, b) => b.start - a.start)) {
        remainder = remainder.slice(0, span.start) + remainder.slice(span.end);
    }
    const { amount: principal } = extractAmount(remainder);

    return { lenderName, principal, interestRate, termMonths };
}
