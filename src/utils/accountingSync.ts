/**
 * Client-side entry point for the QuickBooks/Xero read-only sync --
 * Quad360 as an intelligence layer on top of the accounting system a
 * business's accountant already uses, rather than a replacement for it.
 *
 * All privileged work (OAuth token exchange/refresh, calling the provider's
 * API) happens in supabase/functions/accounting-sync -- this file only ever
 * talks to that edge function (for anything touching a token) or directly
 * to accounting_category_mappings (RLS-protected, ordinary business
 * configuration, not a secret -- same as every other client-owned table).
 *
 * See supabase/migrations/038_accounting_connections.sql for the schema and
 * why tokens are never readable by the client, and accountingCategoryMap.ts
 * for how a provider's own category labels resolve to Quad360's.
 */

import { Platform } from 'react-native';
import { Linking } from 'react-native';
import { supabase } from './supabase';
import { getWorkspaceOwnerId } from './storage';
import { resolveCategory, StoredMapping, AccountingProvider } from './accountingCategoryMap';
import { reconcileExternalTransactions, ExternalTransaction, ExistingSyncedTransaction } from './transactionDedup';

export type { AccountingProvider };

// A status check that genuinely failed to reach the server (network error,
// a transient 5xx) is NOT the same fact as "not connected" -- treating them
// the same would show a real, working connection as disconnected on a
// blip, inviting the owner to reconnect a provider that was never actually
// disconnected. 'unknown' is that third state: the UI shows a retry, not a
// Connect button.
export type AccountingConnectionStatusState = 'connected' | 'error' | 'disconnected' | 'unknown';

export interface AccountingConnectionInfo {
    provider: AccountingProvider;
    externalAccountName: string | null;
    status: AccountingConnectionStatusState;
    errorMessage: string | null;
    connectedAt: string | null;
    lastSyncedAt: string | null;
}

export type AccountingConnectionMap = Record<AccountingProvider, AccountingConnectionInfo>;

// Same shape as aiAdvisor.ts / paymentSecrets.ts's invoke wrappers -- the
// edge function always replies with a JSON { error } body on failure, so
// surface that instead of a generic "Edge Function returned a non-2xx
// status code".
async function invokeAccountingSync(body: Record<string, unknown>): Promise<any> {
    const { data, error } = await supabase.functions.invoke('accounting-sync', { body });
    if (error) {
        const errResponse = (error as { context?: Response }).context;
        const errBody = errResponse && typeof errResponse.json === 'function'
            ? await errResponse.json().catch(() => null)
            : null;
        throw new Error(errBody?.error || error.message || 'Could not reach the accounting sync service.');
    }
    return data;
}

function disconnectedInfo(provider: AccountingProvider): AccountingConnectionInfo {
    return { provider, externalAccountName: null, status: 'disconnected', errorMessage: null, connectedAt: null, lastSyncedAt: null };
}

function unknownInfo(provider: AccountingProvider): AccountingConnectionInfo {
    return { provider, externalAccountName: null, status: 'unknown', errorMessage: null, connectedAt: null, lastSyncedAt: null };
}

export async function getAccountingConnectionStatus(): Promise<AccountingConnectionMap> {
    const ownerUserId = await getWorkspaceOwnerId();
    // Not signed in is a real, confirmed fact (not a transient failure) --
    // there is no connection to report either way.
    if (!ownerUserId) return { quickbooks: disconnectedInfo('quickbooks'), xero: disconnectedInfo('xero') };
    try {
        const data = await invokeAccountingSync({ action: 'status', ownerUserId });
        const raw = data?.connections ?? {};
        const result = {} as AccountingConnectionMap;
        for (const provider of ['quickbooks', 'xero'] as AccountingProvider[]) {
            const row = raw[provider];
            result[provider] = row ? {
                provider,
                externalAccountName: row.external_account_name ?? null,
                status: row.status,
                errorMessage: row.error_message ?? null,
                connectedAt: row.connected_at,
                lastSyncedAt: row.last_synced_at ?? null,
            } : disconnectedInfo(provider);
        }
        return result;
    } catch (e: any) {
        // The request itself failed (network error, edge function
        // unreachable) -- genuinely unknown, not confirmed disconnected.
        console.error('[accountingSync] status check failed', e?.message);
        return { quickbooks: unknownInfo('quickbooks'), xero: unknownInfo('xero') };
    }
}

