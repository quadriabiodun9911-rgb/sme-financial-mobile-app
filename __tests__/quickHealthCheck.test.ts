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

    describe('stress test scenarios', () => {
        it('re-runs the same cash / net-burn formula against each hypothetical, never blending revenue+expenses+profit into one figure', () => {
            // burn = 45000-40000 = 5000/mo, cash 15000 -> current runway 3 months
            const result = computeQuickHealthCheck({ lastMonthRevenue: 40000, monthlyExpenses: 45000, cashInBank: 15000 });
            const byKey = Object.fromEntries(result.stressScenarios.map(s => [s.key, s.runwayMonths]));

            expect(byKey.current).toBe(3);
            // revenue*0.75=30000, burn=15000, runway=15000/15000=1
            expect(byKey.revenueDown25).toBeCloseTo(1);
            // revenue*0.5=20000, burn=25000, runway=15000/25000=0.6
            expect(byKey.revenueDown50).toBeCloseTo(0.6);
            // revenue=0, burn=45000, runway=15000/45000
            expect(byKey.revenueStops).toBeCloseTo(15000 / 45000);
            // expenses*1.2=54000, burn=14000, runway=15000/14000
            expect(byKey.expensesUp20).toBeCloseTo(15000 / 14000);
        });

        it('shows a profitable business collapsing from Infinity into a real number once revenue is stressed hard enough -- the exact "opportunity to demonstrate intelligence" a flat cash/expenses shortcut would miss', () => {
            const result = computeQuickHealthCheck({ lastMonthRevenue: 50000, monthlyExpenses: 30000, cashInBank: 100000 });
            const byKey = Object.fromEntries(result.stressScenarios.map(s => [s.key, s.runwayMonths]));

            // Still profitable at -25% (37500 > 30000) and after a 20% expense hike (30000*1.2=36000 < 50000)
            expect(byKey.current).toBe(Infinity);
            expect(byKey.revenueDown25).toBe(Infinity);
            expect(byKey.expensesUp20).toBe(Infinity);
            // -50% (25000) and revenue-stops both introduce real burn against expenses of 30000
            expect(byKey.revenueDown50).toBeCloseTo(100000 / 5000);
            expect(byKey.revenueStops).toBeCloseTo(100000 / 30000);
        });

        it('narrates the Revenue ↓25% scenario against the real INDUSTRY_BENCHMARKS runway thresholds -- comfortable/moderate/thin, matching the app\'s own 60/30-day cutoffs', () => {
            // revenueDown25 runway = 25000/20000 = 1.25 months -> falls in the [1,2) "moderate" band
            const moderate = computeQuickHealthCheck({ lastMonthRevenue: 40000, monthlyExpenses: 50000, cashInBank: 25000 });
            expect(moderate.stressNarrative).toContain('moderate cash buffer');
            expect(moderate.stressNarrative).toContain('25%');

            // revenueDown25 runway = 50000/11000 ≈ 4.5 months -> >= 2, "comfortable"
            const comfortable = computeQuickHealthCheck({ lastMonthRevenue: 40000, monthlyExpenses: 41000, cashInBank: 50000 });
            expect(comfortable.stressNarrative).toContain('comfortable cash buffer');

            // revenueDown25 runway = 2000/15000 ≈ 0.13 months -> < 1, "thin"
            const thin = computeQuickHealthCheck({ lastMonthRevenue: 40000, monthlyExpenses: 45000, cashInBank: 2000 });
            expect(thin.stressNarrative).toContain('thin');
        });

        it('computes percentage-based improvement levers (never a fixed dollar amount that wouldn\'t scale across business sizes)', () => {
            // burn = 5000/mo, cash 15000 -> current runway 3 months
            const result = computeQuickHealthCheck({ lastMonthRevenue: 40000, monthlyExpenses: 45000, cashInBank: 15000 });
            expect(result.runwayLevers).toHaveLength(2);
            for (const lever of result.runwayLevers) {
                expect(lever.label).toContain('10%');
            }

            const cutExpenses = result.runwayLevers.find(l => /cut/i.test(l.label))!;
            // expenses*0.9=40500, burn=500, runway=15000/500=30
            expect(cutExpenses.runwayMonths).toBeCloseTo(30);

            const growRevenue = result.runwayLevers.find(l => /grow/i.test(l.label))!;
            // revenue*1.1=44000, burn=1000, runway=15000/1000=15
            expect(growRevenue.runwayMonths).toBeCloseTo(15);
        });

        it('keeps levers honestly at Infinity when a modest 10% shift isn\'t enough to introduce any burn at all', () => {
            const result = computeQuickHealthCheck({ lastMonthRevenue: 50000, monthlyExpenses: 30000, cashInBank: 100000 });
            for (const lever of result.runwayLevers) {
                expect(lever.runwayMonths).toBe(Infinity);
            }
        });
    });
});
