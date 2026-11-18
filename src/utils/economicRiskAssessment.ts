/**
 * Economic Risk Assessment — quantifies, rather than just labels, how
 * exposed the business is to the economic shocks SMEs actually face:
 * rising costs, a customer or sales decline, a cash crunch, slow-moving
 * stock, a debt-service squeeze, a concentrated supplier, slow-paying
 * customers, and (where entered) an FX move.
 *
 * businessExposure.ts already answers "how much would one bad event
 * hurt" with a low/medium/high/unknown label per factor. This module
 * answers a narrower, more quantified question for a subset of those same
 * risks -- a 0-100 score built from three real, separately-stated
 * components (Exposure / Sensitivity / Impact), each one a plain
 * arithmetic result of a defined, standardized shock, never a guessed
 * number. Deliberately built entirely on top of engines that already
 * exist elsewhere in the app (costExposure, computeDSCR's own revenue-drop
 * parameter, the revenue stress test, supplier/customer concentration,
 * working-capital metrics) -- never a second, independently-tuned
 * estimate of something already computed correctly.
 *
 * Two categories intentionally return available: false always or
 * conditionally -- exchange-rate exposure only when the owner has entered
 * an FX macro assumption, and energy/logistics cost risk always, since
 * Quad360 doesn't yet tag expenses as energy-related separately from any
 * other operating cost. Pretending to score either from data that isn't
 * there would be exactly the fabricated-probability problem this model
 * exists to avoid.
 *
 * The 30/30/40 Exposure/Sensitivity/Impact weighting and the 0-29/30-49/
 * 50-69/70-100 band cutoffs are an initial design choice, not a validated
 * model -- they are meant to be recalibrated against real outcomes later,
 * the same caveat costExposure.ts's own MODEL constant carries.
 */

import { Transaction, Loan, InventoryItem, Invoice, FinanceData, MacroAssumption, ReceivableWriteOff } from '../types';
import { computeCustomerConcentration, computeSupplierConcentration, computeDSCR, computeWorkingCapitalMetrics, latestTransactionDate } from './finance';
import { computeCostExposure } from './costExposure';
import { computeCashRunway } from './cashRunway';
import { computeInventoryValue } from './stockVelocity';
import { computeSlowMovingValue } from './inventoryIntelligence';
import { computeRevenueStressTest } from './revenueStressTest';
import { detectSupplierPricePressure } from './supplierPricePressure';
import { computeExternalFactorsPanel } from './externalFactorsPanel';
import { formatMoney } from './cashFlowHealth';

export type EconomicRiskBand = 'Low' | 'Moderate' | 'Elevated' | 'High' | 'Unknown';

export interface RiskComponent {
    // 0-100, higher = more risk on this one dimension. null when this
    // specific component has no real basis to compute yet (not guessed).
    value: number | null;
    detail: string;
}

export interface EconomicRiskCategory {
    key: string;
    label: string;
    available: boolean;
    reason?: string;
    exposure: RiskComponent;
    sensitivity: RiskComponent;
    impact: RiskComponent;
    score: number | null; // weighted 0-100, null when available is false
    band: EconomicRiskBand;
    narrative: string;
}

export interface EconomicRiskAssessment {
    available: boolean;
    reason?: string;
    overallScore: number | null;
    overallBand: EconomicRiskBand;
    categories: EconomicRiskCategory[];
    headline: string;
    recommendedAction: string;
}

const WEIGHTS = { exposure: 0.30, sensitivity: 0.30, impact: 0.40 } as const;

// At least this many categories need real data before an overall score is
// shown at all -- the explicit safeguard: don't compute a headline number
// out of mostly missing information, say so instead.
const MIN_AVAILABLE_FOR_OVERALL = 3;

function clamp100(n: number): number {
    return Math.max(0, Math.min(100, n));
}

export function bandForRiskScore(score: number): EconomicRiskBand {
    if (score >= 70) return 'High';
    if (score >= 50) return 'Elevated';
    if (score >= 30) return 'Moderate';
    return 'Low';
}

