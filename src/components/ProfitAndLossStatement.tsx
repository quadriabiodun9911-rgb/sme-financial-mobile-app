/**
 * Bank-standard Profit & Loss statement -- same computeEnhancedPnL figures
 * the "Plain English" P&L card already shows, laid out and labeled the way
 * a lender's underwriter actually expects to read one (Gross Profit,
 * Operating Expenses by category, Operating Income, Net Income), not the
 * friendly paraphrases used elsewhere in the app.
 *
 * Every category line comes straight from enhPnL.revenueByCategory /
 * cogsCategories / sgaCategories -- real transaction categories, not
 * relabeled totals. A section with no data (e.g. no COGS transactions) is
 * omitted rather than shown as a fabricated zero.
 */
import React from 'react';
import { EnhancedPnL } from '../utils/finance';
import { StatementCard, StatementSection, StatementLine, StatementNote, StatementSpacer } from './FormalStatement';

interface Props {
    businessName: string;
    periodLabel: string; // e.g. "For the period Jan 1 – Aug 15, 2026"
    pnl: EnhancedPnL;
    currency: string;
}

export default function ProfitAndLossStatement({ businessName, periodLabel, pnl, currency }: Props) {
    const hasCogs = pnl.cogs > 0;
    const hasInterest = pnl.interestExpense !== 0;

    return (
        <StatementCard businessName={businessName} title="Profit and Loss Statement" subtitle={periodLabel}>
            <StatementSection label="Revenue" />
            {pnl.revenueByCategory.length > 1
                ? pnl.revenueByCategory.map(r => (
                    <StatementLine key={r.category} label={r.category} amount={r.amount} currency={currency} indent={1} />
                ))
                : null}
            <StatementLine label="Total Revenue" amount={pnl.revenue} currency={currency} subtotal bold />

            {hasCogs && (
                <>
                    <StatementSection label="Cost of Goods Sold" />
                    {pnl.cogsCategories.map(c => (
                        <StatementLine key={c.category} label={c.category} amount={c.amount} currency={currency} indent={1} deduction />
                    ))}
                    <StatementLine label="Total Cost of Goods Sold" amount={pnl.cogs} currency={currency} subtotal deduction />
                </>
            )}

            <StatementLine label="Gross Profit" amount={pnl.grossProfit} currency={currency} total />
            <StatementNote text={`Gross margin: ${(isNaN(pnl.grossMargin) ? 0 : pnl.grossMargin).toFixed(1)}%`} />

            <StatementSpacer />
            <StatementSection label="Operating Expenses" />
            {pnl.sgaCategories.length > 0
                ? pnl.sgaCategories.map(c => (
                    <StatementLine key={c.category} label={c.category} amount={c.amount} currency={currency} indent={1} deduction />
                ))
                : <StatementLine label="No operating expenses recorded" amount={0} currency={currency} indent={1} muted />}
            <StatementLine label="Total Operating Expenses" amount={pnl.sgaExpenses} currency={currency} subtotal deduction />

            <StatementLine label="Operating Income (EBIT)" amount={pnl.ebit} currency={currency} total />
            <StatementNote text={`Operating margin: ${(isNaN(pnl.ebitMargin) ? 0 : pnl.ebitMargin).toFixed(1)}%`} />

            {hasInterest && (
                <>
                    <StatementSpacer />
                    <StatementSection label="Non-Operating Expenses" />
                    <StatementLine label="Interest Expense" amount={pnl.interestExpense} currency={currency} indent={1} deduction />
                </>
            )}

            <StatementSpacer />
            <StatementLine label="Net Income Before Taxes" amount={pnl.profitBeforeTax} currency={currency} bold />
            <StatementNote text="Income tax not calculated -- Quad360 tracks transaction-level sales/VAT tax separately from income tax on profit." />
            <StatementLine label="NET INCOME" amount={pnl.netProfit} currency={currency} total />
            <StatementNote text={`Net margin: ${(isNaN(pnl.netMargin) ? 0 : pnl.netMargin).toFixed(1)}%`} />
        </StatementCard>
    );
}
