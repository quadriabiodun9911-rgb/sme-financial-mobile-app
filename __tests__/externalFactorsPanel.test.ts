import {
    computeInternalRevenueGrowthPct, computeExternalFactorsPanel, computeRiskRadar, computeCombinedInsights,
} from '../src/utils/externalFactorsPanel';
import { computeExternalRiskInsights } from '../src/utils/externalRiskInsights';
import { Transaction, MacroAssumption } from '../src/types';

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

const makeAssumption = (overrides: Partial<MacroAssumption>): MacroAssumption => ({
    id: `ma-${Math.random()}`,
    driver: 'energy',
    label: 'Diesel price',
    changePct: 20,
    periodMonths: 3,
    linkedCategories: ['Utilities'],
    updatedAt: '2026-06-01',
    ...overrides,
});

// 6 months of history: Utilities rises from 10% to 25% of revenue (prior
// 3 months vs current 3 months) -- mirrors costExposure.test.ts's own
// "flags a single category" fixture, so its corroboration is well
// established. Revenue itself grows steadily 6% -> 8% -> 10% (relative to
// the first month), a clear positive internal trend for the demand tests.
function sixMonthsWithRisingUtilities(): Transaction[] {
    const txs: Transaction[] = [];
    const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'];
    const revenues = [100000, 106000, 112000, 118000, 124000, 130000];
    months.forEach((m, i) => {
        txs.push(makeTx({ date: `${m}-01`, type: 'income', category: 'Sales', amount: revenues[i] }));
        const utilitiesPct = i < 3 ? 0.10 : 0.25;
        txs.push(makeTx({ date: `${m}-05`, type: 'expense', category: 'Utilities', amount: revenues[i] * utilitiesPct }));
        txs.push(makeTx({ date: `${m}-10`, type: 'expense', category: 'Rent', amount: 20000 }));
    });
    return txs;
}

describe('computeInternalRevenueGrowthPct', () => {
    it('returns positive growth for rising revenue', () => {
        const pct = computeInternalRevenueGrowthPct(sixMonthsWithRisingUtilities());
        expect(pct).not.toBeNull();
        expect(pct!).toBeGreaterThan(0);
    });

    it('returns null with fewer than 2 months of history', () => {
        const pct = computeInternalRevenueGrowthPct([makeTx({ date: '2026-06-01', type: 'income', amount: 5000 })]);
        expect(pct).toBeNull();
    });
});

describe('computeExternalFactorsPanel', () => {
    it('returns an empty panel when there are no assumptions', () => {
        const panel = computeExternalFactorsPanel(sixMonthsWithRisingUtilities(), []);
        expect(panel.items).toHaveLength(0);
        expect(panel.summarySentence).toBeNull();
    });

    it('scores a cost-side assumption\'s impact from real exposure, and marks it corroborated when the linked category is actually rising', () => {
        const assumption = makeAssumption({ driver: 'energy', label: 'Diesel price', changePct: 20, linkedCategories: ['Utilities'] });
        const panel = computeExternalFactorsPanel(sixMonthsWithRisingUtilities(), [assumption]);
        expect(panel.items).toHaveLength(1);
        const item = panel.items[0];
        expect(item.corroborated).toBe(true);
        expect(item.probability).toBe('high');
        expect(item.exposurePct).toBeCloseTo(25, 0); // Utilities is 25% of current revenue
        expect(item.impactPct).toBeCloseTo(0.20 * 25, 1); // |changePct|/100 * exposurePct
        expect(item.impactLevel).toBe('high'); // 5pp >= 3pp threshold
        expect(panel.summarySentence).toContain('energy');
    });

    it('marks a cost-side assumption uncorroborated (medium probability) when the linked category is not actually rising', () => {
        const assumption = makeAssumption({ driver: 'commodity', label: 'Steel price', changePct: 15, linkedCategories: ['Rent'] });
        const panel = computeExternalFactorsPanel(sixMonthsWithRisingUtilities(), [assumption]);
        const item = panel.items[0];
        expect(item.corroborated).toBe(false);
        expect(item.probability).toBe('medium');
    });

    it('treats a demand assumption as business-wide (100% exposure) and corroborates it against the real revenue trend', () => {
        const assumption = makeAssumption({ driver: 'demand', label: 'Market demand', changePct: 10, linkedCategories: [] });
        const panel = computeExternalFactorsPanel(sixMonthsWithRisingUtilities(), [assumption]);
        const item = panel.items[0];
        expect(item.exposurePct).toBe(100);
        expect(item.corroborated).toBe(true); // revenue is genuinely growing in the fixture
        expect(item.impactLevel).toBe('positive');
    });

    it('flags a weakening demand assumption as a risk, not positive', () => {
        const assumption = makeAssumption({ driver: 'demand', label: 'Market demand', changePct: -20, linkedCategories: [] });
        const panel = computeExternalFactorsPanel(sixMonthsWithRisingUtilities(), [assumption]);
        const item = panel.items[0];
        expect(item.impactLevel).toBe('high'); // 20% >= 15% threshold
        expect(item.corroborated).toBe(false); // revenue is actually growing, contradicting "weakening"
    });
});

describe('computeRiskRadar', () => {
    it('maps each panel item to an impact/probability/exposure row', () => {
        const assumption = makeAssumption({ driver: 'energy', changePct: 20, linkedCategories: ['Utilities'] });
        const panel = computeExternalFactorsPanel(sixMonthsWithRisingUtilities(), [assumption]);
        const radar = computeRiskRadar(panel);
        expect(radar).toHaveLength(1);
        expect(radar[0]).toEqual({ label: assumption.label, driver: 'energy', impact: 'high', probability: 'high', exposure: 'high' });
    });
});

