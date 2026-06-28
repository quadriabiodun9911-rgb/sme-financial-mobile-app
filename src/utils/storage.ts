import AsyncStorage from '@react-native-async-storage/async-storage';
import CryptoJS from 'crypto-js';
import { Transaction, BusinessSettings, FinancialGoal, Invoice, TeamMember, Language, Asset, InventoryItem, Loan, Budget, StaffMember, PayrollRun } from '../types';
import { supabase } from './supabase';
import { savePinSecurely, loadPinSecurely, clearPinSecurely, clearAllSecureData } from './secureStorage';
import { enqueue } from './syncQueue';
import { getEncryptionKey, encryptGoal, decryptGoal, encryptLoan, decryptLoan, encryptBudget, decryptBudget } from './encryption';

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
    try {
        const rows = t.length > 0 ? t.map(tx => ({ id: tx.id, user_id: ownerId, data: tx, updated_at: new Date().toISOString() })) : [];

        // Fetch remote IDs in parallel with upsert for optimal performance
        const [upsertResult, { data: remote, error: fetchErr }] = await Promise.all([
            t.length > 0 ? supabase.from('transactions').upsert(rows, { onConflict: 'id' }) : Promise.resolve({ error: null }),
            supabase.from('transactions').select('id').eq('user_id', ownerId),
        ]);

        if (upsertResult.error) {
            logSyncError('transactions', 'upsert', upsertResult.error);
            if (rows.length > 0) await enqueue({ table: 'transactions', op: 'upsert', rows, userId: ownerId });
            return;
        }

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
                const txs = data.map(r => r.data as Transaction);
                await AsyncStorage.setItem(KEYS.transactions, JSON.stringify(txs));
                return txs;
            }
        } catch (e) {
            logSyncError('transactions', 'load', e);
        }
    }
    const raw = await AsyncStorage.getItem(KEYS.transactions);
    return raw ? (JSON.parse(raw) as Transaction[]) : null;
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
    return raw ? (JSON.parse(raw) as BusinessSettings) : null;
}

// ─── Goals ────────────────────────────────────────────────────────────────────
export async function saveGoals(g: FinancialGoal[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.goals, JSON.stringify(g));
    const ownerId = await getWorkspaceOwnerId();
    if (!ownerId) return;
    try {
        const encKey = await getEncryptionKey();
        const rows = g.length > 0 ? g.map(goal => ({
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

        if (upsertResult.error) logSyncError('goals', 'upsert', upsertResult.error);
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
                const encKey = await getEncryptionKey();
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
    return raw ? (JSON.parse(raw) as FinancialGoal[]) : null;
}

// ─── Invoices ─────────────────────────────────────────────────────────────────
export async function saveInvoices(invoices: Invoice[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.invoices, JSON.stringify(invoices));
    const ownerId = await getWorkspaceOwnerId();
    if (!ownerId) return;
    try {
        const rows = invoices.length > 0 ? invoices.map(inv => ({ id: inv.id, user_id: ownerId, data: inv, updated_at: new Date().toISOString() })) : [];

        // Parallel upsert + fetch remote IDs
        const [upsertResult, { data: remote, error: fetchErr }] = await Promise.all([
            rows.length > 0 ? supabase.from('invoices').upsert(rows, { onConflict: 'id' }) : Promise.resolve({ error: null }),
            supabase.from('invoices').select('id').eq('user_id', ownerId),
        ]);

        if (upsertResult.error) logSyncError('invoices', 'upsert', upsertResult.error);
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
                const list = data.map(r => r.data as Invoice);
                await AsyncStorage.setItem(KEYS.invoices, JSON.stringify(list));
                return list;
            }
        } catch (e) {
            logSyncError('invoices', 'load', e);
        }
    }
    const raw = await AsyncStorage.getItem(KEYS.invoices);
    return raw ? (JSON.parse(raw) as Invoice[]) : null;
}

// ─── Assets ───────────────────────────────────────────────────────────────────
export async function saveAssets(assets: Asset[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.assets, JSON.stringify(assets));
    const ownerId = await getWorkspaceOwnerId();
    if (!ownerId) return;
    try {
        const rows = assets.length > 0 ? assets.map(a => ({ id: a.id, user_id: ownerId, data: a, updated_at: new Date().toISOString() })) : [];

        // Parallel upsert + fetch remote IDs
        const [upsertResult, { data: remote, error: fetchErr }] = await Promise.all([
            rows.length > 0 ? supabase.from('assets').upsert(rows, { onConflict: 'id' }) : Promise.resolve({ error: null }),
            supabase.from('assets').select('id').eq('user_id', ownerId),
        ]);

        if (upsertResult.error) logSyncError('assets', 'upsert', upsertResult.error);
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
                const list = data.map(r => r.data as Asset);
                await AsyncStorage.setItem(KEYS.assets, JSON.stringify(list));
                return list;
            }
        } catch (e) {
            logSyncError('assets', 'load', e);
        }
    }
    const raw = await AsyncStorage.getItem(KEYS.assets);
    return raw ? (JSON.parse(raw) as Asset[]) : null;
}

