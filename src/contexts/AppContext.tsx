import React, { createContext, useContext, useState, useMemo, useEffect, useRef, ReactNode } from 'react';
import { Alert, Platform } from 'react-native';
import CryptoJS from 'crypto-js';

const SALT = 'Q360_SME_2025';
function hashPin(pin: string): string {
    return CryptoJS.SHA256(pin + SALT).toString(CryptoJS.enc.Hex) + '_Q360';
}
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Transaction, FinanceData, User, BusinessSettings, Screen, FinancialGoal, GoalType, NavParams, Invoice, InvoiceStatus, TeamMember, UserRole, Language, Asset, InventoryItem, Loan, LoanPayment, Budget, CashPocket } from '../types';
import { computeFinance, computeOneThingInsight, computeRecurringDates, computeAssetCurrentValue, computeAssetAnnualDepreciation } from '../utils/finance';
import { generateId } from '../utils/uuid';
import { auditEvents } from '../utils/auditLog';
import {
    saveTransactions, loadTransactions,
    saveSettings, loadSettings,
    saveGoals, loadGoals,
    saveInvoices, loadInvoices,
    saveAssets, loadAssets,
    saveLoans, loadLoans,
    saveInventory, loadInventory,
    saveBudgets, loadBudgets,
    savePin, loadPin,
    saveProfile, loadProfile,
    saveLanguage, loadLanguage,
    exportAllData, importAllData, clearAllData, deleteAccountData,
    loadTeamMembers, inviteTeamMember, removeTeamMember, joinTeamWithCode,
    setWorkspaceOwner, clearWorkspaceOwner,
    AppBackup,
} from '../utils/storage';
import { refreshGoal, goalDefaults } from '../utils/goals';
import { requestNotificationPermission, sendWelcomeNotification, scheduleDailyReminder, scheduleWeeklySummaryReminder, scheduleOverdueInvoiceReminder } from '../utils/notifications';
import { supabase } from '../utils/supabase';
import NetInfo from '@react-native-community/netinfo';
import { flushQueue, queueSize } from '../utils/syncQueue';
import { t } from '../utils/i18n';
import { DEMO_BUSINESSES } from '../utils/demoData';
import {
    trackAppOpened, trackDemoStarted, trackDemoConvertTapped,
    trackUserRegistered, trackUserLoggedIn, trackUserLoggedOut,
    trackTransactionAdded, trackInvoiceCreated, trackAssetAdded,
    trackLoanAdded, trackInventoryItemAdded, trackGoalCreated,
    trackDataExported, identifyUser, resetIdentity,
} from '../utils/analytics';

interface AppContextValue {
    currentScreen: Screen;
    setCurrentScreen: (s: Screen) => void;
    navParams: NavParams | null;
    navigate: (s: Screen, params?: NavParams) => void;

    // Auth
    user: User | null;
    userRole: UserRole;
    isFirstLaunch: boolean;
    setupAccount: (email: string, businessName: string, pin: string, loadDemo: boolean, phone?: string) => Promise<void>;
    recoverAccount: (email: string, pin: string) => Promise<void>;
    login: (pin: string) => Promise<boolean>;
    joinTeam: (email: string, pin: string, inviteCode: string) => Promise<void>;
    logout: () => void;
    changePin: (currentPin: string, newPin: string) => Promise<{ ok: boolean; lockedUntil?: number; cloudSynced?: boolean }>;
    // Security: Lockout info
    isLockedOut: boolean;
    lockoutUntil: number | null;

    settings: BusinessSettings;
    updateSettings: (patch: Partial<BusinessSettings>) => void;
    updateProfile: (patch: Partial<Pick<User, 'phone' | 'businessName'>>) => void;

    transactions: Transaction[];
    addTransaction: (tx: Omit<Transaction, 'id' | 'date'> & { date?: string }) => void;
    deleteTransaction: (id: string) => void;
    updateTransaction: (id: string, patch: Partial<Transaction>) => void;

    goals: FinancialGoal[];
    addGoal: (type: GoalType, overrides: Partial<FinancialGoal>) => void;
    deleteGoal: (id: string) => void;
    updateGoal: (id: string, changes: Partial<Pick<FinancialGoal, 'title' | 'description' | 'targetValue' | 'deadline' | 'percentTarget'>>) => void;
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

    loans: Loan[];
    addLoan: (l: Omit<Loan, 'id' | 'createdAt' | 'payments'>) => void;
    updateLoan: (id: string, patch: Partial<Loan>) => void;
    deleteLoan: (id: string) => void;
    addLoanPayment: (loanId: string, payment: Omit<LoanPayment, 'id'>) => void;

    inventory: InventoryItem[];
    addInventoryItem: (item: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>) => void;
    updateInventoryItem: (id: string, patch: Partial<InventoryItem>) => void;
    deleteInventoryItem: (id: string) => void;