// Re-normalizes across whichever of the three components actually have a
// real value, rather than treating a missing component as 0 (which would
// understate risk) or as 100 (which would overstate it).
function composeScore(exposure: number | null, sensitivity: number | null, impact: number | null): number | null {
    const parts: { v: number; w: number }[] = [];
    if (exposure !== null) parts.push({ v: exposure, w: WEIGHTS.exposure });
    if (sensitivity !== null) parts.push({ v: sensitivity, w: WEIGHTS.sensitivity });
    if (impact !== null) parts.push({ v: impact, w: WEIGHTS.impact });
    if (parts.length === 0) return null;
    const totalWeight = parts.reduce((s, p) => s + p.w, 0);
    return Math.round(parts.reduce((s, p) => s + p.v * p.w, 0) / totalWeight);
}

function unavailableCategory(key: string, label: string, reason: string): EconomicRiskCategory {
    return {
        key, label, available: false, reason,
        exposure: { value: null, detail: reason },
        sensitivity: { value: null, detail: reason },
        impact: { value: null, detail: reason },
        score: null,
        band: 'Unknown',
        narrative: reason,
    };
}

// ─── A. Cost & Inflation Pressure ───────────────────────────────────────────

const COST_SHOCK_PCT = 10;

function computeCostPressureCategory(transactions: Transaction[], currency: string): EconomicRiskCategory {
    const exposure = computeCostExposure(transactions);
    if (!exposure.available || exposure.currentMonthlyRevenue <= 0) {
        return unavailableCategory('costPressure', 'Cost & Inflation Pressure', exposure.reason || 'Not enough revenue history yet to measure cost pressure.');
    }

    const revenue = exposure.currentMonthlyRevenue;
    const profit = exposure.currentMonthlyProfit;
    const totalCost = revenue - profit;
    const costToRevenuePct = (totalCost / revenue) * 100;
    const currentMarginPct = (profit / revenue) * 100;

    // Quad360 doesn't separate cost of goods sold from other operating
    // costs, so this standardized shock is applied to the whole cost base
    // rather than to COGS alone -- the same margin-impact question, on the
    // cost split this app's data model actually supports.
    const shockedCost = totalCost * (1 + COST_SHOCK_PCT / 100);
    const shockedProfit = revenue - shockedCost;
    const shockedMarginPct = (shockedProfit / revenue) * 100;
    const marginPointLoss = currentMarginPct - shockedMarginPct;
    const monthlyImpact = Math.max(0, profit - shockedProfit);

    const exposureScore = clamp100(costToRevenuePct);
    const sensitivityScore = clamp100(marginPointLoss <= 0 ? 10 : marginPointLoss >= 15 ? 100 : 10 + (marginPointLoss / 15) * 90);
    const impactScore = clamp100(revenue > 0 ? (monthlyImpact / revenue) * 400 : 0);

    const score = composeScore(exposureScore, sensitivityScore, impactScore);
    const band = score === null ? 'Unknown' : bandForRiskScore(score);

    const exposureDetail = `Operating costs are ${costToRevenuePct.toFixed(0)}% of revenue, leaving a ${currentMarginPct.toFixed(0)}% margin.`;
    const sensitivityDetail = `A ${COST_SHOCK_PCT}% rise in operating costs would cut margin to about ${shockedMarginPct.toFixed(0)}% (down ${marginPointLoss.toFixed(1)} percentage points).`;
    const impactDetail = `That shock would cost roughly ${formatMoney(monthlyImpact, currency)} a month in lost profit.`;

    return {
        key: 'costPressure', label: 'Cost & Inflation Pressure', available: true,
        exposure: { value: exposureScore, detail: exposureDetail },
        sensitivity: { value: sensitivityScore, detail: sensitivityDetail },
        impact: { value: impactScore, detail: impactDetail },
        score, band,
        narrative: `${exposureDetail} ${sensitivityDetail} ${impactDetail}`,
    };
}

// ─── B. Demand & Sales Vulnerability ────────────────────────────────────────

