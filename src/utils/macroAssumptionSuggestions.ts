import { MacroDriver } from '../types';

export interface MacroAssumptionSuggestion {
    driver: MacroDriver;
    label: string;
    prompt: string;   // the question to ask, for someone with no macroeconomics background
    whereToCheck: string;
}

// Most SME owners don't track "macroeconomic assumptions" as a category of
// thing they're supposed to know -- they just notice fuel got more
// expensive or the dollar moved. This turns "log an economic assumption"
// (a blank, intimidating ask for a non-Unknown reader) into "here are the
// four things that most commonly move an SME's costs, and where to check
// each one" -- concrete enough to act on without any prior finance
// knowledge. Values are round, easy-to-reason-about defaults the user
// overwrites with their own real figure; nothing here is ever submitted
// on the user's behalf.
export const MACRO_ASSUMPTION_SUGGESTIONS: MacroAssumptionSuggestion[] = [
    {
        driver: 'energy',
        label: 'Fuel / diesel price',
        prompt: 'Has the price of fuel, diesel, or the generator you run on gone up recently?',
        whereToCheck: 'Compare this month\'s pump price at the station you actually use against 3 months ago.',
    },
    {
        driver: 'fx',
        label: 'Exchange rate',
        prompt: 'Do you buy any stock, materials, or equipment priced in a foreign currency (e.g. USD)?',
        whereToCheck: 'Check the exchange rate you paid on your last import/foreign-currency purchase vs. a few months back.',
    },
    {
        driver: 'interestRate',
        label: 'Loan / borrowing rate',
        prompt: 'If you took a new loan today, would the interest rate be higher than your existing one?',
        whereToCheck: 'Ask your bank or check what rate is currently advertised for a loan like yours.',
    },
    {
        driver: 'inflation',
        label: 'General cost of living',
        prompt: 'Are your suppliers charging more for the same goods than they did a few months ago?',
        whereToCheck: 'Compare a recent supplier invoice to one from 3-6 months ago for the same item.',
    },
];
