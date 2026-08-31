import AsyncStorage from '@react-native-async-storage/async-storage';
import { Transaction, FinancialGoal } from '../src/types';

// ─── Mock AsyncStorage ────────────────────────────────────────────────────────
jest.mock('@react-native-async-storage/async-storage', () => {
    let store: Record<string, string> = {};
    return {
        getItem: jest.fn(async (key: string) => store[key] ?? null),
        setItem: jest.fn(async (key: string, value: string) => { store[key] = value; }),
        removeItem: jest.fn(async (key: string) => { delete store[key]; }),
        multiRemove: jest.fn(async (keys: string[]) => { keys.forEach(k => delete store[k]); }),
        clear: jest.fn(async () => { store = {}; }),
    };
});

// ─── Mock supabase ────────────────────────────────────────────────────────────
// auth.getSession returns null so getWorkspaceOwnerId returns null,
// meaning save/load functions skip the remote path and use AsyncStorage only.
jest.mock('../src/utils/supabase', () => ({
    supabase: {
        auth: {
            getSession: jest.fn(async () => ({ data: { session: null } })),
        },
        from: () => ({
            upsert: jest.fn(async () => ({ error: null })),
            select: () => ({
                eq: () => ({
                    single: jest.fn(async () => ({ data: null, error: null })),
                    order: () => Promise.resolve({ data: null, error: null }),
                }),
            }),
        }),
    },
}));

// ─── Mock syncQueue ───────────────────────────────────────────────────────────
jest.mock('../src/utils/syncQueue', () => ({
    enqueue: jest.fn(async () => {}),
}));

// ─── Mock secureStorage (used by clearAllData, and — for the account
// registry below — by registerLocalAccount/switchLocalAccount/etc, which
// need actual round-tripping rather than the always-null no-ops the other
// secure values use, since those aren't exercised by any test in this file). ─
jest.mock('../src/utils/secureStorage', () => {
    let secureStore: Record<string, string> = {};
    return {
        savePinSecurely: jest.fn(async (v: string) => { secureStore.pin = v; }),
        loadPinSecurely: jest.fn(async () => secureStore.pin ?? null),
        clearPinSecurely: jest.fn(async () => { delete secureStore.pin; }),
        saveAuthSecretSecurely: jest.fn(async (v: string) => { secureStore.authSecret = v; }),
        loadAuthSecretSecurely: jest.fn(async () => secureStore.authSecret ?? null),
        clearAuthSecretSecurely: jest.fn(async () => { delete secureStore.authSecret; }),
        loadLocalAccountsSecurely: jest.fn(async () => secureStore.localAccounts ?? null),
        saveLocalAccountsSecurely: jest.fn(async (json: string) => { secureStore.localAccounts = json; }),
        clearLocalAccountsSecurely: jest.fn(async () => { delete secureStore.localAccounts; }),
        clearAllSecureData: jest.fn(async () => { secureStore = {}; }),
    };
});

// ─── Mock encryption (imports expo-secure-store which is ESM) ─────────────────
jest.mock('../src/utils/encryption', () => ({
    getEncryptionKey: jest.fn(async () => 'mock-key'),
    encryptGoal: jest.fn((goal: unknown) => goal),
    decryptGoal: jest.fn((goal: unknown) => goal),
    encryptLoan: jest.fn((loan: unknown) => loan),
    decryptLoan: jest.fn((loan: unknown) => loan),
    encryptBudget: jest.fn((budget: unknown) => budget),
    decryptBudget: jest.fn((budget: unknown) => budget),
}));