function computeDemandRiskCategory(transactions: Transaction[], cashBalance: number, currency: string): EconomicRiskCategory {
    const customers = computeCustomerConcentration(transactions);
    const stressTest = computeRevenueStressTest(transactions, cashBalance, currency);
    if (customers.length === 0 && !stressTest.available) {
        return unavailableCategory('demand', 'Demand & Sales Vulnerability', 'Not enough customer-tagged revenue or sales history yet to assess demand risk.');
    }

    const topCustomer = customers[0] ?? null;
    const exposureScore = topCustomer ? clamp100(topCustomer.percentage) : null;
    const exposureDetail = topCustomer
        ? `${topCustomer.customer} accounts for ${topCustomer.percentage.toFixed(0)}% of revenue.`
        : 'Not enough customer-tagged revenue to assess customer concentration.';

    let sensitivityScore: number | null = null;
    let sensitivityDetail = 'Not enough sales history yet to run a revenue stress test.';
    let impactScore: number | null = null;
    let impactDetail = sensitivityDetail;

    if (stressTest.available) {
        const threshold = stressTest.vulnerabilityThresholdPct;
        sensitivityScore = threshold === null ? 10 : threshold <= 10 ? 100 : threshold <= 20 ? 70 : threshold <= 30 ? 45 : 20;
        sensitivityDetail = threshold === null
            ? 'Can absorb even a severe revenue drop without breaching a 3-month cash buffer.'
            : `Becomes financially vulnerable if sales fall roughly ${threshold}%.`;

        const drop20 = stressTest.scenarios.find(s => s.revenueDropPct === 20);
        if (drop20) {
            const cashDrop = Math.max(0, cashBalance - drop20.cashPosition);
            impactScore = clamp100(cashBalance > 0 ? (cashDrop / cashBalance) * 100 : (cashDrop > 0 ? 100 : 0));
            impactDetail = `A 20% sales decline would leave roughly ${formatMoney(drop20.cashPosition, currency)} in cash a month out, down from ${formatMoney(cashBalance, currency)} today.`;
        }
    }

    const score = composeScore(exposureScore, sensitivityScore, impactScore);
    const band = score === null ? 'Unknown' : bandForRiskScore(score);

    return {
        key: 'demand', label: 'Demand & Sales Vulnerability', available: true,
        exposure: { value: exposureScore, detail: exposureDetail },
        sensitivity: { value: sensitivityScore, detail: sensitivityDetail },
        impact: { value: impactScore, detail: impactDetail },
        score, band,
        narrative: `${exposureDetail} ${sensitivityDetail} ${impactDetail}`,
    };
}

// ─── C. Liquidity & Cash-Flow Vulnerability ─────────────────────────────────

function computeLiquidityRiskCategory(transactions: Transaction[], cashBalance: number, currency: string): EconomicRiskCategory {
    if (transactions.length === 0 && cashBalance <= 0) {
        return unavailableCategory('liquidity', 'Liquidity & Cash-Flow Vulnerability', 'Not enough transaction history yet to assess liquidity.');
    }

    const referenceDate = latestTransactionDate(transactions) ?? new Date();
    const runway = computeCashRunway(transactions, cashBalance, referenceDate);
    const stressTest = computeRevenueStressTest(transactions, cashBalance, currency);

    const exposureScore = !Number.isFinite(runway.runwayDays)
        ? (cashBalance > 0 ? 10 : 70)
        : clamp100(runway.runwayDays <= 15 ? 100 : runway.runwayDays >= 180 ? 10 : 100 - ((runway.runwayDays - 15) / (180 - 15)) * 90);
    const exposureDetail = !Number.isFinite(runway.runwayDays)
        ? (cashBalance > 0 ? 'Cash is not currently shrinking.' : 'No cash on hand and no spending history yet.')
        : `About ${Math.round(runway.runwayDays)} days of cash runway at the current burn rate.`;

    let sensitivityScore: number | null = null;
    let sensitivityDetail = 'Not enough sales history yet to test how a sales slowdown would affect cash.';
    let impactScore: number | null = null;
    let impactDetail = sensitivityDetail;

    if (stressTest.available) {
        const drop10 = stressTest.scenarios.find(s => s.revenueDropPct === 10);
        if (drop10) {
            sensitivityScore = drop10.risk === 'critical' ? 100 : drop10.risk === 'warning' ? 70 : drop10.risk === 'caution' ? 40 : 15;
            sensitivityDetail = Number.isFinite(drop10.runwayMonths)
                ? `A 10% sales decline would leave about ${drop10.runwayMonths.toFixed(1)} months of cash runway.`
                : 'A 10% sales decline would still leave the business cash-generating.';

            const cashDrop = Math.max(0, cashBalance - drop10.cashPosition);
            impactScore = clamp100(cashBalance > 0 ? (cashDrop / cashBalance) * 100 : (cashDrop > 0 ? 100 : 0));
            impactDetail = `That scenario would leave roughly ${formatMoney(drop10.cashPosition, currency)} in cash a month out.`;
        }
    }

    const score = composeScore(exposureScore, sensitivityScore, impactScore);
    const band = score === null ? 'Unknown' : bandForRiskScore(score);

    return {
        key: 'liquidity', label: 'Liquidity & Cash-Flow Vulnerability', available: true,
        exposure: { value: exposureScore, detail: exposureDetail },
        sensitivity: { value: sensitivityScore, detail: sensitivityDetail },
        impact: { value: impactScore, detail: impactDetail },
        score, band,
        narrative: `${exposureDetail} ${sensitivityDetail} ${impactDetail}`,
    };
}

