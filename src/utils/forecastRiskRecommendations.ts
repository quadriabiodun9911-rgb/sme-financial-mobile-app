/**
 * Turns what the FORECAST itself is warning about into trackable action —
 * distinct from actionRecommendationEngine.ts's generateActionPlan, which
 * diagnoses HISTORICAL performance and never reads a projection at all.
 * FutureFinancialStatementsScreen previously showed generateActionPlan's
 * output side by side with the forecast, but those tactics were generated
 * from the past, not from what the forecast/scenario/combined-insights are
 * specifically flagging (a pressured month, a corroborated external
 * pressure, a declining health trajectory). This closes that gap.
 *
 * Same ActionTactic shape actionRecommendationEngine already produces, on
 * purpose: it's tracked by the exact same Action Tracker / outcome-tracking
 * loop with zero new infrastructure, and financialHealthForecast's own
 * comment ("what actually happened last time...") applies here unchanged.
 *
 * Every rule fires only off a real, already-computed forecast signal — no
 * new modeling happens in this file. That mirrors financingFit.ts's own
 * discipline: reuse the numbers already computed elsewhere, never a second,
 * independently-tuned estimate.
 */

import { ActionTactic } from './actionRecommendationEngine';
import { ForecastSummary, CashFlowMonth } from './forecastSummary';
import { ScenarioProjection } from './scenarioForecast';
import { DRIVER_LABEL } from './externalRiskInsights';

function cashFlowPressureCause(month: CashFlowMonth): 'inventory' | 'loan' | 'general' {
    const inventoryShare = month.outflow > 0 ? month.inventoryPurchase / month.outflow : 0;
    const loanShare = month.outflow > 0 ? month.loanRepayment / month.outflow : 0;
    if (inventoryShare >= 0.4) return 'inventory';
    if (loanShare >= 0.4) return 'loan';
    return 'general';
}

function pressuredMonthAction(month: CashFlowMonth, currency: string): ActionTactic {
    const shortfall = Math.abs(month.net);
    const cause = cashFlowPressureCause(month);

    if (cause === 'inventory') {
        return {
            id: 'forecast-cashflow-inventory-pressure',
            title: `Review Inventory Purchasing Before ${month.monthLabel}`,
            description: `Projected inventory purchases make up a large share of ${month.monthLabel}'s expected outflow, pushing cash to about ${currency}${Math.round(month.endingCash).toLocaleString()}.`,
            category: 'operations',
            priority: 8,
            timeframe: 'immediate',
            timelineWeeks: 2,
            expectedImpact: shortfall,
            impactType: 'cash_improvement',
            difficulty: 'easy',
            successProbability: 0.7,
            rationale: 'Delaying or trimming a planned stock buy is the fastest lever against a cash-flow shortfall the forecast can already see coming — it doesn\'t require new revenue or a new customer.',
            steps: [
                `Review the planned inventory purchase driving ${month.monthLabel}'s outflow`,
                'Split the order into smaller batches timed after expected collections land',
                'Prioritise restocking only fast-moving items for this cycle',
            ],
            metrics: ['Projected ending cash', 'Inventory purchase as % of outflow'],
        };
    }

    if (cause === 'loan') {
        return {
            id: 'forecast-cashflow-loan-pressure',
            title: `Review Loan Repayment Timing Before ${month.monthLabel}`,
            description: `Loan repayment makes up a large share of ${month.monthLabel}'s expected outflow, pushing cash to about ${currency}${Math.round(month.endingCash).toLocaleString()}.`,
            category: 'operations',
            priority: 7,
            timeframe: 'immediate',
            timelineWeeks: 3,
            expectedImpact: shortfall,
            impactType: 'cash_improvement',
            difficulty: 'medium',
            successProbability: 0.5,
            rationale: 'A repayment date landing in a tight month is worth raising with the lender before it happens, not after it causes a shortfall.',
            steps: [
                `Check whether ${month.monthLabel}'s loan repayment date can shift a few weeks`,
                'Ask the lender about a short-term restructure if the gap is real, not just tight timing',
                'Build the repayment into next month\'s cash plan either way',
            ],
            metrics: ['Projected ending cash', 'Loan repayment as % of outflow'],
        };
    }

    return {
        id: 'forecast-cashflow-collections-pressure',
        title: `Accelerate Collections Before ${month.monthLabel}`,
        description: `Expected outflow is projected to exceed expected inflow in ${month.monthLabel}, pushing cash to about ${currency}${Math.round(month.endingCash).toLocaleString()}.`,
        category: 'collections',
        priority: 7,
        timeframe: 'immediate',
        timelineWeeks: 3,
        expectedImpact: shortfall,
        impactType: 'cash_improvement',
        difficulty: 'medium',
        successProbability: 0.55,
        rationale: 'Pulling forward collections that are already owed closes a projected gap without cutting spend or taking on debt.',
        steps: [
            'Contact customers with invoices due before this projected shortfall',
            'Offer a small early-payment incentive for the largest outstanding invoices',
            'Hold non-critical spend until collections catch up',
        ],
        metrics: ['Projected ending cash', 'Days sales outstanding'],
    };
}

