/**
 * AI-powered transaction categorization -- the LLM-backed successor to the
 * keyword-only CATEGORY_RULES engine in transactionCategorization.ts. That
 * engine can only recognize a description containing one of its hardcoded
 * keywords, so anything else (a vendor's name, an unusual phrasing) falls
 * through to "Other Expense"/"Other Income", flagged for review. This calls
 * a real model instead, so it can reason about the sentence itself.
 *
 * Calls supabase.functions.invoke('categorize-transaction'), the exact same
 * pattern aiAdvisor.ts and statementScan.ts use -- Claude runs server-side
 * (see supabase/functions/categorize-transaction) so no API key reaches the
 * client. Opt-in only (called from a button tap, never on every keystroke):
 * unlike the free, instant, offline keyword engine, this costs latency and
 * an API call per suggestion.
 */

import { supabase } from './supabase';

export interface AICategorizationResult {
    category: string;
    confidence: 'high' | 'medium' | 'low';
    reasoning: string;
}

export async function categorizeTransactionAI(
    description: string,
    direction: 'income' | 'expense',
    industry?: string,
    recentCategories?: string[],
): Promise<AICategorizationResult> {
    const { data, error } = await supabase.functions.invoke('categorize-transaction', {
        body: { description, direction, industry, recentCategories },
    });
    if (error) {
        // Same FunctionsHttpError unwrap aiAdvisor.ts/statementScan.ts use --
        // the edge function always replies with a JSON { error } body on
        // failure. .context is only a real Response for an actual HTTP
        // error reply; a network-level failure (e.g. unreachable Supabase
        // project) sets it to something else entirely, so check for a real
        // .json() before calling it instead of throwing a confusing
        // "not a function" error.
        const errResponse = (error as { context?: Response }).context;
        if (errResponse && typeof errResponse.json === 'function') {
            const body = await errResponse.json().catch(() => null);
            if (body?.error) throw new Error(body.error);
        }
        throw new Error(error.message || 'Could not reach AI categorization.');
    }

    if (!data?.category) throw new Error('AI categorization could not answer right now — try again shortly.');

    return {
        category: data.category,
        confidence: data.confidence === 'high' || data.confidence === 'medium' || data.confidence === 'low' ? data.confidence : 'low',
        reasoning: typeof data.reasoning === 'string' ? data.reasoning : '',
    };
}