// ─── D. Inventory Exposure ──────────────────────────────────────────────────

function computeInventoryRiskCategory(inventory: InventoryItem[], transactions: Transaction[], cashBalance: number, currency: string): EconomicRiskCategory {
    const totalValue = computeInventoryValue(inventory);
    if (totalValue <= 0) {
        return unavailableCategory('inventory', 'Inventory Exposure', 'No inventory recorded.');
    }

    const slowValue = computeSlowMovingValue(inventory, transactions);
    const slowPct = (slowValue / totalValue) * 100;
    const exposureScore = clamp100(slowPct >= 60 ? 100 : (slowPct / 60) * 100);
    const impactScore = clamp100(cashBalance > 0 ? (slowValue / cashBalance) * 100 : (slowValue > 0 ? 100 : 0));

    const score = composeScore(exposureScore, null, impactScore);
    const band = score === null ? 'Unknown' : bandForRiskScore(score);

    const exposureDetail = `${slowPct.toFixed(0)}% of stock value (${formatMoney(slowValue, currency)}) is moving slowly.`;
    const impactDetail = cashBalance > 0
        ? `That slow-moving stock is equivalent to ${((slowValue / cashBalance) * 100).toFixed(0)}% of current cash on hand.`
        : `${formatMoney(slowValue, currency)} is tied up in slow-moving stock, with no offsetting cash on hand.`;

    return {
        key: 'inventory', label: 'Inventory Exposure', available: true,
        exposure: { value: exposureScore, detail: exposureDetail },
        sensitivity: { value: null, detail: 'Not separately modeled — no standardized restocking-cost shock is computed yet.' },
        impact: { value: impactScore, detail: impactDetail },
        score, band,
        narrative: `${exposureDetail} ${impactDetail}`,
    };
}

// ─── E. Debt Vulnerability ──────────────────────────────────────────────────

const DEBT_REVENUE_SHOCK_PCT = 10;

