import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkLenderPortfolioForWorseningRisk } from '../utils/notifications';
import { LoanMonitoringShareRow } from '../utils/loanMonitoringShare';

function share(overrides: Partial<LoanMonitoringShareRow>): LoanMonitoringShareRow {
    return {
        id: 'share-1', loanId: 'loan-1', businessName: 'Demo Business',
        status: 'healthy', readinessTrend: null, dscrFlag: false, revenueDeclineFlag: false, repaymentPaceFlag: false,
        fundedAt: '2026-01-01', updatedAt: '2026-01-01', expiresAt: '2026-12-01',
        ...overrides,
    };
}

describe('checkLenderPortfolioForWorseningRisk', () => {
    beforeEach(async () => {
        await AsyncStorage.clear();
    });

    it('does not flag a share the very first time it is seen', async () => {
        const worsened = await checkLenderPortfolioForWorseningRisk([share({ id: 'a', status: 'at-risk' })]);
        expect(worsened).toEqual([]);
    });

    it('flags a share that worsened since the last check', async () => {
        await checkLenderPortfolioForWorseningRisk([share({ id: 'a', status: 'healthy' })]);
        const worsened = await checkLenderPortfolioForWorseningRisk([share({ id: 'a', status: 'at-risk' })]);
        expect(worsened.map(w => w.id)).toEqual(['a']);
    });

    it('does not flag a share that improved', async () => {
        await checkLenderPortfolioForWorseningRisk([share({ id: 'a', status: 'at-risk' })]);
        const worsened = await checkLenderPortfolioForWorseningRisk([share({ id: 'a', status: 'healthy' })]);
        expect(worsened).toEqual([]);
    });

    it('does not flag a share whose status is unchanged', async () => {
        await checkLenderPortfolioForWorseningRisk([share({ id: 'a', status: 'watch' })]);
        const worsened = await checkLenderPortfolioForWorseningRisk([share({ id: 'a', status: 'watch' })]);
        expect(worsened).toEqual([]);
    });

    it('tracks multiple shares independently', async () => {
        await checkLenderPortfolioForWorseningRisk([
            share({ id: 'a', status: 'healthy' }),
            share({ id: 'b', status: 'watch' }),
        ]);
        const worsened = await checkLenderPortfolioForWorseningRisk([
            share({ id: 'a', status: 'at-risk' }), // worsened
            share({ id: 'b', status: 'watch' }),    // unchanged
        ]);
        expect(worsened.map(w => w.id)).toEqual(['a']);
    });
});
