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

// ─── Mock secureStorage (used by clearAllData) ────────────────────────────────
jest.mock('../src/utils/secureStorage', () => ({
    savePinSecurely: jest.fn(async () => {}),
    loadPinSecurely: jest.fn(async () => null),
    clearPinSecurely: jest.fn(async () => {}),
    clearAllSecureData: jest.fn(async () => {}),
}));

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
} from '../src/utils/storage';

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
