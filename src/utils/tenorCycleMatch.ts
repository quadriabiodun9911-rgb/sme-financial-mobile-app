/**
 * "Does the tenor match the project cycle?" -- one of the questions a
 * borrower should ask before taking on a facility. Quad360 already
 * computes a real cash-conversion cycle (computeCashConversionCycle,
 * cfoMetrics.ts -- DSO + DIO - DPO, the actual textbook figure including
 * inventory days, not the receivables-only approximation in finance.ts).
 * This compares a proposed loan's term against that cycle rather than
 * inventing a second one.
 *
 * Deliberately answers only one direction: whether the term is SHORTER
 * than one full cash cycle, which is an unambiguous risk regardless of
 * what the loan is for (the funded activity may not have converted back
 * to cash by the time repayment is due). It does NOT flag a term as "too
 * long" -- that would require knowing whether this is a working-capital
 * loan (where a long tenor wastes interest) or a capex loan (where tenor
 * should match the asset's useful life, something Quad360 has no data
 * on since Loan.purpose is free text nothing else in the app reads --
 * see loanAffordabilityCheck.ts's own comment on that). Guessing capex
 * vs. working-capital from free text would be exactly the kind of
 * fabricated tailoring that file explicitly avoids.
 */

import { Transaction, InventoryItem } from '../types';
import { computeCashConversionCycle, computeTrailingAccrualFigures } from './cfoMetrics';
import { computeInventoryValue } from './stockVelocity';

export interface TenorCycleCheck {
    cccDays: number;
    cccMonths: number;
    termMonths: number;
    status: 'shorter_than_cycle' | 'covers_cycle';
    message: string;
}

export function computeTenorCycleCheck(
    termMonths: number,
    transactions: Transaction[],
    inventory: InventoryItem[],
): TenorCycleCheck | null {
    if (!termMonths || termMonths <= 0) return null;

    const { unpaidIncome, unpaidExpenses, trailing30AccrualRevenue, trailing30AccrualExpenses } = computeTrailingAccrualFigures(transactions);
    // No reliable revenue base to compute DSO/DIO/DPO from -- rather than
    // show a cycle built on a near-zero denominator, this stays silent.
    if (trailing30AccrualRevenue <= 0) return null;

    const inventoryValue = computeInventoryValue(inventory);
    const { ccc: cccDays } = computeCashConversionCycle(unpaidIncome, trailing30AccrualRevenue, unpaidExpenses, trailing30AccrualExpenses, inventoryValue);
    const cccMonths = cccDays / 30;

    const status: TenorCycleCheck['status'] = termMonths < cccMonths ? 'shorter_than_cycle' : 'covers_cycle';

    const message = status === 'shorter_than_cycle'
        ? `Your cash cycle -- from paying for stock/supplies to collecting from customers -- currently takes about ${cccMonths.toFixed(1)} months. This loan's ${termMonths}-month term is shorter than that, so you may need to repay or refinance before the funded activity has fully turned back into cash.`
        : cccMonths <= 0
            ? `Your business currently collects cash faster than it pays suppliers back (a negative cash cycle), so this loan's ${termMonths}-month term comfortably covers it.`
            : `Your cash cycle currently takes about ${cccMonths.toFixed(1)} months. This loan's ${termMonths}-month term covers at least one full cycle, so you shouldn't need to repay before the funded activity converts back to cash.`;

    return { cccDays, cccMonths, termMonths, status, message };
}
