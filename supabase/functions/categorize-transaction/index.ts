// Supabase Edge Function: categorize-transaction
//
// AI-powered transaction categorization -- the LLM-backed successor to the
// keyword-only CATEGORY_RULES engine in transactionCategorization.ts. That
// engine can only ever recognize a description that contains one of its
// hardcoded keywords ("furniture", "paystack fee", "pos trxn", ...); this
// endpoint reasons about the actual sentence, so "Adamu — Tuesday delivery"
// or "Reimbursed Ngozi for market run" can get a real category instead of
// silently falling through to "Other Expense" flagged for review.
//
// Same security shape as supabase/functions/advisor: verify the caller's
// JWT against the anon client, then do the privileged work (calling
// Anthropic with a secret key) with a secret only this function's
// environment has -- the API key never reaches the client.
//
// DEPLOYMENT (not done from this environment -- no Supabase CLI credentials
// here): from a machine with the project linked,
//   supabase functions deploy categorize-transaction
// ANTHROPIC_API_KEY is already set as a secret for the advisor/statement-scan
// functions and is shared across all edge functions in the same project, so
// no new secret is needed.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-5';
const MAX_DESCRIPTION_LEN = 300;
const MAX_RECENT_CATEGORIES = 20;
const MAX_CATEGORY_LEN = 60;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Forces a structured reply via tool_choice rather than parsing free text
// out of Claude's response -- the category name, confidence, and reasoning
// all need to land in predictable fields the client can render directly.
const CATEGORIZE_TOOL = {
  name: 'categorize_transaction',
  description: 'Return the best category for this business transaction.',
  input_schema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        description: 'A short, human-readable category name (2-4 words). Reuse one of recentCategories verbatim if it genuinely fits this transaction, rather than inventing a near-duplicate ("Sales" vs "Sale Revenue") -- consistency with the business\'s own existing categories matters more than a "better" new name.',
      },
      confidence: {
        type: 'string',
        enum: ['high', 'medium', 'low'],
        description: '"low" when the description is too generic/ambiguous ("Transfer", "Payment", "Misc") to categorize with real confidence.',
      },
      reasoning: {
        type: 'string',
        description: 'One short sentence (under 20 words) explaining the category choice, written for the business owner, not a developer.',
      },
    },
    required: ['category', 'confidence', 'reasoning'],
  },
};

function buildSystemPrompt(direction: string, industry: string | undefined, recentCategories: string[]): string {
  return `You categorize a single bank-transaction description for an SME's bookkeeping app. Call the categorize_transaction tool with your answer -- never reply in plain text.

This transaction is a${direction === 'income' ? 'n INCOME (money received)' : 'n EXPENSE (money paid out)'} transaction -- the category you choose must make sense for that direction (never categorize an income transaction as a cost/expense-shaped bucket like "Rent" or "Payroll", or vice versa).
${industry ? `\nThe business's registered industry is "${industry}" -- use that context (e.g. a Retail business's own "furniture"/"generator" purchase is very likely inventory restocking, not a capital asset purchase; a Food Service business's "family feeding" order is a meal-pack sale, not a personal expense) rather than assuming generic vocabulary always means the same thing it would for an unrelated business.` : ''}
${recentCategories.length > 0 ? `\nCategories this business has used recently: ${recentCategories.join(', ')}. Prefer reusing one of these when it genuinely fits.` : ''}

Never fabricate details not implied by the description itself -- if it's too vague to categorize with confidence, say so via a "low" confidence and a generic-but-honest category (e.g. "Uncategorized Expense"), rather than guessing specifics.`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await callerClient.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
    if (authError || !user) return json({ error: 'Not authenticated' }, 401);

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'AI categorization is not configured yet.' }, 503);

    const body = await req.json().catch(() => null);
    const description = body?.description;
    const direction = body?.direction;
    const industry = typeof body?.industry === 'string' ? body.industry : undefined;
    const recentCategoriesRaw = Array.isArray(body?.recentCategories) ? body.recentCategories : [];

    if (typeof description !== 'string' || !description.trim() || description.length > MAX_DESCRIPTION_LEN) {
      return json({ error: `Description must be 1-${MAX_DESCRIPTION_LEN} characters.` }, 400);
    }
    if (direction !== 'income' && direction !== 'expense') {
      return json({ error: 'direction must be "income" or "expense".' }, 400);
    }
    const recentCategories: string[] = recentCategoriesRaw
      .filter((c: unknown): c is string => typeof c === 'string' && c.trim().length > 0 && c.length <= MAX_CATEGORY_LEN)
      .slice(0, MAX_RECENT_CATEGORIES);

    const anthropicRes = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        system: buildSystemPrompt(direction, industry, recentCategories),
        messages: [{ role: 'user', content: `Transaction description: "${description.trim()}"` }],
        tools: [CATEGORIZE_TOOL],
        tool_choice: { type: 'tool', name: 'categorize_transaction' },
      }),
    });

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text();
      console.error('[categorize-transaction]', anthropicRes.status, errBody);
      return json({ error: 'AI categorization could not run right now — try again shortly.' }, 502);
    }

    const data = await anthropicRes.json();
    const toolUse = (data.content ?? []).find((block: { type: string }) => block.type === 'tool_use');
    const result = toolUse?.input;

    if (!result || typeof result.category !== 'string' || !result.category.trim()) {
      return json({ error: 'AI categorization could not answer right now — try again shortly.' }, 502);
    }

    return json({
      category: result.category.trim().slice(0, MAX_CATEGORY_LEN),
      confidence: ['high', 'medium', 'low'].includes(result.confidence) ? result.confidence : 'low',
      reasoning: typeof result.reasoning === 'string' ? result.reasoning.trim() : '',
    }, 200);
  } catch (e) {
    console.error('[categorize-transaction]', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