import {
    saveTransactions,
    loadTransactions,
    saveGoals,
    loadGoals,
    setWorkspaceOwner,
    getWorkspaceOwnerId,
    clearLocalFinancialCache,
    localProfileMatchesEmail,
    registerLocalAccount,
    listLocalAccounts,
    switchLocalAccount,
    switchLocalAccountDirect,
    removeLocalAccount,
    ensureActiveAccountRegistered,
    savePin,
    saveAuthSecret,
    saveProfile,
    loadPin,
    loadAuthSecret,
    loadProfile,
    resolveWorkspaceRole,
    SNAPSHOT_HISTORY_KEYS,
} from '../src/utils/storage';
import * as secureStorageMock from '../src/utils/secureStorage';
import { supabase } from '../src/utils/supabase';

// ─── Test data helpers ────────────────────────────────────────────────────────

const makeTx = (overrides: Partial<Transaction> = {}): Transaction => ({
    id: 'tx-1',
    date: '2026-01-15',
    description: 'Test sale',
    type: 'income',
    category: 'Sales',
    amount: 5000,
    status: 'paid',
    ...overrides,
});

const makeGoal = (overrides: Partial<FinancialGoal> = {}): FinancialGoal => ({
    id: 'goal-1',
    type: 'revenue_growth',
    title: 'Grow Revenue',
    description: 'Reach 120k',
    targetValue: 120000,
    baselineValue: 100000,
    currentValue: 110000,
    deadline: '2027-01-01',
    createdAt: '2026-01-01',
    status: 'on_track',
    progress: 50,
    unit: '$',
    ...overrides,
});

// ─── Reset storage between tests ──────────────────────────────────────────────

beforeEach(async () => {
    await AsyncStorage.clear();
    await secureStorageMock.clearPinSecurely();
    await secureStorageMock.clearAuthSecretSecurely();
    await secureStorageMock.clearLocalAccountsSecurely();
    jest.clearAllMocks();
});

// ─── Transactions ─────────────────────────────────────────────────────────────

describe('saveTransactions / loadTransactions', () => {
    it('roundtrip: saved transactions are returned by load', async () => {
        const txs: Transaction[] = [
            makeTx({ id: 'tx-1', amount: 1000 }),
            makeTx({ id: 'tx-2', amount: 2500, type: 'expense', description: 'Office rent' }),
        ];

        await saveTransactions(txs);
        const loaded = await loadTransactions();

        expect(loaded).not.toBeNull();
        expect(loaded).toHaveLength(2);
        expect(loaded![0]).toMatchObject({ id: 'tx-1', amount: 1000 });
        expect(loaded![1]).toMatchObject({ id: 'tx-2', amount: 2500, type: 'expense' });
    });

    it('preserves all transaction fields through roundtrip', async () => {
        const tx = makeTx({
            id: 'tx-full',
            taxRate: 10,
            taxAmount: 100,
            isRecurring: true,
            recurringFrequency: 'monthly',
            dueDate: '2026-02-15',
            status: 'pending',
        });

        await saveTransactions([tx]);
        const loaded = await loadTransactions();

        expect(loaded![0]).toEqual(tx);
    });

    it('saving empty array means loading returns empty array (not null)', async () => {
        // First save some data
        await saveTransactions([makeTx()]);

        // Overwrite with empty array
        await saveTransactions([]);
        const loaded = await loadTransactions();

        // AsyncStorage has the key set to "[]" — so parse returns []
        expect(loaded).toEqual([]);
    });

    it('loading when nothing stored returns null', async () => {
        // AsyncStorage is clear (no key set)
        const loaded = await loadTransactions();
        expect(loaded).toBeNull();
    });

    it('loaded array is independent (mutation does not affect storage)', async () => {
        await saveTransactions([makeTx({ id: 'tx-1' })]);
        const loaded = await loadTransactions();
        loaded!.push(makeTx({ id: 'tx-injected' }));

        const loaded2 = await loadTransactions();
        expect(loaded2).toHaveLength(1);
    });

    it('multiple transactions maintain insertion order', async () => {
        const txs = [
            makeTx({ id: 'a', date: '2026-01-01' }),
            makeTx({ id: 'b', date: '2026-01-02' }),
            makeTx({ id: 'c', date: '2026-01-03' }),
        ];
        await saveTransactions(txs);
        const loaded = await loadTransactions();

        expect(loaded!.map(t => t.id)).toEqual(['a', 'b', 'c']);
    });

    it('overwrites previous save with new set', async () => {
        await saveTransactions([makeTx({ id: 'old-tx', amount: 999 })]);
        await saveTransactions([makeTx({ id: 'new-tx', amount: 123 })]);
        const loaded = await loadTransactions();

        expect(loaded).toHaveLength(1);
        expect(loaded![0].id).toBe('new-tx');
    });
});

