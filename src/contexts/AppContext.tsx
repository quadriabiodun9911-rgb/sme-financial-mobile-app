import React, { createContext, useContext, useState, useMemo, useEffect, useRef, ReactNode } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Transaction, FinanceData, User, BusinessSettings, Screen, FinancialGoal, GoalType, NavParams, Invoice, InvoiceStatus, TeamMember, UserRole, Language, Asset, InventoryItem } from '../types';
import { computeFinance, computeOneThingInsight, computeRecurringDates, computeAssetCurrentValue } from '../utils/finance';
import { generateId } from '../utils/uuid';
import { auditEvents } from '../utils/auditLog';
import {
    saveTransactions, loadTransactions,
    saveSettings, loadSettings,
    saveGoals, loadGoals,
    saveInvoices, loadInvoices,
    saveAssets, loadAssets,
    saveInventory, loadInventory,
    savePin, loadPin,
    saveProfile, loadProfile,
    saveLanguage, loadLanguage,
    exportAllData, importAllData, clearAllData,
    loadTeamMembers, inviteTeamMember, removeTeamMember, joinTeamWithCode,
    setWorkspaceOwner, clearWorkspaceOwner,
    AppBackup,
} from '../utils/storage';
import { refreshGoal, goalDefaults } from '../utils/goals';
import { supabase } from '../utils/supabase';
import { t } from '../utils/i18n';
import { requestNotificationPermission, scheduleDailyReminder, scheduleWeeklySummaryReminder, sendWelcomeNotification, scheduleOverdueInvoiceReminder } from '../utils/notifications';

interface AppContextValue {
    currentScreen: Screen;
    setCurrentScreen: (s: Screen) => void;
    navParams: NavParams | null;
    navigate: (s: Screen, params?: NavParams) => void;

    // Auth
    user: User | null;
    userRole: UserRole;
    isFirstLaunch: boolean;
    isDemoMode: boolean;
    enterDemo: (businessId: string) => void;
    exitDemo: () => void;
    setupAccount: (email: string, businessName: string, pin: string, loadDemo: boolean) => Promise<void>;
    recoverAccount: (email: string, pin: string) => Promise<void>;
    login: (pin: string) => boolean;
    joinTeam: (email: string, pin: string, inviteCode: string) => Promise<void>;
    logout: () => void;
    changePin: (currentPin: string, newPin: string) => boolean;
    // Security: Lockout info
    isLockedOut: boolean;
    lockoutUntil: number | null;

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

    assets: Asset[];
    addAsset: (a: Omit<Asset, 'id' | 'createdAt'>) => void;
    updateAsset: (id: string, patch: Partial<Asset>) => void;
    deleteAsset: (id: string) => void;
    disposeAsset: (id: string, disposalDate: string, disposalValue: number) => void;

    inventory: InventoryItem[];
    addInventoryItem: (item: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>) => void;
    updateInventoryItem: (id: string, patch: Partial<InventoryItem>) => void;
    deleteInventoryItem: (id: string) => void;

    // Team
    teamMembers: TeamMember[];
    inviteMember: (email: string, role: 'accountant' | 'staff') => Promise<string>;
    removeMember: (id: string) => Promise<void>;
    refreshTeam: () => Promise<void>;

    // Language
    language: Language;
    setLanguage: (lang: Language) => void;

    finance: FinanceData;
    insight: ReturnType<typeof computeOneThingInsight>;
    isLoading: boolean;

