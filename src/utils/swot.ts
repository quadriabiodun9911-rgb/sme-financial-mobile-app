import { SwotAnalysis, SwotItem, FinanceData, Transaction, BusinessSettings } from '../types';
import { getTopCategories, computeAgingBuckets } from './finance';

export function generateSwot(
    finance: FinanceData,
    transactions: Transaction[],
    settings: BusinessSettings,
): SwotAnalysis {
    const { currency, minReserve, targetMargin } = settings;
    const reserve = parseFloat(minReserve) || 0;
    const target = parseFloat(targetMargin) || 0;

    const strengths: SwotItem[] = [];
    const weaknesses: SwotItem[] = [];
    const opportunities: SwotItem[] = [];
    const threats: SwotItem[] = [];

    const topExpenses = getTopCategories(transactions, 'expense', 3);
    const topIncome = getTopCategories(transactions, 'income', 3);
    const arBuckets = computeAgingBuckets(transactions, 'income');
    const apBuckets = computeAgingBuckets(transactions, 'expense');
    const overdueAR = arBuckets.reduce((s, b) => s + b.total, 0);
    const overdueAP = apBuckets.reduce((s, b) => s + b.total, 0);
    const overdueARCount = arBuckets.reduce((s, b) => s + b.transactions.length, 0);
    const overdueAPCount = apBuckets.reduce((s, b) => s + b.transactions.length, 0);
    const recurringCount = transactions.filter(t => t.isRecurring).length;
    const expenseRatio = finance.income > 0 ? (finance.expense / finance.income) * 100 : 0;
    const incomeCategories = new Set(transactions.filter(t => t.type === 'income').map(t => t.category)).size;

    // ── STRENGTHS ──────────────────────────────────────────────────────────────

    if (finance.margin >= target && target > 0) {
        strengths.push({
            text: `Profit margin (${finance.margin.toFixed(1)}%) meets or exceeds the ${target}% target, demonstrating effective cost management.`,
            metric: `Margin: ${finance.margin.toFixed(1)}% vs target ${target}%`,
        });
    }

    if (finance.cashBalance >= reserve && reserve > 0) {
        strengths.push({
            text: `Cash balance of ${currency}${finance.cashBalance.toLocaleString()} exceeds the minimum reserve of ${currency}${reserve.toLocaleString()}, providing operational resilience.`,
            metric: `Cash: ${currency}${finance.cashBalance.toLocaleString()}`,
        });
    }

    if (finance.profit > 0) {
        strengths.push({
            text: `The business is generating positive net profit (${currency}${finance.profit.toLocaleString()}), confirming revenue exceeds total operating costs.`,
            metric: `Net profit: ${currency}${finance.profit.toLocaleString()}`,
        });
    }

    if (finance.equity > 0) {
        strengths.push({
            text: `Positive owner's equity (${currency}${finance.equity.toLocaleString()}) means total assets outweigh liabilities — a sound balance sheet position.`,
            metric: `Equity: ${currency}${finance.equity.toLocaleString()}`,
        });
    }

    if (incomeCategories >= 3) {
        strengths.push({
            text: `Revenue is spread across ${incomeCategories} income categories, reducing dependence on any single source.`,
            metric: `${incomeCategories} active income streams`,
        });
    }

    if (recurringCount >= 3) {
        strengths.push({
            text: `${recurringCount} recurring transactions are tracked, supporting predictable cash flow forecasting.`,
            metric: `${recurringCount} recurring entries`,
        });
    }

    if (expenseRatio > 0 && expenseRatio < 60) {
        strengths.push({
            text: `Expense ratio is ${expenseRatio.toFixed(1)}% of revenue — well within a healthy range — leaving significant margin headroom.`,
            metric: `Expense ratio: ${expenseRatio.toFixed(1)}%`,
        });
    }

    if (strengths.length === 0) {
        strengths.push({
            text: 'Log more transactions to generate a data-driven strengths analysis. Add income and expense entries to populate this section.',
        });
    }

    // ── WEAKNESSES ─────────────────────────────────────────────────────────────

    if (finance.margin < target && target > 0) {
        weaknesses.push({
            text: `Profit margin (${finance.margin.toFixed(1)}%) is below the ${target}% target, indicating either insufficient revenue or excess cost.`,
            metric: `Gap: ${(target - finance.margin).toFixed(1)} percentage points`,
        });
    }

    if (finance.cashBalance < reserve && reserve > 0) {
        weaknesses.push({
            text: `Cash balance (${currency}${finance.cashBalance.toLocaleString()}) falls short of the minimum reserve (${currency}${reserve.toLocaleString()}), reducing the ability to absorb unexpected costs.`,
            metric: `Shortfall: ${currency}${(reserve - finance.cashBalance).toLocaleString()}`,
        });
    }

    if (finance.profit < 0) {
        weaknesses.push({
            text: `The business is currently operating at a net loss of ${currency}${Math.abs(finance.profit).toLocaleString()}. Total costs exceed total revenue.`,
            metric: `Net loss: ${currency}${Math.abs(finance.profit).toLocaleString()}`,
        });
    }

    if (incomeCategories < 2 && transactions.filter(t => t.type === 'income').length > 0) {
        weaknesses.push({
            text: `Revenue is concentrated in ${incomeCategories === 1 ? 'a single category' : 'very few categories'}, creating fragility if that stream declines.`,
            metric: `${incomeCategories} income source(s)`,
        });
    }

    if (expenseRatio > 80 && finance.income > 0) {
        weaknesses.push({
            text: `Expenses consume ${expenseRatio.toFixed(1)}% of revenue, leaving little margin for reinvestment or unexpected costs.`,
            metric: `Expense ratio: ${expenseRatio.toFixed(1)}%`,
        });
    }

    if (topExpenses.length > 0) {
        const top = topExpenses[0];
        const topExpPct = finance.income > 0 ? (top.amount / finance.income * 100).toFixed(1) : '—';
        weaknesses.push({
            text: `"${top.category}" is the highest single cost centre at ${currency}${top.amount.toLocaleString()} (${topExpPct}% of revenue). It warrants review.`,
            metric: `Top cost: ${currency}${top.amount.toLocaleString()}`,
        });
    }

    if (overdueAR > 0) {
        weaknesses.push({
            text: `${currency}${overdueAR.toLocaleString()} in overdue receivables across ${overdueARCount} invoice(s) represents cash that has been earned but not yet collected.`,
            metric: `Overdue AR: ${currency}${overdueAR.toLocaleString()}`,
        });
    }

    if (weaknesses.length === 0) {
        weaknesses.push({
            text: 'No significant financial weaknesses detected based on current data. Continue monitoring margins, cash reserve, and overdue receivables.',
        });
    }

    // ── OPPORTUNITIES ──────────────────────────────────────────────────────────

    if (finance.margin >= target * 0.9 && finance.income > 0) {
        opportunities.push({
            text: `With a strong margin base, reinvesting a portion of profits into marketing or sales capacity could accelerate revenue growth with minimal risk.`,
            metric: `Current margin: ${finance.margin.toFixed(1)}%`,
        });
    }

    if (incomeCategories < 3 && finance.income > 0) {
        opportunities.push({
            text: 'Adding 1–2 new income categories (e.g., consulting, licensing, or a complementary product line) would diversify revenue and reduce concentration risk.',
        });
    }

    if (overdueAR > 0) {
        opportunities.push({
            text: `Collecting the ${currency}${overdueAR.toLocaleString()} in outstanding receivables would immediately strengthen the cash position without requiring new sales.`,
            metric: `Collectable AR: ${currency}${overdueAR.toLocaleString()}`,
        });
    }

    if (finance.cashBalance >= reserve * 1.5 && reserve > 0) {
        opportunities.push({
            text: `Cash reserves are comfortably above the minimum. Deploying surplus cash into short-term investments or growth initiatives could improve overall returns.`,
            metric: `Surplus: ${currency}${(finance.cashBalance - reserve).toLocaleString()} above minimum`,
        });
    }

    if (topExpenses.length >= 2) {
        opportunities.push({
            text: `Renegotiating terms with top cost suppliers — particularly in "${topExpenses[0].category}" — could unlock significant margin improvement without revenue changes.`,
            metric: `Potential annual saving: ${currency}${Math.round(topExpenses[0].amount * 0.1).toLocaleString()} (10% reduction)`,
        });
    }

    if (recurringCount === 0 && transactions.length > 3) {
        opportunities.push({
            text: 'Introducing recurring revenue streams (subscriptions, retainers, service contracts) would make cash flow more predictable and improve financial planning accuracy.',
        });
    }

    if (finance.netTaxPosition < 0) {
        opportunities.push({
            text: `A negative net tax position (${currency}${Math.abs(finance.netTaxPosition).toLocaleString()}) may indicate refundable credits or deductible expenses. Consult a tax advisor to optimise your tax position.`,
            metric: `Net tax: ${currency}${finance.netTaxPosition.toLocaleString()}`,
        });
    }

    if (opportunities.length === 0) {
        opportunities.push({
            text: 'Continue expanding transaction history to unlock data-driven opportunity analysis. Focus on diversifying income sources and scaling your top-performing categories.',
        });
    }

    // ── THREATS ────────────────────────────────────────────────────────────────

    if (finance.cashBalance < reserve * 0.5 && reserve > 0) {
        threats.push({
            text: `Cash balance is critically low at ${currency}${finance.cashBalance.toLocaleString()} — less than half the minimum reserve. Even a minor revenue disruption could create a cash crisis.`,
            metric: `Reserve coverage: ${reserve > 0 ? ((finance.cashBalance / reserve) * 100).toFixed(0) : 0}%`,
        });
    }

    if (overdueAP > 0) {
        threats.push({
            text: `${currency}${overdueAP.toLocaleString()} in overdue payables across ${overdueAPCount} obligations risks supplier relationship damage, late fees, or service interruptions.`,
            metric: `Overdue AP: ${currency}${overdueAP.toLocaleString()}`,
        });
    }

    if (finance.liabilities > finance.assets * 0.5 && finance.assets > 0) {
        threats.push({
            text: `Liabilities represent ${((finance.liabilities / finance.assets) * 100).toFixed(0)}% of total assets, indicating elevated financial leverage and reduced capacity to absorb losses.`,
            metric: `Debt ratio: ${((finance.liabilities / finance.assets) * 100).toFixed(0)}%`,
        });
    }

    if (incomeCategories === 1 && finance.income > 0) {
        threats.push({
            text: 'All revenue comes from a single category. If this income stream is disrupted (client loss, market shift, or seasonality), the business has no fallback revenue.',
            metric: `Single income source`,
        });
    }

    if (expenseRatio > 90 && finance.income > 0) {
        threats.push({
            text: `With ${expenseRatio.toFixed(1)}% of revenue consumed by expenses, a modest revenue decline (10–15%) would put the business into a loss-making position.`,
            metric: `Expense ratio: ${expenseRatio.toFixed(1)}%`,
        });
    }

    if (finance.profit < 0) {
        threats.push({
            text: `Sustained net losses will erode equity and cash reserves over time. If the current trajectory continues, the business will deplete its financial buffer.`,
            metric: `Monthly loss: ${currency}${Math.abs(finance.profit).toLocaleString()}`,
        });
    }

    if (arBuckets[2].total > 0 || arBuckets[3].total > 0) {
        const aged = arBuckets[2].total + arBuckets[3].total;
        threats.push({
            text: `${currency}${aged.toLocaleString()} in receivables are more than 60 days overdue — these are at high risk of becoming bad debts if not collected immediately.`,
            metric: `Aged AR (60d+): ${currency}${aged.toLocaleString()}`,
        });
    }

    if (threats.length === 0) {
        threats.push({
            text: 'No material financial threats detected based on current data. Maintain cash reserves above the minimum, keep receivables current, and monitor expense ratios monthly.',
        });
    }

    return {
        strengths,
        weaknesses,
        opportunities,
        threats,
        generatedAt: new Date().toISOString(),
    };
}
