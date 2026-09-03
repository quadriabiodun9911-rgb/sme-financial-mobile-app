// Supabase Edge Function: whatsapp-webhook
//
// WhatsApp as a first-class input channel, phase 1: text -> transaction.
// An owner texts "Sold 3 bags of rice for 15000" and gets back a logged
// transaction; texts something genuinely ambiguous ("Paid John 20k") and
// gets a numbered clarification instead of a silent guess. See
// supabase/migrations/031_whatsapp_transaction_logging.sql for the four
// tables this reads/writes and why each one is shaped the way it is.
//
// Written for Twilio's WhatsApp API specifically (the recommended
// starting provider -- fastest to get a real number running) rather than
// provider-agnostically: the incoming payload shape (`From`/`Body` form
// fields), the reply mechanism (a TwiML <Response> body), and the
// signature verification below are all Twilio-specific. Switching to
// Meta's Cloud API directly later would mean rewriting the top of this
// handler (JSON payload instead of form-encoded, a separate POST to send
// a reply instead of a TwiML response, different signature scheme) --
// the parsing/clarification/staging logic beneath that is provider-
// independent and would carry over unchanged.
//
// Same "opaque server, real encryption client-side" boundary as every
// other Phase 2/3 proactive-alerts function: a parsed transaction lands in
// incoming_whatsapp_transactions unencrypted (the server has no field-
// encryption key), and is claimed + properly encrypted client-side on next
// app open via the normal addTransaction() path -- see
// src/utils/whatsappTransactions.ts.
//
// DEPLOYMENT (not done from this environment -- no Supabase CLI
// credentials, and no Twilio account to test against, here): from a
// machine with the project linked and a Twilio WhatsApp sender configured,
//   supabase functions deploy whatsapp-webhook
//   supabase secrets set TWILIO_AUTH_TOKEN=<your Twilio auth token>
//   supabase secrets set TWILIO_WEBHOOK_URL=<the exact URL configured as
//     this number's "when a message comes in" webhook in the Twilio
//     console, e.g. https://<project-ref>.supabase.co/functions/v1/whatsapp-webhook>
// then point the WhatsApp sender's incoming-message webhook at that same
// URL. ANTHROPIC_API_KEY is already set as a shared secret (see
// categorize-transaction). SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are
// injected automatically.
//
// TWILIO_WEBHOOK_URL exists (rather than trusting the request's own URL)
// because signature verification must be computed against the exact URL
// Twilio was configured to call -- a platform-internal request URL seen
// inside the function can differ from that (a proxy prefix, a scheme
// mismatch) and silently break verification. Untested against real Twilio
// traffic from this environment; if signatures fail to verify once live,
// confirm TWILIO_WEBHOOK_URL matches the console's webhook URL exactly
// (including https:// and no trailing slash) before assuming the
// algorithm itself is wrong.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-5';
const LINK_CODE_TTL_MS = 15 * 60 * 1000;
const MAX_BODY_LEN = 500;

