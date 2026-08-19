import { Invoice, InventoryItem, Budget, Loan, Transaction, PrimaryGoal } from '../types';
import { ForecastAlert } from '../types/forecast';
import { FinancingRecommendation } from './financingRecommendation';
import { monthlyPayment } from './loanMath';

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
    | 'overdue_loan_payments'
    | 'overdue_transactions'
    | 'low_cash'
    | 'negative_forecast'
    | 'large_expense_coming'
    | 'low_stock'
    | 'overspent_budget'
    | 'financing_opportunity'
    | 'payroll_overdue'
    | 'payroll_due_soon'
    | 'tax_deadline_overdue'
    | 'tax_deadline_due_soon';

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
    cashflow: ['low_cash', 'negative_forecast', 'large_expense_coming', 'overdue_invoices', 'overdue_loan_payments', 'overdue_transactions', 'payroll_overdue', 'payroll_due_soon', 'tax_deadline_overdue', 'tax_deadline_due_soon'],
    costs: ['overspent_budget'],
    financing: ['financing_opportunity'],
};

// alertEngine reports one alert per overdue invoice, overdue loan, or
// overdue transaction; the dashboard already aggregates each of those into
// a single card ("3 customers, ₦420,000 to collect"), so those alert types
// are excluded here to avoid double-reporting the same risk in two
// different shapes. Payroll and the tax filing deadline never produce more
// than one alert at a time (detectPayrollAlert / detectTaxDeadlineAlert
// each return at most one), so they pass through generically instead of
// needing their own aggregation block.
const PASSTHROUGH_ALERT_TYPES = new Set(['low_cash', 'negative_forecast', 'large_expense_coming', 'payroll_overdue', 'payroll_due_soon', 'tax_deadline_overdue', 'tax_deadline_due_soon']);

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
    overdueLoans?: Loan[];
    overdueTransactions?: Transaction[];
    lowStockItems: InventoryItem[];
    overspentBudgets: OverspentBudget[];
    financingOpportunity: FinancingRecommendation | null;
    currency: string;
    /** Undefined ("not sure yet", or not asked) means no preference -- today's tier/amount ordering, unchanged. */
    primaryGoal?: PrimaryGoal;
}): PriorityItem[] {
    const { alerts, overdueInvoices, overdueLoans = [], overdueTransactions = [], lowStockItems, overspentBudgets, financingOpportunity, currency, primaryGoal } = input;
    const items: PriorityItem[] = [];

    for (const alert of alerts) {
        if (PASSTHROUGH_ALERT_TYPES.has(alert.type)) items.push(alertToPriorityItem(alert));
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

    // alertEngine reports one loan_payment_overdue alert per loan (with its
    // own days-overdue detail, kept in AlertsWidget); this aggregates them
    // into a single card the same way overdue invoices are, rather than
    // letting them pass through PASSTHROUGH_ALERT_TYPES one row per lender.
    if (overdueLoans.length > 0) {
        const total = Math.round(overdueLoans.reduce((s, l) => s + monthlyPayment(l.principal, l.interestRate, l.termMonths), 0));
        items.push({
            id: 'priority-overdue-loan-payments',
            kind: 'overdue_loan_payments',
            tier: 'attention',
            title: `${overdueLoans.length} Loan Payment${overdueLoans.length > 1 ? 's' : ''} Overdue`,
            subtitle: `${currency}${total.toLocaleString()} owed to ${overdueLoans.length > 1 ? 'your lenders' : overdueLoans[0].lenderName}`,
            impactAmount: total,
        });
    }

    // Income logged directly as a transaction (not through Invoices) that's
    // overdue or past its pending due date -- alertEngine already excludes
    // anything linked to an invoice, so this never double-counts against
    // the overdue-invoices card above.
    if (overdueTransactions.length > 0) {
        const total = overdueTransactions.reduce((s, t) => s + t.amount, 0);
        items.push({
            id: 'priority-overdue-transactions',
            kind: 'overdue_transactions',
            tier: 'attention',
            title: `${overdueTransactions.length} Payment${overdueTransactions.length > 1 ? 's' : ''} Overdue`,
            subtitle: `${currency}${total.toLocaleString()} to collect (logged as sales, not invoiced)`,
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
