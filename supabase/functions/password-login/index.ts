// Supabase Edge Function: password-login
//
// Lets a business owner set a real, memorable backup password (separate
// from the per-device secret the PIN normally unlocks -- see
// account_backup_password's own comment in
// 027_account_backup_password.sql for why the two must not share storage)
// and then use it to sign in directly on a device that has never seen this
// account before, without an email round trip.
//
// action 'set'    -- caller must already be signed in (any working device);
//                    hashes and stores/replaces their own backup password.
// action 'delete' -- caller must already be signed in; removes it.
// action 'status' -- caller must already be signed in; { isSet: boolean }.
// action 'login'  -- NO session required (this IS how a fresh device gets
//                    one): verifies email + password against the stored
//                    hash and, on success, just says so -- it deliberately
//                    does NOT establish a session itself. The client
//                    follows up with Supabase's own signInWithOtp/
//                    verifyOtp (the same native email-code flow this app
//                    already uses for join-recovery) as a second factor,
//                    since this is the one login path reachable with no
//                    session and no device of its own to vouch for it.
//                    That second step is what actually produces the
//                    session, which the client then feeds into the
//                    existing device-verify flow (set a PIN for this
//                    device, save a fresh device secret).
//
// DEPLOYMENT: supabase functions deploy password-login
// Enforce JWT verification: OFF -- the 'login' action is called by a
// browser with no session yet; this function does its own auth check for
// every other action instead.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import bcrypt from 'https://esm.sh/bcryptjs@2.4.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const MIN_PASSWORD_LENGTH = 8;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // matches the PIN's own lockout (OptimizedContexts.tsx login())

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = await req.json().catch(() => null);
    const action = body?.action;
    if (action !== 'set' && action !== 'delete' && action !== 'status' && action !== 'login') {
      return json({ error: 'action must be "set", "delete", "status", or "login".' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // ── login: no session yet -- that's the entire point ──────────────────
    if (action === 'login') {
      const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
      const password = typeof body?.password === 'string' ? body.password : '';
      if (!email || !password) return json({ error: 'Email and password are required.' }, 400);

      const { data: row, error: lookupError } = await adminClient
        .from('account_backup_password')
        .select('password_hash, failed_attempts, locked_until')
        .eq('email', email)
        .maybeSingle();
      if (lookupError) return json({ error: lookupError.message }, 500);
      // Same message whether the email has no backup password set or the
      // password is wrong -- distinguishing them would let an attacker use
      // this endpoint to discover which emails have one configured.
      const genericError = 'Incorrect email or password.';
      if (!row) return json({ error: genericError }, 401);

      // Enforced here, not just in the client -- this is the one login path
      // in the app callable with no session and no device of its own, so
      // nothing client-side can be trusted to actually stop repeated
      // guesses against it.
      if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
        const minutesLeft = Math.ceil((new Date(row.locked_until).getTime() - Date.now()) / 60000);
        return json({ error: `Too many attempts. Please try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.` }, 429);
      }

      const passwordMatches = await bcrypt.compare(password, row.password_hash);
      if (!passwordMatches) {
        const attempts = (row.failed_attempts ?? 0) + 1;
        const lockedUntil = attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS).toISOString() : null;
        await adminClient
          .from('account_backup_password')
          .update({ failed_attempts: lockedUntil ? 0 : attempts, locked_until: lockedUntil })
          .eq('email', email);
        return json({ error: genericError }, 401);
      }
      // Correct password -- clear any accumulated failed attempts. The
      // client takes it from here with its own signInWithOtp call; this
      // function's job ends at "yes, that password is right."
      if ((row.failed_attempts ?? 0) > 0 || row.locked_until) {
        await adminClient.from('account_backup_password').update({ failed_attempts: 0, locked_until: null }).eq('email', email);
      }
      return json({ ok: true }, 200);
    }

    // ── set / delete / status: caller must already have a session ─────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await callerClient.auth.getUser();
    if (authError || !user || !user.email) return json({ error: 'Not authenticated' }, 401);
    const email = user.email.trim().toLowerCase();

    if (action === 'status') {
      const { data, error } = await adminClient
        .from('account_backup_password')
        .select('email')
        .eq('email', email)
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      return json({ isSet: !!data }, 200);
    }

    if (action === 'delete') {
      const { error } = await adminClient.from('account_backup_password').delete().eq('email', email);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true }, 200);
    }

    // action === 'set'
    const password = typeof body?.password === 'string' ? body.password : '';
    if (password.length < MIN_PASSWORD_LENGTH) {
      return json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }, 400);
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const { error } = await adminClient
      .from('account_backup_password')
      .upsert({ email, password_hash: passwordHash, updated_at: new Date().toISOString() }, { onConflict: 'email' });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true }, 200);
  } catch (e) {
    console.error('[password-login]', e);
    return json({ error: 'Something went wrong. Please try again shortly.' }, 502);
  }
});
