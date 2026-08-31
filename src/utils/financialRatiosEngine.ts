/**
 * Financial Ratios, Automatically — "Quad360 should calculate them
 * automatically... and translate them into plain business language.
 * Instead of: 'Current ratio = 1.18' say: Liquidity: Moderate / Your
 * short-term assets currently provide limited headroom against short-term
 * obligations."
 *
 * This is a presentation + aggregation layer over ratios that mostly
 * already exist elsewhere in the app — never a second, independently
 * -tuned computation of a number some other screen already shows:
 *  - Net Margin, Current Ratio, Debt-to-Equity, ROA — computeFinancialRatios
 *    (finance.ts), the exact figures the Finance tab's "Key Financial
 *    Ratios" card already shows as raw numbers.
 *  - DSO, DPO, DIO, CCC — computeCashConversionCycle fed by
 *    computeTrailingAccrualFigures (cfoMetrics.ts), the EXACT call CFO
 *    Questions' Q2 (CashConversionCycleVisual) already makes, so this can
 *    never show a different Cash Conversion Cycle than Q2 does.
 *  - DSCR — computeDSCR (finance.ts), the same figure the Debt Health
 *    pillar and the Loans & Debt tab already show.
 *  - Revenue/Expense Growth — computeMonthlyTrend(transactions, 3)
 *    (finance.ts), the EXACT convention computeRiskScore's Efficiency
 *    factor already uses (first vs. last of a trailing 3-month window),
 *    so this never disagrees with that factor's own growth read.
 *
 * Only three figures are genuinely new: Operating Margin, Cash Ratio, and
 * Debt-to-Cash-Flow — none of these had ANY existing computation anywhere
 * in the app to disagree with. Gross Margin is also new as a *tier*
 * (the raw number exists in finance.ts's P&L, but nothing tiered it).
 * Each is built from data an existing engine already produces (see each
 * section's own comment) and documented as new where its thresholds are
 * this file's own invention rather than reused from elsewhere.
 */

import { Transaction, Loan, InventoryItem, FinanceData } from '../types';
import { computeFinancialRatios, computeMonthlyTrend, computeDSCR } from './finance';
import { computeLeverageRatios, computeLiveLoanBalance } from './debtRatios';
import { computeTrailingAccrualFigures, computeCashConversionCycle } from './cfoMetrics';
import { computeInventoryValue } from './stockVelocity';
import { computeAllTimeMonthlyBuckets } from './trendAnalysis';

export type RatioTier = 'strong' | 'moderate' | 'weak' | 'unavailable';

export interface RatioReading {
    key: string;
    label: string;
    value: number | null; // null when unavailable
    displayValue: string; // formatted for direct display, e.g. "38%", "1.18x", "47 days", "N/A"
    tier: RatioTier;       // drives the color badge
    tierLabel: string;     // the word shown in the badge -- usually Strong/Moderate/Weak, but a
                            // metric with no inherent "better" direction (e.g. Payables Days) uses
                            // its own neutral wording while still coloring by the same tier
    plainLanguage: string; // the interpretive sentence -- this is the whole point of this file
}

export interface RatioCategory {
    key: 'profitability' | 'liquidity' | 'efficiency' | 'debt' | 'growth';
    label: string;
    readings: RatioReading[];
}

export interface FinancialRatiosDashboard {
    categories: RatioCategory[];
}

const UNAVAILABLE = (key: string, label: string, reason: string): RatioReading => ({
    key, label, value: null, displayValue: 'N/A', tier: 'unavailable', tierLabel: 'Not enough data', plainLanguage: reason,
});

function pct(n: number): string { return `${n.toFixed(0)}%`; }
function days(n: number): string { return `${Math.round(n)} days`; }
function multiple(n: number): string { return `${n.toFixed(2)}x`; }