function twiml(message: string): Response {
  const escaped = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`, {
    headers: { 'Content-Type': 'text/xml' },
  });
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// Twilio's documented request-validation algorithm: the full webhook URL
// with every POST parameter's key+value (sorted by key, no separators)
// appended, HMAC-SHA1'd with the Auth Token, base64-encoded, and compared
// to the X-Twilio-Signature header. See
// https://www.twilio.com/docs/usage/webhooks/webhooks-security -- this is
// a from-scratch implementation (no Twilio SDK dependency) since Deno's
// SubtleCrypto covers HMAC-SHA1 directly.
async function verifyTwilioSignature(webhookUrl: string, params: URLSearchParams, authToken: string, signature: string): Promise<boolean> {
  const sortedKeys = Array.from(new Set(params.keys())).sort();
  let data = webhookUrl;
  for (const key of sortedKeys) data += key + (params.get(key) ?? '');

  const cryptoKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(authToken), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
  const computed = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
  return computed === signature;
}

interface ParsedTransaction {
  isTransaction: boolean;
  amount: number | null;
  direction: 'income' | 'expense' | null;
  description: string;
  confidentCategory: boolean;
  category: string | null;
  clarificationOptions: string[];
}

// Forces a structured reply via tool_choice, same discipline as
// categorize-transaction -- but this tool does more than categorize: it
// decides, per message, whether the category is genuinely inferable at
// all. "Sold 3 bags of rice for 15000" -> confident. "Paid John 20k" ->
// not -- the model is instructed to say so rather than pick one, which is
// the whole point of the clarification flow below.
const LOG_TRANSACTION_TOOL = {
  name: 'log_transaction',
  description: 'Extract a single financial transaction from a WhatsApp message sent by an SME owner to their bookkeeping bot, or flag that no transaction is present.',
  input_schema: {
    type: 'object',
    properties: {
      is_transaction: {
        type: 'boolean',
        description: 'false if this message is not describing a sale, expense, or payment at all (a greeting, a question, something unrelated) -- true otherwise.',
      },
      amount: { type: 'number', description: 'The amount as a plain number, e.g. 15000 for "15k" or "₦15,000".' },
      direction: {
        type: 'string',
        enum: ['income', 'expense'],
        description: '"income" for money received (a sale, a customer payment); "expense" for money paid out.',
      },
      description: {
        type: 'string',
        description: 'A short, clean description for the transaction (e.g. "Rice sales", "Transport", "Payment to John") -- rewritten for readability, not copied verbatim.',
      },
      confident_category: {
        type: 'boolean',
        description: 'true ONLY when the category is genuinely unambiguous from the message itself (e.g. "sold rice" -> clearly a sales category, "paid transport" -> clearly transport). false whenever the category would have to be guessed -- e.g. "Paid John 20k" gives no real signal whether that was inventory, transport, salary, or something else. Never guess just to avoid asking.',
      },
      category: { type: 'string', description: 'The category, only when confident_category is true.' },
      clarification_options: {
        type: 'array',
        items: { type: 'string' },
        description: '2-5 short, plausible category options to offer the owner when confident_category is false, most likely first (e.g. ["Inventory", "Transport", "Salary", "Other"] for a vague payment to a named person).',
      },
    },
    required: ['is_transaction'],
  },
};

const SYSTEM_PROMPT = `You read a single WhatsApp message an SME owner sent to their bookkeeping bot and extract the transaction it describes, if any. Call the log_transaction tool -- never reply in plain text.

Examples of clear messages: "Sold 3 bags of rice for 15000" (income, confident category: Sales), "Paid transport 2000" (expense, confident category: Transport), "Bought stock 45000" (expense, confident category: Inventory), "Customer Adeyemi paid 25000" (income, confident category: Sales).

Examples where the category must NOT be guessed: "Paid John 20k" -- an expense of ₦20,000 is clear, but nothing in the message says what it was for. Set confident_category to false and offer plausible options (e.g. Inventory, Transport, Salary, Other) rather than picking one.

If the message isn't describing a transaction at all, set is_transaction to false and leave the other fields empty.`;

async function parseTransactionMessage(text: string, apiKey: string): Promise<ParsedTransaction | null> {
  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: text }],
      tools: [LOG_TRANSACTION_TOOL],
      tool_choice: { type: 'tool', name: 'log_transaction' },
    }),
  });
  if (!res.ok) {
    console.error('[whatsapp-webhook] Anthropic error', res.status, await res.text());
    return null;
  }
  const data = await res.json();
  const toolUse = (data.content ?? []).find((b: { type: string }) => b.type === 'tool_use');
  const r = toolUse?.input;
  if (!r || typeof r.is_transaction !== 'boolean') return null;

  return {
    isTransaction: r.is_transaction,
    amount: typeof r.amount === 'number' && r.amount > 0 ? r.amount : null,
    direction: r.direction === 'income' || r.direction === 'expense' ? r.direction : null,
    description: typeof r.description === 'string' ? r.description.trim().slice(0, 200) : '',
    confidentCategory: r.confident_category === true,
    category: typeof r.category === 'string' ? r.category.trim().slice(0, 60) : null,
    clarificationOptions: Array.isArray(r.clarification_options)
      ? r.clarification_options.filter((o: unknown): o is string => typeof o === 'string' && o.trim().length > 0).slice(0, 5).map((o: string) => o.trim().slice(0, 60))
      : [],
  };
}