describe('computeCombinedInsights', () => {
    it('flags moderated growth when sales are rising but a demand assumption says demand is weakening', () => {
        const txs = sixMonthsWithRisingUtilities();
        const demand = makeAssumption({ driver: 'demand', label: 'Consumer demand', changePct: -15, linkedCategories: [] });
        const insights = computeCombinedInsights({
            transactions: txs, macroAssumptions: [demand],
            marginRisk: { show: false, ratePctChange: 0, estimatedProfitImpact: 0 },
            externalInsights: [], expectedInventoryPurchases: 0, existingLoanMonthlyPayment: 0, newLoanAmount: 0,
        });
        expect(insights.some(i => i.title === 'Growth May Moderate')).toBe(true);
    });

    it('does not flag a Growth Opportunity in the same breath as a weakening-demand headwind', () => {
        // Sales are genuinely growing, but a demand headwind is exactly
        // what "Growth May Moderate" is warning about above -- calling it
        // an "opportunity" at the same time would contradict that warning.
        const txs = sixMonthsWithRisingUtilities();
        const demand = makeAssumption({ driver: 'demand', label: 'Consumer demand', changePct: -15, linkedCategories: [] });
        const insights = computeCombinedInsights({
            transactions: txs, macroAssumptions: [demand],
            marginRisk: { show: false, ratePctChange: 0, estimatedProfitImpact: 0 },
            externalInsights: [], expectedInventoryPurchases: 0, existingLoanMonthlyPayment: 0, newLoanAmount: 0,
        });
        expect(insights.some(i => i.title === 'Growth Opportunity')).toBe(false);
    });

    it('flags Margin Risk when discounting is up and an external cost insight is corroborated', () => {
        const txs = sixMonthsWithRisingUtilities();
        const assumption = makeAssumption({ driver: 'energy', linkedCategories: ['Utilities'] });
        const externalInsights = computeExternalRiskInsights(txs, [assumption]).insights;
        expect(externalInsights.length).toBeGreaterThan(0); // sanity check the fixture actually corroborates

        const insights = computeCombinedInsights({
            transactions: txs, macroAssumptions: [assumption],
            marginRisk: { show: true, ratePctChange: 5, estimatedProfitImpact: 50000 },
            externalInsights, expectedInventoryPurchases: 0, existingLoanMonthlyPayment: 0, newLoanAmount: 0,
        });
        expect(insights.some(i => i.title === 'Margin Risk')).toBe(true);
    });

    it('flags Cash Flow Risk when inventory purchases are planned and a supply-side cost insight is corroborated', () => {
        const txs = sixMonthsWithRisingUtilities();
        const fxAssumption = makeAssumption({ driver: 'fx', label: 'Naira depreciation', linkedCategories: ['Utilities'] });
        const externalInsights = computeExternalRiskInsights(txs, [fxAssumption]).insights;

        const insights = computeCombinedInsights({
            transactions: txs, macroAssumptions: [fxAssumption],
            marginRisk: { show: false, ratePctChange: 0, estimatedProfitImpact: 0 },
            externalInsights, expectedInventoryPurchases: 300000, existingLoanMonthlyPayment: 0, newLoanAmount: 0,
        });
        expect(insights.some(i => i.title === 'Cash Flow Risk')).toBe(true);
    });

    it('flags Financing Risk when the business has debt and interest rates are assumed to be rising', () => {
        const txs = sixMonthsWithRisingUtilities();
        const rateAssumption = makeAssumption({ driver: 'interestRate', label: 'CBN rate hike', changePct: 3, linkedCategories: ['Rent'] });
        const insights = computeCombinedInsights({
            transactions: txs, macroAssumptions: [rateAssumption],
            marginRisk: { show: false, ratePctChange: 0, estimatedProfitImpact: 0 },
            externalInsights: [], expectedInventoryPurchases: 0, existingLoanMonthlyPayment: 80000, newLoanAmount: 0,
        });
        expect(insights.some(i => i.title === 'Financing Risk')).toBe(true);
    });

    it('flags a Growth Opportunity when sales are growing strongly with no material cost headwind', () => {
        const txs = sixMonthsWithRisingUtilities(); // revenue grows 30% over the window, well past the 8% threshold
        const insights = computeCombinedInsights({
            transactions: txs, macroAssumptions: [],
            marginRisk: { show: false, ratePctChange: 0, estimatedProfitImpact: 0 },
            externalInsights: [], expectedInventoryPurchases: 0, existingLoanMonthlyPayment: 0, newLoanAmount: 0,
        });
        expect(insights.some(i => i.title === 'Growth Opportunity')).toBe(true);
    });

    it('does not flag a Growth Opportunity when a material cost risk is already present', () => {
        const txs = sixMonthsWithRisingUtilities();
        const assumption = makeAssumption({ driver: 'energy', linkedCategories: ['Utilities'] });
        const externalInsights = computeExternalRiskInsights(txs, [assumption]).insights;
        const insights = computeCombinedInsights({
            transactions: txs, macroAssumptions: [assumption],
            marginRisk: { show: false, ratePctChange: 0, estimatedProfitImpact: 0 },
            externalInsights, expectedInventoryPurchases: 0, existingLoanMonthlyPayment: 0, newLoanAmount: 0,
        });
        expect(insights.some(i => i.title === 'Growth Opportunity')).toBe(false);
    });

    it('returns no insights when nothing internal or external is flagged', () => {
        const insights = computeCombinedInsights({
            transactions: [], macroAssumptions: [],
            marginRisk: { show: false, ratePctChange: 0, estimatedProfitImpact: 0 },
            externalInsights: [], expectedInventoryPurchases: 0, existingLoanMonthlyPayment: 0, newLoanAmount: 0,
        });
        expect(insights).toHaveLength(0);
    });
});
