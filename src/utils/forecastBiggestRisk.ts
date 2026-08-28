/**
 * Synthesizes the single most severe thing the forecast is currently
 * warning about into one headline sentence, from signals ForecastSummary
 * already computes -- never a new one. Ranked in roughly the order each
 * would actually force the owner's hand: a specific month's cash-flow
 * pressure (concrete, dated) outranks a corroborated external risk, which
 * outranks a margin-erosion warning, which outranks a projected health-
 * score decline (the most diffuse of the four). Returns null when nothing
 * material is currently flagged -- there's no "biggest risk" to invent
 * when the forecast genuinely shows none.
 */

import { ForecastSummary, describeCashFlowPressure } from './forecastSummary';

// Discriminates which of the four signals fired, so a caller (the
// forecast screen) can route "do something about this" to the one place
// that actually addresses that specific cause, without re-deriving the
// same priority logic a second time.
export type BiggestForecastRiskKind = 'cashflow' | 'external' | 'margin' | 'health';

export interface BiggestForecastRisk {
    kind: BiggestForecastRiskKind;
    icon: string;
    title: string;
    detail: string;
}

export function computeBiggestForecastRisk(forecast: ForecastSummary, currency: string = '₦'): BiggestForecastRisk | null {
    const pressuredMonth = forecast.cashFlowMonths.find(m => m.pressured);
    if (pressuredMonth) {
        return {
            kind: 'cashflow',
            icon: '🔴',
            title: `Cash-flow pressure in ${pressuredMonth.monthLabel}`,
            detail: describeCashFlowPressure(pressuredMonth) ?? 'Expected outflows may exceed expected inflows this month.',
        };
    }

    const worstExternal = forecast.riskRadar.find(r => r.impact === 'high' && r.probability === 'high');
    if (worstExternal) {
        const item = forecast.externalFactors.items.find(i => i.driver === worstExternal.driver);
        return {
            kind: 'external',
            icon: '🔴',
            title: `${worstExternal.label} exposure`,
            detail: item?.sentence ?? `${worstExternal.label} is flagged as a high-impact, corroborated risk to your forecast.`,
        };
    }

    if (forecast.marginRisk.show) {
        return {
            kind: 'margin',
            icon: '🟠',
            title: 'Margin risk from rising discounts',
            detail: `Your average discount has climbed ${forecast.marginRisk.ratePctChange.toFixed(1)} points recently — if it continues, that could cost roughly ${currency}${Math.round(forecast.marginRisk.estimatedProfitImpact).toLocaleString()} in profit.`,
        };
    }

    const hf = forecast.healthForecast;
    const drop = hf.currentScore.score - hf.projectedScore.score;
    if (drop >= 5) {
        return {
            kind: 'health',
            icon: '🟠',
            title: 'Financial health projected to decline',
            detail: `Your health score is projected to fall from ${hf.currentScore.score} to ${hf.projectedScore.score}${hf.movedFactors[0] ? `, driven mainly by ${hf.movedFactors[0].name}` : ''}.`,
        };
    }

    return null;
}