    budgets: Budget[];
    addBudget: (b: Omit<Budget, 'id'>) => void;
    updateBudget: (id: string, patch: Partial<Budget>) => void;
    deleteBudget: (id: string) => void;

    cashPockets: CashPocket[];
    addCashPocket: (name: string, amount: number) => void;
    updateCashPocket: (id: string, amount: number) => void;
    deleteCashPocket: (id: string) => void;

    // Team
    teamMembers: TeamMember[];
    inviteMember: (email: string, role: 'accountant' | 'staff') => Promise<string>;
    removeMember: (id: string) => Promise<void>;
    refreshTeam: () => Promise<void>;

    // Demo mode
    isDemoMode: boolean;
    enterDemo: (businessId: string) => void;
    exitDemo: () => void;

    // Language
    language: Language;
    setLanguage: (lang: Language) => void;

    finance: FinanceData;
    insight: ReturnType<typeof computeOneThingInsight>;
    isLoading: boolean;
    pendingSyncCount: number;   // items queued for cloud sync (0 = fully synced)

    exportData: () => Promise<string>;
    importData: (json: string) => Promise<void>;
    clearData: () => Promise<void>;
    resetBusinessData: () => Promise<void>;
    deleteAccount: () => Promise<void>;
    resetApp: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

const LOCKOUT_KEY  = 'quad360_lockoutUntil';
const ATTEMPTS_KEY = 'quad360_loginAttempts';

const DEFAULT_SETTINGS: BusinessSettings = {
    businessType: 'both',
    currency: '₦',
    currencyCode: 'NGN',
    minReserve: '5000',
    targetMargin: '0',
    openingAssets: '0',
    openingLiabilities: '0',
    openingLoans: '0',
    openingOtherAssets: '0',
    defaultTaxRate: '0',
    paystackPublicKey: '',
    korapayPublicKey: '',
};


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
    // PIN is never kept in state — only in SecureStore. Use loadPin() to compare.
    const [hasPin, _setHasPin]              = useState<boolean>(false);
    const storedPin                         = null; // removed from state — kept for legacy TS compat
    const setStoredPin = (pin: string | null) => { _setHasPin(pin !== null); };
    const [hasProfile, setHasProfile]       = useState(false);
    const [isDemoMode, setIsDemoMode]       = useState(false);
    const [settings, setSettings]           = useState<BusinessSettings>(DEFAULT_SETTINGS);
    const [transactions, setTransactions]   = useState<Transaction[]>([]);
    const [goals, setGoals]                 = useState<FinancialGoal[]>([]);
    const [invoices, setInvoices]           = useState<Invoice[]>([]);
    const [assets, setAssets]               = useState<Asset[]>([]);
    const [loans, setLoans]                 = useState<Loan[]>([]);
    const [inventory, setInventory]         = useState<InventoryItem[]>([]);
    const [budgets, setBudgets]             = useState<Budget[]>([]);
    const [cashPockets, setCashPockets]     = useState<CashPocket[]>([]);
    const [teamMembers, setTeamMembers]     = useState<TeamMember[]>([]);
    const [language, setLang]              = useState<Language>('en');
    const [isLoading, setIsLoading]         = useState(true);
    const [pendingSyncCount, setPendingSyncCount] = useState(0);
    // Security: Rate limiting for login attempts (persisted so restart doesn't reset)
    const [loginAttempts, setLoginAttempts]       = useState(0);
    const [isLockedOut, setIsLockedOut]           = useState(false);
    const [lockoutUntil, setLockoutUntil]         = useState<number | null>(null);
    const initRan                           = useRef(false);

    useEffect(() => {
        // Keep Supabase free-tier project alive on every app launch
        void supabase.from('profiles').select('id').limit(1);
        trackAppOpened();
    }, []);

