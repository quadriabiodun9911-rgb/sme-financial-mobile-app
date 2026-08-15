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
import { StatementCard, StatementSection, StatementLine, StatementSpacer } from './FormalStatement';

interface Props {
    businessName: string;
    asOfLabel: string; // e.g. "As of August 15, 2026"
    point: BalanceSheetTrendPoint;
    currency: string;
}

export default function BalanceSheetStatement({ businessName, asOfLabel, point, currency }: Props) {
    const totalCurrentAssets = point.cashOnHand + point.accountsReceivable + point.stockValue + point.otherAssets;
    const totalFixedAssets = point.equipmentValue + point.manualEquipment;

    return (
        <StatementCard businessName={businessName} title="Balance Sheet" subtitle={asOfLabel}>
            <StatementSection label="Assets" />
            <StatementSection label="Current Assets" />
            <StatementLine label="Cash and Cash Equivalents" amount={point.cashOnHand} currency={currency} indent={1} />
            <StatementLine label="Accounts Receivable" amount={point.accountsReceivable} currency={currency} indent={1} />
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
