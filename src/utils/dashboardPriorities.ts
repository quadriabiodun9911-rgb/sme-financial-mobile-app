import { Invoice, InventoryItem, Budget, PrimaryGoal } from '../types';
import { ForecastAlert } from '../types/forecast';
import { FinancingRecommendation } from './financingRecommendation';

/**
 * Unifies every source the dashboard already tracks separately -- cash-flow
 * risk alerts, overdue invoices, low stock, overspent budgets, a financing
 * opportunity -- into one ranked list: red (needs action now), amber (worth
 * watching), green (a positive signal). Within a tier, items with a known
 * dollar figure sort by size; a real number beats a plausible-sounding one,
 * so anything without a computable amount sorts last rather than guessing.
 */
export type PriorityTier = 'attention' | 'watch' | 'opportunity';

export type PriorityKind =
    | 'overdue_invoices'
    | 'low_cash'
    | 'negative_forecast'
    | 'large_expense_coming'
    | 'low_stock'
    | 'overspent_budget'
    | 'financing_opportunity';

export interface PriorityItem {
    id: string;
    kind: PriorityKind;
    tier: PriorityTier;
    title: string;
    subtitle: string;
    /** 0 when no real dollar figure is available -- never a fabricated estimate. */
    impactAmount: number;
}

export interface OverspentBudget extends Budget {
    spent: number;
    overage: number;
}

const TIER_RANK: Record<PriorityTier, number> = { attention: 0, watch: 1, opportunity: 2 };

// What "matters most" (set once at onboarding, editable in Settings) maps to
// among the kinds this function already computes -- never a new kind, never
// a fabricated one. Overdue invoices are included under cashflow since
// uncollected receivables are a direct cash-flow lever, not just a
// collections issue.
const GOAL_KINDS: Record<PrimaryGoal, PriorityKind[]> = {
    cashflow: ['low_cash', 'negative_forecast', 'large_expense_coming', 'overdue_invoices'],
    costs: ['overspent_budget'],
    financing: ['financing_opportunity'],
};

// alertEngine reports one alert per overdue invoice; the dashboard already
// aggregates overdue invoices into a single card ("3 customers, ₦420,000 to
// collect"), so that alert type is excluded here to avoid double-reporting
// the same risk in two different shapes.
const CASH_FLOW_ALERT_TYPES = new Set(['low_cash', 'negative_forecast', 'large_expense_coming']);

function alertToPriorityItem(alert: ForecastAlert): PriorityItem {
    return {
        id: alert.id,
        kind: alert.type as PriorityKind,
        tier: alert.priority === 'high' ? 'attention' : 'watch',
        title: alert.title.replace(/^[^\w]+\s*/, ''), // strip the leading emoji already baked into alertEngine's titles
        subtitle: alert.description,
        impactAmount: alert.amount ?? 0,
    };
}

export function buildDashboardPriorities(input: {
    alerts: ForecastAlert[];
    overdueInvoices: Invoice[];
    lowStockItems: InventoryItem[];
    overspentBudgets: OverspentBudget[];
    financingOpportunity: FinancingRecommendation | null;
    currency: string;
    /** Undefined ("not sure yet", or not asked) means no preference -- today's tier/amount ordering, unchanged. */
    primaryGoal?: PrimaryGoal;
}): PriorityItem[] {
    const { alerts, overdueInvoices, lowStockItems, overspentBudgets, financingOpportunity, currency, primaryGoal } = input;
    const items: PriorityItem[] = [];

    for (const alert of alerts) {
        if (CASH_FLOW_ALERT_TYPES.has(alert.type)) items.push(alertToPriorityItem(alert));
    }

    if (overdueInvoices.length > 0) {
        const total = overdueInvoices.reduce((s, i) => s + i.total, 0);
        items.push({
            id: 'priority-overdue-invoices',
            kind: 'overdue_invoices',
            tier: 'attention',
            title: `${overdueInvoices.length} Customer${overdueInvoices.length > 1 ? 's' : ''} Overdue`,
            subtitle: `${currency}${total.toLocaleString()} to collect`,
            impactAmount: total,
        });
    }

    if (overspentBudgets.length > 0) {
        const totalOverage = overspentBudgets.reduce((s, b) => s + b.overage, 0);
        items.push({
            id: 'priority-overspent-budgets',
            kind: 'overspent_budget',
            tier: 'watch',
            title: `${overspentBudgets.length} Budget${overspentBudgets.length > 1 ? 's' : ''} Exceeded`,
            subtitle: `${overspentBudgets.map(b => b.category).join(', ')} — ${currency}${totalOverage.toLocaleString()} over`,
            impactAmount: totalOverage,
        });
    }

    if (lowStockItems.length > 0) {
        items.push({
            id: 'priority-low-stock',
            kind: 'low_stock',
            tier: 'watch',
            title: `${lowStockItems.length} Item${lowStockItems.length > 1 ? 's' : ''} Low in Stock`,
            subtitle: 'Reorder to avoid stockout',
            impactAmount: 0,
        });
    }

    if (financingOpportunity) {
        items.push({
            id: 'priority-financing-opportunity',
            kind: 'financing_opportunity',
            tier: 'opportunity',
            title: `You may qualify for ${financingOpportunity.label}`,
            subtitle: financingOpportunity.reasons[0] ?? '',
            impactAmount: 0,
        });
    }

    const preferredKinds = primaryGoal ? GOAL_KINDS[primaryGoal] : null;
    return items.sort((a, b) => {
        const tierDiff = TIER_RANK[a.tier] - TIER_RANK[b.tier];
        if (tierDiff !== 0) return tierDiff;
        // Real urgency (tier) always wins -- this only breaks ties within a
        // tier toward what the owner said matters most, it never promotes a
        // watch-tier item above an attention-tier one.
        if (preferredKinds) {
            const aPreferred = preferredKinds.includes(a.kind);
            const bPreferred = preferredKinds.includes(b.kind);
            if (aPreferred !== bPreferred) return aPreferred ? -1 : 1;
        }
        return b.impactAmount - a.impactAmount;
    });
}
