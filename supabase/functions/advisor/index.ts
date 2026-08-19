// Supabase Edge Function: advisor
//
// The AI Advisor's real backend. Quad360 doesn't have a separately deployed
// Express server in practice (the /backend folder exists but was never
// actually hosted anywhere by this project's owner) -- Supabase is the one
// piece of backend infrastructure that's real, so this lives here instead,
// following the exact same shape as supabase/functions/delete-account:
// verify the caller's JWT against the anon client, do the privileged work
// (here: calling Anthropic with a secret key) with a secret only this
// function's environment has, never the client.
//
// DEPLOYMENT (not done from this environment -- no Supabase CLI credentials
// here): from a machine with the project linked,
//   supabase functions deploy advisor
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// SUPABASE_URL / SUPABASE_ANON_KEY are injected automatically; only the
// Anthropic key needs to be set by hand.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-5';
const MAX_QUESTION_LEN = 500;
const MAX_CONTEXT_JSON_LEN = 20000;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Instructs the model to answer strictly from the business's own real,
// already-computed data passed in `context` -- never to invent a number,
// estimate one it wasn't given, or answer from general knowledge about
// "typical" businesses. Mirrors the never-fabricate principle every other
// engine in this app follows (alertEngine, riskRadar, monthlyMission, etc.).
function buildSystemPrompt(context: unknown): string {
  return `You are Quad360's financial advisor for a small/medium business owner in Africa. You are having a conversation grounded ONLY in the real financial data provided below — this business's own actual numbers, computed by the app.

Rules:
- Only use figures present in the JSON data below. Never invent, estimate, or guess a number that isn't there.
- If the data needed to answer isn't included, say so plainly and suggest what the owner could check or log instead — do not fill the gap with a generic industry assumption.
- Do not give legal, tax-filing, or investment advice as if it were certified professional advice — frame it as guidance based on their numbers, and suggest a professional for anything that requires one.
- Be direct and concise (a business owner reading on a phone, not an essay). Use the business's own currency symbol/code as given in the data.
- Refer to concrete numbers from the data when relevant instead of vague generalities.

Business's current financial data (JSON):
${JSON.stringify(context)}`;
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
    const { data: { user }, error: authError } = await callerClient.auth.getUser();
    if (authError || !user) return json({ error: 'Not authenticated' }, 401);

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'AI Advisor is not configured yet.' }, 503);

    const body = await req.json().catch(() => null);
    const question = body?.question;
    const context = body?.context;
    if (typeof question !== 'string' || !question.trim() || question.length > MAX_QUESTION_LEN) {
      return json({ error: `Question must be 1-${MAX_QUESTION_LEN} characters.` }, 400);
    }
    if (!context || typeof context !== 'object' || Array.isArray(context)) {
      return json({ error: 'Missing financial context.' }, 400);
    }
    const contextJson = JSON.stringify(context);
    if (contextJson.length > MAX_CONTEXT_JSON_LEN) {
      return json({ error: 'Financial context is too large.' }, 400);
    }

    const anthropicRes = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        system: buildSystemPrompt(context),
        messages: [{ role: 'user', content: question.trim() }],
      }),
    });

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text();
      console.error('[advisor]', anthropicRes.status, errBody);
      return json({ error: 'AI Advisor could not answer right now — try again shortly.' }, 502);
    }

    const data = await anthropicRes.json();
    const answer = (data.content ?? [])
      .filter((block: { type: string }) => block.type === 'text')
      .map((block: { text: string }) => block.text)
      .join('\n')
      .trim();

    if (!answer) return json({ error: 'AI Advisor could not answer right now — try again shortly.' }, 502);

    return json({ answer }, 200);
  } catch (e) {
    console.error('[advisor]', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
