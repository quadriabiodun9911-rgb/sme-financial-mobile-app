// Supabase Edge Function: mono-connect
//
// Direct, consent-based bank-account linking via Mono Connect's Link
// Integration flow (verified against Mono's own "Connect Link Integration
// Guide" -- the link-based method, no client SDK or public key needed: the
// secret key alone drives this, entirely server-side).
//
// Same trust boundary as accounting-sync: Quad360 reads a business's bank
// transactions for its own intelligence layer, and never writes back to
// the bank. This function has no access to a business's client-held
// field-encryption key, so it hands normalized rows back to the client for
// the actual encrypt-and-save, same as accounting-sync/statement-scan.
//
// Actions (all via POST, authenticated, body.action):
//   status      -- connection status (no secret material)
//   initiate    -- starts a new bank-linking session, returns a mono_url
//                  to open (the actual account id arrives later via
//                  mono-webhook, not from this response)
//   sync        -- pulls transactions from a connected, data-ready account
//   disconnect  -- removes a connection
// Plus a GET handler for Mono's redirect_url -- the browser lands here once
// the user finishes linking in Mono's hosted flow. Purely cosmetic: Mono's
// docs don't document any query params delivered here, and the actual
// account id/readiness arrive via mono-webhook regardless, so this just
// shows a "you can close this" page.
//
// DEPLOYMENT (not done from this environment -- no Supabase CLI credentials
// here): see migration 050's header for the full secrets/deploy checklist.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function html(body: string, status: number) {
  return new Response(body, { status, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } });
}