// ─── Goals ────────────────────────────────────────────────────────────────────

describe('saveGoals / loadGoals', () => {
    it('roundtrip: saved goals are returned by load', async () => {
        const goals: FinancialGoal[] = [
            makeGoal({ id: 'g1', type: 'revenue_growth', targetValue: 120000 }),
            makeGoal({ id: 'g2', type: 'cost_reduction', targetValue: 50000 }),
        ];

        await saveGoals(goals);
        const loaded = await loadGoals();

        expect(loaded).not.toBeNull();
        expect(loaded).toHaveLength(2);
        expect(loaded![0]).toMatchObject({ id: 'g1', type: 'revenue_growth' });
        expect(loaded![1]).toMatchObject({ id: 'g2', type: 'cost_reduction' });
    });

    it('preserves all goal fields through roundtrip', async () => {
        const goal = makeGoal({
            id: 'g-full',
            type: 'margin_improvement',
            title: 'Improve Margin',
            description: 'Reach 70% margin',
            targetValue: 70,
            baselineValue: 40,
            currentValue: 55,
            deadline: '2026-12-31',
            createdAt: '2026-01-01',
            status: 'on_track',
            progress: 50,
            unit: '%',
        });

        await saveGoals([goal]);
        const loaded = await loadGoals();

        expect(loaded![0]).toEqual(goal);
    });

    it('saving empty goals array means loading returns empty array', async () => {
        await saveGoals([makeGoal()]);
        await saveGoals([]);
        const loaded = await loadGoals();

        expect(loaded).toEqual([]);
    });

    it('loading when nothing stored returns null', async () => {
        const loaded = await loadGoals();
        expect(loaded).toBeNull();
    });

    it('overwrites previous goals with new set', async () => {
        await saveGoals([makeGoal({ id: 'g-old' })]);
        await saveGoals([makeGoal({ id: 'g-new', type: 'cash_reserve' })]);
        const loaded = await loadGoals();

        expect(loaded).toHaveLength(1);
        expect(loaded![0].id).toBe('g-new');
        expect(loaded![0].type).toBe('cash_reserve');
    });
});

