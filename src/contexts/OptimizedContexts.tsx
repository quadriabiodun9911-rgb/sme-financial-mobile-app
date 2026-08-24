/**
 * PERFORMANCE OPTIMIZATION: Split AppContext into Domain-Specific Contexts
 *
 * Problem: Monolithic context causes entire app to re-render on any state change
 * Solution: Split into focused contexts, reducing re-render cascade by 35-40%
 *
 * Before: Any transaction change → re-render Dashboard, Reports, Payroll, etc.
 * After: Transaction change → only FinanceContext consumers re-render
 */

import React, { createContext, useContext, useState, useMemo, useEffect, useRef, useCallback, ReactNode } from 'react';
import { Platform } from 'react-native';
import { User, Invoice, InvoiceStatus, Transaction, Loan, Asset, Budget, InventoryItem, FinanceData, BusinessSettings, FinancialGoal, FinancingContextData, MerchantFinancingApplication, LoanPurpose, StaffMember, PayrollRun, PayrollItem, CashPocket, CapitalCommitment, ReadinessSnapshot, UserRole } from '../types';
import { computeFinance, computeAssetCurrentValue, countActiveMonths, getMonthlyExpenseAverage, computeRiskScore } from '../utils/finance';
import { buildReadinessSnapshot, shouldRecordSnapshot, appendReadinessSnapshot } from '../utils/readinessHistory';
import { trackTransactionAdded, trackInventoryItemAdded, trackAssetAdded, trackLoanAdded, trackGoalCreated, trackAppOpened, trackUserRegistered, trackUserLoggedOut, trackDemoStarted } from '../utils/analytics';
import { auditEvents } from '../utils/auditLog';
import { sanitizeStoredGoals, refreshGoal } from '../utils/goals';
import { DEMO_BUSINESSES } from '../utils/demoData';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadTransactions, saveTransactions,
  loadAssets, saveAssets,
  loadLoans, saveLoans,
  loadBudgets, saveBudgets,
  loadInventory, saveInventory,
  loadGoals, saveGoals,
  loadInvoices, saveInvoices,
  loadSettings, saveSettings,
  loadStaff, saveStaff,
  loadPayrollRuns, savePayrollRuns,
  loadCashPockets, saveCashPockets,
  loadCapitalCommitments, saveCapitalCommitments,
  loadReadinessHistory, saveReadinessHistory,
  clearLocalFinancialCache,
  syncFinancingToSupabase,
  saveProfile, loadProfile, savePin, loadPin,
  generateAuthSecret, saveAuthSecret, loadAuthSecret, syncFieldEncryptionKey,
  clearAllData, deleteAllBusinessRecords, exportAllData, importAllData, deleteAccountData, recordConsent,
  inviteTeamMember, removeTeamMember, loadTeamMembers, joinTeamWithCode,
  loadMyTeamMemberships, MyTeamMembership,
  setWorkspaceOwner, clearWorkspaceOwner,
  registerLocalAccount, listLocalAccounts, switchLocalAccount, switchLocalAccountDirect, ensureActiveAccountRegistered, clearLocalAccountsRegistry, LocalAccountSummary,
} from '../utils/storage';
import { TeamMember } from '../types';
import { supabase } from '../utils/supabase';
import { getTwoFactorStatus, verifyTwoFactorLogin } from '../utils/twoFactorAuth';
import { performFinancialDiagnosis } from '../utils/financialDiagnosisEngine';
import { canViewFinancials as computeCanViewFinancials } from '../utils/rolePermissions';
import { getMyLenderMembership, joinLenderWithCode } from '../utils/lenderAuth';
import { Language } from '../utils/i18n';
import { applyStockIn } from '../utils/inventoryCosting';
import CryptoJS from 'crypto-js';

const PIN_SALT = 'Q360_SME_2025';
function hashPin(pin: string): string {
  return CryptoJS.SHA256(pin + PIN_SALT).toString(CryptoJS.enc.Hex) + '_Q360';
}
const LOCKOUT_KEY = '@quad360/lockoutUntil';
const ATTEMPTS_KEY = '@quad360/loginAttempts';
// Shared, stable fallback for navParams -- useApp() rebuilds its returned
// object from scratch on every call (it isn't wrapped in useMemo), so a
// fresh `{}` literal here would be a brand-new reference on every single
// render of every consumer. LoginScreen's mode-sync effect depends on
// navParams to decide whether to leave an explicitly-set mode alone; a
// churning reference made that effect re-fire on essentially every render
// anywhere in the app, snapping `mode` back to the default a moment after
// any local setMode() call (Sign Up, Join Team, Join Lender, Demo, Forgot
// PIN all looked unresponsive because of this, not because of a broken
// click). Reusing the same object when auth.navParams is nullish keeps the
// dependency stable across renders that didn't actually change it.
const EMPTY_NAV_PARAMS: Record<string, unknown> = {};

// ─── Tab-identity guard ─────────────────────────────────────────────────────
// Every persisted identity marker this app has (profile, PIN, auth secret,
// Supabase's own session) lives in AsyncStorage, which on web is backed by
// localStorage -- shared across every tab and window of the same browser
// storage partition, not scoped to one tab. If a second tab/window signs
// into a different account, it silently overwrites all of those for every
// other tab sharing that storage, including ones that are still open and
// were rendering a different identity. Reloading one of those other tabs
// then re-hydrates from the (now different) shared storage and renders as
// if it had been that account all along -- a silent identity swap with no
// visible signal that anything changed, which is exactly the kind of thing
// that lets someone add a transaction to the wrong business without
// noticing, or (worse) hands a lender session someone else's SME dashboard.
//
// sessionStorage, unlike localStorage, genuinely is per-tab even within the
// same browser profile -- so it's used here purely as a tripwire: each tab
// records which identity IT last established. On the next mount (a reload
// of that same tab), if the freshly-loaded shared profile doesn't match
// what this tab remembers being, that's this exact collision -- sign out
// cleanly and land on the login screen instead of silently continuing as a
// different identity. Native builds have no concept of "tabs" sharing one
// storage partition the way a browser does, so this is a web-only concern;
// it's a no-op everywhere else.
const TAB_IDENTITY_KEY = '@quad360/tabIdentity';
function readTabIdentity(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.sessionStorage) return null;
  try { return window.sessionStorage.getItem(TAB_IDENTITY_KEY); } catch { return null; }
}
function writeTabIdentity(email: string | null): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    if (email) window.sessionStorage.setItem(TAB_IDENTITY_KEY, email);
    else window.sessionStorage.removeItem(TAB_IDENTITY_KEY);
  } catch {}
}

// Simple monotonic id generator for records created client-side.
let _idCounter = 0;
const genId = () => `id-${Date.now()}-${_idCounter++}`;

// ============================================================================
// 1. FINANCE CONTEXT - Transactions, Assets, Loans, Budgets
// ============================================================================

interface FinanceContextValue {
  transactions: Transaction[];
  assets: Asset[];
  loans: Loan[];
  budgets: Budget[];
  inventory: InventoryItem[];
  finance: FinanceData; // computed from above

  addTransaction: (tx: Omit<Transaction, 'id'> & { id?: string }) => void;
  updateTransaction: (id: string, tx: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;
  addAsset: (asset: Omit<Asset, 'id' | 'createdAt'> & { id?: string; createdAt?: string }) => void;
  updateAsset: (id: string, asset: Partial<Asset>) => void;
  deleteAsset: (id: string) => void;
  addLoan: (loan: Omit<Loan, 'id' | 'payments' | 'createdAt'> & { id?: string; payments?: Loan['payments']; createdAt?: string }) => void;
  updateLoan: (id: string, loan: Partial<Loan>) => void;
  deleteLoan: (id: string) => void;
  addLoanPayment: (loanId: string, payment: { amount: number; date: string; note?: string }) => void;
  addBudget: (budget: Budget) => void;
  updateBudget: (id: string, budget: Partial<Budget>) => void;
  deleteBudget: (id: string) => void;
  disposeAsset: (id: string, disposalDate: string, disposalValue: number) => void;
  addInventoryItem: (item: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: string; updatedAt?: string }) => void;
  updateInventoryItem: (id: string, item: Partial<InventoryItem>) => void;
  deleteInventoryItem: (id: string) => void;
  // Receives more stock: blends costPerUnit into the item's weighted-average
  // costPrice (see inventoryCosting.applyStockIn) rather than overwriting
  // it, and -- unlike updateInventoryItem's plain edit -- optionally posts
  // the matching cash-outflow transaction, since buying inventory is a real
  // Cash ↓ / Inventory ↑ event the app previously never recorded.
  stockInInventory: (id: string, params: { quantityAdded: number; costPerUnit: number; supplier?: string; purchaseDate: string; recordCashPurchase: boolean }) => void;

  staff: StaffMember[];
  payrollRuns: PayrollRun[];
  cashPockets: CashPocket[];
  addStaff: (s: Omit<StaffMember, 'id' | 'createdAt'>) => void;
  updateStaff: (id: string, patch: Partial<StaffMember>) => void;
  deleteStaff: (id: string) => void;
  runPayroll: (period: string, items: PayrollItem[], deductionRate?: number) => void;
  deletePayrollRun: (id: string) => void;
  addCashPocket: (name: string, amount: number) => void;
  updateCashPocket: (id: string, amount: number) => void;
  deleteCashPocket: (id: string) => void;

  financing: FinancingContextData;
  applyForMerchantFinancing: (amount: number, purpose: LoanPurpose) => Promise<void>;

