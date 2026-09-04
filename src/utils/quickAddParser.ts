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
 */

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

// Picks the largest number in the text as the amount -- in casual retail
// phrasing ("Sold 3 bags of rice for 15000") the transaction amount is
// almost always the biggest figure, while quantities/unit prices are small.
// Supports a trailing k/K suffix ("15k") and comma-grouped or currency-
// prefixed numbers ("₦15,000").
function extractAmount(text: string): { amount: number | null; start: number; end: number } {
    const re = /[₦$€£]?\s*(\d[\d,]*(?:\.\d+)?)\s*(k\b|K\b)?/g;
    let best: { amount: number; start: number; end: number } | null = null;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        let n = parseFloat(m[1].replace(/,/g, ''));
        if (isNaN(n) || n === 0) continue;
        if (m[2]) n *= 1000;
        if (!best || n > best.amount) best = { amount: n, start: m.index, end: m.index + m[0].length };
    }
    if (!best) return { amount: null, start: -1, end: -1 };
    return best;
}

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

    // Strip the matched amount token out of the description, drop leftover
    // connective words ("for 15000" -> just remove "for" too), collapse
    // whitespace, and capitalize the first letter so it reads like a real
    // transaction description rather than a sentence fragment.
    let description = start >= 0 ? trimmed.slice(0, start) + trimmed.slice(end) : trimmed;
    description = description
        .replace(/\s+/g, ' ')
        .replace(/^\s*(for|of|at|-|:)\s+/i, '')
        .replace(/\s+(for|of|at)\s*$/i, '')
        .trim();
    if (description) description = description[0].toUpperCase() + description.slice(1);

    return { type, amount, description: description || trimmed, confidentType };
}
