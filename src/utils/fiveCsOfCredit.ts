/**
 * The Five C's of Credit — Character, Capacity, Capital, Collateral,
 * Conditions — the classic lender framework this app's own risk score is
 * often read against. Quad360's computeRiskScore() genuinely evidences
 * some of these (Capacity, Collateral) directly from recorded transactions,
 * has real supporting data for one that isn't part of the weighted score
 * at all (Capital, via the balance sheet), and has no honest signal for
 * the rest (Character; the macro half of Conditions).
 *
 * This file exists to say that plainly rather than let the 7-factor score
 * imply it covers all five — the same "manufacture the evidence, not a
 * fabricated score" principle Investment Readiness (businessPassport.ts)
 * is built on.
 */

import { RiskScore } from './finance';
import { LeverageRatios } from './debtRatios';
import { DSCRResult } from './finance';

export interface FiveCAssessment {
    name: 'Character' | 'Capacity' | 'Capital' | 'Collateral' | 'Conditions';
    question: string;
    evidenced: boolean;
    summary: string;
    relatedFactors: string[]; // names from RiskScore.factors that feed this C, if any
}

function fmt(currency: string, n: number): string {
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1_000_000) return `${sign}${currency}${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}${currency}${(abs / 1_000).toFixed(1)}K`;
    return `${sign}${currency}${abs.toFixed(0)}`;
}

export function buildFiveCsAssessment(
    risk: RiskScore,
    dscr: DSCRResult,
    leverage: LeverageRatios,
    inventoryValue: number,
    assetBookValue: number,
    currency: string,
): FiveCAssessment[] {
    const factor = (name: string) => risk.factors.find(f => f.name === name);
    const profitability = factor('Profitability');
    const liquidity = factor('Liquidity');
    const inventory = factor('Inventory');
    const concentration = factor('Concentration');

    const collateralValue = inventoryValue + assetBookValue;

    return [
        {
            name: 'Character',
            question: 'Will they repay?',
            evidenced: false,
            summary: 'Character covers management integrity, governance and track record with other lenders — none of that is visible in recorded transactions. A lender assesses this through references, interviews and credit bureau history, not a Quad360 record.',
            relatedFactors: [],
        },
        {
            name: 'Capacity',
            question: 'Can they repay?',
            evidenced: true,
            summary: `DSCR ${dscr.dscr.toFixed(2)} (lenders typically look for 1.25+), ${liquidity ? `${Math.round(liquidity.score)}/100 liquidity` : 'liquidity not yet scored'}, profit margin ${profitability ? profitability.score.toFixed(0) : '0'}/100 on the Profitability factor — this is what your Debt, Profitability and Liquidity score factors already evidence.`,
            relatedFactors: ['Debt', 'Profitability', 'Liquidity'],
        },
        {
            name: 'Capital',
            question: 'How strong are they financially?',
            evidenced: leverage.hasAssetData,
            summary: leverage.hasAssetData
                ? `Net worth (assets − liabilities): ${fmt(currency, leverage.equity)}. Debt-to-equity ${leverage.debtToEquity === Infinity ? '∞' : leverage.debtToEquity.toFixed(2) + 'x'}, ${leverage.equityRatio.toFixed(0)}% equity-financed. Not currently part of the weighted score above — shown here because a lender would ask for it directly.`
                : 'No assets recorded yet — net worth and leverage can\'t be estimated until opening balances or registered assets are added in Settings/Assets.',
            relatedFactors: [],
        },
        {
            name: 'Collateral',
            question: 'What backs the loan?',
            evidenced: collateralValue > 0,
            summary: collateralValue > 0
                ? `${fmt(currency, collateralValue)} in stock and registered assets (${inventory ? `${inventory.score}/100 on the Inventory factor` : 'no inventory recorded'}) — see Estimated Lending Capacity below for what a lender could actually advance against it.`
                : 'No inventory or registered assets recorded — nothing to point to as security yet.',
            relatedFactors: ['Inventory'],
        },
        {
            name: 'Conditions',
            question: "What's happening around them?",
            evidenced: false,
            summary: `Conditions in the classic sense — industry trends, competition, the regulatory environment — aren't something Quad360 can observe. The closest signal in your score is Concentration (${concentration ? `${concentration.score}/100` : 'not yet scored'}) — how reliant the business is on one customer or supplier — which is about your own exposure, not the macro environment.`,
            relatedFactors: ['Concentration'],
        },
    ];
}
