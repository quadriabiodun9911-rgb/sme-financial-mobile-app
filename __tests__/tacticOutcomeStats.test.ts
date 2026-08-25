let mockRpcResponse: { data: any; error: any } = { data: null, error: null };
let mockUser: { id: string } | null = { id: 'user-1' };
let mockInsertCalls: any[] = [];

jest.mock('../src/utils/supabase', () => ({
    supabase: {
        auth: { getUser: () => Promise.resolve({ data: { user: mockUser } }) },
        from: jest.fn(() => ({
            insert: (row: any) => { mockInsertCalls.push(row); return Promise.resolve({ data: null, error: null }); },
        })),
        rpc: jest.fn(() => Promise.resolve(mockRpcResponse)),
    },
}));

import { syncTacticOutcomeSample, loadTacticOutcomeStats } from '../src/utils/tacticOutcomeStats';

beforeEach(() => {
    mockRpcResponse = { data: null, error: null };
    mockUser = { id: 'user-1' };
    mockInsertCalls = [];
});

describe('syncTacticOutcomeSample', () => {
    it('inserts a row scoped to the authenticated user', async () => {
        await syncTacticOutcomeSample('crisis-collections', true, 87);
        expect(mockInsertCalls).toHaveLength(1);
        expect(mockInsertCalls[0]).toMatchObject({
            user_id: 'user-1', tactic_id: 'crisis-collections', succeeded: true, impact_percentage: 87,
        });
    });

    it('does nothing when there is no authenticated user', async () => {
        mockUser = null;
        await syncTacticOutcomeSample('crisis-collections', true, 87);
        expect(mockInsertCalls).toHaveLength(0);
    });
});

describe('loadTacticOutcomeStats', () => {
    it('returns null when the RPC finds fewer than the minimum sample size (empty result)', async () => {
        mockRpcResponse = { data: [], error: null };
        expect(await loadTacticOutcomeStats('crisis-collections')).toBeNull();
    });

    it('returns null on an RPC error', async () => {
        mockRpcResponse = { data: null, error: { message: 'boom' } };
        expect(await loadTacticOutcomeStats('crisis-collections')).toBeNull();
    });

    it('returns the real stats once enough samples exist', async () => {
        mockRpcResponse = { data: [{ sample_count: 14, success_rate: 71, avg_impact_pct: 82 }], error: null };
        const stats = await loadTacticOutcomeStats('crisis-collections');
        expect(stats).toEqual({ sampleCount: 14, successRatePct: 71, avgImpactPct: 82 });
    });
});
