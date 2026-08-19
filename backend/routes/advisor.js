const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
const MAX_QUESTION_LEN = 500;
const MAX_CONTEXT_JSON_LEN = 20000;

// Advisor calls hit a paid LLM API — a much tighter limit than the global
// request limiter, independent of it (express-rate-limit stacks fine).
const advisorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many questions — try again in a few minutes.' },
});

// Instructs the model to answer strictly from the business's own real,
// already-computed data passed in `context` — never to invent a number,
// estimate one it wasn't given, or answer from general knowledge about
// "typical" businesses. Mirrors the never-fabricate principle every other
// engine in this app follows (alertEngine, riskRadar, monthlyMission, etc.).
function buildSystemPrompt(context) {
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

/**
 * POST /api/advisor/ask
 * Body: { question: string, context: object }
 * `context` is real, already-computed financial data the client assembles
 * from its own dashboard state (never fabricated here or in the model).
 */
router.post('/ask', advisorLimiter, async (req, res, next) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'AI Advisor is not configured yet.' });

    const { question, context } = req.body || {};
    if (typeof question !== 'string' || !question.trim() || question.length > MAX_QUESTION_LEN) {
      return res.status(400).json({ error: `Question must be 1-${MAX_QUESTION_LEN} characters.` });
    }
    if (!context || typeof context !== 'object' || Array.isArray(context)) {
      return res.status(400).json({ error: 'Missing financial context.' });
    }
    const contextJson = JSON.stringify(context);
    if (contextJson.length > MAX_CONTEXT_JSON_LEN) {
      return res.status(400).json({ error: 'Financial context is too large.' });
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
      const body = await anthropicRes.text();
      console.error('[Advisor]', anthropicRes.status, body);
      throw Object.assign(new Error(`Anthropic API error ${anthropicRes.status}`), { status: 502 });
    }

    const data = await anthropicRes.json();
    const answer = (data.content || [])
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n')
      .trim();

    if (!answer) throw Object.assign(new Error('Empty response from Anthropic'), { status: 502 });

    res.json({ answer });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
