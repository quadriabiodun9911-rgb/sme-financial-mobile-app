import { enqueue, dequeue, getQueue, queueSize, flushQueue } from '../src/utils/syncQueue';

jest.mock('@react-native-async-storage/async-storage', () => {
    let store: Record<string, string> = {};
    return {
        getItem: jest.fn(async (key: string) => store[key] ?? null),
        setItem: jest.fn(async (key: string, value: string) => { store[key] = value; }),
        clear: jest.fn(async () => { store = {}; }),
    };
});

import AsyncStorage from '@react-native-async-storage/async-storage';

beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
});

// Helper: build a minimal op (without id/queuedAt/attempts)
const makeOp = (overrides: Partial<Parameters<typeof enqueue>[0]> = {}): Parameters<typeof enqueue>[0] => ({
    table: 'transactions',
    op: 'upsert',
    rows: [{ id: 'row1', data: { amount: 100 } }],
    userId: 'user-abc',
    ...overrides,
});

const makeMockSupabase = (shouldFail = false) => ({
    from: () => ({
        upsert: jest.fn(async () => shouldFail ? { error: { message: 'fail' } } : { error: null }),
        delete: () => ({ in: jest.fn(async () => ({ error: null })) }),
        // select().in() used by conflict resolution — return empty array so local always wins
        select: () => ({ in: jest.fn(async () => ({ data: [] })), eq: () => ({ single: async () => ({ data: null }) }) }),
    }),
});

// ─── enqueue ─────────────────────────────────────────────────────────────────

describe('enqueue', () => {
    it('adds an item to the queue', async () => {
        await enqueue(makeOp());
        const size = await queueSize();
        expect(size).toBe(1);
    });

    it('returns queue with expected fields on item', async () => {
        await enqueue(makeOp({ table: 'goals', userId: 'u1' }));
        const q = await getQueue();
        expect(q).toHaveLength(1);
        expect(q[0]).toMatchObject({ table: 'goals', userId: 'u1', op: 'upsert', attempts: 0 });
        expect(typeof q[0].id).toBe('string');
        expect(typeof q[0].queuedAt).toBe('string');
    });

    it('deduplicates upserts for same table+userId — second replaces first', async () => {
        const firstRows = [{ id: 'r1', data: 'old' }];
        const secondRows = [{ id: 'r1', data: 'new' }, { id: 'r2', data: 'extra' }];

        await enqueue(makeOp({ table: 'transactions', userId: 'u1', rows: firstRows }));
        await enqueue(makeOp({ table: 'transactions', userId: 'u1', rows: secondRows }));

        const q = await getQueue();
        // Still one entry (deduped)
        expect(q).toHaveLength(1);
        // Rows replaced with newer payload
        expect(q[0].rows).toEqual(secondRows);
        // attempts reset to 0
        expect(q[0].attempts).toBe(0);
    });

    it('does NOT deduplicate when table differs', async () => {
        await enqueue(makeOp({ table: 'transactions', userId: 'u1' }));
        await enqueue(makeOp({ table: 'goals', userId: 'u1' }));
        expect(await queueSize()).toBe(2);
    });

    it('does NOT deduplicate when userId differs', async () => {
        await enqueue(makeOp({ table: 'transactions', userId: 'user-a' }));
        await enqueue(makeOp({ table: 'transactions', userId: 'user-b' }));
        expect(await queueSize()).toBe(2);
    });

    it('does NOT deduplicate delete ops against upsert ops', async () => {
        await enqueue(makeOp({ table: 'transactions', userId: 'u1', op: 'upsert' }));
        await enqueue(makeOp({ table: 'transactions', userId: 'u1', op: 'delete', rows: ['r1'] }));
        expect(await queueSize()).toBe(2);
    });
});

// ─── dequeue ─────────────────────────────────────────────────────────────────

describe('dequeue', () => {
    it('removes item by id', async () => {
        await enqueue(makeOp({ table: 'transactions', userId: 'u1' }));
        const q = await getQueue();
        const id = q[0].id;
        await dequeue(id);
        expect(await queueSize()).toBe(0);
    });

    it('leaves other items intact when removing by id', async () => {
        await enqueue(makeOp({ table: 'transactions', userId: 'u1' }));
        await enqueue(makeOp({ table: 'goals', userId: 'u1' }));
        const q = await getQueue();
        await dequeue(q[0].id);
        const remaining = await getQueue();
        expect(remaining).toHaveLength(1);
        expect(remaining[0].table).toBe('goals');
    });

    it('is a no-op when id does not exist', async () => {
        await enqueue(makeOp());
        await dequeue('nonexistent-id');
        expect(await queueSize()).toBe(1);
    });
});

