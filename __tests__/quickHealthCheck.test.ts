import { computeQuickHealthCheck } from '../src/utils/quickHealthCheck';
import { scoreProfitabilityMargin, scoreLiquidityRunwayMonths, GENERAL_HEALTH_WEIGHTS } from '../src/utils/finance';

describe('computeQuickHealthCheck', () => {
    it('scores Profitability using the exact same function/thresholds computeRiskScore\'s real factor uses', () => {
        // margin = (50000 - 30000) / 50000 * 100 = 40% -> real scoreProfitabilityMargin(40) = 100
        const result = computeQuickHealthCheck({ lastMonthRevenue: 50000, monthlyExpenses: 30000, cashInBank: 100000 });
        expect(result.marginPct).toBeCloseTo(40);
        expect(result.profitabilityScore).toBe(scoreProfitabilityMargin(40));
        expect(result.profitabilityScore).toBe(100);
    });

    it('scores Liquidity using the exact same capped-at-12-months convention computeRiskScore\'s real Liquidity factor uses', () => {
        // No burn (revenue >= expenses) + cash on hand -> real formula caps at 12 months, not Infinity
        const result = computeQuickHealthCheck({ lastMonthRevenue: 50000, monthlyExpenses: 38000, cashInBank: 120000 });
        expect(result.liquidityScore).toBe(scoreLiquidityRunwayMonths(12));
        expect(result.liquidityScore).toBe(100);
        // But the DISPLAY runway stays honestly uncapped/Infinity -- a separate figure from the scoring input
        expect(result.runwayMonths).toBe(Infinity);
    });

    it('computes the partial score as the real weighted blend of just Profitability and Liquidity, renormalized over their combined weight', () => {
        const result = computeQuickHealthCheck({ lastMonthRevenue: 50000, monthlyExpenses: 30000, cashInBank: 100000 });
        const expected = Math.round(
            (result.profitabilityScore * GENERAL_HEALTH_WEIGHTS.Profitability + result.liquidityScore * GENERAL_HEALTH_WEIGHTS.Liquidity)
            / (GENERAL_HEALTH_WEIGHTS.Profitability + GENERAL_HEALTH_WEIGHTS.Liquidity)
        );
        expect(result.partialScore).toBe(expected);
    });

    it('bands the partial score using the real RISK_BAND_CUTOFFS scale (Excellent/Strong/Moderate/Weak/Critical), never an invented scale', () => {
        const strong = computeQuickHealthCheck({ lastMonthRevenue: 50000, monthlyExpenses: 30000, cashInBank: 100000 });
        expect(['Excellent', 'Strong', 'Moderate', 'Weak', 'Critical']).toContain(strong.partialBand);

        const weak = computeQuickHealthCheck({ lastMonthRevenue: 40000, monthlyExpenses: 45000, cashInBank: 2000 });
        expect(weak.partialBand === 'Weak' || weak.partialBand === 'Critical').toBe(true);
    });

    it('computes a real runway in months from cash / net burn when expenses exceed revenue, for the honest display figure', () => {
        // burn = 45000 - 40000 = 5000/mo; cash 15000 -> 3 months runway
        const result = computeQuickHealthCheck({ lastMonthRevenue: 40000, monthlyExpenses: 45000, cashInBank: 15000 });
        expect(result.isProfitable).toBe(false);
        expect(result.netMonthlyBurn).toBe(5000);
        expect(result.runwayMonths).toBe(3);
    });

    it('computes the expense ratio honestly, and states it in the diagnosis when Profitability is the weaker factor', () => {
        // margin = (45000-38000)/45000*100 ≈ 15.6% -> scoreProfitabilityMargin ≈ 70
        // no burn -> scoringRunwayMonths=12 -> liquidityScore=100 -> profitability is the weaker factor
        const result = computeQuickHealthCheck({ lastMonthRevenue: 45000, monthlyExpenses: 38000, cashInBank: 120000 });
        expect(result.expenseRatioPct).toBeCloseTo((38000 / 45000) * 100);
        expect(result.diagnosis).toContain('84%');
        expect(result.diagnosis).toContain('Profitability');
    });

    it('returns a null expense ratio when revenue is zero, rather than dividing by zero into a fake number', () => {
        const result = computeQuickHealthCheck({ lastMonthRevenue: 0, monthlyExpenses: 10000, cashInBank: 5000 });
        expect(result.expenseRatioPct).toBeNull();
        expect(result.diagnosis).not.toContain('NaN');
        expect(result.diagnosis).not.toContain('Infinity');
        expect(result.marginPct).toBe(0);
    });

    it('never phrases the financing preview as a score, approval, or credit decision -- only a caveated qualitative read', () => {
        const strong = computeQuickHealthCheck({ lastMonthRevenue: 50000, monthlyExpenses: 30000, cashInBank: 100000 });
        const weak = computeQuickHealthCheck({ lastMonthRevenue: 40000, monthlyExpenses: 45000, cashInBank: 2000 });
        for (const result of [strong, weak]) {
            expect(result.financingPreview).not.toMatch(/\d+\s*\/\s*100/);
            expect(result.financingPreview).not.toMatch(/approved|denied|score of \d/i);
        }
    });
});
