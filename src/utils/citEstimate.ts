// Companies Income Tax (CIT) estimate -- advisory only, same spirit as
// vatCalculator.ts's VAT exemption check. finance.ts's EnhancedPnL
// deliberately stops at profitBeforeTax and models no income tax
// provision (see its own comment: "this app tracks transaction-level
// sales/VAT tax separately, not income tax on profit"). This module
// doesn't change that -- it reads the same already-trusted
// profitBeforeTax figure and layers a separate, clearly-labeled estimate
// on top, rather than folding a modeled tax into the P&L's own bottom
// line.
import { Transaction, Asset, BadDebtProvision, ReceivableWriteOff, InventoryWriteDown } from '../types';
import { computeEnhancedPnL } from './finance';
import { computeTrailing12MonthRevenue } from './vatCalculator';
import { localDateStr } from './localDate';

// Nigeria Tax Act 2025/2026 reform raised the Companies Income Tax
// small-company exemption threshold to this annual turnover figure (0%
// CIT on profit below it). NOT independently re-verified against the
// reform's primary text at the time this was written -- carried over
// from the comment already left in vatCalculator.ts flagging the same
// figure. Confirm against the Nigeria Tax Act or NRS directly before
// relying on this for a real filing decision -- the card that uses this
// always says so too.
export const NGN_CIT_SMALL_COMPANY_THRESHOLD = 100_000_000;

// Standard CIT rate for companies at or above the small-company
// threshold. NOT independently re-verified against the 2025/2026 reform
// text -- same disclosure as the threshold above.
export const CIT_STANDARD_RATE_PERCENT = 30;

export interface CitEstimate {
    trailing12moRevenue: number;
    isSmallCompany: boolean;
    thresholdNgn: number;
    profitBeforeTax: number;
    ratePercent: number;
    estimatedCit: number;
}

// Trailing-12-month profitBeforeTax, taxed at 0% below the small-company
// turnover threshold and at the standard rate above it (never negative --
// a trailing-12-month loss owes no CIT). Reuses
// computeTrailing12MonthRevenue (the same figure the VAT exemption check
// reads) for the threshold test, and computeEnhancedPnL over that same
// trailing-12-month transaction window for profit, rather than
// re-deriving either independently.
export function computeCitEstimate(
    transactions: Transaction[],
    assets: Asset[],
    badDebtProvisions: BadDebtProvision[] = [],
    receivableWriteOffs: ReceivableWriteOff[] = [],
    inventoryWriteDowns: InventoryWriteDown[] = [],
    referenceDate: Date = new Date(),
): CitEstimate {
    const trailing12moRevenue = computeTrailing12MonthRevenue(transactions, referenceDate);
    const isSmallCompany = trailing12moRevenue < NGN_CIT_SMALL_COMPANY_THRESHOLD;

    const refMs = referenceDate.getTime();
    const cutoffMs = refMs - 365 * 86400000;
    const periodEnd = localDateStr(referenceDate);
    const periodTx = transactions.filter(t => {
        const ms = new Date(t.date).getTime();
        return ms >= cutoffMs && ms <= refMs;
    });

    const pnl = computeEnhancedPnL(periodTx, assets, badDebtProvisions, receivableWriteOffs, inventoryWriteDowns, periodEnd);
    const profitBeforeTax = pnl.profitBeforeTax;
    const ratePercent = isSmallCompany ? 0 : CIT_STANDARD_RATE_PERCENT;
    const estimatedCit = (isSmallCompany || profitBeforeTax <= 0) ? 0 : profitBeforeTax * (ratePercent / 100);

    return {
        trailing12moRevenue,
        isSmallCompany,
        thresholdNgn: NGN_CIT_SMALL_COMPANY_THRESHOLD,
        profitBeforeTax,
        ratePercent,
        estimatedCit,
    };
}
