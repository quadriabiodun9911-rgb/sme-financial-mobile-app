/**
 * Business Risk Radar — pulls together risk signals that already exist
 * scattered across the app (debt coverage, customer/supplier/lender
 * concentration, seasonal revenue patterns, macro-assumption-driven cost
 * exposure) into one glanceable overview, instead of each only ever
 * surfacing on its own deep-dive screen (CFO > Risk tab).
 *
 * Deliberately does NOT include every category a generic "risk radar"
 * template might suggest (e.g. climate/weather risk) -- Quad360 has no real
 * data source for those, and inventing a category just to fill out a grid
 * would be exactly the kind of fabricated signal this app's other engines
 * go out of their way to avoid. Every category here is a real, already-
 * computed fact; a category reports 'no-data' rather than guessing when
 * there isn't enough information yet.
 */

import { Transaction, Loan, Asset, MacroAssumption } from '../types';
import { computeDSCR, computeCustomerConcentration, computeSupplierConcentration, computeLenderConcentration, computeSeasonalRisk, computeProperCashFlow, SeasonalRisk } from './finance';
import { computeExternalRiskInsights } from './externalRiskInsights';

export type RiskLevel = 'low' | 'medium' | 'high' | 'no-data';

export interface RiskRadarCategory {
    key: 'debtCoverage' | 'customerConcentration' | 'supplierConcentration' | 'lenderConcentration' | 'seasonal' | 'economic' | 'cashFlow';
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
    assets: Asset[] = [],
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

    // Operating Cash Flow -- is the business actually converting its own
    // operations into real cash? Same computeProperCashFlow primitive and
    // tiering computeRiskScore's own Operating Cash Flow factor uses
    // (finance.ts), so this category never disagrees with that pillar's
    // own score or chip color.
    const cf = computeProperCashFlow(transactions, assets);
    const hasCfData = transactions.some(t => t.status === 'paid' || t.status === 'pending' || t.status === 'overdue');
    const cfConversionPct = cf.netProfit > 0 ? (cf.operatingCF / cf.netProfit) * 100 : null;
    let cashFlowLevel: RiskLevel;
    let cashFlowSummary: string;
    if (!hasCfData) {
        cashFlowLevel = 'no-data';
        cashFlowSummary = 'Not enough transaction history yet to measure operating cash flow.';
    } else if (cf.operatingCF < 0) {
        cashFlowLevel = 'high';
        cashFlowSummary = 'Operating cash flow is negative -- normal operations are consuming cash rather than generating it.';
    } else if (cfConversionPct !== null && cfConversionPct < 90) {
        cashFlowLevel = 'medium';
        cashFlowSummary = `Only ${cfConversionPct.toFixed(0)}% of profit has converted into real cash.`;
    } else {
        cashFlowLevel = 'low';
        cashFlowSummary = cfConversionPct !== null
            ? `${cfConversionPct.toFixed(0)}% of profit is converting into real cash.`
            : 'Operating cash flow is positive.';
    }
    categories.push({ key: 'cashFlow', label: 'Cash Flow', level: cashFlowLevel, summary: cashFlowSummary });

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

    // Lender concentration -- "all growth rides on one bank line" is a
    // real red flag distinct from debt coverage: a business can comfortably
    // cover its payments (good DSCR) and still be one relationship change
    // away from losing its only source of growth capital. Like debtCoverage
    // above, no active loans is a real "nothing to be dependent on" fact,
    // not a lack of data, so it's 'low' rather than 'no-data'.
    const topLender = computeLenderConcentration(loans)[0];
    categories.push({
        key: 'lenderConcentration',
        label: 'Lender Dependency',
        level: !topLender ? 'low' : topLender.risk,
        summary: !topLender
            ? 'No active loans — no dependency on a single lender.'
            : `${topLender.lenderName} holds ${topLender.percentage.toFixed(0)}% of outstanding debt.`,
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
