// Plain-language definitions for financial terms that still show up on
// screen. Kept short and jargon-free on purpose — the point is to explain
// the term, not to sound technical about it. Add to this as new terms
// surface anywhere in the app; a screen should never show a term here
// without an InfoTip next to it.
export const GLOSSARY: Record<string, string> = {
    'Gross Margin': 'What is left from a sale after paying only the direct cost of making/getting the product or service — before rent, salaries, or other running costs.',
    'Operating Margin': 'What is left from your revenue after direct costs AND day-to-day running costs (rent, salaries, admin) — before non-cash items like depreciation.',
    'Cash Profit': 'Your operating profit with one non-cash cost (equipment losing value over time) added back — closer to actual cash generated than the accounting profit figure.',
    'Net Profit': 'What is truly left over after every cost is paid — the final, bottom-line number.',
    'DSCR': 'A simple test: can your monthly profit cover your loan repayments? Above 1x means yes; the higher above 1x, the safer.',
    'Runway': 'How many days your current cash would last if money stopped coming in but your spending stayed the same.',
    'Accounts Receivable': 'Money customers owe you for things you already delivered but they have not paid for yet.',
    'Accounts Payable': 'Money you owe suppliers for things you already received but have not paid for yet.',
    'Working Capital': 'The cash and near-cash you have available to run day-to-day operations — what customers owe you, minus what you owe suppliers.',
    'Break-Even': 'The sales level where you are neither making nor losing money — every sale after this point is profit.',
    'EBITDA': 'A profit figure before interest, tax, and equipment depreciation are subtracted — used to compare how the core business performs, ignoring financing and accounting choices.',
};
