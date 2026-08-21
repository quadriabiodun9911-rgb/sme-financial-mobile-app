import AsyncStorage from '@react-native-async-storage/async-storage';
import CryptoJS from 'crypto-js';
import { Transaction, BusinessSettings, FinancialGoal, Invoice, TeamMember, Language, Asset, InventoryItem, Loan, Budget, StaffMember, PayrollRun, FinancingContextData, CashPocket, CapitalCommitment, ReadinessSnapshot } from '../types';
import { supabase } from './supabase';
import {
    savePinSecurely, loadPinSecurely, clearPinSecurely, clearAllSecureData, saveAuthSecretSecurely, loadAuthSecretSecurely, clearAuthSecretSecurely,
    loadLocalAccountsSecurely, saveLocalAccountsSecurely, clearLocalAccountsSecurely,
} from './secureStorage';
import { enqueue } from './syncQueue';
import {
    getFieldEncryptionKey, encryptGoal, decryptGoal, encryptLoan, decryptLoan, encryptBudget, decryptBudget,
    encryptTransaction, decryptTransaction, encryptInvoice, decryptInvoice, encryptAsset, decryptAsset,
    encryptInventoryItem, decryptInventoryItem, deriveFieldEncryptionKey, generateEncryptionKey, setEncryptionKey,
} from './encryption';

// Corrupt/partial storage must never crash a loader — parse defensively.
function safeParse<T>(raw: string | null): T | null {
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
}


const KEYS = {
    transactions:   '@quad360/transactions',
    settings:       '@quad360/settings',
    goals:          '@quad360/goals',
    pin:            '@quad360/pin',
    profile:        '@quad360/profile',
    invoices:       '@quad360/invoices',
    workspaceOwner: '@quad360/workspaceOwner',
    language:       '@quad360/language',
    assets:         '@quad360/assets',
    loans:          '@quad360/loans',
    staff:          '@quad360/staff',
    payrollRuns:    '@quad360/payroll_runs',
};

function logSyncError(table: string, op: string, error: unknown) {
    console.error(`[Quad360] Supabase ${op} on "${table}" failed:`, error);
}

// ─── Delta-sync cache ─────────────────────────────────────────────────────────
// Per-entity snapshot of "what we last successfully synced to Supabase",
// keyed by entity name. Lets save*() below upload/encrypt only the records
// that actually changed since the last successful sync, instead of
// re-encrypting and re-uploading every record on every single mutation --
// previously, adding one transaction to a business with thousands of
// historical ones re-ran AES-encrypt on all of them and re-sent all of them
// over the network, every time, since the effect that calls saveTransactions
// fires on any change to the array reference (see OptimizedContexts.tsx).
//
// Correctness relies on one property already true of every add*/update*/
// delete* action in OptimizedContexts.tsx: they build new arrays via
// .map()/.filter(), which leaves every UNTOUCHED array entry at its
// original object reference (e.g. updateTransaction's
// `prev.map(t => t.id === id ? {...t, ...tx} : t)`). A plain `!==` check
// against the last-synced snapshot is therefore enough to find exactly
// what changed, with no need to diff field-by-field.
const lastSyncedByEntity = new Map<string, Map<string, unknown>>();

// Exported (in addition to being called internally by every save* function
// below) so the diff/record/reset contract can be unit-tested directly
// without mocking the Supabase client -- see storage.deltaSync.test.ts.
export function diffChangedRows<T extends { id: string }>(entity: string, current: T[]): T[] {
    const prev = lastSyncedByEntity.get(entity);
    if (!prev) return current; // no baseline yet -- everything counts as new
    return current.filter(item => prev.get(item.id) !== item);
}

export function recordSyncedRows<T extends { id: string }>(entity: string, current: T[]): void {
    const snapshot = new Map<string, T>();
    for (const item of current) snapshot.set(item.id, item);
    lastSyncedByEntity.set(entity, snapshot);
}

// Cleared whenever the signed-in identity changes (see
// clearLocalFinancialCache below) so a newly-signed-in account's data is
// never diffed against -- and therefore silently under-synced from -- the
// previous account's snapshot.
export function resetSyncDiffCache(): void {
    lastSyncedByEntity.clear();
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────
export async function getAuthUserId(): Promise<string | null> {
    try {
        const { data } = await supabase.auth.getSession();
        return data.session?.user?.id ?? null;
    } catch (e) {
        logSyncError('auth', 'getSession', e);
        return null;
    }
}

// For data operations — owners use their own ID; team members use their owner's ID
export async function getWorkspaceOwnerId(): Promise<string | null> {
    const userId = await getAuthUserId();
    if (!userId) return null;
    const cached = await AsyncStorage.getItem(KEYS.workspaceOwner);
    return cached ?? userId;
}

export async function setWorkspaceOwner(ownerId: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.workspaceOwner, ownerId);
}

export async function clearWorkspaceOwner(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.workspaceOwner);
}

// ─── Transactions ─────────────────────────────────────────────────────────────
export async function saveTransactions(t: Transaction[]): Promise<void> {
    // Always save locally first — works offline instantly
    await AsyncStorage.setItem(KEYS.transactions, JSON.stringify(t));
    const ownerId = await getWorkspaceOwnerId();
    if (!ownerId) return;
    // Only records that changed since the last successful sync get
    // encrypted and sent — see the "Delta-sync cache" note above.
    const changed = diffChangedRows('transactions', t);
    try {
        const encKey = await getFieldEncryptionKey(await loadAuthSecret());
        const rows = changed.length > 0 ? changed.map(tx => ({
            id: tx.id, user_id: ownerId,
            data: encKey ? encryptTransaction(tx as unknown as Record<string, any>, encKey) : tx,
            updated_at: new Date().toISOString(),
        })) : [];

        // Fetch remote IDs in parallel with upsert for optimal performance
        const [upsertResult, { data: remote, error: fetchErr }] = await Promise.all([
            rows.length > 0 ? supabase.from('transactions').upsert(rows, { onConflict: 'id' }) : Promise.resolve({ error: null }),
            supabase.from('transactions').select('id').eq('user_id', ownerId),
        ]);

        if (upsertResult.error) {
            logSyncError('transactions', 'upsert', upsertResult.error);
            // Queue the FULL current array, not just the diffed subset that
            // just failed to upload — the offline queue's enqueue() replaces
            // (rather than merges) a table's previously-queued rows, so a
            // partial payload here could permanently drop an earlier
            // still-unsynced edit. This matches exactly what used to be
            // sent here before delta-sync (the full array, encrypted).
            if (t.length > 0) {
                const fullRows = t.map(tx => ({
                    id: tx.id, user_id: ownerId,
                    data: encKey ? encryptTransaction(tx as unknown as Record<string, any>, encKey) : tx,
                    updated_at: new Date().toISOString(),
                }));
                await enqueue({ table: 'transactions', op: 'upsert', rows: fullRows, userId: ownerId });
            }
            return;
        }

        // Only mark the full current array as "synced" after a confirmed
        // successful upsert — if this ran after a failed/skipped upsert,
        // a genuinely-unsynced record could get recorded as synced and
        // then silently never retried.
        recordSyncedRows('transactions', t);

        if (fetchErr) { logSyncError('transactions', 'select', fetchErr); return; }

        if (remote && remote.length > 0) {
            const localIds = new Set(t.map(tx => tx.id));
            const toDelete = remote.filter(r => !localIds.has(r.id)).map(r => r.id);
            if (toDelete.length > 0) {
                const { error: delErr } = await supabase.from('transactions').delete().in('id', toDelete);
                if (delErr) {
                    await enqueue({ table: 'transactions', op: 'delete', rows: toDelete, userId: ownerId });
                }
            }
        }
    } catch (e) {
        // Network error — queue for when internet returns
        logSyncError('transactions', 'sync', e);
        if (t.length > 0) {
            const rows = t.map(tx => ({ id: tx.id, user_id: ownerId, data: tx, updated_at: new Date().toISOString() }));
            await enqueue({ table: 'transactions', op: 'upsert', rows, userId: ownerId });
        }
    }
}