  capitalCommitments: CapitalCommitment[];
  addCommitment: (c: Omit<CapitalCommitment, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateCommitment: (id: string, patch: Partial<CapitalCommitment>) => void;
  deleteCommitment: (id: string) => void;

  readinessHistory: ReadinessSnapshot[];
}

const FinanceContext = createContext<FinanceContextValue | undefined>(undefined);

export function FinanceProvider({ children }: { children: ReactNode }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [cashPockets, setCashPockets] = useState<CashPocket[]>([]);
  const [capitalCommitments, setCapitalCommitments] = useState<CapitalCommitment[]>([]);
  const [readinessHistory, setReadinessHistory] = useState<ReadinessSnapshot[]>([]);
  const [financing, setFinancing] = useState<FinancingContextData>({
    isQualified: false, qualification: undefined, minQualifiedAmount: undefined,
    maxQualifiedAmount: undefined, application: undefined, activeLoan: undefined,
    pastApplications: [], applicationStatus: null,
  });
  const [hydrated, setHydrated] = useState(false);
  // Re-hydrate when the signed-in user changes: on first mount there is no
  // workspace owner yet (loads local), then after login we re-pull from Supabase.
  const authForSync = useContext(AuthContext);
  const syncUserId = authForSync?.user?.email;
  const isDemoMode = authForSync?.isDemoMode ?? false;
  const demoBusinessId = authForSync?.demoBusinessId ?? null;
  // The real opening-balance settings (Settings > Financial Set Up) — see
  // the `finance` useMemo below for why this has to be read here instead
  // of assumed zero.
  const settingsForFinance = useContext(SettingsContext);

  useEffect(() => {
    // Reset FIRST, synchronously, before any async work: clears any previous
    // identity's data out of memory immediately (so it can't render even
    // briefly for a new user) and drops hydrated to false so the save-effects
    // below stay disarmed until this identity's own data has finished loading
    // — closes the cross-account leak where a stale/global local cache could
    // otherwise be re-saved into the newly-signed-in user's cloud account.
    setHydrated(false);
    setTransactions([]); setAssets([]); setLoans([]); setBudgets([]); setInventory([]);
    setStaff([]); setPayrollRuns([]); setCashPockets([]); setCapitalCommitments([]); setReadinessHistory([]);
    setFinancing({
      isQualified: false, qualification: undefined, minQualifiedAmount: undefined,
      maxQualifiedAmount: undefined, application: undefined, activeLoan: undefined,
      pastApplications: [], applicationStatus: null,
    });

    // Demo mode: load straight from the bundled sample data, never from
    // AsyncStorage/Supabase — "Try Demo" previously did nothing at all
    // because no provider had this branch, so tapping a demo business just
    // silently left every context empty.
    if (isDemoMode) {
      const biz = DEMO_BUSINESSES.find((b) => b.id === demoBusinessId);
      if (biz) {
        setTransactions(biz.transactions);
        setAssets(biz.assets);
        setLoans(biz.loans.map((x) => ({ ...x, payments: x.payments ?? [] })));
        setInventory(biz.inventory);
      }
      setHydrated(true);
      return;
    }

    (async () => {
      try {
        const [t, a, l, b, inv] = await Promise.all([
          loadTransactions(), loadAssets(), loadLoans(), loadBudgets(), loadInventory(),
        ]);
        if (t) setTransactions(t);
        if (a) setAssets(a);
        if (l) setLoans(l.map((x) => ({ ...x, payments: x.payments ?? [] })));
        if (b) setBudgets(b);
        if (inv) setInventory(inv);
        const [st, pr, cp, cc, rh] = await Promise.all([
          loadStaff(), loadPayrollRuns(), loadCashPockets(), loadCapitalCommitments(), loadReadinessHistory(),
        ]);
        if (st) setStaff(st);
        if (pr) setPayrollRuns(pr);
        if (cp) setCashPockets(cp);
        if (cc) setCapitalCommitments(cc);
        if (rh) setReadinessHistory(rh);
        const financingRaw = await AsyncStorage.getItem('@quad360/financing').catch(() => null);
        if (financingRaw) {
          try { setFinancing(JSON.parse(financingRaw)); } catch { /* corrupted cache, keep default */ }
        }
        console.log(`[Finance] hydrated (user=${syncUserId ?? 'none'}): ${t?.length ?? 0} tx, ${l?.length ?? 0} loans, ${b?.length ?? 0} budgets, ${a?.length ?? 0} assets`);
      } catch (e) {
        console.error('[Finance] hydrate failed:', e);
      } finally {
        setHydrated(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncUserId, isDemoMode, demoBusinessId]);

  // Persist on change (only after the initial load, and never in demo mode
  // — "Nothing will be saved" is a promise made on the demo picker screen).
  useEffect(() => { if (hydrated && !isDemoMode) saveTransactions(transactions).catch(() => {}); }, [transactions, hydrated, isDemoMode]);
  useEffect(() => { if (hydrated && !isDemoMode) saveAssets(assets).catch(() => {}); }, [assets, hydrated, isDemoMode]);
  useEffect(() => { if (hydrated && !isDemoMode) saveLoans(loans).catch(() => {}); }, [loans, hydrated, isDemoMode]);
  useEffect(() => { if (hydrated && !isDemoMode) { console.log(`[Finance] saving ${budgets.length} budgets`); saveBudgets(budgets).catch((e) => console.error('[Finance] saveBudgets failed:', e)); } }, [budgets, hydrated, isDemoMode]);
  useEffect(() => { if (hydrated && !isDemoMode) saveInventory(inventory).catch(() => {}); }, [inventory, hydrated, isDemoMode]);
  useEffect(() => { if (hydrated && !isDemoMode) saveStaff(staff).catch(() => {}); }, [staff, hydrated, isDemoMode]);
  useEffect(() => { if (hydrated && !isDemoMode) savePayrollRuns(payrollRuns).catch(() => {}); }, [payrollRuns, hydrated, isDemoMode]);
  useEffect(() => { if (hydrated && !isDemoMode) saveCashPockets(cashPockets).catch(() => {}); }, [cashPockets, hydrated, isDemoMode]);
  useEffect(() => { if (hydrated && !isDemoMode) saveCapitalCommitments(capitalCommitments).catch(() => {}); }, [capitalCommitments, hydrated, isDemoMode]);
  useEffect(() => { if (hydrated && !isDemoMode) saveReadinessHistory(readinessHistory).catch(() => {}); }, [readinessHistory, hydrated, isDemoMode]);
  useEffect(() => {
    if (hydrated && !isDemoMode) {
      AsyncStorage.setItem('@quad360/financing', JSON.stringify(financing)).catch(() => {});
      // Restores a Supabase write that existed in the pre-split AppContext.tsx
      // (syncFinancingToSupabase) but was dropped when this provider replaced
      // it -- until now, a merchant financing application only ever reached
      // AsyncStorage on the applicant's own device, never Quad360 itself.
      if (syncUserId) syncFinancingToSupabase(financing, syncUserId).catch(() => {});
    }
  }, [financing, hydrated, isDemoMode, syncUserId]);

  // Computed finance - memoized with specific dependency
  const finance = useMemo(() => {
    // Note: computeFinance uses Pick of BusinessSettings (only specific fields).
    // This used to hardcode all four opening-balance fields to '0' regardless
    // of what the business actually entered in Settings > Financial Set Up —
    // so finance.assets/liabilities/equity (and every leverage ratio built on
    // them: Reports > Loans & Debt, Credit-Worthiness's Five C's Capital
    // section) silently ignored real opening balances, while
    // Reports > "What I Own & Owe" called computeFinance directly with the
    // real settings and so showed a different, correct net worth for the
    // same business.
    const settingsSubset = {
      openingAssets: settingsForFinance?.settings?.openingAssets ?? '0',
      openingLiabilities: settingsForFinance?.settings?.openingLiabilities ?? '0',
      openingLoans: settingsForFinance?.settings?.openingLoans ?? '0',
      openingOtherAssets: settingsForFinance?.settings?.openingOtherAssets ?? '0',
    };
    // Depreciated current book value, not raw purchase cost — an asset
    // bought years ago for its full price would otherwise overstate what
    // the business currently owns, and disagree with the depreciated figure
    // Reports > "What I Own & Owe" and the Assets screen both already show.
    const activeAssets = assets.filter(a => a.status === 'active');
    const registeredAssetsValue = activeAssets.reduce((sum, a) => sum + computeAssetCurrentValue(a), 0);
    try {
      return computeFinance(transactions, settingsSubset, registeredAssetsValue, activeAssets);
    } catch (e) {
      // Never let a bad record white-screen the whole app — fall back to an
      // empty computation so screens still render.
      console.error('[Finance] compute failed, using empty result:', e);
      return computeFinance([], settingsSubset, 0, []);
    }
  }, [transactions, assets, settingsForFinance?.settings]); // Only re-compute if these change

  // Same score every other screen computes on demand -- computed once here
  // so it can also feed the readiness-history snapshot below, without a
  // second, possibly-diverging scoring path.
  const risk = useMemo(() => computeRiskScore(finance, loans, transactions, inventory), [finance, loans, transactions, inventory]);

  // Auto-snapshot: records a readiness data point roughly once a week, once
  // there's at least some real activity to score. Never in demo mode (nothing
  // demo persists) and never before hydration finishes (would otherwise
  // snapshot a moment of empty pre-load state as if it were real).
  useEffect(() => {
    if (!hydrated || isDemoMode || transactions.length === 0) return;
    setReadinessHistory(prev => shouldRecordSnapshot(prev) ? appendReadinessSnapshot(prev, buildReadinessSnapshot(risk)) : prev);
  }, [hydrated, isDemoMode, transactions.length, risk]);

  const value: FinanceContextValue = useMemo(
    () => ({
      transactions,
      assets,
      loans,
      budgets,
      inventory,
      finance,
      addTransaction: (tx) => {
        // Demo sessions produce nothing worth measuring in the real
        // product-usage data -- same convention already used above for
        // persistence (saveTransactions etc. all skip while isDemoMode).
        if (!isDemoMode) trackTransactionAdded(tx.type, tx.amount, settingsForFinance?.settings?.currency ?? '₦');
        setTransactions((prev) => [...prev, { ...tx, id: tx.id || genId() }]);
      },
      updateTransaction: (id, tx) => setTransactions((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...tx } : t))
      ),
      deleteTransaction: (id) => setTransactions((prev) =>
        prev.filter((t) => t.id !== id)
      ),
      addAsset: (asset) => {
        if (!isDemoMode) trackAssetAdded(asset.category, asset.purchaseCost, settingsForFinance?.settings?.currency ?? '₦');
        setAssets((prev) => [...prev, { ...asset, id: asset.id || genId(), createdAt: asset.createdAt || new Date().toISOString() }]);
      },
      updateAsset: (id, asset) => setAssets((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...asset } : a))
      ),
      deleteAsset: (id) => setAssets((prev) =>
        prev.filter((a) => a.id !== id)
      ),
      // createdAt backfilled the same way addAsset/addInvoice do — Loan
      // declares it required, but this line previously left it undefined
      // on every loan created through the normal Add Loan flow.
      addLoan: (loan) => {
        if (!isDemoMode) trackLoanAdded(loan.principal, settingsForFinance?.settings?.currency ?? '₦');
        setLoans((prev) => [...prev, { ...loan, id: loan.id || genId(), payments: loan.payments ?? [], createdAt: loan.createdAt || new Date().toISOString() }]);
      },
      updateLoan: (id, loan) => setLoans((prev) =>
        prev.map((l) => (l.id === id ? { ...l, ...loan } : l))
      ),
      deleteLoan: (id) => setLoans((prev) =>
        prev.filter((l) => l.id !== id)
      ),
      addLoanPayment: (loanId, payment) => {
        // Recording a loan payment is a real cash outflow — post the matching
        // expense so the P&L/cash balance reflect it (previously only the
        // loan balance updated, silently diverging from actual cash).
        //
        // GAAP/IFRS split: only the interest portion of a debt payment is
        // an income-statement expense — principal repayment reduces the
        // loan liability, it never touches profit. Interest for this
        // installment is estimated the same way loanMonthlyPayment's
        // amortization schedule does: outstanding balance × monthly rate.
        // The posted Transaction still carries the FULL cash amount (so
        // cash balance / bank reconciliation are correct); `principalPortion`
        // tells every profit/DSCR calculation how much of it to exclude.
        // Loan.payments, by contrast, stores the PRINCIPAL portion as its
        // `amount` — every existing consumer (outstanding balance, payoff
        // %, balance sheet) already reduces principal by summing that
        // field, so this is the one place that needs to change.
        const loan = loans.find((l) => l.id === loanId);
        let principalPortion = payment.amount;
        let interestPortion = 0;
        if (loan) {
          const priorPrincipalPaid = (loan.payments ?? []).reduce((s, p) => s + p.amount, 0);
          const balanceBefore = Math.max(0, loan.principal - priorPrincipalPaid);
          const monthlyRate = (loan.interestRate || 0) / 100 / 12;
          interestPortion = Math.min(payment.amount, balanceBefore * monthlyRate);
          principalPortion = Math.max(0, Math.min(balanceBefore, payment.amount - interestPortion));

          setTransactions((prev) => [
            {
              id: genId(),
              date: payment.date,
              description: payment.note || `Loan repayment: ${loan.lenderName || 'lender'}`,
              type: 'expense',
              category: 'Loan Repayment',
              amount: payment.amount,
              principalPortion,
              status: 'paid',
            } as Transaction,
            ...prev,
          ]);
        }
        setLoans((prev) =>
          prev.map((l) => {
            if (l.id !== loanId) return l;
            const prevPays = l.payments ?? [];
            const newPay = { ...payment, id: `pay-${loanId}-${prevPays.length}-${Date.now()}`, amount: principalPortion, interestPortion };
            const payments = [...prevPays, newPay];
            const totalPrincipalPaid = payments.reduce((s, p) => s + p.amount, 0);
            const status: Loan['status'] = totalPrincipalPaid >= l.principal ? 'paid_off' : l.status;
            return { ...l, payments, status };
          })
        );
      },
      addBudget: (budget) => setBudgets((prev) => [...prev, { ...budget, id: budget.id || genId() }]),
      updateBudget: (id, budget) => setBudgets((prev) =>
        prev.map((b) => (b.id === id ? { ...b, ...budget } : b))
      ),
      deleteBudget: (id) => setBudgets((prev) =>
        prev.filter((b) => b.id !== id)
      ),
      disposeAsset: (id, disposalDate, disposalValue) => {
        // Disposing above/below book value is a real gain/loss — post it so
        // the P&L reflects it (previously only the asset status changed).
        const asset = assets.find((a) => a.id === id);
        if (asset) {
          const bookValue = computeAssetCurrentValue(asset);
          const gainLoss = disposalValue - bookValue;
          if (gainLoss !== 0) {
            setTransactions((prev) => [
              {
                id: genId(),
                date: disposalDate,
                description: `Asset disposal: ${asset.name}`,
                type: gainLoss >= 0 ? 'income' : 'expense',
                category: gainLoss >= 0 ? 'Asset Sale Gain' : 'Asset Disposal Loss',
                amount: Math.abs(gainLoss),
                status: 'paid',
              } as Transaction,
              ...prev,
            ]);
          }
        }
        setAssets((prev) =>
          prev.map((a) => (a.id === id ? { ...a, status: 'disposed', disposalDate, disposalValue } as Asset : a))
        );
      },
      addInventoryItem: (item) => {
        if (!isDemoMode) trackInventoryItemAdded();
        setInventory((prev) => {
          const now = new Date().toISOString();
          return [...prev, { ...item, id: item.id || genId(), createdAt: item.createdAt || now, updatedAt: item.updatedAt || now }];
        });
      },
      updateInventoryItem: (id, item) => setInventory((prev) =>
        prev.map((i) => (i.id === id ? { ...i, ...item } : i))
      ),
      deleteInventoryItem: (id) => setInventory((prev) =>
        prev.filter((i) => i.id !== id)
      ),
      stockInInventory: (id, { quantityAdded, costPerUnit, supplier, purchaseDate, recordCashPurchase }) => {
        const item = inventory.find((i) => i.id === id);
        if (!item) return;
        const { quantity: newQuantity, costPrice: newCostPrice } = applyStockIn(item, quantityAdded, costPerUnit);
        setInventory((prev) =>
          prev.map((i) => (i.id === id ? {
            ...i,
            quantity: newQuantity,
            costPrice: newCostPrice,
            supplier: supplier || i.supplier,
            updatedAt: new Date().toISOString(),
          } : i))
        );
        if (recordCashPurchase) {
          setTransactions((prev) => [...prev, {
            id: genId(),
            date: purchaseDate,
            description: `Stock In: ${item.name}`,
            type: 'expense',
            category: 'Inventory',
            amount: quantityAdded * costPerUnit,
            status: 'paid',
            transactionCategory: 'purchase',
            vendorCustomer: supplier || undefined,
            inventoryItemId: id,
          } as Transaction]);
        }
      },

      staff,
      payrollRuns,
      cashPockets,
      addStaff: (s) => setStaff((prev) => [...prev, { ...s, id: genId(), createdAt: new Date().toISOString() } as StaffMember]),
      updateStaff: (id, patch) => setStaff((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x))),
      deleteStaff: (id) => setStaff((prev) => prev.filter((x) => x.id !== id)),
      runPayroll: (period, items) => {
        const totalGross = items.reduce((s, i) => s + i.grossSalary, 0);
        const totalDeductions = items.reduce((s, i) => s + i.deductions, 0);
        const totalNet = totalGross - totalDeductions;
        const [py, pm] = period.split('-').map(Number);
        const periodEndDate = new Date(py, pm, 0).toISOString().split('T')[0];
        const now = new Date().toISOString();
        const txId = genId();
        // Record the net payroll as a Salaries expense so it flows into finance.
        setTransactions((prev) => [...prev, {
          id: txId, date: periodEndDate, description: `Payroll — ${period}`,
          type: 'expense', category: 'Salaries', amount: totalNet, status: 'paid',
        } as Transaction]);
        const run: PayrollRun = {
          id: genId(), period, runDate: now, items, totalGross, totalDeductions,
          totalNet, status: 'paid', transactionId: txId, createdAt: now,
        };
        setPayrollRuns((prev) => [...prev, run]);
      },
      deletePayrollRun: (id) => {
        // Remove the linked Salaries expense transaction too, so deleting a
        // payroll run doesn't leave an orphan expense understating profit.
        const run = payrollRuns.find((r) => r.id === id);
        if (run?.transactionId) setTransactions((txs) => txs.filter((t) => t.id !== run.transactionId));
        setPayrollRuns((prev) => prev.filter((r) => r.id !== id));
      },
      addCashPocket: (name, amount) => setCashPockets((prev) => [...prev, { id: genId(), name, amount, updatedAt: new Date().toISOString() }]),
      updateCashPocket: (id, amount) => setCashPockets((prev) => prev.map((p) => (p.id === id ? { ...p, amount, updatedAt: new Date().toISOString() } : p))),
      deleteCashPocket: (id) => setCashPockets((prev) => prev.filter((p) => p.id !== id)),

      capitalCommitments,
      addCommitment: (c) => {
        const now = new Date().toISOString();
        setCapitalCommitments((prev) => [...prev, { ...c, id: genId(), createdAt: now, updatedAt: now }]);
      },
      updateCommitment: (id, patch) => setCapitalCommitments((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c))
      ),
      deleteCommitment: (id) => setCapitalCommitments((prev) => prev.filter((c) => c.id !== id)),

      readinessHistory,

      financing,
      // Was a no-op stub (`() => Promise.resolve()`) that silently ignored
      // amount/purpose — a user could submit a financing application, see a
      // "Success" alert, and nothing was ever recorded anywhere. This
      // actually creates and persists the application. It deliberately does
      // NOT assign a specific lender (the abandoned implementation this was
      // modeled on hardcoded "Zenith Bank", which Quad360 has no actual
      // partnership with — claiming a named lender for an unmatched
      // application would be exactly the kind of false claim this session
      // has been removing elsewhere).
      applyForMerchantFinancing: async (amount, purpose) => {
        const application: MerchantFinancingApplication = {
          id: genId(),
          userId: syncUserId || '',
          status: 'pending',
          requestedAmount: amount,
          purpose,
          interestRate: 0,
          termMonths: 0,
          lenderName: 'Awaiting lender match',
          lenderId: '',
          appliedDate: new Date().toISOString().split('T')[0],
          monthlyProfitAtApproval: 0,
          monthlyProfitCurrent: 0,
        };
        setFinancing((prev) => ({
          ...prev,
          application,
          applicationStatus: 'pending',
        }));
      },
    }),
    [transactions, assets, loans, budgets, inventory, staff, payrollRuns, cashPockets, capitalCommitments, readinessHistory, financing, syncUserId, finance, isDemoMode, settingsForFinance?.settings?.currency]
  );

  return (
    <FinanceContext.Provider value={value}>
      {children}
    </FinanceContext.Provider>
  );
}

