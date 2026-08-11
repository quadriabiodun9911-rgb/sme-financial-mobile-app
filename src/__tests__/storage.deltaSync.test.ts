import { diffChangedRows, recordSyncedRows, resetSyncDiffCache } from '../utils/storage';

// Covers the delta-sync helpers introduced to stop save*() functions in
// storage.ts from re-encrypting and re-uploading every record on every
// single mutation. Correctness here matters directly for whether a user's
// financial data actually reaches Supabase -- a bug that makes a changed
// record look "already synced" would silently drop it.

interface Item { id: string; value: number }

describe('delta-sync diff cache', () => {
    afterEach(() => {
        resetSyncDiffCache();
    });

    it('treats every record as changed when there is no prior baseline', () => {
        const items: Item[] = [{ id: 'a', value: 1 }, { id: 'b', value: 2 }];
        expect(diffChangedRows('test-entity', items)).toEqual(items);
    });

    it('returns an empty array when nothing changed since the last recorded sync', () => {
        const items: Item[] = [{ id: 'a', value: 1 }, { id: 'b', value: 2 }];
        recordSyncedRows('test-entity', items);
        // Same array reference passed again (mirrors a save effect firing
        // with no actual mutation in between).
        expect(diffChangedRows('test-entity', items)).toEqual([]);
    });

    it('finds only the genuinely updated record, not untouched siblings', () => {
        const original: Item[] = [{ id: 'a', value: 1 }, { id: 'b', value: 2 }, { id: 'c', value: 3 }];
        recordSyncedRows('test-entity', original);

        // Mirrors OptimizedContexts.tsx's updateTransaction pattern:
        // prev.map(t => t.id === id ? {...t, ...patch} : t) -- untouched
        // entries keep their original object reference.
        const updated = original.map(item => (item.id === 'b' ? { ...item, value: 99 } : item));

        const changed = diffChangedRows('test-entity', updated);
        expect(changed).toEqual([{ id: 'b', value: 99 }]);
    });

    it('finds a newly-added record without flagging existing ones', () => {
        const original: Item[] = [{ id: 'a', value: 1 }];
        recordSyncedRows('test-entity', original);

        const withAddition = [...original, { id: 'b', value: 2 }];
        const changed = diffChangedRows('test-entity', withAddition);
        expect(changed).toEqual([{ id: 'b', value: 2 }]);
    });

    it('does not resurrect a deleted record as "changed"', () => {
        const original: Item[] = [{ id: 'a', value: 1 }, { id: 'b', value: 2 }];
        recordSyncedRows('test-entity', original);

        const afterDelete = original.filter(item => item.id !== 'b');
        expect(diffChangedRows('test-entity', afterDelete)).toEqual([]);
    });

    it('keeps separate baselines per entity so one save() does not mask another', () => {
        const txs: Item[] = [{ id: 'tx1', value: 100 }];
        const goals: Item[] = [{ id: 'goal1', value: 5000 }];
        recordSyncedRows('transactions', txs);
        // 'goals' has no baseline yet -- must still report as fully unsynced,
        // regardless of 'transactions' already being recorded.
        expect(diffChangedRows('goals', goals)).toEqual(goals);
    });

    it('resetSyncDiffCache clears every entity, not just one', () => {
        const items: Item[] = [{ id: 'a', value: 1 }];
        recordSyncedRows('transactions', items);
        recordSyncedRows('goals', items);
        resetSyncDiffCache();
        expect(diffChangedRows('transactions', items)).toEqual(items);
        expect(diffChangedRows('goals', items)).toEqual(items);
    });

    it('re-recording after a successful sync establishes a fresh baseline', () => {
        const v1: Item[] = [{ id: 'a', value: 1 }];
        recordSyncedRows('test-entity', v1);

        const v2 = [{ ...v1[0], value: 2 }];
        expect(diffChangedRows('test-entity', v2)).toEqual(v2);

        // Simulates a successful upsert of v2 -- recordSyncedRows should be
        // called with the FULL current array, establishing it as the new
        // baseline so a subsequent unchanged save produces no diff.
        recordSyncedRows('test-entity', v2);
        expect(diffChangedRows('test-entity', v2)).toEqual([]);
    });
});
