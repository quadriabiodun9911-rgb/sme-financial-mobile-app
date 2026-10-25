/**
 * Client-side entry point for Mono Connect -- direct, consent-based bank
 * account linking, read-only, same "intelligence layer on top of the real
 * source" posture as accountingSync.ts (which this file deliberately
 * mirrors). Quad360 never writes back to the bank.
 *
 * All privileged work (calling Mono with the secret key, handling the
 * account_connected/account_updated webhook events) happens in
 * supabase/functions/mono-connect and supabase/functions/mono-webhook --
 * this file only ever talks to the mono-connect edge function (for
 * anything touching Mono's API) or reads mono_connections directly
 * (RLS-protected, no secret material, same as accounting_connections).
 *
 * See supabase/migrations/050_mono_connections.sql for the schema and why
 * there's no separate locked-down token table the way accounting_connection_
 * tokens is -- Mono's auth model has no per-user token to protect.
 */

import { Platform, Linking } from 'react-native';
import { supabase } from './supabase';
import { getWorkspaceOwnerId } from './storage';
import { classifyByDescription } from './transactionCategorization';
import { reconcileExternalTransactions, ExternalTransaction, ExistingSyncedTransaction } from './transactionDedup';

export type MonoConnectionStatusState = 'connected' | 'error' | 'disconnected' | 'unknown' | 'pending';

export interface MonoConnectionInfo {
    bankName: string | null;
    accountNumber: string | null; // last 4 digits only -- see mono-webhook
    status: MonoConnectionStatusState;
    dataStatus: 'available' | 'partial' | 'unavailable' | 'failed' | null;
    errorMessage: string | null;
    connectedAt: string | null;
    lastSyncedAt: string | null;
}

const DISCONNECTED: MonoConnectionInfo = {
    bankName: null, accountNumber: null, status: 'disconnected', dataStatus: null,
    errorMessage: null, connectedAt: null, lastSyncedAt: null,
};

function unknownInfo(): MonoConnectionInfo {
    return { ...DISCONNECTED, status: 'unknown' };
}

// Same shape as accountingSync.ts's invoke wrapper -- the edge function
// always replies with a JSON { error } body on failure, so surface that
// instead of a generic "Edge Function returned a non-2xx status code".
async function invokeMonoConnect(body: Record<string, unknown>): Promise<any> {
    const { data, error } = await supabase.functions.invoke('mono-connect', { body });
    if (error) {
        const errResponse = (error as { context?: Response }).context;
        const errBody = errResponse && typeof errResponse.json === 'function'
            ? await errResponse.json().catch(() => null)
            : null;
        throw new Error(errBody?.error || error.message || 'Could not reach the bank connection service.');
    }
    return data;
}

export async function getMonoConnectionStatus(): Promise<MonoConnectionInfo> {
    const ownerUserId = await getWorkspaceOwnerId();
    if (!ownerUserId) return DISCONNECTED;
    try {
        const data = await invokeMonoConnect({ action: 'status', ownerUserId });
        const row = data?.connection;
        if (!row) return DISCONNECTED;
        return {
            bankName: row.bank_name ?? null,
            accountNumber: row.account_number ?? null,
            status: row.status,
            dataStatus: row.data_status ?? null,
            errorMessage: row.error_message ?? null,
            connectedAt: row.connected_at ?? null,
            lastSyncedAt: row.last_synced_at ?? null,
        };
    } catch (e: any) {
        console.error('[monoConnect] status check failed', e?.message);
        return unknownInfo();
    }
}

// Opens Mono's hosted bank-linking page -- same new-tab-with-fallback
// pattern accountingSync.ts's connectAccountingProvider already uses for
// an external hosted page, since this is the same shape of problem (hand
// off to a page outside the app, the user comes back afterward). The
// account itself only finishes linking once mono-webhook's
// account_connected/account_updated events arrive server-side -- this
// does NOT return a connected account, only the link to open.
export async function connectMonoAccount(businessName: string): Promise<void> {
    const ownerUserId = await getWorkspaceOwnerId();
    if (!ownerUserId) throw new Error('Not signed in.');
    const data = await invokeMonoConnect({ action: 'initiate', ownerUserId, businessName });
    const url = data?.monoUrl;
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

export async function disconnectMonoAccount(): Promise<void> {
    const ownerUserId = await getWorkspaceOwnerId();
    if (!ownerUserId) throw new Error('Not signed in.');
    await invokeMonoConnect({ action: 'disconnect', ownerUserId });
}

export interface SyncedMonoTransactionCandidate {
    externalId: string;
    date: string;
    description: string;
    amount: number;
    type: 'income' | 'expense';
    category: string;
}

export interface FetchedMonoTransactions {
    fresh: SyncedMonoTransactionCandidate[];
    changed: Array<{ id: string; candidate: SyncedMonoTransactionCandidate }>;
    unchangedImported: number;
}

/**
 * Pulls transactions from the connected bank account and reconciles them
 * against what's already been imported (by externalId, same
 * reconcileExternalTransactions accountingSync.ts already uses) into
 * genuinely new rows and rows whose content has since changed. Resolves
 * each row's category by running its bank narration through Quad360's own
 * classifyByDescription -- the exact same categorizer a manually-typed
 * transaction gets -- rather than building a second, Mono-specific
 * category-mapping system the way accountingSync.ts's resolveCategory
 * does for QuickBooks/Xero's own chart of accounts. Mono's own `category`
 * field ("bank_charges", "unknown", ...) is far coarser than that and is
 * discarded after being used only for the dedup content-equality check.
 */
export async function fetchAndReconcileMonoTransactions(
    existingTransactions: ExistingSyncedTransaction[],
    industry?: string,
): Promise<FetchedMonoTransactions> {
    const ownerUserId = await getWorkspaceOwnerId();
    if (!ownerUserId) throw new Error('Not signed in.');

    const data = await invokeMonoConnect({ action: 'sync', ownerUserId });
    const raw: ExternalTransaction[] = data?.transactions ?? [];

    const { fresh, changed } = reconcileExternalTransactions(raw, existingTransactions);

    const toCandidate = (row: ExternalTransaction): SyncedMonoTransactionCandidate => {
        const result = classifyByDescription(row.description, row.type, industry);
        return { externalId: row.externalId, date: row.date, description: row.description, amount: row.amount, type: row.type, category: result.subCategory };
    };

    return {
        fresh: fresh.map(toCandidate),
        changed: changed.map(c => ({ id: c.id, candidate: toCandidate(c.candidate) })),
        unchangedImported: raw.length - fresh.length - changed.length,
    };
}
