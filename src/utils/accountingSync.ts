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
import { filterNewExternalTransactions } from './transactionDedup';

export type { AccountingProvider };

export interface AccountingConnectionInfo {
    provider: AccountingProvider;
    externalAccountName: string | null;
    status: 'connected' | 'error' | 'disconnected';
    errorMessage: string | null;
    connectedAt: string;
    lastSyncedAt: string | null;
}

export type AccountingConnectionMap = Record<AccountingProvider, AccountingConnectionInfo | null>;

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

export async function getAccountingConnectionStatus(): Promise<AccountingConnectionMap> {
    const empty: AccountingConnectionMap = { quickbooks: null, xero: null };
    const ownerUserId = await getWorkspaceOwnerId();
    if (!ownerUserId) return empty;
    try {
        const data = await invokeAccountingSync({ action: 'status', ownerUserId });
        const raw = data?.connections ?? {};
        const result: AccountingConnectionMap = { quickbooks: null, xero: null };
        for (const provider of ['quickbooks', 'xero'] as AccountingProvider[]) {
            const row = raw[provider];
            if (!row) continue;
            result[provider] = {
                provider,
                externalAccountName: row.external_account_name ?? null,
                status: row.status,
                errorMessage: row.error_message ?? null,
                connectedAt: row.connected_at,
                lastSyncedAt: row.last_synced_at ?? null,
            };
        }
        return result;
    } catch (e: any) {
        console.error('[accountingSync] status check failed', e?.message);
        return empty;
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

export interface SyncResult {
    candidates: SyncedTransactionCandidate[];
    // How many of the provider's rows were already imported (matched by
    // externalId) and therefore excluded from `candidates`.
    alreadyImported: number;
}

/**
 * Pulls transactions from a connected provider, drops anything already
 * imported (by externalId -- see filterNewExternalTransactions), and
 * resolves each remaining row's category. Returns candidates for the
 * caller to actually save via the app's existing addTransaction (same
 * loop-and-call pattern TransactionsScreen's CSV import already uses) --
 * this function never writes anything itself, since only the caller's
 * AppContext holds the field-encryption key transactions are saved under.
 */
export async function syncAccountingTransactions(
    provider: AccountingProvider,
    existingTransactions: Array<{ externalId?: string }>,
): Promise<SyncResult> {
    const ownerUserId = await getWorkspaceOwnerId();
    if (!ownerUserId) throw new Error('Not signed in.');

    const data = await invokeAccountingSync({ action: 'sync', ownerUserId, provider });
    const raw: Array<{ externalId: string; date: string; description: string; amount: number; type: 'income' | 'expense'; externalCategory: string }> = data?.transactions ?? [];

    const fresh = filterNewExternalTransactions(raw, existingTransactions);
    const learned = await getCategoryMappings(provider);

    const candidates: SyncedTransactionCandidate[] = fresh.map(t => {
        const { mapping, isUnmapped } = resolveCategory(t.externalCategory, learned, t.type);
        return {
            externalId: t.externalId,
            date: t.date,
            description: t.description,
            amount: t.amount,
            type: mapping.quadType,
            category: mapping.quadCategory,
            isUnmappedCategory: isUnmapped,
        };
    });

    return { candidates, alreadyImported: raw.length - fresh.length };
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
