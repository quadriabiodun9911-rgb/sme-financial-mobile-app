import React, { createContext, useContext, useState, useMemo, useEffect, ReactNode } from 'react';
import { Transaction, FinanceData, User, BusinessSettings, Screen, FinancialGoal, GoalType } from '../types';
import { computeFinance, computeOneThingInsight, computeRecurringDates } from '../utils/finance';
import { generateId } from '../utils/uuid';
import { saveTransactions, loadTransactions, saveSettings, loadSettings, saveGoals, loadGoals } from '../utils/storage';
import { refreshGoal, goalDefaults } from '../utils/goals';

interface AppContextValue {
    currentScreen: Screen;
    setCurrentScreen: (s: Screen) => void;

    user: User | null;
    login: (email: string, password: string, business: string) => boolean;
    logout: () => void;

    settings: BusinessSettings;
    updateSettings: (patch: Partial<BusinessSettings>) => void;

    transactions: Transaction[];
    addTransaction: (tx: Omit<Transaction, 'id' | 'date'>) => void;
    deleteTransaction: (id: string) => void;
    updateTransaction: (id: string, patch: Partial<Transaction>) => void;

    goals: FinancialGoal[];
    addGoal: (type: GoalType, overrides: Partial<FinancialGoal>) => void;
    deleteGoal: (id: string) => void;
    updateGoalCurrentValue: (id: string, value: number) => void;

