/**
 * Business Exposure — two businesses can have the same Financial Health
 * score but very different vulnerability to a shock. Health measures
 * "how is the business doing"; this measures "how much would one bad
 * event hurt it" across the shocks that actually apply to an SME: FX,
 * interest rates, a customer or supplier walking away, slow-moving
 * stock, debt service, a cash crunch, and a tax/regulatory shortfall.
 *
 * Deliberately built entirely from engines that already exist elsewhere
 * in the app (externalFactorsPanel's corroborated macro factors, the
 * concentration/DSCR/runway/tax-readiness math) -- never a second,
 * independently-tuned estimate of something already computed correctly.
 * A dimension with no real signal to classify it returns 'unknown'
 * rather than a guessed level.
 */

import { Transaction, Loan, InventoryItem, MacroAssumption, FinanceData } from '../types';
import { computeCustomerConcentration, computeSupplierConcentration, computeDSCR } from './finance';
import { computeExternalFactorsPanel } from './externalFactorsPanel';
import { computeCashRunway } from './cashRunway';
import { computeSlowMovingValue } from './inventoryIntelligence';
import { computeInventoryValue } from './stockVelocity';
import { computeTaxAbilityToPay } from './taxFilingReadiness';
import { daysUntilTaxDeadline } from './taxDeadline';

export type ExposureLevel = 'low' | 'medium' | 'high' | 'unknown';

export interface ExposureFactor {
    key: string;
    label: string;
    level: ExposureLevel;
    detail: string;
}

export interface BusinessExposure {
    factors: ExposureFactor[];
    highCount: number;
    mediumCount: number;
    overallLevel: ExposureLevel;
}

const LEVEL_RANK: Record<ExposureLevel, number> = { low: 0, medium: 1, high: 2, unknown: -1 };

function riskToLevel(risk: 'low' | 'medium' | 'high'): ExposureLevel {
    return risk;
}

export function computeBusinessExposure(
    transactions: Transaction[],
    loans: Loan[],
    inventory: InventoryItem[],
    macroAssumptions: MacroAssumption[],
    finance: Pick<FinanceData, 'cashBalance' | 'totalTaxCollected' | 'totalTaxPaid'>,
    taxDeadline: string | undefined,
    currency: string = '₦',
): BusinessExposure {
    const factors: ExposureFactor[] = [];
    const panel = computeExternalFactorsPanel(transactions, macroAssumptions);

    // 1. FX exposure -- only counted when the owner has actually entered an
    // FX assumption AND it's corroborated against the business's own spending.
    const fx = panel.items.find(i => i.driver === 'fx');
    factors.push(fx
        ? { key: 'fx', label: 'FX Exposure', level: fx.impactLevel === 'positive' ? 'low' : fx.impactLevel, detail: fx.sentence }
        : { key: 'fx', label: 'FX Exposure', level: 'unknown', detail: 'No FX assumption entered yet — add one in Macro Assumptions to assess this.' });

    // 2. Interest rate exposure -- corroborated macro assumption if present,
    // otherwise a simple "has variable debt at all" proxy.
    const rate = panel.items.find(i => i.driver === 'interestRate');
    if (rate) {
        factors.push({ key: 'interestRate', label: 'Interest Rate Exposure', level: rate.impactLevel === 'positive' ? 'low' : rate.impactLevel, detail: rate.sentence });
    } else {
        const activeLoans = loans.filter(l => l.status === 'active');
        const level: ExposureLevel = activeLoans.length === 0 ? 'low' : activeLoans.length >= 2 ? 'medium' : 'low';
        factors.push({
            key: 'interestRate', label: 'Interest Rate Exposure', level,
            detail: activeLoans.length === 0 ? 'No active loans -- a rate move has no direct effect.' : `${activeLoans.length} active loan${activeLoans.length === 1 ? '' : 's'} would be affected by a rate change.`,
        });
    }

    // 3. Customer concentration
    const customers = computeCustomerConcentration(transactions);
    const topCustomer = customers[0];
    factors.push(topCustomer
        ? { key: 'customerConcentration', label: 'Customer Concentration', level: riskToLevel(topCustomer.risk), detail: `${topCustomer.customer} accounts for ${topCustomer.percentage.toFixed(0)}% of revenue.` }
        : { key: 'customerConcentration', label: 'Customer Concentration', level: 'unknown', detail: 'Not enough customer-tagged revenue to assess this yet.' });

    // 4. Supplier concentration
    const suppliers = computeSupplierConcentration(transactions);
    const topSupplier = suppliers[0];
    factors.push(topSupplier
        ? { key: 'supplierConcentration', label: 'Supplier Concentration', level: riskToLevel(topSupplier.risk), detail: `${topSupplier.supplier} accounts for ${topSupplier.percentage.toFixed(0)}% of spend.` }
        : { key: 'supplierConcentration', label: 'Supplier Concentration', level: 'unknown', detail: 'Not enough supplier-tagged spend to assess this yet.' });

    // 5. Inventory exposure -- how much of recorded stock value is slow-moving
    const totalInventoryValue = computeInventoryValue(inventory);
    if (totalInventoryValue > 0) {
        const slowValue = computeSlowMovingValue(inventory, transactions);
        const slowPct = (slowValue / totalInventoryValue) * 100;
        const level: ExposureLevel = slowPct >= 40 ? 'high' : slowPct >= 15 ? 'medium' : 'low';
        factors.push({ key: 'inventory', label: 'Inventory Exposure', level, detail: `${slowPct.toFixed(0)}% of stock value (${currency}${Math.round(slowValue).toLocaleString()}) is moving slowly.` });
    } else {
        factors.push({ key: 'inventory', label: 'Inventory Exposure', level: 'unknown', detail: 'No inventory recorded.' });
    }

    // 6. Debt exposure
    const dscr = computeDSCR(transactions, loans);
    const debtLevel: ExposureLevel = dscr.totalDebtService <= 0 ? 'low' : dscr.status === 'danger' ? 'high' : dscr.status === 'warning' ? 'medium' : 'low';
    factors.push({
        key: 'debt', label: 'Debt Exposure', level: debtLevel,
        detail: dscr.totalDebtService <= 0 ? 'No debt service currently owed.' : `Debt-service coverage is ${dscr.dscr.toFixed(2)}x.`,
    });

    // 7. Cash-flow exposure
    const runway = computeCashRunway(transactions, finance.cashBalance);
    const runwayLevel: ExposureLevel = !Number.isFinite(runway.runwayDays) ? 'low' : runway.runwayDays < 30 ? 'high' : runway.runwayDays < 60 ? 'medium' : 'low';
    factors.push({
        key: 'cashFlow', label: 'Cash-Flow Exposure', level: runwayLevel,
        detail: !Number.isFinite(runway.runwayDays) ? 'Cash is not currently shrinking.' : `About ${Math.round(runway.runwayDays)} days of cash runway at the current burn rate.`,
    });

    // 8. Regulatory exposure -- overdue filing or an uncovered tax liability
    const daysToDeadline = taxDeadline ? daysUntilTaxDeadline(taxDeadline) : null;
    const abilityToPay = computeTaxAbilityToPay(finance);
    let regLevel: ExposureLevel = 'low';
    let regDetail = 'No known filing deadline or tax shortfall.';
    if (!abilityToPay.canCover) {
        regLevel = 'high';
        regDetail = `Estimated tax liability of ${currency}${Math.round(abilityToPay.shortfall).toLocaleString()} isn't currently covered by cash on hand.`;
    } else if (daysToDeadline !== null && daysToDeadline < 0) {
        regLevel = 'high';
        regDetail = `Tax filing deadline is ${Math.abs(daysToDeadline)} day${Math.abs(daysToDeadline) === 1 ? '' : 's'} overdue.`;
    } else if (daysToDeadline !== null && daysToDeadline <= 14) {
        regLevel = 'medium';
        regDetail = `Tax filing deadline is in ${daysToDeadline} day${daysToDeadline === 1 ? '' : 's'}.`;
    }
    factors.push({ key: 'regulatory', label: 'Regulatory Exposure', level: regLevel, detail: regDetail });

    const highCount = factors.filter(f => f.level === 'high').length;
    const mediumCount = factors.filter(f => f.level === 'medium').length;
    const overallLevel: ExposureLevel = highCount >= 2 ? 'high' : highCount === 1 || mediumCount >= 3 ? 'medium' : 'low';

    return { factors, highCount, mediumCount, overallLevel };
}

