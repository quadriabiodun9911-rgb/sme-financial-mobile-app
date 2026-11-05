import {
    modelHireStaff,
    modelRevenueChange,
    modelCostCut,
    modelCombinedScenario,
    MonthlyBaseline,
} from '../src/utils/analysis';

// Regression: these scenario functions used to fall back to the literal
// magic number 999 for "no expense -> runway" instead of real Infinity --
// the exact anti-pattern cashRunway.ts's computeCashRunway was fixed to
// avoid (999 collides with a real, large finite runway). They also used to
// interpolate that raw number straight into narrative sentences, so a
// zero-expense scenario read as nonsense like "Cash runway drops from 999
// to 45 days" -- or, if naively "fixed" to Infinity without also fixing the
// narrative text, "Cash runway drops from Infinity to 45 days".

const zeroExpenseBaseline: MonthlyBaseline = {
    income: 50000,
    expense: 0,
    profit: 50000,
    margin: 100,
    cashBalance: 200000,
};

describe('scenario runway: no-expense case is real Infinity, not the 999 sentinel', () => {
    it('modelHireStaff baseCashRunway is Infinity when current expense is 0', () => {
        const r = modelHireStaff(zeroExpenseBaseline, 10000, '$');
        expect(r.baseCashRunway).toBe(Infinity);
        expect(r.verdict).not.toMatch(/\b999\b/);
        expect(r.verdict).not.toMatch(/Infinity/);
        expect(r.risks.join(' ')).not.toMatch(/\b999\b/);
        expect(r.risks.join(' ')).not.toMatch(/Infinity/);
    });

    it('modelRevenueChange baseCashRunway is Infinity when expense is 0, and a negative change does not print 999/Infinity', () => {
        const r = modelRevenueChange(zeroExpenseBaseline, -20, '$');
        expect(r.baseCashRunway).toBe(Infinity);
        expect(r.risks.join(' ')).not.toMatch(/\b999\b/);
        expect(r.risks.join(' ')).not.toMatch(/Infinity/);
    });

    it('modelCostCut newCashRunway is Infinity when the cut eliminates all expense', () => {
        const baseline: MonthlyBaseline = { income: 50000, expense: 5000, profit: 45000, margin: 90, cashBalance: 200000 };
        const r = modelCostCut(baseline, 'Rent', 5000, '$');
        expect(r.newCashRunway).toBe(Infinity);
    });

    it('modelCombinedScenario newCashRunway is Infinity when a cost lever zeroes out expense, and the risk text reads as a real phrase', () => {
        const baseline: MonthlyBaseline = { income: 50000, expense: 3000, profit: 47000, margin: 94, cashBalance: 200000 };
        const r = modelCombinedScenario(baseline, [{ type: 'cost', label: 'Cut all costs', costDelta: -3000 }], '$');
        expect(r.newCashRunway).toBe(Infinity);
        expect(r.risks.join(' ')).not.toMatch(/\b999\b/);
        expect(r.risks.join(' ')).not.toMatch(/Infinity/);
        expect(r.risks.join(' ')).toMatch(/effectively unlimited/);
    });

    it('a real large finite runway is not confused with the no-burn case', () => {
        // A huge cash balance against a small but nonzero expense computes
        // to a genuinely large finite number of days -- must stay finite,
        // never collide with the Infinity/999 sentinel path.
        const baseline: MonthlyBaseline = { income: 10000, expense: 10, profit: 9990, margin: 99.9, cashBalance: 5_000_000 };
        const r = modelHireStaff(baseline, 100, '$');
        expect(Number.isFinite(r.baseCashRunway)).toBe(true);
        expect(r.baseCashRunway).toBeGreaterThan(999);
    });
});
