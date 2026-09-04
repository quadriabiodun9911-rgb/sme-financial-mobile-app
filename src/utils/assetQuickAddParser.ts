/**
 * Same offline, one-sentence quick-add pattern as quickAddParser.ts, applied
 * to Assets: "Bought a laptop for 350000" -> a name + cost guess, so adding
 * an asset can start from a sentence instead of two separate fields.
 *
 * Deliberately narrow -- category, useful life, and residual value are
 * judgment calls the form still asks for explicitly (see
 * AssetsScreen.openAddFromTransaction, which prefills the same two fields
 * from a bank-statement match and leaves the rest at their defaults for the
 * same reason). No AI call: this drives a live preview on every keystroke.
 *
 * Same "landing point for other input channels" design as quickAddParser.ts
 * -- a future voice transcript is just text and goes through this same
 * function; a photographed receipt for an asset purchase instead reuses
 * statementScan.ts's structured extraction and skips this text parsing.
 */

import { extractAmount, stripSpanAndClean } from './textCaptureShared';

export interface ParsedAssetQuickAdd {
    name: string;
    cost: number | null;
}

const LEADING_WORDS = ['bought', 'buy', 'purchased', 'purchase', 'got', 'acquired', 'new'];

export function parseAssetQuickAddText(text: string): ParsedAssetQuickAdd {
    const trimmed = text.trim();
    const { amount, start, end } = extractAmount(trimmed);
    const name = stripSpanAndClean(trimmed, { start, end }, LEADING_WORDS);
    return { name: name || trimmed, cost: amount };
}