function marginRiskAction(forecast: ForecastSummary, currency: string): ActionTactic {
    const impact = Math.abs(forecast.marginRisk.estimatedProfitImpact);
    return {
        id: 'forecast-margin-risk-discounting',
        title: 'Review Discount Levels',
        description: `Your discount rate has climbed ${forecast.marginRisk.ratePctChange.toFixed(1)} points, projected to cost about ${currency}${Math.round(impact).toLocaleString()} in profit if it continues.`,
        category: 'revenue',
        priority: 6,
        timeframe: 'week',
        timelineWeeks: 1,
        expectedImpact: impact,
        impactType: 'revenue',
        difficulty: 'easy',
        successProbability: 0.6,
        rationale: 'A creeping discount rate quietly erodes margin the same way a cost increase does — it just doesn\'t show up as an expense line, so it\'s easy to miss until the forecast flags it.',
        steps: [
            'Pull recent sales and check which items/customers are getting the deepest discounts',
            'Tie discounts to a specific reason (volume, clearance, loyalty) rather than defaulting to one',
            'Track average discount rate weekly going forward',
        ],
        metrics: ['Average discount rate', 'Gross margin %'],
    };
}

const EXTERNAL_RISK_STEPS: Partial<Record<string, string[]>> = {
    fx: [
        'Review how much of recent cost is tied to foreign-currency-priced inputs',
        'Ask suppliers about local-currency pricing or longer payment terms',
        'Weigh a fixed-rate facility over a variable one for any new financing',
    ],
    interestRate: [
        'Check whether existing debt is on a fixed or variable rate',
        'Weigh a fixed-rate structure for any new financing under consideration',
        'Build a higher-rate scenario into repayment planning',
    ],
    inflation: [
        'Review pricing on your top categories against rising input costs',
        'Favor shorter-term financing over locking into a long commitment right now',
    ],
    commodity: [
        'Identify which categories are most exposed to the input-cost increase',
        'Lock in supplier pricing where possible before further increases',
    ],
    energy: [
        'Review energy-intensive categories for cost-pass-through options',
        'Evaluate whether pricing needs to reflect rising energy costs',
    ],
    supplyChain: [
        'Identify which suppliers are the biggest exposure to disruption',
        'Qualify a backup supplier for the most exposed inputs',
    ],
    demand: [
        'Review which customer segments are most exposed to weakening demand',
        'Prioritise retention on existing customers over new-customer spend for now',
    ],
};

function externalRiskAction(forecast: ForecastSummary, currency: string): ActionTactic | null {
    const worst = forecast.riskRadar
        .filter(r => r.impact === 'high' && r.probability === 'high')
        .sort((a, b) => (a.exposure === 'high' ? -1 : 1))[0];
    if (!worst) return null;

    const label = DRIVER_LABEL[worst.driver] ?? worst.label;
    const item = forecast.externalFactors.items.find(i => i.driver === worst.driver);
    const steps = EXTERNAL_RISK_STEPS[worst.driver] ?? ['Review exposure to this factor and how it flows into your costs'];

    return {
        id: `forecast-external-risk-${worst.driver}`,
        title: `Address ${label} Exposure`,
        description: item?.sentence ?? `${label} is flagged as a high-impact, corroborated risk to your forecast.`,
        category: 'strategy',
        priority: 6,
        timeframe: 'month',
        timelineWeeks: 4,
        expectedImpact: item ? (item.impactPct / 100) * forecast.headline.expectedRevenue : 0,
        impactType: worst.driver === 'demand' ? 'revenue' : 'expense_reduction',
        difficulty: 'medium',
        successProbability: 0.5,
        rationale: `This isn't a headline you logged out of caution — it's already showing up in your own ${worst.driver === 'demand' ? 'revenue' : 'spending'}, which is why it's flagged as corroborated, not just possible.`,
        steps,
        metrics: [`${label} exposure`, 'Gross margin %'],
    };
}

function cashFlowRiskInsightAction(forecast: ForecastSummary): ActionTactic | null {
    const insight = forecast.combinedInsights.find(i => i.title === 'Cash Flow Risk');
    if (!insight) return null;
    return {
        id: 'forecast-planned-purchase-cost-pressure',
        title: 'Renegotiate or Delay Planned Inventory Purchase',
        description: insight.text,
        category: 'operations',
        priority: 6,
        timeframe: 'week',
        timelineWeeks: 2,
        expectedImpact: 0,
        impactType: 'cash_improvement',
        difficulty: 'easy',
        successProbability: 0.55,
        rationale: 'A planned purchase meeting a real, corroborated cost increase is exactly the kind of collision a forward-looking forecast exists to catch before it happens, not after.',
        steps: [
            'Confirm current supplier pricing before placing the planned order',
            'Consider splitting the purchase to spread the cost impact',
            'Budget the higher cost explicitly rather than letting it surprise the cash plan',
        ],
        metrics: ['Planned inventory spend', 'Supplier cost trend'],
    };
}