// ─── Workspace-owner cache ─────────────────────────────────────────────────────
// getWorkspaceOwnerId() falls back to this cached pointer before the current
// session's own user id -- every save/load in this file keys off it. If it
// survives an identity change (setup/recover/join), the new account keeps
// reading and writing whichever OTHER account this device last pointed at.
describe('clearLocalFinancialCache', () => {
    it('clears the cached workspace-owner pointer along with the other cached financial data', async () => {
        await setWorkspaceOwner('other-account-owner-id');
        expect(await AsyncStorage.getItem('@quad360/workspaceOwner')).toBe('other-account-owner-id');

        await clearLocalFinancialCache();

        expect(await AsyncStorage.getItem('@quad360/workspaceOwner')).toBeNull();
    });

    // Regression test for a second account (e.g. via the switcher, or a
    // fresh setup/recover on a device that previously had a different
    // account active) rendering the FIRST account's data as its own.
    // These specifically have no Supabase table backing them (see each
    // one's own comment in storage.ts) -- if any isn't cleared here, there
    // is NO other mechanism that will ever overwrite it with the new
    // account's own (empty) history, unlike cloud-backed entities that
    // self-correct once the new session's own data loads.
    it('clears every business-data key a second account on this device must never inherit', async () => {
        const leftoverKeys = [
            'quad360_learned_category_rules_v1',
            '@smeApp_bankProfiles',
            '@quad360/celebrated_goal_ids',
            '@quad360/monthly_mission',
            '@quad360/dismissed_alerts',
            '@quad360/milestones_seen',
            '@quad360/streak_date',
            '@quad360/streak_count',
            '@quad360/retention_last_seen',
            '@quad360/invoice_reminder_state',
        ];
        for (const key of leftoverKeys) {
            await AsyncStorage.setItem(key, JSON.stringify(['leftover-from-account-a']));
        }

        await clearLocalFinancialCache();

        for (const key of leftoverKeys) {
            expect(await AsyncStorage.getItem(key)).toBeNull();
        }
    });

    // Same regression, but asserted against SNAPSHOT_HISTORY_KEYS itself
    // rather than a hand-typed copy of it -- this is what actually closes
    // the loophole that let readinessHistory (once) and then
    // forecastHistory/dataConfidenceHistory (once more) ship without being
    // cleared here: any key added to SNAPSHOT_HISTORY_KEYS in storage.ts is
    // automatically covered by this test with no second list to remember
    // to update, instead of a bug class that could recur a fourth time.
    it('clears every snapshot-history key, driven directly from SNAPSHOT_HISTORY_KEYS', async () => {
        expect(SNAPSHOT_HISTORY_KEYS.length).toBeGreaterThan(0);
        for (const key of SNAPSHOT_HISTORY_KEYS) {
            await AsyncStorage.setItem(key, JSON.stringify(['leftover-from-account-a']));
        }

        await clearLocalFinancialCache();

        for (const key of SNAPSHOT_HISTORY_KEYS) {
            expect(await AsyncStorage.getItem(key)).toBeNull();
        }
    });
});

// ─── Cross-account login guard ─────────────────────────────────────────────────
// The email+PIN sign-in form falls back to a purely local PIN check
// (OptimizedContexts.tsx's login()) whenever the device doesn't hold this
// account's real Supabase secret. That local check has no way to know which
// email the caller intends -- localProfileMatchesEmail is the gate that
// stops it from silently unlocking whichever OTHER account happens to be
// cached on this device, e.g. two test accounts sharing the same PIN.
describe('localProfileMatchesEmail', () => {
    it('matches when the cached profile email equals the typed email', () => {
        expect(localProfileMatchesEmail({ email: 'a@example.com', businessName: 'A' }, 'a@example.com')).toBe(true);
    });

    it('is case-insensitive and trims whitespace on both sides', () => {
        expect(localProfileMatchesEmail({ email: 'A@Example.com', businessName: 'A' }, '  a@example.com  ')).toBe(true);
    });

    it('does not match a different account\'s email, even with matching PIN elsewhere', () => {
        expect(localProfileMatchesEmail({ email: 'account-a@example.com', businessName: 'A' }, 'account-b@example.com')).toBe(false);
    });

    it('does not match when there is no local profile at all', () => {
        expect(localProfileMatchesEmail(null, 'anyone@example.com')).toBe(false);
    });
});

