import React, { createContext, useContext, useState, useMemo, ReactNode } from 'react';
import { Transaction, FinanceData, User, BusinessSettings, Screen } from '../types';
import { computeFinance, computeOneThingInsight } from '../utils/finance';
import { generateId } from '../utils/uuid';

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

    // Derived
    finance: FinanceData;
    insight: ReturnType<typeof computeOneThingInsight>;
}

const AppContext = createContext<AppContextValue | null>(null);

const DEFAULT_SETTINGS: BusinessSettings = {
    businessType: 'both',
    currency: '$',
    minReserve: '5000',
    targetMargin: '65',
    openingAssets: '0',
    openingLiabilities: '0',
};

const SEED_TRANSACTIONS: Transaction[] = [
    {
        id: 'seed-1',
        date: '2026-05-10',
        description: 'Enterprise Software SLA License',
        type: 'income',
        category: 'Software sales',
        amount: 85000,
        transactionCategory: 'sale',
        vendorCustomer: 'TechCorp Inc.',
        reference: 'INV-001',
    },
];

export function AppProvider({ children }: { children: ReactNode }) {
    const [currentScreen, setCurrentScreen] = useState<Screen>('login');
    const [user, setUser] = useState<User | null>(null);
    const [settings, setSettings] = useState<BusinessSettings>(DEFAULT_SETTINGS);
    const [transactions, setTransactions] = useState<Transaction[]>(SEED_TRANSACTIONS);

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
        const item: Transaction = {
            ...tx,
            id: generateId(),
            date: new Date().toISOString().split('T')[0],
        };
        setTransactions(prev => [item, ...prev]);
    };

    const deleteTransaction = (id: string) => {
        setTransactions(prev => prev.filter(t => t.id !== id));
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
        finance,
        insight,
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error('useApp must be used within AppProvider');
    return ctx;
}
