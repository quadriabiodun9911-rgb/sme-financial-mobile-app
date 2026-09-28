// Supabase Edge Function: accounting-sync
//
// Read-only pull integration with QuickBooks Online and Xero -- Quad360's
// "intelligence layer on top of the accounting system accountants already
// use" mode. Never writes back to the provider; only ever reads their bank
// transactions and hands normalized rows back to the client, which does the
// actual encrypt-and-save (this function has no access to a business's
// client-held field-encryption key -- see encryption.ts -- so it can never
// write directly into the `transactions` table itself; same trust boundary
// as statement-scan, which returns parsed rows for the client to save).
//
// Same shape as payment-secrets/payment-init: verify the caller's JWT
// against the anon client, then do the privileged work (talking to the
// provider with a secret only this function's environment has, and holding
// OAuth tokens no client ever reads) with the service-role client.
//
// Actions (all via POST, authenticated, body.action):
//   authorize_url  -- returns the provider's OAuth consent-screen URL
//   status         -- connection status per provider (no token material)
//   disconnect     -- removes a connection and its tokens
//   sync           -- pulls recent bank transactions from a connected provider
// Plus a GET handler for the OAuth callback itself (Intuit/Xero redirect the
// browser here directly with no Authorization header at all -- see
// accounting_oauth_states in the migration for how that request recovers
// which Quad360 user it belongs to).
//
// DEPLOYMENT (not done from this environment -- no Supabase CLI credentials
// here): from a machine with the project linked,
//   supabase functions deploy accounting-sync
//   supabase secrets set QUICKBOOKS_CLIENT_ID=... QUICKBOOKS_CLIENT_SECRET=...
//   supabase secrets set XERO_CLIENT_ID=... XERO_CLIENT_SECRET=...
//   supabase secrets set ACCOUNTING_OAUTH_REDIRECT_URI=https://<project-ref>.supabase.co/functions/v1/accounting-sync
// The redirect URI must be registered VERBATIM (scheme, host, path, no
// trailing slash) as an allowed redirect in both the Intuit Developer
// Portal (QuickBooks) and the Xero Developer Portal app -- one shared URI
// works for both, since this function dispatches by the `state` row's
// stored provider, not by the URL itself. SUPABASE_URL / SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

function html(body: string, status: number) {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
  });
}

type Provider = 'quickbooks' | 'xero';
const PROVIDERS: Provider[] = ['quickbooks', 'xero'];

const QBO_CLIENT_ID = Deno.env.get('QUICKBOOKS_CLIENT_ID') ?? '';
const QBO_CLIENT_SECRET = Deno.env.get('QUICKBOOKS_CLIENT_SECRET') ?? '';
const XERO_CLIENT_ID = Deno.env.get('XERO_CLIENT_ID') ?? '';
const XERO_CLIENT_SECRET = Deno.env.get('XERO_CLIENT_SECRET') ?? '';
const REDIRECT_URI = Deno.env.get('ACCOUNTING_OAUTH_REDIRECT_URI') ?? '';

const QBO_AUTHORIZE_URL = 'https://appcenter.intuit.com/connect/oauth2';
const QBO_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const QBO_API_BASE = 'https://quickbooks.api.intuit.com/v3/company';

const XERO_AUTHORIZE_URL = 'https://login.xero.com/identity/connect/authorize';
const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token';
const XERO_CONNECTIONS_URL = 'https://api.xero.com/connections';
const XERO_API_BASE = 'https://api.xero.com/api.xro/2.0';

function basicAuthHeader(clientId: string, clientSecret: string): string {
  // btoa is available in the Deno edge runtime (same as a browser), unlike
  // Node's Buffer -- matches how statement-scan/advisor avoid Node-only APIs.
  return 'Basic ' + btoa(`${clientId}:${clientSecret}`);
}

interface NormalizedTransaction {
  externalId: string;
  date: string; // YYYY-MM-DD
  description: string;
  amount: number;
  type: 'income' | 'expense';
  externalCategory: string;
}

