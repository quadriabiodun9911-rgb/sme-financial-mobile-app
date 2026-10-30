/**
 * Statement of Changes in Equity -- Opening Equity + Net Profit + Owner
 * Contributions - Owner Drawings = Closing Equity, for one period. See
 * changesInEquity.ts for why "Closing Equity" here is read straight off
 * the Balance Sheet's own figure rather than re-derived, and why a gap
 * between that and the sum of the lines above it is shown rather than
 * hidden.
 */
import React from 'react';
import { ChangesInEquityPoint } from '../utils/changesInEquity';
import { StatementCard, StatementSection, StatementLine, StatementSpacer } from './FormalStatement';

interface Props {
    businessName: string;
    periodLabel: string; // e.g. "For the period 1 August 2026 - 31 August 2026"
    point: ChangesInEquityPoint;
    currency: string;
}

export default function ChangesInEquityStatement({ businessName, periodLabel, point, currency }: Props) {
    const hasUnexplained = Math.abs(point.unexplainedMovement) >= 1;

    return (
        <StatementCard businessName={businessName} title="Statement of Changes in Equity" subtitle={periodLabel}>
            <StatementLine label="Opening Equity" amount={point.openingEquity} currency={currency} deduction={point.openingEquity < 0} />

            <StatementSpacer />
            <StatementSection label="Movements for the Period" />
            <StatementLine label="Net Profit for the Period" amount={point.netProfit} currency={currency} indent={1} deduction={point.netProfit < 0} />
            {point.ownerContributions > 0 && (
                <StatementLine label="Owner Contributions" amount={point.ownerContributions} currency={currency} indent={1} />
            )}
            {point.ownerDrawings > 0 && (
                <StatementLine label="Owner Drawings" amount={point.ownerDrawings} currency={currency} indent={1} deduction />
            )}
            {hasUnexplained && (
                <StatementLine label="Other Movements (Unexplained)" amount={point.unexplainedMovement} currency={currency} indent={1} deduction={point.unexplainedMovement < 0} />
            )}

            <StatementSpacer />
            <StatementLine label="CLOSING EQUITY" amount={point.closingEquity} currency={currency} total deduction={point.closingEquity < 0} />
        </StatementCard>
    );
}
