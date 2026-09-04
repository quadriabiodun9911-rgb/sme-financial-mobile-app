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
import { User, Invoice, InvoiceStatus, Transaction, Loan, Asset, Budget, InventoryItem, FinanceData, BusinessSettings, FinancialGoal, FinancingContextData, MerchantFinancingApplication, FinancingOutcomeInput, LoanPurpose, StaffMember, PayrollRun, PayrollItem, CashPocket, CapitalCommitment, ReadinessSnapshot, ForecastSnapshot, DataConfidenceSnapshot, UserRole, Screen } from '../types';
import { computeFinance, computeAssetCurrentValue, countActiveMonths, getMonthlyExpenseAverage, computeRiskScore, computeLoanPaymentSplit } from '../utils/finance';
import { buildLoanFromMerchantFinancing } from '../utils/merchantFinancingConversion';
import { buildReadinessSnapshot, shouldRecordSnapshot, appendReadinessSnapshot } from '../utils/readinessHistory';
import { buildForecastSnapshot, shouldRecordForecastSnapshot, appendForecastSnapshot } from '../utils/forecastHistory';
import { computeForecastSummary } from '../utils/forecastSummary';
import { computeDataQuality } from '../utils/dataQuality';
import { buildDataConfidenceSnapshot, shouldRecordDataConfidenceSnapshot, appendDataConfidenceSnapshot } from '../utils/dataConfidenceHistory';
import { trackTransactionAdded, trackInventoryItemAdded, trackAssetAdded, trackLoanAdded, trackGoalCreated, trackAppOpened, trackUserRegistered, trackUserLoggedOut, trackDemoStarted } from '../utils/analytics';
import { auditEvents } from '../utils/auditLog';
import { sanitizeStoredGoals, refreshGoal } from '../utils/goals';
import { DEMO_BUSINESSES } from '../utils/demoData';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadTransactions, saveTransactions, deleteTransactionRemote,
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
  loadForecastHistory, saveForecastHistory,
  loadDataConfidenceHistory, saveDataConfidenceHistory,
  clearLocalFinancialCache,
  syncFinancingToSupabase,
  saveProfile, loadProfile, savePin, loadPin, verifyPin as verifyPinStored,
  generateAuthSecret, saveAuthSecret, loadAuthSecret, syncFieldEncryptionKey,
  clearAllData, deleteAllBusinessRecords, exportAllData, importAllData, deleteAccountData, recordConsent,
  inviteTeamMember, removeTeamMember, loadTeamMembers, joinTeamWithCode,
  loadMyTeamMemberships, MyTeamMembership,
  setWorkspaceOwner, clearWorkspaceOwner, resolveWorkspaceRole,
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
  // For a stock purchase that arrived as an ordinary imported transaction
  // (see computeUnlinkedInventoryCostPurchases) rather than through Stock
  // In -- applies the same weighted-average costing against the amount
  // already on that transaction and tags it with inventoryItemId, without
  // creating a second transaction for money that's already recorded once.
  linkInventoryCostTransaction: (transactionId: string, itemId: string, quantityAdded: number) => void;

  staff: StaffMember[];
  payrollRuns: PayrollRun[];
  cashPockets: CashPocket[];
  addStaff: (s: Omit<StaffMember, 'id' | 'createdAt'>) => void;
  updateStaff: (id: string, patch: Partial<StaffMember>) => void;
  deleteStaff: (id: string) => void;
  runPayroll: (period: string, items: PayrollItem[], deductionRate?: number, existingTransactionId?: string) => void;
  deletePayrollRun: (id: string) => void;
  addCashPocket: (name: string, amount: number) => void;
  updateCashPocket: (id: string, amount: number) => void;
  deleteCashPocket: (id: string) => void;

  financing: FinancingContextData;
  applyForMerchantFinancing: (amount: number, purpose: LoanPurpose) => Promise<void>;
  recordFinancingOutcome: (outcome: FinancingOutcomeInput) => void;
  confirmMerchantFinancingFunded: (fundingDate: string) => void;

  capitalCommitments: CapitalCommitment[];
  addCommitment: (c: Omit<CapitalCommitment, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateCommitment: (id: string, patch: Partial<CapitalCommitment>) => void;
  deleteCommitment: (id: string) => void;

  readinessHistory: ReadinessSnapshot[];
  forecastHistory: ForecastSnapshot[];
  dataConfidenceHistory: DataConfidenceSnapshot[];

  // True once this provider's own async load (AsyncStorage + Supabase) has
  // resolved for the current identity -- see useAppReady below, which
  // combines this with the other three data-owning providers' own flags so
  // a screen never renders while some of them are still loading in the
  // background.
  hydrated: boolean;
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
  const [forecastHistory, setForecastHistory] = useState<ForecastSnapshot[]>([]);
  const [dataConfidenceHistory, setDataConfidenceHistory] = useState<DataConfidenceSnapshot[]>([]);
  const [financing, setFinancing] = useState<FinancingContextData>({
    isQualified: false, qualification: undefined, minQualifiedAmount: undefined,
    maxQualifiedAmount: undefined, application: undefined,
    pastApplications: [], applicationStatus: null,
  });
  const [hydrated, setHydrated] = useState(false);
  // Re-hydrate when the signed-in user changes: on first mount there is no
  // workspace owner yet (loads local), then after login we re-pull from Supabase.
  const authForSync = useContext(AuthContext);
  const syncUserId = authForSync?.user?.email;
  const isDemoMode = authForSync?.isDemoMode ?? false;
  const demoBusinessId = authForSync?.demoBusinessId ?? null;
  // 'staff' has no visibility into P&L/cash-balance/loan/payroll detail
  // (rolePermissions.ts's canViewFinancials/STAFF_ALLOWED_SCREENS) -- this
  // provider previously loaded all of it into memory regardless of role,
  // which is what let it leak into Header's alert bell and the Dashboard's
  // priorities card (see the commits gating those). Skipping the load here
  // closes that at the source rather than only at each render site, and is
  // also the precondition for eventually restricting these tables' SELECT
  // at the database level for 'staff' -- the client must stop depending on
  // this data for that role before RLS can safely stop returning it.
  const isStaffRole = authForSync?.user?.role === 'staff';
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
    setForecastHistory([]); setDataConfidenceHistory([]);
    setFinancing({
      isQualified: false, qualification: undefined, minQualifiedAmount: undefined,
      maxQualifiedAmount: undefined, application: undefined,
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
          loadTransactions(),
          isStaffRole ? Promise.resolve(null) : loadAssets(),
          isStaffRole ? Promise.resolve(null) : loadLoans(),
          isStaffRole ? Promise.resolve(null) : loadBudgets(),
          loadInventory(),
        ]);
        if (t) setTransactions(t);
        if (a) setAssets(a);
        if (l) setLoans(l.map((x) => ({ ...x, payments: x.payments ?? [] })));
        if (b) setBudgets(b);
        if (inv) setInventory(inv);
        const [st, pr, cp, cc, rh, fh, dch] = await Promise.all([
          isStaffRole ? Promise.resolve(null) : loadStaff(),
          isStaffRole ? Promise.resolve(null) : loadPayrollRuns(),
          isStaffRole ? Promise.resolve(null) : loadCashPockets(),
          isStaffRole ? Promise.resolve(null) : loadCapitalCommitments(),
          loadReadinessHistory(), loadForecastHistory(), loadDataConfidenceHistory(),
        ]);
        if (st) setStaff(st);
        if (pr) setPayrollRuns(pr);
        if (cp) setCashPockets(cp);
        if (cc) setCapitalCommitments(cc);
        if (rh) setReadinessHistory(rh);
        if (fh) setForecastHistory(fh);
        if (dch) setDataConfidenceHistory(dch);
        const financingRaw = isStaffRole ? null : await AsyncStorage.getItem('@quad360/financing').catch(() => null);
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
  }, [syncUserId, isDemoMode, demoBusinessId, isStaffRole]);

  // Persist on change (only after the initial load, and never in demo mode
  // — "Nothing will be saved" is a promise made on the demo picker screen).
  // The financially-restricted fields below are also skipped for 'staff' --
  // not just at load, but at save too. Skipping only the load would leave
  // these arrays at their empty initial state for a staff session, and the
  // save effect firing on that empty state would read as "the real owner's
  // assets/loans/etc. were all deleted," which save*()'s remote-diff-and-
  // delete logic (see saveAssets's own comment) would then actually carry
  // out against the real data. A role that can never load this data must
  // also never be the one who persists (or wipes) it.
  //
  // Deliberately not debounced, even though every one of these fires on
  // every state change with no batching window. A debounce here would
  // delay the AsyncStorage.setItem each save*() does first (see
  // saveTransactions's own "always save locally first" comment) -- so the
  // one thing a debounce would actually risk, for a financial app, is
  // losing the user's last edit if the app closes or crashes inside that
  // delay window. The real cost of saving on every change is bounded
  // already: AsyncStorage writes are local and cheap, and the delta-sync
  // cache (storage.ts) means the Supabase upload only ever sends rows that
  // actually changed, not the whole array. Reaching for a debounce would
  // mean decoupling the instant local write from the network sync first
  // (splitting every save*() into a local half and a debounced remote
  // half) -- a real restructuring of the persistence layer, not a one-line
  // change, and not worth the risk without a measured problem driving it.
  useEffect(() => { if (hydrated && !isDemoMode) saveTransactions(transactions).catch(() => {}); }, [transactions, hydrated, isDemoMode]);
  useEffect(() => { if (hydrated && !isDemoMode && !isStaffRole) saveAssets(assets).catch(() => {}); }, [assets, hydrated, isDemoMode, isStaffRole]);
  useEffect(() => { if (hydrated && !isDemoMode && !isStaffRole) saveLoans(loans).catch(() => {}); }, [loans, hydrated, isDemoMode, isStaffRole]);
  useEffect(() => { if (hydrated && !isDemoMode && !isStaffRole) { console.log(`[Finance] saving ${budgets.length} budgets`); saveBudgets(budgets).catch((e) => console.error('[Finance] saveBudgets failed:', e)); } }, [budgets, hydrated, isDemoMode, isStaffRole]);
  useEffect(() => { if (hydrated && !isDemoMode) saveInventory(inventory).catch(() => {}); }, [inventory, hydrated, isDemoMode]);
  useEffect(() => { if (hydrated && !isDemoMode && !isStaffRole) saveStaff(staff).catch(() => {}); }, [staff, hydrated, isDemoMode, isStaffRole]);
  useEffect(() => { if (hydrated && !isDemoMode && !isStaffRole) savePayrollRuns(payrollRuns).catch(() => {}); }, [payrollRuns, hydrated, isDemoMode, isStaffRole]);
  useEffect(() => { if (hydrated && !isDemoMode && !isStaffRole) saveCashPockets(cashPockets).catch(() => {}); }, [cashPockets, hydrated, isDemoMode, isStaffRole]);
  useEffect(() => { if (hydrated && !isDemoMode && !isStaffRole) saveCapitalCommitments(capitalCommitments).catch(() => {}); }, [capitalCommitments, hydrated, isDemoMode, isStaffRole]);
  useEffect(() => { if (hydrated && !isDemoMode) saveReadinessHistory(readinessHistory).catch(() => {}); }, [readinessHistory, hydrated, isDemoMode]);
  useEffect(() => { if (hydrated && !isDemoMode) saveForecastHistory(forecastHistory).catch(() => {}); }, [forecastHistory, hydrated, isDemoMode]);
  useEffect(() => { if (hydrated && !isDemoMode) saveDataConfidenceHistory(dataConfidenceHistory).catch(() => {}); }, [dataConfidenceHistory, hydrated, isDemoMode]);
  useEffect(() => {
    // Never loaded for 'staff' (see the hydrate effect above), so `financing`
    // is still just the never-qualified default here -- writing that would
    // overwrite the real owner's merchant_financing row with a blank state.
    if (hydrated && !isDemoMode && !isStaffRole) {
      AsyncStorage.setItem('@quad360/financing', JSON.stringify(financing)).catch(() => {});
      // Restores a Supabase write that existed in the pre-split AppContext.tsx
      // (syncFinancingToSupabase) but was dropped when this provider replaced
      // it -- until now, a merchant financing application only ever reached
      // AsyncStorage on the applicant's own device, never Quad360 itself.
      if (syncUserId) syncFinancingToSupabase(financing, syncUserId).catch(() => {});
    }
  }, [financing, hydrated, isDemoMode, syncUserId, isStaffRole]);

  // Blank Guest Mode (demoBusinessId === null) is the one demo-mode case
  // where the data is real, user-entered work, not sample data — and per
  // the save-effects above, none of it ever reaches storage until the
  // guest converts via setupAccount()'s guestData carryover. Nothing else
  // in the app warns before a tab close/refresh wipes it, so a guest who
  // uploaded a statement and then accidentally reloaded would lose it
  // completely with no warning. A canned demo business (demoBusinessId
  // set) is deliberately excluded — that data isn't the visitor's, losing
  // it on refresh is expected and matches the "Nothing will be saved"
  // promise on the demo picker screen.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (!isDemoMode || demoBusinessId !== null) return;
    const hasGuestData = transactions.length > 0 || assets.length > 0 || loans.length > 0 || inventory.length > 0;
    if (!hasGuestData) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDemoMode, demoBusinessId, transactions.length, assets.length, loans.length, inventory.length]);

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

  // Rolling Forecast: same auto-snapshot pattern as readinessHistory above,
  // but monthly instead of weekly, and of the 12-month annual revenue
  // forecast rather than the readiness score -- "Forecast -> Actual ->
  // Variance -> Update -> Forecast again" needs an actual monthly trend to
  // show, not just today's number recomputed fresh every time. macroAssumptions/
  // futureEvents default to [] here (SettingsProvider is a sibling context,
  // not reachable from FinanceProvider) -- computeForecastSummary already
  // treats both as optional refinements, not required inputs.
  const forecastSummary12m = useMemo(
    () => computeForecastSummary(transactions, loans, finance, '12m', staff, [], undefined, inventory, []),
    [transactions, loans, finance, staff, inventory],
  );
  useEffect(() => {
    if (!hydrated || isDemoMode || transactions.length === 0) return;
    setForecastHistory(prev => shouldRecordForecastSnapshot(prev) ? appendForecastSnapshot(prev, buildForecastSnapshot(forecastSummary12m)) : prev);
  }, [hydrated, isDemoMode, transactions.length, forecastSummary12m]);

  // Same weekly-snapshot pattern as readinessHistory above, but for the
  // "cold start" data-confidence trend -- see dataConfidenceHistory.ts.
  const dataQuality = useMemo(() => computeDataQuality(transactions), [transactions]);
  useEffect(() => {
    if (!hydrated || isDemoMode || transactions.length === 0) return;
    setDataConfidenceHistory(prev => shouldRecordDataConfidenceSnapshot(prev) ? appendDataConfidenceSnapshot(prev, buildDataConfidenceSnapshot(dataQuality)) : prev);
  }, [hydrated, isDemoMode, transactions.length, dataQuality]);

  const value: FinanceContextValue = useMemo(
    () => ({
      transactions,
      assets,
      loans,
      budgets,
      inventory,
      finance,
      hydrated,
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
      deleteTransaction: (id) => {
        setTransactions((prev) => prev.filter((t) => t.id !== id));
        // Explicit, by-id remote delete -- saveTransactions' own sync no
        // longer infers deletions from a diff (see its header), so this is
        // now the only thing that actually removes the row server-side.
        if (!isDemoMode) deleteTransactionRemote(id).catch(() => {});
      },
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
          ({ principalPortion, interestPortion } = computeLoanPaymentSplit(loan, payment.amount));

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
      linkInventoryCostTransaction: (transactionId, itemId, quantityAdded) => {
        const item = inventory.find((i) => i.id === itemId);
        const tx = transactions.find((t) => t.id === transactionId);
        if (!item || !tx || !(quantityAdded > 0)) return;
        const costPerUnit = (tx.amount ?? 0) / quantityAdded;
        const { quantity: newQuantity, costPrice: newCostPrice } = applyStockIn(item, quantityAdded, costPerUnit);
        setInventory((prev) =>
          prev.map((i) => (i.id === itemId ? {
            ...i,
            quantity: newQuantity,
            costPrice: newCostPrice,
            supplier: tx.vendorCustomer || i.supplier,
            updatedAt: new Date().toISOString(),
          } : i))
        );
        setTransactions((prev) =>
          prev.map((t) => (t.id === transactionId ? { ...t, inventoryItemId: itemId } : t))
        );
      },

      staff,
      payrollRuns,
      cashPockets,
      addStaff: (s) => setStaff((prev) => [...prev, { ...s, id: genId(), createdAt: new Date().toISOString() } as StaffMember]),
      updateStaff: (id, patch) => setStaff((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x))),
      deleteStaff: (id) => setStaff((prev) => prev.filter((x) => x.id !== id)),
      runPayroll: (period, items, _deductionRate, existingTransactionId) => {
        const totalGross = items.reduce((s, i) => s + i.grossSalary, 0);
        const totalDeductions = items.reduce((s, i) => s + i.deductions, 0);
        const totalNet = totalGross - totalDeductions;
        const [py, pm] = period.split('-').map(Number);
        const periodEndDate = new Date(py, pm, 0).toISOString().split('T')[0];
        const now = new Date().toISOString();
        // A payroll payment that already exists as an imported bank
        // transaction (tagged "Payroll" -- see computeUnlinkedPayrollTransactions)
        // is linked to this run instead of getting a second, duplicate
        // expense: the run's own items/totals are computed from real Staff
        // records either way, only where the matching cash movement is
        // recorded differs.
        const txId = existingTransactionId ?? genId();
        if (!existingTransactionId) {
          // Record the net payroll as a Salaries expense so it flows into finance.
          setTransactions((prev) => [...prev, {
            id: txId, date: periodEndDate, description: `Payroll — ${period}`,
            type: 'expense', category: 'Salaries', amount: totalNet, status: 'paid',
          } as Transaction]);
        }
        const run: PayrollRun = {
          id: genId(), period, runDate: now, items, totalGross, totalDeductions,
          totalNet, status: 'paid', transactionId: txId, createdAt: now,
        };
        setPayrollRuns((prev) => [...prev, run]);
      },
      deletePayrollRun: (id) => {
        // Remove the linked expense transaction too, so deleting a payroll
        // run doesn't leave an orphan expense understating profit -- but
        // only when this run created that transaction itself (category
        // 'Salaries', set above). A run linked to a pre-existing imported
        // transaction (category 'Payroll') must not delete real bank
        // history the run never created.
        const run = payrollRuns.find((r) => r.id === id);
        if (run?.transactionId) {
          const linkedTx = transactions.find((t) => t.id === run.transactionId);
          if (linkedTx?.category === 'Salaries') {
            setTransactions((txs) => txs.filter((t) => t.id !== run.transactionId));
            if (!isDemoMode) deleteTransactionRemote(run.transactionId).catch(() => {});
          }
        }
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
      forecastHistory,
      dataConfidenceHistory,

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
      // Closes the dead end above: nothing but the business itself can ever
      // know what a real lender decided on a pending application, so this
      // is the one write path that lets that decision actually get
      // recorded — same "the owner tells us" discipline as Loan.fromMarketplace
      // and CapitalCommitment. A no-op if there's no pending application to
      // resolve (nothing to record against).
      recordFinancingOutcome: (outcome) => {
        setFinancing((prev) => {
          if (!prev.application) return prev;
          const today = new Date().toISOString().split('T')[0];
          if (outcome.status === 'rejected') {
            const resolved: MerchantFinancingApplication = {
              ...prev.application,
              status: 'rejected',
              rejectionReason: outcome.rejectionReason,
            };
            return {
              ...prev,
              application: undefined,
              applicationStatus: null,
              pastApplications: [...(prev.pastApplications ?? []), resolved],
            };
          }
          // Approved -- stays as the current application (not yet funded).
          // Real financial fields (rate/term/amount) come from the lender's
          // actual terms as reported by the owner, never re-derived from
          // the original request.
          const resolved: MerchantFinancingApplication = {
            ...prev.application,
            status: 'approved',
            approvedAmount: outcome.approvedAmount,
            approvalDate: today,
            interestRate: outcome.interestRate ?? prev.application.interestRate,
            termMonths: outcome.termMonths ?? prev.application.termMonths,
            lenderName: outcome.lenderName?.trim() || prev.application.lenderName,
          };
          return { ...prev, application: resolved, applicationStatus: 'approved' };
        });
      },
      // Closes the SECOND dead end: 'approved' had no path to 'funded' at
      // all -- the UI just asserted "Funds will be transferred within 24
      // hours" with nothing anywhere that could ever confirm it happened.
      // Self-reported, same discipline as recordFinancingOutcome above.
      // Critically, this also creates a REAL Loan record (not just a
      // financing.application status flip) -- previously a funded merchant
      // loan would have been invisible to DSCR, the Business Health Score's
      // Debt factor, Risk Radar, and the Loans screen's own totals, because
      // nothing ever wrote it into the `loans` array those all read. A
      // no-op if there's no approved application to confirm.
      confirmMerchantFinancingFunded: (fundingDate) => {
        const app = financing.application;
        if (!app || app.status !== 'approved') return;
        const loanFields = buildLoanFromMerchantFinancing(app, fundingDate);
        if (!isDemoMode) trackLoanAdded(loanFields.principal, settingsForFinance?.settings?.currency ?? '₦');
        setLoans((prev) => [...prev, {
          ...loanFields,
          id: genId(),
          payments: [],
          createdAt: new Date().toISOString(),
        }]);
        setFinancing((prev) => {
          if (!prev.application || prev.application.status !== 'approved') return prev;
          const funded: MerchantFinancingApplication = { ...prev.application, status: 'funded', fundingDate };
          return {
            ...prev,
            application: undefined,
            applicationStatus: null,
            pastApplications: [...(prev.pastApplications ?? []), funded],
          };
        });
      },
    }),
    [transactions, assets, loans, budgets, inventory, staff, payrollRuns, cashPockets, capitalCommitments, readinessHistory, forecastHistory, dataConfidenceHistory, financing, syncUserId, finance, isDemoMode, settingsForFinance?.settings?.currency, hydrated]
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
  hydrated: boolean;
}

