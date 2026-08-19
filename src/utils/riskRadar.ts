/**
 * Business Risk Radar — pulls together risk signals that already exist
 * scattered across the app (debt coverage, customer/supplier concentration,
 * seasonal revenue patterns, macro-assumption-driven cost exposure) into
 * one glanceable overview, instead of each only ever surfacing on its own
 * deep-dive screen (CFO > Risk tab).
 *
 * Deliberately does NOT include every category a generic "risk radar"
 * template might suggest (e.g. climate/weather risk) -- Quad360 has no real
 * data source for those, and inventing a category just to fill out a grid
 * would be exactly the kind of fabricated signal this app's other engines
 * go out of their way to avoid. Every category here is a real, already-
 * computed fact; a category reports 'no-data' rather than guessing when
 * there isn't enough information yet.
 */

import { Transaction, Loan, MacroAssumption } from '../types';
import { computeDSCR, computeCustomerConcentration, computeSupplierConcentration, computeSeasonalRisk, SeasonalRisk } from './finance';
import { computeExternalRiskInsights } from './externalRiskInsights';

export type RiskLevel = 'low' | 'medium' | 'high' | 'no-data';

export interface RiskRadarCategory {
    key: 'debtCoverage' | 'customerConcentration' | 'supplierConcentration' | 'seasonal' | 'economic';
    label: string;
    level: RiskLevel;
    summary: string;
}

export interface RiskRadar {
    categories: RiskRadarCategory[];
    // 'low' when nothing rises above medium; excludes 'no-data' categories
    // from the count entirely (a category we can't assess yet is neither
    // evidence of risk nor of safety).
    overallLevel: 'low' | 'medium' | 'high';
    // Up to 3 medium/high categories, worst first -- mirrors
    // financialDiagnosisEngine's topOpportunities pattern (severity first).
    topRisks: RiskRadarCategory[];
}

const SEASONAL_RANK: Record<SeasonalRisk['riskLevel'], number> = { high: 0, medium: 1, low: 2, unknown: 3 };
const LEVEL_RANK: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2, 'no-data': 3 };

export function computeRiskRadar(
    transactions: Transaction[],
    loans: Loan[],
    macroAssumptions: MacroAssumption[] = [],
    referenceDate: Date = new Date(),
): RiskRadar {
    const categories: RiskRadarCategory[] = [];

    // Debt coverage -- no active debt service is a real "nothing to cover"
    // fact, not a lack of data, so it's 'low' rather than 'no-data'.
    const dscr = computeDSCR(transactions, loans);
    const hasDebtService = dscr.totalDebtService > 0;
    categories.push({
        key: 'debtCoverage',
        label: 'Debt Coverage',
        level: !hasDebtService ? 'low' : dscr.status === 'danger' ? 'high' : dscr.status === 'warning' ? 'medium' : 'low',
        summary: !hasDebtService
            ? 'No active loan repayments to cover.'
            : dscr.status === 'danger'
                ? `Income doesn't cover current debt payments (DSCR ${dscr.dscr.toFixed(2)}).`
                : dscr.status === 'warning'
                    ? `Debt payments leave little margin for a bad month (DSCR ${dscr.dscr.toFixed(2)}).`
                    : `Income comfortably covers debt payments (DSCR ${dscr.dscr.toFixed(2)}).`,
    });

    // Customer concentration
    const topCustomer = computeCustomerConcentration(transactions)[0];
    categories.push({
        key: 'customerConcentration',
        label: 'Customer Dependency',
        level: !topCustomer ? 'no-data' : topCustomer.risk,
        summary: !topCustomer
            ? 'No income transactions with customer names recorded yet.'
            : `${topCustomer.customer} is ${topCustomer.percentage.toFixed(0)}% of revenue.`,
    });

    // Supplier concentration
    const topSupplier = computeSupplierConcentration(transactions)[0];
    categories.push({
        key: 'supplierConcentration',
        label: 'Supplier Dependency',
        level: !topSupplier ? 'no-data' : topSupplier.risk,
        summary: !topSupplier
            ? 'No expense transactions with supplier names recorded yet.'
            : `${topSupplier.supplier} is ${topSupplier.percentage.toFixed(0)}% of spend.`,
    });

    // Seasonal -- only the next 2 calendar months matter for "what could
    // stop growth soon", not the whole year's pattern at once.
    const seasonal = computeSeasonalRisk(transactions);
    const upcoming = [0, 1]
        .map(offset => seasonal[(referenceDate.getMonth() + offset) % 12])
        .filter(m => m.hasData);
    const worstUpcoming = [...upcoming].sort((a, b) => SEASONAL_RANK[a.riskLevel] - SEASONAL_RANK[b.riskLevel])[0];
    categories.push({
        key: 'seasonal',
        label: 'Seasonal Risk',
        level: !worstUpcoming ? 'no-data' : worstUpcoming.riskLevel === 'unknown' ? 'no-data' : worstUpcoming.riskLevel,
        summary: !worstUpcoming || worstUpcoming.riskLevel === 'unknown'
            ? 'Not enough history yet to see seasonal patterns.'
            : worstUpcoming.riskLevel === 'low'
                ? `${worstUpcoming.month} is historically a strong revenue month.`
                : worstUpcoming.warning,
    });

    // Economic / macro -- deliberately capped at 'medium' even when
    // insights fire (never 'high'): externalRiskInsights.ts is itself
    // conservative by design (only fires when the owner's own logged
    // assumption is corroborated by their own rising spend), so treating
    // that as a confirmed severe risk would overstate what it actually is.
    const external = computeExternalRiskInsights(transactions, macroAssumptions);
    categories.push({
        key: 'economic',
        label: 'Economic Risk',
        level: !external.available ? 'no-data' : !external.hasAssumptions ? 'no-data' : external.insights.length > 0 ? 'medium' : 'low',
        summary: !external.available
            ? (external.reason ?? 'Not enough transaction history yet.')
            : !external.hasAssumptions
                ? 'Add your economic assumptions in Settings to see this.'
                : external.insights.length > 0
                    ? external.insights[0].title
                    : 'No economic risks are currently showing up in your spending.',
    });

    const scored = categories.filter(c => c.level !== 'no-data');
    const overallLevel: RiskRadar['overallLevel'] =
        scored.some(c => c.level === 'high') ? 'high' :
        scored.some(c => c.level === 'medium') ? 'medium' : 'low';

    const topRisks = categories
        .filter(c => c.level === 'high' || c.level === 'medium')
        .sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level])
        .slice(0, 3);

    return { categories, overallLevel, topRisks };
}