/**
 * Business Resilience -- complements Financial Health rather than
 * duplicating it. Health asks "is the business doing well"; this asks
 * "how much would one bad event hurt it." A business can score well on
 * both, well on one and poorly on the other (profitable but fragile, or
 * struggling but well-diversified), or poorly on both -- all four are
 * real, different situations a single Health score can't distinguish.
 */
export type ResilienceBand = 'Strong' | 'Moderate' | 'Weak';

export interface BusinessResilience {
    score: number; // 0-100, unknown factors excluded from the denominator
    band: ResilienceBand;
    topConcerns: ExposureFactor[]; // high/medium factors, most severe first, for the "why" list
}

export function computeBusinessResilience(exposure: BusinessExposure): BusinessResilience {
    const known = exposure.factors.filter(f => f.level !== 'unknown');
    const levelScore: Record<Exclude<ExposureLevel, 'unknown'>, number> = { low: 100, medium: 55, high: 15 };
    const score = known.length > 0
        ? Math.round(known.reduce((sum, f) => sum + levelScore[f.level as 'low' | 'medium' | 'high'], 0) / known.length)
        : 50; // no signal at all -- neutral, not a guessed extreme

    const band: ResilienceBand = score >= 70 ? 'Strong' : score >= 45 ? 'Moderate' : 'Weak';

    const topConcerns = [...exposure.factors]
        .filter(f => f.level === 'high' || f.level === 'medium')
        .sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level]);

    return { score, band, topConcerns };
}

/**
 * The specific "profitable but fragile" (or the reverse) gap the product
 * brief calls out -- only returned when Health and Resilience actually
 * diverge enough to be worth saying explicitly; two scores that agree
 * don't need a sentence explaining that they agree.
 */
export function describeHealthResilienceGap(healthScore: number, resilience: BusinessResilience): string | null {
    const reasons = resilience.topConcerns.slice(0, 2).map(f => f.label.replace(' Exposure', '').replace(' Concentration', ' concentration').toLowerCase());
    const reasonText = reasons.length > 0 ? reasons.join(' and ') : 'a small number of concentrated risks';

    if (healthScore >= 65 && resilience.score < 55) {
        return `Your business is profitable today but relatively vulnerable to external shocks — mainly ${reasonText}.`;
    }
    if (healthScore < 55 && resilience.score >= 70) {
        return `Your business is currently under financial pressure, but it's well-diversified against external shocks — that's a real strength to build the recovery on.`;
    }
    return null;
}