// ─── QuickBooks Online ──────────────────────────────────────────────────────

async function qboExchangeCode(code: string): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const res = await fetch(QBO_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(QBO_CLIENT_ID, QBO_CLIENT_SECRET),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }),
  });
  if (!res.ok) throw new Error(`QuickBooks token exchange failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function qboRefreshToken(refreshToken: string): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const res = await fetch(QBO_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(QBO_CLIENT_ID, QBO_CLIENT_SECRET),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  if (!res.ok) throw new Error(`QuickBooks token refresh failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function qboCompanyName(realmId: string, accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${QBO_API_BASE}/${realmId}/companyinfo/${realmId}?minorversion=65`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.CompanyInfo?.CompanyName ?? null;
  } catch {
    // Best-effort only -- a failed name lookup should never block the
    // connection itself from succeeding.
    return null;
  }
}

// Purchase (money out) + Deposit and SalesReceipt (money in) are the three
// QuickBooks transaction types that represent an actual cash movement --
// the same thing a bank statement shows. Quad360's Transaction model is a
// cash-movement ledger, not a full accrual AR/AP system (it has separate
// Invoice/Bill types for that), so open/unpaid Invoices and Bills are
// deliberately out of scope here: pulling only posted cash transactions is
// the honest scope match, not a shortcut.
// A page size below QuickBooks' own 1000-row query cap, and a total safety
// cap so a business with an unusually deep history can't turn one sync into
// an unbounded loop -- generous enough that no real business ever hits it
// in practice, but present so "no pagination at all" never silently caps a
// smaller business's history at one page either.
const QBO_PAGE_SIZE = 200;
const MAX_RESULTS_PER_ENTITY = 5000;

async function qboFetchTransactions(realmId: string, accessToken: string): Promise<NormalizedTransaction[]> {
  const results: NormalizedTransaction[] = [];

  // QuickBooks' Query API pages via STARTPOSITION/MAXRESULTS -- a page
  // shorter than QBO_PAGE_SIZE means there's nothing left to fetch.
  async function query(entity: 'Purchase' | 'Deposit' | 'SalesReceipt'): Promise<any[]> {
    const all: any[] = [];
    for (let start = 1; all.length < MAX_RESULTS_PER_ENTITY; start += QBO_PAGE_SIZE) {
      const q = encodeURIComponent(`SELECT * FROM ${entity} ORDERBY TxnDate DESC STARTPOSITION ${start} MAXRESULTS ${QBO_PAGE_SIZE}`);
      const res = await fetch(`${QBO_API_BASE}/${realmId}/query?query=${q}&minorversion=65`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`QuickBooks ${entity} query failed (${res.status}): ${await res.text()}`);
      const data = await res.json();
      const page: any[] = data?.QueryResponse?.[entity] ?? [];
      all.push(...page);
      if (page.length < QBO_PAGE_SIZE) break;
    }
    return all;
  }

  for (const p of await query('Purchase')) {
    const firstLine = (p.Line ?? []).find((l: any) => l.AccountBasedExpenseLineDetail);
    results.push({
      externalId: `qbo-purchase-${p.Id}`,
      date: p.TxnDate,
      description: p.EntityRef?.name || p.PaymentType || 'QuickBooks purchase',
      amount: Number(p.TotalAmt ?? 0),
      type: 'expense',
      externalCategory: firstLine?.AccountBasedExpenseLineDetail?.AccountRef?.name || 'Uncategorized Expense',
    });
  }

  for (const d of await query('Deposit')) {
    const firstLine = (d.Line ?? []).find((l: any) => l.DepositLineDetail);
    results.push({
      externalId: `qbo-deposit-${d.Id}`,
      date: d.TxnDate,
      description: firstLine?.DepositLineDetail?.Entity?.name || d.PrivateNote || 'QuickBooks deposit',
      amount: Number(d.TotalAmt ?? 0),
      type: 'income',
      externalCategory: firstLine?.DepositLineDetail?.AccountRef?.name || 'Other Income',
    });
  }

  for (const s of await query('SalesReceipt')) {
    results.push({
      externalId: `qbo-salesreceipt-${s.Id}`,
      date: s.TxnDate,
      description: s.CustomerRef?.name || 'QuickBooks sale',
      amount: Number(s.TotalAmt ?? 0),
      type: 'income',
      externalCategory: 'Sales',
    });
  }

  return results;
}

// ─── Xero ───────────────────────────────────────────────────────────────────

async function xeroExchangeCode(code: string): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const res = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(XERO_CLIENT_ID, XERO_CLIENT_SECRET),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }),
  });
  if (!res.ok) throw new Error(`Xero token exchange failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function xeroRefreshToken(refreshToken: string): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const res = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(XERO_CLIENT_ID, XERO_CLIENT_SECRET),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  if (!res.ok) throw new Error(`Xero token refresh failed (${res.status}): ${await res.text()}`);
  return res.json();
}

// A fresh authorization always grants exactly the one org the user picked
// on Xero's consent screen -- connections[0] is that org, not an arbitrary
// pick among many. A business reconnecting a different org later goes
// through 'authorize_url' again, which creates a fresh consent screen.
async function xeroFirstTenant(accessToken: string): Promise<{ tenantId: string; tenantName: string | null } | null> {
  const res = await fetch(XERO_CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const first = Array.isArray(data) ? data[0] : null;
  if (!first?.tenantId) return null;
  return { tenantId: first.tenantId, tenantName: first.tenantName ?? null };
}

// Xero's BankTransactions carry each line's AccountCode, not its human
// account name -- resolved against a one-time Accounts lookup per sync so
// the category mapping layer has an actual name to match against, the same
// as QuickBooks already returns directly.
async function xeroAccountCodeToName(tenantId: string, accessToken: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const res = await fetch(`${XERO_API_BASE}/Accounts`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Xero-tenant-id': tenantId, Accept: 'application/json' },
    });
    if (!res.ok) return map;
    const data = await res.json();
    for (const a of data?.Accounts ?? []) {
      if (a.Code && a.Name) map.set(a.Code, a.Name);
    }
  } catch {
    // Best-effort -- an empty map just means every line falls back to its
    // raw AccountCode below, still usable, just less readable.
  }
  return map;
}

