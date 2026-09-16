/**
 * "How much financing do I need" is a smaller question than "why do I
 * need it." capitalNeedAssessment.ts already checks whether a stated ASK
 * fits sustainable repayment capacity; this looks at the gap itself --
 * required amount minus available cash -- and attributes it to the most
 * plausible real driver: inventory sitting idle, receivables collecting
 * too slowly, margin eroding, or expenses outrunning revenue. A ranked
 * hint toward what to fix, not a precise decomposition -- the four
 * signals are in different units (naira tied up vs percentage points) and
 * this deliberately never forces them onto one fabricated common scale;
 * each is judged against its own honest threshold, and ranked among
 * FLAGGED causes only by how far each exceeds its own bar.
 *
 * Every signal reuses an engine that already exists:
 * - Inventory: computeSlowMovingValue (inventoryIntelligence.ts) -- cash
 *   already tied up in slow-moving stock, the same figure Margin Watch's
 *   Affordable Stock Level card already surfaces.
 * - Receivables: computeAgingBuckets (finance.ts) -- the same aging logic
 *   Reports' own aging view uses, restricted to the 60+ day buckets since
 *   that's what "collecting too slowly" actually means, not any pending
 *   invoice.
 * - Margin / expenses: two trailing 30-day windows compared directly --
 *   the same window computeCashRunway's own dailyBurn already uses, not a
 *   separately-invented period.
 */
import { Transaction, Invoice, InventoryItem } from '../types';
import { computeSlowMovingValue } from './inventoryIntelligence';
import { computeAgingBuckets } from './finance';
import { localDateStr } from './localDate';

export type FundingGapCause = 'inventory' | 'receivables' | 'margin' | 'expenses';

export interface FundingGapCauseSignal {
    cause: FundingGapCause;
    label: string;
    flagged: boolean;
    detail: string;
    // The value actually measured, in whatever unit that cause is judged
    // in -- naira for inventory/receivables, percentage points for
    // margin/expenses. Never compared directly across causes.
    value: number;
    unit: '₦' | 'pp';
}

export interface FundingGapDiagnosis {
    available: boolean;
    reason?: string;
    gapAmount: number;
    signals: FundingGapCauseSignal[];
    primaryCause: FundingGapCauseSignal | null;
    // True when the flagged pressure looks like it's persisted beyond one
    // period -- either a snapshot cause (inventory/receivables), which by
    // definition already implies the condition has sat unresolved for a
    // while, or a flow cause (margin/expenses) that was also flagged in
    // the PRIOR 30-day window. False (or null, with no flagged cause)
    // means this looks like a one-off, not a structural pattern.
    recurring: boolean | null;
}

const INVENTORY_PCT_OF_GAP_THRESHOLD = 20;
const RECEIVABLES_PCT_OF_GAP_THRESHOLD = 20;
const MARGIN_DECLINE_PP_THRESHOLD = 3;
const EXPENSE_OUTRUN_PP_THRESHOLD = 5;

function windowTotals(transactions: Transaction[], startStr: string, endStr: string) {
    const inWindow = (t: Transaction) => t.status === 'paid' && t.date >= startStr && t.date <= endStr;
    const revenue = transactions.filter(t => t.type === 'income' && inWindow(t)).reduce((s, t) => s + (t.amount ?? 0), 0);
    const expense = transactions.filter(t => t.type === 'expense' && inWindow(t)).reduce((s, t) => s + (t.amount ?? 0), 0);
    return { revenue, expense };
}

function pctChange(current: number, prior: number): number | null {
    if (prior <= 0) return null; // no honest rate to express from a zero/negative base
    return ((current - prior) / prior) * 100;
}

function computeFlowSignals(transactions: Transaction[], now: Date): { marginDeclinePts: number | null; expenseOutrunPp: number | null } {
    const day = (offset: number) => { const d = new Date(now); d.setDate(d.getDate() + offset); return localDateStr(d); };
    const current = windowTotals(transactions, day(-30), day(0));
    const prior = windowTotals(transactions, day(-60), day(-31));

    const currentMargin = current.revenue > 0 ? ((current.revenue - current.expense) / current.revenue) * 100 : null;
    const priorMargin = prior.revenue > 0 ? ((prior.revenue - prior.expense) / prior.revenue) * 100 : null;
    const marginDeclinePts = currentMargin != null && priorMargin != null ? priorMargin - currentMargin : null;

    const revenueGrowthPct = pctChange(current.revenue, prior.revenue);
    const expenseGrowthPct = pctChange(current.expense, prior.expense);
    const expenseOutrunPp = revenueGrowthPct != null && expenseGrowthPct != null ? expenseGrowthPct - revenueGrowthPct : null;

    return { marginDeclinePts, expenseOutrunPp };
}