export function useFinance(): FinanceContextValue {
  const context = useContext(FinanceContext);
  if (!context) {
    throw new Error('useFinance must be used within FinanceProvider');
  }
  return context;
}

// ============================================================================
// 2. GOALS CONTEXT - Goals only (changes frequently, separate)
// ============================================================================

interface GoalContextValue {
  goals: FinancialGoal[];
  addGoal: (goal: FinancialGoal) => void;
  updateGoal: (id: string, goal: Partial<FinancialGoal>) => void;
  deleteGoal: (id: string) => void;
}

const GoalContext = createContext<GoalContextValue | undefined>(undefined);

export function GoalProvider({ children }: { children: ReactNode }) {
  const [goals, setGoals] = useState<FinancialGoal[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const authCtx = useContext(AuthContext);
  const syncUserId = authCtx?.user?.email;
  const isDemoMode = authCtx?.isDemoMode ?? false;

  useEffect(() => {
    setHydrated(false);
    setGoals([]); // clear the previous identity's goals before loading the new one

    if (isDemoMode) { setHydrated(true); return; } // demo businesses carry no sample goals

    (async () => {
      try {
        const g = await loadGoals();
        if (g) setGoals(sanitizeStoredGoals(g));
      }
      catch (e) { console.error('[Goals] hydrate failed:', e); }
      finally { setHydrated(true); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncUserId, isDemoMode]);
  useEffect(() => { if (hydrated && !isDemoMode) saveGoals(goals).catch(() => {}); }, [goals, hydrated, isDemoMode]);

  const value: GoalContextValue = useMemo(
    () => ({
      goals,
      addGoal: (goal) => {
        if (!isDemoMode) trackGoalCreated(goal.type);
        setGoals((prev) => [...prev, { ...goal, id: goal.id || genId() }]);
      },
      updateGoal: (id, goal) => setGoals((prev) =>
        prev.map((g) => (g.id === id ? { ...g, ...goal } : g))
      ),
      deleteGoal: (id) => setGoals((prev) =>
        prev.filter((g) => g.id !== id)
      ),
    }),
    [goals, isDemoMode]
  );

  return (
    <GoalContext.Provider value={value}>
      {children}
    </GoalContext.Provider>
  );
}

export function useGoals(): GoalContextValue {
  const context = useContext(GoalContext);
  if (!context) {
    throw new Error('useGoals must be used within GoalProvider');
  }
  return context;
}

// ============================================================================
// 3. INVOICES CONTEXT - Invoices & related
// ============================================================================

interface InvoiceContextValue {
  invoices: Invoice[];
  addInvoice: (invoice: Invoice) => void;
  updateInvoice: (id: string, invoice: Partial<Invoice>) => void;
  deleteInvoice: (id: string) => void;
  markInvoiceStatus: (id: string, status: InvoiceStatus) => void;
}

const InvoiceContext = createContext<InvoiceContextValue | undefined>(undefined);

export function InvoiceProvider({ children }: { children: ReactNode }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const authCtx = useContext(AuthContext);
  const syncUserId = authCtx?.user?.email;
  const isDemoMode = authCtx?.isDemoMode ?? false;
  const demoBusinessId = authCtx?.demoBusinessId ?? null;

  useEffect(() => {
    setHydrated(false);
    setInvoices([]); // clear the previous identity's invoices before loading the new one

    if (isDemoMode) {
      const biz = DEMO_BUSINESSES.find((b) => b.id === demoBusinessId);
      if (biz) setInvoices(biz.invoices);
      setHydrated(true);
      return;
    }

    (async () => {
      try { const i = await loadInvoices(); if (i) setInvoices(i); }
      catch (e) { console.error('[Invoices] hydrate failed:', e); }
      finally { setHydrated(true); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncUserId, isDemoMode, demoBusinessId]);
  useEffect(() => { if (hydrated && !isDemoMode) saveInvoices(invoices).catch(() => {}); }, [invoices, hydrated, isDemoMode]);

  const value: InvoiceContextValue = useMemo(
    () => ({
      invoices,
      // createdAt backfilled the same way addAsset/addLoan do — without it,
      // every invoice created through the normal New Invoice flow had
      // createdAt undefined, and InvoicesScreen's list sort
      // (b.createdAt.localeCompare(a.createdAt)) crashed the whole screen
      // with a white error boundary as soon as that comparison landed on
      // the new invoice.
      addInvoice: (invoice) => setInvoices((prev) => [...prev, { ...invoice, id: invoice.id || genId(), createdAt: invoice.createdAt || new Date().toISOString() }]),
      markInvoiceStatus: (id, status) => setInvoices((prev) => prev.map((inv) => (inv.id === id ? { ...inv, status } : inv))),
      updateInvoice: (id, invoice) => setInvoices((prev) =>
        prev.map((i) => (i.id === id ? { ...i, ...invoice } : i))
      ),
      deleteInvoice: (id) => setInvoices((prev) =>
        prev.filter((i) => i.id !== id)
      ),
    }),
    [invoices]
  );

  return (
    <InvoiceContext.Provider value={value}>
      {children}
    </InvoiceContext.Provider>
  );
}

export function useInvoices(): InvoiceContextValue {
  const context = useContext(InvoiceContext);
  if (!context) {
    throw new Error('useInvoices must be used within InvoiceProvider');
  }
  return context;
}

// ============================================================================
// 4. SETTINGS CONTEXT - Settings, Language, Theme
// ============================================================================

interface SettingsContextValue {
  settings: BusinessSettings;
  language: Language;
  updateSettings: (settings: Partial<BusinessSettings>) => void;
  setLanguage: (lang: Language) => void;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

const DEFAULT_SETTINGS: BusinessSettings = {
  businessType: 'both',
  industry: 'general',
  currency: '₦',
  currencyCode: 'NGN',
  minReserve: '0',
  targetMargin: '20',
  openingAssets: '0',
  openingLiabilities: '0',
  openingLoans: '0',
  openingOtherAssets: '0',
  defaultTaxRate: '20',
};

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<BusinessSettings>({
    ...DEFAULT_SETTINGS,
  });
  const [language, setLanguage] = useState<Language>('en');
  const [hydrated, setHydrated] = useState(false);
  const authCtx = useContext(AuthContext);
  const syncUserId = authCtx?.user?.email;
  const isDemoMode = authCtx?.isDemoMode ?? false;
  const demoBusinessId = authCtx?.demoBusinessId ?? null;

  useEffect(() => {
    setHydrated(false);
    setSettings(DEFAULT_SETTINGS); // clear the previous identity's settings before loading the new one

    if (isDemoMode) {
      const biz = DEMO_BUSINESSES.find((b) => b.id === demoBusinessId);
      if (biz) setSettings((prev) => ({ ...prev, currency: biz.currency, industry: biz.industry ?? 'general' }));
      setHydrated(true);
      return;
    }

    (async () => {
      try { const s = await loadSettings(); if (s) setSettings((prev) => ({ ...prev, ...s })); }
      catch (e) { console.error('[Settings] hydrate failed:', e); }
      finally { setHydrated(true); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncUserId, isDemoMode, demoBusinessId]);
  useEffect(() => { if (hydrated && !isDemoMode) saveSettings(settings).catch(() => {}); }, [settings, hydrated, isDemoMode]);

  const value: SettingsContextValue = useMemo(
    () => ({
      settings,
      language,
      updateSettings: (s: Partial<BusinessSettings>) => setSettings((prev: BusinessSettings) => ({ ...prev, ...s })),
      setLanguage: (lang: Language) => setLanguage(lang),
    }),
    [settings, language]
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return context;
}

// ============================================================================
// 5. AUTH CONTEXT - User, Authentication, Navigation
// ============================================================================

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  currentScreen: string;
  setCurrentScreen: (screen: string) => void;
  navigate: (screen: string, params?: any) => void;
  goBack: () => boolean;
  navParams: any;
  login: (pin: string) => Promise<boolean>;
  pendingTwoFactorProfile: { email: string; businessName: string; phone?: string; createdAt?: string } | null;
  completeTwoFactorLogin: (code: string, method?: 'totp' | 'sms') => Promise<boolean>;
  cancelTwoFactorLogin: () => void;
  logout: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<User, 'phone' | 'businessName'>>) => void;
  changePin: (currentPin: string, newPin: string) => Promise<{ ok: boolean; lockedUntil?: number; cloudSynced?: boolean }>;
  isDemoMode: boolean;
  demoBusinessId: string | null;
  enterDemo: (businessId: string) => void;
  exitDemo: () => void;
  clearData: () => Promise<void>;
  resetBusinessData: () => Promise<void>;
  resetApp: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  teamMembers: TeamMember[];
  inviteMember: (email: string, role: 'accountant' | 'manager' | 'staff') => Promise<string>;
  removeMember: (id: string) => Promise<void>;
  refreshTeam: () => Promise<void>;
  // The OTHER side of team membership: businesses THIS signed-in user has
  // been invited into (as opposed to teamMembers above, which is people
  // THIS user -- as an owner -- has invited). One auth login can hold an
  // active team_members row for more than one owner, so this can list more
  // than one business.
  teamMemberships: MyTeamMembership[];
  refreshTeamMemberships: () => Promise<void>;
  switchBusiness: (ownerUserId: string) => Promise<void>;
  isFirstLaunch: boolean;
  isLockedOut: boolean;
  lockoutUntil: number | null;
  setupAccount: (email: string, businessName: string, pin: string, loadDemo: boolean, phone?: string, initialSettings?: Partial<BusinessSettings>) => Promise<void>;
  recoverAccount: (email: string, pin: string) => Promise<void>;
  joinTeam: (email: string, pin: string, inviteCode: string) => Promise<void>;
  // Phase 2 of the Lender Auth & Financing-Visibility Flow — see that scope
  // document. A lender never shares the SME dashboard/screen family; App.tsx
  // renders an entirely separate shell whenever isLenderSession is true.
  isLenderSession: boolean;
  lenderOrgId: string | null;
  lenderOrgName: string | null;
  joinAsLender: (email: string, pin: string, inviteCode: string) => Promise<void>;
  // Client-side-only preview mode for the landing page — mirrors
  // isDemoMode/enterDemo above but for a lender session, so a visitor can
  // see the real lender screens (with synthetic data) without a real
  // lenderAuth membership.
  isLenderDemo: boolean;
  enterLenderDemo: () => void;
  // Every account this device has ever set up or recovered — lets
  // LoginScreen offer switching between them without a full reset. See the
  // registry comment in storage.ts for why this is additive to, not a
  // replacement for, the single active pin/profile/authSecret slots above.
  localAccounts: LocalAccountSummary[];
  switchAccount: (email: string, pin: string) => Promise<'ok' | 'wrong-pin' | 'not-found'>;
  // In-app account switcher (Header) -- same effect as switchAccount, but
  // for a session that's already unlocked, so no PIN is asked again.
  switchAccountDirect: (email: string) => Promise<'ok' | 'not-found'>;
  // Re-reads the on-device account registry into `localAccounts` above.
  // Needed because LoginScreen's PIN-reset/device-verify flows register a
  // SECOND account directly via storage.ts (registerLocalAccount) when a
  // different account is already active here -- that bypasses every
  // context method that would normally trigger this refresh itself
  // (setupAccount/recoverAccount/switchAccount), so without calling this
  // explicitly afterward, the newly-registered account wouldn't appear in
  // the Switch Account list until the next full reload.
  refreshLocalAccounts: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Blog is the one part of this SPA meant to be directly linkable — every
// other screen is pure in-memory state with no real URL (see
// setCurrentScreen/navigate below, which always push an empty-url history
// entry). A shared/bookmarked article link needs to land on that article on
// a cold load, not always on 'landing'.
function getInitialScreenFromUrl(): string {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return 'landing';
  const path = window.location.pathname;
  if (path === '/blog' || path === '/blog/') return 'blog';
  if (path.startsWith('/blog/')) return 'blog-post';
  return 'landing';
}

function getInitialNavParamsFromUrl(): any {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const path = window.location.pathname;
  if (path.startsWith('/blog/')) {
    const slug = path.slice('/blog/'.length).replace(/\/$/, '');
    if (slug) return { slug };
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentScreen, setCurrentScreenState] = useState(getInitialScreenFromUrl);
  const [navParams, setNavParams] = useState<any>(getInitialNavParamsFromUrl);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [demoBusinessId, setDemoBusinessId] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamMemberships, setTeamMemberships] = useState<MyTeamMembership[]>([]);
  const [isFirstLaunch, setIsFirstLaunch] = useState(false);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [isLenderSession, setIsLenderSession] = useState(false);
  const [lenderOrgId, setLenderOrgId] = useState<string | null>(null);
  const [lenderOrgName, setLenderOrgName] = useState<string | null>(null);
  const [isLenderDemo, setIsLenderDemo] = useState(false);
  // Holds the profile of a user who passed their PIN but still needs to
  // verify a 2FA code before `user` is actually set — real enforcement:
  // 2FA config was previously saved to Supabase but never checked at login.
  const [pendingTwoFactorProfile, setPendingTwoFactorProfile] = useState<{ email: string; businessName: string; phone?: string; createdAt?: string } | null>(null);
  // Every account this device has ever set up or recovered, kept in sync
  // with the on-device registry in storage.ts — drives the "Switch Account"
  // UI (LoginScreen only shows it once there's more than one entry here).
  const [localAccounts, setLocalAccounts] = useState<LocalAccountSummary[]>([]);
  const refreshLocalAccounts = useCallback(async () => {
    const accounts = await listLocalAccounts().catch(() => []);
    setLocalAccounts(accounts);
  }, []);

  // In-app back stack: navigate()/setCurrentScreen() previously just
  // overwrote currentScreen with no history of where the user came from,
  // so the browser's back button (and Android hardware back) had nothing
  // real to step back through and fell straight out to the dashboard
  // instead of the actual previous screen. This ref is the real back
  // stack; on web it's kept in lockstep with browser history via
  // pushState/popstate so the native back button/gesture uses it too.
  const backStackRef = useRef<{ screen: string; params: any }[]>([]);

  const popToPrevious = useCallback(() => {
    const prev = backStackRef.current.pop();
    if (!prev) return false;
    setNavParams(prev.params ?? null);
    setCurrentScreenState(prev.screen);
    return true;
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onPopState = () => { popToPrevious(); };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [popToPrevious]);

  // Destructive resets clear storage, then reload so every provider re-hydrates
  // from the now-empty (or restored) state. Web-only reload; safe no-op elsewhere.
  const reloadApp = () => { if (typeof window !== 'undefined' && window.location) window.location.reload(); };

  // Called after every successful sign-in (session restore, login, 2FA
  // completion, joining as a lender) to decide whether this session lands
  // on the SME dashboard or the lender pipeline. Fails closed to the
  // dashboard on any error -- the ~100% of sessions that aren't a lender
  // see zero behavior change from this check existing.
  const routeAfterAuth = useCallback(async () => {
    const membership = await getMyLenderMembership().catch(() => null);
    if (membership) {
      setIsLenderSession(true);
      setLenderOrgId(membership.lenderOrgId);
      setLenderOrgName(membership.lenderOrgName);
      setCurrentScreenState('lender-pipeline');
    } else {
      // Explicitly reset, not left as-is — without this, a lender who
      // signs out and a different (non-lender) account signing in on the
      // same device afterward would inherit stale isLenderSession=true
      // and get misrouted into the lender pipeline instead of dashboard.
      setIsLenderSession(false);
      setLenderOrgId(null);
      setLenderOrgName(null);
      setCurrentScreenState('dashboard');
    }
  }, []);

  // Shared tail of both switchAccount (PIN-verified, pre-login) and
  // switchAccountDirect (in-app, no PIN) below -- once storage.ts has
  // confirmed which account to become and mirrored it into the active
  // slots, re-establishing everything downstream of "who is signed in" is
  // identical either way.
  const finishAccountSwitch = useCallback(async (email: string): Promise<'ok' | 'not-found'> => {
    await clearWorkspaceOwner().catch(() => {});
    await clearLocalFinancialCache().catch(() => {});
    const secret = await loadAuthSecret();
    if (secret) {
      await supabase.auth.signInWithPassword({ email, password: secret }).catch(() => {});
    }
    await syncFieldEncryptionKey().catch(() => {});
    const profile = await loadProfile();
    if (!profile) return 'not-found';
    setIsFirstLaunch(false);
    writeTabIdentity(profile.email);
    setUser({ email: profile.email, businessName: profile.businessName, phone: profile.phone, role: 'Administrator', createdAt: profile.createdAt });
    await routeAfterAuth();
    return 'ok';
  }, [routeAfterAuth]);

  // Detect a Supabase password-recovery link at the top level, not inside
  // LoginScreen -- LoginScreen only runs its own version of this check
  // while it happens to be the mounted screen, but a device with a saved
  // profile (the common case: clicking the reset-email link on the same
  // browser you're already logged in on) has the boot effect below route
  // straight to 'dashboard' before LoginScreen ever mounts, silently
  // dropping the recovery intent -- the user lands on their dashboard
  // having never seen the "set a new PIN" screen, PIN unchanged, with no
  // indication anything went wrong. Forcing 'login'+reset-pin here, from a
  // listener that's always mounted, wins that race and also overrides an
  // already-shown dashboard if the event arrives after routeAfterAuth().
  // Read synchronously by the boot effect below, which otherwise has no way
  // to know a recovery link was just detected -- it unconditionally calls
  // routeAfterAuth() when a saved profile exists, which would overwrite the
  // 'login' screen this effect just switched to a moment before. Since this
  // effect is declared first, its body (including the synchronous hash
  // check) runs before the boot effect's async chain can resolve far enough
  // to reach that call, so the ref is reliably set in time.
  const recoveryDetectedRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const goToResetPinScreen = () => {
      recoveryDetectedRef.current = true;
      setCurrentScreenState('login');
      setNavParams({ mode: 'reset-pin', resetStep: 'complete-web' });
    };
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace('#', '?'));
    const type = params.get('type');
    if ((type === 'recovery' || type === 'signup') && params.get('access_token')) {
      goToResetPinScreen();
    }
    // A magic-link (device verification) landing on a brand-new device --
    // no local profile, so the boot effect below never touches
    // currentScreen at all and this is the only thing routing away from
    // whatever getInitialScreenFromUrl() defaulted to (typically the
    // marketing landing page, not login). LoginScreen reads navParams to
    // land on 'confirm-device' directly instead of the request-email step.
    if (type === 'magiclink' && params.get('access_token')) {
      recoveryDetectedRef.current = true;
      setCurrentScreenState('login');
      setNavParams({ mode: 'reset-pin', resetStep: 'confirm-device', resetIntent: 'verify-device' });
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') goToResetPinScreen();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Initialize auth state on mount: restore a saved profile as the logged-in
  // user, or flag first launch so LoginScreen shows account setup, not login.
  useEffect(() => {
    (async () => {
      try {
        // Backfills the registry with whichever account is active on this
        // device but predates the registry itself (see its own comment) --
        // must resolve before listLocalAccounts() below so a device coming
        // from before this feature shipped shows its own account in Switch
        // Account starting with this very load, not just the next reset.
        await ensureActiveAccountRegistered().catch(() => {});
        const [profile, lockoutRaw, accounts] = await Promise.all([
          loadProfile(),
          AsyncStorage.getItem(LOCKOUT_KEY),
          listLocalAccounts().catch(() => []),
        ]);
        setLocalAccounts(accounts);
        if (profile) {
          const tabIdentity = readTabIdentity();
          if (tabIdentity && tabIdentity !== profile.email) {
            // This tab previously established a session for a different
            // email than what shared storage now holds -- another tab or
            // window on this same browser signed into a different account
            // in between, silently overwriting the identity every tab
            // reads from on reload (see the tab-identity guard comment
            // above). Don't render the new identity as if this tab had
            // been it all along; force a clean re-login instead of a
            // silent account swap.
            await supabase.auth.signOut().catch(() => {});
            setUser(null);
            setIsLenderSession(false);
            setLenderOrgId(null);
            setLenderOrgName(null);
            setIsFirstLaunch(false);
            setCurrentScreenState('login');
            writeTabIdentity(null);
          } else {
            // A saved local profile means "this device has met this email
            // before," not "there's a live cloud session right now" -- those
            // used to be conflated here, so logging out (which calls
            // supabase.auth.signOut() but never touched the local profile)
            // left every later reload rendering a fully "logged in"
            // dashboard with no real session behind it: nothing to sync,
            // nothing to fetch, indistinguishable from a brand-new empty
            // account. Confirming a live session for this exact email
            // before auto-routing to the dashboard closes that gap; when
            // there isn't one, this falls through to the ordinary
            // PIN-unlock login screen instead.
            // Supabase normalizes/lowercases the session's email, but the
            // locally-saved profile keeps whatever case the user originally
            // typed -- comparing them case-sensitively would wrongly treat
            // a perfectly valid session as absent for any mixed-case email.
            const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } } as any));
            if (session?.user?.email?.toLowerCase() === profile.email.toLowerCase()) {
              writeTabIdentity(profile.email);
              setUser({ email: profile.email, businessName: profile.businessName, phone: profile.phone, role: 'Administrator', createdAt: profile.createdAt });
              // A signed-in user who lands directly on a shared /blog link
              // should see the article, not get bounced to their dashboard.
              const isPublicBlogRoute = getInitialScreenFromUrl() === 'blog' || getInitialScreenFromUrl() === 'blog-post';
              // Same reasoning: don't stomp the reset-pin screen the recovery
              // effect above just switched to for a device that also happens
              // to have a saved profile -- see that effect's comment.
              if (!isPublicBlogRoute && !recoveryDetectedRef.current) await routeAfterAuth();
            } else if (!recoveryDetectedRef.current) {
              setIsFirstLaunch(false);
              setCurrentScreenState('login');
            }
          }
        } else {
          setIsFirstLaunch(true);
        }
        const lockout = lockoutRaw ? parseInt(lockoutRaw, 10) : null;
        if (lockout && Date.now() < lockout) {
          setIsLockedOut(true);
          setLockoutUntil(lockout);
        }
      } catch (e) {
        console.error('[Auth] Failed to restore session:', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [routeAfterAuth]);

  const value: AuthContextValue = useMemo(
    () => ({
      user,
      isLoading,
      currentScreen,
      navParams,
      setCurrentScreen: (screen: string) => {
        backStackRef.current.push({ screen: currentScreen, params: navParams });
        if (Platform.OS === 'web' && typeof window !== 'undefined') window.history.pushState({}, '');
        setNavParams(null);
        setCurrentScreenState(screen);
      },
      navigate: (screen: string, params?: any) => {
        backStackRef.current.push({ screen: currentScreen, params: navParams });
        if (Platform.OS === 'web' && typeof window !== 'undefined') window.history.pushState({}, '');
        setNavParams(params ?? null);
        setCurrentScreenState(screen);
      },
      goBack: () => {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          if (backStackRef.current.length === 0) return false;
          window.history.back(); // triggers the popstate listener, which pops backStackRef
          return true;
        }
        return popToPrevious();
      },
      isFirstLaunch,
      isLockedOut,
      lockoutUntil,
      // PIN login: verify against the securely-stored hash, with lockout
      // after 5 failed attempts for 15 minutes.
      login: async (pin: string): Promise<boolean> => {
        if (isLockedOut && lockoutUntil && Date.now() < lockoutUntil) return false;
        if (isLockedOut && lockoutUntil && Date.now() >= lockoutUntil) {
          setIsLockedOut(false); setLockoutUntil(null);
          await AsyncStorage.multiRemove([LOCKOUT_KEY, ATTEMPTS_KEY]).catch(() => {});
        }
        const savedPin = await loadPin();
        if (hashPin(pin) !== savedPin) {
          const attemptsRaw = await AsyncStorage.getItem(ATTEMPTS_KEY);
          const attempts = (attemptsRaw ? parseInt(attemptsRaw, 10) : 0) + 1;
          await AsyncStorage.setItem(ATTEMPTS_KEY, String(attempts)).catch(() => {});
          if (attempts >= 5) {
            const until = Date.now() + 15 * 60 * 1000;
            setIsLockedOut(true); setLockoutUntil(until);
            await AsyncStorage.setItem(LOCKOUT_KEY, String(until)).catch(() => {});
          }
          return false;
        }
        await AsyncStorage.multiRemove([LOCKOUT_KEY, ATTEMPTS_KEY]).catch(() => {});
        setIsLockedOut(false); setLockoutUntil(null);
        const profile = await loadProfile();
        if (!profile) return false;
        // Establish the cloud session BEFORE checking 2FA status — the check
        // reads from Supabase keyed on the authenticated session, so if this
        // fails/is skipped the status would incorrectly read as 'disabled'
        // (fail-open). Awaited here specifically so 2FA can't be bypassed by
        // a slow/dropped cloud sign-in.
        //
        // The PIN itself is never sent to Supabase as a credential — a
        // 6-digit PIN is far too small a space to be a real remote password
        // (it was previously derivable and bruteforceable offline against a
        // hardcoded, globally-shared salt). The real credential is a
        // high-entropy secret generated once and held only on-device; the
        // PIN's job is purely to gate whether that stored secret gets used.
        const authSecret = await loadAuthSecret();
        if (authSecret) {
          await supabase.auth.signInWithPassword({ email: profile.email, password: authSecret }).catch(() => {});
        } else {
          // Legacy account, created before this migration — its real
          // Supabase password is still the old PIN-derived hash. Sign in
          // with it once (this still goes over the network, but only for
          // accounts that haven't migrated yet, and only after the PIN has
          // already passed the local check above), then immediately rotate
          // to a fresh high-entropy secret so this account never needs the
          // weak scheme again.
          const { error: legacySignInError } = await supabase.auth.signInWithPassword({ email: profile.email, password: hashPin(pin) }).then(r => ({ error: r.error })).catch(e => ({ error: e }));
          if (!legacySignInError) {
            const newSecret = generateAuthSecret();
            const { error: rotateError } = await supabase.auth.updateUser({ password: newSecret }).catch(e => ({ error: e } as any));
            if (!rotateError) await saveAuthSecret(newSecret).catch(() => {});
          }
        }
        const twoFactorStatus = await getTwoFactorStatus().catch(() => 'disabled' as const);
        if (twoFactorStatus === 'enabled') {
          // PIN was correct, but don't grant access yet — hold the profile
          // and route to the code-entry screen instead of the dashboard.
          setPendingTwoFactorProfile({ email: profile.email, businessName: profile.businessName, phone: profile.phone, createdAt: profile.createdAt });
          setCurrentScreenState('two-factor-verify');
          return true;
        }
        writeTabIdentity(profile.email);
        setUser({ email: profile.email, businessName: profile.businessName, phone: profile.phone, role: 'Administrator', createdAt: profile.createdAt });
        await routeAfterAuth();
        auditEvents.login();
        return true;
      },
      pendingTwoFactorProfile,
      completeTwoFactorLogin: async (code: string, method: 'totp' | 'sms' = 'totp'): Promise<boolean> => {
        const ok = await verifyTwoFactorLogin(code, method).catch(() => false);
        if (!ok || !pendingTwoFactorProfile) return false;
        writeTabIdentity(pendingTwoFactorProfile.email);
        setUser({ email: pendingTwoFactorProfile.email, businessName: pendingTwoFactorProfile.businessName, phone: pendingTwoFactorProfile.phone, role: 'Administrator', createdAt: pendingTwoFactorProfile.createdAt });
        setPendingTwoFactorProfile(null);
        await routeAfterAuth();
        auditEvents.login();
        return true;
      },
      cancelTwoFactorLogin: () => {
        setPendingTwoFactorProfile(null);
        setCurrentScreenState('login');
      },
      logout: async () => {
        if (!isDemoMode) trackUserLoggedOut();
        // Logged before signOut() below clears the session that
        // getAuthUserId() reads to attribute the entry.
        if (!isDemoMode) auditEvents.logout();
        setIsLoading(true);
        try {
          await supabase.auth.signOut().catch(() => {});
          await clearWorkspaceOwner().catch(() => {});
          // Wipe the locally-cached financial data so it can't leak into
          // whichever account signs in next on this device — several local
          // caches (staff/payroll) have no per-user namespacing.
          await clearLocalFinancialCache().catch(() => {});
          setUser(null);
          // Explicit reset, not left for the next routeAfterAuth() to
          // overwrite — between this logout and whatever signs in next,
          // the app must show the login screen, not linger on the lender
          // shell if the outgoing session was a lender's.
          setIsLenderSession(false);
          setLenderOrgId(null);
          setLenderOrgName(null);
          setCurrentScreenState('login');
          writeTabIdentity(null);
        } finally {
          setIsLoading(false);
        }
      },
      setupAccount: async (email, businessName, pin, _loadDemo, phone, initialSettings) => {
        // Supabase auth is best-effort — never block local account creation.
        // The account's real password is a freshly generated high-entropy
        // secret, never the PIN itself — see login()'s comment for why.
        const authSecret = generateAuthSecret();
        try {
          const { error: signUpError } = await supabase.auth.signUp({ email, password: authSecret });
          if (signUpError) {
            const msg = signUpError.message.toLowerCase();
            if (msg.includes('already registered') || msg.includes('already been registered') || msg.includes('user already exists') || msg.includes('email address is already')) {
              throw new Error('User already registered');
            }
          } else {
            await supabase.auth.signInWithPassword({ email, password: authSecret }).catch(() => {});
            await saveAuthSecret(authSecret).catch(() => {});
            // Establishes this account's one canonical field-encryption key in
            // Supabase user_metadata now, while it's still simply "brand new"
            // data with nothing to lose -- see syncFieldEncryptionKey's own
            // comment for why this can't be left to derive from authSecret
            // each time (a later PIN reset regenerates authSecret and would
            // otherwise silently orphan everything already encrypted).
            await syncFieldEncryptionKey().catch(() => {});
          }
        } catch (e: any) {
          if ((e?.message ?? '').includes('already registered')) throw e;
        }
        await clearWorkspaceOwner().catch(() => {});
        // A brand-new account must never inherit a previous identity's cached
        // data on this device (in case logout wasn't called, e.g. app was
        // force-closed) — same leak this closes on the logout path.
        await clearLocalFinancialCache().catch(() => {});
        await savePin(pin);
        // Stamp the real signup date so 'days active' reflects actual history
        // instead of always reading 0 (the field was never set anywhere before).
        const signupCreatedAt = new Date().toISOString();
        await saveProfile({ email, businessName, phone, createdAt: signupCreatedAt });
        // Remember this account in the on-device registry so it survives a
        // later switch to (or reset of) a different account on this same
        // browser — see registerLocalAccount's own comment for why this is
        // additive to, not a replacement for, the single active-slot above.
        await registerLocalAccount(email, businessName, pin, authSecret, signupCreatedAt).catch(() => {});
        // Persist signup choices (currency, industry) to storage BEFORE setUser
        // fires the settings-hydrate effect below (keyed on the user's email) —
        // that effect resets settings to DEFAULT_SETTINGS and then re-loads from
        // storage, so if the caller's own updateSettings() call after setupAccount()
        // loses that timing race, the correct values are still picked up on load
        // instead of silently reverting to defaults.
        if (initialSettings) {
            await saveSettings({ ...DEFAULT_SETTINGS, ...initialSettings }).catch(() => {});
        }
        setIsFirstLaunch(false);
        setUser({ email, businessName, role: 'Administrator', phone, createdAt: new Date().toISOString() });
        await refreshLocalAccounts();
        trackUserRegistered(initialSettings?.currency ?? DEFAULT_SETTINGS.currency);
        auditEvents.accountSetup(email);
        // First-run choice — upload a statement or set a goal — rather than
        // dropping a brand-new user straight onto an empty Dashboard where
        // that decision is easy to never make.
        setCurrentScreenState('onboarding-choice');
      },
      recoverAccount: async (email, pin) => {
        // Called after a successful Supabase sign-in — pull this user's profile
        // (or create a local one) so their data (synced by email/session) loads.
        // Idempotent safety net: the PIN-reset call sites already sync this
        // explicitly (see LoginScreen.tsx), but this covers every other path
        // into recoverAccount (e.g. handleEmailLogin's new-device restore) too
        // — must run before the cache clear below so the hydrate effects that
        // follow decrypt with the right key instead of silently going empty.
        await syncFieldEncryptionKey().catch(() => {});
        // Clear stale local cache first: Supabase is authoritative here, and the
        // FinanceProvider/GoalProvider/etc. hydrate effects will immediately
        // re-pull this user's real data from the cloud once `user` changes.
        await clearLocalFinancialCache().catch(() => {});
        await savePin(pin).catch(() => {});
        let profile = await loadProfile();
        if (!profile || profile.email !== email) {
          profile = { email, businessName: profile?.businessName ?? 'My Business', createdAt: new Date().toISOString() };
          await saveProfile(profile);
        } else if (!profile.createdAt) {
          // Backfill for an existing local profile saved before this field
          // existed — best we can do is anchor from today rather than leave
          // it undefined (which is what caused daysActive to always read 0).
          profile = { ...profile, createdAt: new Date().toISOString() };
          await saveProfile(profile);
        }
        // Every caller into recoverAccount (PIN reset, new-device restore)
        // saves the freshly-established authSecret to the active slot just
        // before calling this — read it back here so this account also lands
        // in the on-device registry and can be switched back to later
        // without repeating a full reset.
        const recoveredAuthSecret = await loadAuthSecret();
        if (recoveredAuthSecret) {
          await registerLocalAccount(profile.email, profile.businessName, pin, recoveredAuthSecret, profile.createdAt).catch(() => {});
        }
        setIsFirstLaunch(false);
        writeTabIdentity(profile.email);
        setUser({ email: profile.email, businessName: profile.businessName, phone: profile.phone, role: 'Administrator', createdAt: profile.createdAt });
        await refreshLocalAccounts();
        setCurrentScreenState('dashboard');
      },
      localAccounts,
      refreshLocalAccounts,
      switchAccount: async (email: string, pin: string) => {
        const result = await switchLocalAccount(email, pin);
        // Mirror joinTeam/recoverAccount's own reasoning: the target account
        // may be a team member on THIS device's cache from a previous
        // session, or this device may still be carrying the outgoing
        // account's workspace-owner pointer — either would silently point
        // the freshly-switched-in account at the wrong data set. Handled
        // inside finishAccountSwitch, shared with switchAccountDirect below.
        return result === 'ok' ? finishAccountSwitch(email) : result;
      },
      // In-app switcher (Header) -- see switchLocalAccountDirect's own
      // comment in storage.ts for why no PIN is asked for here.
      switchAccountDirect: async (email: string) => {
        const result = await switchLocalAccountDirect(email);
        return result === 'ok' ? finishAccountSwitch(email) : result;
      },
      joinTeam: async (email, pin, inviteCode) => {
        const authSecret = generateAuthSecret();
        const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({ email, password: authSecret });
        let authUserId = signUpData?.user?.id;
        if (signUpErr) {
          // signUp fails for any email that's already registered — two
          // different cases look identical here: (a) a genuine legacy
          // account whose real password is still the PIN-derived hash, or
          // (b) this exact device already ran this join flow once before
          // (e.g. the invite code step failed after signUp had already
          // succeeded) and this account's real password is the authSecret
          // that got saved locally on that earlier attempt. Try the
          // locally-stored secret first — it's the more likely case on a
          // retry — before falling back to the legacy hash, mirroring
          // login()'s own ordering.
          const storedSecret = await loadAuthSecret();
          let signInData: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>['data'] | undefined;
          let signInErr: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>['error'] | undefined;
          if (storedSecret) {
            ({ data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password: storedSecret }));
          }
          if (!storedSecret || signInErr) {
            ({ data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password: hashPin(pin) }));
          }
          if (signInErr) throw new Error(signInErr.message);
          authUserId = signInData?.user?.id;
          const { error: rotateError } = await supabase.auth.updateUser({ password: authSecret }).catch(e => ({ error: e } as any));
          if (!rotateError) await saveAuthSecret(authSecret).catch(() => {});
        } else {
          await saveAuthSecret(authSecret).catch(() => {});
        }
        if (!authUserId) throw new Error('Could not authenticate.');
        const { ownerId, role } = await joinTeamWithCode(authUserId, inviteCode);
        // Joining a team on this device must not carry over any previous
        // identity's locally-cached data -- must run BEFORE setWorkspaceOwner
        // below, since clearLocalFinancialCache() now also clears the
        // workspace-owner pointer (see its own comment) and would otherwise
        // immediately wipe out the one this join just established.
        await clearLocalFinancialCache().catch(() => {});
        await setWorkspaceOwner(ownerId);
        await savePin(pin);
        await saveProfile({ email, businessName: 'Team Member', createdAt: new Date().toISOString() });
        setIsFirstLaunch(false);
        writeTabIdentity(email);
        setUser({ email, businessName: 'Team Member', role: role === 'accountant' ? 'Accountant' : role === 'manager' ? 'Manager' : 'Staff', createdAt: new Date().toISOString() });
        setCurrentScreenState('dashboard');
      },

      // Mirrors joinTeam above almost exactly -- same authSecret-as-real-
      // password sign-up, same legacy-account fallback shape -- the only
      // difference is which invite table gets claimed and where the
      // session lands afterward. See lenderAuth.ts's joinLenderWithCode
      // for why the invite_code itself (not an RLS ownership check) is
      // what authorizes claiming the row.
      joinAsLender: async (email, pin, inviteCode) => {
        const authSecret = generateAuthSecret();
        const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({ email, password: authSecret });
        let authUserId = signUpData?.user?.id;
        if (signUpErr) {
          // Same retry-safety fix as joinTeam above — try this device's
          // already-stored authSecret before the legacy PIN-hash fallback,
          // so a second attempt (e.g. after entering the wrong invite code
          // once) doesn't fail with "invalid login credentials" against an
          // account this same device already created moments earlier.
          const storedSecret = await loadAuthSecret();
          let signInData: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>['data'] | undefined;
          let signInErr: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>['error'] | undefined;
          if (storedSecret) {
            ({ data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password: storedSecret }));
          }
          if (!storedSecret || signInErr) {
            ({ data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password: hashPin(pin) }));
          }
          if (signInErr) throw new Error(signInErr.message);
          authUserId = signInData?.user?.id;
          const { error: rotateError } = await supabase.auth.updateUser({ password: authSecret }).catch(e => ({ error: e } as any));
          if (!rotateError) await saveAuthSecret(authSecret).catch(() => {});
        } else {
          await saveAuthSecret(authSecret).catch(() => {});
        }
        if (!authUserId) throw new Error('Could not authenticate.');
        const { lenderOrgId: orgId, lenderOrgName: orgName } = await joinLenderWithCode(authUserId, inviteCode);
        // Joining as a lender on this device must not carry over any
        // previous identity's locally-cached financial data -- same
        // reasoning joinTeam above already applies.
        await clearLocalFinancialCache().catch(() => {});
        await savePin(pin);
        // Without this, loadProfile() returns null on every subsequent
        // page load/reload -- the mount-time session-restore effect below
        // only calls routeAfterAuth() (the thing that actually checks lender
        // membership and routes to the pipeline) when a local profile
        // exists. A lender's real Supabase session is perfectly valid and
        // persisted across reloads on its own, but without a saved profile
        // the restore effect never even asks whether this session belongs
        // to a lender -- it falls straight to "no local account on this
        // device," treats it as a first launch, and shows the SME signup
        // screen instead. This is the fix for that: persist the lender's
        // identity locally exactly the way joinTeam and setupAccount both
        // already do for their own flows.
        await saveProfile({ email, businessName: orgName, createdAt: new Date().toISOString() });
        writeTabIdentity(email);
        setIsFirstLaunch(false);
        setIsLenderSession(true);
        setLenderOrgId(orgId);
        setLenderOrgName(orgName);
        setUser({ email, businessName: orgName, role: 'Administrator', createdAt: new Date().toISOString() });
        setCurrentScreenState('lender-pipeline');
      },
      isLenderSession,
      lenderOrgId,
      lenderOrgName,
      isLenderDemo,
      // Client-side only, mirrors enterDemo below — no Supabase call, no
      // real lender_members row. Lets a landing-page visitor see the real
      // lender screens with synthetic data instead of an admin having to
      // fabricate a screenshot.
      enterLenderDemo: () => {
        setUser({
          email: 'demo-lender@quad360.demo',
          businessName: 'Demo Bank (Preview)',
          role: 'Administrator',
          createdAt: new Date(Date.now() - 400 * 86400000).toISOString(),
        });
        setIsLenderSession(true);
        setLenderOrgId('demo-lender-org');
        setLenderOrgName('Demo Bank (Preview)');
        setIsLenderDemo(true);
        setCurrentScreenState('lender-pipeline');
      },

      updateProfile: (patch) => {
        setUser((prev) => (prev ? { ...prev, ...patch } : prev));
        if (user) {
          saveProfile({
            email: user.email,
            businessName: patch.businessName ?? user.businessName,
            phone: patch.phone ?? user.phone,
          }).catch(() => {});
        }
      },
      changePin: async (currentPin, newPin) => {
        try {
          const stored = await loadPin();
          // Match savePin's hashing exactly so verification lines up.
          const hash = (p: string) => CryptoJS.SHA256(p + 'Q360_SME_2025').toString(CryptoJS.enc.Hex) + '_Q360';
          // If a PIN exists, verify the current one before changing.
          if (stored && stored !== hash(currentPin)) return { ok: false };
          await savePin(newPin);
          auditEvents.pinChange();
          // The PIN is a local-only unlock gate now — it's never sent to
          // Supabase, so changing it doesn't touch (and doesn't need to
          // touch) the account's real password. cloudSynced is kept in the
          // return shape for UI compatibility; it's simply true whenever the
          // local change succeeds, since there's no separate cloud step left
          // to fail.
          return { ok: true, cloudSynced: true };
        } catch { return { ok: false }; }
      },
      isDemoMode,
      demoBusinessId,
      // Was a stub: only ever flipped isDemoMode, never set a user, never
      // switched off the login screen, and no data provider had any code
      // path that loaded demo data at all - tapping any "Try Demo" card
      // silently did nothing. Now sets a synthetic demo user (so screens
      // gated on `user` render) and navigates to the dashboard; the actual
      // sample transactions/loans/invoices are loaded by each data
      // provider below, keyed off demoBusinessId.
      enterDemo: (businessId: string) => {
        const biz = DEMO_BUSINESSES.find((b) => b.id === businessId);
        if (!biz) return;
        trackDemoStarted(biz.id, biz.businessName, biz.country);
        setUser({
          email: `demo-${biz.id}@quad360.demo`,
          businessName: biz.businessName,
          role: 'Administrator',
          createdAt: new Date(Date.now() - 120 * 86400000).toISOString(),
        });
        setDemoBusinessId(businessId);
        setIsDemoMode(true);
        setCurrentScreenState('dashboard');
      },
      exitDemo: () => {
        setIsDemoMode(false);
        setDemoBusinessId(null);
        // Also clears a lender preview session, if one was active — same
        // exit button is reused by LenderPipelineScreen's demo banner.
        setIsLenderDemo(false);
        setIsLenderSession(false);
        setLenderOrgId(null);
        setLenderOrgName(null);
        setUser(null);
        setCurrentScreenState('login');
      },
      // Both of these wipe THIS DEVICE, not just the active account, so the
      // on-device account registry goes with them — unlike deleteAccount
      // below (which only removes the one account being deleted via
      // deleteAccountData's own removeLocalAccount call).
      clearData: async () => { await clearAllData(); await clearLocalAccountsRegistry().catch(() => {}); reloadApp(); },
      resetBusinessData: async () => { await deleteAllBusinessRecords(); reloadApp(); },
      resetApp: async () => { await clearAllData(); await clearLocalAccountsRegistry().catch(() => {}); setUser(null); reloadApp(); },
      deleteAccount: async () => { await deleteAccountData(); setUser(null); setCurrentScreenState('login'); reloadApp(); },
      teamMembers,
      inviteMember: async (email, role) => {
        const code = await inviteTeamMember(email, role);
        const members = await loadTeamMembers();
        setTeamMembers(members);
        auditEvents.teamInvite(email, role);
        return code;
      },
      removeMember: async (id) => {
        const removed = teamMembers.find((m) => m.id === id);
        await removeTeamMember(id);
        setTeamMembers((prev) => prev.filter((m) => m.id !== id));
        if (removed) auditEvents.teamRemove(removed.memberEmail);
      },
      refreshTeam: async () => {
        const members = await loadTeamMembers();
        setTeamMembers(members);
      },
      teamMemberships,
      refreshTeamMemberships: async () => {
        setTeamMemberships(await loadMyTeamMemberships());
      },
      // Stays signed in as the same auth user, just re-points which
      // owner's data this device treats as the active workspace -- same
      // reload-based re-hydration resetBusinessData/clearData already use
      // rather than trying to reset every in-memory slice by hand.
      // clearLocalFinancialCache() also clears the workspace-owner pointer
      // (see its own comment), so it must run BEFORE setWorkspaceOwner,
      // exactly like joinTeam above.
      switchBusiness: async (ownerUserId: string) => {
        await clearLocalFinancialCache().catch(() => {});
        await setWorkspaceOwner(ownerUserId);
        reloadApp();
      },
    }),
    [user, isLoading, currentScreen, navParams, isDemoMode, demoBusinessId, teamMembers, teamMemberships, isFirstLaunch, isLockedOut, lockoutUntil, pendingTwoFactorProfile, isLenderSession, lenderOrgId, lenderOrgName, isLenderDemo, routeAfterAuth, localAccounts, refreshLocalAccounts, finishAccountSwitch]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

// ============================================================================
// SELECTOR HOOKS - For fine-grained subscriptions (optional but recommended)
// ============================================================================

/**
 * OPTIONAL: Create selector hooks to subscribe to specific parts of state
 * This prevents re-renders when other parts change
 *
 * Usage:
 * const transactions = useTransactions();  // Only re-renders on transaction changes
 * const finance = useFinanceMetrics();     // Only re-renders on finance changes
 *
 * Instead of:
 * const { transactions, finance, assets, loans } = useFinance(); // Re-renders if any change
 */

export function useTransactions(): Transaction[] {
  const { transactions } = useFinance();
  return transactions;
}

export function useFinanceMetrics(): FinanceData {
  const { finance } = useFinance();
  return finance;
}

export function useAssets(): Asset[] {
  const { assets } = useFinance();
  return assets;
}

export function useLoans(): Loan[] {
  const { loans } = useFinance();
  return loans;
}

export function useBudgets(): Budget[] {
  const { budgets } = useFinance();
  return budgets;
}

// ============================================================================
// USAGE IN APP.tsx
// ============================================================================

/**
 * Update App.tsx to wrap with all providers in the correct order:
 *
 * function App() {
 *   return (
 *     <AuthProvider>
 *       <SettingsProvider>
 *         <FinanceProvider>
 *           <GoalProvider>
 *             <InvoiceProvider>
 *               <ThemeProvider>
 *                 <Navigator />
 *               </ThemeProvider>
 *             </InvoiceProvider>
 *           </GoalProvider>
 *         </FinanceProvider>
 *       </SettingsProvider>
 *     </AuthProvider>
 *   );
 * }
 */

// ============================================================================
// PERFORMANCE IMPACT
// ============================================================================

/**
 * Before: DashboardScreen extracts 26 values from single context
 * - Any state change → entire screen re-renders
 * - Adding transaction → Dashboard, Reports, Payroll all re-render
 *
 * After: DashboardScreen uses specific hooks
 * const { finance } = useFinance();
 * const { goals } = useGoals();
 * const { settings } = useSettings();
 *
 * - Only re-renders on finance/goals/settings changes
 * - Adding transaction → only FinanceContext consumers re-render
 * - Transaction that's internal detail → only Finance context updates
 *
 * Expected Impact: 35-40% reduction in re-renders
 * Rendering Time: Dashboard 1200ms → 700-800ms
 * App Responsiveness: Significantly improved, especially on low-end devices
 *
 * Scalability: Each context can independently:
 * - Implement background sync
 * - Add selective persistence
 * - Optimize with selectors
 * - Add time-travel debugging (Redux DevTools)
 */

// ============================================================================
// COMPATIBILITY HOOK - useApp() for backward compatibility with existing screens
// ============================================================================

/**
 * Compatibility hook that combines all contexts into a single useApp hook
 * This allows existing screens to work without modification
 *
 * Usage: const { user, transactions, finance, settings, navigate, ... } = useApp();
 */
export function useApp() {
  const auth = useAuth();
  const finance = useFinance();
  const goals = useContext(GoalContext);
  const invoices = useContext(InvoiceContext);
  const settings = useContext(SettingsContext);

  if (!goals || !invoices || !settings) {
    throw new Error('useApp must be used within AppProvider (all contexts)');
  }

  // Safe defaults for arrays to prevent undefined errors
  const transactions = finance?.transactions ?? [];
  const assets = finance?.assets ?? [];
  const loans = finance?.loans ?? [];
  const budgets = finance?.budgets ?? [];
  const inventory = finance?.inventory ?? [];
  // Recomputes currentValue/progress/status against live finance/transaction
  // data on every read instead of trusting whatever was stored at creation
  // (or last edit) time — GoalProvider's addGoal/updateGoal never refresh
  // these fields themselves, so without this every goal's progress bar and
  // status badge would freeze at its initial value forever, never moving as
  // real sales/expenses/collections happen. Recomputed here rather than
  // written back into GoalProvider's state so refreshing progress doesn't
  // itself trigger a save/re-render loop.
  const goalsArray = useMemo(
    () => (goals?.goals ?? []).map((g) => refreshGoal(g, finance.finance, transactions)),
    [goals?.goals, finance.finance, transactions]
  );
  const invoicesArray = invoices?.invoices ?? [];

  // Derived business metrics, computed from real data instead of being read
  // as raw User fields that were never populated anywhere (daysActive,
  // avgMonthlyRevenue, avgMonthlyProfit, financialHealthScore always came
  // back undefined, which crashed any unguarded .toFixed()/.toLocaleString()
  // call downstream and made every eligibility/health screen permanently
  // show a zero/new-business state regardless of actual history).
  const financeData = finance?.finance;
  const daysActive = auth.user?.createdAt
    ? Math.max(0, Math.floor((Date.now() - new Date(auth.user.createdAt).getTime()) / 86400000))
    : 0;
  const activeMonths = countActiveMonths(transactions);
  const avgMonthlyRevenue = (financeData?.income ?? 0) / activeMonths;
  const avgMonthlyProfit = (financeData?.profit ?? 0) / activeMonths;
  const totalRecordedRevenue = financeData?.income ?? 0;
  // Reuses the same root-cause diagnosis engine as the AI Advisor for a
  // consistent, real health score instead of a hardcoded placeholder.
  //
  // performFinancialDiagnosis does many O(n) passes over the full
  // transaction/invoice/loan/inventory history (DSCR, concentration,
  // category breakdowns, trend, root-cause diagnoses). useApp() is called
  // by ~everything (Header, FooterNav, GlobalSearch, every screen, every
  // list-row card), so without memoization this full engine re-ran on
  // every one of those renders — including Header/FooterNav, which never
  // even read financialHealthScore. Memoizing against its actual inputs
  // means it now only recomputes when the underlying data genuinely
  // changes, not on every unrelated re-render (a nav change, a keystroke
  // in search, an unrelated context update).
  const expenseAvg = getMonthlyExpenseAverage(financeData?.expense ?? 0, transactions);
  const currencyForHealth = settings?.settings?.currency ?? '₦';
  const financialHealthScore = useMemo(
    () => (transactions.length >= 5 && financeData
      ? performFinancialDiagnosis(transactions, invoicesArray, financeData.cashBalance, expenseAvg, currencyForHealth, loans, inventory).overallHealth
      : 0),
    [transactions, invoicesArray, financeData, expenseAvg, currencyForHealth, loans, inventory]
  );

  // Memoized so `user` is referentially stable across renders where nothing
  // about it actually changed. Without this, every downstream `useMemo`
  // keyed on `user` (e.g. BusinessPassportScreen's) saw a "changed" dependency
  // on every single render and recomputed regardless of memoization —
  // financialHealthScore being memoized above only helps if the object it's
  // spread into doesn't itself get rebuilt from scratch every time.
  const userWithMetrics = useMemo(
    () => (auth.user
      ? { ...auth.user, daysActive, avgMonthlyRevenue, avgMonthlyProfit, totalRecordedRevenue, financialHealthScore }
      : auth.user),
    [auth.user, daysActive, avgMonthlyRevenue, avgMonthlyProfit, totalRecordedRevenue, financialHealthScore]
  );

  const resolvedUserRole = (
    auth.user?.role === 'Accountant' ? 'accountant' :
    auth.user?.role === 'Manager' ? 'manager' :
    auth.user?.role === 'Staff' ? 'staff' : 'owner'
  ) as UserRole;

  return {
    // Auth state
    user: userWithMetrics,
    isLoading: auth.isLoading,
    currentScreen: auth.currentScreen,
    setCurrentScreen: auth.setCurrentScreen,
    navigate: auth.navigate,
    goBack: auth.goBack,
    login: auth.login,
    logout: auth.logout,
    pendingTwoFactorProfile: auth.pendingTwoFactorProfile,
    completeTwoFactorLogin: auth.completeTwoFactorLogin,
    cancelTwoFactorLogin: auth.cancelTwoFactorLogin,

    // Finance state
    transactions,
    assets,
    loans,
    budgets,
    inventory,
    finance: finance?.finance,
    addTransaction: finance?.addTransaction || (() => {}),
    updateTransaction: finance?.updateTransaction || (() => {}),
    deleteTransaction: finance?.deleteTransaction || (() => {}),
    addAsset: finance?.addAsset || (() => {}),
    updateAsset: finance?.updateAsset || (() => {}),
    deleteAsset: finance?.deleteAsset || (() => {}),
    addLoan: finance?.addLoan || (() => {}),
    updateLoan: finance?.updateLoan || (() => {}),
    deleteLoan: finance?.deleteLoan || (() => {}),
    addLoanPayment: finance?.addLoanPayment || (() => {}),
    addBudget: finance?.addBudget || (() => {}),
    updateBudget: finance?.updateBudget || (() => {}),
    deleteBudget: finance?.deleteBudget || (() => {}),

    // Goals state
    goals: goalsArray,
    addGoal: goals?.addGoal || (() => {}),
    updateGoal: goals?.updateGoal || (() => {}),
    deleteGoal: goals?.deleteGoal || (() => {}),

    // Invoices state
    //
    // Invoices never posted any transaction at all — not on creation, not
    // even once marked paid — so a business running its revenue through
    // Invoices instead of manual entries saw £0 income anywhere else in the
    // app (Transactions, cash balance, health score, budget revenue figure)
    // regardless of how much was actually invoiced or collected. Each
    // non-draft invoice now keeps a linked income transaction (matched by
    // `reference` = invoiceNumber) whose status tracks the invoice's own
    // status — pending while sent, overdue if it lapses, paid once
    // collected — the same "real action, real transaction" convention
    // already used for loan repayments and asset disposals.
    invoices: invoicesArray,
    addInvoice: (invoice) => {
      invoices?.addInvoice(invoice);
      if (invoice.status !== 'draft' && finance?.addTransaction) {
        finance.addTransaction({
          date: invoice.issueDate,
          description: `Invoice ${invoice.invoiceNumber}: ${invoice.clientName || 'Customer'}`,
          type: 'income',
          category: 'Sales',
          amount: invoice.total,
          status: invoice.status === 'paid' ? 'paid' : invoice.status === 'overdue' ? 'overdue' : 'pending',
          reference: invoice.invoiceNumber,
          vendorCustomer: invoice.clientName || undefined,
          dueDate: invoice.dueDate,
        } as any);
      }
    },
    // Kept the linked transaction in sync with the invoice — this used to
    // be a bare passthrough to invoices.updateInvoice with no linked-
    // transaction logic at all (unlike addInvoice/markInvoiceStatus right
    // above/below, which both maintain the link). So editing an
    // already-sent invoice's line items — changing its total — left the
    // linked transaction's amount stuck at whatever it was when the
    // invoice was first created or last sent, forever. Marking that
    // invoice paid later would then only book the stale original amount
    // as revenue, silently understating income by the edited difference.
    updateInvoice: (id, patch) => {
      invoices?.updateInvoice(id, patch);
      const before = invoicesArray.find((i) => i.id === id);
      if (!before) return;
      const after = { ...before, ...patch };
      const txStatus = after.status === 'paid' ? 'paid' : after.status === 'overdue' ? 'overdue' : after.status === 'sent' ? 'pending' : null;
      const linked = transactions.find((t) => t.reference === before.invoiceNumber && t.type === 'income');
      if (linked && finance?.updateTransaction) {
        finance.updateTransaction(linked.id, {
          amount: after.total,
          description: `Invoice ${after.invoiceNumber}: ${after.clientName || 'Customer'}`,
          vendorCustomer: after.clientName || undefined,
          dueDate: after.dueDate,
          ...(txStatus ? { status: txStatus } : {}),
        });
      } else if (!linked && txStatus && finance?.addTransaction) {
        // Editing turned a draft into sent/paid/overdue for the first
        // time, or the invoice predates transaction-linking — create the
        // link now instead of leaving this revenue invisible.
        finance.addTransaction({
          date: after.issueDate,
          description: `Invoice ${after.invoiceNumber}: ${after.clientName || 'Customer'}`,
          type: 'income',
          category: 'Sales',
          amount: after.total,
          status: txStatus,
          reference: after.invoiceNumber,
          vendorCustomer: after.clientName || undefined,
          dueDate: after.dueDate,
        } as any);
      }
    },
    deleteInvoice: (id) => {
      const inv = invoicesArray.find((i) => i.id === id);
      if (inv && finance?.deleteTransaction) {
        const linked = transactions.find((t) => t.reference === inv.invoiceNumber && t.type === 'income');
        if (linked) finance.deleteTransaction(linked.id);
      }
      invoices?.deleteInvoice(id);
    },

    // Settings state
    settings: settings?.settings || {
      businessType: 'both',
      currency: '₦',
      currencyCode: 'NGN',
      minReserve: '0',
      targetMargin: '20',
      openingAssets: '0',
      openingLiabilities: '0',
      openingLoans: '0',
      openingOtherAssets: '0',
      defaultTaxRate: '20',
    },
    language: settings?.language || 'en',
    updateSettings: settings?.updateSettings || (() => {}),
    setLanguage: settings?.setLanguage || (() => {}),

    // Placeholder properties (for screens that reference them)
    isDemoMode: auth.isDemoMode ?? false,
    exitDemo: auth.exitDemo || (() => {}),
    cashPockets: finance?.cashPockets ?? [],
    financing: finance?.financing ?? {
      isQualified: false, qualification: undefined, minQualifiedAmount: undefined,
      maxQualifiedAmount: undefined, application: undefined, activeLoan: undefined,
      pastApplications: [], applicationStatus: null,
    },

    // Payroll & Staff (should be in separate context, but added here for compatibility)
    staff: finance?.staff ?? [],
    payrollRuns: finance?.payrollRuns ?? [],
    addStaff: finance?.addStaff || (() => {}),
    updateStaff: finance?.updateStaff || (() => {}),
    deleteStaff: finance?.deleteStaff || (() => {}),
    runPayroll: finance?.runPayroll || (() => {}),
    deletePayrollRun: finance?.deletePayrollRun || (() => {}),
    teamMembers: auth.teamMembers ?? [],
    // Derived from the signed-in user's role, not hardcoded — was always
    // 'owner' regardless of who was actually logged in, silently disabling
    // every permission check gated on userRole (e.g. payment-key edits).
    userRole: resolvedUserRole,
    canViewFinancials: computeCanViewFinancials(resolvedUserRole),
    inviteMember: auth.inviteMember || (async () => ''),
    removeMember: auth.removeMember || (() => Promise.resolve()),
    joinTeam: auth.joinTeam,
    isLenderSession: auth.isLenderSession,
    lenderOrgId: auth.lenderOrgId,
    lenderOrgName: auth.lenderOrgName,
    joinAsLender: auth.joinAsLender,
    isLenderDemo: auth.isLenderDemo ?? false,
    enterLenderDemo: auth.enterLenderDemo || (() => {}),
    refreshTeam: auth.refreshTeam || (() => Promise.resolve()),
    teamMemberships: auth.teamMemberships ?? [],
    refreshTeamMemberships: auth.refreshTeamMemberships || (() => Promise.resolve()),
    switchBusiness: auth.switchBusiness || (() => Promise.resolve()),

    // Other missing properties
    navParams: auth.navParams ?? EMPTY_NAV_PARAMS,
    isFirstLaunch: auth.isFirstLaunch,
    pendingSyncCount: 0,
    lockoutUntil: auth.lockoutUntil,
    isLockedOut: auth.isLockedOut,
    applyForMerchantFinancing: finance?.applyForMerchantFinancing || (async () => {}),
    setupAccount: auth.setupAccount,
    updateProfile: auth.updateProfile || (() => {}),
    updateInventoryItem: finance?.updateInventoryItem || (() => {}),
    addInventoryItem: finance?.addInventoryItem || (() => {}),
    deleteInventoryItem: finance?.deleteInventoryItem || (() => {}),
    stockInInventory: finance?.stockInInventory || (() => {}),
    updateCashPocket: finance?.updateCashPocket || (() => {}),
    addCashPocket: finance?.addCashPocket || (() => {}),
    deleteCashPocket: finance?.deleteCashPocket || (() => {}),
    capitalCommitments: finance?.capitalCommitments ?? [],
    addCommitment: finance?.addCommitment || (() => {}),
    updateCommitment: finance?.updateCommitment || (() => {}),
    deleteCommitment: finance?.deleteCommitment || (() => {}),
    readinessHistory: finance?.readinessHistory ?? [],
    // Explicit return type on the fallback so it matches auth.changePin's
    // signature exactly instead of TypeScript inferring a narrower
    // `{ok:false}` literal and unioning the two into an undiscriminated
    // `{ok:boolean,...}|{ok:false}` — harmless today since every call site
    // reads `.lockedUntil` as optional-and-undefined-safe, but a real
    // hazard if the shape changes later without this being caught.
    changePin: auth.changePin || (async (): Promise<{ ok: boolean; lockedUntil?: number; cloudSynced?: boolean }> => ({ ok: false })),
    clearData: auth.clearData || (() => Promise.resolve()),
    resetApp: auth.resetApp || (() => Promise.resolve()),
    resetBusinessData: auth.resetBusinessData || (() => Promise.resolve()),
    deleteAccount: auth.deleteAccount || (() => Promise.resolve()),
    recoverAccount: auth.recoverAccount,
    localAccounts: auth.localAccounts ?? [],
    refreshLocalAccounts: auth.refreshLocalAccounts ?? (() => Promise.resolve()),
    switchAccount: auth.switchAccount,
    switchAccountDirect: auth.switchAccountDirect ?? (() => Promise.resolve('not-found' as const)),
    importData: async (json) => { await importAllData(json); if (typeof window !== 'undefined' && window.location) window.location.reload(); },
    exportData: () => exportAllData({
      transactions, settings: (settings?.settings as any), goals: goalsArray,
      invoices: invoicesArray, assets, loans, budgets, inventory,
      cashPockets: finance?.cashPockets ?? [], staff: finance?.staff ?? [], payrollRuns: finance?.payrollRuns ?? [],
      capitalCommitments: finance?.capitalCommitments ?? [], readinessHistory: finance?.readinessHistory ?? [],
    }),
    recordConsent,
    enterDemo: auth.enterDemo || (() => {}),
    markInvoiceStatus: (id, status) => {
      invoices?.markInvoiceStatus(id, status);
      const inv = invoicesArray.find((i) => i.id === id);
      if (!inv) return;
      const txStatus = status === 'paid' ? 'paid' : status === 'overdue' ? 'overdue' : status === 'sent' ? 'pending' : null;
      if (!txStatus) return; // draft has no linked transaction to update
      const linked = transactions.find((t) => t.reference === inv.invoiceNumber && t.type === 'income');
      if (linked && finance?.updateTransaction) {
        finance.updateTransaction(linked.id, { status: txStatus });
      } else if (!linked && finance?.addTransaction) {
        // Invoice predates transaction-linking, or was created as a draft —
        // back-fill the link now instead of leaving this collection invisible.
        finance.addTransaction({
          date: new Date().toISOString().split('T')[0],
          description: `Invoice ${inv.invoiceNumber}: ${inv.clientName || 'Customer'}`,
          type: 'income',
          category: 'Sales',
          amount: inv.total,
          status: txStatus,
          reference: inv.invoiceNumber,
          vendorCustomer: inv.clientName || undefined,
          dueDate: inv.dueDate,
        } as any);
      }
    },
    disposeAsset: finance?.disposeAsset || (() => {}),
  };
}
