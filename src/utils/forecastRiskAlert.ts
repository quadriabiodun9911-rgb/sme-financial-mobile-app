/**
 * Bridges the rich forecast engine (forecastSummary.ts: external relevance-
 * gating, scenario range, combined insights, health trajectory) into the
 * Dashboard's alert feed, which otherwise only ever sees AlertEngine's own
 * negative_forecast/large_expense_coming alerts -- both built on
 * forecastEngine.ts's older, shallower bottom-up model (see that module's
 * own header comment for why the two engines are deliberately separate).
 *
 * Deliberately NOT a change to alertEngine.ts/AlertEngine itself: that
 * class threads a long, positional constructor through several call sites,
 * and none of them currently have the staff/inventory/macroAssumptions/
 * futureEvents inputs the rich engine needs. Adding them as one more
 * additive alert, computed alongside the existing ones rather than inside
 * them, gets the same "Dashboard reflects the richer intelligence" result
 * without touching a class the rest of the alerting system depends on.
 */

import { Transaction, Loan, FinanceData, StaffMember, MacroAssumption, InventoryItem, FutureEvent, Budget } from '../types';
import { ForecastAlert } from '../types/forecast';
import { computeForecastSummary } from './forecastSummary';
import { NO_ADJUSTMENTS } from './futureFinancialStatements';
import { generateForecastRiskActions } from './forecastRiskRecommendations';

export function computeForecastRiskAlert(
    transactions: Transaction[],
    loans: Loan[],
    finance: FinanceData,
    staff: StaffMember[],
    macroAssumptions: MacroAssumption[],
    inventory: InventoryItem[],
    futureEvents: FutureEvent[],
    budgets: Budget[],
    currency: string,
    dismissedAlertIds: string[] = [],
): ForecastAlert | null {
    const forecast = computeForecastSummary(transactions, loans, finance, '90d', staff, macroAssumptions, NO_ADJUSTMENTS, inventory, futureEvents);
    const [topAction] = generateForecastRiskActions(forecast, currency);
    if (!topAction) return null;

    const id = `forecast-risk-${topAction.id}`;
    if (dismissedAlertIds.includes(id)) return null;

    return {
        id,
        type: 'negative_forecast',
        priority: topAction.priority >= 7 ? 'high' : topAction.priority >= 5 ? 'medium' : 'low',
        title: topAction.title,
        description: topAction.description,
        amount: topAction.expectedImpact > 0 ? topAction.expectedImpact : undefined,
        recommendations: topAction.steps,
        createdAt: new Date().toISOString(),
    };
}