export function computeFundingGapDiagnosis(
    transactions: Transaction[],
    invoices: Invoice[],
    inventory: InventoryItem[],
    cashBalance: number,
    requiredAmount: number,
    currency: string = '₦',
    now: Date = new Date(),
): FundingGapDiagnosis {
    const gapAmount = Math.max(0, requiredAmount - cashBalance);
    if (gapAmount === 0) {
        return { available: false, reason: 'Available cash already covers the required amount -- there is no gap to diagnose.', gapAmount: 0, signals: [], primaryCause: null, recurring: null };
    }

    const fmt = (n: number) => `${currency}${Math.round(n).toLocaleString()}`;

    const slowMovingValue = computeSlowMovingValue(inventory, transactions);
    const inventoryPctOfGap = (slowMovingValue / gapAmount) * 100;
    const inventorySignal: FundingGapCauseSignal = {
        cause: 'inventory', label: 'Cash trapped in slow-moving stock',
        flagged: inventoryPctOfGap >= INVENTORY_PCT_OF_GAP_THRESHOLD,
        value: slowMovingValue, unit: '₦',
        detail: `${fmt(slowMovingValue)} sitting in slow-moving inventory -- ${inventoryPctOfGap.toFixed(0)}% of the ${fmt(gapAmount)} gap.`,
    };

    const receivablesBuckets = computeAgingBuckets(transactions, 'income', invoices);
    const slowReceivables = receivablesBuckets.filter(b => b.label === '61–90 days' || b.label === '90+ days').reduce((s, b) => s + b.total, 0);
    const receivablesPctOfGap = (slowReceivables / gapAmount) * 100;
    const receivablesSignal: FundingGapCauseSignal = {
        cause: 'receivables', label: 'Customers paying too slowly',
        flagged: receivablesPctOfGap >= RECEIVABLES_PCT_OF_GAP_THRESHOLD,
        value: slowReceivables, unit: '₦',
        detail: `${fmt(slowReceivables)} owed by customers over 60 days late -- ${receivablesPctOfGap.toFixed(0)}% of the ${fmt(gapAmount)} gap.`,
    };

    const { marginDeclinePts, expenseOutrunPp } = computeFlowSignals(transactions, now);
    const marginSignal: FundingGapCauseSignal | null = marginDeclinePts != null ? {
        cause: 'margin', label: 'Margin eroding',
        flagged: marginDeclinePts >= MARGIN_DECLINE_PP_THRESHOLD,
        value: marginDeclinePts, unit: 'pp',
        detail: `Gross margin fell ${marginDeclinePts.toFixed(1)} points over the last 30 days vs. the 30 before that.`,
    } : null;

    const expenseSignal: FundingGapCauseSignal | null = expenseOutrunPp != null ? {
        cause: 'expenses', label: 'Expenses outrunning revenue',
        flagged: expenseOutrunPp >= EXPENSE_OUTRUN_PP_THRESHOLD,
        value: expenseOutrunPp, unit: 'pp',
        detail: `Expenses grew ${expenseOutrunPp.toFixed(1)} points faster than revenue over the last 30 days.`,
    } : null;

    const signals = [inventorySignal, receivablesSignal, marginSignal, expenseSignal].filter((s): s is FundingGapCauseSignal => s != null);
    const flagged = signals.filter(s => s.flagged);

    const thresholdFor = (cause: FundingGapCause) =>
        cause === 'inventory' ? INVENTORY_PCT_OF_GAP_THRESHOLD :
        cause === 'receivables' ? RECEIVABLES_PCT_OF_GAP_THRESHOLD :
        cause === 'margin' ? MARGIN_DECLINE_PP_THRESHOLD : EXPENSE_OUTRUN_PP_THRESHOLD;

    const primaryCause = flagged.length > 0
        ? flagged.reduce((best, s) => (s.value / thresholdFor(s.cause)) > (best.value / thresholdFor(best.cause)) ? s : best)
        : null;

    let recurring: boolean | null = null;
    if (primaryCause) {
        if (primaryCause.cause === 'inventory' || primaryCause.cause === 'receivables') {
            recurring = true; // a 60+ day receivable or a 'slow' stock tier already implies this has sat unresolved a while
        } else {
            const priorNow = new Date(now); priorNow.setDate(priorNow.getDate() - 30);
            const priorFlow = computeFlowSignals(transactions, priorNow);
            recurring = primaryCause.cause === 'margin'
                ? (priorFlow.marginDeclinePts ?? 0) >= MARGIN_DECLINE_PP_THRESHOLD
                : (priorFlow.expenseOutrunPp ?? 0) >= EXPENSE_OUTRUN_PP_THRESHOLD;
        }
    }

    return { available: true, gapAmount, signals, primaryCause, recurring };
}
