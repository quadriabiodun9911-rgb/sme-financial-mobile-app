import AsyncStorage from '@react-native-async-storage/async-storage';
import { Transaction, BusinessSettings, FinancialGoal, Invoice } from '../types';
import { supabase } from './supabase';

const KEYS = {
    transactions: '@financebook/transactions',
    settings:     '@financebook/settings',
    goals:        '@financebook/goals',
    pin:          '@financebook/pin',
    profile:      '@financebook/profile',
    invoices:     '@financebook/invoices',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function getUserId(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
}

// ─── Transactions ─────────────────────────────────────────────────────────────
export async function saveTransactions(t: Transaction[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.transactions, JSON.stringify(t));
    const userId = await getUserId();
    if (!userId) return;
    if (t.length > 0) {
        const rows = t.map(tx => ({ id: tx.id, user_id: userId, data: tx, updated_at: new Date().toISOString() }));
        await supabase.from('transactions').upsert(rows, { onConflict: 'id' });
    }
    // Remove deleted transactions from cloud
    const { data: remote } = await supabase.from('transactions').select('id').eq('user_id', userId);
    if (remote) {
        const localIds = new Set(t.map(tx => tx.id));
        const toDelete = remote.filter(r => !localIds.has(r.id)).map(r => r.id);
        if (toDelete.length > 0) {
            await supabase.from('transactions').delete().in('id', toDelete);
        }
    }
}

export async function loadTransactions(): Promise<Transaction[] | null> {
    const userId = await getUserId();
    if (userId) {
        const { data, error } = await supabase
            .from('transactions')
            .select('data')
            .eq('user_id', userId)
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
    const userId = await getUserId();
    if (!userId) return;
    await supabase.from('settings').upsert(
        { user_id: userId, data: s, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
    );
}

export async function loadSettings(): Promise<BusinessSettings | null> {
    const userId = await getUserId();
    if (userId) {
        const { data, error } = await supabase
            .from('settings')
            .select('data')
            .eq('user_id', userId)
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
    const userId = await getUserId();
    if (!userId) return;
    if (g.length > 0) {
        const rows = g.map(goal => ({ id: goal.id, user_id: userId, data: goal, updated_at: new Date().toISOString() }));
        await supabase.from('goals').upsert(rows, { onConflict: 'id' });
    }
    const { data: remote } = await supabase.from('goals').select('id').eq('user_id', userId);
    if (remote) {
        const localIds = new Set(g.map(goal => goal.id));
        const toDelete = remote.filter(r => !localIds.has(r.id)).map(r => r.id);
        if (toDelete.length > 0) {
            await supabase.from('goals').delete().in('id', toDelete);
        }
    }
}

export async function loadGoals(): Promise<FinancialGoal[] | null> {
    const userId = await getUserId();
    if (userId) {
        const { data, error } = await supabase
            .from('goals')
            .select('data')
            .eq('user_id', userId);
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
    const userId = await getUserId();
    if (!userId) return;
    if (invoices.length > 0) {
        const rows = invoices.map(inv => ({ id: inv.id, user_id: userId, data: inv, updated_at: new Date().toISOString() }));
        await supabase.from('invoices').upsert(rows, { onConflict: 'id' });
    }
    const { data: remote } = await supabase.from('invoices').select('id').eq('user_id', userId);
    if (remote) {
        const localIds = new Set(invoices.map(inv => inv.id));
        const toDelete = remote.filter(r => !localIds.has(r.id)).map(r => r.id);
        if (toDelete.length > 0) {
            await supabase.from('invoices').delete().in('id', toDelete);
        }
    }
}

export async function loadInvoices(): Promise<Invoice[] | null> {
    const userId = await getUserId();
    if (userId) {
        const { data, error } = await supabase
            .from('invoices')
            .select('data')
            .eq('user_id', userId)
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
    const userId = await getUserId();
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
    const backup: AppBackup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        transactions,
        settings,
        goals,
    };
    return JSON.stringify(backup, null, 2);
}

export async function importAllData(json: string): Promise<AppBackup> {
    let parsed: AppBackup;
    try {
        parsed = JSON.parse(json) as AppBackup;
    } catch {
        throw new Error('Invalid JSON — could not parse the backup file.');
    }
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
    await AsyncStorage.multiRemove([KEYS.transactions, KEYS.settings, KEYS.goals]);
    const userId = await getUserId();
    if (userId) {
        await Promise.all([
            supabase.from('transactions').delete().eq('user_id', userId),
            supabase.from('goals').delete().eq('user_id', userId),
            supabase.from('settings').delete().eq('user_id', userId),
        ]);
    }
}