function computeDebtRiskCategory(transactions: Transaction[], loans: Loan[], currency: string): EconomicRiskCategory {
    const baseline = computeDSCR(transactions, loans, 0);
    if (baseline.totalDebtService <= 0) {
        return {
            key: 'debt', label: 'Debt Vulnerability', available: true,
            exposure: { value: 5, detail: 'No active debt service currently owed.' },
            sensitivity: { value: 5, detail: 'No debt service currently owed.' },
            impact: { value: 5, detail: 'No debt service currently owed.' },
            score: 5, band: 'Low',
            narrative: 'No active debt service currently owed — a rate or revenue shock has no direct repayment effect right now.',
        };
    }

    const exposureScore = clamp100(baseline.dscr <= 0.8 ? 100 : baseline.dscr >= 2 ? 10 : 100 - ((baseline.dscr - 0.8) / (2 - 0.8)) * 90);

    // Sensitivity reuses computeDSCR's own revenue-drop parameter rather
    // than re-deriving a parallel stress calculation.
    const shocked = computeDSCR(transactions, loans, DEBT_REVENUE_SHOCK_PCT);
    const dscrDropPct = baseline.dscr > 0 ? ((baseline.dscr - shocked.dscr) / baseline.dscr) * 100 : 0;
    const sensitivityScore = clamp100(dscrDropPct <= 0 ? 10 : dscrDropPct >= 30 ? 100 : 10 + (dscrDropPct / 30) * 90);

    const shortfall = Math.max(0, shocked.totalDebtService - shocked.netOperatingIncome);
    const impactScore = clamp100(shocked.totalDebtService > 0 ? (shortfall / shocked.totalDebtService) * 100 : 0);

    const score = composeScore(exposureScore, sensitivityScore, impactScore);
    const band = score === null ? 'Unknown' : bandForRiskScore(score);

    const exposureDetail = `Debt-service coverage is ${baseline.dscr.toFixed(2)}x today.`;
    const sensitivityDetail = `A ${DEBT_REVENUE_SHOCK_PCT}% revenue decline would bring coverage to ${shocked.dscr.toFixed(2)}x.`;
    const impactDetail = shortfall > 0
        ? `That shock would leave a shortfall of roughly ${formatMoney(shortfall, currency)} against scheduled repayments.`
        : 'No shortfall against scheduled repayments under that scenario.';

    return {
        key: 'debt', label: 'Debt Vulnerability', available: true,
        exposure: { value: exposureScore, detail: exposureDetail },
        sensitivity: { value: sensitivityScore, detail: sensitivityDetail },
        impact: { value: impactScore, detail: impactDetail },
        score, band,
        narrative: `${exposureDetail} ${sensitivityDetail} ${impactDetail}`,
    };
}

// ─── F. Supplier & Supply-Chain Exposure ────────────────────────────────────

const SUPPLIER_PRICE_SHOCK_PCT = 10;

function computeSupplierRiskCategory(transactions: Transaction[], inventory: InventoryItem[], currency: string): EconomicRiskCategory {
    const suppliers = computeSupplierConcentration(transactions);
    if (suppliers.length === 0) {
        return unavailableCategory('supplier', 'Supplier & Supply-Chain Exposure', 'Not enough supplier-tagged spend yet to assess this.');
    }

    const topSupplier = suppliers[0];
    const totalPurchases = suppliers.reduce((s, x) => s + x.amount, 0);
    const exposureScore = clamp100(topSupplier.percentage);

    const priceFlags = detectSupplierPricePressure(inventory);
    const maxGap = priceFlags.length > 0 ? Math.max(...priceFlags.map(f => f.gapPct)) : null;
    const sensitivityScore = maxGap === null ? null : clamp100(maxGap <= 0 ? 10 : maxGap >= 20 ? 100 : 10 + (maxGap / 20) * 90);
    const sensitivityDetail = maxGap === null
        ? 'No recorded cost increases from suppliers yet to gauge price sensitivity.'
        : `At least one item's replacement cost has grown ${maxGap.toFixed(0)} percentage points faster than its selling price.`;

    const shockImpact = topSupplier.amount * (SUPPLIER_PRICE_SHOCK_PCT / 100);
    const shockShareOfTotalPurchases = totalPurchases > 0 ? (shockImpact / totalPurchases) * 100 : 0;
    const impactScore = clamp100(shockShareOfTotalPurchases >= 10 ? 100 : shockShareOfTotalPurchases >= 5 ? 60 : shockShareOfTotalPurchases >= 2 ? 30 : 10);
    const impactDetail = `A ${SUPPLIER_PRICE_SHOCK_PCT}% price increase from ${topSupplier.supplier} would add roughly ${formatMoney(shockImpact, currency)} to total purchase costs.`;

    const score = composeScore(exposureScore, sensitivityScore, impactScore);
    const band = score === null ? 'Unknown' : bandForRiskScore(score);
    const exposureDetail = `${topSupplier.supplier} accounts for ${topSupplier.percentage.toFixed(0)}% of purchases.`;

    return {
        key: 'supplier', label: 'Supplier & Supply-Chain Exposure', available: true,
        exposure: { value: exposureScore, detail: exposureDetail },
        sensitivity: { value: sensitivityScore, detail: sensitivityDetail },
        impact: { value: impactScore, detail: impactDetail },
        score, band,
        narrative: `${exposureDetail} ${sensitivityDetail} ${impactDetail}`,
    };
}

// ─── G. Customer Credit Risk (receivables / DSO) ────────────────────────────