// ─── Multi-account switcher registry ───────────────────────────────────────
// The single pin/authSecret/profile slots hold only whichever ONE account is
// currently active on this device -- this additive registry is what lets a
// second account sharing the same browser survive being temporarily not the
// active one, and be switched back to without a full PIN reset.
describe('registerLocalAccount / listLocalAccounts', () => {
    it('registers a new account and lists it back as a safe summary', async () => {
        await registerLocalAccount('owner@example.com', 'Owner Biz', '111111', 'secret-a', '2026-01-01T00:00:00.000Z');

        const accounts = await listLocalAccounts();
        expect(accounts).toEqual([
            { email: 'owner@example.com', businessName: 'Owner Biz', createdAt: '2026-01-01T00:00:00.000Z' },
        ]);
        // Never leaks the PIN hash or the real Supabase secret into the
        // UI-facing summary.
        expect(accounts[0]).not.toHaveProperty('pinHash');
        expect(accounts[0]).not.toHaveProperty('authSecret');
    });

    it('accumulates multiple distinct accounts', async () => {
        await registerLocalAccount('a@example.com', 'Biz A', '111111', 'secret-a', '2026-01-01T00:00:00.000Z');
        await registerLocalAccount('b@example.com', 'Biz B', '222222', 'secret-b', '2026-01-02T00:00:00.000Z');

        const accounts = await listLocalAccounts();
        expect(accounts.map(a => a.email)).toEqual(['a@example.com', 'b@example.com']);
    });

    it('upserts by email (case-insensitive) instead of duplicating', async () => {
        await registerLocalAccount('owner@example.com', 'Old Name', '111111', 'secret-old', '2026-01-01T00:00:00.000Z');
        await registerLocalAccount('Owner@Example.com', 'New Name', '222222', 'secret-new', '2026-01-01T00:00:00.000Z');

        const accounts = await listLocalAccounts();
        expect(accounts).toHaveLength(1);
        expect(accounts[0].businessName).toBe('New Name');
    });

    it('preserves the existing business name when re-registered with a blank one', async () => {
        await registerLocalAccount('owner@example.com', 'Real Business Name', '111111', 'secret-a', '2026-01-01T00:00:00.000Z');
        // e.g. a recovery flow that only knows the email at this point.
        await registerLocalAccount('owner@example.com', '', '333333', 'secret-rotated', '2026-01-01T00:00:00.000Z');

        const accounts = await listLocalAccounts();
        expect(accounts[0].businessName).toBe('Real Business Name');
    });
});

describe('switchLocalAccount', () => {
    it('mirrors the target account into the active pin/authSecret/profile slots on a correct PIN', async () => {
        await registerLocalAccount('a@example.com', 'Biz A', '111111', 'secret-a', '2026-01-01T00:00:00.000Z');
        await registerLocalAccount('b@example.com', 'Biz B', '222222', 'secret-b', '2026-01-02T00:00:00.000Z');

        const result = await switchLocalAccount('b@example.com', '222222');

        expect(result).toBe('ok');
        expect(await loadAuthSecret()).toBe('secret-b');
        expect(await loadProfile()).toMatchObject({ email: 'b@example.com', businessName: 'Biz B' });
        // The stored PIN is the hash, not raw -- loadPin() returns whatever
        // savePinSecurely was called with, matching what login() re-hashes
        // and compares against.
        expect(await loadPin()).toBeTruthy();
    });

    it('rejects a wrong PIN without touching the active slots', async () => {
        await registerLocalAccount('a@example.com', 'Biz A', '111111', 'secret-a', '2026-01-01T00:00:00.000Z');

        const result = await switchLocalAccount('a@example.com', '000000');

        expect(result).toBe('wrong-pin');
        expect(await loadAuthSecret()).toBeNull();
        expect(await loadProfile()).toBeNull();
    });

    it('reports not-found for an email this device has never registered', async () => {
        const result = await switchLocalAccount('stranger@example.com', '111111');
        expect(result).toBe('not-found');
    });

    it('switching back and forth between two accounts does not corrupt either one', async () => {
        await registerLocalAccount('a@example.com', 'Biz A', '111111', 'secret-a', '2026-01-01T00:00:00.000Z');
        await registerLocalAccount('b@example.com', 'Biz B', '222222', 'secret-b', '2026-01-02T00:00:00.000Z');

        await switchLocalAccount('a@example.com', '111111');
        expect(await loadProfile()).toMatchObject({ email: 'a@example.com' });

        await switchLocalAccount('b@example.com', '222222');
        expect(await loadProfile()).toMatchObject({ email: 'b@example.com' });

        // Both registrations survive the switching -- neither PIN was
        // silently rehashed or dropped along the way.
        expect(await switchLocalAccount('a@example.com', '111111')).toBe('ok');
        expect(await switchLocalAccount('b@example.com', '222222')).toBe('ok');
    });
});

