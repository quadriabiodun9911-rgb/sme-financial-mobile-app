/**
 * "Do the numbers actually balance?" -- opening balance + the net of the
 * parsed transaction amounts should equal the closing balance the bank
 * itself printed on the same statement. When they don't, that's usually a
 * parsing artifact (a fused number, a misread column, a skipped row) --
 * exactly the kind of silent error that would otherwise corrupt every
 * downstream total built from this import, without the business ever
 * knowing the source data didn't add up.
 *
 * Deliberately distinct from ReconciliationScreen's own "reconciliation"
 * (matching individual bank rows against transactions already in the
 * ledger) -- this checks a single statement file against ITSELF, using
 * only numbers the bank already printed on it, never a second source.
 * Only meaningful when BOTH an opening and closing balance were actually
 * found; a statement with neither (or only one) has nothing to check
 * against, and honestly reports that rather than guessing.
 */

export interface StatementBalanceRow {
    amount: number;
    type: 'income' | 'expense';
}

export interface StatementBalanceCheck {
    available: boolean;
    expectedClosing: number;
    actualClosing: number;
    discrepancy: number; // actualClosing - expectedClosing, signed
    hasDiscrepancy: boolean;
}

// A statement can carry small, legitimate rounding/timing noise (a fee
// posted a day either side of the cutoff, etc.) -- flagging every sub-unit
// difference would just train the user to ignore the warning. 0.5% of the
// closing balance, floored at a small absolute amount so a near-zero
// closing balance doesn't make the tolerance itself collapse to zero.
const RELATIVE_TOLERANCE = 0.005;
const MIN_ABSOLUTE_TOLERANCE = 1;

const UNAVAILABLE: StatementBalanceCheck = { available: false, expectedClosing: 0, actualClosing: 0, discrepancy: 0, hasDiscrepancy: false };

export function checkStatementBalance(
    openingBalance: number | undefined,
    closingBalance: number | undefined,
    rows: StatementBalanceRow[],
): StatementBalanceCheck {
    if (openingBalance === undefined || closingBalance === undefined) return UNAVAILABLE;

    const net = rows.reduce((s, r) => s + (r.type === 'income' ? r.amount : -r.amount), 0);
    const expectedClosing = openingBalance + net;
    const discrepancy = closingBalance - expectedClosing;
    const tolerance = Math.max(MIN_ABSOLUTE_TOLERANCE, Math.abs(closingBalance) * RELATIVE_TOLERANCE);

    return {
        available: true,
        expectedClosing,
        actualClosing: closingBalance,
        discrepancy,
        hasDiscrepancy: Math.abs(discrepancy) > tolerance,
    };
}