function computeCreditRiskCategory(
    transactions: Transaction[],
    invoices: Invoice[],
    writeOffs: ReceivableWriteOff[],
    cashBalance: number,
    currency: string,
): EconomicRiskCategory {
    const hasPaidHistory = transactions.some(t => t.status === 'paid');
    if (!hasPaidHistory) {
        return unavailableCategory('credit', 'Customer Credit Risk', 'Not enough paid transaction history yet to measure receivables risk.');
    }

    const wc = computeWorkingCapitalMetrics(transactions, invoices, writeOffs);

    // Same trailing-90-day revenue base computeWorkingCapitalMetrics uses
    // for DSO, so the receivables-to-sales ratio stays on the same period.
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutStr = cutoff.toISOString().slice(0, 10);
    const revenue90 = transactions
        .filter(t => t.type === 'income' && t.date >= cutStr && t.status === 'paid')
        .reduce((s, t) => s + (t.amount ?? 0), 0);
    const receivablesToSalesPct = revenue90 > 0 ? (wc.accountsReceivable / revenue90) * 100 : (wc.accountsReceivable > 0 ? 100 : 0);

    const exposureScore = clamp100(receivablesToSalesPct);
    const sensitivityScore = clamp100(wc.dso <= 15 ? 10 : wc.dso >= 90 ? 100 : 10 + ((wc.dso - 15) / (90 - 15)) * 90);
    const impactScore = clamp100(cashBalance > 0 ? (wc.accountsReceivable / cashBalance) * 100 : (wc.accountsReceivable > 0 ? 100 : 0));

    const score = composeScore(exposureScore, sensitivityScore, impactScore);
    const band = score === null ? 'Unknown' : bandForRiskScore(score);

    const exposureDetail = `${formatMoney(wc.accountsReceivable, currency)} outstanding is ${receivablesToSalesPct.toFixed(0)}% of trailing 90-day sales.`;
    const sensitivityDetail = `Customers typically take about ${wc.dso} day${wc.dso === 1 ? '' : 's'} to pay.`;
    const impactDetail = cashBalance > 0
        ? `That outstanding balance is equivalent to ${((wc.accountsReceivable / cashBalance) * 100).toFixed(0)}% of current cash on hand.`
        : `${formatMoney(wc.accountsReceivable, currency)} is tied up in unpaid customer balances, with no offsetting cash on hand.`;

    return {
        key: 'credit', label: 'Customer Credit Risk', available: true,
        exposure: { value: exposureScore, detail: exposureDetail },
        sensitivity: { value: sensitivityScore, detail: sensitivityDetail },
        impact: { value: impactScore, detail: impactDetail },
        score, band,
        narrative: `${exposureDetail} ${sensitivityDetail} ${impactDetail}`,
    };
}

// ─── H. Exchange-Rate Exposure ──────────────────────────────────────────────
// Only ever scored off a macro assumption the owner actually entered and
// corroborated against their own spending (externalFactorsPanel.ts) --
// Quad360 has no field anywhere that tags a transaction as foreign-
// currency-denominated, so there is no real data path to this otherwise.

function computeFxRiskCategory(transactions: Transaction[], macroAssumptions: MacroAssumption[]): EconomicRiskCategory {
    const panel = computeExternalFactorsPanel(transactions, macroAssumptions);
    const fx = panel.items.find(i => i.driver === 'fx');
    if (!fx) {
        return unavailableCategory('fx', 'Exchange-Rate Exposure', 'No foreign-currency cost assumption entered yet — add one in Macro Assumptions to assess this.');
    }

    const level = fx.impactLevel === 'positive' ? 'low' : fx.impactLevel;
    const exposureScore = level === 'high' ? 80 : level === 'medium' ? 50 : 15;
    const score = composeScore(exposureScore, null, null);
    const band = score === null ? 'Unknown' : bandForRiskScore(score);

    return {
        key: 'fx', label: 'Exchange-Rate Exposure', available: true,
        exposure: { value: exposureScore, detail: fx.sentence },
        sensitivity: { value: null, detail: 'Based on your entered macro assumption, not a separately modeled sensitivity.' },
        impact: { value: null, detail: fx.sentence },
        score, band,
        narrative: fx.sentence,
    };
}

