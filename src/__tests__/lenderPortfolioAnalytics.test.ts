import { computeLenderExposureConcentration, computeLenderPortfolioOutcomes } from '../utils/loanMonitoringShare';
import { LoanMonitoringShareRow } from '../utils/loanMonitoringShare';

function share(overrides: Partial<LoanMonitoringShareRow>): LoanMonitoringShareRow {
    return {
        id: `s-${Math.random()}`, loanId: `l-${Math.random()}`, businessName: 'Demo Business',
        status: 'healthy', readinessTrend: null, dscrFlag: false, revenueDeclineFlag: false, repaymentPaceFlag: false,
        principalBand: '500K–2M', currency: '₦',
        fundedAt: '2026-01-01', updatedAt: '2026-01-01', expiresAt: '2026-12-01',
        ...overrides,
    };
}

describe('computeLenderExposureConcentration', () => {
    it('flags a single business dominating the book as high risk', () => {
        const shares = [
            share({ businessName: 'Big Co', principalBand: '10M–50M' }), // 30M
            share({ businessName: 'Small Co', principalBand: 'Under 500K' }), // 250K
            share({ businessName: 'Small Co 2', principalBand: 'Under 500K' }), // 250K
        ];
        const groups = computeLenderExposureConcentration(shares, 'business');
        const big = groups.find(g => g.label === 'Big Co')!;
        expect(big.risk).toBe('high');
        expect(big.percentage).toBeGreaterThan(90);
    });

    it('groups multiple loans to the same business together', () => {
        const shares = [
            share({ businessName: 'Repeat Co', principalBand: '2M–10M' }),
            share({ businessName: 'Repeat Co', principalBand: '2M–10M' }),
        ];
        const groups = computeLenderExposureConcentration(shares, 'business');
        expect(groups).toHaveLength(1);
        expect(groups[0].loanCount).toBe(2);
        expect(groups[0].percentage).toBeCloseTo(100, 5);
    });

    it('keeps currencies separate rather than mixing them into one total', () => {
        const shares = [
            share({ businessName: 'Naira Co', currency: '₦', principalBand: '2M–10M' }),
            share({ businessName: 'Dollar Co', currency: '$', principalBand: '2M–10M' }),
        ];
        const groups = computeLenderExposureConcentration(shares, 'business');
        expect(groups.every(g => g.percentage === 100)).toBe(true);
        expect(new Set(groups.map(g => g.currency))).toEqual(new Set(['₦', '$']));
    });

    it('excludes rows with no currency or principal band', () => {
        const shares = [share({ currency: undefined, principalBand: undefined })];
        expect(computeLenderExposureConcentration(shares, 'business')).toEqual([]);
    });

    it('groups by loan purpose when that dimension is requested', () => {
        const shares = [
            share({ businessName: 'A', loanPurpose: 'Working capital', principalBand: '2M–10M' }),
            share({ businessName: 'B', loanPurpose: 'Working capital', principalBand: '2M–10M' }),
            share({ businessName: 'C', loanPurpose: 'Asset financing', principalBand: 'Under 500K' }),
        ];
        const groups = computeLenderExposureConcentration(shares, 'purpose');
        const workingCapital = groups.find(g => g.label === 'Working capital')!;
        expect(workingCapital.loanCount).toBe(2);
        expect(workingCapital.risk).toBe('high');
    });

    it('labels an unset loan purpose as Unspecified rather than dropping it', () => {
        const shares = [share({ loanPurpose: undefined })];
        const groups = computeLenderExposureConcentration(shares, 'purpose');
        expect(groups[0].label).toBe('Unspecified');
    });
});

describe('computeLenderPortfolioOutcomes', () => {
    it('counts active, paid-off, and defaulted loans separately', () => {
        const shares = [
            share({ loanStatus: 'active' }),
            share({ loanStatus: 'paid_off' }),
            share({ loanStatus: 'paid_off' }),
            share({ loanStatus: 'defaulted' }),
        ];
        const outcomes = computeLenderPortfolioOutcomes(shares);
        expect(outcomes.activeCount).toBe(1);
        expect(outcomes.paidOffCount).toBe(2);
        expect(outcomes.defaultedCount).toBe(1);
    });

    it('treats a missing loanStatus as active (pre-migration-035 rows)', () => {
        const shares = [share({ loanStatus: undefined })];
        expect(computeLenderPortfolioOutcomes(shares).activeCount).toBe(1);
    });

    it('computes repayment rate only across resolved (non-active) loans', () => {
        const shares = [
            share({ loanStatus: 'active' }),
            share({ loanStatus: 'active' }),
            share({ loanStatus: 'paid_off' }),
            share({ loanStatus: 'defaulted' }),
        ];
        const outcomes = computeLenderPortfolioOutcomes(shares);
        expect(outcomes.repaymentRatePct).toBeCloseTo(50, 5);
    });

    it('is null for repayment rate when nothing has resolved yet', () => {
        const shares = [share({ loanStatus: 'active' }), share({ loanStatus: 'active' })];
        expect(computeLenderPortfolioOutcomes(shares).repaymentRatePct).toBeNull();
    });

    it('averages revenue growth only across shares that reported it', () => {
        const shares = [
            share({ revenueGrowthPct: 20 }),
            share({ revenueGrowthPct: -10 }),
            share({ revenueGrowthPct: undefined }),
        ];
        const outcomes = computeLenderPortfolioOutcomes(shares);
        expect(outcomes.avgRevenueGrowthPct).toBeCloseTo(5, 5);
        expect(outcomes.revenueGrowthSampleSize).toBe(2);
    });

    it('is null for average revenue growth when no share has reported it', () => {
        const shares = [share({ revenueGrowthPct: undefined })];
        const outcomes = computeLenderPortfolioOutcomes(shares);
        expect(outcomes.avgRevenueGrowthPct).toBeNull();
        expect(outcomes.revenueGrowthSampleSize).toBe(0);
    });
});
