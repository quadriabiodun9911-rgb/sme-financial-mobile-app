// Supabase Edge Function: statement-scan
//
// Lets a business owner photograph or upload a scanned/photographed bank
// statement, receipt, or invoice and get back structured transaction rows,
// instead of only being able to import a text-based CSV/Excel/PDF export
// (see ImportTransactionsScreen.tsx, which has no path for an image or a
// scanned/flattened PDF with no text layer). Same shape as the advisor
// function: verify the caller's JWT against the anon client, then do the
// privileged work (calling Anthropic with vision) with a secret only this
// function's environment has.
//
// Claude reads the image/PDF directly (no separate OCR provider) and
// returns transactions via forced tool use, which is far more reliable
// than asking it to emit raw JSON in a text reply.
//
// DEPLOYMENT (not done from this environment -- no Supabase CLI credentials
// here): from a machine with the project linked,
//   supabase functions deploy statement-scan
// Reuses the same ANTHROPIC_API_KEY secret already set for the advisor
// function -- nothing new to configure if that's already deployed.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-5';

// Anthropic's own per-image limit is 5MB binary; PDFs can go larger, but a
// single scanned statement has no business exceeding this either -- keep
// one ceiling for both so a huge upload fails fast with a clear message
// instead of timing out or getting silently rejected upstream.
const MAX_BASE64_LEN = 8_000_000; // ~6MB binary
const MAX_TRANSACTIONS = 300;

const ALLOWED_MEDIA_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
]);

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const SYSTEM_PROMPT = `You extract transaction line items from an image or PDF of a bank statement, till receipt, or invoice for a small business's bookkeeping app.

Rules:
- Only report rows you can actually read in the document. Never invent a transaction, date, or amount that isn't visibly present.
- If a figure is blurry, cut off, or ambiguous, either omit that row or include it and say so in "warning" -- do not guess a value to fill the gap.
- Skip non-transaction lines: running/opening/closing balance summaries, headers, footers, account numbers, page numbers.
- "amount" is always a positive number; put the direction (money in vs out) in "direction".
- "date" should be YYYY-MM-DD. If the year isn't printed on the page, infer it from context (e.g. a visible statement period) rather than guessing a specific day wrong; if you truly cannot determine a date, use today's date and mention it in "warning".
- If the image contains no legible transactions at all, return an empty transactions array and explain why in "warning".`;

const EXTRACT_TOOL = {
  name: 'extract_transactions',
  description: 'Report every distinct transaction line item found in the document.',
  input_schema: {
    type: 'object',
    properties: {
      documentType: {
        type: 'string',
        enum: ['bank_statement', 'receipt', 'invoice', 'unknown'],
      },
      transactions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'YYYY-MM-DD' },
            description: { type: 'string' },
            amount: { type: 'number', description: 'Always positive' },
            direction: { type: 'string', enum: ['income', 'expense'] },
          },
          required: ['date', 'description', 'amount', 'direction'],
        },
      },
      warning: {
        type: 'string',
        description: 'Any caveat about image quality, illegible rows, or uncertain dates. Omit if none.',
      },
    },
    required: ['documentType', 'transactions'],
  },
};

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
    const { data: { user }, error: authError } = await callerClient.auth.getUser();
    if (authError || !user) return json({ error: 'Not authenticated' }, 401);

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'Statement scanning is not configured yet.' }, 503);

    const body = await req.json().catch(() => null);
    const base64 = body?.base64;
    const mediaType = body?.mediaType;

    if (typeof base64 !== 'string' || !base64) {
      return json({ error: 'Missing image/PDF data.' }, 400);
    }
    if (base64.length > MAX_BASE64_LEN) {
      return json({ error: 'File is too large. Try a smaller photo or a lower-resolution scan.' }, 400);
    }
    if (typeof mediaType !== 'string' || !ALLOWED_MEDIA_TYPES.has(mediaType)) {
      return json({ error: 'Unsupported file type. Use a JPG, PNG, or PDF.' }, 400);
    }

    const contentBlock = mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: mediaType, data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };

    const anthropicRes = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: [EXTRACT_TOOL],
        tool_choice: { type: 'tool', name: 'extract_transactions' },
        messages: [{
          role: 'user',
          content: [
            contentBlock,
            { type: 'text', text: 'Extract every transaction line item from this document.' },
          ],
        }],
      }),
    });

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text();
      console.error('[statement-scan]', anthropicRes.status, errBody);
      return json({ error: 'Could not read this document right now — try again shortly.' }, 502);
    }

    const data = await anthropicRes.json();
    const toolUse = (data.content ?? []).find((block: { type: string }) => block.type === 'tool_use');
    if (!toolUse) return json({ error: 'Could not read this document — try a clearer photo.' }, 502);

    const input = toolUse.input ?? {};
    const transactions = Array.isArray(input.transactions) ? input.transactions.slice(0, MAX_TRANSACTIONS) : [];

    return json({
      documentType: input.documentType ?? 'unknown',
      transactions,
      warning: typeof input.warning === 'string' ? input.warning : undefined,
    }, 200);
  } catch (e) {
    console.error('[statement-scan]', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
