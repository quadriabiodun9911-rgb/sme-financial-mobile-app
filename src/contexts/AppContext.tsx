import React, { createContext, useContext, useState, useMemo, useEffect, ReactNode } from 'react';
import { Transaction, FinanceData, User, BusinessSettings, Screen, FinancialGoal, GoalType, NavParams, Invoice, InvoiceStatus, TeamMember, UserRole } from '../types';
import { computeFinance, computeOneThingInsight, computeRecurringDates } from '../utils/finance';
import { generateId } from '../utils/uuid';
import {
    saveTransactions, loadTransactions,
    saveSettings, loadSettings,
    saveGoals, loadGoals,
    saveInvoices, loadInvoices,
    savePin, loadPin,
    saveProfile, loadProfile,
    exportAllData, importAllData, clearAllData,
    loadTeamMembers, inviteTeamMember, removeTeamMember, joinTeamWithCode,
    setWorkspaceOwner, clearWorkspaceOwner,
    AppBackup,
} from '../utils/storage';
import { refreshGoal, goalDefaults } from '../utils/goals';
import { supabase } from '../utils/supabase';

interface AppContextValue {
    currentScreen: Screen;
    setCurrentScreen: (s: Screen) => void;
    navParams: NavParams | null;
    navigate: (s: Screen, params?: NavParams) => void;

    // Auth
    user: User | null;
    userRole: UserRole;
    isFirstLaunch: boolean;
    setupAccount: (email: string, businessName: string, pin: string, loadDemo: boolean) => Promise<void>;
    login: (pin: string) => boolean;
    joinTeam: (email: string, pin: string, inviteCode: string) => Promise<void>;
    logout: () => void;
    changePin: (currentPin: string, newPin: string) => boolean;

    settings: BusinessSettings;
    updateSettings: (patch: Partial<BusinessSettings>) => void;

    transactions: Transaction[];
    addTransaction: (tx: Omit<Transaction, 'id' | 'date'> & { date?: string }) => void;
    deleteTransaction: (id: string) => void;
    updateTransaction: (id: string, patch: Partial<Transaction>) => void;

    goals: FinancialGoal[];
    addGoal: (type: GoalType, overrides: Partial<FinancialGoal>) => void;
    deleteGoal: (id: string) => void;
    updateGoalCurrentValue: (id: string, value: number) => void;

    invoices: Invoice[];
    addInvoice: (inv: Omit<Invoice, 'id' | 'createdAt'>) => void;
    updateInvoice: (id: string, patch: Partial<Invoice>) => void;
    deleteInvoice: (id: string) => void;
    markInvoiceStatus: (id: string, status: InvoiceStatus) => void;

    // Team
    teamMembers: TeamMember[];
    inviteMember: (email: string, role: 'accountant' | 'staff') => Promise<string>;
    removeMember: (id: string) => Promise<void>;
    refreshTeam: () => Promise<void>;

    finance: FinanceData;
    insight: ReturnType<typeof computeOneThingInsight>;
    isLoading: boolean;