// Opens the provider's OAuth consent screen -- same new-tab-with-fallback
// pattern PaymentLinkScreen.tsx uses for provider checkout pages, since
// this is the same shape of problem (hand off to an external hosted page,
// the user comes back to the app afterward).
export async function connectAccountingProvider(provider: AccountingProvider): Promise<void> {
    const ownerUserId = await getWorkspaceOwnerId();
    if (!ownerUserId) throw new Error('Not signed in.');
    const data = await invokeAccountingSync({ action: 'authorize_url', ownerUserId, provider });
    const url = data?.authorizeUrl;
    if (!url) throw new Error('Could not start the connection.');
    if (Platform.OS === 'web') {
        const win = window.open(url, '_blank');
        if (!win || win.closed || typeof win.closed === 'undefined') {
            window.location.href = url;
        }
    } else {
        await Linking.openURL(url);
    }
}

export async function disconnectAccountingProvider(provider: AccountingProvider): Promise<void> {
    const ownerUserId = await getWorkspaceOwnerId();
    if (!ownerUserId) throw new Error('Not signed in.');
    await invokeAccountingSync({ action: 'disconnect', ownerUserId, provider });
}

type ExternalRow = ExternalTransaction & { externalCategory: string };

export interface SyncedTransactionCandidate {
    externalId: string;
    date: string;
    description: string;
    amount: number;
    type: 'income' | 'expense';
    category: string;
    // True when this candidate's category came from neither a learned
    // mapping nor a built-in guess -- the raw provider label was used as
    // the category verbatim. Surfaced so the sync result can tell the owner
    // "N categories need a quick look" instead of silently filing them.
    isUnmappedCategory: boolean;
}

export interface FetchedAccountingTransactions {
    // Raw rows the provider fetch found, before category resolution --
    // kept around so a category review step (see categorizeAccountingRows)
    // can be re-run after the owner confirms mappings, without a second
    // network round-trip through the edge function.
    fresh: ExternalRow[];
    changed: Array<{ id: string; candidate: ExternalRow }>;
    // How many of the provider's rows were already imported and unchanged
    // (matched by externalId, content identical) and therefore excluded
    // from both `fresh` and `changed`.
    unchangedImported: number;
}

/**
 * Pulls transactions from a connected provider and reconciles them against
 * what's already been imported (by externalId, not content -- see
 * reconcileExternalTransactions) into genuinely new rows and rows whose
 * source-system content has since changed. Does NOT resolve categories or
 * save anything -- see categorizeAccountingRows for that, kept separate so
 * a category-review step can run in between without re-fetching from the
 * provider.
 */
export async function fetchAndReconcileAccountingTransactions(
    provider: AccountingProvider,
    existingTransactions: ExistingSyncedTransaction[],
): Promise<FetchedAccountingTransactions> {
    const ownerUserId = await getWorkspaceOwnerId();
    if (!ownerUserId) throw new Error('Not signed in.');

    const data = await invokeAccountingSync({ action: 'sync', ownerUserId, provider });
    const raw: ExternalRow[] = data?.transactions ?? [];

    const { fresh, changed } = reconcileExternalTransactions(raw, existingTransactions);
    return { fresh, changed, unchangedImported: raw.length - fresh.length - changed.length };
}

export interface UnmappedExternalCategory {
    externalCategory: string;
    // The provider's own direction for the first row seen with this
    // category -- a sensible default for a review UI's income/expense
    // toggle, not a guarantee every row sharing this label agrees (a
    // provider category can in principle appear on both a Purchase and a
    // Deposit), which is exactly why this is presented as a suggestion.
    fallbackType: 'income' | 'expense';
}

