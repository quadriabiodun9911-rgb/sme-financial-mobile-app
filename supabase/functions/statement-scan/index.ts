// Supabase Edge Function: statement-scan
//
// Lets a business owner photograph or upload a scanned/photographed bank
// statement, receipt, or invoice and get back structured transaction rows,
// instead of only being able to import a text-based CSV/Excel/PDF export
// (see ImportTransactionsScreen.tsx, which has no path for an image or a
// scanned/flattened PDF with no text layer). Same shape as the advisor
// function: verify the caller's JWT against the anon client, then do the
// privileged work (calling OpenAI with vision) with a secret only this
// function's environment has.
//
// Originally called Anthropic's Claude, which reads a PDF directly via its
// own "document" content block; switched to OpenAI's Chat Completions
// vision API, which only accepts images (JPEG/PNG/WEBP/GIF) inline, not a
// PDF -- OpenAI's PDF support lives in a separate Assistants/Files
// pipeline with a very different request shape, out of scope for this
// provider swap. A PDF upload now returns a clear "use a photo instead"
// error rather than silently failing or mis-reading the file -- a real,
// intentional feature reduction from the Claude version, not a bug. The
// client (statementScan.ts) already surfaces whatever error message this
// function returns, so no client change is required for this to be
// handled gracefully, though the scan-specific file pickers could still be
// tightened to stop offering PDF as an option.
//
// Forced tool use (not free-text JSON) is still used for the same
// reliability reason as before.
//
// DEPLOYMENT (not done from this environment -- no Supabase CLI credentials
// here): from a machine with the project linked,
//   supabase functions deploy statement-scan
// Reuses the same OPENAI_API_KEY secret already set for advisor/
// transcribe-voice -- nothing new to configure if that's already deployed.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPENAI_API = 'https://api.openai.com/v1/chat/completions';
const MODEL = Deno.env.get('OPENAI_MODEL') || 'gpt-4o';

// OpenAI's own image-input limit is well above this; a single scanned
// statement has no business exceeding this anyway -- keep a lower ceiling
// so a huge upload fails fast with a clear message instead of timing out
// upstream.
const MAX_BASE64_LEN = 8_000_000; // ~6MB binary
const MAX_TRANSACTIONS = 300;

// No application/pdf here -- see header comment. Images only.
const ALLOWED_MEDIA_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
]);

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const SYSTEM_PROMPT = `You extract transaction line items from an image of a bank statement, till receipt, or invoice for a small business's bookkeeping app.

Rules:
- Only report rows you can actually read in the document. Never invent a transaction, date, or amount that isn't visibly present.
- If a figure is blurry, cut off, or ambiguous, either omit that row or include it and say so in "warning" -- do not guess a value to fill the gap.
- Skip non-transaction lines: running/opening/closing balance summaries, headers, footers, account numbers, page numbers.
- "amount" is always a positive number; put the direction (money in vs out) in "direction".
- "date" should be YYYY-MM-DD. If the year isn't printed on the page, infer it from context (e.g. a visible statement period) rather than guessing a specific day wrong; if you truly cannot determine a date, use today's date and mention it in "warning".
- If the image contains no legible transactions at all, return an empty transactions array and explain why in "warning".

If, and only if, documentType is "invoice" AND the document is a VENDOR bill
reaching this business (an invoice addressed TO this business FROM a
supplier -- not an invoice this business is sending to one of ITS OWN
customers), also fill in "billDetails" with whatever of vendorName,
invoiceNumber, invoiceDate, dueDate, subtotal, taxTotal, total, currency and
lineItems you can actually read. Same discipline as everything else here:
omit a field entirely rather than guess it, and leave "billDetails" out
altogether if you can't tell which direction the invoice runs.

Call the extract_transactions tool with your answer -- never reply in plain text.`;

const EXTRACT_TOOL = {
  type: 'function',
  function: {
    name: 'extract_transactions',
    description: 'Report every distinct transaction line item found in the document.',
    parameters: {
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
        billDetails: {
          type: 'object',
          description: 'Only when documentType is "invoice" and it is a vendor bill reaching this business (not one this business issued). Omit any field you cannot actually read; omit the whole object if the direction is unclear.',
          properties: {
            vendorName: { type: 'string' },
            invoiceNumber: { type: 'string' },
            invoiceDate: { type: 'string', description: 'YYYY-MM-DD' },
            dueDate: { type: 'string', description: 'YYYY-MM-DD' },
            subtotal: { type: 'number' },
            taxTotal: { type: 'number' },
            total: { type: 'number' },
            currency: { type: 'string', description: 'The currency symbol or code as printed on the document' },
            lineItems: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  description: { type: 'string' },
                  quantity: { type: 'number' },
                  unitPrice: { type: 'number' },
                  taxRate: { type: 'number' },
                },
                required: ['description'],
              },
            },
          },
        },
      },
      required: ['documentType', 'transactions'],
    },
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
    // getUser() with NO argument relies on the client's own internal
    // session state, which a freshly-created client here never has -- it
    // silently fails with "Auth session missing!" even though a perfectly
    // valid token is sitting right there in the Authorization header.
    // Passing the token explicitly is what actually verifies it.
    const { data: { user }, error: authError } = await callerClient.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
    if (authError || !user) return json({ error: 'Not authenticated' }, 401);

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) return json({ error: 'Statement scanning is not configured yet.' }, 503);

    const body = await req.json().catch(() => null);
    const base64 = body?.base64;
    const mediaType = body?.mediaType;

    if (typeof base64 !== 'string' || !base64) {
      return json({ error: 'Missing image data.' }, 400);
    }
    if (base64.length > MAX_BASE64_LEN) {
      return json({ error: 'File is too large. Try a smaller photo or a lower-resolution scan.' }, 400);
    }
    if (mediaType === 'application/pdf') {
      return json({ error: 'PDF scanning is not supported right now — take a photo of the document instead, or import a text-based PDF from Import Transactions.' }, 400);
    }
    if (typeof mediaType !== 'string' || !ALLOWED_MEDIA_TYPES.has(mediaType)) {
      return json({ error: 'Unsupported file type. Use a JPG, PNG, WEBP, or GIF photo.' }, 400);
    }

    const openaiRes = await fetch(OPENAI_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64}` } },
              { type: 'text', text: 'Extract every transaction line item from this document.' },
            ],
          },
        ],
        tools: [EXTRACT_TOOL],
        tool_choice: { type: 'function', function: { name: 'extract_transactions' } },
      }),
    });

    if (!openaiRes.ok) {
      const errBody = await openaiRes.text();
      console.error('[statement-scan]', openaiRes.status, errBody);
      return json({ error: 'Could not read this document right now — try again shortly.' }, 502);
    }

    const data = await openaiRes.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let input: any = null;
    try {
      input = toolCall?.function?.arguments ? JSON.parse(toolCall.function.arguments) : null;
    } catch {
      input = null;
    }
    if (!input) return json({ error: 'Could not read this document — try a clearer photo.' }, 502);

    const transactions = Array.isArray(input.transactions) ? input.transactions.slice(0, MAX_TRANSACTIONS) : [];
    const billDetails = input.billDetails && typeof input.billDetails === 'object' ? input.billDetails : undefined;

    return json({
      documentType: input.documentType ?? 'unknown',
      transactions,
      warning: typeof input.warning === 'string' ? input.warning : undefined,
      billDetails,
    }, 200);
  } catch (e) {
    console.error('[statement-scan]', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
