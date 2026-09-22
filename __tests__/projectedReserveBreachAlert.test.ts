import { AlertEngine } from '../src/utils/alertEngine';
import { CashFlowForecast, MonthlyProjection } from '../src/types/forecast';

function makeMonth(overrides: Partial<MonthlyProjection>, index: number): MonthlyProjection {
    const date = new Date();
    date.setMonth(date.getMonth() + index);
    return {
        month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        date,
        openingBalance: 0,
        projectedIncome: 0,
        projectedExpenses: 0,
        closingBalance: 0,
        lowEstimate: 0,
        midEstimate: 0,
        highEstimate: 0,
        confidence: 80,
        ...overrides,
    };
}

function makeForecast(months: MonthlyProjection[]): CashFlowForecast {
    return {
        generatedAt: new Date().toISOString(),
        forecastPeriod: { start: months[0].month, end: months[months.length - 1].month, months: months.length },
        baselineBalance: months[0].openingBalance,
        baseCase: {
            scenario: 'base', label: 'Base Case', description: '', multiplier: 1, months,
            lowestCash: Math.min(...months.map(m => m.closingBalance)),
            lowestCashMonth: months[0].month,
            runsOutOfCash: false,
        },
        optimistic: { scenario: 'optimistic', label: '', description: '', multiplier: 1.2, months: [], lowestCash: 0, lowestCashMonth: '', runsOutOfCash: false },
        pessimistic: { scenario: 'pessimistic', label: '', description: '', multiplier: 0.8, months: [], lowestCash: 0, lowestCashMonth: '', runsOutOfCash: false },
        riskLevel: 'low',
        healthScore: 80,
        recommendations: [],
    };
}

// The forward-looking counterpart to the low-cash alert: cash is still
// above the owner's own reserve target today, but the automatic forecast
// shows it dipping below that target soon. Tested directly against
// AlertEngine (a hand-built forecast) rather than through
// detectFinancialAlerts, since orchestrating generateCashFlowForecast's own
// trend-derived projection to land on an exact crossing point would make
// these tests fragile without adding any real coverage of this alert's own
// logic.
describe('detectProjectedReserveBreachAlert', () => {
    it('fires when cash is still above the reserve target today but the forecast dips below it', () => {
        const months = [makeMonth({ openingBalance: 1000000, closingBalance: 400000 }, 0)];
        const engine = new AlertEngine(1000000, [], [], makeForecast(months), undefined, [], '₦', [], [], [], undefined, [], [], [], [], 0, 0, '600000');
        const alert = engine.detectAllAlerts().find(a => a.id === 'alert-projected-reserve-breach');
        expect(alert).toBeDefined();
        expect(alert!.description).toMatch(/reserve target/);
        expect(alert!.amount).toBe(600000);
    });

    it('does not fire when cash is already below the reserve target -- detectLowCashAlert owns that case', () => {
        const months = [makeMonth({ openingBalance: 500000, closingBalance: 400000 }, 0)];
        const engine = new AlertEngine(500000, [], [], makeForecast(months), undefined, [], '₦', [], [], [], undefined, [], [], [], [], 0, 0, '600000');
        expect(engine.detectAllAlerts().find(a => a.id === 'alert-projected-reserve-breach')).toBeUndefined();
    });

    it('does not fire when no reserve target has been set', () => {
        const months = [makeMonth({ openingBalance: 1000000, closingBalance: 400000 }, 0)];
        const engine = new AlertEngine(1000000, [], [], makeForecast(months), undefined, [], '₦', [], [], [], undefined, [], [], [], [], 0, 0, undefined);
        expect(engine.detectAllAlerts().find(a => a.id === 'alert-projected-reserve-breach')).toBeUndefined();
    });

    it('does not fire when the forecast never dips below the reserve target', () => {
        const months = [makeMonth({ openingBalance: 1000000, closingBalance: 900000 }, 0)];
        const engine = new AlertEngine(1000000, [], [], makeForecast(months), undefined, [], '₦', [], [], [], undefined, [], [], [], [], 0, 0, '600000');
        expect(engine.detectAllAlerts().find(a => a.id === 'alert-projected-reserve-breach')).toBeUndefined();
    });

    it('reports a shorter day count when the crossing happens sooner within the month', () => {
        // Crosses the reserve target almost immediately (large, fast decline).
        const soonMonths = [makeMonth({ openingBalance: 1000000, closingBalance: -5000000 }, 0)];
        const soonEngine = new AlertEngine(1000000, [], [], makeForecast(soonMonths), undefined, [], '₦', [], [], [], undefined, [], [], [], [], 0, 0, '600000');
        const soonAlert = soonEngine.detectAllAlerts().find(a => a.id === 'alert-projected-reserve-breach');

        // Crosses the reserve target right at the end of the month (slow decline).
        const lateMonths = [makeMonth({ openingBalance: 1000000, closingBalance: 599000 }, 0)];
        const lateEngine = new AlertEngine(1000000, [], [], makeForecast(lateMonths), undefined, [], '₦', [], [], [], undefined, [], [], [], [], 0, 0, '600000');
        const lateAlert = lateEngine.detectAllAlerts().find(a => a.id === 'alert-projected-reserve-breach');

        expect(soonAlert).toBeDefined();
        expect(lateAlert).toBeDefined();
        const soonDays = parseInt(soonAlert!.description.match(/in about (\d+) day/)![1], 10);
        const lateDays = parseInt(lateAlert!.description.match(/in about (\d+) day/)![1], 10);
        expect(soonDays).toBeLessThan(lateDays);
    });
});