// ─── Loans ────────────────────────────────────────────────────────────────────
export async function saveLoans(loans: Loan[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.loans, JSON.stringify(loans));
    const ownerId = await getWorkspaceOwnerId();
    if (!ownerId) return;
    try {
        if (loans.length > 0) {
            const encKey = await getEncryptionKey();
            const rows = loans.map(l => ({
                id: l.id,
                user_id: ownerId,
                data: encKey ? encryptLoan(l as unknown as Record<string, any>, encKey) : l,
                updated_at: new Date().toISOString(),
            }));
            const { error } = await supabase.from('loans').upsert(rows, { onConflict: 'id' });
            if (error) logSyncError('loans', 'upsert', error);
        }
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
                const encKey = await getEncryptionKey();
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
    return raw ? (JSON.parse(raw) as Loan[]) : null;
}

// ─── Budgets ──────────────────────────────────────────────────────────────────
export async function saveBudgets(budgets: Budget[]): Promise<void> {
    await AsyncStorage.setItem('@quad360/budgets', JSON.stringify(budgets));
    const ownerId = await getWorkspaceOwnerId();
    if (!ownerId) return;
    try {
        if (budgets.length > 0) {
            const encKey = await getEncryptionKey();
            const rows = budgets.map(b => ({
                id: b.id,
                user_id: ownerId,
                data: encKey ? encryptBudget(b as unknown as Record<string, any>, encKey) : b,
                updated_at: new Date().toISOString(),
            }));
            const { error } = await supabase.from('budgets').upsert(rows, { onConflict: 'id' });
            if (error) logSyncError('budgets', 'upsert', error);
        }
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
                const encKey = await getEncryptionKey();
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
    return raw ? (JSON.parse(raw) as Budget[]) : null;
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
    try {
        const rows = items.length > 0 ? items.map(item => ({
            id: item.id,
            user_id: ownerId,
            name: item.name,
            category: item.category,
            quantity: item.quantity,
            unit: item.unit,
            cost_price: item.costPrice,
            selling_price: item.sellingPrice,
            low_stock_threshold: item.lowStockThreshold,
            created_at: item.createdAt,
            updated_at: item.updatedAt,
        })) : [];

        // Parallel upsert + fetch remote IDs
        const [upsertResult, { data: remote, error: fetchErr }] = await Promise.all([
            rows.length > 0 ? supabase.from('inventory').upsert(rows, { onConflict: 'id' }) : Promise.resolve({ error: null }),
            supabase.from('inventory').select('id').eq('user_id', ownerId),
        ]);

        if (upsertResult.error) logSyncError('inventory', 'upsert', upsertResult.error);
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
                    category: row.category,
                    quantity: row.quantity,
                    unit: row.unit,
                    costPrice: row.cost_price,
                    sellingPrice: row.selling_price,
                    lowStockThreshold: row.low_stock_threshold,
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
    return raw ? JSON.parse(raw) as InventoryItem[] : null;
}

// ─── Language (per-device, not synced) ───────────────────────────────────────
export async function saveLanguage(lang: Language): Promise<void> {
    await AsyncStorage.setItem(KEYS.language, lang);
}
export async function loadLanguage(): Promise<Language> {
    const raw = await AsyncStorage.getItem(KEYS.language);
    return (raw as Language) ?? 'en';
}

// ─── PIN (local only — never sent to server) ──────────────────────────────────
// PIN is now stored securely using expo-secure-store
export async function savePin(pin: string): Promise<void> {
    // Store hash not raw PIN so plaintext never sits in storage
    const hashed = CryptoJS.SHA256(pin + 'Q360_SME_2025').toString(CryptoJS.enc.Hex) + '_Q360';
    await savePinSecurely(hashed);
}
export async function loadPin(): Promise<string | null> {
    return loadPinSecurely();
}

// ─── Profile ──────────────────────────────────────────────────────────────────
export interface StoredProfile { email: string; businessName: string; phone?: string }

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
    return raw ? (JSON.parse(raw) as StoredProfile) : null;
}

// ─── Full data export / import / clear ───────────────────────────────────────
export interface AppBackup {
    version: number;
    exportedAt: string;
    transactions: Transaction[];
    settings: BusinessSettings;
    goals: FinancialGoal[];
}

export async function exportAllData(
    transactions: Transaction[],
    settings: BusinessSettings,
    goals: FinancialGoal[],
): Promise<string> {
    return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), transactions, settings, goals }, null, 2);
}

