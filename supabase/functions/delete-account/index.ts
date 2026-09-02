// Supabase Edge Function: delete-account
//
// Handles the two parts of account deletion that genuinely cannot be done
// from the authenticated client no matter what RLS policy exists:
//
//   1. `payments` — webhook-only table, no user_id column (keyed by email),
//      RLS is deliberately deny-all for anon/authenticated (see
//      002_payments_table.sql / 007_merchant_financing_and_rls_gaps.sql).
//      Only the service role can touch it.
//   2. The actual `auth.users` row — Supabase never allows a user to delete
//      their own auth identity via the client SDK; that's an Admin API
//      operation, which requires the service role key.
//
// Everything else (transactions, invoices, staff, etc.) is already deleted
// client-side in storage.ts's deleteAccountData() before this function is
// even invoked — this only cleans up what that call structurally cannot
// reach, then removes the login itself so the account can never sign back in.
//
// DEPLOYMENT (not done from this environment — no Supabase CLI credentials
// here): run `supabase functions deploy delete-account` from a machine with
// the project linked. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
// injected automatically into every deployed Edge Function's environment;
// no extra secrets need to be set for this one.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify the caller's identity using their own JWT against the anon
    // client -- never trust a user id passed in the request body, since
    // that would let anyone delete any account just by naming its id.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    // getUser() with NO argument relies on the client's own internal
    // session state, which a freshly-created client here never has -- it
    // silently fails with "Auth session missing!" even though a perfectly
    // valid token is sitting right there in the Authorization header.
    // Passing the token explicitly is what actually verifies it.
    const { data: { user }, error: authError } = await callerClient.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // 1. payments -- matched by email since the table has no user_id.
    //    Non-fatal if it errors: the identity deletion below is the part
    //    that matters most, and a stray webhook-log row left behind isn't
    //    personal financial data in the same sense the rest of this app's
    //    tables are.
    let paymentsError: string | null = null;
    if (user.email) {
      const { error } = await admin.from('payments').delete().eq('email', user.email);
      if (error) paymentsError = error.message;
    }

    // 2. The actual login identity. Everything else this account could
    //    access is already gone (deleted client-side before this function
    //    was invoked, or above) -- this is what stops the credentials from
    //    signing back in.
    const { error: deleteUserError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteUserError) {
      return new Response(JSON.stringify({ error: deleteUserError.message, paymentsError }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, paymentsError }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
