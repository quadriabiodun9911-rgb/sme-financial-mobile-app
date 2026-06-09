import React, { createContext, useContext, useState, useMemo, useEffect, ReactNode } from 'react';
import { Transaction, FinanceData, User, BusinessSettings, Screen } from '../types';
import { computeFinance, computeOneThingInsight, computeRecurringDates } from '../utils/finance';
import { generateId } from '../utils/uuid';
import { saveTransactions, loadTransactions, saveSettings, loadSettings } from '../utils/storage';

interface AppContextValue {
    // Navigation
    currentScreen: Screen;
    setCurrentScreen: (s: Screen) => void;

    // Auth
    user: User | null;
    login: (email: string, password: string, business: string) => boolean;
    logout: () => void;

    // Settings
    settings: BusinessSettings;
    updateSettings: (patch: Partial<BusinessSettings>) => void;

    // Transactions
    transactions: Transaction[];
    addTransaction: (tx: Omit<Transaction, 'id' | 'date'>) => void;
    deleteTransaction: (id: string) => void;
    updateTransaction: (id: string, patch: Partial<Transaction>) => void;

    // Derived
    finance: FinanceData;
    insight: ReturnType<typeof computeOneThingInsight>;

    // Loading state
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

        // Generate the new recurring entry
        const newTx: Transaction = {
            ...tx,
            id: generateId(),
            date: tx.nextRecurringDate,
            nextRecurringDate: computeRecurringDates(tx.nextRecurringDate, tx.recurringFrequency!),
        };
        newEntries.push(newTx);

        // Update the original template's nextRecurringDate
        updated.push({ ...tx, nextRecurringDate: newTx.nextRecurringDate });
    }

    return { updated, newEntries };
}

export function AppProvider({ children }: { children: ReactNode }) {
    const [currentScreen, setCurrentScreen] = useState<Screen>('login');
    const [user, setUser] = useState<User | null>(null);
    const [settings, setSettings] = useState<BusinessSettings>(DEFAULT_SETTINGS);
    const [transactions, setTransactions] = useState<Transaction[]>(SEED_TRANSACTIONS);
    const [isLoading, setIsLoading] = useState(true);

    // Load persisted data on mount
    useEffect(() => {
        (async () => {
            try {
                const [savedTx, savedSettings] = await Promise.all([
                    loadTransactions(),
                    loadSettings(),
                ]);
                if (savedTx) {
                    const { updated, newEntries } = processDueRecurring(savedTx);
                    setTransactions([...newEntries, ...updated]);
                }
                if (savedSettings) {
                    setSettings({ ...DEFAULT_SETTINGS, ...savedSettings });
                }
            } finally {
                setIsLoading(false);
            }
        })();
    }, []);

    // Persist transactions whenever they change (skip initial load)
    useEffect(() => {
        if (!isLoading) {
            saveTransactions(transactions).catch(() => {});
        }
    }, [transactions, isLoading]);

    // Persist settings whenever they change (skip initial load)
    useEffect(() => {
        if (!isLoading) {
            saveSettings(settings).catch(() => {});
        }
    }, [settings, isLoading]);

    const login = (email: string, password: string, business: string): boolean => {
        if (!email || !password) return false;
        setUser({ email, businessName: business, role: 'Administrator' });
        setCurrentScreen('dashboard');
        return true;
    };

    const logout = () => {
        setUser(null);
        setCurrentScreen('login');
    };

    const updateSettings = (patch: Partial<BusinessSettings>) => {
        setSettings(prev => ({ ...prev, ...patch }));
    };

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

    const deleteTransaction = (id: string) => {
        setTransactions(prev => prev.filter(t => t.id !== id));
    };

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

    const finance = useMemo(
        () => computeFinance(transactions, settings),
        [transactions, settings]
    );

    const insight = useMemo(
        () => computeOneThingInsight(finance, settings),
        [finance, settings]
    );

    const value: AppContextValue = {
        currentScreen,
        setCurrentScreen,
        user,
        login,
        logout,
        settings,
        updateSettings,
        transactions,
        addTransaction,
        deleteTransaction,
        updateTransaction,
        finance,
        insight,
        isLoading,
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error('useApp must be used within AppProvider');
    return ctx;
}
