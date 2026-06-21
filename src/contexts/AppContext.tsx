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
    login: (pin: string) => boolean;
    joinTeam: (email: string, pin: string, inviteCode: string) => Promise<void>;
    logout: () => void;
    changePin: (currentPin: string, newPin: string) => Promise<{ ok: boolean; lockedUntil?: number }>;
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
    paystackPublicKey: 'pk_test_fa849cd42fe4963fe50a29136b33c0af02a6823b',
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
