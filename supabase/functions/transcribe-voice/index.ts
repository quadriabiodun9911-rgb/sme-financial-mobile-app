// Supabase Edge Function: transcribe-voice
//
// Lets a business owner record a short voice note ("Sold 3 bags of rice
// for 15000") instead of typing it into Quick Add. Turns the recording into
// plain text via OpenAI's Whisper API and hands that text back to the
// client, which feeds it into the exact same parseQuickAddText function a
// typed sentence goes through (see quickAddParser.ts's own doc comment,
// which named this as the eventual landing point for voice input).
//
// Same shape as statement-scan: verify the caller's JWT against the anon
// client, then do the privileged work (calling OpenAI with a secret only
// this function's environment has) -- no API key ever reaches the client.
//
// DEPLOYMENT (not done from this environment -- no Supabase CLI credentials
// here): from a machine with the project linked,
//   supabase functions deploy transcribe-voice
// Requires a new secret, OPENAI_API_KEY, set separately from the
// ANTHROPIC_API_KEY the other AI-backed functions (advisor, statement-scan,
// categorize-transaction) already use -- Whisper is OpenAI-only, Anthropic
// has no equivalent speech-to-text endpoint.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WHISPER_API = 'https://api.openai.com/v1/audio/transcriptions';

// A Quick Add voice note is a single spoken sentence, not a meeting
// recording -- this is generous for that (a couple of minutes of audio)
// while still failing fast on a mistakenly-huge upload well under
// Whisper's own 25MB file limit.
const MAX_BASE64_LEN = 15_000_000; // ~11MB binary

const ALLOWED_MIME_TYPES = new Set([
  'audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/mp3', 'audio/wav',
  'audio/webm', 'audio/ogg', 'audio/x-m4a',
]);

// Whisper keys off the filename's extension to know the container format,
// not the multipart part's declared content-type -- map the mime types this
// function accepts to a plausible extension so the upload isn't rejected.
const EXTENSION_BY_MIME: Record<string, string> = {
  'audio/m4a': 'm4a', 'audio/x-m4a': 'm4a', 'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav',
  'audio/webm': 'webm', 'audio/ogg': 'ogg',
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
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

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) return json({ error: 'Voice capture is not configured yet.' }, 503);

    const body = await req.json().catch(() => null);
    const audioBase64 = body?.audioBase64;
    const mimeType = body?.mimeType;

    if (typeof audioBase64 !== 'string' || !audioBase64) {
      return json({ error: 'Missing audio data.' }, 400);
    }
    if (audioBase64.length > MAX_BASE64_LEN) {
      return json({ error: 'That recording is too long. Try a shorter note.' }, 400);
    }
    if (typeof mimeType !== 'string' || !ALLOWED_MIME_TYPES.has(mimeType)) {
      return json({ error: 'Unsupported audio format.' }, 400);
    }

    const bytes = base64ToBytes(audioBase64);
    const extension = EXTENSION_BY_MIME[mimeType] || 'm4a';
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: mimeType }), `voice-note.${extension}`);
    form.append('model', 'whisper-1');
    // Not pinned to a language -- Quad360's own userbase spans English,
    // Hausa, Yoruba, and Igbo speakers (see i18n.ts); Whisper auto-detects
    // reasonably well from audio alone, and forcing 'en' would make every
    // non-English note transcribe as garbled English phonemes instead.

    const whisperRes = await fetch(WHISPER_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!whisperRes.ok) {
      const errBody = await whisperRes.text();
      console.error('[transcribe-voice]', whisperRes.status, errBody);
      return json({ error: 'Could not transcribe that recording right now — try again shortly.' }, 502);
    }

    const data = await whisperRes.json();
    const text = typeof data?.text === 'string' ? data.text.trim() : '';
    if (!text) return json({ error: "Couldn't make out any speech in that recording — try again somewhere quieter." }, 502);

    return json({ text }, 200);
  } catch (e) {
    console.error('[transcribe-voice]', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
