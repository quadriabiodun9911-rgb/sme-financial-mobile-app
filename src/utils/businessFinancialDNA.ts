/**
 * Business Financial DNA — a structured profile of how a business actually
 * behaves, built entirely from data it has already recorded (transactions,
 * loans, inventory, invoices). This is deliberately a composition layer,
 * not a new scoring engine: every figure here is delegated to the one
 * canonical implementation used elsewhere in the app (computeRiskScore,
 * computeCustomerConcentration, computeSeasonalRisk, analyzeTrend,
 * computeWorkingCapitalMetrics, computeStockVelocity, computeCashRunway),
 * so "your DNA profile" and "your Risk tab" never quietly disagree.
 *
 * The one genuinely new computation is supplier concentration (the same
 * risk-tiering logic computeCustomerConcentration applies to income,
 * mirrored onto expense transactions) and the baseline/deviation detector
 * ("this is how your business normally behaves, and here's what changed").
 */

import { Transaction, Loan, InventoryItem, BusinessSettings, User } from '../types';
import { FinanceData } from '../types';
import { computeCustomerConcentration, computeSeasonalRisk, computeRiskScore, computeWorkingCapitalMetrics, RiskScore } from './finance';
import { analyzeTrend, TrendAnalysis, computeAllTimeMonthlyBuckets } from './trendAnalysis';
import { computeInventoryValue, computeStockVelocity } from './stockVelocity';
import { totalMonthlyLoanBurden } from './loanMath';

// ── Identity ────────────────────────────────────────────────────────────────
export interface BusinessIdentity {
    businessName: string;
    businessType: string;
    industry: string;
    yearsOperating: number;      // from account creation date — a floor, not the true business age
    monthsOfRecordedHistory: number; // span of actual transaction data, the real signal for how well Quad360 knows this business
    dataMaturity: 'new' | 'developing' | 'established'; // <3 months / 3-11 months / 12+ months of recorded history
}

function buildIdentity(settings: BusinessSettings, user: User | null | undefined, spanMonths: number): BusinessIdentity {
    const yearsOperating = user?.createdAt
        ? Math.max(0, (Date.now() - new Date(user.createdAt).getTime()) / (365.25 * 24 * 3600 * 1000))
        : 0;
    const dataMaturity: BusinessIdentity['dataMaturity'] =
        spanMonths >= 12 ? 'established' : spanMonths >= 3 ? 'developing' : 'new';

    return {
        businessName: user?.businessName || settings.businessName || 'Your business',
        businessType: settings.businessType,
        industry: settings.industry || 'general',
        yearsOperating: Math.round(yearsOperating * 10) / 10,
        monthsOfRecordedHistory: spanMonths,
        dataMaturity,
    };
}

// ── Financial behaviour ──────────────────────────────────────────────────────
export interface FinancialBehaviour {
    avgMonthlyRevenue: number;
    avgMonthlyProfitMargin: number;
    revenueVolatility: 'stable' | 'variable' | 'volatile'; // month-to-month swings, not growth direction
    yoyRevenueGrowthPct: number | null;
    dso: number; // days sales outstanding — how long customers take to pay
    dpo: number; // days payable outstanding — how long the business takes to pay suppliers
    cashConversionCycleDays: number;
    monthlyDebtObligation: number;
    seasonalLowMonths: string[]; // months where revenue historically runs well below average
}

function buildFinancialBehaviour(transactions: Transaction[], loans: Loan[], trend: TrendAnalysis): FinancialBehaviour {
    const wc = computeWorkingCapitalMetrics(transactions);
    const seasonal = computeSeasonalRisk(transactions);

    const monthsWithRevenue = trend.monthly.filter(m => m.revenue > 0);
    const avgMonthlyRevenue = monthsWithRevenue.length > 0
        ? monthsWithRevenue.reduce((s, m) => s + m.revenue, 0) / monthsWithRevenue.length
        : 0;

    // Coefficient of variation on monthly revenue — a simple, honest read on
    // how predictable this business's income is, independent of whether it's
    // growing or shrinking.
    let revenueVolatility: FinancialBehaviour['revenueVolatility'] = 'stable';
    if (monthsWithRevenue.length >= 3) {
        const mean = avgMonthlyRevenue;
        const variance = monthsWithRevenue.reduce((s, m) => s + Math.pow(m.revenue - mean, 2), 0) / monthsWithRevenue.length;
        const stdDev = Math.sqrt(variance);
        const cv = mean > 0 ? stdDev / mean : 0;
        revenueVolatility = cv >= 0.5 ? 'volatile' : cv >= 0.25 ? 'variable' : 'stable';
    }

    return {
        avgMonthlyRevenue,
        avgMonthlyProfitMargin: trend.avgMonthlyProfitMargin,
        revenueVolatility,
        yoyRevenueGrowthPct: trend.yoyRevenueGrowthPct,
        dso: wc.dso,
        dpo: wc.dpo,
        cashConversionCycleDays: wc.ccc,
        monthlyDebtObligation: totalMonthlyLoanBurden(loans),
        seasonalLowMonths: seasonal.filter(s => s.riskLevel === 'high').map(s => s.month),
    };
}