export function computeFinancialRatiosDashboard(
    finance: FinanceData,
    loans: Loan[],
    transactions: Transaction[],
    inventory: InventoryItem[],
): FinancialRatiosDashboard {
    const inventoryValue = computeInventoryValue(inventory);

    // ── Profitability: Gross / Operating / Net Margin ───────────────────
    // All three built from the SAME trailing-3-month accrual bucket sums
    // (computeAllTimeMonthlyBuckets, anchored to the latest DATA month --
    // matching burnRateAnalysis.ts's own 3-month trailing convention) so
    // Gross >= Operating >= Net always holds by construction, and the
    // three read as one coherent ladder rather than three figures pulled
    // from different time windows.
    const buckets = computeAllTimeMonthlyBuckets(transactions).slice(-3);
    const revenue3mo = buckets.reduce((s, b) => s + b.revenue, 0);
    const cogs3mo = buckets.reduce((s, b) => s + b.cogs, 0);
    const opex3mo = buckets.reduce((s, b) => s + b.opex, 0);
    const profit3mo = buckets.reduce((s, b) => s + b.profit, 0);

    const profitability: RatioReading[] = [];
    if (revenue3mo > 0) {
        const grossMargin = ((revenue3mo - cogs3mo) / revenue3mo) * 100;
        // New tier -- no existing gross-margin scoring elsewhere to reuse.
        // Set higher than net margin's own breakpoints since gross margin
        // (before overhead) is structurally always higher.
        profitability.push({
            key: 'grossMargin', label: 'Gross Margin', value: grossMargin, displayValue: pct(grossMargin),
            tier: grossMargin >= 40 ? 'strong' : grossMargin >= 20 ? 'moderate' : 'weak',
            tierLabel: grossMargin >= 40 ? 'Strong' : grossMargin >= 20 ? 'Moderate' : 'Weak',
            plainLanguage: `Gross Margin: ${grossMargin >= 40 ? 'Strong' : grossMargin >= 20 ? 'Moderate' : 'Weak'} — after direct product/service costs, ${grossMargin.toFixed(0)}% of revenue is left to cover overhead and profit.`,
        });

        const operatingMargin = ((revenue3mo - cogs3mo - opex3mo) / revenue3mo) * 100;
        // New tier -- Operating Margin has no existing scoring elsewhere.
        profitability.push({
            key: 'operatingMargin', label: 'Operating Margin', value: operatingMargin, displayValue: pct(operatingMargin),
            tier: operatingMargin >= 15 ? 'strong' : operatingMargin >= 5 ? 'moderate' : 'weak',
            tierLabel: operatingMargin >= 15 ? 'Strong' : operatingMargin >= 5 ? 'Moderate' : 'Weak',
            plainLanguage: `Operating Margin: ${operatingMargin >= 15 ? 'Strong' : operatingMargin >= 5 ? 'Moderate' : 'Weak'} — core operations keep ${operatingMargin.toFixed(0)}% of revenue after both direct costs and day-to-day overhead, before interest and other non-operating items.`,
        });

        const netMargin = (profit3mo / revenue3mo) * 100;
        // Reuses computeRiskScore's own Profitability-factor breakpoints
        // (20% / 10% / 0%) so this never disagrees with that pillar on
        // what counts as a healthy margin -- just applied here to a
        // trailing-3-month view for direct comparability with Gross and
        // Operating Margin above, rather than the Profitability factor's
        // own all-time finance.profit/finance.income figure.
        profitability.push({
            key: 'netMargin', label: 'Net Margin', value: netMargin, displayValue: pct(netMargin),
            tier: netMargin >= 20 ? 'strong' : netMargin >= 10 ? 'moderate' : netMargin >= 0 ? 'moderate' : 'weak',
            tierLabel: netMargin >= 20 ? 'Strong' : netMargin >= 0 ? 'Moderate' : 'Weak',
            plainLanguage: netMargin >= 20
                ? `Net Margin: Strong — ${netMargin.toFixed(0)}% of revenue reaches the bottom line, well above the 20% benchmark.`
                : netMargin >= 0
                    ? `Net Margin: Moderate — only ${netMargin.toFixed(0)}% of revenue reaches the bottom line after every cost, below the 20% benchmark.`
                    : `Net Margin: Weak — the business lost money over this stretch (${netMargin.toFixed(0)}% margin).`,
        });
    } else {
        profitability.push(UNAVAILABLE('grossMargin', 'Gross Margin', 'Not enough revenue history yet to assess margins.'));
        profitability.push(UNAVAILABLE('operatingMargin', 'Operating Margin', 'Not enough revenue history yet to assess margins.'));
        profitability.push(UNAVAILABLE('netMargin', 'Net Margin', 'Not enough revenue history yet to assess margins.'));
    }

    // ── Liquidity: Current Ratio, Cash Ratio ─────────────────────────────
    const finRatios = computeFinancialRatios(finance, loans, transactions, inventoryValue);
    const liquidity: RatioReading[] = [];
    if (finRatios.hasLiabilitiesData) {
        const cr = finRatios.currentRatio;
        // Same 1.5x / 1.0x breakpoints the Finance tab's own Current Ratio
        // card already uses (CFOScreen.tsx) -- reused here rather than a
        // second, independently-chosen threshold for the same ratio.
        const tier: RatioTier = cr >= 1.5 ? 'strong' : cr >= 1.0 ? 'moderate' : 'weak';
        liquidity.push({
            key: 'currentRatio', label: 'Current Ratio', value: cr, displayValue: multiple(cr),
            tier, tierLabel: tier === 'strong' ? 'Strong' : tier === 'moderate' ? 'Moderate' : 'Weak',
            plainLanguage: tier === 'strong'
                ? 'Liquidity: Strong — your short-term assets comfortably cover short-term obligations.'
                : tier === 'moderate'
                    ? 'Liquidity: Moderate — your short-term assets currently provide limited headroom against short-term obligations.'
                    : 'Liquidity: Weak — your short-term obligations currently exceed your short-term assets.',
        });
    } else {
        liquidity.push(UNAVAILABLE('currentRatio', 'Current Ratio', 'No liabilities recorded yet to compare assets against.'));
    }

    const leverage = computeLeverageRatios(finance, loans, 0, 0, inventoryValue);
    if (leverage.liabilities > 0) {
        const cashRatio = finance.cashBalance / leverage.liabilities;
        // New tier -- Cash Ratio (the strictest liquidity test, cash alone
        // against liabilities) has no existing scoring elsewhere. 0.5 / 0.2
        // are standard conservative benchmarks, not app-specific.
        const tier: RatioTier = cashRatio >= 0.5 ? 'strong' : cashRatio >= 0.2 ? 'moderate' : 'weak';
        liquidity.push({
            key: 'cashRatio', label: 'Cash Ratio', value: cashRatio, displayValue: multiple(cashRatio),
            tier, tierLabel: tier === 'strong' ? 'Strong' : tier === 'moderate' ? 'Moderate' : 'Weak',
            plainLanguage: tier === 'strong'
                ? `Cash Ratio: Strong — cash on hand alone covers ${(cashRatio * 100).toFixed(0)}% of total liabilities, with no reliance on collecting receivables or selling stock.`
                : tier === 'moderate'
                    ? `Cash Ratio: Moderate — cash on hand covers ${(cashRatio * 100).toFixed(0)}% of total liabilities; the rest depends on collecting receivables or selling stock.`
                    : `Cash Ratio: Weak — cash on hand covers only ${(cashRatio * 100).toFixed(0)}% of total liabilities.`,
        });
    } else {
        liquidity.push(UNAVAILABLE('cashRatio', 'Cash Ratio', 'No liabilities recorded yet to compare cash against.'));
    }

    // ── Efficiency: Receivables/Payables/Inventory Days, Cash Conversion
    // Cycle -- the EXACT computeTrailingAccrualFigures + computeCashConversionCycle
    // call CFOQuestionsTab's Q2 (CashConversionCycleVisual) already makes,
    // so this section can never show a different CCC than Q2 does.
    const trailing = computeTrailingAccrualFigures(transactions);
    const efficiency: RatioReading[] = [];
    if (trailing.trailing30AccrualRevenue > 0 || trailing.trailing30AccrualExpenses > 0) {
        const ccc = computeCashConversionCycle(
            trailing.unpaidIncome, trailing.trailing30AccrualRevenue,
            trailing.unpaidExpenses, trailing.trailing30AccrualExpenses,
            inventoryValue,
        );
        efficiency.push({
            key: 'dso', label: 'Receivables Days (DSO)', value: ccc.dso, displayValue: days(ccc.dso),
            tier: ccc.dso <= 30 ? 'strong' : ccc.dso <= 45 ? 'moderate' : 'weak',
            tierLabel: ccc.dso <= 30 ? 'Fast' : ccc.dso <= 45 ? 'Typical' : 'Slow',
            plainLanguage: `It takes about ${Math.round(ccc.dso)} days on average to collect payment after a sale.`,
        });
        // Payables Days has no single "better" direction -- paying slower
        // can mean healthy use of supplier credit OR building payment
        // pressure (see supplierPaymentPressure.ts's own distinction
        // between the two). Labeled descriptively (Fast/Typical/Extended)
        // rather than Strong/Weak, which would wrongly imply a value
        // judgment this number alone can't support.
        efficiency.push({
            key: 'dpo', label: 'Payables Days (DPO)', value: ccc.dpo, displayValue: days(ccc.dpo),
            tier: ccc.dpo <= 45 ? 'strong' : ccc.dpo <= 60 ? 'moderate' : 'weak',
            tierLabel: ccc.dpo <= 45 ? 'Fast' : ccc.dpo <= 60 ? 'Typical' : 'Extended',
            plainLanguage: `It takes about ${Math.round(ccc.dpo)} days on average to pay suppliers -- longer isn't automatically bad (it can mean healthy use of supplier credit), but worth checking against Supplier Payment Pressure if it's climbing.`,
        });
        if (inventoryValue > 0) {
            efficiency.push({
                key: 'dio', label: 'Inventory Days (DIO)', value: ccc.dio, displayValue: days(ccc.dio),
                tier: ccc.dio <= 30 ? 'strong' : ccc.dio <= 60 ? 'moderate' : 'weak',
                tierLabel: ccc.dio <= 30 ? 'Fast' : ccc.dio <= 60 ? 'Moderate' : 'Slow',
                plainLanguage: `Stock sits for about ${Math.round(ccc.dio)} days on average before it's sold.`,
            });
        } else {
            efficiency.push(UNAVAILABLE('dio', 'Inventory Days (DIO)', 'No inventory recorded.'));
        }
        efficiency.push({
            key: 'ccc', label: 'Cash Conversion Cycle', value: ccc.ccc, displayValue: days(ccc.ccc),
            tier: ccc.ccc <= 30 ? 'strong' : ccc.ccc <= 60 ? 'moderate' : 'weak',
            tierLabel: ccc.ccc <= 30 ? 'Strong' : ccc.ccc <= 60 ? 'Moderate' : 'Weak',
            plainLanguage: `Cash is tied up for about ${Math.round(ccc.ccc)} days between paying suppliers and collecting from customers -- ${
                ccc.ccc <= 30 ? 'cash returns quickly.' : ccc.ccc <= 60 ? 'a reasonable, if not fast, cycle.' : 'a long stretch that ties up working capital.'
            }`,
        });
    } else {
        efficiency.push(UNAVAILABLE('dso', 'Receivables Days (DSO)', 'Not enough recent transaction history yet.'));
        efficiency.push(UNAVAILABLE('dpo', 'Payables Days (DPO)', 'Not enough recent transaction history yet.'));
        efficiency.push(UNAVAILABLE('dio', 'Inventory Days (DIO)', 'Not enough recent transaction history yet.'));
        efficiency.push(UNAVAILABLE('ccc', 'Cash Conversion Cycle', 'Not enough recent transaction history yet.'));
    }

    // ── Debt: Debt Service Coverage Ratio, Debt-to-Cash-Flow ────────────
    const dscr = computeDSCR(transactions, loans);
    const debt: RatioReading[] = [];
    if (dscr.totalDebtService > 0) {
        // dscr.status already IS computeRiskScore's Debt-factor verdict
        // (finance.ts) -- mapped straight across so this can never
        // disagree with the Debt Health pillar on the same loans.
        const tier: RatioTier = dscr.status === 'healthy' ? 'strong' : dscr.status === 'warning' ? 'moderate' : 'weak';
        debt.push({
            key: 'dscr', label: 'Debt Service Coverage Ratio', value: dscr.dscr, displayValue: multiple(dscr.dscr),
            tier, tierLabel: tier === 'strong' ? 'Strong' : tier === 'moderate' ? 'Moderate' : 'Weak',
            plainLanguage: tier === 'strong'
                ? 'Repayment Capacity: Strong — operating income comfortably covers loan payments.'
                : tier === 'moderate'
                    ? 'Repayment Capacity: Moderate — operating income covers loan payments, but with little room to spare.'
                    : 'Repayment Capacity: Weak — operating income does not fully cover current loan payments.',
        });
    } else {
        debt.push({
            key: 'dscr', label: 'Debt Service Coverage Ratio', value: null, displayValue: 'N/A',
            tier: 'strong', tierLabel: 'Strong', plainLanguage: 'No loan repayments currently owed.',
        });
    }

    const liveLoanBalance = computeLiveLoanBalance(loans);
    if (liveLoanBalance <= 0) {
        debt.push({
            key: 'debtToCashFlow', label: 'Debt-to-Cash-Flow', value: 0, displayValue: '0.00x',
            tier: 'strong', tierLabel: 'Strong', plainLanguage: 'Financing Capacity: Strong — no outstanding loan debt.',
        });
    } else if (dscr.netOperatingIncome <= 0) {
        debt.push({
            key: 'debtToCashFlow', label: 'Debt-to-Cash-Flow', value: null, displayValue: 'N/A',
            tier: 'weak', tierLabel: 'Weak',
            plainLanguage: 'Financing Capacity: Weak — the business isn\'t currently generating positive operating cash flow to measure against its outstanding debt.',
        });
    } else {
        // New ratio -- total outstanding debt against annualized operating
        // cash flow (computeDSCR's own netOperatingIncome, reused rather
        // than a second cash-flow annualization). 2x / 4x mirror the
        // conventional debt-to-EBITDA caution lines lenders use.
        const debtToCF = liveLoanBalance / dscr.netOperatingIncome;
        const tier: RatioTier = debtToCF <= 2 ? 'strong' : debtToCF <= 4 ? 'moderate' : 'weak';
        debt.push({
            key: 'debtToCashFlow', label: 'Debt-to-Cash-Flow', value: debtToCF, displayValue: multiple(debtToCF),
            tier, tierLabel: tier === 'strong' ? 'Strong' : tier === 'moderate' ? 'Moderate' : 'Weak',
            plainLanguage: tier === 'strong'
                ? `Financing Capacity: Strong — outstanding debt is about ${debtToCF.toFixed(1)}x annual operating cash flow, comfortably serviceable.`
                : tier === 'moderate'
                    ? `Financing Capacity: Moderate — outstanding debt is about ${debtToCF.toFixed(1)}x annual operating cash flow.`
                    : `Financing Capacity: Weak — outstanding debt is about ${debtToCF.toFixed(1)}x annual operating cash flow, a heavy load relative to what the business generates.`,
        });
    }

    // ── Growth: Revenue, Expense, Profit ────────────────────────────────
    // Reuses computeMonthlyTrend(transactions, 3) with NO anchor override
    // -- the exact same call computeRiskScore's Efficiency factor makes --
    // so Revenue/Expense Growth here can never disagree with that factor's
    // own read of the same trend. Profit Growth is the one new figure,
    // derived from the SAME first/last months so all three stay consistent
    // with each other.
    const trend3 = computeMonthlyTrend(transactions, 3);
    const growth: RatioReading[] = [];
    const hasGrowthData = trend3.length >= 2 && (trend3[0].income > 0 || trend3[0].expense > 0);
    if (hasGrowthData) {
        const first = trend3[0];
        const last = trend3[trend3.length - 1];
        const revenueGrowthPct = first.income > 0 ? ((last.income - first.income) / first.income) * 100 : 0;
        const expenseGrowthPct = first.expense > 0 ? ((last.expense - first.expense) / first.expense) * 100 : 0;
        const firstProfit = first.income - first.expense;
        const lastProfit = last.income - last.expense;
        const profitGrowthPct = firstProfit !== 0 ? ((lastProfit - firstProfit) / Math.abs(firstProfit)) * 100 : (lastProfit > 0 ? 100 : 0);

        growth.push({
            key: 'revenueGrowth', label: 'Revenue Growth', value: revenueGrowthPct, displayValue: `${revenueGrowthPct >= 0 ? '+' : ''}${revenueGrowthPct.toFixed(0)}%`,
            tier: revenueGrowthPct >= 5 ? 'strong' : revenueGrowthPct >= -5 ? 'moderate' : 'weak',
            tierLabel: revenueGrowthPct >= 5 ? 'Growing' : revenueGrowthPct >= -5 ? 'Stable' : 'Declining',
            plainLanguage: `Revenue is ${revenueGrowthPct >= 5 ? 'growing' : revenueGrowthPct >= -5 ? 'roughly flat' : 'declining'} (${revenueGrowthPct >= 0 ? '+' : ''}${revenueGrowthPct.toFixed(0)}% over the last 3 months).`,
        });
        growth.push({
            key: 'expenseGrowth', label: 'Expense Growth', value: expenseGrowthPct, displayValue: `${expenseGrowthPct >= 0 ? '+' : ''}${expenseGrowthPct.toFixed(0)}%`,
            tier: expenseGrowthPct <= 0 ? 'strong' : expenseGrowthPct <= 15 ? 'moderate' : 'weak',
            tierLabel: expenseGrowthPct <= 0 ? 'Controlled' : expenseGrowthPct <= 15 ? 'Rising' : 'Fast-Rising',
            plainLanguage: `Expenses are ${expenseGrowthPct <= 0 ? 'flat or falling' : 'rising'} (${expenseGrowthPct >= 0 ? '+' : ''}${expenseGrowthPct.toFixed(0)}% over the last 3 months)${revenueGrowthPct < expenseGrowthPct ? ' -- faster than revenue is growing.' : '.'}`,
        });
        growth.push({
            key: 'profitGrowth', label: 'Profit Growth', value: profitGrowthPct, displayValue: `${profitGrowthPct >= 0 ? '+' : ''}${profitGrowthPct.toFixed(0)}%`,
            tier: profitGrowthPct >= 10 ? 'strong' : profitGrowthPct >= -10 ? 'moderate' : 'weak',
            tierLabel: profitGrowthPct >= 10 ? 'Improving' : profitGrowthPct >= -10 ? 'Stable' : 'Declining',
            plainLanguage: `Profit is ${profitGrowthPct >= 10 ? 'improving' : profitGrowthPct >= -10 ? 'roughly stable' : 'declining'} over the last 3 months (${profitGrowthPct >= 0 ? '+' : ''}${profitGrowthPct.toFixed(0)}%).`,
        });
    } else {
        growth.push(UNAVAILABLE('revenueGrowth', 'Revenue Growth', 'Not enough monthly history yet to measure growth.'));
        growth.push(UNAVAILABLE('expenseGrowth', 'Expense Growth', 'Not enough monthly history yet to measure growth.'));
        growth.push(UNAVAILABLE('profitGrowth', 'Profit Growth', 'Not enough monthly history yet to measure growth.'));
    }

    return {
        categories: [
            { key: 'profitability', label: 'Profitability', readings: profitability },
            { key: 'liquidity', label: 'Liquidity', readings: liquidity },
            { key: 'efficiency', label: 'Efficiency', readings: efficiency },
            { key: 'debt', label: 'Debt', readings: debt },
            { key: 'growth', label: 'Growth', readings: growth },
        ],
    };
}