export async function importAllData(json: string): Promise<AppBackup> {
    let parsed: AppBackup;
    try { parsed = JSON.parse(json) as AppBackup; }
    catch { throw new Error('Invalid JSON — could not parse the backup file.'); }
    if (!parsed.version || !Array.isArray(parsed.transactions)) {
        throw new Error('Invalid backup format. Make sure you are pasting a Quad360 backup.');
    }
    await Promise.all([
        saveTransactions(parsed.transactions),
        saveSettings(parsed.settings),
        saveGoals(parsed.goals ?? []),
    ]);
    return parsed;
}

// Clears local storage only — Supabase data is preserved so user can sign back in and recover.
export async function clearAllData(): Promise<void> {
    await AsyncStorage.multiRemove([
        KEYS.transactions, KEYS.settings, KEYS.goals, KEYS.invoices,
        KEYS.assets, KEYS.loans, KEYS.pin, KEYS.profile, KEYS.language,
        KEYS.workspaceOwner, '@quad360/inventory', '@quad360/budgets',
    ]);
    await clearAllSecureData();
}

// ─── Staff ────────────────────────────────────────────────────────────────────
export async function saveStaff(staff: StaffMember[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.staff, JSON.stringify(staff));
}
export async function loadStaff(): Promise<StaffMember[]> {
    try {
        const raw = await AsyncStorage.getItem(KEYS.staff);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

// ─── Payroll Runs ─────────────────────────────────────────────────────────────
export async function savePayrollRuns(runs: PayrollRun[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.payrollRuns, JSON.stringify(runs));
}
export async function loadPayrollRuns(): Promise<PayrollRun[]> {
    try {
        const raw = await AsyncStorage.getItem(KEYS.payrollRuns);
        return raw ? JSON.parse(raw) : [];
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
export async function deleteAccountData(): Promise<void> {
    const ownerId = await getWorkspaceOwnerId();
    await clearAllData();
    if (ownerId) {
        const tables = ['transactions','goals','settings','invoices','assets','inventory','loans','budgets','audit_logs'];
        const results = await Promise.allSettled(
            tables.map(t => supabase.from(t).delete().eq('user_id', ownerId))
        );
        results.forEach((r, i) => {
            if (r.status === 'rejected') logSyncError(tables[i], 'delete', r.reason);
        });
        await supabase.auth.signOut();
    }
}