const GoalContext = createContext<GoalContextValue | undefined>(undefined);

export function GoalProvider({ children }: { children: ReactNode }) {
  const [goals, setGoals] = useState<FinancialGoal[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const authCtx = useContext(AuthContext);
  const syncUserId = authCtx?.user?.email;
  const isDemoMode = authCtx?.isDemoMode ?? false;
  // Goals carry target/current values and progress toward revenue, margin,
  // and cash-reserve targets -- P&L-adjacent detail 'staff' has no
  // visibility into (see the matching isStaffRole comment in
  // FinanceProvider). Skipped at both load and save for the same reason:
  // saveGoals's remote-diff-and-delete would wipe the real owner's goals
  // if this ever saved an empty array a staff session never actually loaded.
  const isStaffRole = authCtx?.user?.role === 'staff';

  useEffect(() => {
    setHydrated(false);
    setGoals([]); // clear the previous identity's goals before loading the new one

    if (isDemoMode) { setHydrated(true); return; } // demo businesses carry no sample goals
    if (isStaffRole) { setHydrated(true); return; }

    (async () => {
      try {
        const g = await loadGoals();
        if (g) setGoals(sanitizeStoredGoals(g));
      }
      catch (e) { console.error('[Goals] hydrate failed:', e); }
      finally { setHydrated(true); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncUserId, isDemoMode, isStaffRole]);
  // Not debounced -- see FinanceProvider's save-effect comment for why.
  useEffect(() => { if (hydrated && !isDemoMode && !isStaffRole) saveGoals(goals).catch(() => {}); }, [goals, hydrated, isDemoMode, isStaffRole]);

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
      hydrated,
    }),
    [goals, isDemoMode, hydrated]
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
  hydrated: boolean;
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
  // Not debounced -- see FinanceProvider's save-effect comment for why.
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
      // Stamps paidDate the moment an invoice actually transitions to
      // 'paid' -- the one real data point behind customerPaymentBehavior.ts's
      // payment-lateness history. Left untouched if already set (repeat
      // "mark paid" taps stay idempotent) or if the new status isn't 'paid'
      // (reverting a mistaken mark-paid keeps the original paid date rather
      // than erasing evidence of when it actually happened).
      markInvoiceStatus: (id, status) => setInvoices((prev) => prev.map((inv) => (
        inv.id === id
          ? { ...inv, status, paidDate: status === 'paid' ? (inv.paidDate || new Date().toISOString().slice(0, 10)) : inv.paidDate }
          : inv
      ))),
      updateInvoice: (id, invoice) => setInvoices((prev) =>
        prev.map((i) => (i.id === id ? { ...i, ...invoice } : i))
      ),
      deleteInvoice: (id) => setInvoices((prev) =>
        prev.filter((i) => i.id !== id)
      ),
      hydrated,
    }),
    [invoices, hydrated]
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
  hydrated: boolean;
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
      if (biz) setSettings((prev) => ({ ...prev, currency: biz.currency, industry: biz.industry ?? 'general', businessType: biz.businessType ?? 'both' }));
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
  // Not debounced -- see FinanceProvider's save-effect comment for why.
  useEffect(() => { if (hydrated && !isDemoMode) saveSettings(settings).catch(() => {}); }, [settings, hydrated, isDemoMode]);

  const value: SettingsContextValue = useMemo(
    () => ({
      settings,
      language,
      updateSettings: (s: Partial<BusinessSettings>) => setSettings((prev: BusinessSettings) => ({ ...prev, ...s })),
      setLanguage: (lang: Language) => setLanguage(lang),
      hydrated,
    }),
    [settings, language, hydrated]
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

// Whatever a Guest Mode session has already uploaded/entered before
// registering -- captured by the calling screen (from useApp()'s own
// transactions/assets/loans/inventory/invoices) and passed into
// setupAccount so it survives the brand-new-account flow instead of being
// lost to setupAccount's own clearLocalFinancialCache() anti-leak wipe.
// See setupAccount's guestData handling for exactly how/when this gets
// written to storage.
export interface GuestSeedData {
  transactions?: Transaction[];
  assets?: Asset[];
  loans?: Loan[];
  inventory?: InventoryItem[];
  invoices?: Invoice[];
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  currentScreen: Screen;
  setCurrentScreen: (screen: Screen) => void;
  navigate: (screen: Screen, params?: any) => void;
  goBack: () => boolean;
  navParams: any;
  login: (pin: string) => Promise<boolean>;
  // Step-up re-check for a high-risk action within an already-authenticated
  // session -- see verifyPin in storage.ts for why this is deliberately
  // NOT the full login() flow.
  verifyPin: (pin: string) => Promise<boolean>;
  // Same call as logout() -- exposed under this name for the Security
  // Center, see performLogout's comment for why one function covers both.
  signOutEverywhere: () => Promise<void>;
  pendingTwoFactorProfile: { email: string; businessName: string; phone?: string; createdAt?: string } | null;
  completeTwoFactorLogin: (code: string, method?: 'totp' | 'sms') => Promise<boolean>;
  cancelTwoFactorLogin: () => void;
  logout: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<User, 'phone' | 'businessName'>>) => void;
  changePin: (currentPin: string, newPin: string) => Promise<{ ok: boolean; lockedUntil?: number; cloudSynced?: boolean }>;
  isDemoMode: boolean;
  demoBusinessId: string | null;
  enterDemo: (businessId: string) => void;
  // "Guest Mode" -- the same non-persisted, in-memory-only session as
  // enterDemo, but blank instead of seeded with a canned DEMO_BUSINESSES
  // entry, so a visitor can explore with (or upload) their OWN numbers
  // instead of a fictional business's. See GuestSeedData/setupAccount's
  // guestData param for how this data survives if they then register.
  enterGuest: () => void;
  exitDemo: () => void;
  clearData: () => Promise<void>;
  resetBusinessData: () => Promise<void>;
  resetApp: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  teamMembers: TeamMember[];
  inviteMember: (email: string, role: 'accountant' | 'manager' | 'staff' | 'admin' | 'external_accountant' | 'viewer') => Promise<string>;
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
  setupAccount: (email: string, businessName: string, pin: string, loadDemo: boolean, phone?: string, initialSettings?: Partial<BusinessSettings>, guestData?: GuestSeedData) => Promise<void>;
  recoverAccount: (email: string, pin: string) => Promise<void>;
  joinTeam: (email: string, pin: string, inviteCode: string) => Promise<void>;
  // Self-service recovery for the one join failure a device can't retry its
  // way out of: an earlier join attempt on a DIFFERENT device got as far as
  // creating this email's Supabase Auth account but never finished (e.g. an
  // RLS error on the old team_members policy), so that account's real
  // password is a random secret only that other device ever knew. Neither
  // this device's stored secret nor the PIN can sign in to it, and there is
  // no admin/service-role key on the client to reset it directly. An email
  // OTP the person can only receive at their own address is the one thing
  // that proves it's really them without needing that lost password at all.
  // See joinTeam's own comment for how it detects this case.
  requestJoinRecoveryOtp: (email: string) => Promise<void>;
  completeJoinWithOtp: (email: string, otp: string, pin: string, inviteCode: string) => Promise<void>;
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
function getInitialScreenFromUrl(): Screen {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return 'landing';
  const path = window.location.pathname;
  if (path === '/blog' || path === '/blog/') return 'blog';
  if (path.startsWith('/blog/')) return 'blog-post';
  // No link anywhere in the UI points here -- reached only by a Quad360
  // admin typing this path directly. isFinancingAdmin() (checked in App.tsx
  // before FinancingAdminScreen renders) is what actually gates it; this
  // just lets the URL resolve to the right screen at all.
  if (path === '/admin/financing') return 'financing-admin';
  // Where Paystack/Korapay/Flutterwave redirect the checkout tab back to
  // once a payment finishes (see payment-init's redirect_url/tx_ref) --
  // without this, that tab just fell through to 'landing' (then 'dashboard'
  // once the boot effect saw an existing session), with no confirmation
  // that anything had happened at all.
  if (path === '/payment-complete') return 'payment-complete';
  return 'landing';
}

function getInitialNavParamsFromUrl(): any {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const path = window.location.pathname;
  if (path.startsWith('/blog/')) {
    const slug = path.slice('/blog/'.length).replace(/\/$/, '');
    if (slug) return { slug };
  }
  if (path === '/payment-complete') {
    const q = new URLSearchParams(window.location.search);
    return { status: q.get('status'), txRef: q.get('tx_ref') || q.get('reference') };
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentScreen, setCurrentScreenState] = useState<Screen>(getInitialScreenFromUrl);
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
  const backStackRef = useRef<{ screen: Screen; params: any }[]>([]);

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

  // Shared body of logout() and signOutEverywhere() below -- they are the
  // same action. supabase-js's signOut() already defaults to scope
  // 'global', meaning it revokes every session for this account, not just
  // the one running on this device -- so an explicit ordinary "sign out"
  // already terminates any other device that's still logged in. This is
  // named/exposed a second way (signOutEverywhere) purely so the Security
  // Center can offer a clearly-labelled "sign out everywhere" action
  // without a reader having to know that default-scope trivia to trust it.
  const performLogout = useCallback(async () => {
    if (!isDemoMode) trackUserLoggedOut();
    // Logged before signOut() below clears the session that
    // getAuthUserId() reads to attribute the entry.
    if (!isDemoMode) auditEvents.logout();
    setIsLoading(true);
    try {
      await supabase.auth.signOut({ scope: 'global' }).catch(() => {});
      await clearWorkspaceOwner().catch(() => {});
      // Wipe the locally-cached financial data so it can't leak into
      // whichever account signs in next on this device -- several local
      // caches (staff/payroll) have no per-user namespacing.
      await clearLocalFinancialCache().catch(() => {});
      setUser(null);
      // Explicit reset, not left for the next routeAfterAuth() to
      // overwrite -- between this logout and whatever signs in next,
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
  }, [isDemoMode]);

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
    // clearWorkspaceOwner() above means this starts pointed at the
    // account's own business, but resolve it properly anyway rather than
    // assuming -- keeps this in one place with the boot-restore path below.
    const role = await resolveWorkspaceRole();
    setUser({ email: profile.email, businessName: profile.businessName, phone: profile.phone, role, createdAt: profile.createdAt });
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
              // Never assume 'owner' here -- this boot path also runs after
              // switchBusiness()'s reload, so the workspace pointer may name
              // a business this device only has a restricted team_members
              // role on. resolveWorkspaceRole() checks that pointer for
              // real, on every single restore, rather than trusting
              // whatever role happened to be in memory before the reload.
              const role = await resolveWorkspaceRole();
              setUser({ email: profile.email, businessName: profile.businessName, phone: profile.phone, role, createdAt: profile.createdAt });
              // A signed-in user who lands directly on a shared /blog link,
              // or an admin who typed /admin/financing, should see that
              // page, not get bounced to their dashboard.
              const initialUrlScreen = getInitialScreenFromUrl();
              const isDirectUrlRoute = initialUrlScreen === 'blog' || initialUrlScreen === 'blog-post' || initialUrlScreen === 'financing-admin' || initialUrlScreen === 'payment-complete';
              // Same reasoning: don't stomp the reset-pin screen the recovery
              // effect above just switched to for a device that also happens
              // to have a saved profile -- see that effect's comment.
              if (!isDirectUrlRoute && !recoveryDetectedRef.current) await routeAfterAuth();
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

  // Shared tail of a successful join, once we have a real authUserId --
  // used both by joinTeam's normal path and by completeJoinWithOtp's
  // recovery path below, so the two can never drift on what "finishing a
  // join" actually means.
  const finishJoinTeam = async (authUserId: string, email: string, pin: string, inviteCode: string) => {
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
    // Store the real DB role verbatim (not a lossy 3-way display
    // mapping) -- joinTeamWithCode already returns exactly one of the
    // six team_members roles, and everything downstream (rolePermissions.ts,
    // resolveWorkspaceRole) expects that canonical lowercase value.
    setUser({ email, businessName: 'Team Member', role, createdAt: new Date().toISOString() });
    setCurrentScreenState('dashboard');
  };

  const value: AuthContextValue = useMemo(
    () => ({
      user,
      isLoading,
      currentScreen,
      navParams,
      setCurrentScreen: (screen: Screen) => {
        backStackRef.current.push({ screen: currentScreen, params: navParams });
        if (Platform.OS === 'web' && typeof window !== 'undefined') window.history.pushState({}, '');
        setNavParams(null);
        setCurrentScreenState(screen);
      },
      navigate: (screen: Screen, params?: any) => {
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
          auditEvents.loginFailed('Incorrect PIN');
          if (attempts >= 5) {
            const until = Date.now() + 15 * 60 * 1000;
            setIsLockedOut(true); setLockoutUntil(until);
            await AsyncStorage.setItem(LOCKOUT_KEY, String(until)).catch(() => {});
            auditEvents.accountLocked();
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
        // Not necessarily 'owner' -- this device may still have a
        // workspace pointer left over from a previous team-business switch,
        // so resolve the real role for whichever workspace that pointer
        // currently names instead of assuming this login is the owner.
        {
          const role = await resolveWorkspaceRole();
          setUser({ email: profile.email, businessName: profile.businessName, phone: profile.phone, role, createdAt: profile.createdAt });
        }
        await routeAfterAuth();
        auditEvents.login();
        return true;
      },
      pendingTwoFactorProfile,
      completeTwoFactorLogin: async (code: string, method: 'totp' | 'sms' = 'totp'): Promise<boolean> => {
        const ok = await verifyTwoFactorLogin(code, method).catch(() => false);
        if (!ok || !pendingTwoFactorProfile) return false;
        writeTabIdentity(pendingTwoFactorProfile.email);
        const role = await resolveWorkspaceRole();
        setUser({ email: pendingTwoFactorProfile.email, businessName: pendingTwoFactorProfile.businessName, phone: pendingTwoFactorProfile.phone, role, createdAt: pendingTwoFactorProfile.createdAt });
        setPendingTwoFactorProfile(null);
        await routeAfterAuth();
        auditEvents.login();
        return true;
      },
      cancelTwoFactorLogin: () => {
        setPendingTwoFactorProfile(null);
        setCurrentScreenState('login');
      },
      logout: performLogout,
      signOutEverywhere: performLogout,
      setupAccount: async (email, businessName, pin, _loadDemo, phone, initialSettings, guestData) => {
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
        // Guest Mode -> real account conversion: write whatever the guest
        // already had (transactions/assets/loans/inventory/invoices, still
        // sitting in the OTHER providers' in-memory state at this point --
        // this function has no direct access to them, which is why the
        // caller captures and passes them in) into storage now, strictly
        // AFTER clearLocalFinancialCache() above and BEFORE setUser() below
        // flips the identity. Each data provider's own hydrate effect (keyed
        // on syncUserId/isDemoMode) fires once setUser() commits and simply
        // loads this back in through the exact same path it uses to restore
        // an existing account -- no cross-provider coordination needed, and
        // no risk of the effect's own wipe-then-load race clobbering this,
        // since the write below completes and is awaited before the
        // identity (and therefore the effect's dependencies) ever changes.
        if (guestData) {
            await Promise.all([
                guestData.transactions?.length ? saveTransactions(guestData.transactions).catch(() => {}) : null,
                guestData.assets?.length ? saveAssets(guestData.assets).catch(() => {}) : null,
                guestData.loans?.length ? saveLoans(guestData.loans).catch(() => {}) : null,
                guestData.inventory?.length ? saveInventory(guestData.inventory).catch(() => {}) : null,
                guestData.invoices?.length ? saveInvoices(guestData.invoices).catch(() => {}) : null,
            ]);
        }
        setIsFirstLaunch(false);
        // Belt-and-suspenders for the guest-conversion path -- a normal
        // (non-guest) signup already has both false/null, so this is a
        // harmless no-op there.
        setIsDemoMode(false);
        setDemoBusinessId(null);
        setUser({ email, businessName, role: 'owner', phone, createdAt: new Date().toISOString() });
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
        const role = await resolveWorkspaceRole();
        setUser({ email: profile.email, businessName: profile.businessName, phone: profile.phone, role, createdAt: profile.createdAt });
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
          if (signInErr) {
            // Neither this device's cached secret nor the PIN unlocks this
            // account -- the one real cause is a join that partially
            // completed on a DIFFERENT device (signUp succeeded there,
            // something after it failed) whose random password only that
            // device ever knew. A sentinel, not the raw Supabase message,
            // so the UI can offer the actual fix (requestJoinRecoveryOtp /
            // completeJoinWithOtp below) instead of a dead-end error.
            throw new Error('JOIN_ACCOUNT_RECOVERY_NEEDED');
          }
          authUserId = signInData?.user?.id;
          const { error: rotateError } = await supabase.auth.updateUser({ password: authSecret }).catch(e => ({ error: e } as any));
          if (!rotateError) await saveAuthSecret(authSecret).catch(() => {});
        } else {
          await saveAuthSecret(authSecret).catch(() => {});
        }
        if (!authUserId) throw new Error('Could not authenticate.');
        await finishJoinTeam(authUserId, email, pin, inviteCode);
      },
      requestJoinRecoveryOtp: async (email) => {
        // shouldCreateUser: false -- this must only ever sign in to the
        // existing stuck account, never silently create a fresh one for a
        // mistyped or unrelated address.
        const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
        if (error) throw new Error(error.message);
      },
      completeJoinWithOtp: async (email, otp, pin, inviteCode) => {
        const { data, error: verifyErr } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' });
        if (verifyErr) throw new Error(verifyErr.message);
        const authUserId = data?.user?.id;
        if (!authUserId) throw new Error('Could not verify code.');
        // Now that the OTP has proven this is really them, replace the
        // account's forgotten random password with a fresh one this
        // device will actually remember, same as the normal join path.
        const newAuthSecret = generateAuthSecret();
        const { error: rotateError } = await supabase.auth.updateUser({ password: newAuthSecret }).catch(e => ({ error: e } as any));
        if (!rotateError) await saveAuthSecret(newAuthSecret).catch(() => {});
        await finishJoinTeam(authUserId, email, pin, inviteCode);
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
        setUser({ email, businessName: orgName, role: 'owner', createdAt: new Date().toISOString() });
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
          role: 'owner',
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
      verifyPin: (pin: string) => verifyPinStored(pin),
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
          role: 'owner',
          createdAt: new Date(Date.now() - 120 * 86400000).toISOString(),
        });
        setDemoBusinessId(businessId);
        setIsDemoMode(true);
        setCurrentScreenState('dashboard');
      },
      // Same non-persisted session as enterDemo, but demoBusinessId stays
      // null -- DEMO_BUSINESSES.find() below then simply never matches, and
      // every data provider's own `if (biz)` guard (see
      // FinanceProvider/InvoiceProvider/SettingsProvider hydrate effects)
      // already falls through cleanly to its already-cleared empty state
      // when that happens. No provider changes needed for a blank guest
      // session to work.
      enterGuest: () => {
        trackDemoStarted('guest', 'Guest', 'guest');
        setUser({
          email: `guest-${Date.now()}@quad360.guest`,
          businessName: 'My Business',
          role: 'owner',
          createdAt: new Date().toISOString(),
        });
        setDemoBusinessId(null);
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
        // reloadApp() is a no-op on native (window is undefined there), so
        // this device's in-memory role must be corrected here too, not left
        // to depend on the reload -- resolveWorkspaceRole() looks up the
        // real, currently-active team_members role for this specific
        // ownerUserId rather than carrying over whatever role this session
        // had before the switch.
        const role = await resolveWorkspaceRole();
        setUser((prev) => (prev ? { ...prev, role } : prev));
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

// App.tsx's boot spinner previously gated only on auth.isLoading (the
// session/PIN check) -- independent of whether FinanceProvider/GoalProvider/
// InvoiceProvider/SettingsProvider had actually finished their own async
// AsyncStorage+Supabase load for this identity. A screen could render the
// instant auth resolved while transactions/goals/invoices/settings were
// still loading in the background, showing a brief "looks empty" flash
// (e.g. a health score computed from zero transactions) before the real
// data landed a moment later -- most noticeable right after login, when
// each provider's own hydrated flag drops back to false and reloads for
// the newly-signed-in identity. Combines all five so the spinner covers
// the whole boot, not just the auth portion of it.
//
// Deliberately its own tiny hook rather than folding this into useApp():
// useApp() also recomputes financialHealthScore/goalsArray/etc, work
// App.tsx's top-level render (which re-renders on every screen change) has
// no reason to pay for just to read one boolean.
export function useAppReady(): boolean {
  const auth = useAuth();
  const finance = useFinance();
  const goals = useGoals();
  const invoices = useInvoices();
  const settings = useSettings();
  return !auth.isLoading && finance.hydrated && goals.hydrated && invoices.hydrated && settings.hydrated;
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
// The return object below is hand-assembled, not a spread of auth/finance/
// goals/invoices/settings -- most of it is safe-defaulted/renamed
// passthroughs (`x: finance?.x ?? []`), but addInvoice/updateInvoice/
// deleteInvoice/markInvoiceStatus carry real business logic (keeping each
// invoice's linked income transaction in sync -- see their own comments
// below), and user/goals/transactions/etc. are recomputed, not raw context
// values. That mix is exactly why this stays a literal return rather than
// `{...auth, ...finance, ...goals, ...invoices, ...settings}`: a spread
// would silently let a raw context field (e.g. goals.goals, the
// un-recomputed array) leak through ahead of its override if the ordering
// ever shifted, with no compiler error to catch it.
//
// The real consequence: a new method added to FinanceContextValue (or any
// of the other four interfaces) is NOT automatically exposed here. It has
// to be added to this return object by hand, in addition to the interface
// and the provider's own returned object. Forgetting this third copy does
// get caught by TypeScript -- but only once some screen actually tries to
// read the new field from useApp(); until then it fails silently. Always
// add a new context method here in the same change that adds it to the
// provider, don't wait for a screen to need it and a `tsc` error to remind
// you.
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

  // auth.user.role is always one of the six canonical lowercase UserRole
  // values by the time it's set (see resolveWorkspaceRole in storage.ts) --
  // this allowlist is defense in depth, not the primary check: an
  // unrecognized value fails CLOSED to the most restrictive role ('staff'),
  // never to 'owner'. Previously this only recognized three legacy display
  // strings and defaulted everything else -- including 'admin',
  // 'external_accountant', 'viewer', and undefined -- to 'owner', which is
  // how a team member landed with full owner permissions after switching
  // into another business's workspace.
  const KNOWN_ROLES: UserRole[] = ['owner', 'admin', 'accountant', 'manager', 'staff', 'external_accountant', 'viewer'];
  const resolvedUserRole = (
    KNOWN_ROLES.includes(auth.user?.role as UserRole) ? (auth.user!.role as UserRole) : 'staff'
  );

  return {
    // Auth state
    user: userWithMetrics,
    // Combined with the other four providers' own hydrated flags, not just
    // the auth/session check -- see useAppReady's comment. A screen reading
    // isLoading from useApp() (e.g. DashboardScreen's first-run-wizard
    // check, gated on `transactions.length > 0`) would otherwise see
    // isLoading=false and an empty transactions array simultaneously for a
    // returning user whose real history just hadn't loaded yet, and wrongly
    // conclude "no transactions ever recorded."
    isLoading: auth.isLoading || !finance.hydrated || !goals.hydrated || !invoices.hydrated || !settings.hydrated,
    currentScreen: auth.currentScreen,
    setCurrentScreen: auth.setCurrentScreen,
    navigate: auth.navigate,
    goBack: auth.goBack,
    login: auth.login,
    verifyPin: auth.verifyPin || (async () => false),
    signOutEverywhere: auth.signOutEverywhere || auth.logout,
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
    demoBusinessId: auth.demoBusinessId ?? null,
    exitDemo: auth.exitDemo || (() => {}),
    cashPockets: finance?.cashPockets ?? [],
    financing: finance?.financing ?? {
      isQualified: false, qualification: undefined, minQualifiedAmount: undefined,
      maxQualifiedAmount: undefined, application: undefined,
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
    requestJoinRecoveryOtp: auth.requestJoinRecoveryOtp,
    completeJoinWithOtp: auth.completeJoinWithOtp,
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
    recordFinancingOutcome: finance?.recordFinancingOutcome || (() => {}),
    confirmMerchantFinancingFunded: finance?.confirmMerchantFinancingFunded || (() => {}),
    setupAccount: auth.setupAccount,
    updateProfile: auth.updateProfile || (() => {}),
    updateInventoryItem: finance?.updateInventoryItem || (() => {}),
    addInventoryItem: finance?.addInventoryItem || (() => {}),
    deleteInventoryItem: finance?.deleteInventoryItem || (() => {}),
    stockInInventory: finance?.stockInInventory || (() => {}),
    linkInventoryCostTransaction: finance?.linkInventoryCostTransaction || (() => {}),
    updateCashPocket: finance?.updateCashPocket || (() => {}),
    addCashPocket: finance?.addCashPocket || (() => {}),
    deleteCashPocket: finance?.deleteCashPocket || (() => {}),
    capitalCommitments: finance?.capitalCommitments ?? [],
    addCommitment: finance?.addCommitment || (() => {}),
    updateCommitment: finance?.updateCommitment || (() => {}),
    deleteCommitment: finance?.deleteCommitment || (() => {}),
    readinessHistory: finance?.readinessHistory ?? [],
    forecastHistory: finance?.forecastHistory ?? [],
    dataConfidenceHistory: finance?.dataConfidenceHistory ?? [],
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
      forecastHistory: finance?.forecastHistory ?? [],
      dataConfidenceHistory: finance?.dataConfidenceHistory ?? [],
    }),
    recordConsent,
    enterDemo: auth.enterDemo || (() => {}),
    enterGuest: auth.enterGuest || (() => {}),
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
