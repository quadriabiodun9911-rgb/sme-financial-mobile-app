import AsyncStorage from '@react-native-async-storage/async-storage';
import { detectMilestones } from '../src/components/RetentionNudges';
import { Transaction } from '../src/types';

const makeTx = (overrides: Partial<Transaction>): Transaction => ({
    id: `tx-${Math.random()}`,
    date: '2026-01-01',
    description: 'Test',
    type: 'income',
    category: 'Sales',
    amount: 1000,
    status: 'paid',
    ...overrides,
});

beforeEach(async () => {
    await AsyncStorage.clear();
});

describe('detectMilestones — ladder collapsing', () => {
    it('surfaces only the highest revenue rung when several are crossed in one bulk import, and marks the rest seen', async () => {
        // 18 transactions totalling $600k income — crosses both $100k and
        // $500k revenue rungs, and several tx-count rungs, in a single call.
        const txs: Transaction[] = Array.from({ length: 18 }, (_, i) =>
            makeTx({ type: 'income', amount: i < 6 ? 100000 : 0 })
        );
        const milestone = await detectMilestones(txs, '$', 465000);
        expect(milestone?.id).toBe('income_500k');

        // A second call with the same data returns nothing new — including
        // income_100k, which was silently marked seen alongside income_500k.
        const second = await detectMilestones(txs, '$', 465000);
        expect(second).toBeNull();
    });

    it('surfaces only the highest tx-count rung reached, not one per threshold', async () => {
        const txs: Transaction[] = Array.from({ length: 55 }, () => makeTx({ type: 'income', amount: 100 }));
        const milestone = await detectMilestones(txs, '$', 0);
        expect(milestone?.id).toBe('fifty_tx');

        const second = await detectMilestones(txs, '$', 0);
        expect(second).toBeNull();
    });

    it('still fires a tx-count milestone when the count jumps past the exact threshold (bulk import skipping over 10)', async () => {
        // A single bulk save landing at 15 transactions never hits totalTx === 10
        // exactly — the old exact-match check would have silently skipped the
        // "10 transactions" milestone forever.
        const txs: Transaction[] = Array.from({ length: 15 }, () => makeTx({ type: 'income', amount: 100 }));
        const milestone = await detectMilestones(txs, '$', 0);
        expect(milestone?.id).toBe('ten_tx');
    });

    it('prefers the revenue milestone over a tx-count milestone crossed in the same call', async () => {
        const txs: Transaction[] = Array.from({ length: 10 }, () => makeTx({ type: 'income', amount: 10000 })); // 10 tx, $100k
        const milestone = await detectMilestones(txs, '$', 100000);
        expect(milestone?.id).toBe('income_100k');

        // The ten_tx rung was marked seen alongside it, not left to pop up later.
        const moreTx: Transaction[] = [...txs, makeTx({ type: 'expense', category: 'Other', amount: 500 })];
        const second = await detectMilestones(moreTx, '$', 99500);
        expect(second).toBeNull();
    });
});
