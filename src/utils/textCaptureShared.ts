/**
 * Shared plumbing for every "type a sentence" quick-add parser across the
 * app (transactions, assets, loans, ...) -- picking the amount out of free
 * text and cleaning up whatever's left into a usable label. Kept in one
 * place so every entity's parser reads a number the same way, and a fix to
 * one (e.g. a currency symbol it didn't recognize) fixes all of them at
 * once, instead of drifting apart across separately-copied regexes.
 *
 * Same "landing point for other input channels" design as
 * quickAddParser.ts -- a future voice transcript is still just text and
 * goes through the same entity-specific parser built on these helpers; a
 * photographed document goes through statementScan.ts's AI extraction
 * instead, which returns structured fields directly and skips this text
 * parsing entirely.
 */

export interface ExtractedAmount {
    amount: number | null;
    start: number;
    end: number;
}

// Picks the largest number in the text as the amount -- in casual phrasing
// ("Sold 3 bags of rice for 15000", "Bought a laptop for 350000") the
// actual amount is almost always the biggest figure, while quantities/unit
// prices/percentages are small. Supports a trailing k/K suffix ("15k") and
// comma-grouped or currency-prefixed numbers ("₦15,000").
export function extractAmount(text: string): ExtractedAmount {
    const re = /[₦$€£]?\s*(\d[\d,]*(?:\.\d+)?)\s*(k\b|K\b)?/g;
    let best: ExtractedAmount | null = null;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        let n = parseFloat(m[1].replace(/,/g, ''));
        if (isNaN(n) || n === 0) continue;
        if (m[2]) n *= 1000;
        if (!best || n > best.amount!) best = { amount: n, start: m.index, end: m.index + m[0].length };
    }
    return best ?? { amount: null, start: -1, end: -1 };
}

// Strips a matched span (typically an extracted amount) out of the text,
// drops leading filler words the caller names (e.g. "bought", "borrowed"),
// drops leftover connective words at either edge ("for 15000" -> just
// remove "for" too), collapses whitespace, and capitalizes the first
// letter so the remainder reads like a real label instead of a sentence
// fragment.
export function stripSpanAndClean(text: string, span: { start: number; end: number }, leadingWordsToStrip: string[] = []): string {
    let out = span.start >= 0 ? text.slice(0, span.start) + text.slice(span.end) : text;
    out = out.replace(/\s+/g, ' ').trim();
    if (leadingWordsToStrip.length > 0) {
        const pattern = new RegExp(`^(${leadingWordsToStrip.join('|')})\\s+`, 'i');
        out = out.replace(pattern, '');
    }
    out = out
        .replace(/^\s*(a|an|the|for|of|at|from|-|:)\s+/i, '')
        .replace(/\s+(for|of|at|from)\s*$/i, '')
        .trim();
    if (out) out = out[0].toUpperCase() + out.slice(1);
    return out;
}