// ─── queueSize ───────────────────────────────────────────────────────────────

describe('queueSize', () => {
    it('returns 0 for empty queue', async () => {
        expect(await queueSize()).toBe(0);
    });

    it('returns correct count after multiple enqueues', async () => {
        await enqueue(makeOp({ table: 'transactions', userId: 'u1' }));
        await enqueue(makeOp({ table: 'goals', userId: 'u1' }));
        await enqueue(makeOp({ table: 'assets', userId: 'u1' }));
        expect(await queueSize()).toBe(3);
    });
});

// ─── flushQueue ──────────────────────────────────────────────────────────────

describe('flushQueue', () => {
    it('returns zeros when queue is empty', async () => {
        const result = await flushQueue(makeMockSupabase());
        expect(result).toEqual({ synced: 0, failed: 0 });
    });

    it('calls supabase upsert for each queued upsert item and removes on success', async () => {
        await enqueue(makeOp({ table: 'transactions', userId: 'u1' }));
        // Use a different table so dedup doesn't collapse the two ops into one
        await enqueue(makeOp({ table: 'goals', userId: 'u1' }));

        const upsertSpy = jest.fn().mockResolvedValue({ error: null });
        const sb = {
            from: jest.fn().mockReturnValue({
                upsert: upsertSpy,
                delete: jest.fn().mockReturnValue({ in: jest.fn().mockResolvedValue({ error: null }) }),
                select: jest.fn().mockReturnValue({
                    in: jest.fn().mockResolvedValue({ data: [] }),
                    eq: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: null }) }),
                }),
            }),
        };

        const result = await flushQueue(sb);
        expect(result.synced).toBe(2);
        expect(result.failed).toBe(0);
        expect(upsertSpy).toHaveBeenCalledTimes(2);
        // Queue should now be empty
        expect(await queueSize()).toBe(0);
    });

    it('increments attempts on failure and keeps item in queue', async () => {
        await enqueue(makeOp({ table: 'transactions', userId: 'u1' }));
        const supabase = makeMockSupabase(true);

        const result = await flushQueue(supabase);
        expect(result.synced).toBe(0);
        expect(result.failed).toBe(1);

        const q = await getQueue();
        expect(q).toHaveLength(1);
        expect(q[0].attempts).toBe(1);
    });

    it('removes item from queue after 10 failed attempts', async () => {
        await enqueue(makeOp({ table: 'transactions', userId: 'u1' }));
        const supabase = makeMockSupabase(true);

        // Flush 10 times — each failure increments attempts; on the 10th it gets dropped
        for (let i = 0; i < 10; i++) {
            await flushQueue(supabase);
        }

        expect(await queueSize()).toBe(0);
    });

    it('calls supabase delete for queued delete ops', async () => {
        await enqueue(makeOp({ table: 'transactions', userId: 'u1', op: 'delete', rows: ['id-1', 'id-2'] }));

        const inFn = jest.fn(async () => ({ error: null }));
        const sb = {
            from: () => ({
                upsert: jest.fn(async () => ({ error: null })),
                delete: () => ({ in: inFn }),
                select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }),
            }),
        };

        const result = await flushQueue(sb);
        expect(result.synced).toBe(1);
        expect(result.failed).toBe(0);
        // in() is called as .in('id', ['id-1', 'id-2'])
        expect(inFn).toHaveBeenCalledWith('id', ['id-1', 'id-2']);
        expect(await queueSize()).toBe(0);
    });

    it('reports progress via onProgress callback', async () => {
        await enqueue(makeOp({ table: 'transactions', userId: 'u1' }));
        await enqueue(makeOp({ table: 'goals', userId: 'u1' }));

        const sb = makeMockSupabase(false);

        const progressCalls: Array<[number, number]> = [];
        await flushQueue(sb, (synced, total) => {
            progressCalls.push([synced, total]);
        });

        // onProgress called once per item (total=2, synced increments)
        expect(progressCalls.length).toBe(2);
        expect(progressCalls[0]).toEqual([1, 2]);
        expect(progressCalls[1]).toEqual([2, 2]);
    });

    // TODO: flushQueue does not currently implement conflict resolution
    // (skipping items where remote updated_at is newer than local queuedAt).
    // When that feature is added, add a test here that:
    // 1. Enqueues an item with an old queuedAt
    // 2. Mocks supabase.from().select() to return a row with a newer updated_at
    // 3. Asserts the item is dequeued (skipped) without calling upsert
});