// ─── I. Energy & Logistics Cost Risk ────────────────────────────────────────
// Always unavailable today -- Quad360 doesn't tag expenses as energy/fuel/
// logistics-related separately from any other operating cost, so there is
// no real data to score this from. Shown anyway, flagged as insufficient
// data, rather than silently dropped.

function computeEnergyRiskCategory(): EconomicRiskCategory {
    return unavailableCategory(
        'energy',
        'Energy & Logistics Cost Risk',
        "Quad360 doesn't yet track energy, fuel or logistics costs as a separate category — tag these expenses under a dedicated category to enable this.",
    );
}

// ─── Recommended action, keyed off whichever available category scores highest ──

const RECOMMENDED_ACTION_BY_KEY: Record<string, string> = {
    costPressure: 'Review your purchase costs and selling prices — rising costs are currently your biggest measured pressure point.',
    demand: 'Reduce reliance on your largest customer or revenue source, and confirm the business can cover fixed costs if sales dip.',
    liquidity: 'Build up cash reserves or arrange a credit line before the next slow period — current cash runway is tight relative to spending.',
    inventory: 'Review slow-moving stock — consider a clearance sale or adjusting purchase quantities to free up tied-up cash.',
    debt: 'Review your loan repayment schedule against current cash generation before taking on additional borrowing.',
    supplier: 'Explore an alternative supplier or negotiate terms — purchases are concentrated enough that a price change or disruption would hurt.',
    credit: 'Tighten collection follow-up on overdue customer balances — a meaningful amount of cash is currently tied up in unpaid invoices.',
    fx: 'Review pricing or supplier terms for foreign-currency-linked costs before committing to new imported purchases.',
};

// ─── Assembly ────────────────────────────────────────────────────────────────

export function computeEconomicRiskAssessment(
    transactions: Transaction[],
    loans: Loan[],
    inventory: InventoryItem[],
    invoices: Invoice[],
    writeOffs: ReceivableWriteOff[],
    finance: Pick<FinanceData, 'cashBalance'>,
    macroAssumptions: MacroAssumption[],
    currency: string = '₦',
): EconomicRiskAssessment {
    const categories: EconomicRiskCategory[] = [
        computeCostPressureCategory(transactions, currency),
        computeDemandRiskCategory(transactions, finance.cashBalance, currency),
        computeLiquidityRiskCategory(transactions, finance.cashBalance, currency),
        computeInventoryRiskCategory(inventory, transactions, finance.cashBalance, currency),
        computeDebtRiskCategory(transactions, loans, currency),
        computeSupplierRiskCategory(transactions, inventory, currency),
        computeCreditRiskCategory(transactions, invoices, writeOffs, finance.cashBalance, currency),
        computeFxRiskCategory(transactions, macroAssumptions),
        computeEnergyRiskCategory(),
    ];

    const scored = categories.filter((c): c is EconomicRiskCategory & { score: number } => c.available && c.score !== null);

    if (scored.length < MIN_AVAILABLE_FOR_OVERALL) {
        return {
            available: false,
            reason: `Only ${scored.length} of ${categories.length} economic risk categories have enough data yet — at least ${MIN_AVAILABLE_FOR_OVERALL} are needed for an overall score.`,
            overallScore: null,
            overallBand: 'Unknown',
            categories,
            headline: 'Not enough data yet for an overall economic risk score — see individual categories below for what is measurable today.',
            recommendedAction: 'Keep recording transactions, inventory and loan activity — the assessment fills in as more real data accumulates.',
        };
    }

    const overallScore = Math.round(scored.reduce((s, c) => s + c.score, 0) / scored.length);
    const overallBand = bandForRiskScore(overallScore);
    const topDriver = [...scored].sort((a, b) => b.score - a.score)[0];

    const headline = `Economic risk score is ${overallScore}/100 (${overallBand}), based on ${scored.length} of ${categories.length} measurable categories.`;
    const recommendedAction = overallScore < 30
        ? 'No elevated economic risk identified from current data — keep monitoring as conditions change.'
        : (RECOMMENDED_ACTION_BY_KEY[topDriver.key] ?? `Review ${topDriver.label.toLowerCase()} — it is currently the largest measured driver of economic risk.`);

    return { available: true, overallScore, overallBand, categories, headline, recommendedAction };
}
