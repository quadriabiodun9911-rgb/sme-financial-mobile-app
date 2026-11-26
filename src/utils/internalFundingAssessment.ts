/**
 * Internal Funding & Financial Stability Assessment.
 *
 * "Before looking outside your business for money, understand how much
 * value and financing potential already exist within your business." Many
 * SMEs assume they need more capital when the underlying problem is poor
 * cash-flow management, slow-moving stock, or money sitting uncollected in
 * customer invoices -- this answers "how much of that could I actually
 * release myself" with a real number, before any financing conversation.
 *
 * Every figure here is an existing, already-trusted engine reused for this
 * one new question, never a second independently-tuned estimate:
 * - Available cash today: computeDiscretionaryCash (discretionaryCash.ts) --
 *   cash plus near-term receivables, minus everything already spoken for
 *   and the owner's own reserve target. This is the one tier that's
 *   genuinely spendable right now, no action required.
 * - Cash tied up in slow-moving stock: computeAffordableInventoryLevel
 *   (affordableInventory.ts), which already computes this alongside the
 *   same safe-runway check Margin Watch's own "Affordable Stock Level"
 *   card uses -- releasing it requires actually selling or discounting
 *   that stock, so it's an opportunity, not cash in hand.
 * - Overdue customer payments: computeAgingBuckets (finance.ts), the exact
 *   same aging buckets the Aging Report uses. Deliberately only the 31-90
 *   day buckets count here -- the "Current (0-30 days)" bucket is already
 *   folded into computeDiscretionaryCash's own expectedNearTermReceivables,
 *   so counting it again here would double it. The 90+ day bucket is
 *   tracked separately as doubtful rather than counted at all, since very
 *   old receivables are unlikely to actually be collected and including
 *   them would overstate what's really recoverable.
 * - Cost pressure: detectSupplierPricePressure (supplierPricePressure.ts)
 *   flags items whose real cost has outrun their price -- surfaced as a
 *   qualitative signal only, never summed into the total. There's no
 *   trustworthy way to turn "a cost is rising" into a firm currency saving
 *   without the owner actually acting on it; inventing one would be
 *   exactly the kind of fabricated precision this app's other engines
 *   (MacroShield, billIntelligence) already go out of their way to avoid.
 *
 * Deliberately does NOT just hand over a number: releasing inventory value
 * or collecting overdue invoices converts existing assets into cash, it
 * doesn't create new profit, and using any of this money -- even the
 * "available today" tier -- while runway is already short would weaken
 * the business further, not strengthen it. stabilityWarning says so
 * explicitly rather than only showing a total that looks safe to spend.
 */
import { Transaction, InventoryItem, Invoice, Loan, Bill } from '../types';
import { computeAffordableInventoryLevel } from './affordableInventory';
import { computeAgingBuckets } from './finance';
import { computeDiscretionaryCash, DiscretionaryCashResult } from './discretionaryCash';
import { detectSupplierPricePressure, SupplierPricePressureFlag } from './supplierPricePressure';

export type InternalFundingSourceKey = 'availableCash' | 'inventoryRelease' | 'receivablesCollection';

export interface InternalFundingSource {
    key: InternalFundingSourceKey;
    label: string;
    amount: number;
    // 'available' -- genuinely spendable today, no further action needed.
    // 'identified' -- a real, dated amount, but realizing it requires an
    // action (collecting a debt) with no guarantee of success.
    // 'estimate' -- not a dated/booked figure, inferred from a valuation
    // (stock at cost) that assumes a sale actually happens.
    confidence: 'available' | 'identified' | 'estimate';
    requiresAction: boolean;
    note: string;
}

export interface InternalFundingAssessment {
    sources: InternalFundingSource[];
    totalPotentialInternalFunding: number;
    // 90+ day receivables -- tracked, not counted in the total (see header comment).
    doubtfulReceivables: number;
    // Qualitative only -- never contributes to totalPotentialInternalFunding.
    costPressureFlags: SupplierPricePressureFlag[];
    discretionary: DiscretionaryCashResult;
    currentRunwayDays: number;
    safeRunwayDays: number;
    alreadyTightRunway: boolean;
    stabilityWarning: string | null;
    // Only present when the caller supplied a specific funding need to size against.
    fundingNeed: number | null;
    fundingGap: number | null;
}

export function computeInternalFundingAssessment(
    transactions: Transaction[],
    inventory: InventoryItem[],
    invoices: Invoice[],
    loans: Loan[],
    bills: Bill[],
    cashBalance: number,
    emergencyBufferTarget: number = 0,
    fundingNeed: number | null = null,
    now: Date = new Date(),
): InternalFundingAssessment {
    const discretionary = computeDiscretionaryCash(transactions, cashBalance, loans, bills, invoices, 0, now, emergencyBufferTarget);
    const affordable = computeAffordableInventoryLevel(transactions, cashBalance, inventory, now);

    const receivableBuckets = computeAgingBuckets(transactions, 'income', invoices);
    const collectibleOverdue = receivableBuckets
        .filter(b => b.label === '31–60 days' || b.label === '61–90 days')
        .reduce((s, b) => s + b.total, 0);
    const doubtfulReceivables = receivableBuckets
        .filter(b => b.label === '90+ days')
        .reduce((s, b) => s + b.total, 0);

    const costPressureFlags = detectSupplierPricePressure(inventory);

    const sources: InternalFundingSource[] = [
        {
            key: 'availableCash',
            label: 'Cash already available',
            amount: discretionary.discretionaryCash,
            confidence: 'available',
            requiresAction: false,
            note: "Already free to use today — cash on hand plus money owed that isn't overdue, minus what's already committed (near-term operating costs, loan repayments, pending bills) and your own reserve target.",
        },
        {
            key: 'inventoryRelease',
            label: 'Cash tied up in slow-moving stock',
            amount: affordable.slowMovingValue,
            confidence: 'estimate',
            requiresAction: true,
            note: "Not cash in hand — this is what's trapped in stock that's selling slowly. Releasing it means actually selling or discounting that stock first.",
        },
        {
            key: 'receivablesCollection',
            label: 'Overdue customer payments to collect',
            amount: collectibleOverdue,
            confidence: 'identified',
            requiresAction: true,
            note: "Money customers already owe, 31–90 days overdue. Collecting it releases cash, but it isn't new profit, and collection isn't guaranteed.",
        },
    ];

    const totalPotentialInternalFunding = sources.reduce((s, src) => s + Math.max(0, src.amount), 0);

    const stabilityWarning = affordable.alreadyTightRunway
        ? `Cash runway is already short (about ${Math.round(affordable.currentRunwayDays)} days, below the ${affordable.safeRunwayDays}-day safety line) — using this money for anything other than shoring up operating cash risks making that worse, not better.`
        : null;

    const fundingGap = fundingNeed !== null ? Math.max(0, fundingNeed - totalPotentialInternalFunding) : null;

    return {
        sources,
        totalPotentialInternalFunding,
        doubtfulReceivables,
        costPressureFlags,
        discretionary,
        currentRunwayDays: affordable.currentRunwayDays,
        safeRunwayDays: affordable.safeRunwayDays,
        alreadyTightRunway: affordable.alreadyTightRunway,
        stabilityWarning,
        fundingNeed,
        fundingGap,
    };
}