export interface CategorizedAccountingTransactions {
    candidates: SyncedTransactionCandidate[];
    changed: Array<{ id: string; candidate: SyncedTransactionCandidate }>;
    // Distinct raw provider category labels that resolved via neither a
    // learned mapping nor a built-in guess, across both fresh and changed
    // rows -- the set a category-review step should ask about.
    unmappedExternalCategories: UnmappedExternalCategory[];
}

function toCandidate(row: ExternalRow, learned: StoredMapping[]): SyncedTransactionCandidate {
    const { mapping, isUnmapped } = resolveCategory(row.externalCategory, learned, row.type);
    return {
        externalId: row.externalId, date: row.date, description: row.description, amount: row.amount,
        type: mapping.quadType, category: mapping.quadCategory, isUnmappedCategory: isUnmapped,
    };
}

/**
 * Resolves each fetched row's category against currently-learned mappings.
 * Pure (besides the mapping lookup) and cheap to re-run -- called once
 * right after fetchAndReconcileAccountingTransactions, and again after a
 * category-review step saves new mappings, so the transactions actually
 * saved reflect the owner's just-made choices instead of the raw fallback.
 */
export async function categorizeAccountingRows(
    provider: AccountingProvider,
    fresh: ExternalRow[],
    changed: Array<{ id: string; candidate: ExternalRow }>,
): Promise<CategorizedAccountingTransactions> {
    const learned = await getCategoryMappings(provider);
    const candidates = fresh.map(row => toCandidate(row, learned));
    const changedCandidates = changed.map(c => ({ id: c.id, candidate: toCandidate(c.candidate, learned) }));
    const unmapped = new Map<string, UnmappedExternalCategory>();
    const consider = (row: ExternalRow) => {
        if (candidateIsUnmapped(row, learned) && !unmapped.has(row.externalCategory)) {
            unmapped.set(row.externalCategory, { externalCategory: row.externalCategory, fallbackType: row.type });
        }
    };
    for (const row of fresh) consider(row);
    for (const c of changed) consider(c.candidate);
    return { candidates, changed: changedCandidates, unmappedExternalCategories: Array.from(unmapped.values()) };
}

function candidateIsUnmapped(row: ExternalRow, learned: StoredMapping[]): boolean {
    return resolveCategory(row.externalCategory, learned, row.type).isUnmapped;
}

// ─── Category mappings (direct table access -- not a secret) ───────────────

interface CategoryMappingRow {
    external_category: string;
    quad_type: 'income' | 'expense';
    quad_category: string;
}

export async function getCategoryMappings(provider: AccountingProvider): Promise<StoredMapping[]> {
    const ownerUserId = await getWorkspaceOwnerId();
    if (!ownerUserId) return [];
    const { data, error } = await supabase
        .from('accounting_category_mappings')
        .select('external_category, quad_type, quad_category')
        .eq('user_id', ownerUserId)
        .eq('provider', provider);
    if (error) { console.error('[accountingSync] load mappings failed', error.message); return []; }
    return (data as CategoryMappingRow[] ?? []).map(r => ({
        externalCategory: r.external_category, quadType: r.quad_type, quadCategory: r.quad_category,
    }));
}

export async function saveCategoryMapping(
    provider: AccountingProvider,
    externalCategory: string,
    quadType: 'income' | 'expense',
    quadCategory: string,
): Promise<void> {
    const ownerUserId = await getWorkspaceOwnerId();
    if (!ownerUserId) throw new Error('Not signed in.');
    const { error } = await supabase.from('accounting_category_mappings').upsert({
        user_id: ownerUserId, provider, external_category: externalCategory,
        quad_type: quadType, quad_category: quadCategory, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider,external_category' });
    if (error) throw new Error(error.message);
}