const CALLBACK_PAGE = (title: string, message: string) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;background:#f8fafc;color:#1e293b;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:24px}
.card{background:#fff;border-radius:16px;padding:32px 24px;max-width:360px;box-shadow:0 1px 3px rgba(0,0,0,0.1)}
h1{font-size:18px;margin:0 0 8px}p{font-size:14px;color:#64748b;margin:0}</style></head>
<body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`;

const MONO_SECRET_KEY = Deno.env.get('MONO_SECRET_KEY') ?? '';
const REDIRECT_URI = Deno.env.get('MONO_REDIRECT_URI') ?? '';
const MONO_API = 'https://api.withmono.com/v2';

const MONO_LINK_REQUEST_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour -- see migration 050's comment on why this mailbox isn't single-use-deleted

interface MonoTransaction {
  id: string;
  narration: string;
  amount: number;
  type: 'debit' | 'credit';
  balance: number;
  date: string;
  category: string;
}

async function monoFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${MONO_API}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), accept: 'application/json', 'mono-sec-key': MONO_SECRET_KEY },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = body?.message || `Mono API error (${res.status})`;
    throw new Error(message);
  }
  return body;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // ── GET: Mono's redirect_url -- purely a UX close-this-window page ──
  if (req.method === 'GET') {
    return html(CALLBACK_PAGE('Linking your account', 'You can close this window and return to Quad360 -- your account will finish connecting in a moment.'), 200);
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await callerClient.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
    if (authError || !user) return json({ error: 'Not authenticated' }, 401);

    const body = await req.json().catch(() => null);
    const action = body?.action;
    if (!['status', 'initiate', 'sync', 'disconnect'].includes(action)) {
      return json({ error: 'action must be "status", "initiate", "sync", or "disconnect".' }, 400);
    }

    const ownerUserId = typeof body?.ownerUserId === 'string' && body.ownerUserId ? body.ownerUserId : user.id;
    if (ownerUserId !== user.id) {
      const { data: membership } = await adminClient
        .from('team_members')
        .select('status, role')
        .eq('owner_user_id', ownerUserId)
        .eq('member_user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();
      if (!membership) return json({ error: 'Not authorized for this business.' }, 403);
      if (action !== 'status' && membership.role !== 'admin') {
        return json({ error: 'Only the account owner or an admin can manage bank connections.' }, 403);
      }
    }

    if (action === 'status') {
      const { data, error } = await adminClient
        .from('mono_connections')
        .select('bank_name, account_number, status, data_status, error_message, connected_at, last_synced_at')
        .eq('user_id', ownerUserId)
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      return json({ connection: data ?? null }, 200);
    }

    if (action === 'initiate') {
      if (!MONO_SECRET_KEY || !REDIRECT_URI) return json({ error: 'Bank connection is not configured yet.' }, 503);

      // Opportunistic cleanup, not a scheduled job -- this table is a
      // mailbox with a handful of rows at most, so sweeping stale ones on
      // every request is cheap and keeps it from growing unbounded without
      // needing pg_cron.
      await adminClient.from('mono_link_requests').delete().lt('created_at', new Date(Date.now() - MONO_LINK_REQUEST_MAX_AGE_MS).toISOString());

      const ref = crypto.randomUUID();
      const { error: refError } = await adminClient.from('mono_link_requests').insert({ ref, user_id: ownerUserId });
      if (refError) return json({ error: refError.message }, 500);

      const businessName = typeof body?.businessName === 'string' && body.businessName.trim() ? body.businessName.trim() : (user.email ?? 'Quad360 Business');

      let initiateResponse: any;
      try {
        initiateResponse = await monoFetch('/accounts/initiate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            customer: { name: businessName, email: user.email ?? '' },
            meta: { ref },
            scope: 'auth',
            redirect_url: REDIRECT_URI,
          }),
        });
      } catch (e) {
        await adminClient.from('mono_link_requests').delete().eq('ref', ref);
        throw e;
      }

      const monoUrl = initiateResponse?.data?.mono_url;
      if (!monoUrl) {
        await adminClient.from('mono_link_requests').delete().eq('ref', ref);
        return json({ error: 'Mono did not return a connection link.' }, 502);
      }

      await adminClient.from('mono_connections').upsert({
        user_id: ownerUserId, status: 'pending', error_message: null,
      }, { onConflict: 'user_id' });

      return json({ monoUrl }, 200);
    }

    if (action === 'disconnect') {
      await adminClient.from('mono_connections').delete().eq('user_id', ownerUserId);
      return json({ ok: true }, 200);
    }

    // action === 'sync'
    const { data: connection, error: connError } = await adminClient
      .from('mono_connections')
      .select('mono_account_id, data_status')
      .eq('user_id', ownerUserId)
      .maybeSingle();
    if (connError) return json({ error: connError.message }, 500);
    if (!connection?.mono_account_id) return json({ error: 'Not connected. Connect a bank account first.' }, 400);

    try {
      // Mono's own readiness check -- calling the Transactions API before
      // data_status is 'available'/'partial' (with transactions in
      // retrieved_data) returns an empty payload, not an error, so this
      // confirms readiness fresh rather than trusting a possibly-stale
      // cached data_status.
      const details = await monoFetch(`/accounts/${connection.mono_account_id}`);
      const dataStatus = details?.data?.meta?.data_status as string | undefined;
      const retrievedData: string[] = details?.data?.meta?.retrieved_data ?? [];
      const ready = (dataStatus === 'AVAILABLE' || dataStatus === 'PARTIAL') && retrievedData.includes('transactions');

      await adminClient.from('mono_connections').update({
        data_status: dataStatus ? dataStatus.toLowerCase() : null,
        bank_name: details?.data?.account?.institution?.name ?? null,
        account_number: maskAccountNumber(details?.data?.account?.account_number),
      }).eq('user_id', ownerUserId);

      if (!ready) {
        return json({ error: 'Your bank is still preparing this account\'s transaction history -- try syncing again shortly.' }, 409);
      }

      // Paginated -- capped at 10 pages (Mono's own page size, unknown
      // exactly but bounded here regardless) so a very long history can't
      // hang this request indefinitely; a business with more than that can
      // sync again to pick up the rest, same "don't hang forever" ceiling
      // other paginated fetches in this app already use.
      const transactions: MonoTransaction[] = [];
      let page: string | null = `/accounts/${connection.mono_account_id}/transactions`;
      for (let i = 0; i < 10 && page; i++) {
        const pageResponse: any = await monoFetch(page);
        transactions.push(...(pageResponse?.data ?? []));
        const next = pageResponse?.meta?.next as string | null | undefined;
        page = next ? next.replace(MONO_API, '') : null;
      }

      const mapped = transactions.map(t => ({
        externalId: t.id,
        date: (t.date || '').slice(0, 10),
        description: t.narration || 'Bank transaction',
        amount: Math.abs(t.amount ?? 0),
        type: t.type === 'credit' ? 'income' as const : 'expense' as const,
        category: t.category || 'unknown',
      }));

      await adminClient.from('mono_connections').update({ status: 'connected', error_message: null, last_synced_at: new Date().toISOString() }).eq('user_id', ownerUserId);
      return json({ transactions: mapped }, 200);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Sync failed';
      console.error('[mono-connect] sync failed', { ownerUserId, message });
      await adminClient.from('mono_connections').update({ status: 'error', error_message: message }).eq('user_id', ownerUserId);
      return json({ error: message }, 502);
    }
  } catch (e) {
    console.error('[mono-connect]', e);
    return json({ error: 'Something went wrong. Please try again shortly.' }, 502);
  }
});

// Mono's Account Details API returns the full account number -- Quad360
// has no functional need for it, so only the last 4 digits (enough for an
// owner to recognize which account this is) are ever persisted.
function maskAccountNumber(accountNumber: unknown): string | null {
  if (typeof accountNumber !== 'string' || accountNumber.length < 4) return null;
  return `****${accountNumber.slice(-4)}`;
}
