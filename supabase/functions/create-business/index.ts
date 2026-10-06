// Supabase Edge Function: create-business
//
// Lets one login own a SECOND (or third, ...) business. A business the
// real owner creates here is modeled as its own, genuinely separate
// Supabase Auth identity -- a "shadow" account nobody ever signs into
// directly -- with the real owner immediately linked to it via an active
// team_members row whose role is 'owner' (see migration 040, which widens
// team_members_role_check to allow that value for the first time).
//
// Why a shadow auth identity rather than a `business_id` column added to
// every workspace table: every workspace table (transactions, invoices,
// goals, loans, ...) and its RLS already treats "a team_members row links
// me to this user_id, with some role" as the complete access model (see
// 017_workspace_rls_for_team_members.sql / 022_role_aware_workspace_writes.sql)
// -- an owner viewing/writing a second business they own goes through the
// EXACT same switchBusiness()/resolveWorkspaceRole() code path an
// accountant or staff member already uses today to work inside someone
// ELSE's business. That path is already proven in production; teaching
// every table a new business_id column and rewriting every RLS policy
// would re-risk all of it for the same result. The real owner never
// learns or needs the shadow account's credentials -- it exists purely as
// a second user_id for workspace tables to key off, exactly as if someone
// else had invited them in as an owner-equivalent role.
//
// Client-side field encryption (src/utils/encryption.ts) is untouched by
// this: a business's transactions are encrypted with a key derived from
// whichever authSecret was active when that business's OWN data was
// written, same as today -- this function creates the shadow identity and
// its empty settings/profile rows, it writes no financial data itself, so
// there's nothing to encrypt or decrypt here.
//
// DEPLOYMENT (not done from this environment -- no Supabase CLI
// credentials here): from a machine with the project linked,
//   supabase functions deploy create-business
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY are
// injected automatically; no new secret needed.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_NAME_LEN = 100;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// A high-entropy string nobody ever types or sees -- it becomes the
// shadow account's Supabase Auth password, which this function alone
// knows and immediately discards. Switching into this business later goes
// through switchBusiness()/resolveWorkspaceRole() (a team_members lookup,
// never a login), so this value is never read back by anyone.
function randomSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Mirrors DEFAULT_SETTINGS in src/contexts/OptimizedContexts.tsx -- a
// brand-new business via normal signup gets these same defaults the first
// time SettingsProvider's hydrate-then-save effect runs; a shadow business
// never goes through that client flow (nothing ever signs into it
// directly), so this function seeds the equivalent row itself rather than
// leaving a new business with no settings row until some code path
// happens to write one.
function defaultSettingsData(businessName: string, currency: string, currencyCode: string) {
  return {
    businessName,
    businessType: 'both',
    industry: 'general',
    currency,
    currencyCode,
    minReserve: '0',
    targetMargin: '20',
    openingAssets: '0',
    openingLiabilities: '0',
    openingLoans: '0',
    openingOtherAssets: '0',
    defaultTaxRate: '20',
  };
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
    // Explicit token, not a no-arg call -- see every other function in
    // this project for why a no-arg getUser() silently fails here.
    const { data: { user }, error: authError } = await callerClient.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
    if (authError || !user) return json({ error: 'Not authenticated' }, 401);
    if (!user.email) return json({ error: 'Your account has no email on file.' }, 400);

    const body = await req.json().catch(() => null);
    const businessName = typeof body?.businessName === 'string' ? body.businessName.trim() : '';
    const currency = typeof body?.currency === 'string' && body.currency.trim() ? body.currency.trim() : '₦';
    const currencyCode = typeof body?.currencyCode === 'string' && body.currencyCode.trim() ? body.currencyCode.trim().toUpperCase() : 'NGN';

    if (!businessName || businessName.length > MAX_NAME_LEN) {
      return json({ error: `Business name must be 1-${MAX_NAME_LEN} characters.` }, 400);
    }

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // A synthetic, non-deliverable address -- nothing is ever sent to it,
    // and nobody signs into it directly (see header comment), so it only
    // needs to be valid-shaped and unique, never reachable.
    const shadowEmail = `biz-${crypto.randomUUID()}@business.quad360.internal`;
    const shadowPassword = randomSecret();

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: shadowEmail,
      password: shadowPassword,
      email_confirm: true,
    });
    if (createError || !created?.user) {
      console.error('[create-business] auth.admin.createUser failed', createError);
      return json({ error: 'Could not create the new business right now. Please try again.' }, 502);
    }
    const shadowUserId = created.user.id;

    // Best-effort rollback helper -- if any step after the auth user
    // exists fails, leaving an orphaned shadow identity with no
    // settings/profile/membership row would be worse than a clear error:
    // it would silently occupy an email slot and never appear anywhere
    // the real owner can see or retry cleanly.
    async function rollback() {
      try { await admin.auth.admin.deleteUser(shadowUserId); }
      catch (e) { console.error('[create-business] rollback deleteUser failed', e); }
    }

    const { error: settingsError } = await admin.from('settings').upsert({
      user_id: shadowUserId,
      data: defaultSettingsData(businessName, currency, currencyCode),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (settingsError) {
      console.error('[create-business] settings insert failed', settingsError);
      await rollback();
      return json({ error: 'Could not set up the new business right now. Please try again.' }, 502);
    }

    const { error: profileError } = await admin.from('profiles').upsert({
      id: shadowUserId,
      email: shadowEmail,
      business_name: businessName,
    }, { onConflict: 'id' });
    if (profileError) {
      console.error('[create-business] profile insert failed', profileError);
      await rollback();
      return json({ error: 'Could not set up the new business right now. Please try again.' }, 502);
    }

    const { error: membershipError } = await admin.from('team_members').insert({
      owner_user_id: shadowUserId,
      member_user_id: user.id,
      member_email: user.email,
      role: 'owner',
      status: 'active',
    });
    if (membershipError) {
      console.error('[create-business] team_members insert failed', membershipError);
      await rollback();
      return json({ error: 'Could not link the new business to your account. Please try again.' }, 502);
    }

    return json({ ownerUserId: shadowUserId, businessName }, 200);
  } catch (e) {
    console.error('[create-business]', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
