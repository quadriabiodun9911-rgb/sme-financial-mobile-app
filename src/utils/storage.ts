import AsyncStorage from '@react-native-async-storage/async-storage';
import { Transaction, BusinessSettings, FinancialGoal } from '../types';

const KEYS = {
    transactions: '@financebook/transactions',
    settings: '@financebook/settings',
    goals: '@financebook/goals',
};

export async function saveTransactions(transactions: Transaction[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.transactions, JSON.stringify(transactions));
}

export async function loadTransactions(): Promise<Transaction[] | null> {
    const raw = await AsyncStorage.getItem(KEYS.transactions);
    return raw ? (JSON.parse(raw) as Transaction[]) : null;
}

export async function saveSettings(settings: BusinessSettings): Promise<void> {
    await AsyncStorage.setItem(KEYS.settings, JSON.stringify(settings));
}

export async function loadSettings(): Promise<BusinessSettings | null> {
    const raw = await AsyncStorage.getItem(KEYS.settings);
    return raw ? (JSON.parse(raw) as BusinessSettings) : null;
}

export async function saveGoals(goals: FinancialGoal[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.goals, JSON.stringify(goals));
}

export async function loadGoals(): Promise<FinancialGoal[] | null> {
    const raw = await AsyncStorage.getItem(KEYS.goals);
    return raw ? (JSON.parse(raw) as FinancialGoal[]) : null;
}