    useEffect(() => {
        // Guard against React Strict Mode double-invocation
        if (initRan.current) return;
        initRan.current = true;
        (async () => {
            try {
                const timeout = new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('init_timeout')), 12000)
                );
                const [savedTx, savedSettings, savedGoals, savedInvoices, savedAssets, savedLoans, savedInventory, savedBudgets, pin, profile, lang] = await Promise.race([
                    Promise.all([
                        loadTransactions(),
                        loadSettings(),
                        loadGoals(),
                        loadInvoices(),
                        loadAssets(),
                        loadLoans(),
                        loadInventory(),
                        loadBudgets(),
                        loadPin(),
                        loadProfile(),
                        loadLanguage(),
                    ]),
                    timeout,
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
                if (savedLoans)    setLoans(savedLoans);
                if (savedInventory) setInventory(savedInventory);
                if (savedBudgets)  setBudgets(savedBudgets);
                const savedPockets = await AsyncStorage.getItem('@quad360/cash_pockets');
                if (savedPockets) setCashPockets(JSON.parse(savedPockets));

                // Check for existing Supabase session — auto-login on any device
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user) {
                    const email = session.user.email ?? '';
                    const { data: profileRow } = await supabase
                        .from('profiles').select('business_name, phone').eq('id', session.user.id).single();
                    const businessName = profileRow?.business_name ?? profile?.businessName ?? '';
                    const phone = (profileRow as any)?.phone ?? profile?.phone;
                    if (!profile) await saveProfile({ email, businessName, phone }).catch(() => {});
                    // Existing user resuming session — skip first-run wizard
                    await AsyncStorage.setItem('@quad360/first_run_done', '1').catch(() => {});
                    setHasProfile(true);
                    setUser({ email, businessName, role: 'Administrator', phone });
                    setCurrentScreen('dashboard');
                } else if (pin && profile) {
                    // Offline fallback: local PIN + profile exist — also an existing user
                    await AsyncStorage.setItem('@quad360/first_run_done', '1').catch(() => {});
                    setUser({ email: profile.email, businessName: profile.businessName, role: 'Administrator', phone: profile.phone });
                }
                // Restore lockout state across restarts
                const [savedLockout, savedAttempts] = await Promise.all([
                    AsyncStorage.getItem(LOCKOUT_KEY),
                    AsyncStorage.getItem(ATTEMPTS_KEY),
                ]);
                if (savedLockout) {
                    const until = parseInt(savedLockout, 10);
                    if (Date.now() < until) {
                        setIsLockedOut(true);
                        setLockoutUntil(until);
                    } else {
                        await AsyncStorage.multiRemove([LOCKOUT_KEY, ATTEMPTS_KEY]);
                    }
                }
                if (savedAttempts) setLoginAttempts(parseInt(savedAttempts, 10));
            } catch (err: unknown) {
                if (err instanceof Error && err.message === 'init_timeout') {
                    console.warn('[Quad360] Init timed out — loading app offline');
                }
            } finally {
                setIsLoading(false);
            }
        })();
    }, []);

    // Keep session in sync across tabs and handle token refresh
    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') {
                setUser(null);
                setCurrentScreen('login');
            } else if (event === 'TOKEN_REFRESHED' && session?.user && !user) {
                // Session silently refreshed — restore user state
                const email = session.user.email ?? '';
                loadProfile().then(p => {
                    setUser({ email, businessName: p?.businessName ?? '', role: 'Administrator', phone: p?.phone });
                    setCurrentScreen('dashboard');
                }).catch(() => {});
            }
        });
        return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const persistError = (label: string) => (err: unknown) => {
        console.error(`[Quad360] Failed to persist ${label}:`, err);
        Alert.alert('Save Warning', `Could not save ${label}. Your changes may be lost if the app closes. Check your network connection.`);
    };

    useEffect(() => { if (!isLoading) saveTransactions(transactions).catch(persistError('transactions')); }, [transactions, isLoading]);
    useEffect(() => { if (!isLoading) saveSettings(settings).catch(persistError('settings')); }, [settings, isLoading]);
    useEffect(() => { if (!isLoading) saveGoals(goals).catch(persistError('goals')); }, [goals, isLoading]);
    useEffect(() => { if (!isLoading) saveInvoices(invoices).catch(persistError('invoices')); }, [invoices, isLoading]);

    // Auto-mark sent invoices as overdue when past their due date
    useEffect(() => {
        if (isLoading) return;
        const today = new Date().toISOString().split('T')[0];
        setInvoices(prev => prev.map(inv => {
            if ((inv.status === 'sent' || inv.status === 'draft') && inv.dueDate && inv.dueDate < today) {
                return { ...inv, status: 'overdue' as const };
            }
            return inv;
        }));
    }, [isLoading]);
    useEffect(() => { if (!isLoading) saveAssets(assets).catch(persistError('assets')); }, [assets, isLoading]);
    useEffect(() => { if (!isLoading) saveLoans(loans).catch(persistError('loans')); }, [loans, isLoading]);
    useEffect(() => { if (!isLoading) saveInventory(inventory).catch(persistError('inventory')); }, [inventory, isLoading]);
    useEffect(() => { if (!isLoading) saveBudgets(budgets).catch(persistError('budgets')); }, [budgets, isLoading]);
    useEffect(() => { if (!isLoading) AsyncStorage.setItem('@quad360/cash_pockets', JSON.stringify(cashPockets)).catch(() => {}); }, [cashPockets, isLoading]);

    // ── Offline sync queue: flush on launch + when network is restored ──────
    useEffect(() => {
        let wasPreviouslyOffline = false;

        async function tryFlush(isOnline: boolean) {
            const pending = await queueSize();
            setPendingSyncCount(pending);
            if (isOnline && pending > 0) {
                try {
                    const { synced, failed } = await flushQueue(supabase);
                    const remaining = await queueSize();
                    setPendingSyncCount(remaining);
                    if (synced > 0) console.log(`[SyncQueue] Flushed ${synced} pending operation(s).`);
                    if (failed > 0) console.warn(`[SyncQueue] ${failed} operation(s) still pending.`);
                } catch (e) {
                    console.warn('[SyncQueue] Flush error:', e);
                }
            }
        }

        // Auto-flush on launch if online and items are pending
        const checkOnLaunch = async () => {
            const isOnline = Platform.OS === 'web'
                ? (typeof navigator !== 'undefined' && navigator.onLine)
                : (await NetInfo.fetch()).isConnected === true;
            await tryFlush(isOnline);
        };
        checkOnLaunch();

        const unsubscribe = NetInfo.addEventListener(async state => {
            const isOnline = Platform.OS === 'web'
                ? (typeof navigator !== 'undefined' && navigator.onLine)
                : (state.isConnected && state.isInternetReachable !== false);

            if (isOnline && wasPreviouslyOffline) await tryFlush(true);
            else { const p = await queueSize(); setPendingSyncCount(p); }
            wasPreviouslyOffline = !isOnline;
        });

        return () => unsubscribe();
    }, []);

    const activeAssets = useMemo(() => assets.filter(a => a.status === 'active'), [assets]);
    const registeredAssetsValue = useMemo(
        () => activeAssets.reduce((sum, a) => sum + computeAssetCurrentValue(a), 0),
        [activeAssets],
    );
    // Live loan balances from Loan Register
    const liveLoansBalance = useMemo(
        () => loans.filter(l => l.status === 'active').reduce((sum, l) => {
            const paid = l.payments.reduce((s: number, p: any) => s + (p.amount || 0), 0);
            return sum + Math.max(0, (l.principal || 0) - paid);
        }, 0),
        [loans],
    );
    // Inventory value: quantity × costPrice for all inventory items
    const inventoryValue = useMemo(
        () => inventory.reduce((sum, item) => sum + ((item.quantity || 0) * (item.costPrice || 0)), 0),
        [inventory],
    );
    const baseFinance = useMemo(() => computeFinance(transactions, settings, registeredAssetsValue, activeAssets), [transactions, settings, registeredAssetsValue, activeAssets]);
    // Patch liabilities with live loan balances and assets with inventory value
    const finance = useMemo(() => {
        const loansTotal = loans.length > 0 ? liveLoansBalance : (parseFloat(settings.openingLoans) || 0);
        const newLiabilities = baseFinance.liabilities + loansTotal;
        const newAssets = baseFinance.assets + inventoryValue;
        return { ...baseFinance, liabilities: newLiabilities, assets: newAssets, equity: newAssets - newLiabilities };
    }, [baseFinance, liveLoansBalance, inventoryValue, loans, settings.openingLoans]);
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

    const enterDemo = (businessId: string) => {
        const biz = DEMO_BUSINESSES.find(b => b.id === businessId);
        if (!biz) return;
        trackDemoStarted(biz.id, biz.businessName, biz.country);
        setIsDemoMode(true);
        setTransactions(biz.transactions);
        setAssets(biz.assets);
        setLoans(biz.loans);
        setInventory(biz.inventory);
        setInvoices(biz.invoices);
        setSettings(prev => ({ ...prev, currency: biz.currency }));
        setUser({ email: 'demo@quad360.app', businessName: biz.businessName, role: 'Administrator' });
        setCurrentScreen('dashboard');
    };

    const exitDemo = () => {
        setIsDemoMode(false);
        setHasProfile(hasPin);
        setTransactions([]);
        setAssets([]);
        setLoans([]);
        setInventory([]);
        setInvoices([]);
        setGoals([]);
        setUser(null);
        setSettings(DEFAULT_SETTINGS);
        setCurrentScreen('login');
    };

    // Role permission helpers
    const canWrite  = userRole === 'owner' || userRole === 'staff';
    const canManage = userRole === 'owner';

    const denyWrite  = () => Alert.alert(t(language, 'permissionDenied'), t(language, 'staffPermission'));
    const denyManage = () => Alert.alert(t(language, 'permissionDenied'), t(language, 'accountantPermission'));

    const setupAccount = async (email: string, businessName: string, pin: string, loadDemo: boolean, phone?: string) => {
        // Supabase auth is best-effort — never block registration if it fails
        try {
            const { error: signUpError } = await supabase.auth.signUp({ email, password: hashPin(pin) });
            if (signUpError) {
                const msg = signUpError.message.toLowerCase();
                if (
                    msg.includes('already registered') ||
                    msg.includes('already been registered') ||
                    msg.includes('user already exists') ||
                    msg.includes('email address is already')
                ) {
                    throw new Error('User already registered');
                }
                // Any other Supabase error — continue with local-only registration
            } else {
                await supabase.auth.signInWithPassword({ email, password: hashPin(pin) }).catch(() => {});
            }
        } catch (e: any) {
            const msg: string = e?.message ?? '';
            if (msg.includes('already registered')) {
                throw e; // Show duplicate email alert in LoginScreen
            }
            // Network error, Supabase down, or any other error — continue with local storage
        }

        await clearWorkspaceOwner();
        await savePin(pin);
        await saveProfile({ email, businessName, phone });
        setStoredPin(pin);
        setHasProfile(true);
        setUserRole('owner');

        identifyUser(email, { businessName });
        trackUserRegistered(settings.currency);
        setUser({ email, businessName, role: 'Administrator', phone });
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
        const { data, error } = await supabase.auth.signInWithPassword({ email, password: hashPin(pin) });
        if (error || !data.user) throw new Error('Incorrect email or PIN. Please try again.');

        // Pull profile from Supabase (best-effort — fall back to email if row missing)
        const { data: profileRow } = await supabase
            .from('profiles')
            .select('business_name, email, phone')
            .eq('id', data.user.id)
            .single();

        const profile = profileRow
            ? { email: profileRow.email ?? email, businessName: profileRow.business_name ?? '', phone: (profileRow as any).phone as string | undefined }
            : { email, businessName: '', phone: undefined };

        // Save auth locally so future logins work with PIN only
        await clearWorkspaceOwner();
        await savePin(pin);
        await saveProfile(profile);
        setStoredPin(pin);
        setHasProfile(true);
        setUserRole('owner');
        setUser({ email: profile.email, businessName: profile.businessName, role: 'Administrator', phone: profile.phone });

        // Load all their cloud data
        const [savedTx, savedSettings, savedGoals, savedInvoices, savedAssets2, savedInventory2, savedLoans2, savedBudgets2] = await Promise.all([
            loadTransactions(), loadSettings(), loadGoals(), loadInvoices(), loadAssets(), loadInventory(), loadLoans(), loadBudgets(),
        ]);
        if (savedTx) { const { updated, newEntries } = processDueRecurring(savedTx); setTransactions([...newEntries, ...updated]); }
        if (savedSettings)   setSettings({ ...DEFAULT_SETTINGS, ...savedSettings });
        if (savedGoals)      setGoals(savedGoals);
        if (savedInvoices)   setInvoices(savedInvoices);
        if (savedAssets2)    setAssets(savedAssets2);
        if (savedInventory2) setInventory(savedInventory2);
        if (savedLoans2)     setLoans(savedLoans2);
        if (savedBudgets2)   setBudgets(savedBudgets2);

        setCurrentScreen('dashboard');
        // Re-schedule reminders on sign-in so they stay active
        requestNotificationPermission().then(granted => {
            if (granted) { scheduleDailyReminder(); scheduleWeeklySummaryReminder(); }
        });
    };

    // Team member join — creates Supabase account then links to owner workspace
    const joinTeam = async (email: string, pin: string, inviteCode: string) => {
        const { data, error } = await supabase.auth.signUp({ email, password: hashPin(pin) });
        if (error && error.message !== 'User already registered') throw new Error(error.message);
        let userId = data?.user?.id;
        if (error?.message === 'User already registered') {
            const { data: sd, error: se } = await supabase.auth.signInWithPassword({ email, password: hashPin(pin) });
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
        const [savedTx, savedSettings, savedGoals, savedInvoices, savedAssets2, savedLoans2] = await Promise.all([
            loadTransactions(), loadSettings(), loadGoals(), loadInvoices(), loadAssets(), loadLoans(),
        ]);
        if (savedTx) { const { updated, newEntries } = processDueRecurring(savedTx); setTransactions([...newEntries, ...updated]); }
        if (savedSettings) setSettings({ ...DEFAULT_SETTINGS, ...savedSettings });
        if (savedGoals)    setGoals(savedGoals);
        if (savedInvoices) setInvoices(savedInvoices);
        if (savedAssets2)  setAssets(savedAssets2);
        if (savedLoans2)   setLoans(savedLoans2);
        setCurrentScreen('dashboard');
    };

    const login = async (pin: string): Promise<boolean> => {
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

        // Validate PIN — read from SecureStore, never from state
        const savedPin = await loadPin();
        if (pin !== savedPin) {
            const newAttempts = loginAttempts + 1;
            setLoginAttempts(newAttempts);

            // Log failed login attempt
            auditEvents.loginFailed('Invalid PIN');
            AsyncStorage.setItem(ATTEMPTS_KEY, String(newAttempts)).catch(() => {});

            // Lockout after 5 failed attempts for 15 minutes
            if (newAttempts >= 5) {
                const lockoutTime = Date.now() + (15 * 60 * 1000);
                setIsLockedOut(true);
                setLockoutUntil(lockoutTime);
                AsyncStorage.setItem(LOCKOUT_KEY, String(lockoutTime)).catch(() => {});
                auditEvents.accountLocked();
            }
            return false;
        }

        // Successful login: reset attempts
        setLoginAttempts(0);
        setIsLockedOut(false);
        setLockoutUntil(null);
        AsyncStorage.multiRemove([LOCKOUT_KEY, ATTEMPTS_KEY]).catch(() => {});

        // Log successful login
        auditEvents.login();
        trackUserLoggedIn('pin');

        loadProfile().then(async profile => {
            if (profile) {
                identifyUser(profile.email);
                supabase.auth.signInWithPassword({ email: profile.email, password: hashPin(pin) }).catch(() => {});
            }
            // Enforce 2FA: if not set up, redirect to 2FA setup screen
            try {
                const { loadTwoFactorConfig } = await import('../utils/twoFactorAuth');
                const tfConfig = await loadTwoFactorConfig();
                if (!tfConfig || tfConfig.status === 'disabled') {
                    setCurrentScreen('2fa');
                    return;
                }
            } catch {}
            setCurrentScreen('dashboard');
        });
        return true;
    };

    const logout = () => {
        supabase.auth.signOut().catch(() => {});
        trackUserLoggedOut();
        resetIdentity();
        setCurrentScreen('login');
    };

    const CHANGE_PIN_KEY = 'quad360_changePinAttempts';
    const CHANGE_PIN_LOCKOUT_KEY = 'quad360_changePinLockout';
    const changePin = async (currentPin: string, newPin: string): Promise<{ ok: boolean; lockedUntil?: number }> => {
        // Rate limit: 5 wrong attempts → 15 minute lockout
        const lockoutRaw = await AsyncStorage.getItem(CHANGE_PIN_LOCKOUT_KEY).catch(() => null);
        if (lockoutRaw) {
            const until = parseInt(lockoutRaw, 10);
            if (Date.now() < until) return { ok: false, lockedUntil: until };
            await AsyncStorage.multiRemove([CHANGE_PIN_LOCKOUT_KEY, CHANGE_PIN_KEY]).catch(() => {});
        }
        const savedPin2 = await loadPin();
        if (currentPin !== savedPin2) {
            const attemptsRaw = await AsyncStorage.getItem(CHANGE_PIN_KEY).catch(() => null);
            const attempts = (parseInt(attemptsRaw ?? '0', 10) || 0) + 1;
            if (attempts >= 5) {
                const until = Date.now() + 15 * 60 * 1000;
                await AsyncStorage.setItem(CHANGE_PIN_LOCKOUT_KEY, String(until)).catch(() => {});
                await AsyncStorage.removeItem(CHANGE_PIN_KEY).catch(() => {});
                return { ok: false, lockedUntil: until };
            }
            await AsyncStorage.setItem(CHANGE_PIN_KEY, String(attempts)).catch(() => {});
            return { ok: false };
        }
        await AsyncStorage.multiRemove([CHANGE_PIN_KEY, CHANGE_PIN_LOCKOUT_KEY]).catch(() => {});
        setStoredPin(newPin);
        await savePin(newPin).catch(() => {});
        let cloudSynced = false;
        try {
            const { error } = await supabase.auth.updateUser({ password: hashPin(newPin) });
            cloudSynced = !error;
            if (error) console.warn('[Quad360] Supabase PIN update failed:', error.message);
        } catch (e) {
            console.warn('[Quad360] Supabase PIN update error:', e);
        }
        return { ok: true, cloudSynced };
    };

    const updateSettings = (patch: Partial<BusinessSettings>) => {
        if (!canManage) { denyManage(); return; }
        setSettings(prev => ({ ...prev, ...patch }));
    };

    const updateProfile = (patch: Partial<Pick<User, 'phone' | 'businessName'>>) => {
        setUser(prev => prev ? { ...prev, ...patch } : prev);
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
        trackTransactionAdded(tx.type, tx.amount, settings.currency);
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
        trackGoalCreated(type);
        setGoals(prev => [refreshGoal(goal, finance, transactions), ...prev]);
    };

    const deleteGoal = (id: string) => {
        if (!canManage) { denyManage(); return; }
        setGoals(prev => prev.filter(g => g.id !== id));
    };

    const updateGoal = (id: string, changes: Partial<Pick<FinancialGoal, 'title' | 'description' | 'targetValue' | 'deadline' | 'percentTarget'>>) => {
        setGoals(prev => prev.map(g => {
            if (g.id !== id) return g;
            const updated = { ...g, ...changes };
            return refreshGoal(updated, finance, transactions);
        }));
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
        trackInvoiceCreated(inv.total, settings.currency);
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
        // Also remove the linked income transaction created when the invoice was added
        setInvoices(prev => {
            const inv = prev.find(i => i.id === id);
            if (inv) {
                setTransactions(txPrev => txPrev.filter(t => !(t.reference === inv.invoiceNumber && t.type === 'income' && t.status === 'pending')));
            }
            return prev.filter(i => i.id !== id);
        });
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
        trackAssetAdded(a.category, a.purchaseCost, settings.currency);
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
        const asset = assets.find(a => a.id === id);
        if (asset) {
            const bookValue = computeAssetCurrentValue(asset);
            const gainLoss = disposalValue - bookValue;
            if (gainLoss !== 0) {
                const newTx: Transaction = {
                    id: generateId(),
                    date: disposalDate,
                    description: `Asset disposal: ${asset.name}`,
                    type: gainLoss >= 0 ? 'income' : 'expense',
                    category: gainLoss >= 0 ? 'Asset Sale Gain' : 'Asset Disposal Loss',
                    amount: Math.abs(gainLoss),
                    status: 'paid',
                };
                setTransactions(prev => [newTx, ...prev]);
            }
        }
        setAssets(prev => prev.map(a => a.id === id ? { ...a, status: 'disposed' as const, disposalDate, disposalValue } : a));
    };

    const addLoan = (l: Omit<Loan, 'id' | 'createdAt' | 'payments'>) => {
        if (!canManage) { denyManage(); return; }
        const item: Loan = { ...l, id: generateId(), payments: [], createdAt: new Date().toISOString() };
        trackLoanAdded(l.principal, settings.currency);
        setLoans(prev => [item, ...prev]);
    };

    const updateLoan = (id: string, patch: Partial<Loan>) => {
        if (!canManage) { denyManage(); return; }
        setLoans(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
    };

    const deleteLoan = (id: string) => {
        if (!canManage) { denyManage(); return; }
        setLoans(prev => prev.filter(l => l.id !== id));
    };

    const addLoanPayment = (loanId: string, payment: Omit<LoanPayment, 'id'>) => {
        if (!canManage) { denyManage(); return; }
        const newPayment: LoanPayment = { ...payment, id: generateId() };
        const loan = loans.find(l => l.id === loanId);
        if (loan) {
            const expenseTx: Transaction = {
                id: generateId(),
                date: payment.date,
                description: payment.note || `Loan repayment: ${loan.lenderName}`,
                type: 'expense',
                category: 'Loan Repayment',
                amount: payment.amount,
                status: 'paid',
            };
            setTransactions(prev => [expenseTx, ...prev]);
        }
        setLoans(prev => prev.map(l => {
            if (l.id !== loanId) return l;
            const payments = [...l.payments, newPayment];
            const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
            const status: Loan['status'] = totalPaid >= l.principal ? 'paid_off' : l.status;
            return { ...l, payments, status };
        }));
    };

    const addInventoryItem = (item: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>) => {
        if (!canManage) { denyManage(); return; }
        const now = new Date().toISOString();
        const newItem: InventoryItem = { ...item, id: generateId(), createdAt: now, updatedAt: now };
        trackInventoryItemAdded();
        setInventory(prev => [newItem, ...prev]);
    };

    const updateInventoryItem = (id: string, patch: Partial<InventoryItem>) => {
        if (!canManage) { denyManage(); return; }
        setInventory(prev => prev.map(i => i.id === id ? { ...i, ...patch, updatedAt: new Date().toISOString() } : i));
    };

    const deleteInventoryItem = (id: string) => {
        if (!canManage) { denyManage(); return; }
        setInventory(prev => prev.filter(i => i.id !== id));
    };

    const addBudget = (b: Omit<Budget, 'id'>) => {
        if (!canManage) { denyManage(); return; }
        const item: Budget = { ...b, id: generateId() };
        setBudgets(prev => [item, ...prev]);
    };

    const updateBudget = (id: string, patch: Partial<Budget>) => {
        if (!canManage) { denyManage(); return; }
        setBudgets(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));
    };

    const deleteBudget = (id: string) => {
        if (!canManage) { denyManage(); return; }
        setBudgets(prev => prev.filter(b => b.id !== id));
    };

    const addCashPocket = (name: string, amount: number) => {
        const pocket: CashPocket = { id: Date.now().toString(), name, amount, updatedAt: new Date().toISOString() };
        setCashPockets(prev => [...prev, pocket]);
    };
    const updateCashPocket = (id: string, amount: number) => {
        setCashPockets(prev => prev.map(p => p.id === id ? { ...p, amount, updatedAt: new Date().toISOString() } : p));
    };
    const deleteCashPocket = (id: string) => {
        setCashPockets(prev => prev.filter(p => p.id !== id));
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

    const exportData = () => { trackDataExported(); return exportAllData(transactions, settings, goals); };

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

    // Wipes all business data from Supabase but keeps the auth account and profile intact.
    // Use when a user wants to start fresh without losing their login credentials.
    const resetBusinessData = async () => {
        try {
            const { data: { user: authUser } } = await supabase.auth.getUser();
            const ownerId = authUser?.id ?? null;
            if (ownerId) {
                const tables = ['transactions','goals','invoices','assets','inventory','loans','budgets','audit_logs'];
                const results = await Promise.allSettled(
                    tables.map(t => supabase.from(t).delete().eq('user_id', ownerId))
                );
                results.forEach((r, i) => {
                    if (r.status === 'rejected') console.error(`Reset failed for ${tables[i]}:`, r.reason);
                    else if (r.value.error) console.error(`Reset error for ${tables[i]}:`, r.value.error.message);
                });
            }
            await AsyncStorage.multiRemove([
                '@quad360/transactions', '@quad360/goals', '@quad360/invoices',
                '@quad360/assets', '@quad360/inventory', '@quad360/loans', '@quad360/budgets',
            ]).catch(() => {});
            setTransactions([]); setGoals([]); setInvoices([]); setAssets([]); setInventory([]); setLoans([]); setBudgets([]);
            Alert.alert('Done', 'All business data has been reset.');
        } catch (e) {
            console.error('Error resetting business data:', e);
            Alert.alert('Error', 'Something went wrong while resetting data. Please try again.');
        }
    };

    const deleteAccount = async () => {
        try {
            await deleteAccountData().catch(() => {});
            await AsyncStorage.multiRemove([
                '@quad360/pin', '@quad360/profile', '@quad360/language',
                '@quad360/workspaceOwner', '@quad360/encryption-key',
                '@quad360/inventory', '@quad360/transactions',
                '@quad360/goals', '@quad360/invoices', '@quad360/assets',
                LOCKOUT_KEY, ATTEMPTS_KEY,
            ]).catch(() => {});
            setStoredPin(null); setHasProfile(false); setUser(null);
            setUserRole('owner'); setTransactions([]); setGoals([]);
            setSettings(DEFAULT_SETTINGS); setInvoices([]); setAssets([]);
            setInventory([]); setCurrentScreen('login');
            if (Platform.OS === 'web') setTimeout(() => window.location.reload(), 500);
        } catch (error) {
            console.error('Error deleting account:', error);
        }
    };

    const resetApp = async () => {
        try {
            // Clear local storage only — Supabase data preserved
            await clearAllData().catch(() => {});

            // Clear all auth and app storage
            await AsyncStorage.multiRemove([
                '@quad360/pin',
                '@quad360/profile',
                '@quad360/language',
                '@quad360/workspaceOwner',
                '@quad360/encryption-key',
                '@quad360/inventory',
                '@quad360/transactions',
                '@quad360/goals',
                '@quad360/invoices',
                '@quad360/assets',
                LOCKOUT_KEY,
                ATTEMPTS_KEY,
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
            if (Platform.OS === 'web') {
                setTimeout(() => window.location.reload(), 500);
            }
        } catch (error) {
            console.error('Error resetting app:', error);
        }
    };

    const contextValue = useMemo<AppContextValue>(() => ({
        currentScreen, setCurrentScreen,
        navParams, navigate,
        user, userRole,
        isFirstLaunch: !hasProfile && !isLoading,
        isDemoMode, enterDemo, exitDemo,
        setupAccount, recoverAccount, login, joinTeam, logout, changePin,
        isLockedOut, lockoutUntil,
        settings, updateSettings, updateProfile,
        transactions, addTransaction, deleteTransaction, updateTransaction,
        goals, addGoal, deleteGoal, updateGoal, updateGoalCurrentValue,
        invoices, addInvoice, updateInvoice, deleteInvoice, markInvoiceStatus,
        assets, addAsset, updateAsset, deleteAsset, disposeAsset,
        loans, addLoan, updateLoan, deleteLoan, addLoanPayment,
        inventory, addInventoryItem, updateInventoryItem, deleteInventoryItem,
        budgets, addBudget, updateBudget, deleteBudget,
        cashPockets, addCashPocket, updateCashPocket, deleteCashPocket,
        teamMembers, inviteMember, removeMember, refreshTeam,
        language, setLanguage,
        finance, insight, isLoading, pendingSyncCount,
        exportData, importData, clearData, resetBusinessData, deleteAccount, resetApp,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [
        currentScreen, navParams, user, userRole, hasProfile, isLoading,
        isDemoMode, isLockedOut, lockoutUntil,
        settings, transactions, goals, invoices, assets, loans, inventory,
        budgets, cashPockets, teamMembers, language,
        finance, insight, pendingSyncCount,
    ]);

    return <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error('useApp must be used within AppProvider');
    return ctx;
}