function financingRiskInsightAction(forecast: ForecastSummary): ActionTactic | null {
    const insight = forecast.combinedInsights.find(i => i.title === 'Financing Risk');
    if (!insight) return null;
    return {
        id: 'forecast-financing-rate-risk',
        title: 'Reassess Borrowing Timing',
        description: insight.text,
        category: 'strategy',
        priority: 5,
        timeframe: 'month',
        timelineWeeks: 4,
        expectedImpact: 0,
        impactType: 'cash_improvement',
        difficulty: 'medium',
        successProbability: 0.5,
        rationale: 'Debt taken on right before a corroborated rate increase costs more than the same debt taken on a month earlier or later — timing is a free lever here.',
        steps: [
            'Check whether any planned borrowing can be locked in before rates move further',
            'Ask about fixed-rate options for existing variable-rate debt',
        ],
        metrics: ['Effective borrowing rate', 'Monthly debt service'],
    };
}

function scenarioCashShortfallAction(conservativeScenario: ScenarioProjection, currency: string): ActionTactic | null {
    if (conservativeScenario.endingCash >= 0) return null;
    const shortfall = Math.abs(conservativeScenario.endingCash);
    return {
        id: 'forecast-conservative-cash-shortfall',
        title: 'Build a Cash Buffer Before the Downside Case Hits',
        description: `If the risks already in your Conservative scenario materialise, projected cash goes to about ${currency}${Math.round(conservativeScenario.endingCash).toLocaleString()} — a ${currency}${Math.round(shortfall).toLocaleString()} shortfall.`,
        category: 'strategy',
        priority: 7,
        timeframe: 'month',
        timelineWeeks: 6,
        expectedImpact: shortfall,
        impactType: 'cash_improvement',
        difficulty: 'medium',
        successProbability: 0.5,
        rationale: 'A Conservative scenario going negative means the business currently has no cushion if even the risks it\'s already flagging materialise — worth building a buffer before they do, not after.',
        steps: [
            'Set aside a portion of current profit as a dedicated cash buffer',
            'Review which Conservative-scenario risks are most likely for this business specifically',
            'Revisit financing options now, while the business isn\'t yet under pressure',
        ],
        metrics: ['Conservative-scenario ending cash', 'Cash reserve balance'],
    };
}

function healthDeclineAction(forecast: ForecastSummary): ActionTactic | null {
    const hf = forecast.healthForecast;
    const drop = hf.currentScore.score - hf.projectedScore.score;
    if (drop < 5) return null;
    const biggestDriver = hf.movedFactors[0];
    return {
        id: 'forecast-health-decline',
        title: 'Address Declining Financial Health Trend',
        description: `Your financial health score is projected to fall from ${hf.currentScore.score} to ${hf.projectedScore.score}${biggestDriver ? `, driven mainly by ${biggestDriver.name}` : ''}.`,
        category: 'strategy',
        priority: 6,
        timeframe: 'month',
        timelineWeeks: 4,
        expectedImpact: 0,
        impactType: 'cash_improvement',
        difficulty: 'medium',
        successProbability: 0.5,
        rationale: 'The health score is a weighted composite, not a single number to chase directly — the fastest way to move it back up is fixing whichever factor is actually driving the projected drop.',
        steps: biggestDriver
            ? [`Review ${biggestDriver.name}: ${biggestDriver.explanation}`, 'Address the specific driver rather than the score itself']
            : ['Review the factor breakdown to identify what\'s driving the projected decline'],
        metrics: ['Financial health score', biggestDriver?.name ?? 'Underlying risk factors'],
    };
}

/**
 * Generates ActionTactics from what the forecast itself is warning about.
 * conservativeScenario is optional -- pass it (from scenarioForecast.ts's
 * summarizeScenario) when the caller has already computed the scenario
 * range, to also flag a Conservative-case cash shortfall specifically.
 */
export function generateForecastRiskActions(
    forecast: ForecastSummary,
    currency: string = '₦',
    conservativeScenario?: ScenarioProjection,
): ActionTactic[] {
    const actions: ActionTactic[] = [];

    const soonestPressuredMonth = forecast.cashFlowMonths.find(m => m.pressured);
    if (soonestPressuredMonth) actions.push(pressuredMonthAction(soonestPressuredMonth, currency));

    if (forecast.marginRisk.show) actions.push(marginRiskAction(forecast, currency));

    const external = externalRiskAction(forecast, currency);
    if (external) actions.push(external);

    const cashFlowInsight = cashFlowRiskInsightAction(forecast);
    if (cashFlowInsight) actions.push(cashFlowInsight);

    const financingInsight = financingRiskInsightAction(forecast);
    if (financingInsight) actions.push(financingInsight);

    if (conservativeScenario) {
        const shortfall = scenarioCashShortfallAction(conservativeScenario, currency);
        if (shortfall) actions.push(shortfall);
    }

    const healthDecline = healthDeclineAction(forecast);
    if (healthDecline) actions.push(healthDecline);

    return actions.sort((a, b) => b.priority - a.priority);
}