// The in-app switcher (Header) -- no PIN, since the device is already
// unlocked and rendering real data for one account by the time this is
// reachable at all. Same mirroring behavior as switchLocalAccount, just
// without the PIN gate.
describe('switchLocalAccountDirect', () => {
    it('mirrors the target account into the active slots without a PIN', async () => {
        await registerLocalAccount('a@example.com', 'Biz A', '111111', 'secret-a', '2026-01-01T00:00:00.000Z');
        await registerLocalAccount('b@example.com', 'Biz B', '222222', 'secret-b', '2026-01-02T00:00:00.000Z');

        const result = await switchLocalAccountDirect('b@example.com');

        expect(result).toBe('ok');
        expect(await loadAuthSecret()).toBe('secret-b');
        expect(await loadProfile()).toMatchObject({ email: 'b@example.com', businessName: 'Biz B' });
    });

    it('reports not-found for an email this device has never registered', async () => {
        const result = await switchLocalAccountDirect('stranger@example.com');
        expect(result).toBe('not-found');
    });
});

// The account registry (registerLocalAccount et al) shipped well after the
// single active pin/profile/authSecret slots it sits on top of -- an
// account whose most recent setup/recovery/reset on a device predates the
// registry has a perfectly working PIN and session, but was never written
// into it. Without this backfill, that account is invisible to Switch
// Account until it happens to go through another reset.
describe('ensureActiveAccountRegistered', () => {
    it('backfills the currently active account when it is missing from the registry', async () => {
        await savePin('444444');
        await saveAuthSecret('secret-legacy');
        await saveProfile({ email: 'legacy@example.com', businessName: 'Legacy Biz', createdAt: '2025-06-01T00:00:00.000Z' });
        expect(await listLocalAccounts()).toEqual([]);

        await ensureActiveAccountRegistered();

        const accounts = await listLocalAccounts();
        expect(accounts).toEqual([
            { email: 'legacy@example.com', businessName: 'Legacy Biz', createdAt: '2025-06-01T00:00:00.000Z' },
        ]);
        // The backfilled record must verify against the SAME PIN this
        // account already unlocks with, not a freshly (re)hashed one.
        expect(await switchLocalAccountDirect('legacy@example.com')).toBe('ok');
    });

    it('does nothing when the active account is already registered', async () => {
        await registerLocalAccount('a@example.com', 'Biz A', '111111', 'secret-a', '2026-01-01T00:00:00.000Z');
        await savePin('111111');
        await saveAuthSecret('secret-a');
        await saveProfile({ email: 'a@example.com', businessName: 'Biz A', createdAt: '2026-01-01T00:00:00.000Z' });

        await ensureActiveAccountRegistered();

        expect(await listLocalAccounts()).toHaveLength(1);
    });

    it('is a no-op when there is no active profile at all', async () => {
        await ensureActiveAccountRegistered();
        expect(await listLocalAccounts()).toEqual([]);
    });
});

describe('removeLocalAccount', () => {
    it('removes only the target account, leaving the others registered', async () => {
        await registerLocalAccount('a@example.com', 'Biz A', '111111', 'secret-a', '2026-01-01T00:00:00.000Z');
        await registerLocalAccount('b@example.com', 'Biz B', '222222', 'secret-b', '2026-01-02T00:00:00.000Z');

        await removeLocalAccount('a@example.com');

        const accounts = await listLocalAccounts();
        expect(accounts.map(a => a.email)).toEqual(['b@example.com']);
    });

    it('is a no-op for an email that was never registered', async () => {
        await registerLocalAccount('a@example.com', 'Biz A', '111111', 'secret-a', '2026-01-01T00:00:00.000Z');

        await removeLocalAccount('nobody@example.com');

        expect(await listLocalAccounts()).toHaveLength(1);
    });

    it('is a no-op for a null/undefined email', async () => {
        await registerLocalAccount('a@example.com', 'Biz A', '111111', 'secret-a', '2026-01-01T00:00:00.000Z');

        await removeLocalAccount(undefined);
        await removeLocalAccount(null);

        expect(await listLocalAccounts()).toHaveLength(1);
    });
});

