/**
 * Metric Intelligence — a pilot, not a framework. The request behind this
 * was to give every important number a Definition / Owner / Assumption /
 * Trigger explanation. Retrofitting that onto every metric in this app at
 * once would touch dozens of screens on a guess at what's worth the effort
 * -- instead this applies the idea, in full, to the single most prominent
 * number in the app (the Business Health Score, the first thing Dashboard
 * shows and currently the one with zero inline explanation), as a real,
 * working example rather than a speculative abstraction built for metrics
 * nobody has asked to instrument yet.
 *
 * Every piece here is reused, not invented:
 *  - Owner/data source and confidence come from computeDataQuality
 *    (dataQuality.ts) verbatim -- the same numbers DataConfidenceBadge/
 *    DataQualityBadge already show elsewhere in the app.
 *  - "Built on" reuses computeDataConfidenceBullets' own four bullets --
 *    never a second, independently-worded caveat list.
 *  - Trigger reads the real band cutoffs computeRiskScore's own
 *    riskBandFromScore uses (RISK_BAND_CUTOFFS, finance.ts) -- never a
 *    threshold invented for this module.
 */

import { RiskScore, RISK_BAND_CUTOFFS } from './finance';
import { computeDataQuality, computeDataConfidenceBullets, DataQuality } from './dataQuality';
import { Transaction } from '../types';

export interface BusinessHealthIntelligence {
    definition: string;
    dataQuality: DataQuality;
    builtOn: string[];
    trigger: string;
}

export function computeBusinessHealthIntelligence(risk: RiskScore, transactions: Transaction[]): BusinessHealthIntelligence {
    const dataQuality = computeDataQuality(transactions);
    const builtOn = computeDataConfidenceBullets(dataQuality);

    const idx = RISK_BAND_CUTOFFS.findIndex(b => b.band === risk.band);
    const trigger = risk.band === 'Critical'
        ? `Recovers to ${RISK_BAND_CUTOFFS[idx - 1].band} once the score reaches ${RISK_BAND_CUTOFFS[idx - 1].min}.`
        : `Falls to ${RISK_BAND_CUTOFFS[idx + 1].band} if the score drops below ${RISK_BAND_CUTOFFS[idx].min}.`;

    return {
        definition: 'A weighted average of 8 factors read from your transaction history — Profitability, Liquidity, Working Capital, Debt, Efficiency, Inventory, Concentration, and Operating Cash Flow — each scored 0–100 and combined by weight into one number.',
        dataQuality,
        builtOn,
        trigger,
    };
}
