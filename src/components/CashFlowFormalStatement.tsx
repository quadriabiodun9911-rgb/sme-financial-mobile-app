/**
 * Bank-standard indirect-method Statement of Cash Flows -- same
 * computeProperCashFlow figures the "Cash Summary" card already shows
 * (Operating / Investing / Financing), laid out and labeled the way a
 * lender expects (Net Income, Adjustments to Reconcile, Net Cash Provided
 * by Operating/Investing/Financing Activities), bookended with Beginning
 * and Ending Cash Balance.
 *
 * computeProperCashFlow always runs over the business's full transaction
 * history (not the Reports period filter), so this statement is framed as
 * "since records began" rather than a single month -- Beginning Cash
 * Balance is genuinely $0 in that framing (this app has no separate opening
 * cash balance setting), and Ending Cash Balance is today's real cash
 * balance, so the statement's own arithmetic (Beginning + Net Change =
 * Ending) holds exactly, not just approximately.
 */
import React from 'react';
import { ProperCashFlow } from '../utils/finance';
import { StatementCard, StatementSection, StatementLine, StatementNote, StatementSpacer } from './FormalStatement';

interface Props {
    businessName: string;
    sinceLabel: string; // e.g. "Since records began (Jan 3, 2025) through August 15, 2026"
    cf: ProperCashFlow;
    endingCashBalance: number;
    currency: string;
}

export default function CashFlowFormalStatement({ businessName, sinceLabel, cf, endingCashBalance, currency }: Props) {
    const beginningCashBalance = endingCashBalance - cf.netCashChange;

    return (
        <StatementCard businessName={businessName} title="Statement of Cash Flows" subtitle={sinceLabel}>
            <StatementSection label="Cash Flows from Operating Activities" />
            <StatementLine label="Net Income" amount={cf.netProfit} currency={currency} indent={1} deduction={cf.netProfit < 0} />
            <StatementLine label="Depreciation and Amortization" amount={cf.depreciation} currency={currency} indent={1} />
            {cf.changeInAP !== 0 && (
                <StatementLine
                    label={cf.changeInAP >= 0 ? 'Increase in Accounts Payable' : 'Decrease in Accounts Payable'}
                    amount={cf.changeInAP} currency={currency} indent={1} deduction={cf.changeInAP < 0}
                />
            )}
            {cf.changeInAR !== 0 && (
                <StatementLine
                    label={cf.changeInAR >= 0 ? 'Decrease in Accounts Receivable' : 'Increase in Accounts Receivable'}
                    amount={cf.changeInAR} currency={currency} indent={1} deduction={cf.changeInAR < 0}
                />
            )}
            <StatementLine label="Net Cash Provided by Operating Activities" amount={cf.operatingCF} currency={currency} total />

            <StatementSpacer />
            <StatementSection label="Cash Flows from Investing Activities" />
            {cf.assetPurchases > 0 && (
                <StatementLine label="Purchase of Equipment and Property" amount={cf.assetPurchases} currency={currency} indent={1} deduction />
            )}
            {cf.assetDisposals > 0 && (
                <StatementLine label="Proceeds from Sale of Equipment and Property" amount={cf.assetDisposals} currency={currency} indent={1} />
            )}
            {cf.assetPurchases === 0 && cf.assetDisposals === 0 && (
                <StatementLine label="No investing activity recorded" amount={0} currency={currency} indent={1} muted />
            )}
            <StatementLine label="Net Cash Used in Investing Activities" amount={cf.investingCF} currency={currency} total deduction={cf.investingCF < 0} />

            <StatementSpacer />
            <StatementSection label="Cash Flows from Financing Activities" />
            {cf.principalRepayments > 0
                ? <StatementLine label="Repayment of Loan Principal" amount={cf.principalRepayments} currency={currency} indent={1} deduction />
                : <StatementLine label="No financing activity recorded" amount={0} currency={currency} indent={1} muted />}
            <StatementLine label="Net Cash Used in Financing Activities" amount={cf.financingCF} currency={currency} total deduction={cf.financingCF < 0} />
            <StatementNote text="New loan draws and owner capital contributions aren't tracked as financing activity yet." />

            <StatementSpacer />
            <StatementLine label="Net Increase (Decrease) in Cash" amount={cf.netCashChange} currency={currency} bold deduction={cf.netCashChange < 0} />
            <StatementLine label="Beginning Cash Balance" amount={beginningCashBalance} currency={currency} deduction={beginningCashBalance < 0} />
            <StatementLine label="ENDING CASH BALANCE" amount={endingCashBalance} currency={currency} total deduction={endingCashBalance < 0} />
        </StatementCard>
    );
}