// ── Operational behaviour ────────────────────────────────────────────────────
export interface SupplierConcentration {
    supplier: string;
    amount: number;
    percentage: number;
    risk: 'low' | 'medium' | 'high';
}

export interface OperationalBehaviour {
    inventoryValue: number;
    slowMovingItemCount: number;
    totalInventoryItems: number;
    topCustomerConcentrationPct: number; // % of revenue from the single largest customer
    topSupplierConcentrationPct: number; // % of spend with the single largest supplier
    suppliers: SupplierConcentration[];
    outstandingReceivables: number;
    outstandingPayables: number;
}

// Mirrors computeCustomerConcentration's grouping + risk-tier logic
// (finance.ts) onto expense transactions — the one piece of this file that
// isn't reused from elsewhere, because nothing else in the app groups
// spend by supplier today.
function computeSupplierConcentration(transactions: Transaction[]): SupplierConcentration[] {
    const map = new Map<string, number>();
    let total = 0;
    for (const t of transactions) {
        if (t.type !== 'expense') continue;
        const raw = t.vendorCustomer?.split(' | ')[0]?.trim();
        const key = raw || 'Unknown';
        map.set(key, (map.get(key) ?? 0) + t.amount);
        total += t.amount;
    }
    return Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([supplier, amount]) => {
            const percentage = total > 0 ? (amount / total) * 100 : 0;
            const risk: SupplierConcentration['risk'] = percentage >= 40 ? 'high' : percentage >= 20 ? 'medium' : 'low';
            return { supplier, amount, percentage, risk };
        });
}

function buildOperationalBehaviour(transactions: Transaction[], inventory: InventoryItem[]): OperationalBehaviour {
    const customers = computeCustomerConcentration(transactions);
    const suppliers = computeSupplierConcentration(transactions);
    const wc = computeWorkingCapitalMetrics(transactions);

    const slowMovingItemCount = inventory.filter(item =>
        computeStockVelocity(item, transactions).tier === 'slow',
    ).length;

    return {
        inventoryValue: computeInventoryValue(inventory),
        slowMovingItemCount,
        totalInventoryItems: inventory.length,
        topCustomerConcentrationPct: customers[0]?.percentage ?? 0,
        topSupplierConcentrationPct: suppliers[0]?.percentage ?? 0,
        suppliers: suppliers.slice(0, 5),
        outstandingReceivables: wc.accountsReceivable,
        outstandingPayables: wc.accountsPayable,
    };
}

// ── Risk behaviour ───────────────────────────────────────────────────────────
export interface RiskBehaviour {
    riskScore: RiskScore;
    customerConcentrationRisk: 'low' | 'medium' | 'high';
    supplierConcentrationRisk: 'low' | 'medium' | 'high';
    marginTrendDirection: 'improving' | 'stable' | 'declining';
}

function buildRiskBehaviour(
    finance: FinanceData,
    loans: Loan[],
    transactions: Transaction[],
    trend: TrendAnalysis,
    operational: OperationalBehaviour,
): RiskBehaviour {
    const riskScore = computeRiskScore(finance, loans, transactions);

    const customerConcentrationRisk: RiskBehaviour['customerConcentrationRisk'] =
        operational.topCustomerConcentrationPct >= 40 ? 'high' : operational.topCustomerConcentrationPct >= 20 ? 'medium' : 'low';
    const supplierConcentrationRisk: RiskBehaviour['supplierConcentrationRisk'] =
        operational.topSupplierConcentrationPct >= 40 ? 'high' : operational.topSupplierConcentrationPct >= 20 ? 'medium' : 'low';

    let marginTrendDirection: RiskBehaviour['marginTrendDirection'] = 'stable';
    const recent = trend.monthly.slice(-3);
    if (recent.length >= 2) {
        const delta = recent[recent.length - 1].profitMargin - recent[0].profitMargin;
        marginTrendDirection = delta >= 3 ? 'improving' : delta <= -3 ? 'declining' : 'stable';
    }

    return { riskScore, customerConcentrationRisk, supplierConcentrationRisk, marginTrendDirection };
}

// ── Composite profile ────────────────────────────────────────────────────────
export interface BusinessFinancialDNA {
    identity: BusinessIdentity;
    financial: FinancialBehaviour;
    operational: OperationalBehaviour;
    risk: RiskBehaviour;
}

