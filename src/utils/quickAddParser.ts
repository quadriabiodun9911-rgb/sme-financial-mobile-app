/**
 * Lightweight, fully offline parser for Quick Add's free-text entry --
 * "Sold 3 bags of rice for 15000" or "Paid transport 2000" -- into a
 * type + amount + description guess, so logging a sale is one sentence
 * instead of filling in four separate fields by hand.
 *
 * Deliberately no AI call here: this drives a live preview on every
 * keystroke, so it has to be instant and work fully offline. The existing
 * "Suggest category with AI" flow (aiCategorization.ts) already covers the
 * case where a real model's read on the category is worth the latency --
 * this only ever guesses direction, amount, and a cleaned-up description,
 * and always shows its guess back to the user to confirm or correct rather
 * than silently trusting it.
 *
 * Designed as the landing point for other input channels, not just typing:
 * a future voice note only needs an external transcription step (e.g.
 * Whisper/Deepgram -- not wired up yet, needs a provider decision + API
 * key) to turn speech into text, then hand that text to this same function
 * exactly like a typed sentence. A photographed receipt is a different
 * shape -- reuse statementScan.ts's scanStatementImage (already handles
 * documentType: 'receipt') instead, since the AI there extracts a
 * structured {date, description, amount, direction} directly from the
 * image and can populate Quick Add's fields straight from that, with no
 * need to round-trip through this text parser at all.
 */

import { extractAmount, stripSpanAndClean } from './textCaptureShared';

export interface ParsedQuickAdd {
    type: 'income' | 'expense';
    amount: number | null;
    description: string;
    /** False when direction had to be guessed rather than clearly stated in
     * the text -- callers should make the guess visibly editable rather
     * than trusting it silently. */
    confidentType: boolean;
}

const INCOME_WORDS = [
    'sold', 'sale', 'sales', 'received', 'receive', 'got paid', 'paid me',
    'customer paid', 'client paid', 'deposit', 'earned', 'collected',
    'income', 'revenue', 'payment received', 'invoice paid',
];
const EXPENSE_WORDS = [
    'paid', 'pay', 'bought', 'buy', 'purchase', 'purchased', 'spent', 'spend',
    'cost', 'expense', 'restock', 'stock up', 'fuel', 'transport', 'rent',
    'salary', 'salaries', 'wage', 'wages', 'bill', 'fee', 'repair',
];

export function parseQuickAddText(text: string): ParsedQuickAdd {
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();

    const { amount, start, end } = extractAmount(trimmed);

    // Presence, not a keyword count -- several words in each list are
    // substrings of others in the same list ("paid" inside "customer paid",
    // "receive" inside "received"), so counting matches would double-count
    // a single concept and could tip a genuine tie toward whichever list
    // happens to have more overlapping stems.
    const incomePresent = INCOME_WORDS.some(w => lower.includes(w));
    const expensePresent = EXPENSE_WORDS.some(w => lower.includes(w));

    const type: 'income' | 'expense' = incomePresent && !expensePresent ? 'income' : 'expense';
    const confidentType = incomePresent !== expensePresent;

    const description = stripSpanAndClean(trimmed, { start, end });

    return { type, amount, description: description || trimmed, confidentType };
}
