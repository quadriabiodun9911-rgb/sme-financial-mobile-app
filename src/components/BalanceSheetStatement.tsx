/**
 * Bank-standard classified Balance Sheet -- same figures the "Everything
 * You Own / Owe" trend table already computes (balanceSheetTrend.ts), laid
 * out the way a lender expects: Current Assets / Fixed Assets -> Total
 * Assets, Current/Non-Current Liabilities -> Total Liabilities, Owners'
 * Equity, and the statement identity (Total Assets = Total Liabilities +
 * Equity) made visible rather than implied.
 */
import React from 'react';
import { BalanceSheetTrendPoint } from '../utils/balanceSheetTrend';
import { Transaction } from '../types';
import { StatementCard, StatementSection, StatementLine, StatementSpacer } from './FormalStatement';
import SourceOfTruthPanel from './SourceOfTruthPanel';

interface Props {
    businessName: string;
    asOfLabel: string; // e.g. "As of August 15, 2026"
    point: BalanceSheetTrendPoint;
    currency: string;
    // The exact transactions Cash/Accounts Receivable were built from --
    // optional so callers without this handy can omit it and this
    // statement renders exactly as before. Same convention as
    // ProfitAndLossStatement's revenueTransactions.
    cashTransactions?: Transaction[];
    receivableTransactions?: Transaction[];
}

export default function BalanceSheetStatement({ businessName, asOfLabel, point, currency, cashTransactions, receivableTransactions }: Props) {
    // point.shortTermAssets is the canonical figure (cashOnHand +
    // accountsReceivableNet + stockValue) -- it deliberately excludes
    // otherAssets, which balanceSheetTrend.ts only folds in at the
    // totalAssets level. Recomputing locally with otherAssets added back in
    // overstated this line vs. BalanceSheetComparisonTable's correct figure.
    const totalCurrentAssets = point.shortTermAssets;
    const totalFixedAssets = point.equipmentValue + point.manualEquipment;

    return (
        <StatementCard businessName={businessName} title="Balance Sheet" subtitle={asOfLabel}>
            <StatementSection label="Assets" />
            <StatementSection label="Current Assets" />
            <StatementLine label="Cash and Cash Equivalents" amount={point.cashOnHand} currency={currency} indent={1} />
            {cashTransactions && (
                <SourceOfTruthPanel
                    label="Cash and Cash Equivalents"
                    amount={point.cashOnHand}
                    currency={currency}
                    transactions={cashTransactions}
                    periodLabel={asOfLabel}
                />
            )}
            <StatementLine label="Accounts Receivable" amount={point.accountsReceivable} currency={currency} indent={1} />
            {receivableTransactions && (
                <SourceOfTruthPanel
                    label="Accounts Receivable"
                    amount={point.accountsReceivable}
                    currency={currency}
                    transactions={receivableTransactions}
                    periodLabel={asOfLabel}
                />
            )}
            {point.allowanceForDoubtfulDebts > 0 && (
                <StatementLine label="Less: Allowance for Doubtful Debts" amount={point.allowanceForDoubtfulDebts} currency={currency} indent={1} deduction muted />
            )}
            {point.stockValue > 0 && (
                <StatementLine label="Inventory" amount={point.stockValue} currency={currency} indent={1} />
            )}
            {point.otherAssets > 0 && (
                <StatementLine label="Other Current Assets" amount={point.otherAssets} currency={currency} indent={1} />
            )}
            <StatementLine label="Total Current Assets" amount={totalCurrentAssets} currency={currency} subtotal bold />

            <StatementSpacer />
            <StatementSection label="Fixed Assets" />
            <StatementLine label="Equipment & Property (net of depreciation)" amount={point.equipmentValue} currency={currency} indent={1} />
            {point.manualEquipment > 0 && (
                <StatementLine label="Equipment & Property (manually entered)" amount={point.manualEquipment} currency={currency} indent={1} />
            )}
            <StatementLine label="Total Fixed Assets" amount={totalFixedAssets} currency={currency} subtotal bold />

            <StatementLine label="TOTAL ASSETS" amount={point.totalAssets} currency={currency} total />

            <StatementSpacer />
            <StatementSection label="Liabilities" />
            <StatementSection label="Current Liabilities" />
            <StatementLine label="Accounts Payable" amount={point.accountsPayable} currency={currency} indent={1} />
            {point.loansCurrentPortion > 0 && (
                <StatementLine label="Loans Payable (due within 1 year)" amount={point.loansCurrentPortion} currency={currency} indent={1} />
            )}
            {point.otherLiabilities > 0 && (
                <StatementLine label="Other Current Liabilities" amount={point.otherLiabilities} currency={currency} indent={1} />
            )}
            <StatementLine label="Total Current Liabilities" amount={point.currentLiabilities} currency={currency} subtotal bold />

            {point.nonCurrentLiabilities > 0 && (
                <>
                    <StatementSpacer />
                    <StatementSection label="Non-Current Liabilities" />
                    <StatementLine label="Loans Payable (due after 1 year)" amount={point.nonCurrentLiabilities} currency={currency} indent={1} />
                    <StatementLine label="Total Non-Current Liabilities" amount={point.nonCurrentLiabilities} currency={currency} subtotal bold />
                </>
            )}

            <StatementLine label="TOTAL LIABILITIES" amount={point.totalLiabilities} currency={currency} total />

            <StatementSpacer />
            <StatementSection label="Owners' Equity" />
            <StatementLine label="Net Worth (Owner's Equity)" amount={point.netWorth} currency={currency} indent={1} deduction={point.netWorth < 0} />
            <StatementLine label="TOTAL OWNERS' EQUITY" amount={point.netWorth} currency={currency} subtotal bold deduction={point.netWorth < 0} />

            <StatementLine label="TOTAL LIABILITIES AND OWNERS' EQUITY" amount={point.totalLiabilities + point.netWorth} currency={currency} total />
        </StatementCard>
    );
}