export function buildBusinessFinancialDNA(
    transactions: Transaction[],
    loans: Loan[],
    inventory: InventoryItem[],
    finance: FinanceData,
    settings: BusinessSettings,
    user: User | null | undefined,
): BusinessFinancialDNA {
    const trend = analyzeTrend(transactions);
    const operational = buildOperationalBehaviour(transactions, inventory);

    return {
        identity: buildIdentity(settings, user, trend.spanMonths),
        financial: buildFinancialBehaviour(transactions, loans, trend),
        operational,
        risk: buildRiskBehaviour(finance, loans, transactions, trend, operational),
    };
}

// ── "Something has changed" deviation detection ─────────────────────────────
export interface DNADeviation {
    metric: string;
    baseline: number;
    current: number;
    changeDescription: string;
    severity: 'info' | 'warning' | 'critical';
}

interface BaselineMetric {
    key: string;
    label: string;
    // Higher-is-worse metrics (expense, DSO) flip which direction counts as
    // a decline — kept explicit rather than inferred, since guessing wrong
    // here would flag improvements as risks.
    higherIsBetter: boolean;
    unit: 'currency' | 'percent' | 'days';
}

const BASELINE_METRICS: BaselineMetric[] = [
    { key: 'revenue', label: 'Monthly revenue', higherIsBetter: true, unit: 'currency' },
    { key: 'profitMargin', label: 'Profit margin', higherIsBetter: true, unit: 'percent' },
    { key: 'expense', label: 'Monthly expenses', higherIsBetter: false, unit: 'currency' },
];

const MIN_BASELINE_MONTHS = 3;
const SIGNIFICANT_RELATIVE_MOVE = 0.3; // 30% swing vs. baseline average
const SIGNIFICANT_MARGIN_POINT_MOVE = 8; // percentage points, for profitMargin specifically

/**
 * Compares the latest recorded month against the trailing average of the
 * months before it (excluding the latest), so "this changed" is always
 * measured against this specific business's own normal — not an industry
 * benchmark it never agreed to be judged against.
 */
export function detectDNADeviations(transactions: Transaction[], currency: string): DNADeviation[] {
    const monthly = computeAllTimeMonthlyBuckets(transactions);
    if (monthly.length < MIN_BASELINE_MONTHS + 1) return [];

    const latest = monthly[monthly.length - 1];
    const baselineMonths = monthly.slice(Math.max(0, monthly.length - 1 - 6), monthly.length - 1);
    if (baselineMonths.length < MIN_BASELINE_MONTHS) return [];

    const deviations: DNADeviation[] = [];

    for (const m of BASELINE_METRICS) {
        const baselineAvg = baselineMonths.reduce((s, mo) => s + (mo as any)[m.key], 0) / baselineMonths.length;
        const currentVal = (latest as any)[m.key] as number;

        if (m.unit === 'percent') {
            const pointMove = currentVal - baselineAvg;
            if (Math.abs(pointMove) >= SIGNIFICANT_MARGIN_POINT_MOVE) {
                const improved = m.higherIsBetter ? pointMove > 0 : pointMove < 0;
                deviations.push({
                    metric: m.label,
                    baseline: Math.round(baselineAvg * 10) / 10,
                    current: Math.round(currentVal * 10) / 10,
                    changeDescription: `${m.label} ${pointMove > 0 ? 'rose' : 'fell'} ${Math.abs(pointMove).toFixed(1)} points versus your recent average (${baselineAvg.toFixed(1)}% → ${currentVal.toFixed(1)}%).`,
                    severity: improved ? 'info' : Math.abs(pointMove) >= 15 ? 'critical' : 'warning',
                });
            }
            continue;
        }

        if (baselineAvg <= 0) continue;
        const relativeMove = (currentVal - baselineAvg) / baselineAvg;
        if (Math.abs(relativeMove) >= SIGNIFICANT_RELATIVE_MOVE) {
            const improved = m.higherIsBetter ? relativeMove > 0 : relativeMove < 0;
            deviations.push({
                metric: m.label,
                baseline: Math.round(baselineAvg),
                current: Math.round(currentVal),
                changeDescription: `${m.label} ${relativeMove > 0 ? 'jumped' : 'dropped'} ${Math.abs(relativeMove * 100).toFixed(0)}% versus your recent average (${currency}${Math.round(baselineAvg).toLocaleString()} → ${currency}${Math.round(currentVal).toLocaleString()}).`,
                severity: improved ? 'info' : Math.abs(relativeMove) >= 0.6 ? 'critical' : 'warning',
            });
        }
    }

    return deviations;
}