function fmtAmount(currency: string, n: number): string {
  return `${currency}${Math.round(n).toLocaleString()}`;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const webhookUrl = Deno.env.get('TWILIO_WEBHOOK_URL');
    const signature = req.headers.get('X-Twilio-Signature');
    if (!authToken || !webhookUrl) return json({ error: 'WhatsApp integration is not configured yet.' }, 503);

    const bodyText = await req.text();
    const params = new URLSearchParams(bodyText);

    if (!signature || !(await verifyTwilioSignature(webhookUrl, params, authToken, signature))) {
      return json({ error: 'Invalid signature' }, 401);
    }

    const from = (params.get('From') || '').replace(/^whatsapp:/, '').trim();
    const rawBody = (params.get('Body') || '').trim().slice(0, MAX_BODY_LEN);
    if (!from) return twiml("Sorry, that message couldn't be read.");

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // ── Not linked yet: the only thing an unrecognized number can do is
    // redeem a link code generated in-app (Settings -> Connect WhatsApp).
    const { data: account } = await admin
      .from('whatsapp_accounts')
      .select('user_id')
      .eq('whatsapp_number', from)
      .maybeSingle();

    if (!account) {
      const code = rawBody.replace(/\D/g, '');
      if (code.length === 6) {
        const { data: linkRow } = await admin
          .from('whatsapp_link_codes')
          .select('user_id, created_at')
          .eq('code', code)
          .maybeSingle();
        if (linkRow && Date.now() - new Date(linkRow.created_at).getTime() < LINK_CODE_TTL_MS) {
          await admin.from('whatsapp_accounts').insert({ user_id: linkRow.user_id, whatsapp_number: from });
          await admin.from('whatsapp_link_codes').delete().eq('code', code);
          return twiml('✅ Linked to Quad360! Text me a sale or expense any time, e.g. "Sold 3 bags of rice for 15000".');
        }
        return twiml("That code isn't valid or has expired. Get a fresh one from Settings → Connect WhatsApp in the app.");
      }
      return twiml("I don't recognize this number yet. In the Quad360 app, go to Settings → Connect WhatsApp to get a linking code, then text it to me here.");
    }

    const userId = account.user_id as string;

    // ── UNDO: remove the most recently staged (not-yet-claimed) transaction.
    if (/^undo$/i.test(rawBody)) {
      const { data: last } = await admin
        .from('incoming_whatsapp_transactions')
        .select('id, amount, type')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!last) return twiml('Nothing to undo — your last logged entry has already synced to the app.');
      await admin.from('incoming_whatsapp_transactions').delete().eq('id', last.id);
      return twiml(`Removed the ${last.type} of ₦${Math.round(last.amount).toLocaleString()}.`);
    }

    // ── A pending clarification exists: does this message answer it?
    const { data: pending } = await admin
      .from('whatsapp_pending_clarifications')
      .select('user_id, draft_type, draft_amount, draft_description, options')
      .eq('whatsapp_number', from)
      .maybeSingle();

    if (pending) {
      const options = (pending.options as string[]) ?? [];
      const choiceNum = parseInt(rawBody, 10);
      let category: string | null = null;
      if (!isNaN(choiceNum) && choiceNum >= 1 && choiceNum <= options.length) category = options[choiceNum - 1];
      else {
        const match = options.find(o => o.toLowerCase() === rawBody.toLowerCase());
        if (match) category = match;
      }

      if (category) {
        await admin.from('incoming_whatsapp_transactions').insert({
          user_id: userId,
          type: pending.draft_type,
          amount: pending.draft_amount,
          category,
          description: pending.draft_description,
          raw_message: pending.draft_description,
        });
        await admin.from('whatsapp_pending_clarifications').delete().eq('whatsapp_number', from);
        return twiml(`✅ Logged: ${fmtAmount('₦', pending.draft_amount)} ${pending.draft_type}\n${pending.draft_description || ''} · ${category}\nReply UNDO to remove.`);
      }
      // Didn't answer the question -- drop the stale clarification and
      // fall through to parsing this as a brand new message, rather than
      // trapping the conversation waiting for a reply that isn't coming.
      await admin.from('whatsapp_pending_clarifications').delete().eq('whatsapp_number', from);
    }

    // ── Fresh message: parse it.
    if (!rawBody) return twiml('Send me a sale or expense, e.g. "Sold 3 bags of rice for 15000".');

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return twiml("Transaction logging isn't set up yet — log it in the app directly for now.");

    const parsed = await parseTransactionMessage(rawBody, apiKey);
    if (!parsed || !parsed.isTransaction || parsed.amount === null || parsed.direction === null) {
      return twiml('I couldn\'t tell what transaction this was. Try something like "Sold 3 bags of rice for 15000" or "Paid transport 2000".');
    }

    if (!parsed.confidentCategory || !parsed.category) {
      const options = parsed.clarificationOptions.length > 0 ? parsed.clarificationOptions : ['Inventory', 'Transport', 'Salary', 'Other'];
      await admin.from('whatsapp_pending_clarifications').upsert({
        whatsapp_number: from,
        user_id: userId,
        draft_type: parsed.direction,
        draft_amount: parsed.amount,
        draft_description: parsed.description || null,
        options,
      });
      const optionsText = options.map((o, i) => `${i + 1}. ${o}`).join('\n');
      return twiml(
        `I found ${parsed.direction === 'income' ? 'income' : 'an expense'} of ${fmtAmount('₦', parsed.amount)}${parsed.description ? ` — ${parsed.description}` : ''}.\nWhat was it for?\n${optionsText}`,
      );
    }

    await admin.from('incoming_whatsapp_transactions').insert({
      user_id: userId,
      type: parsed.direction,
      amount: parsed.amount,
      category: parsed.category,
      description: parsed.description || null,
      raw_message: rawBody,
    });

    return twiml(`✅ Logged: ${fmtAmount('₦', parsed.amount)} ${parsed.direction}\n${parsed.description} · ${parsed.category}\nReply UNDO to remove.`);
  } catch (e) {
    console.error('[whatsapp-webhook]', e);
    return twiml('Something went wrong logging that — please try again, or use the app directly.');
  }
});