// ─── Workspace role resolution ─────────────────────────────────────────────
// Regression coverage for a real privilege-escalation bug: switching into
// (or simply reloading while inside) another business's workspace used to
// leave this device's effective role hardcoded/defaulted to full owner
// permissions, regardless of the invited team_members role actually on
// file for that business. resolveWorkspaceRole() is the one place that
// decides this now -- it must never grant an elevated role it hasn't
// verified straight from team_members, and must fail CLOSED (never to
// 'owner') when that verification can't be done.
function mockSession(userId: string | null) {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
        data: { session: userId ? { user: { id: userId } } : null },
    });
}

function mockTeamMembersRoleLookup(result: { data: { role: string } | null; error: unknown }) {
    jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'team_members') {
            return {
                select: () => ({
                    eq: () => ({
                        eq: () => ({
                            eq: () => ({
                                maybeSingle: jest.fn(async () => result),
                            }),
                        }),
                    }),
                }),
            } as any;
        }
        return { upsert: jest.fn(async () => ({ error: null })), select: () => ({ eq: () => ({ single: jest.fn(async () => ({ data: null, error: null })), order: () => Promise.resolve({ data: null, error: null }) }) }) } as any;
    });
}

describe('resolveWorkspaceRole', () => {
    it("returns 'owner' when no workspace pointer is cached (device acting as its own account)", async () => {
        mockSession('me-1');
        expect(await resolveWorkspaceRole()).toBe('owner');
    });

    it("returns 'owner' when the workspace pointer names the signed-in user's own id", async () => {
        mockSession('me-1');
        await setWorkspaceOwner('me-1');
        expect(await resolveWorkspaceRole()).toBe('owner');
    });

    it('returns the real, currently-active team_members role for a workspace the device switched into', async () => {
        mockSession('me-1');
        await setWorkspaceOwner('owner-biz-1');
        mockTeamMembersRoleLookup({ data: { role: 'staff' }, error: null });

        expect(await resolveWorkspaceRole()).toBe('staff');
    });

    it('never upgrades a restricted role to owner just because the workspace switch succeeded', async () => {
        mockSession('me-1');
        await setWorkspaceOwner('owner-biz-1');
        mockTeamMembersRoleLookup({ data: { role: 'admin' }, error: null });

        // 'admin' is real and should pass through verbatim -- but must never
        // silently become 'owner', the exact bug this test guards against.
        expect(await resolveWorkspaceRole()).toBe('admin');
    });

    it('fails CLOSED (reverts to the caller\'s own workspace) when no active membership exists for the named business', async () => {
        mockSession('me-1');
        await setWorkspaceOwner('owner-biz-1');
        mockTeamMembersRoleLookup({ data: null, error: null });

        expect(await resolveWorkspaceRole()).toBe('owner');
        // The stale/invalid pointer must not survive -- otherwise every
        // subsequent screen render keeps re-deriving 'owner' against a
        // workspace this device was never actually granted access to.
        expect(await getWorkspaceOwnerId()).toBe('me-1');
    });

    it('fails CLOSED (never grants owner over the OTHER business) when the membership lookup errors', async () => {
        mockSession('me-1');
        await setWorkspaceOwner('owner-biz-1');
        mockTeamMembersRoleLookup({ data: null, error: new Error('network error') });

        expect(await resolveWorkspaceRole()).toBe('owner');
        expect(await getWorkspaceOwnerId()).toBe('me-1');
    });
});