export async function loadTransactions(): Promise<Transaction[] | null> {
    const ownerId = await getWorkspaceOwnerId();
    if (ownerId) {
        try {
            const { data, error } = await supabase
                .from('transactions')
                .select('data')
                .eq('user_id', ownerId)
                .order('updated_at', { ascending: false });
            if (error) { logSyncError('transactions', 'load', error); }
            else if (data && data.length > 0) {
                const encKey = await getFieldEncryptionKey(await loadAuthSecret());
                const txs = data.map(r => {
                    const raw = r.data as Record<string, any>;
                    return (encKey && raw?.encrypted ? decryptTransaction(raw as any, encKey) : raw) as Transaction;
                });
                await AsyncStorage.setItem(KEYS.transactions, JSON.stringify(txs));
                return txs;
            }
        } catch (e) {
            logSyncError('transactions', 'load', e);
        }
    }
    const raw = await AsyncStorage.getItem(KEYS.transactions);
    return safeParse<Transaction[]>(raw);
}

// ─── Settings ─────────────────────────────────────────────────────────────────
export async function saveSettings(s: BusinessSettings): Promise<void> {
    await AsyncStorage.setItem(KEYS.settings, JSON.stringify(s));
    const ownerId = await getWorkspaceOwnerId();
    if (!ownerId) return;
    try {
        const { error } = await supabase.from('settings').upsert(
            { user_id: ownerId, data: s, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' },
        );
        if (error) { logSyncError('settings', 'upsert', error); throw new Error(error.message); }
    } catch (e) {
        logSyncError('settings', 'sync', e);
        const row = { user_id: ownerId, data: s, updated_at: new Date().toISOString() };
        await enqueue({ table: 'settings', op: 'upsert', rows: [row], userId: ownerId });
    }
}

export async function loadSettings(): Promise<BusinessSettings | null> {
    const ownerId = await getWorkspaceOwnerId();
    if (ownerId) {
        try {
            const { data, error } = await supabase
                .from('settings')
                .select('data')
                .eq('user_id', ownerId)
                .single();
            if (error) { logSyncError('settings', 'load', error); }
            else if (data) {
                await AsyncStorage.setItem(KEYS.settings, JSON.stringify(data.data));
                return data.data as BusinessSettings;
            }
        } catch (e) {
            logSyncError('settings', 'load', e);
        }
    }
    const raw = await AsyncStorage.getItem(KEYS.settings);
    return safeParse<BusinessSettings>(raw);
}

// ─── Goals ────────────────────────────────────────────────────────────────────
export async function saveGoals(g: FinancialGoal[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.goals, JSON.stringify(g));
    const ownerId = await getWorkspaceOwnerId();
    if (!ownerId) return;
    const changed = diffChangedRows('goals', g);
    try {
        const encKey = await getFieldEncryptionKey(await loadAuthSecret());
        const rows = changed.length > 0 ? changed.map(goal => ({
            id: goal.id,
            user_id: ownerId,
            data: encKey ? encryptGoal(goal as unknown as Record<string, any>, encKey) : goal,
            updated_at: new Date().toISOString(),
        })) : [];

        // Parallel upsert + fetch remote IDs
        const [upsertResult, { data: remote, error: fetchErr }] = await Promise.all([
            rows.length > 0 ? supabase.from('goals').upsert(rows, { onConflict: 'id' }) : Promise.resolve({ error: null }),
            supabase.from('goals').select('id').eq('user_id', ownerId),
        ]);

        if (upsertResult.error) {
            logSyncError('goals', 'upsert', upsertResult.error);
        } else {
            recordSyncedRows('goals', g);
        }
        if (fetchErr) { logSyncError('goals', 'select', fetchErr); return; }

        if (remote && remote.length > 0) {
            const localIds = new Set(g.map(goal => goal.id));
            const toDelete = remote.filter(r => !localIds.has(r.id)).map(r => r.id);
            if (toDelete.length > 0) {
                const { error: delErr } = await supabase.from('goals').delete().in('id', toDelete);
                if (delErr) {
                    logSyncError('goals', 'delete', delErr);
                    await enqueue({ table: 'goals', op: 'delete', rows: toDelete, userId: ownerId });
                }
            }
        }
    } catch (e) {
        logSyncError('goals', 'sync', e);
        const rows = g.map(goal => ({ id: goal.id, user_id: ownerId, data: goal, updated_at: new Date().toISOString() }));
        await enqueue({ table: 'goals', op: 'upsert', rows, userId: ownerId });
    }
}

export async function loadGoals(): Promise<FinancialGoal[] | null> {
    const ownerId = await getWorkspaceOwnerId();
    if (ownerId) {
        try {
            const { data, error } = await supabase
                .from('goals')
                .select('data')
                .eq('user_id', ownerId);
            if (error) { logSyncError('goals', 'load', error); }
            else if (data && data.length > 0) {
                const encKey = await getFieldEncryptionKey(await loadAuthSecret());
                const goals = data.map(r => {
                    const raw = r.data as Record<string, any>;
                    return (encKey && raw?.encrypted ? decryptGoal(raw as any, encKey) : raw) as FinancialGoal;
                });
                await AsyncStorage.setItem(KEYS.goals, JSON.stringify(goals));
                return goals;
            }
        } catch (e) {
            logSyncError('goals', 'load', e);
        }
    }
    const raw = await AsyncStorage.getItem(KEYS.goals);
    return safeParse<FinancialGoal[]>(raw);
}

// ─── Invoices ─────────────────────────────────────────────────────────────────
export async function saveInvoices(invoices: Invoice[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.invoices, JSON.stringify(invoices));
    const ownerId = await getWorkspaceOwnerId();
    if (!ownerId) return;
    const changed = diffChangedRows('invoices', invoices);
    try {
        const encKey = await getFieldEncryptionKey(await loadAuthSecret());
        const rows = changed.length > 0 ? changed.map(inv => ({
            id: inv.id, user_id: ownerId,
            data: encKey ? encryptInvoice(inv as unknown as Record<string, any>, encKey) : inv,
            updated_at: new Date().toISOString(),
        })) : [];

        // Parallel upsert + fetch remote IDs
        const [upsertResult, { data: remote, error: fetchErr }] = await Promise.all([
            rows.length > 0 ? supabase.from('invoices').upsert(rows, { onConflict: 'id' }) : Promise.resolve({ error: null }),
            supabase.from('invoices').select('id').eq('user_id', ownerId),
        ]);

        if (upsertResult.error) {
            logSyncError('invoices', 'upsert', upsertResult.error);
        } else {
            recordSyncedRows('invoices', invoices);
        }
        if (fetchErr) { logSyncError('invoices', 'select', fetchErr); return; }

        if (remote && remote.length > 0) {
            const localIds = new Set(invoices.map(inv => inv.id));
            const toDelete = remote.filter(r => !localIds.has(r.id)).map(r => r.id);
            if (toDelete.length > 0) {
                const { error: delErr } = await supabase.from('invoices').delete().in('id', toDelete);
                if (delErr) logSyncError('invoices', 'delete', delErr);
            }
        }
    } catch (e) {
        logSyncError('invoices', 'sync', e);
        const rows = invoices.map(inv => ({ id: inv.id, user_id: ownerId, data: inv, updated_at: new Date().toISOString() }));
        await enqueue({ table: 'invoices', op: 'upsert', rows, userId: ownerId });
    }
}

export async function loadInvoices(): Promise<Invoice[] | null> {
    const ownerId = await getWorkspaceOwnerId();
    if (ownerId) {
        try {
            const { data, error } = await supabase
                .from('invoices')
                .select('data')
                .eq('user_id', ownerId)
                .order('updated_at', { ascending: false });
            if (error) { logSyncError('invoices', 'load', error); }
            else if (data && data.length > 0) {
                const encKey = await getFieldEncryptionKey(await loadAuthSecret());
                const list = data.map(r => {
                    const raw = r.data as Record<string, any>;
                    return (encKey && raw?.encrypted ? decryptInvoice(raw as any, encKey) : raw) as Invoice;
                });
                await AsyncStorage.setItem(KEYS.invoices, JSON.stringify(list));
                return list;
            }
        } catch (e) {
            logSyncError('invoices', 'load', e);
        }
    }
    const raw = await AsyncStorage.getItem(KEYS.invoices);
    return safeParse<Invoice[]>(raw);
}

// ─── Assets ───────────────────────────────────────────────────────────────────
export async function saveAssets(assets: Asset[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.assets, JSON.stringify(assets));
    const ownerId = await getWorkspaceOwnerId();
    if (!ownerId) return;
    const changed = diffChangedRows('assets', assets);
    try {
        const encKey = await getFieldEncryptionKey(await loadAuthSecret());
        const rows = changed.length > 0 ? changed.map(a => ({
            id: a.id, user_id: ownerId,
            data: encKey ? encryptAsset(a as unknown as Record<string, any>, encKey) : a,
            updated_at: new Date().toISOString(),
        })) : [];

        // Parallel upsert + fetch remote IDs
        const [upsertResult, { data: remote, error: fetchErr }] = await Promise.all([
            rows.length > 0 ? supabase.from('assets').upsert(rows, { onConflict: 'id' }) : Promise.resolve({ error: null }),
            supabase.from('assets').select('id').eq('user_id', ownerId),
        ]);

        if (upsertResult.error) {
            logSyncError('assets', 'upsert', upsertResult.error);
        } else {
            recordSyncedRows('assets', assets);
        }
        if (fetchErr) { logSyncError('assets', 'select', fetchErr); return; }

        if (remote && remote.length > 0) {
            const localIds = new Set(assets.map(a => a.id));
            const toDelete = remote.filter(r => !localIds.has(r.id)).map(r => r.id);
            if (toDelete.length > 0) {
                const { error: delErr } = await supabase.from('assets').delete().in('id', toDelete);
                if (delErr) logSyncError('assets', 'delete', delErr);
            }
        }
    } catch (e) {
        logSyncError('assets', 'sync', e);
        const rows = assets.map(a => ({ id: a.id, user_id: ownerId, data: a, updated_at: new Date().toISOString() }));
        await enqueue({ table: 'assets', op: 'upsert', rows, userId: ownerId });
    }
}

export async function loadAssets(): Promise<Asset[] | null> {
    const ownerId = await getWorkspaceOwnerId();
    if (ownerId) {
        try {
            const { data, error } = await supabase
                .from('assets')
                .select('data')
                .eq('user_id', ownerId)
                .order('updated_at', { ascending: false });
            if (error) { logSyncError('assets', 'load', error); }
            else if (data && data.length > 0) {
                const encKey = await getFieldEncryptionKey(await loadAuthSecret());
                const list = data.map(r => {
                    const raw = r.data as Record<string, any>;
                    return (encKey && raw?.encrypted ? decryptAsset(raw as any, encKey) : raw) as Asset;
                });
                await AsyncStorage.setItem(KEYS.assets, JSON.stringify(list));
                return list;
            }
        } catch (e) {
            logSyncError('assets', 'load', e);
        }
    }
    const raw = await AsyncStorage.getItem(KEYS.assets);
    return safeParse<Asset[]>(raw);
}

// ─── Loans ────────────────────────────────────────────────────────────────────
export async function saveLoans(loans: Loan[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.loans, JSON.stringify(loans));
    const ownerId = await getWorkspaceOwnerId();
    if (!ownerId) return;
    const changed = diffChangedRows('loans', loans);
    try {
        let upsertOk = true;
        if (changed.length > 0) {
            const encKey = await getFieldEncryptionKey(await loadAuthSecret());
            const rows = changed.map(l => ({
                id: l.id,
                user_id: ownerId,
                data: encKey ? encryptLoan(l as unknown as Record<string, any>, encKey) : l,
                updated_at: new Date().toISOString(),
            }));
            const { error } = await supabase.from('loans').upsert(rows, { onConflict: 'id' });
            if (error) { logSyncError('loans', 'upsert', error); upsertOk = false; }
        }
        if (upsertOk) recordSyncedRows('loans', loans);
        const { data: remote } = await supabase.from('loans').select('id').eq('user_id', ownerId);
        if (remote) {
            const localIds = new Set(loans.map(l => l.id));
            const toDelete = remote.filter(r => !localIds.has(r.id)).map(r => r.id);
            if (toDelete.length > 0) await supabase.from('loans').delete().in('id', toDelete);
        }
    } catch (e) { logSyncError('loans', 'sync', e); }
}

export async function loadLoans(): Promise<Loan[] | null> {
    const ownerId = await getWorkspaceOwnerId();
    if (ownerId) {
        try {
            const { data, error } = await supabase.from('loans').select('data').eq('user_id', ownerId);
            if (!error && data && data.length > 0) {
                const encKey = await getFieldEncryptionKey(await loadAuthSecret());
                const loans = data.map(r => {
                    const raw = r.data as Record<string, any>;
                    return (encKey && raw?.encrypted ? decryptLoan(raw as any, encKey) : raw) as Loan;
                });
                await AsyncStorage.setItem(KEYS.loans, JSON.stringify(loans));
                return loans;
            }
        } catch (e) { logSyncError('loans', 'load', e); }
    }
    const raw = await AsyncStorage.getItem(KEYS.loans);
    return safeParse<Loan[]>(raw);
}

// ─── Budgets ──────────────────────────────────────────────────────────────────
export async function saveBudgets(budgets: Budget[]): Promise<void> {
    await AsyncStorage.setItem('@quad360/budgets', JSON.stringify(budgets));
    const ownerId = await getWorkspaceOwnerId();
    if (!ownerId) return;
    const changed = diffChangedRows('budgets', budgets);
    try {
        let upsertOk = true;
        if (changed.length > 0) {
            const encKey = await getFieldEncryptionKey(await loadAuthSecret());
            const rows = changed.map(b => ({
                id: b.id,
                user_id: ownerId,
                data: encKey ? encryptBudget(b as unknown as Record<string, any>, encKey) : b,
                updated_at: new Date().toISOString(),
            }));
            const { error } = await supabase.from('budgets').upsert(rows, { onConflict: 'id' });
            if (error) { logSyncError('budgets', 'upsert', error); upsertOk = false; }
        }
        if (upsertOk) recordSyncedRows('budgets', budgets);
        const { data: remote } = await supabase.from('budgets').select('id').eq('user_id', ownerId);
        if (remote) {
            const localIds = new Set(budgets.map(b => b.id));
            const toDelete = remote.filter(r => !localIds.has(r.id)).map(r => r.id);
            if (toDelete.length > 0) await supabase.from('budgets').delete().in('id', toDelete);
        }
    } catch (e) { logSyncError('budgets', 'sync', e); }
}

export async function loadBudgets(): Promise<Budget[] | null> {
    const ownerId = await getWorkspaceOwnerId();
    if (ownerId) {
        try {
            const { data, error } = await supabase.from('budgets').select('data').eq('user_id', ownerId);
            if (!error && data && data.length > 0) {
                const encKey = await getFieldEncryptionKey(await loadAuthSecret());
                const budgets = data.map(r => {
                    const raw = r.data as Record<string, any>;
                    return (encKey && raw?.encrypted ? decryptBudget(raw as any, encKey) : raw) as Budget;
                });
                await AsyncStorage.setItem('@quad360/budgets', JSON.stringify(budgets));
                return budgets;
            }
        } catch (e) { logSyncError('budgets', 'load', e); }
    }
    const raw = await AsyncStorage.getItem('@quad360/budgets');
    return safeParse<Budget[]>(raw);
}

const CASH_POCKETS_KEY = '@quad360/cashPockets';

export async function saveCashPockets(pockets: CashPocket[]): Promise<void> {
    await AsyncStorage.setItem(CASH_POCKETS_KEY, JSON.stringify(pockets));
    const ownerId = await getWorkspaceOwnerId();
    if (!ownerId) return;
    try {
        if (pockets.length > 0) {
            const rows = pockets.map(p => ({
                id: p.id,
                user_id: ownerId,
                data: p,
                updated_at: new Date().toISOString(),
            }));
            const { error } = await supabase.from('cash_pockets').upsert(rows, { onConflict: 'id' });
            if (error) logSyncError('cash_pockets', 'upsert', error);
        }
        const { data: remote } = await supabase.from('cash_pockets').select('id').eq('user_id', ownerId);
        if (remote) {
            const localIds = new Set(pockets.map(p => p.id));
            const toDelete = remote.filter(r => !localIds.has(r.id)).map(r => r.id);
            if (toDelete.length > 0) await supabase.from('cash_pockets').delete().in('id', toDelete);
        }
    } catch (e) { logSyncError('cash_pockets', 'sync', e); }
}

export async function loadCashPockets(): Promise<CashPocket[] | null> {
    const ownerId = await getWorkspaceOwnerId();
    if (ownerId) {
        try {
            const { data, error } = await supabase.from('cash_pockets').select('data').eq('user_id', ownerId);
            if (!error && data && data.length > 0) {
                const pockets = data.map(r => r.data as CashPocket);
                await AsyncStorage.setItem(CASH_POCKETS_KEY, JSON.stringify(pockets));
                return pockets;
            }
        } catch (e) { logSyncError('cash_pockets', 'load', e); }
    }
    const raw = await AsyncStorage.getItem(CASH_POCKETS_KEY);
    return safeParse<CashPocket[]>(raw);
}

// ─── Team Members ─────────────────────────────────────────────────────────────
export async function loadTeamMembers(): Promise<TeamMember[]> {
    const ownerId = await getAuthUserId();
    if (!ownerId) return [];
    try {
        const { data, error } = await supabase
            .from('team_members')
            .select('*')
            .eq('owner_user_id', ownerId)
            .order('invited_at', { ascending: false });
        if (error || !data) { logSyncError('team_members', 'load', error); return []; }
        return data.map(r => ({
            id:           r.id,
            ownerUserId:  r.owner_user_id,
            memberEmail:  r.member_email,
            memberUserId: r.member_user_id,
            role:         r.role,
            status:       r.status,
            inviteCode:   r.invite_code,
            invitedAt:    r.invited_at,
        }));
    } catch (e) {
        logSyncError('team_members', 'load', e);
        return [];
    }
}

export async function inviteTeamMember(
    memberEmail: string,
    role: 'accountant' | 'staff',
): Promise<string> {
    const ownerId = await getAuthUserId();
    if (!ownerId) throw new Error('Not authenticated.');
    // Use two segments of random to reduce collision probability
    const seg1 = Math.random().toString(36).substring(2, 5).toUpperCase();
    const seg2 = Math.random().toString(36).substring(2, 5).toUpperCase();
    const inviteCode = (seg1 + seg2).substring(0, 6);
    const { error } = await supabase.from('team_members').insert({
        owner_user_id: ownerId,
        member_email:  memberEmail.toLowerCase().trim(),
        role,
        invite_code:   inviteCode,
        status:        'pending',
    });
    if (error) throw new Error(error.message);
    return inviteCode;
}

export async function removeTeamMember(memberId: string): Promise<void> {
    const { error } = await supabase.from('team_members').delete().eq('id', memberId);
    if (error) logSyncError('team_members', 'delete', error);
}

// Called when a team member joins using their invite code
export async function joinTeamWithCode(
    memberUserId: string,
    inviteCode: string,
): Promise<{ ownerId: string; role: 'accountant' | 'staff' }> {
    const { data, error } = await supabase
        .from('team_members')
        .select('*')
        .eq('invite_code', inviteCode.toUpperCase())
        .eq('status', 'pending')
        .single();
    if (error || !data) throw new Error('Invalid or already used invite code.');
    const { error: updateErr } = await supabase.from('team_members')
        .update({ member_user_id: memberUserId, status: 'active' })
        .eq('id', data.id);
    if (updateErr) throw new Error('Could not activate team membership: ' + updateErr.message);
    return { ownerId: data.owner_user_id, role: data.role };
}

// ─── Inventory (now synced with Supabase for backup) ──────────────────────────
export async function saveInventory(items: InventoryItem[]): Promise<void> {
    await AsyncStorage.setItem('@quad360/inventory', JSON.stringify(items));
    const ownerId = await getWorkspaceOwnerId();
    if (!ownerId) return;
    const changed = diffChangedRows('inventory', items);
    try {
        const rows = changed.length > 0 ? changed.map(item => ({
            id: item.id,
            user_id: ownerId,
            name: item.name,
            sku: item.sku ?? null,
            category: item.category,
            quantity: item.quantity,
            unit: item.unit,
            cost_price: item.costPrice,
            selling_price: item.sellingPrice,
            low_stock_threshold: item.lowStockThreshold,
            supplier: item.supplier ?? null,
            price_history: item.priceHistory ?? [],
            created_at: item.createdAt,
            updated_at: item.updatedAt,
        })) : [];

        // Parallel upsert + fetch remote IDs
        const [upsertResult, { data: remote, error: fetchErr }] = await Promise.all([
            rows.length > 0 ? supabase.from('inventory').upsert(rows, { onConflict: 'id' }) : Promise.resolve({ error: null }),
            supabase.from('inventory').select('id').eq('user_id', ownerId),
        ]);

        if (upsertResult.error) {
            logSyncError('inventory', 'upsert', upsertResult.error);
        } else {
            recordSyncedRows('inventory', items);
        }
        if (fetchErr) { logSyncError('inventory', 'select', fetchErr); return; }

        if (remote && remote.length > 0) {
            const localIds = new Set(items.map(i => i.id));
            const toDelete = remote.filter(r => !localIds.has(r.id)).map(r => r.id);
            if (toDelete.length > 0) {
                const { error: delErr } = await supabase.from('inventory').delete().in('id', toDelete);
                if (delErr) logSyncError('inventory', 'delete', delErr);
            }
        }
    } catch (e) {
        logSyncError('inventory', 'sync', e);
    }
}
export async function loadInventory(): Promise<InventoryItem[] | null> {
    const ownerId = await getWorkspaceOwnerId();
    if (ownerId) {
        try {
            const { data, error } = await supabase
                .from('inventory')
                .select('*')
                .eq('user_id', ownerId)
                .order('updated_at', { ascending: false });
            if (error) { logSyncError('inventory', 'load', error); }
            else if (data && data.length > 0) {
                const items = data.map(row => ({
                    id: row.id,
                    name: row.name,
                    sku: row.sku ?? undefined,
                    category: row.category,
                    quantity: row.quantity,
                    unit: row.unit,
                    costPrice: row.cost_price,
                    sellingPrice: row.selling_price,
                    lowStockThreshold: row.low_stock_threshold,
                    supplier: row.supplier ?? undefined,
                    priceHistory: row.price_history && row.price_history.length > 0 ? row.price_history : undefined,
                    createdAt: row.created_at,
                    updatedAt: row.updated_at,
                } as InventoryItem));
                await AsyncStorage.setItem('@quad360/inventory', JSON.stringify(items));
                return items;
            }
        } catch (e) {
            logSyncError('inventory', 'load', e);
        }
    }
    const raw = await AsyncStorage.getItem('@quad360/inventory');
    return safeParse<InventoryItem[]>(raw);
}

// ─── Language (per-device, not synced) ───────────────────────────────────────
export async function saveLanguage(lang: Language): Promise<void> {
    await AsyncStorage.setItem(KEYS.language, lang);
}
export async function loadLanguage(): Promise<Language> {
    const raw = await AsyncStorage.getItem(KEYS.language);
    return (raw as Language) ?? 'en';
}

// ─── Capital Commitments ────────────────────────────────────────────────────
// Local-only (device storage), same as language/theme preferences — no
// Supabase table exists for this yet, so this doesn't pretend to sync
// across devices the way transactions/loans/etc. do.
const CAPITAL_COMMITMENTS_KEY = '@quad360/capitalCommitments';
export async function saveCapitalCommitments(commitments: CapitalCommitment[]): Promise<void> {
    await AsyncStorage.setItem(CAPITAL_COMMITMENTS_KEY, JSON.stringify(commitments));
}
export async function loadCapitalCommitments(): Promise<CapitalCommitment[] | null> {
    const raw = await AsyncStorage.getItem(CAPITAL_COMMITMENTS_KEY);
    return safeParse<CapitalCommitment[]>(raw);
}

// ─── Readiness History ───────────────────────────────────────────────────────
// Local-only, same as Capital Commitments above — no Supabase table exists
// for this yet, so a business's readiness trend doesn't follow them across
// devices. Good enough for a v1: the trend still builds correctly as long
// as they keep using the same device.
const READINESS_HISTORY_KEY = '@quad360/readinessHistory';
export async function saveReadinessHistory(history: ReadinessSnapshot[]): Promise<void> {
    await AsyncStorage.setItem(READINESS_HISTORY_KEY, JSON.stringify(history));
}
export async function loadReadinessHistory(): Promise<ReadinessSnapshot[] | null> {
    const raw = await AsyncStorage.getItem(READINESS_HISTORY_KEY);
    return safeParse<ReadinessSnapshot[]>(raw);
}

// ─── PIN (local only — never sent to server) ──────────────────────────────────
// PIN is now stored securely using expo-secure-store
// Shared with registerLocalAccount/switchLocalAccount below so a PIN typed
// against the multi-account registry hashes identically to one checked here.
export function hashPinValue(pin: string): string {
    return CryptoJS.SHA256(pin + 'Q360_SME_2025').toString(CryptoJS.enc.Hex) + '_Q360';
}
export async function savePin(pin: string): Promise<void> {
    // Store hash not raw PIN so plaintext never sits in storage
    await savePinSecurely(hashPinValue(pin));
}
export async function loadPin(): Promise<string | null> {
    return loadPinSecurely();
}

// ─── Auth secret (the real Supabase Auth password — local only, never sent
// anywhere except as the password field in Supabase's own sign-in/sign-up
// calls) ─────────────────────────────────────────────────────────────────
// A 6-digit PIN is far too small a space to ever be a real remote-auth
// credential — see OptimizedContexts.tsx's login/setupAccount for why this
// exists. generateAuthSecret() produces a high-entropy value that is never
// derived from the PIN, so brute-forcing PINs offline no longer yields a
// working Supabase password.
export function generateAuthSecret(): string {
    return CryptoJS.lib.WordArray.random(32).toString(CryptoJS.enc.Hex);
}
export async function saveAuthSecret(secret: string): Promise<void> {
    await saveAuthSecretSecurely(secret);
}
export async function loadAuthSecret(): Promise<string | null> {
    return loadAuthSecretSecurely();
}
export async function clearAuthSecret(): Promise<void> {
    await clearAuthSecretSecurely();
}

// ─── Multiple accounts on one device ───────────────────────────────────────
// The pin/authSecret/profile above are a SINGLE slot holding whichever one
// account is currently active on this device -- every login, PIN reset, or
// device verification overwrites them. That's fine for the common case (one
// business per device), but it means two owners (or one owner testing two
// businesses) sharing a browser kept silently evicting each other: resetting
// account B's PIN overwrote account A's locally-stored credential, even
// though nothing about account A's real data ever changed server-side.
//
// This registry is additive, not a replacement -- everything above keeps
// working exactly as before for the single-account case. Each entry holds
// what's needed to both verify a returning PIN locally and re-establish that
// account's cloud session without re-deriving the secret from the PIN (see
// generateAuthSecret's own comment for why the PIN itself must never be the
// real credential).
export interface LocalAccountRecord {
    email: string;
    businessName: string;
    pinHash: string;
    authSecret: string;
    createdAt: string;
}

// The UI-facing shape -- never includes pinHash/authSecret, so a component
// that lists "other accounts on this device" can't accidentally leak them
// into a render tree, log, or crash report.
export interface LocalAccountSummary {
    email: string;
    businessName: string;
    createdAt: string;
}

async function loadLocalAccountRecords(): Promise<LocalAccountRecord[]> {
    const raw = await loadLocalAccountsSecurely();
    return safeParse<LocalAccountRecord[]>(raw) ?? [];
}

// Called wherever an account's PIN/authSecret is (re)established on this
// device -- setupAccount (brand new) and recoverAccount (PIN reset, device
// verification, or an email+PIN login that re-derived a fresh secret) alike
// -- so the NEXT time a different account becomes active here, this one is
// still switchable back to instead of silently gone.
export async function registerLocalAccount(email: string, businessName: string, pin: string, authSecret: string, createdAt: string): Promise<void> {
    const accounts = await loadLocalAccountRecords();
    const idx = accounts.findIndex(a => a.email.toLowerCase() === email.trim().toLowerCase());
    // An in-progress recovery flow sometimes only knows the email (not the
    // business name) at this point -- keep whatever name was already on
    // file for this account rather than blanking it out.
    const resolvedBusinessName = businessName.trim() || (idx >= 0 ? accounts[idx].businessName : 'My Business');
    const record: LocalAccountRecord = {
        email: email.trim(), businessName: resolvedBusinessName, pinHash: hashPinValue(pin), authSecret, createdAt,
    };
    if (idx >= 0) accounts[idx] = record; else accounts.push(record);
    await saveLocalAccountsSecurely(JSON.stringify(accounts));
}

// For the account-switcher UI -- every account this device currently knows
// how to unlock, safe to render directly.
export async function listLocalAccounts(): Promise<LocalAccountSummary[]> {
    const accounts = await loadLocalAccountRecords();
    return accounts.map(({ email, businessName, createdAt }) => ({ email, businessName, createdAt }));
}

// Verifies the PIN against a SPECIFIC registered account (not whichever one
// happens to be active), and if it matches, mirrors that account into the
// active pin/authSecret/profile slots every other function in this file
// already reads from -- callers still go through the same
// clearLocalFinancialCache + Supabase re-sign-in steps login()/recoverAccount()
// already use, so switching an account active is otherwise identical to
// logging into it fresh.
export async function switchLocalAccount(email: string, pin: string): Promise<'ok' | 'wrong-pin' | 'not-found'> {
    const accounts = await loadLocalAccountRecords();
    const account = accounts.find(a => a.email.toLowerCase() === email.trim().toLowerCase());
    if (!account) return 'not-found';
    if (hashPinValue(pin) !== account.pinHash) return 'wrong-pin';
    await savePinSecurely(account.pinHash);
    await saveAuthSecretSecurely(account.authSecret);
    await AsyncStorage.setItem(KEYS.profile, JSON.stringify({
        email: account.email, businessName: account.businessName, createdAt: account.createdAt,
    } as StoredProfile));
    return 'ok';
}

// Drops one account from the switcher list without touching any other
// registered account -- used by "Delete Account" (that specific account
// should stop being offered as a switch target; the others on this device
// must stay exactly as they were).
export async function removeLocalAccount(email: string | undefined | null): Promise<void> {
    if (!email) return;
    const accounts = await loadLocalAccountRecords();
    const filtered = accounts.filter(a => a.email.toLowerCase() !== email.trim().toLowerCase());
    if (filtered.length !== accounts.length) await saveLocalAccountsSecurely(JSON.stringify(filtered));
}

// Wipes the whole registry -- only for a genuine full-device reset ("Erase
// local data" / "Reset app"), where forgetting every account this device
// has ever known about is the actual intent, unlike a single logout or a
// single account deletion.
export async function clearLocalAccountsRegistry(): Promise<void> {
    await clearLocalAccountsSecurely();
}

// ─── Field-encryption key sync ─────────────────────────────────────────────
// getFieldEncryptionKey() (encryption.ts) derived the AES key straight from
// authSecret -- fine until a password reset calls generateAuthSecret() again
// to mint a brand-new one (by design: a reset re-establishes trust with a
// fresh high-entropy secret, see LoginScreen.tsx). That regeneration also
// silently swapped out the encryption key underneath every row already
// synced to Supabase with the OLD secret, which no longer decrypts --
// amount/description/category (and every other encrypted field) come back
// as undefined, which is what crashed every screen reading them and made
// the account look wiped after a reset.
//
// Fix: keep one canonical field-encryption key per account in Supabase
// user_metadata, completely decoupled from the auth password. Call this
// once a live session exists (signup, and critically before a password
// reset's local secret gets overwritten) -- it pulls the existing key if
// Supabase already has one, or (first time only) adopts whatever this
// device can currently derive and publishes that as canonical so every
// future device/reset converges on the same key instead of each reset
// minting a new, incompatible one.
// `client` defaults to the shared app-wide session (every existing caller's
// case: this account either already is, or is about to become, the active
// session in this browser). The PIN-reset flow (LoginScreen.tsx) passes an
// ephemeral, non-persisted client instead when it's resetting an account
// that ISN'T the one currently active on this device -- see that client's
// own comment for why. `trustLocalAuthSecret` must be false in that same
// situation: loadAuthSecret() below returns whichever account is CURRENTLY
// active on this device, which would be a completely different account's
// secret, not the one being reset -- deriving a fallback key from it would
// mint (and publish to Supabase as canonical) a key that doesn't actually
// belong to this account.
export async function syncFieldEncryptionKey(client: typeof supabase = supabase, trustLocalAuthSecret: boolean = true): Promise<void> {
    try {
        const { data: { user } } = await client.auth.getUser();
        if (!user) return;
        const remoteKey = user.user_metadata?.field_encryption_key as string | undefined;
        if (remoteKey) {
            await setEncryptionKey(remoteKey);
            return;
        }
        const currentAuthSecret = trustLocalAuthSecret ? await loadAuthSecret() : null;
        const key = currentAuthSecret ? deriveFieldEncryptionKey(currentAuthSecret) : await generateEncryptionKey();
        await setEncryptionKey(key);
        await client.auth.updateUser({ data: { field_encryption_key: key } }).catch(() => {});
    } catch (e) {
        logSyncError('encryptionKey', 'sync', e);
    }
}

// ─── Profile ──────────────────────────────────────────────────────────────────
export interface StoredProfile { email: string; businessName: string; phone?: string; createdAt?: string }

export async function saveProfile(p: StoredProfile): Promise<void> {
    await AsyncStorage.setItem(KEYS.profile, JSON.stringify(p));
    const userId = await getAuthUserId();
    if (!userId) return;
    try {
        const { error } = await supabase.from('profiles').upsert(
            { id: userId, email: p.email, business_name: p.businessName },
            { onConflict: 'id' },
        );
        if (error) logSyncError('profiles', 'upsert', error);
    } catch (e) {
        logSyncError('profiles', 'sync', e);
    }
}

export async function loadProfile(): Promise<StoredProfile | null> {
    const raw = await AsyncStorage.getItem(KEYS.profile);
    return safeParse<StoredProfile>(raw);
}

// login(pin) (OptimizedContexts.tsx) is a PURELY LOCAL check -- it verifies
// a PIN against whatever profile happens to be cached on this device and
// has no way to know which email the caller actually intends. On the
// email+PIN sign-in form, calling it unconditionally used to mean: type a
// DIFFERENT email than the one cached on this device, but the SAME PIN
// (easy to do by accident when testing multiple accounts with a memorable
// PIN), and this device would silently unlock the OTHER, cached account
// instead -- the email typed was never actually checked against anything.
// Callers must gate the local PIN fallback on this matching first.
export function localProfileMatchesEmail(profile: StoredProfile | null, email: string): boolean {
    return !!profile && profile.email.trim().toLowerCase() === email.trim().toLowerCase();
}

// ─── Consent tracking ─────────────────────────────────────────────────────────
// Append-only: a new row per acceptance, matching user_consents' schema (see
// migration 013). Never overwrites a prior acceptance, so re-consenting after
// a policy change is a new dated record, not a silently-lost history of what
// was agreed to and when. No-ops (rather than throwing) when signed out or
// offline — recording consent must never block the signup flow it's called
// from; a failed write here is logged, not surfaced as a blocking error.
export async function recordConsent(consentType: string, version: string): Promise<void> {
    const userId = await getAuthUserId();
    if (!userId) return;
    try {
        const { error } = await supabase.from('user_consents').insert({
            user_id: userId, consent_type: consentType, version,
        });
        if (error) logSyncError('user_consents', 'insert', error);
    } catch (e) {
        logSyncError('user_consents', 'insert', e);
    }
}

// ─── Full data export / import / clear ───────────────────────────────────────
// v1 only ever exported transactions/settings/goals -- a real "download my
// data" has to cover every table this account's data actually lives in, not
// a subset. v2 adds the rest of what's already loaded into app state
// (invoices/assets/loans/budgets/inventory/cashPockets/staff/payrollRuns/
// capitalCommitments/readinessHistory) plus the two tables never surfaced as
// context state at all (audit_logs, user_consents), fetched directly here.
export interface AppBackup {
    version: number;
    exportedAt: string;
    profile: StoredProfile | null;
    transactions: Transaction[];
    settings: BusinessSettings;
    goals: FinancialGoal[];
    invoices?: Invoice[];
    assets?: Asset[];
    loans?: Loan[];
    budgets?: Budget[];
    inventory?: InventoryItem[];
    cashPockets?: CashPocket[];
    staff?: StaffMember[];
    payrollRuns?: PayrollRun[];
    capitalCommitments?: CapitalCommitment[];
    readinessHistory?: ReadinessSnapshot[];
    auditLogs?: unknown[];
    consents?: unknown[];
}

export interface ExportInput {
    transactions: Transaction[];
    settings: BusinessSettings;
    goals: FinancialGoal[];
    invoices: Invoice[];
    assets: Asset[];
    loans: Loan[];
    budgets: Budget[];
    inventory: InventoryItem[];
    cashPockets: CashPocket[];
    staff: StaffMember[];
    payrollRuns: PayrollRun[];
    capitalCommitments: CapitalCommitment[];
    readinessHistory: ReadinessSnapshot[];
}

export async function exportAllData(input: ExportInput): Promise<string> {
    const userId = await getAuthUserId();
    const profile = await loadProfile();

    let auditLogs: unknown[] = [];
    let consents: unknown[] = [];
    if (userId) {
        const [auditRes, consentRes] = await Promise.all([
            supabase.from('audit_logs').select('*').eq('user_id', userId),
            supabase.from('user_consents').select('*').eq('user_id', userId),
        ]);
        if (auditRes.error) logSyncError('audit_logs', 'select', auditRes.error); else auditLogs = auditRes.data ?? [];
        if (consentRes.error) logSyncError('user_consents', 'select', consentRes.error); else consents = consentRes.data ?? [];
    }

    const backup: AppBackup = {
        version: 2,
        exportedAt: new Date().toISOString(),
        profile,
        ...input,
        auditLogs,
        consents,
    };
    return JSON.stringify(backup, null, 2);
}

export async function importAllData(json: string): Promise<AppBackup> {
    let parsed: AppBackup;
    try { parsed = JSON.parse(json) as AppBackup; }
    catch { throw new Error('Invalid JSON — could not parse the backup file.'); }
    if (!parsed.version || !Array.isArray(parsed.transactions)) {
        throw new Error('Invalid backup format. Make sure you are pasting a Quad360 backup.');
    }
    // Every field below is optional on AppBackup (v1 files predate them) --
    // restore only what the file actually contains rather than overwriting
    // current data with an empty array for anything a v1 backup never had.
    const restores: Promise<void>[] = [
        saveTransactions(parsed.transactions),
        saveSettings(parsed.settings),
        saveGoals(parsed.goals ?? []),
    ];
    if (parsed.invoices) restores.push(saveInvoices(parsed.invoices));
    if (parsed.assets) restores.push(saveAssets(parsed.assets));
    if (parsed.loans) restores.push(saveLoans(parsed.loans));
    if (parsed.budgets) restores.push(saveBudgets(parsed.budgets));
    if (parsed.inventory) restores.push(saveInventory(parsed.inventory));
    if (parsed.cashPockets) restores.push(saveCashPockets(parsed.cashPockets));
    if (parsed.staff) restores.push(saveStaff(parsed.staff));
    if (parsed.payrollRuns) restores.push(savePayrollRuns(parsed.payrollRuns));
    if (parsed.capitalCommitments) restores.push(saveCapitalCommitments(parsed.capitalCommitments));
    if (parsed.readinessHistory) restores.push(saveReadinessHistory(parsed.readinessHistory));
    await Promise.all(restores);
    return parsed;
}

// Every locally-cached key that holds business/account-specific data,
// shared by clearAllData and clearLocalFinancialCache below so the two
// can't drift apart (each used to maintain its own separate copy of this
// list, which is exactly how READINESS_HISTORY_KEY ended up missing from
// both — a second account on this device, or even the switcher's Switch
// Account, would render the FIRST account's readiness-score history as
// its own, since that key has no Supabase table backing it and nothing
// was ever clearing the stale local copy). Most of these are cheap,
// low-severity "which UI element has this device already dismissed"
// bookkeeping -- included anyway since a second account inheriting a
// stranger's dismissed alerts, celebrated goals, or usage streak is a
// real (if minor) correctness bug, and the cost of clearing one extra
// key is effectively zero. LEARNED_RULES_KEY and the bank-profile cache
// are the one AsyncStorage keys here that leak real business identity
// (supplier/customer name patterns, which bank the account uses) rather
// than just app UI state.
const FINANCIAL_CACHE_KEYS = [
    KEYS.transactions, KEYS.settings, KEYS.goals, KEYS.invoices,
    KEYS.assets, KEYS.loans, KEYS.staff, KEYS.payrollRuns,
    '@quad360/inventory', '@quad360/budgets', CASH_POCKETS_KEY, CAPITAL_COMMITMENTS_KEY,
    'quad360_tactic_executions_v1', 'quad360_tactic_outcomes_v1', '@quad360/financing',
    READINESS_HISTORY_KEY,
    // transactionCategorization.ts's learned category-correction rules --
    // keyed by transaction description text, so this can otherwise leak
    // one business's actual supplier/customer names into another
    // account's auto-categorization on this device.
    'quad360_learned_category_rules_v1',
    // bankProfileManager.ts's saved column-mapping profiles -- reveals
    // which bank(s) this business uses, not just app UI state.
    '@smeApp_bankProfiles',
    // DashboardScreen.tsx
    '@quad360/celebrated_goal_ids', '@quad360/monthly_mission',
    // Header.tsx -- dismissed alert ids
    '@quad360/dismissed_alerts',
    // RetentionNudges.tsx -- usage streak/milestone state; a second
    // account inheriting a stranger's streak is exactly the kind of
    // "looks like MY data" bug this device already had enough of.
    '@quad360/milestones_seen', '@quad360/streak_date', '@quad360/streak_count', '@quad360/retention_last_seen',
    // invoiceReminders.ts
    '@quad360/invoice_reminder_state',
];

// Clears local storage only — Supabase data is preserved so user can sign back in and recover.
// Wipes every locally-cached key. Used on logout/account switch so a new
// identity on the same device never inherits the previous user's cached data
// (transactions/staff/payroll had no per-user namespacing, so a stale cache
// could otherwise leak into the next session — see clearLocalCache below for
// the logout-specific variant that also preserves nothing).
export async function clearAllData(): Promise<void> {
    await AsyncStorage.multiRemove([
        ...FINANCIAL_CACHE_KEYS,
        KEYS.pin, KEYS.profile, KEYS.language, KEYS.workspaceOwner,
    ]);
    await clearAllSecureData();
    // Without this, the in-memory delta-sync snapshot (see "Delta-sync
    // cache" above) would still think the PREVIOUS account's records were
    // already synced -- if a new/different account happened to reuse any
    // of the same client-generated ids, their real data could be silently
    // skipped on upload.
    resetSyncDiffCache();
}

// Clears the local cache of financial/business data (everything except the
// device-level PIN/profile) — called whenever the signed-in identity changes
// (logout, or setup/recover/join running without a prior explicit logout),
// so a different account never renders or re-uploads a previous user's data.
export async function clearLocalFinancialCache(): Promise<void> {
    await AsyncStorage.multiRemove([
        ...FINANCIAL_CACHE_KEYS,
        // getWorkspaceOwnerId() falls back to this cached id before the
        // current session's own user id -- every one of the 27 call sites
        // keyed off it (every save/load in this file) would otherwise keep
        // reading and writing whichever OTHER account this device last
        // pointed at (e.g. from an earlier team-join test), even after a
        // brand-new identity signs in here via setup/recover/join. This was
        // the one key clearLocalFinancialCache's own "whenever the
        // signed-in identity changes" contract didn't actually keep --
        // exactly the bug where a PIN reset for one account, on a device
        // that had ever pointed at a different account's workspace,
        // silently lands the owner in the OTHER account's data instead.
        KEYS.workspaceOwner,
    ]);
    // See the matching note in clearAllData above -- same reasoning applies
    // whenever the signed-in identity changes, not just on explicit logout.
    resetSyncDiffCache();
}

// Backs Settings' "Reset Business Data" action. Its own confirmation dialog
// promises two things clearAllData() doesn't deliver: (1) it "permanently
// deletes" transactions/invoices/goals/assets/loans/inventory -- but
// clearAllData() only ever clears the local AsyncStorage cache, never
// Supabase, so the "deleted" records simply resync right back down the next
// time this device (or any other) reloads. deleteAccountData() had this
// exact same bug and was already fixed for the "Delete Account" flow (see
// its own comment); this was the equivalent fix for "Reset Business Data",
// which never got it. (2) it promises "your account and settings are
// kept" -- but clearAllData() also wipes the local PIN, profile, and
// settings, signing the device out in the process.
//
// Owner-gated internally, not just by hiding the button in the UI: a team
// member's getWorkspaceOwnerId() resolves to the OWNER's id (that's how
// they see the shared workspace), so without this check an invited
// accountant -- meant to be read+export only -- could wipe the owner's
// entire business dataset.
export async function deleteAllBusinessRecords(): Promise<void> {
    const authUserId = await getAuthUserId();
    const ownerId = await getWorkspaceOwnerId();
    if (authUserId && ownerId && authUserId === ownerId) {
        const tables = ['transactions', 'invoices', 'goals', 'assets', 'loans', 'inventory'];
        const results = await Promise.all(
            tables.map(table => supabase.from(table).delete().eq('user_id', ownerId))
        );
        results.forEach((r, i) => { if (r.error) logSyncError(tables[i], 'delete', r.error); });
    }
    await AsyncStorage.multiRemove([
        KEYS.transactions, KEYS.goals, KEYS.invoices, KEYS.assets, KEYS.loans, '@quad360/inventory',
    ]);
    resetSyncDiffCache();
}

// ─── Staff ────────────────────────────────────────────────────────────────────
// Cloud-first, mirroring the pattern used by transactions/loans/budgets/etc.:
// save upserts to Supabase (and removes rows deleted locally), load prefers
// Supabase and falls back to the local cache when offline/no owner yet.
export async function saveStaff(staff: StaffMember[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.staff, JSON.stringify(staff));
    const ownerId = await getWorkspaceOwnerId();
    if (!ownerId) return;
    try {
        await syncStaffToSupabase(staff, ownerId);
        const { data: remote } = await supabase.from('staff').select('id').eq('user_id', ownerId);
        if (remote) {
            const localIds = new Set(staff.map(s => s.id));
            const toDelete = remote.filter(r => !localIds.has(r.id)).map(r => r.id);
            if (toDelete.length > 0) await supabase.from('staff').delete().in('id', toDelete);
        }
    } catch (e) { logSyncError('staff', 'sync', e); }
}
export async function loadStaff(): Promise<StaffMember[]> {
    const ownerId = await getWorkspaceOwnerId();
    if (ownerId) {
        try {
            const remote = await loadStaffFromSupabase(ownerId);
            if (remote.length > 0) {
                await AsyncStorage.setItem(KEYS.staff, JSON.stringify(remote));
                return remote;
            }
        } catch (e) { logSyncError('staff', 'load', e); }
    }
    try {
        const raw = await AsyncStorage.getItem(KEYS.staff);
        return safeParse<StaffMember[]>(raw) ?? [];
    } catch { return []; }
}

// ─── Payroll Runs ─────────────────────────────────────────────────────────────
export async function savePayrollRuns(runs: PayrollRun[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.payrollRuns, JSON.stringify(runs));
    const ownerId = await getWorkspaceOwnerId();
    if (!ownerId) return;
    try {
        await syncPayrollRunsToSupabase(runs, ownerId);
        const { data: remote } = await supabase.from('payroll_runs').select('id').eq('user_id', ownerId);
        if (remote) {
            const localIds = new Set(runs.map(r => r.id));
            const toDelete = remote.filter(r => !localIds.has(r.id)).map(r => r.id);
            if (toDelete.length > 0) await supabase.from('payroll_runs').delete().in('id', toDelete);
        }
    } catch (e) { logSyncError('payroll_runs', 'sync', e); }
}
export async function loadPayrollRuns(): Promise<PayrollRun[]> {
    const ownerId = await getWorkspaceOwnerId();
    if (ownerId) {
        try {
            const remote = await loadPayrollRunsFromSupabase(ownerId);
            if (remote.length > 0) {
                await AsyncStorage.setItem(KEYS.payrollRuns, JSON.stringify(remote));
                return remote;
            }
        } catch (e) { logSyncError('payroll_runs', 'load', e); }
    }
    try {
        const raw = await AsyncStorage.getItem(KEYS.payrollRuns);
        return safeParse<PayrollRun[]>(raw) ?? [];
    } catch { return []; }
}

// ─── Staff — Supabase sync ────────────────────────────────────────────────────
export async function syncStaffToSupabase(staff: StaffMember[], userId: string): Promise<void> {
    try {
        if (!staff.length) return;
        const rows = staff.map(s => ({ id: s.id, user_id: userId, data: s, updated_at: new Date().toISOString() }));
        await supabase.from('staff').upsert(rows, { onConflict: 'id' });
    } catch { /* offline — local save already done */ }
}

export async function loadStaffFromSupabase(userId: string): Promise<StaffMember[]> {
    try {
        const { data, error } = await supabase.from('staff').select('data').eq('user_id', userId).order('data->createdAt', { ascending: true });
        if (error || !data) return [];
        return data.map((r: any) => r.data as StaffMember);
    } catch { return []; }
}

// ─── Payroll Runs — Supabase sync ─────────────────────────────────────────────
export async function syncPayrollRunsToSupabase(runs: PayrollRun[], userId: string): Promise<void> {
    try {
        if (!runs.length) return;
        const rows = runs.map(r => ({ id: r.id, user_id: userId, data: r, updated_at: new Date().toISOString() }));
        await supabase.from('payroll_runs').upsert(rows, { onConflict: 'id' });
    } catch { /* offline */ }
}

export async function loadPayrollRunsFromSupabase(userId: string): Promise<PayrollRun[]> {
    try {
        const { data, error } = await supabase.from('payroll_runs').select('data').eq('user_id', userId).order('data->createdAt', { ascending: false });
        if (error || !data) return [];
        return data.map((r: any) => r.data as PayrollRun);
    } catch { return []; }
}

export async function deleteStaffFromSupabase(staffId: string, userId: string): Promise<void> {
    try {
        await supabase.from('staff').delete().eq('id', staffId).eq('user_id', userId);
    } catch { /* offline */ }
}

export async function deletePayrollRunFromSupabase(runId: string, userId: string): Promise<void> {
    try {
        await supabase.from('payroll_runs').delete().eq('id', runId).eq('user_id', userId);
    } catch { /* offline */ }
}

// ─── Merchant Financing — Supabase sync ──────────────────────────────────────
export async function syncFinancingToSupabase(financing: FinancingContextData, userId: string): Promise<void> {
    try {
        if (!financing) return;
        const row = { id: 'financing', user_id: userId, data: financing, updated_at: new Date().toISOString() };
        await supabase.from('merchant_financing').upsert([row], { onConflict: 'id,user_id' });
    } catch { /* offline — local save already done */ }
}

export async function loadFinancingFromSupabase(userId: string): Promise<FinancingContextData | null> {
    try {
        const { data, error } = await supabase.from('merchant_financing').select('data').eq('user_id', userId).single();
        if (error || !data) return null;
        return data.data as FinancingContextData;
    } catch { return null; }
}

// Permanently deletes all Supabase data for the owner. Use only for explicit "Delete Account" action.
// Real cloud deletion, not the local-only wipe SettingsScreen's copy used to
// imply while actually calling clearAllData() alone (a stale AsyncStorage
// cache is what that clears — the Supabase rows survived, so "sign back in"
// would have brought everything right back, contradicting the screen's own
// "permanently removes... from the cloud... cannot be undone" text).
//
// Deliberately scope-aware: getWorkspaceOwnerId() resolves to the OWNER's id
// for a team member (that's how they see the shared workspace), so using it
// unconditionally here — as the code this replaces did — would let a staff
// or accountant account's own "delete my account" wipe the OWNER's entire
// business data out from under them. Only the tables genuinely private to
// the account being deleted are ever touched unless authUserId IS the
// workspace owner.
export async function deleteAccountData(): Promise<void> {
    // Captured before anything below signs this device out, so the deleted
    // account can be dropped from the local multi-account registry (see
    // registerLocalAccount) without disturbing any OTHER account this
    // device also knows about.
    const deletedEmail = (await loadProfile())?.email;
    const authUserId = await getAuthUserId();
    if (!authUserId) { await clearAllData(); await removeLocalAccount(deletedEmail); return; }
    const workspaceOwnerId = await getWorkspaceOwnerId();
    const isOwner = authUserId === workspaceOwnerId;

    const results: { table: string; error: unknown }[] = [];
    const del = async (table: string, column: string, value: string) => {
        const { error } = await supabase.from(table).delete().eq(column, value);
        if (error) results.push({ table, error });
    };

    if (isOwner) {
        // The shared business dataset — only ever deleted when the account
        // being deleted IS the workspace owner, since every team member
        // (accountant/staff) reads and writes these same rows.
        await Promise.all([
            ...['transactions', 'goals', 'settings', 'invoices', 'assets', 'inventory', 'loans', 'budgets',
                'cash_pockets', 'merchant_financing']
                .map(t => del(t, 'user_id', authUserId)),
            // staff/payroll_runs store user_id as TEXT (see migration 004),
            // not a UUID column, but .eq() sends the same string either way.
            del('staff', 'user_id', authUserId),
            del('payroll_runs', 'user_id', authUserId),
            del('financing_pipeline_listings', 'business_user_id', authUserId),
            del('loan_monitoring_shares', 'business_user_id', authUserId),
        ]);
        // A team member who was reading this owner's workspace loses that
        // access once the owner's account (and all underlying data) is gone.
        await del('team_members', 'owner_user_id', authUserId);
    } else {
        // A team member deleting their OWN account: remove their own
        // membership row so they stop appearing in the owner's team list,
        // but never touch the owner's business data.
        await del('team_members', 'member_user_id', authUserId);
    }

    // Identity-scoped rows every account has, owner or member alike.
    await Promise.all([
        del('audit_logs', 'user_id', authUserId),
        del('two_factor_auth', 'user_id', authUserId),
        del('two_factor_verification_logs', 'user_id', authUserId),
        del('user_consents', 'user_id', authUserId),
    ]);
    await del('profiles', 'id', authUserId);

    results.forEach(r => logSyncError(r.table, 'delete', r.error));

    // The `payments` table (webhook-only, keyed by email, deny-all RLS) and
    // the actual auth.users login identity both require the service-role
    // key — neither is reachable from the authenticated client no matter
    // what RLS policy exists. See supabase/functions/delete-account, which
    // must be deployed separately for those two to actually be removed;
    // this call degrades gracefully (data is already gone above either way)
    // if that function isn't deployed yet.
    try {
        await supabase.functions.invoke('delete-account');
    } catch (e) {
        logSyncError('delete-account-function', 'invoke', e);
    }

    await clearAllData();
    await removeLocalAccount(deletedEmail);
    await supabase.auth.signOut();
}