    exportData: () => Promise<string>;
    importData: (json: string) => Promise<void>;
    clearData: () => Promise<void>;
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

const DEMO_TRANSACTIONS: Transaction[] = [
    {
        id: 'demo-1',
        date: new Date().toISOString().split('T')[0],
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
    {
        id: 'demo-2',
        date: new Date().toISOString().split('T')[0],
        description: 'Office Rent – June',
        type: 'expense',
        category: 'Office & Admin',
        amount: 3200,
        status: 'paid',
    },
    {
        id: 'demo-3',
        date: new Date().toISOString().split('T')[0],
        description: 'Consulting Retainer',
        type: 'income',
        category: 'Consulting',
        amount: 12000,
        status: 'pending',
        dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
        vendorCustomer: 'BuildCo Ltd.',
        reference: 'INV-002',
    },
    {
        id: 'demo-4',
        date: new Date().toISOString().split('T')[0],
        description: 'Cloud Infrastructure',
        type: 'expense',
        category: 'Equipment',
        amount: 1800,
        status: 'paid',
        isRecurring: true,
        recurringFrequency: 'monthly',
    },
];

function processDueRecurring(transactions: Transaction[]): { updated: Transaction[]; newEntries: Transaction[] } {
    const today = new Date().toISOString().split('T')[0];
    const updated: Transaction[] = [];
    const newEntries: Transaction[] = [];
    for (const tx of transactions) {
        if (!tx.isRecurring || !tx.nextRecurringDate || tx.nextRecurringDate > today) {
            updated.push(tx); continue;
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
    const [navParams, setNavParams]         = useState<NavParams | null>(null);
    const [user, setUser]                   = useState<User | null>(null);
    const [userRole, setUserRole]           = useState<UserRole>('owner');
    const [storedPin, setStoredPin]         = useState<string | null>(null);
    const [settings, setSettings]           = useState<BusinessSettings>(DEFAULT_SETTINGS);
    const [transactions, setTransactions]   = useState<Transaction[]>([]);
    const [goals, setGoals]                 = useState<FinancialGoal[]>([]);
    const [invoices, setInvoices]           = useState<Invoice[]>([]);
    const [teamMembers, setTeamMembers]     = useState<TeamMember[]>([]);
    const [isLoading, setIsLoading]         = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const [savedTx, savedSettings, savedGoals, savedInvoices, pin, profile] = await Promise.all([
                    loadTransactions(),
                    loadSettings(),
                    loadGoals(),
                    loadInvoices(),
                    loadPin(),
                    loadProfile(),
                ]);
                if (pin) setStoredPin(pin);
                if (savedTx) {
                    const { updated, newEntries } = processDueRecurring(savedTx);
                    setTransactions([...newEntries, ...updated]);
                }
                if (savedSettings) setSettings({ ...DEFAULT_SETTINGS, ...savedSettings });
                if (savedGoals)    setGoals(savedGoals);
                if (savedInvoices) setInvoices(savedInvoices);
                if (pin && profile) {
                    setUser({ email: profile.email, businessName: profile.businessName, role: 'Administrator' });
                }
            } finally {
                setIsLoading(false);
            }
        })();
    }, []);

    useEffect(() => { if (!isLoading) saveTransactions(transactions).catch(() => {}); }, [transactions, isLoading]);
    useEffect(() => { if (!isLoading) saveSettings(settings).catch(() => {}); }, [settings, isLoading]);
    useEffect(() => { if (!isLoading) saveGoals(goals).catch(() => {}); }, [goals, isLoading]);
    useEffect(() => { if (!isLoading) saveInvoices(invoices).catch(() => {}); }, [invoices, isLoading]);

    const finance = useMemo(() => computeFinance(transactions, settings), [transactions, settings]);
    const insight = useMemo(() => computeOneThingInsight(finance, settings), [finance, settings]);

    useEffect(() => {
        if (isLoading || goals.length === 0) return;
        setGoals(prev => prev.map(g => refreshGoal(g, finance, transactions)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [finance, isLoading]);

    const navigate = (s: Screen, params?: NavParams) => {
        setNavParams(params ?? null);
        setCurrentScreen(s);
    };

    const setupAccount = async (email: string, businessName: string, pin: string, loadDemo: boolean) => {
        const { error } = await supabase.auth.signUp({ email, password: pin });
        if (error && error.message !== 'User already registered') throw new Error(error.message);
        if (error?.message === 'User already registered') {
            const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: pin });
            if (signInError) throw new Error('Account exists but PIN is incorrect.');
        }
        await clearWorkspaceOwner(); // owner always uses own workspace
        await savePin(pin);
        await saveProfile({ email, businessName });
        setStoredPin(pin);
        setUserRole('owner');
        setUser({ email, businessName, role: 'Administrator' });
        if (loadDemo) setTransactions(DEMO_TRANSACTIONS);
        setCurrentScreen('dashboard');
    };

    // Team member join — creates Supabase account then links to owner workspace
    const joinTeam = async (email: string, pin: string, inviteCode: string) => {
        const { data, error } = await supabase.auth.signUp({ email, password: pin });
        if (error && error.message !== 'User already registered') throw new Error(error.message);
        let userId = data?.user?.id;
        if (error?.message === 'User already registered') {
            const { data: sd, error: se } = await supabase.auth.signInWithPassword({ email, password: pin });
            if (se || !sd.user) throw new Error('Sign-in failed. Check your email and PIN.');
            userId = sd.user.id;
        }
        if (!userId) throw new Error('Could not get user ID after sign-up.');
        const { ownerId, role } = await joinTeamWithCode(userId, inviteCode);
        await setWorkspaceOwner(ownerId);
        await savePin(pin);
        await saveProfile({ email, businessName: '' });
        setStoredPin(pin);
        setUserRole(role);
        setUser({ email, businessName: '', role: role === 'accountant' ? 'Accountant' : 'Staff' });
        // Load owner's data
        const [savedTx, savedSettings, savedGoals, savedInvoices] = await Promise.all([
            loadTransactions(), loadSettings(), loadGoals(), loadInvoices(),
        ]);
        if (savedTx) { const { updated, newEntries } = processDueRecurring(savedTx); setTransactions([...newEntries, ...updated]); }
        if (savedSettings) setSettings({ ...DEFAULT_SETTINGS, ...savedSettings });
        if (savedGoals)    setGoals(savedGoals);
        if (savedInvoices) setInvoices(savedInvoices);
        setCurrentScreen('dashboard');
    };

    const login = (pin: string): boolean => {
        if (pin !== storedPin) return false;
        loadProfile().then(profile => {
            if (profile) {
                supabase.auth.signInWithPassword({ email: profile.email, password: pin }).catch(() => {});
            }
        });
        setCurrentScreen('dashboard');
        return true;
    };

    const logout = () => {
        supabase.auth.signOut().catch(() => {});
        setCurrentScreen('login');
    };

    const changePin = (currentPin: string, newPin: string): boolean => {
        if (currentPin !== storedPin) return false;
        setStoredPin(newPin);
        savePin(newPin).catch(() => {});
        supabase.auth.updateUser({ password: newPin }).catch(() => {});
        return true;
    };

    const updateSettings = (patch: Partial<BusinessSettings>) => setSettings(prev => ({ ...prev, ...patch }));

    const addTransaction = (tx: Omit<Transaction, 'id' | 'date'> & { date?: string }) => {
        const today = new Date().toISOString().split('T')[0];
        const date = tx.date || today;
        const taxAmount = tx.taxRate ? Math.round(tx.amount * (tx.taxRate / 100) * 100) / 100 : 0;
        const item: Transaction = {
            ...tx, id: generateId(), date, taxAmount,
            nextRecurringDate: tx.isRecurring && tx.recurringFrequency
                ? computeRecurringDates(date, tx.recurringFrequency) : undefined,
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
            id: generateId(), type, title: '', description: '',
            targetValue: 0, baselineValue: 0, currentValue: 0,
            deadline: now, createdAt: now, status: 'on_track', progress: 0, unit: '$',
            ...defaults, ...overrides,
        };
        setGoals(prev => [refreshGoal(goal, finance, transactions), ...prev]);
    };

    const deleteGoal = (id: string) => setGoals(prev => prev.filter(g => g.id !== id));

    const updateGoalCurrentValue = (id: string, value: number) => {
        setGoals(prev => prev.map(g => {
            if (g.id !== id) return g;
            const updated = { ...g, currentValue: value };
            return refreshGoal({ ...updated, progress: refreshGoal(updated, finance, transactions).progress }, finance, transactions);
        }));
    };

    const addInvoice = (inv: Omit<Invoice, 'id' | 'createdAt'>) => {
        const now = new Date().toISOString().split('T')[0];
        const item: Invoice = { ...inv, id: generateId(), createdAt: now };
        setInvoices(prev => [item, ...prev]);
        addTransaction({
            description: `Invoice ${inv.invoiceNumber} – ${inv.clientName}`,
            type: 'income', category: 'Invoice', amount: inv.total,
            status: 'pending', dueDate: inv.dueDate,
            vendorCustomer: inv.clientName, reference: inv.invoiceNumber,
        });
    };

    const updateInvoice = (id: string, patch: Partial<Invoice>) =>
        setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, ...patch } : inv));

    const deleteInvoice = (id: string) => setInvoices(prev => prev.filter(inv => inv.id !== id));

    const markInvoiceStatus = (id: string, status: InvoiceStatus) => {
        setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, status } : inv));
        if (status === 'paid') {
            const inv = invoices.find(i => i.id === id);
            if (inv) {
                const match = transactions.find(t => t.reference === inv.invoiceNumber && t.type === 'income');
                if (match) updateTransaction(match.id, { status: 'paid' });
            }
        }
    };

    const inviteMember = async (email: string, role: 'accountant' | 'staff'): Promise<string> => {
        const code = await inviteTeamMember(email, role);
        await refreshTeam();
        return code;
    };

    const removeMember = async (id: string) => {
        await removeTeamMember(id);
        setTeamMembers(prev => prev.filter(m => m.id !== id));
    };

    const refreshTeam = async () => {
        const members = await loadTeamMembers();
        setTeamMembers(members);
    };

    const exportData = () => exportAllData(transactions, settings, goals);

    const importData = async (json: string) => {
        const backup: AppBackup = await importAllData(json);
        setTransactions(backup.transactions);
        setSettings({ ...DEFAULT_SETTINGS, ...backup.settings });
        setGoals(backup.goals ?? []);
    };

    const clearData = async () => {
        await clearAllData();
        setTransactions([]); setGoals([]); setSettings(DEFAULT_SETTINGS); setInvoices([]);
    };

    const value: AppContextValue = {
        currentScreen, setCurrentScreen,
        navParams, navigate,
        user, userRole,
        isFirstLaunch: storedPin === null && !isLoading,
        setupAccount, login, joinTeam, logout, changePin,
        settings, updateSettings,
        transactions, addTransaction, deleteTransaction, updateTransaction,
        goals, addGoal, deleteGoal, updateGoalCurrentValue,
        invoices, addInvoice, updateInvoice, deleteInvoice, markInvoiceStatus,
        teamMembers, inviteMember, removeMember, refreshTeam,
        finance, insight, isLoading,
        exportData, importData, clearData,
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error('useApp must be used within AppProvider');
    return ctx;
}
