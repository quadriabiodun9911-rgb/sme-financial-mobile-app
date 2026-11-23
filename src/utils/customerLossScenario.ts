/**
 * Customer Loss Scenario — turns the Revenue Concentration Alert's static
 * "your top customer is 41% of revenue" into the concrete question an
 * owner actually has next: if THAT customer left tomorrow, what happens
 * to my cash position and runway?
 *
 * Deliberately not a new cash-projection formula: reuses
 * revenueStressTest.ts's own buildScenario/riskTierForRunway verbatim,
 * feeding it the top customer's ACTUAL revenue share (via
 * computeRevenueConcentrationAlert's own windowed, latest-transaction-
 * anchored concentration read -- never finance.ts's unwindowed all-time
 * computeCustomerConcentration directly, for the same reason that file's
 * own header comment gives: a customer who mattered two years ago
 * shouldn't still be driving this scenario today) as the drop percentage,
 * instead of one of the generic -10/-20/-30% presets. A concentrated top
 * customer's departure isn't a gradual revenue slowdown; it's a single-
 * customer-shaped step down, so this is a distinct, named scenario, not a
 * duplicate of the flat-decline stress test.
 */

import { Transaction } from '../types';
import { computeAllTimeMonthlyBuckets } from './trendAnalysis';
import { computeRevenueConcentrationAlert } from './revenueConcentrationAlert';
import { buildScenario, RevenueStressScenario } from './revenueStressTest';

// Same trailing window revenueStressTest.ts itself uses for the current
// revenue/expense baseline, so the two scenarios' baselines never disagree.
const TRAILING_WINDOW_MONTHS = 3;

export interface CustomerLossScenarioResult {
    available: boolean;
    reason?: string;
    customerName: string | null; // null when no customer name is tagged on income ('Unknown')
    customerSharePct: number;
    concentrationWindowMonths: number;
    scenario: RevenueStressScenario | null;
    narrative: string;
}

const EMPTY = (reason: string): CustomerLossScenarioResult => ({
    available: false, reason, customerName: null, customerSharePct: 0,
    concentrationWindowMonths: 0, scenario: null, narrative: '',
});

export function computeCustomerLossScenario(
    transactions: Transaction[],
    cashBalance: number,
    currency: string = '₦',
    concentrationWindowMonths: number = 6,
): CustomerLossScenarioResult {
    const alert = computeRevenueConcentrationAlert(transactions, concentrationWindowMonths);
    if (!alert.available || !alert.topCustomer || alert.topCustomer.percentage <= 0) {
        return EMPTY(alert.reason ?? 'Not enough revenue history yet to identify a top customer to model.');
    }

    const monthly = computeAllTimeMonthlyBuckets(transactions);
    const window = monthly.slice(-TRAILING_WINDOW_MONTHS);
    const currentMonthlyRevenue = window.reduce((s, m) => s + m.revenue, 0) / Math.max(1, window.length);
    const currentMonthlyExpense = window.reduce((s, m) => s + m.expense, 0) / Math.max(1, window.length);
    if (currentMonthlyRevenue <= 0) {
        return EMPTY('No revenue recorded yet to model a customer loss against.');
    }

    const pct = alert.topCustomer.percentage;
    const name = alert.topCustomer.customer && alert.topCustomer.customer !== 'Unknown' ? alert.topCustomer.customer : null;
    const label = name ? `Lose ${name}` : 'Lose top customer';
    const scenario = buildScenario(pct, label, currentMonthlyRevenue, currentMonthlyExpense, cashBalance);

    const impactPhrase = scenario.risk === 'safe' ? 'barely dent your cash buffer'
        : scenario.risk === 'caution' ? 'leave a thinner, but still workable, cash buffer'
        : scenario.risk === 'warning' ? 'cut your runway down to a genuinely tight level'
        : 'put the business in immediate cash danger';

    const runwayPhrase = Number.isFinite(scenario.runwayMonths)
        ? `projected runway would drop to about ${scenario.runwayMonths.toFixed(1)} months`
        : 'the business would still not be burning cash on paper';

    const narrative = `${name ? `Losing ${name}` : 'Losing your top customer'} — ${pct.toFixed(0)}% of recorded revenue over the last ${alert.windowMonths} months — would ${impactPhrase} if nothing else changed: ${runwayPhrase}.`;

    return {
        available: true,
        customerName: name,
        customerSharePct: pct,
        concentrationWindowMonths: alert.windowMonths,
        scenario,
        narrative,
    };
}
