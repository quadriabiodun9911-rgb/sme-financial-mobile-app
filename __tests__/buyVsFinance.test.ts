import { computeBuyVsFinance } from '../src/utils/buyVsFinance';

describe('computeBuyVsFinance', () => {
    it('reduces cash by the full equipment cost under the cash option', () => {
        const r = computeBuyVsFinance({
            equipmentCost: 10000, currentCashBalance: 20000, monthlyBurn: 2000,
            interestRate: 12, termMonths: 24, downPaymentPct: 0,
        });
        expect(r.cashOption.cashAfter).toBe(10000);
        expect(r.cashOption.runwayMonthsAfter).toBe(5); // 10000 / 2000
    });

    it('only reduces cash by the down payment under the finance option', () => {
        const r = computeBuyVsFinance({
            equipmentCost: 10000, currentCashBalance: 20000, monthlyBurn: 2000,
            interestRate: 12, termMonths: 24, downPaymentPct: 20,
        });
        expect(r.financeOption.downPayment).toBe(2000);
        expect(r.financeOption.cashAfter).toBe(18000); // only the deposit leaves cash
    });

    it('adds the monthly payment on top of existing burn, reducing runway from the burn side', () => {
        const r = computeBuyVsFinance({
            equipmentCost: 10000, currentCashBalance: 20000, monthlyBurn: 2000,
            interestRate: 0, termMonths: 20, downPaymentPct: 0, // 0% interest -> monthly payment is exactly principal/term
        });
        expect(r.financeOption.monthlyPayment).toBeCloseTo(500, 1); // 10000 / 20
        // new burn = 2000 + 500 = 2500; cash unchanged at 20000 (no down payment)
        expect(r.financeOption.runwayMonthsAfter).toBeCloseTo(8, 1); // 20000 / 2500
    });

    it('reports zero interest paid when interestRate is 0', () => {
        const r = computeBuyVsFinance({
            equipmentCost: 10000, currentCashBalance: 20000, monthlyBurn: 2000,
            interestRate: 0, termMonths: 20, downPaymentPct: 0,
        });
        expect(r.financeOption.totalInterestPaid).toBeCloseTo(0, 1);
    });

    it('reports positive interest cost when interestRate is above zero', () => {
        const r = computeBuyVsFinance({
            equipmentCost: 10000, currentCashBalance: 20000, monthlyBurn: 2000,
            interestRate: 15, termMonths: 24, downPaymentPct: 0,
        });
        expect(r.financeOption.totalInterestPaid).toBeGreaterThan(0);
    });

    it('correctly identifies which option preserves more runway', () => {
        // Large cash reserve, tiny purchase relative to it — cash option barely dents runway,
        // while financing at a high rate over a short term creates a large new monthly burn.
        const r = computeBuyVsFinance({
            equipmentCost: 1000, currentCashBalance: 100000, monthlyBurn: 5000,
            interestRate: 30, termMonths: 3, downPaymentPct: 0,
        });
        expect(r.preservesMoreRunway).toBe('cash');
    });

    it('treats zero baseline burn as infinite runway for the cash option (no ongoing spend to run out of cash against)', () => {
        const r = computeBuyVsFinance({
            equipmentCost: 5000, currentCashBalance: 10000, monthlyBurn: 0,
            interestRate: 10, termMonths: 12, downPaymentPct: 0,
        });
        expect(r.cashOption.runwayMonthsAfter).toBe(Infinity);
        // The financed option's own monthly payment IS new burn, even if there
        // was none before, so its runway is finite — that's correct, not a bug:
        // taking on a repayment obligation is a real ongoing cost.
        expect(r.financeOption.runwayMonthsAfter).toBeGreaterThan(0);
        expect(isFinite(r.financeOption.runwayMonthsAfter)).toBe(true);
    });

    it('does not throw and reports equal when equipmentCost is 0', () => {
        const r = computeBuyVsFinance({
            equipmentCost: 0, currentCashBalance: 10000, monthlyBurn: 0,
            interestRate: 10, termMonths: 12, downPaymentPct: 0,
        });
        expect(r.cashOption.runwayMonthsAfter).toBe(Infinity);
        expect(r.financeOption.runwayMonthsAfter).toBe(Infinity);
        expect(r.preservesMoreRunway).toBe('equal');
    });
});