    finance: FinanceData;
    insight: ReturnType<typeof computeOneThingInsight>;
    isLoading: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

const DEFAULT_SETTINGS: BusinessSettings = {
    businessType: 'both',
    currency: '$',
    minReserve: '5000',
    targetMargin: '65',
    openingAssets: '0',
    openingLiabilities: '0',
    defaultTaxRate: '0',
};

const SEED_TRANSACTIONS: Transaction[] = [
    {
        id: 'seed-1',
        date: '2026-05-10',
        description: 'Enterprise Software SLA License',
        type: 'income',
        category: 'Software sales',
        amount: 85000,
        taxRate: 10,
        taxAmount: 8500,
        transactionCategory: 'sale',
        vendorCustomer: 'TechCorp Inc.',
        reference: 'INV-001',
        status: 'paid',
    },
];

function processDueRecurring(transactions: Transaction[]): { updated: Transaction[]; newEntries: Transaction[] } {
    const today = new Date().toISOString().split('T')[0];
    const updated: Transaction[] = [];
    const newEntries: Transaction[] = [];

    for (const tx of transactions) {
        if (!tx.isRecurring || !tx.nextRecurringDate || tx.nextRecurringDate > today) {
            updated.push(tx);
            continue;
        }
        const newTx: Transaction = {
            ...tx,
            id: generateId(),
            date: tx.nextRecurringDate,
            nextRecurringDate: computeRecurringDates(tx.nextRecurringDate, tx.recurringFrequency!),
        };
        newEntries.push(newTx);
        updated.push({ ...tx, nextRecurringDate: newTx.nextRecurringDate });
    }

    return { updated, newEntries };
}

export function AppProvider({ children }: { children: ReactNode }) {
    const [currentScreen, setCurrentScreen] = useState<Screen>('login');
    const [user, setUser] = useState<User | null>(null);
    const [settings, setSettings] = useState<BusinessSettings>(DEFAULT_SETTINGS);
    const [transactions, setTransactions] = useState<Transaction[]>(SEED_TRANSACTIONS);
    const [goals, setGoals] = useState<FinancialGoal[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Load persisted data on mount
    useEffect(() => {
        (async () => {
            try {
                const [savedTx, savedSettings, savedGoals] = await Promise.all([
                    loadTransactions(),
                    loadSettings(),
                    loadGoals(),
                ]);
                if (savedTx) {
                    const { updated, newEntries } = processDueRecurring(savedTx);
                    setTransactions([...newEntries, ...updated]);
                }
                if (savedSettings) setSettings({ ...DEFAULT_SETTINGS, ...savedSettings });
                if (savedGoals) setGoals(savedGoals);
            } finally {
                setIsLoading(false);
            }
        })();
    }, []);

    useEffect(() => { if (!isLoading) saveTransactions(transactions).catch(() => {}); }, [transactions, isLoading]);
    useEffect(() => { if (!isLoading) saveSettings(settings).catch(() => {}); }, [settings, isLoading]);
    useEffect(() => { if (!isLoading) saveGoals(goals).catch(() => {}); }, [goals, isLoading]);

    const finance = useMemo(() => computeFinance(transactions, settings), [transactions, settings]);
    const insight = useMemo(() => computeOneThingInsight(finance, settings), [finance, settings]);

    // Refresh all goal progress whenever finance data changes
    useEffect(() => {
        if (isLoading || goals.length === 0) return;
        setGoals(prev => prev.map(g => refreshGoal(g, finance, transactions)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [finance, isLoading]);

    const login = (email: string, password: string, business: string): boolean => {
        if (!email || !password) return false;
        setUser({ email, businessName: business, role: 'Administrator' });
        setCurrentScreen('dashboard');
        return true;
    };

    const logout = () => { setUser(null); setCurrentScreen('login'); };

    const updateSettings = (patch: Partial<BusinessSettings>) => setSettings(prev => ({ ...prev, ...patch }));

    const addTransaction = (tx: Omit<Transaction, 'id' | 'date'>) => {
        const today = new Date().toISOString().split('T')[0];
        const taxAmount = tx.taxRate ? Math.round(tx.amount * (tx.taxRate / 100) * 100) / 100 : 0;
        const item: Transaction = {
            ...tx,
            id: generateId(),
            date: today,
            taxAmount,
            nextRecurringDate: tx.isRecurring && tx.recurringFrequency
                ? computeRecurringDates(today, tx.recurringFrequency)
                : undefined,
        };
        setTransactions(prev => [item, ...prev]);
    };

    const deleteTransaction = (id: string) => setTransactions(prev => prev.filter(t => t.id !== id));

    const updateTransaction = (id: string, patch: Partial<Transaction>) => {
        setTransactions(prev => prev.map(t => {
            if (t.id !== id) return t;
            const merged = { ...t, ...patch };
            if (patch.taxRate !== undefined) {
                merged.taxAmount = Math.round(merged.amount * ((patch.taxRate ?? 0) / 100) * 100) / 100;
            }
            return merged;
        }));
    };

    const addGoal = (type: GoalType, overrides: Partial<FinancialGoal>) => {
        const defaults = goalDefaults(type, finance, settings);
        const now = new Date().toISOString().split('T')[0];
        const goal: FinancialGoal = {
            id: generateId(),
            type,
            title: '',
            description: '',
            targetValue: 0,
            baselineValue: 0,
            currentValue: 0,
            deadline: now,
            createdAt: now,
            status: 'on_track',
            progress: 0,
            unit: '$',
            ...defaults,
            ...overrides,
        };
        const refreshed = refreshGoal(goal, finance, transactions);
        setGoals(prev => [refreshed, ...prev]);
    };

    const deleteGoal = (id: string) => setGoals(prev => prev.filter(g => g.id !== id));

    const updateGoalCurrentValue = (id: string, value: number) => {
        setGoals(prev => prev.map(g => {
            if (g.id !== id) return g;
            const updated = { ...g, currentValue: value };
            const progress = refreshGoal(updated, finance, transactions).progress;
            return refreshGoal({ ...updated, progress }, finance, transactions);
        }));
    };

    const value: AppContextValue = {
        currentScreen, setCurrentScreen,
        user, login, logout,
        settings, updateSettings,
        transactions, addTransaction, deleteTransaction, updateTransaction,
        goals, addGoal, deleteGoal, updateGoalCurrentValue,
        finance, insight, isLoading,
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error('useApp must be used within AppProvider');
    return ctx;
}
