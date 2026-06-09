import AsyncStorage from '@react-native-async-storage/async-storage';
import { Transaction, BusinessSettings, FinancialGoal } from '../types';

const KEYS = {
    transactions: '@financebook/transactions',
    settings:     '@financebook/settings',
    goals:        '@financebook/goals',
    pin:          '@financebook/pin',
    profile:      '@financebook/profile',
};

// ─── Transactions ─────────────────────────────────────────────────────────────
export async function saveTransactions(t: Transaction[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.transactions, JSON.stringify(t));
}
export async function loadTransactions(): Promise<Transaction[] | null> {
    const raw = await AsyncStorage.getItem(KEYS.transactions);
    return raw ? (JSON.parse(raw) as Transaction[]) : null;
}

// ─── Settings ─────────────────────────────────────────────────────────────────
export async function saveSettings(s: BusinessSettings): Promise<void> {
    await AsyncStorage.setItem(KEYS.settings, JSON.stringify(s));
}
export async function loadSettings(): Promise<BusinessSettings | null> {
    const raw = await AsyncStorage.getItem(KEYS.settings);
    return raw ? (JSON.parse(raw) as BusinessSettings) : null;
}

// ─── Goals ────────────────────────────────────────────────────────────────────
export async function saveGoals(g: FinancialGoal[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.goals, JSON.stringify(g));
}
export async function loadGoals(): Promise<FinancialGoal[] | null> {
    const raw = await AsyncStorage.getItem(KEYS.goals);
    return raw ? (JSON.parse(raw) as FinancialGoal[]) : null;
}

// ─── PIN ──────────────────────────────────────────────────────────────────────
export async function savePin(pin: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.pin, pin);
}
export async function loadPin(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.pin);
}

// ─── Profile (email + business name) ─────────────────────────────────────────
export interface StoredProfile { email: string; businessName: string }
export async function saveProfile(p: StoredProfile): Promise<void> {
    await AsyncStorage.setItem(KEYS.profile, JSON.stringify(p));
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
    await AsyncStorage.multiRemove([
        KEYS.transactions,
        KEYS.settings,
        KEYS.goals,
    ]);
}
