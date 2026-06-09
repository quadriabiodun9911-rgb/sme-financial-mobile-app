import AsyncStorage from '@react-native-async-storage/async-storage';
import { Transaction, BusinessSettings, FinancialGoal, Invoice, TeamMember } from '../types';
import { supabase } from './supabase';

const KEYS = {
    transactions:   '@financebook/transactions',
    settings:       '@financebook/settings',
    goals:          '@financebook/goals',
    pin:            '@financebook/pin',
    profile:        '@financebook/profile',
    invoices:       '@financebook/invoices',
    workspaceOwner: '@financebook/workspaceOwner',
};

// ─── Auth helpers ─────────────────────────────────────────────────────────────
export async function getAuthUserId(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
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
    await AsyncStorage.setItem(KEYS.transactions, JSON.stringify(t));
    const ownerId = await getWorkspaceOwnerId();
    if (!ownerId) return;
    if (t.length > 0) {
        const rows = t.map(tx => ({ id: tx.id, user_id: ownerId, data: tx, updated_at: new Date().toISOString() }));
        await supabase.from('transactions').upsert(rows, { onConflict: 'id' });
    }
    const { data: remote } = await supabase.from('transactions').select('id').eq('user_id', ownerId);
    if (remote) {
        const localIds = new Set(t.map(tx => tx.id));
        const toDelete = remote.filter(r => !localIds.has(r.id)).map(r => r.id);
        if (toDelete.length > 0) {
            await supabase.from('transactions').delete().in('id', toDelete);
        }
    }
}

export async function loadTransactions(): Promise<Transaction[] | null> {
    const ownerId = await getWorkspaceOwnerId();
    if (ownerId) {
        const { data, error } = await supabase
            .from('transactions')
            .select('data')
            .eq('user_id', ownerId)
            .order('updated_at', { ascending: false });
        if (!error && data && data.length > 0) {
            const txs = data.map(r => r.data as Transaction);
            await AsyncStorage.setItem(KEYS.transactions, JSON.stringify(txs));
            return txs;
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
    await supabase.from('settings').upsert(
        { user_id: ownerId, data: s, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
    );
}

export async function loadSettings(): Promise<BusinessSettings | null> {
    const ownerId = await getWorkspaceOwnerId();
    if (ownerId) {
        const { data, error } = await supabase
            .from('settings')
            .select('data')
            .eq('user_id', ownerId)
            .single();
        if (!error && data) {
            await AsyncStorage.setItem(KEYS.settings, JSON.stringify(data.data));
            return data.data as BusinessSettings;
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
    if (g.length > 0) {
        const rows = g.map(goal => ({ id: goal.id, user_id: ownerId, data: goal, updated_at: new Date().toISOString() }));
        await supabase.from('goals').upsert(rows, { onConflict: 'id' });
    }
    const { data: remote } = await supabase.from('goals').select('id').eq('user_id', ownerId);
    if (remote) {
        const localIds = new Set(g.map(goal => goal.id));
        const toDelete = remote.filter(r => !localIds.has(r.id)).map(r => r.id);
        if (toDelete.length > 0) {
            await supabase.from('goals').delete().in('id', toDelete);
        }
    }
}

export async function loadGoals(): Promise<FinancialGoal[] | null> {
    const ownerId = await getWorkspaceOwnerId();
    if (ownerId) {
        const { data, error } = await supabase
            .from('goals')
            .select('data')
            .eq('user_id', ownerId);
        if (!error && data && data.length > 0) {
            const goals = data.map(r => r.data as FinancialGoal);
            await AsyncStorage.setItem(KEYS.goals, JSON.stringify(goals));
            return goals;
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
    if (invoices.length > 0) {
        const rows = invoices.map(inv => ({ id: inv.id, user_id: ownerId, data: inv, updated_at: new Date().toISOString() }));
        await supabase.from('invoices').upsert(rows, { onConflict: 'id' });
    }
    const { data: remote } = await supabase.from('invoices').select('id').eq('user_id', ownerId);
    if (remote) {
        const localIds = new Set(invoices.map(inv => inv.id));
        const toDelete = remote.filter(r => !localIds.has(r.id)).map(r => r.id);
        if (toDelete.length > 0) {
            await supabase.from('invoices').delete().in('id', toDelete);
        }
    }
}

export async function loadInvoices(): Promise<Invoice[] | null> {
    const ownerId = await getWorkspaceOwnerId();
    if (ownerId) {
        const { data, error } = await supabase
            .from('invoices')
            .select('data')
            .eq('user_id', ownerId)
            .order('updated_at', { ascending: false });
        if (!error && data && data.length > 0) {
            const invoices = data.map(r => r.data as Invoice);
            await AsyncStorage.setItem(KEYS.invoices, JSON.stringify(invoices));
            return invoices;
        }
    }
    const raw = await AsyncStorage.getItem(KEYS.invoices);
    return raw ? (JSON.parse(raw) as Invoice[]) : null;
}

// ─── Team Members ─────────────────────────────────────────────────────────────
export async function loadTeamMembers(): Promise<TeamMember[]> {
    const ownerId = await getAuthUserId();
    if (!ownerId) return [];
    const { data, error } = await supabase
        .from('team_members')
        .select('*')
        .eq('owner_user_id', ownerId)
        .order('invited_at', { ascending: false });
    if (error || !data) return [];
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
}

export async function inviteTeamMember(
    memberEmail: string,
    role: 'accountant' | 'staff',
): Promise<string> {
    const ownerId = await getAuthUserId();
    if (!ownerId) throw new Error('Not authenticated.');
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
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
    await supabase.from('team_members').delete().eq('id', memberId);
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
    // Link this user to the invite
    await supabase.from('team_members')
        .update({ member_user_id: memberUserId, status: 'active' })
        .eq('id', data.id);
    return { ownerId: data.owner_user_id, role: data.role };
}

// ─── PIN (local only — never sent to server) ──────────────────────────────────
export async function savePin(pin: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.pin, pin);
}
export async function loadPin(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.pin);
}

// ─── Profile ──────────────────────────────────────────────────────────────────
export interface StoredProfile { email: string; businessName: string }

export async function saveProfile(p: StoredProfile): Promise<void> {
    await AsyncStorage.setItem(KEYS.profile, JSON.stringify(p));
    const userId = await getAuthUserId();
    if (!userId) return;
    await supabase.from('profiles').upsert(
        { id: userId, email: p.email, business_name: p.businessName },
        { onConflict: 'id' },
    );
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
        throw new Error('Invalid backup format. Make sure you are pasting a FinanceBook backup.');
    }
    await Promise.all([
        saveTransactions(parsed.transactions),
        saveSettings(parsed.settings),
        saveGoals(parsed.goals ?? []),
    ]);
    return parsed;
}

export async function clearAllData(): Promise<void> {
    await AsyncStorage.multiRemove([KEYS.transactions, KEYS.settings, KEYS.goals, KEYS.invoices]);
    const ownerId = await getWorkspaceOwnerId();
    if (ownerId) {
        await Promise.all([
            supabase.from('transactions').delete().eq('user_id', ownerId),
            supabase.from('goals').delete().eq('user_id', ownerId),
            supabase.from('settings').delete().eq('user_id', ownerId),
            supabase.from('invoices').delete().eq('user_id', ownerId),
        ]);
    }
}