    exportData: () => Promise<string>;
    importData: (json: string) => Promise<void>;
    clearData: () => Promise<void>;
    resetApp: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

const DEFAULT_SETTINGS: BusinessSettings = {
    businessType: 'both',
    currency: '$',
    minReserve: '5000',
    targetMargin: '65',
    openingAssets: '0',
    openingLiabilities: '0',
    openingLoans: '0',
    openingOtherAssets: '0',
    defaultTaxRate: '0',
};

export interface DemoBusiness {
    id: string;
    flag: string;
    businessName: string;
    description: string;
    currency: string;
    transactions: Transaction[];
}

export const DEMO_BUSINESSES: DemoBusiness[] = [
    {
        id: 'demo-ng', flag: '🇳🇬', businessName: 'Lagos Import & Export Co.', currency: '₦',
        description: 'Import/export trading',
        transactions: [
            { id: 'ng-1', date: new Date().toISOString().split('T')[0], description: 'Shipment from China – Electronics', type: 'income', category: 'Sales', amount: 1850000, status: 'paid', vendorCustomer: 'TechZone Ltd' },
            { id: 'ng-2', date: new Date().toISOString().split('T')[0], description: 'Customs & Clearing Fees', type: 'expense', category: 'Logistics', amount: 320000, status: 'paid' },
            { id: 'ng-3', date: new Date().toISOString().split('T')[0], description: 'Warehouse Rent – Apapa', type: 'expense', category: 'Office & Admin', amount: 180000, status: 'paid', isRecurring: true, recurringFrequency: 'monthly' },
            { id: 'ng-4', date: new Date().toISOString().split('T')[0], description: 'Bulk Fabric Order – Aba Buyers', type: 'income', category: 'Sales', amount: 960000, status: 'pending', dueDate: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0] },
        ],
    },
    {
        id: 'demo-uk', flag: '🇬🇧', businessName: 'Bright & Co Consulting', currency: '£',
        description: 'Business consulting',
        transactions: [
            { id: 'uk-1', date: new Date().toISOString().split('T')[0], description: 'Strategy Retainer – NovaTech', type: 'income', category: 'Consulting', amount: 8500, status: 'paid', vendorCustomer: 'NovaTech PLC' },
            { id: 'uk-2', date: new Date().toISOString().split('T')[0], description: 'Office Space – WeWork', type: 'expense', category: 'Office & Admin', amount: 1200, status: 'paid', isRecurring: true, recurringFrequency: 'monthly' },
            { id: 'uk-3', date: new Date().toISOString().split('T')[0], description: 'Digital Transformation Project', type: 'income', category: 'Consulting', amount: 22000, status: 'paid', vendorCustomer: 'RetailGroup UK' },
            { id: 'uk-4', date: new Date().toISOString().split('T')[0], description: 'Staff Contractor Fees', type: 'expense', category: 'Salaries', amount: 4800, status: 'paid' },
        ],
    },
    {
        id: 'demo-za', flag: '🇿🇦', businessName: 'Cape Town Brew Co.', currency: 'R',
        description: 'Craft brewery & distribution',
        transactions: [
            { id: 'za-1', date: new Date().toISOString().split('T')[0], description: 'Craft Beer – Wholesale Order', type: 'income', category: 'Sales', amount: 78000, status: 'paid', vendorCustomer: 'Checkers SA' },
            { id: 'za-2', date: new Date().toISOString().split('T')[0], description: 'Hops & Malt Supplies', type: 'expense', category: 'Raw Materials', amount: 18500, status: 'paid' },
            { id: 'za-3', date: new Date().toISOString().split('T')[0], description: 'Tap Room Weekend Sales', type: 'income', category: 'Sales', amount: 34000, status: 'paid' },
            { id: 'za-4', date: new Date().toISOString().split('T')[0], description: 'Equipment Maintenance', type: 'expense', category: 'Equipment', amount: 9200, status: 'paid' },
        ],
    },
    {
        id: 'demo-us', flag: '🇺🇸', businessName: 'Hudson Valley Creative Studio', currency: '$',
        description: 'Creative agency',
        transactions: [
            { id: 'us-1', date: new Date().toISOString().split('T')[0], description: 'Brand Identity Package – StartupX', type: 'income', category: 'Design', amount: 14500, status: 'paid', vendorCustomer: 'StartupX Inc.' },
            { id: 'us-2', date: new Date().toISOString().split('T')[0], description: 'Adobe CC & Figma Subscriptions', type: 'expense', category: 'Software', amount: 320, status: 'paid', isRecurring: true, recurringFrequency: 'monthly' },
            { id: 'us-3', date: new Date().toISOString().split('T')[0], description: 'Social Media Campaign – Q2', type: 'income', category: 'Marketing', amount: 8200, status: 'pending', dueDate: new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0] },
            { id: 'us-4', date: new Date().toISOString().split('T')[0], description: 'Freelancer Payments', type: 'expense', category: 'Salaries', amount: 5600, status: 'paid' },
        ],
    },
    {
        id: 'demo-de', flag: '🇩🇪', businessName: 'Berlin Parts GmbH', currency: '€',
        description: 'Auto parts wholesale',
        transactions: [
            { id: 'de-1', date: new Date().toISOString().split('T')[0], description: 'Engine Parts Export – Poland', type: 'income', category: 'Sales', amount: 42000, status: 'paid', vendorCustomer: 'WarszawAuto Sp.' },
            { id: 'de-2', date: new Date().toISOString().split('T')[0], description: 'Factory Electricity Bill', type: 'expense', category: 'Utilities', amount: 3800, status: 'paid', isRecurring: true, recurringFrequency: 'monthly' },
            { id: 'de-3', date: new Date().toISOString().split('T')[0], description: 'Brake Systems – Fleet Order', type: 'income', category: 'Sales', amount: 29500, status: 'paid' },
            { id: 'de-4', date: new Date().toISOString().split('T')[0], description: 'Raw Steel Procurement', type: 'expense', category: 'Raw Materials', amount: 14700, status: 'paid' },
        ],
    },
    {
        id: 'demo-ae', flag: '🇦🇪', businessName: 'Dubai Luxe Real Estate LLC', currency: 'AED',
        description: 'Property brokerage',
        transactions: [
            { id: 'ae-1', date: new Date().toISOString().split('T')[0], description: 'Commission – Marina Apartment Sale', type: 'income', category: 'Commission', amount: 185000, status: 'paid', vendorCustomer: 'Al-Faris Family' },
            { id: 'ae-2', date: new Date().toISOString().split('T')[0], description: 'Office Lease – JLT Tower', type: 'expense', category: 'Office & Admin', amount: 42000, status: 'paid' },
            { id: 'ae-3', date: new Date().toISOString().split('T')[0], description: 'Commission – Business Bay Villa', type: 'income', category: 'Commission', amount: 310000, status: 'pending', dueDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0] },
            { id: 'ae-4', date: new Date().toISOString().split('T')[0], description: 'Marketing & Listings', type: 'expense', category: 'Marketing', amount: 28000, status: 'paid' },
        ],
    },
    {
        id: 'demo-cn', flag: '🇨🇳', businessName: 'Shenzhen Goods Supplier', currency: '¥',
        description: 'Electronics manufacturing',
        transactions: [
            { id: 'cn-1', date: new Date().toISOString().split('T')[0], description: 'Smartwatch Export – Africa Batch', type: 'income', category: 'Sales', amount: 680000, status: 'paid', vendorCustomer: 'QuadTrade NG' },
            { id: 'cn-2', date: new Date().toISOString().split('T')[0], description: 'Component Procurement – PCBs', type: 'expense', category: 'Raw Materials', amount: 220000, status: 'paid' },
            { id: 'cn-3', date: new Date().toISOString().split('T')[0], description: 'Phone Cases Bulk – Europe Order', type: 'income', category: 'Sales', amount: 415000, status: 'paid', vendorCustomer: 'EuroMobile GmbH' },
            { id: 'cn-4', date: new Date().toISOString().split('T')[0], description: 'Factory Staff – Monthly Payroll', type: 'expense', category: 'Salaries', amount: 180000, status: 'paid', isRecurring: true, recurringFrequency: 'monthly' },
        ],
    },
];

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
    const seenIds = new Set(transactions.map(t => t.id));
    for (const tx of transactions) {
        if (!tx.isRecurring || !tx.nextRecurringDate || tx.nextRecurringDate > today) {
            updated.push(tx); continue;
        }
        const newId = generateId();
        // Guard against duplicate IDs (extremely rare but possible)
        if (seenIds.has(newId)) { updated.push(tx); continue; }
        seenIds.add(newId);
        const newTx: Transaction = {
            ...tx,
            id: newId,
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
    const [hasProfile, setHasProfile]       = useState(false);
    const [isDemoMode, setIsDemoMode]       = useState(false);
    const [settings, setSettings]           = useState<BusinessSettings>(DEFAULT_SETTINGS);
    const [transactions, setTransactions]   = useState<Transaction[]>([]);
    const [goals, setGoals]                 = useState<FinancialGoal[]>([]);
    const [invoices, setInvoices]           = useState<Invoice[]>([]);
    const [assets, setAssets]               = useState<Asset[]>([]);
    const [inventory, setInventory]         = useState<InventoryItem[]>([]);
    const [teamMembers, setTeamMembers]     = useState<TeamMember[]>([]);
    const [language, setLang]              = useState<Language>('en');
    const [isLoading, setIsLoading]         = useState(true);
    // Security: Rate limiting for login attempts
    const [loginAttempts, setLoginAttempts]       = useState(0);
    const [isLockedOut, setIsLockedOut]           = useState(false);
    const [lockoutUntil, setLockoutUntil]         = useState<number | null>(null);
    const initRan                           = useRef(false);

    useEffect(() => {
        // Keep Supabase free-tier project alive on every app launch
        void supabase.from('profiles').select('id').limit(1);
    }, []);

    useEffect(() => {
        // Guard against React Strict Mode double-invocation
        if (initRan.current) return;
        initRan.current = true;
        (async () => {
            try {
                const [savedTx, savedSettings, savedGoals, savedInvoices, savedAssets, savedInventory, pin, profile, lang] = await Promise.all([
                    loadTransactions(),
                    loadSettings(),
                    loadGoals(),
                    loadInvoices(),
                    loadAssets(),
                    loadInventory(),
                    loadPin(),
                    loadProfile(),
                    loadLanguage(),
                ]);
                setLang(lang);
                if (pin) setStoredPin(pin);
                if (profile) setHasProfile(true);
                if (savedTx) {
                    const { updated, newEntries } = processDueRecurring(savedTx);
                    setTransactions([...newEntries, ...updated]);
                }
                if (savedSettings) setSettings({ ...DEFAULT_SETTINGS, ...savedSettings });
                if (savedGoals)    setGoals(savedGoals);
                if (savedInvoices) setInvoices(savedInvoices);
                if (savedAssets)   setAssets(savedAssets);
                if (savedInventory) setInventory(savedInventory);
                if (pin && profile) {
                    setUser({ email: profile.email, businessName: profile.businessName, role: 'Administrator' });
                }
            } finally {
                setIsLoading(false);
            }
        })();
    }, []);

    const persistError = (label: string) => (err: unknown) => {
        console.error(`[FinanceBook] Failed to persist ${label}:`, err);
        Alert.alert('Save Warning', `Could not save ${label}. Your changes may be lost if the app closes. Check your network connection.`);
    };

    useEffect(() => { if (!isLoading && !isDemoMode) saveTransactions(transactions).catch(persistError('transactions')); }, [transactions, isLoading, isDemoMode]);
    useEffect(() => { if (!isLoading && !isDemoMode) saveSettings(settings).catch(persistError('settings')); }, [settings, isLoading, isDemoMode]);
    useEffect(() => { if (!isLoading && !isDemoMode) saveGoals(goals).catch(persistError('goals')); }, [goals, isLoading, isDemoMode]);
    useEffect(() => { if (!isLoading && !isDemoMode) saveInvoices(invoices).catch(persistError('invoices')); }, [invoices, isLoading, isDemoMode]);
    useEffect(() => { if (!isLoading && !isDemoMode) saveAssets(assets).catch(persistError('assets')); }, [assets, isLoading, isDemoMode]);
    useEffect(() => { if (!isLoading && !isDemoMode) saveInventory(inventory).catch(persistError('inventory')); }, [inventory, isLoading, isDemoMode]);

    const registeredAssetsValue = useMemo(
        () => assets.filter(a => a.status === 'active').reduce((sum, a) => sum + computeAssetCurrentValue(a), 0),
        [assets],
    );
    const finance = useMemo(() => computeFinance(transactions, settings, registeredAssetsValue), [transactions, settings, registeredAssetsValue]);
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

    const setLanguage = (lang: Language) => {
        setLang(lang);
        saveLanguage(lang).catch(() => {});
    };

    // Role permission helpers
    const canWrite  = userRole === 'owner' || userRole === 'staff';
    const canManage = userRole === 'owner';

    const denyWrite  = () => Alert.alert(t(language, 'permissionDenied'), t(language, 'staffPermission'));
    const denyManage = () => Alert.alert(t(language, 'permissionDenied'), t(language, 'accountantPermission'));

    const enterDemo = (businessId: string) => {
        const biz = DEMO_BUSINESSES.find(b => b.id === businessId);
        if (!biz) return;
        setIsDemoMode(true);
        setHasProfile(true);
        setUser({ email: 'demo@quad360.app', businessName: biz.businessName, role: 'Demo' });
        setUserRole('owner');
        setSettings({ ...DEFAULT_SETTINGS, currency: biz.currency });
        setTransactions(biz.transactions);
        setCurrentScreen('dashboard');
    };

    const exitDemo = () => {
        setIsDemoMode(false);
        // Restore hasProfile to reflect whether a real account exists on this device.
        // storedPin being set means a real user registered here — keep them on login screen.
        setHasProfile(storedPin !== null);
        setUser(null);
        setTransactions([]);
        setGoals([]);
        setInvoices([]);
        setAssets([]);
        setInventory([]);
        setSettings(DEFAULT_SETTINGS);
        setCurrentScreen('login');
    };

    const setupAccount = async (email: string, businessName: string, pin: string, loadDemo: boolean) => {
        // Supabase auth is best-effort — never block registration if it fails
        try {
            const { error: signUpError } = await supabase.auth.signUp({ email, password: pin });
            if (!signUpError || signUpError.message === 'User already registered') {
                await supabase.auth.signInWithPassword({ email, password: pin }).catch(() => {});
            }
        } catch {
            // Network error or Supabase down — continue with local storage
        }

        await clearWorkspaceOwner();
        await savePin(pin);
        await saveProfile({ email, businessName });
        setStoredPin(pin);
        setHasProfile(true);
        setUserRole('owner');
        if (loadDemo) setTransactions(DEMO_BUSINESSES[0].transactions);
        setUser({ email, businessName, role: 'Administrator' });
        setCurrentScreen('dashboard');
        // Set up notifications after account creation
        requestNotificationPermission().then(granted => {
            if (granted) {
                sendWelcomeNotification(businessName);
                scheduleDailyReminder();
                scheduleWeeklySummaryReminder();
            }
        }).catch(() => {});
    };

    // Recover existing account on a new device — authenticates with Supabase and pulls all data
    const recoverAccount = async (email: string, pin: string) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password: pin });
        if (error || !data.user) throw new Error('Incorrect email or PIN. Please try again.');

        // Pull profile from Supabase
        const { data: profileRow } = await supabase
            .from('profiles')
            .select('business_name, email')
            .eq('id', data.user.id)
            .single();
        if (!profileRow) throw new Error('Account found but no business profile exists. Please set up your account.');

        const profile = { email: profileRow.email ?? email, businessName: profileRow.business_name ?? '' };

        // Save auth locally so future logins work with PIN only
        await clearWorkspaceOwner();
        await savePin(pin);
        await saveProfile(profile);
        setStoredPin(pin);
        setHasProfile(true);
        setUserRole('owner');
        setUser({ email: profile.email, businessName: profile.businessName, role: 'Administrator' });

        // Load all their cloud data
        const [savedTx, savedSettings, savedGoals, savedInvoices, savedAssets2, savedInventory2] = await Promise.all([
            loadTransactions(), loadSettings(), loadGoals(), loadInvoices(), loadAssets(), loadInventory(),
        ]);
        if (savedTx) { const { updated, newEntries } = processDueRecurring(savedTx); setTransactions([...newEntries, ...updated]); }
        if (savedSettings)   setSettings({ ...DEFAULT_SETTINGS, ...savedSettings });
        if (savedGoals)      setGoals(savedGoals);
        if (savedInvoices)   setInvoices(savedInvoices);
        if (savedAssets2)    setAssets(savedAssets2);
        if (savedInventory2) setInventory(savedInventory2);

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
        const [savedTx, savedSettings, savedGoals, savedInvoices, savedAssets2] = await Promise.all([
            loadTransactions(), loadSettings(), loadGoals(), loadInvoices(), loadAssets(),
        ]);
        if (savedTx) { const { updated, newEntries } = processDueRecurring(savedTx); setTransactions([...newEntries, ...updated]); }
        if (savedSettings) setSettings({ ...DEFAULT_SETTINGS, ...savedSettings });
        if (savedGoals)    setGoals(savedGoals);
        if (savedInvoices) setInvoices(savedInvoices);
        if (savedAssets2)  setAssets(savedAssets2);
        setCurrentScreen('dashboard');
    };

    const login = (pin: string): boolean => {
        // Rate limiting: check if locked out
        if (isLockedOut && lockoutUntil && Date.now() < lockoutUntil) {
            return false; // Still locked out
        }
        // Reset lockout if time has passed
        if (isLockedOut && lockoutUntil && Date.now() >= lockoutUntil) {
            setIsLockedOut(false);
            setLockoutUntil(null);
            setLoginAttempts(0);
        }

        // Validate PIN
        if (pin !== storedPin) {
            const newAttempts = loginAttempts + 1;
            setLoginAttempts(newAttempts);

            // Log failed login attempt
            auditEvents.loginFailed('Invalid PIN');

            // Lockout after 5 failed attempts for 15 minutes
            if (newAttempts >= 5) {
                const lockoutTime = Date.now() + (15 * 60 * 1000);
                setIsLockedOut(true);
                setLockoutUntil(lockoutTime);
                auditEvents.accountLocked();
            }
            return false;
        }

        // Successful login: reset attempts
        setLoginAttempts(0);
        setIsLockedOut(false);
        setLockoutUntil(null);

        // Log successful login
        auditEvents.login();

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

    const updateSettings = (patch: Partial<BusinessSettings>) => {
        if (!canManage) { denyManage(); return; }
        setSettings(prev => ({ ...prev, ...patch }));
    };

    const addTransaction = (tx: Omit<Transaction, 'id' | 'date'> & { date?: string }) => {
        if (!canWrite) { denyWrite(); return; }
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

    const deleteTransaction = (id: string) => {
        if (!canManage) { denyManage(); return; }
        setTransactions(prev => prev.filter(t => t.id !== id));
    };

    const updateTransaction = (id: string, patch: Partial<Transaction>) => {
        if (!canManage) { denyManage(); return; }
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
        if (!canManage) { denyManage(); return; }
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

    const deleteGoal = (id: string) => {
        if (!canManage) { denyManage(); return; }
        setGoals(prev => prev.filter(g => g.id !== id));
    };

    const updateGoalCurrentValue = (id: string, value: number) => {
        setGoals(prev => prev.map(g => {
            if (g.id !== id) return g;
            const updated = { ...g, currentValue: value };
            return refreshGoal({ ...updated, progress: refreshGoal(updated, finance, transactions).progress }, finance, transactions);
        }));
    };

    const addInvoice = (inv: Omit<Invoice, 'id' | 'createdAt'>) => {
        if (!canManage) { denyManage(); return; }
        const now = new Date().toISOString().split('T')[0];
        const item: Invoice = { ...inv, id: generateId(), createdAt: now };
        setInvoices(prev => [item, ...prev]);
        addTransaction({
            description: `Invoice ${inv.invoiceNumber} – ${inv.clientName}`,
            type: 'income', category: 'Invoice', amount: inv.total,
            status: 'pending', dueDate: inv.dueDate,
            vendorCustomer: inv.clientName, reference: inv.invoiceNumber,
        });
        // Schedule overdue alert if invoice has a due date
        if (inv.dueDate) {
            scheduleOverdueInvoiceReminder(inv.invoiceNumber, inv.clientName).catch(() => {});
        }
    };

    const updateInvoice = (id: string, patch: Partial<Invoice>) => {
        if (!canManage) { denyManage(); return; }
        setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, ...patch } : inv));
    };

    const deleteInvoice = (id: string) => {
        if (!canManage) { denyManage(); return; }
        setInvoices(prev => prev.filter(inv => inv.id !== id));
    };

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

    const addAsset = (a: Omit<Asset, 'id' | 'createdAt'>) => {
        if (!canManage) { denyManage(); return; }
        const item: Asset = { ...a, id: generateId(), createdAt: new Date().toISOString() };
        setAssets(prev => [item, ...prev]);
    };

    const updateAsset = (id: string, patch: Partial<Asset>) => {
        if (!canManage) { denyManage(); return; }
        setAssets(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a));
    };

    const deleteAsset = (id: string) => {
        if (!canManage) { denyManage(); return; }
        setAssets(prev => prev.filter(a => a.id !== id));
    };

    const disposeAsset = (id: string, disposalDate: string, disposalValue: number) => {
        if (!canManage) { denyManage(); return; }
        setAssets(prev => prev.map(a => a.id === id ? { ...a, status: 'disposed' as const, disposalDate, disposalValue } : a));
    };

    const addInventoryItem = (item: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>) => {
        const now = new Date().toISOString();
        const newItem: InventoryItem = { ...item, id: generateId(), createdAt: now, updatedAt: now };
        setInventory(prev => [newItem, ...prev]);
    };

    const updateInventoryItem = (id: string, patch: Partial<InventoryItem>) => {
        setInventory(prev => prev.map(i => i.id === id ? { ...i, ...patch, updatedAt: new Date().toISOString() } : i));
    };

    const deleteInventoryItem = (id: string) => {
        setInventory(prev => prev.filter(i => i.id !== id));
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
        setTransactions([]); setGoals([]); setSettings(DEFAULT_SETTINGS); setInvoices([]); setAssets([]);
    };

    const resetApp = async () => {
        try {
            // Clear all data storage
            await clearAllData().catch(() => {});

            // Clear all auth and app storage
            await AsyncStorage.multiRemove([
                '@financebook/pin',
                '@financebook/profile',
                '@financebook/language',
                '@financebook/workspaceOwner',
                '@financebook/encryption-key',
                '@financebook/inventory',
                '@financebook/transactions',
                '@financebook/goals',
                '@financebook/invoices',
                '@financebook/assets',
            ]).catch(() => {});

            // Sign out from Supabase
            await supabase.auth.signOut().catch(() => {});

            // Reset all state variables
            setStoredPin(null);
            setHasProfile(false);
            setUser(null);
            setUserRole('owner');
            setTransactions([]);
            setGoals([]);
            setSettings(DEFAULT_SETTINGS);
            setInvoices([]);
            setAssets([]);
            setInventory([]);
            setCurrentScreen('login');

            // Force a page reload to fully clear browser state
            if (typeof window !== 'undefined') {
                setTimeout(() => {
                    window.location.reload();
                }, 500);
            }
        } catch (error) {
            console.error('Error resetting app:', error);
        }
    };

    const value: AppContextValue = {
        currentScreen, setCurrentScreen,
        navParams, navigate,
        user, userRole,
        isFirstLaunch: !hasProfile && !isLoading,
        isDemoMode, enterDemo, exitDemo,
        setupAccount, recoverAccount, login, joinTeam, logout, changePin,
        isLockedOut, lockoutUntil,
        settings, updateSettings,
        transactions, addTransaction, deleteTransaction, updateTransaction,
        goals, addGoal, deleteGoal, updateGoalCurrentValue,
        invoices, addInvoice, updateInvoice, deleteInvoice, markInvoiceStatus,
        assets, addAsset, updateAsset, deleteAsset, disposeAsset,
        inventory, addInventoryItem, updateInventoryItem, deleteInventoryItem,
        teamMembers, inviteMember, removeMember, refreshTeam,
        language, setLanguage,
        finance, insight, isLoading,
        exportData, importData, clearData, resetApp,
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error('useApp must be used within AppProvider');
    return ctx;
}