// Xero's BankTransactions endpoint pages via a `page` param, 100 rows per
// page, and signals the end with a page that comes back empty -- looped the
// same bounded way as QuickBooks above, rather than truncating at one page.
async function xeroFetchTransactions(tenantId: string, accessToken: string): Promise<NormalizedTransaction[]> {
  const accountNames = await xeroAccountCodeToName(tenantId, accessToken);
  const rows: any[] = [];
  for (let page = 1; rows.length < MAX_RESULTS_PER_ENTITY; page++) {
    const res = await fetch(`${XERO_API_BASE}/BankTransactions?where=${encodeURIComponent('Status=="AUTHORISED"')}&order=Date DESC&page=${page}`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Xero-tenant-id': tenantId, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Xero BankTransactions query failed (${res.status}): ${await res.text()}`);
    const data = await res.json();
    const batch: any[] = data?.BankTransactions ?? [];
    if (batch.length === 0) break;
    rows.push(...batch);
    if (batch.length < 100) break;
  }
  const results: NormalizedTransaction[] = [];
  for (const t of rows) {
    // Xero dates arrive as "/Date(1700000000000+0000)/" -- extract the
    // epoch millis and format as YYYY-MM-DD, matching every other date this
    // app stores.
    const match = /\/Date\((\d+)/.exec(t.DateString ?? t.Date ?? '');
    const date = match ? new Date(Number(match[1])).toISOString().slice(0, 10) : (t.DateString ?? '').slice(0, 10);
    const firstLine = (t.LineItems ?? [])[0];
    const code = firstLine?.AccountCode;
    results.push({
      externalId: `xero-banktxn-${t.BankTransactionID}`,
      date,
      description: t.Contact?.Name || firstLine?.Description || 'Xero bank transaction',
      amount: Number(t.Total ?? 0),
      type: t.Type === 'RECEIVE' ? 'income' : 'expense',
      externalCategory: (code && accountNames.get(code)) || code || 'Uncategorized',
    });
  }
  return results;
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

function authorizeUrl(provider: Provider, state: string): string {
  if (provider === 'quickbooks') {
    const params = new URLSearchParams({
      client_id: QBO_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'com.intuit.quickbooks.accounting',
      state,
    });
    return `${QBO_AUTHORIZE_URL}?${params.toString()}`;
  }
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: XERO_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'openid profile email accounting.transactions.read offline_access',
    state,
  });
  return `${XERO_AUTHORIZE_URL}?${params.toString()}`;
}

function providerConfigured(provider: Provider): boolean {
  return provider === 'quickbooks' ? !!(QBO_CLIENT_ID && QBO_CLIENT_SECRET) : !!(XERO_CLIENT_ID && XERO_CLIENT_SECRET);
}

const CALLBACK_PAGE = (title: string, message: string) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;background:#f8fafc;color:#1e293b;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:24px}
.card{background:#fff;border-radius:16px;padding:32px 24px;max-width:360px;box-shadow:0 1px 3px rgba(0,0,0,0.1)}
h1{font-size:18px;margin:0 0 8px}p{font-size:14px;color:#64748b;margin:0}</style></head>
<body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`;

// A silently-ignored upsert failure here means the callback can show
// "Connected" while nothing was actually stored, or a refreshed token can
// be used for the current request without being persisted for the next
// one -- either leaves the connection in a state the client's "connected"
// status can't be trusted against. Every upsert to these two tables goes
// through this so a storage failure always surfaces as a thrown error
// instead of a silently accepted no-op.
async function upsertOrThrow(adminClient: ReturnType<typeof createClient>, table: string, row: Record<string, unknown>, onConflict: string): Promise<void> {
  const { error } = await adminClient.from(table).upsert(row, { onConflict });
  if (error) throw new Error(`Failed to save ${table}: ${error.message}`);
}

// ─── HTTP entry point ───────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // ── GET: the OAuth redirect itself (Intuit/Xero -> here, no auth header) ──
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const qboRealmId = url.searchParams.get('realmId');
    const providerError = url.searchParams.get('error');

    if (providerError) {
      return html(CALLBACK_PAGE('Connection cancelled', 'You can close this window and return to Quad360.'), 200);
    }
    if (!code || !state) {
      return html(CALLBACK_PAGE('Something went wrong', 'This link is missing required information. Please try connecting again from Quad360.'), 400);
    }

    const { data: stateRow } = await adminClient
      .from('accounting_oauth_states')
      .select('user_id, provider, created_at')
      .eq('state', state)
      .maybeSingle();

    // Single-use: consumed immediately regardless of what happens next, so
    // a replayed callback (e.g. the user's browser retrying the request)
    // can never re-trigger a token exchange with a code the provider has
    // already invalidated.
    if (stateRow) {
      await adminClient.from('accounting_oauth_states').delete().eq('state', state);
    }

    const stateAgeMs = stateRow ? Date.now() - new Date(stateRow.created_at).getTime() : Infinity;
    if (!stateRow || stateAgeMs > 15 * 60 * 1000) {
      return html(CALLBACK_PAGE('This link expired', 'Please return to Quad360 and try connecting again.'), 400);
    }

    const { user_id: userId, provider } = stateRow as { user_id: string; provider: Provider };

    try {
      if (provider === 'quickbooks') {
        if (!qboRealmId) throw new Error('QuickBooks did not return a company id.');
        const tokens = await qboExchangeCode(code);
        const companyName = await qboCompanyName(qboRealmId, tokens.access_token);
        await upsertOrThrow(adminClient, 'accounting_connections', {
          user_id: userId, provider, external_account_id: qboRealmId, external_account_name: companyName,
          status: 'connected', error_message: null, connected_at: new Date().toISOString(),
        }, 'user_id,provider');
        await upsertOrThrow(adminClient, 'accounting_connection_tokens', {
          user_id: userId, provider, access_token: tokens.access_token, refresh_token: tokens.refresh_token,
          expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(), updated_at: new Date().toISOString(),
        }, 'user_id,provider');
      } else {
        const tokens = await xeroExchangeCode(code);
        const tenant = await xeroFirstTenant(tokens.access_token);
        if (!tenant) throw new Error('Xero did not return an authorized organization.');
        await upsertOrThrow(adminClient, 'accounting_connections', {
          user_id: userId, provider, external_account_id: tenant.tenantId, external_account_name: tenant.tenantName,
          status: 'connected', error_message: null, connected_at: new Date().toISOString(),
        }, 'user_id,provider');
        await upsertOrThrow(adminClient, 'accounting_connection_tokens', {
          user_id: userId, provider, access_token: tokens.access_token, refresh_token: tokens.refresh_token,
          expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(), updated_at: new Date().toISOString(),
        }, 'user_id,provider');
      }
      const label = provider === 'quickbooks' ? 'QuickBooks' : 'Xero';
      return html(CALLBACK_PAGE(`Connected to ${label}`, 'You can close this window and return to Quad360.'), 200);
    } catch (e) {
      console.error('[accounting-sync] oauth callback failed', e);
      // Best-effort only, unlike the upserts above -- we're already
      // reporting a failure to the user; a second failure writing THAT
      // failure down should not mask the original error or crash the
      // response the user is waiting on.
      try {
        await adminClient.from('accounting_connections').upsert({
          user_id: userId, provider, external_account_id: qboRealmId ?? 'unknown',
          status: 'error', error_message: e instanceof Error ? e.message : 'Connection failed',
          connected_at: new Date().toISOString(),
        }, { onConflict: 'user_id,provider' });
      } catch (writeErr) {
        console.error('[accounting-sync] failed to record connection error', writeErr);
      }
      return html(CALLBACK_PAGE('Connection failed', 'Please return to Quad360 and try connecting again.'), 502);
    }
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  // ── POST: authenticated actions from the app itself ──
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    // Explicit token, not a no-arg call -- see payment-secrets/index.ts for
    // why a no-arg getUser() silently fails on a fresh per-request client.
    const { data: { user }, error: authError } = await callerClient.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
    if (authError || !user) return json({ error: 'Not authenticated' }, 401);

    const body = await req.json().catch(() => null);
    const action = body?.action;
    if (!['authorize_url', 'status', 'disconnect', 'sync'].includes(action)) {
      return json({ error: 'action must be "authorize_url", "status", "disconnect", or "sync".' }, 400);
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
        return json({ error: 'Only the account owner or an admin can manage accounting connections.' }, 403);
      }
    }

    if (action === 'status') {
      const { data, error } = await adminClient
        .from('accounting_connections')
        .select('provider, external_account_name, status, error_message, connected_at, last_synced_at')
        .eq('user_id', ownerUserId);
      if (error) return json({ error: error.message }, 500);
      const byProvider: Record<string, unknown> = {};
      for (const p of PROVIDERS) byProvider[p] = null;
      for (const row of data ?? []) byProvider[row.provider] = row;
      return json({ connections: byProvider }, 200);
    }

    const provider: Provider = body?.provider;
    if (!PROVIDERS.includes(provider)) {
      return json({ error: 'provider must be "quickbooks" or "xero".' }, 400);
    }

    if (action === 'authorize_url') {
      if (!REDIRECT_URI) return json({ error: 'Accounting sync is not configured yet.' }, 503);
      if (!providerConfigured(provider)) return json({ error: `${provider === 'quickbooks' ? 'QuickBooks' : 'Xero'} is not configured yet.` }, 503);

      // Opportunistic cleanup, not a scheduled job -- this table is a
      // mailbox with a handful of rows at most, so sweeping expired ones on
      // every request is cheap and keeps it from growing unbounded without
      // needing pg_cron.
      await adminClient.from('accounting_oauth_states').delete().lt('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString());

      const state = crypto.randomUUID();
      const { error } = await adminClient.from('accounting_oauth_states').insert({ state, user_id: ownerUserId, provider });
      if (error) return json({ error: error.message }, 500);
      return json({ authorizeUrl: authorizeUrl(provider, state) }, 200);
    }

    if (action === 'disconnect') {
      await adminClient.from('accounting_connection_tokens').delete().eq('user_id', ownerUserId).eq('provider', provider);
      await adminClient.from('accounting_connections').delete().eq('user_id', ownerUserId).eq('provider', provider);
      return json({ ok: true }, 200);
    }

    // action === 'sync'
    const { data: tokenRow, error: tokenError } = await adminClient
      .from('accounting_connection_tokens')
      .select('access_token, refresh_token, expires_at')
      .eq('user_id', ownerUserId).eq('provider', provider).maybeSingle();
    if (tokenError) return json({ error: tokenError.message }, 500);
    if (!tokenRow) return json({ error: 'Not connected. Connect this accounting system first.' }, 400);

    const { data: connectionRow } = await adminClient
      .from('accounting_connections')
      .select('external_account_id')
      .eq('user_id', ownerUserId).eq('provider', provider).maybeSingle();
    if (!connectionRow?.external_account_id) return json({ error: 'Connection is missing its account id. Please reconnect.' }, 400);

    let accessToken = tokenRow.access_token as string;
    // 60-second buffer so a token that's about to expire mid-request still
    // gets refreshed proactively, rather than failing partway through the
    // transaction fetch below.
    const needsRefresh = new Date(tokenRow.expires_at).getTime() - Date.now() < 60_000;

    try {
      if (needsRefresh) {
        const refreshed = provider === 'quickbooks'
          ? await qboRefreshToken(tokenRow.refresh_token)
          : await xeroRefreshToken(tokenRow.refresh_token);
        accessToken = refreshed.access_token;
        // Must persist before proceeding, not just use accessToken for this
        // request: both providers rotate the refresh token on every use, so
        // if this write fails, the refresh_token still in the database is
        // now the one the provider already invalidated -- the NEXT sync
        // would fail outright instead of just this one. Throwing here
        // (caught below, recorded as a connection error) is deliberately
        // louder than silently continuing on an unpersisted token.
        await upsertOrThrow(adminClient, 'accounting_connection_tokens', {
          user_id: ownerUserId, provider, access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token,
          expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(), updated_at: new Date().toISOString(),
        }, 'user_id,provider');
      }

      const transactions = provider === 'quickbooks'
        ? await qboFetchTransactions(connectionRow.external_account_id, accessToken)
        : await xeroFetchTransactions(connectionRow.external_account_id, accessToken);

      await adminClient.from('accounting_connections').update({ status: 'connected', error_message: null, last_synced_at: new Date().toISOString() })
        .eq('user_id', ownerUserId).eq('provider', provider);

      return json({ transactions }, 200);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Sync failed';
      console.error('[accounting-sync] sync failed', { provider, ownerUserId, message });
      await adminClient.from('accounting_connections').update({ status: 'error', error_message: message })
        .eq('user_id', ownerUserId).eq('provider', provider);
      return json({ error: message }, 502);
    }
  } catch (e) {
    console.error('[accounting-sync]', e);
    return json({ error: 'Something went wrong. Please try again shortly.' }, 502);
  }
});
