import { Transaction, Loan, FinanceData, BusinessSettings } from '../types';
import { filterByDateRange, getPreviousPeriodRange, ReportPeriod } from './finance';

// ─── Period comparison ─────────────────────────────────────────────────────────
export interface PeriodMetrics {
    income: number;
    expense: number;
    profit: number;
    margin: number;
    topIncomeCategories: { category: string; amount: number; change: number }[];
    topExpenseCategories: { category: string; amount: number; change: number }[];
}

export function computePeriodMetrics(transactions: Transaction[]): PeriodMetrics {
    const income  = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const profit  = income - expense;
    const margin  = income > 0 ? (profit / income) * 100 : 0;

    const catMap = (type: 'income' | 'expense') => {
        const m = new Map<string, number>();
        transactions.filter(t => t.type === type).forEach(t => m.set(t.category, (m.get(t.category) ?? 0) + t.amount));
        return m;
    };

    const incMap = catMap('income');
    const expMap = catMap('expense');

    const topIncome  = [...incMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([category, amount]) => ({ category, amount, change: 0 }));
    const topExpense = [...expMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([category, amount]) => ({ category, amount, change: 0 }));

    return { income, expense, profit, margin, topIncomeCategories: topIncome, topExpenseCategories: topExpense };
}

// ─── Root cause analysis ───────────────────────────────────────────────────────
export interface CategoryChange {
    category: string;
    current: number;
    previous: number;
    change: number;       // absolute
    changePct: number;    // %
    impact: 'positive' | 'negative' | 'neutral';
}

export interface RootCauseAnalysis {
    period: string;
    currentIncome: number;
    previousIncome: number;
    currentExpense: number;
    previousExpense: number;
    currentProfit: number;
    previousProfit: number;
    profitChange: number;
    profitChangePct: number;
    incomeDrivers: CategoryChange[];   // categories that changed income
    expenseDrivers: CategoryChange[];  // categories that changed expense
    primaryCause: string;              // plain-English main cause
    diagnosis: string[];               // 2–4 sentence explanation
    recommendations: string[];         // 3–5 specific actions
    severity: 'positive' | 'neutral' | 'warning' | 'critical';
}

export function analyseRootCause(
    transactions: Transaction[],
    period: ReportPeriod = 'month',
    settings: Pick<BusinessSettings, 'currency' | 'targetMargin'>,
): RootCauseAnalysis {
    const { currency, targetMargin } = settings;
    const target = parseFloat(targetMargin) || 20;
    const ranges = getPreviousPeriodRange(period === 'all' || period === 'custom' ? 'month' : period);

    const current  = filterByDateRange(transactions, ranges.current);
    const previous = filterByDateRange(transactions, ranges.previous);

    const cur = computePeriodMetrics(current);
    const prv = computePeriodMetrics(previous);

    const profitChange    = cur.profit - prv.profit;
    const profitChangePct = prv.profit !== 0 ? (profitChange / Math.abs(prv.profit)) * 100 : 0;

    // Build category diff maps
    const buildCatMap = (txs: Transaction[], type: 'income' | 'expense') => {
        const m = new Map<string, number>();
        txs.filter(t => t.type === type).forEach(t => m.set(t.category, (m.get(t.category) ?? 0) + t.amount));
        return m;
    };

    const curIncMap = buildCatMap(current, 'income');
    const prvIncMap = buildCatMap(previous, 'income');
    const curExpMap = buildCatMap(current, 'expense');
    const prvExpMap = buildCatMap(previous, 'expense');

    const allIncCats = new Set([...curIncMap.keys(), ...prvIncMap.keys()]);
    const allExpCats = new Set([...curExpMap.keys(), ...prvExpMap.keys()]);

    const incomeDrivers: CategoryChange[] = [...allIncCats].map(cat => {
        const c = curIncMap.get(cat) ?? 0;
        const p = prvIncMap.get(cat) ?? 0;
        const change = c - p;
        return { category: cat, current: c, previous: p, change, changePct: p > 0 ? (change / p) * 100 : 100, impact: (change >= 0 ? 'positive' : 'negative') as 'positive' | 'negative' | 'neutral' };
    }).filter(d => Math.abs(d.change) > 0).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

    const expenseDrivers: CategoryChange[] = [...allExpCats].map(cat => {
        const c = curExpMap.get(cat) ?? 0;
        const p = prvExpMap.get(cat) ?? 0;
        const change = c - p;
        return { category: cat, current: c, previous: p, change, changePct: p > 0 ? (change / p) * 100 : 100, impact: (change <= 0 ? 'positive' : 'negative') as 'positive' | 'negative' | 'neutral' };
    }).filter(d => Math.abs(d.change) > 0).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

    const periodLabel = period === 'month' ? 'this month vs last month' : period === 'quarter' ? 'this quarter vs last' : 'this year vs last year';

    // Determine primary cause and severity
    const incomeDropped  = cur.income  < prv.income;
    const expenseRose    = cur.expense > prv.expense;
    const profitDropped  = cur.profit  < prv.profit;
    const marginBad      = cur.margin  < target;
    const biggestExpCat  = expenseDrivers.find(d => d.change > 0);
    const biggestIncDrop = incomeDrivers.find(d => d.change < 0);

    let severity: RootCauseAnalysis['severity'] = 'positive';
    if (profitDropped && cur.profit < 0) severity = 'critical';
    else if (profitDropped || marginBad) severity = 'warning';
    else if (Math.abs(profitChangePct) < 5) severity = 'neutral';

    let primaryCause = 'Business is performing well — profit improved this period.';
    if (incomeDropped && expenseRose) primaryCause = `Double pressure: revenue fell while costs rose.`;
    else if (incomeDropped && biggestIncDrop) primaryCause = `Revenue dropped — ${biggestIncDrop.category} is down ${currency}${Math.abs(biggestIncDrop.change).toLocaleString()}.`;
    else if (expenseRose && biggestExpCat) primaryCause = `Costs increased — ${biggestExpCat.category} rose ${currency}${biggestExpCat.change.toLocaleString()} (${biggestExpCat.changePct.toFixed(0)}%).`;
    else if (!profitDropped) primaryCause = `Profit improved by ${currency}${Math.abs(profitChange).toLocaleString()} — driven by ${incomeDrivers[0]?.category ?? 'higher revenue'}.`;

    // Diagnosis — 2–4 plain English sentences
    const diagnosis: string[] = [];

    if (current.length === 0 && previous.length === 0) {
        diagnosis.push('Not enough data yet for this period. Add transactions to see analysis.');
    } else {
        const profitDir = profitDropped ? `fell by ${currency}${Math.abs(profitChange).toLocaleString()} (${Math.abs(profitChangePct).toFixed(1)}%)` : `grew by ${currency}${Math.abs(profitChange).toLocaleString()} (${Math.abs(profitChangePct).toFixed(1)}%)`;
        diagnosis.push(`Profit ${profitDir} ${periodLabel}.`);

        if (incomeDropped) {
            const biggest = biggestIncDrop;
            diagnosis.push(`Revenue fell from ${currency}${prv.income.toLocaleString()} to ${currency}${cur.income.toLocaleString()}${biggest ? ` — the biggest drop was in ${biggest.category} (down ${currency}${Math.abs(biggest.change).toLocaleString()})` : ''}.`);
        } else if (cur.income > prv.income) {
            const biggest = incomeDrivers.find(d => d.change > 0);
            diagnosis.push(`Revenue grew from ${currency}${prv.income.toLocaleString()} to ${currency}${cur.income.toLocaleString()}${biggest ? ` — ${biggest.category} led the growth (up ${currency}${biggest.change.toLocaleString()})` : ''}.`);
        }

        if (expenseRose) {
            const biggest = biggestExpCat;
            diagnosis.push(`Operating costs rose from ${currency}${prv.expense.toLocaleString()} to ${currency}${cur.expense.toLocaleString()}${biggest ? ` — ${biggest.category} increased the most (up ${currency}${biggest.change.toLocaleString()}, ${biggest.changePct.toFixed(0)}%)` : ''}.`);
        } else if (cur.expense < prv.expense) {
            diagnosis.push(`Costs fell from ${currency}${prv.expense.toLocaleString()} to ${currency}${cur.expense.toLocaleString()} — good cost discipline this period.`);
        }

        if (marginBad) {
            diagnosis.push(`Your profit margin is ${cur.margin.toFixed(1)}%, below your ${target}% target — every ${currency}100 of revenue is only generating ${currency}${cur.margin.toFixed(0)} in profit.`);
        }
    }

    // Recommendations
    const recommendations: string[] = [];

    if (incomeDropped && biggestIncDrop) {
        recommendations.push(`Review ${biggestIncDrop.category}: down ${currency}${Math.abs(biggestIncDrop.change).toLocaleString()} — identify which clients or products stopped contributing.`);
    }
    if (expenseRose && biggestExpCat) {
        recommendations.push(`Audit ${biggestExpCat.category}: costs up ${biggestExpCat.changePct.toFixed(0)}% — negotiate with suppliers or find alternatives.`);
    }
    if (marginBad) {
        const topExp = expenseDrivers[0];
        recommendations.push(`To hit your ${target}% margin target, reduce total costs by ${currency}${Math.max(0, cur.expense - (cur.income * (1 - target / 100))).toLocaleString()} or increase revenue by ${currency}${Math.max(0, (cur.expense / (1 - target / 100)) - cur.income).toLocaleString()}.`);
        if (topExp) recommendations.push(`Your highest cost category is ${topExp.category} (${currency}${topExp.current.toLocaleString()}) — this is the best lever to pull first.`);
    }
    if (cur.profit < 0) {
        recommendations.push(`You are currently loss-making. To break even, close the ${currency}${Math.abs(cur.profit).toLocaleString()} gap by increasing revenue, cutting costs, or both.`);
    }
    if (incomeDrivers.length === 0 && expenseDrivers.length === 0) {
        recommendations.push('Add more transactions with categories to unlock detailed root cause analysis.');
    }
    if (recommendations.length === 0) {
        recommendations.push('Performance is solid. Focus on maintaining cost discipline and growing your top revenue categories.');
        recommendations.push('Consider reinvesting surplus profit into marketing or capacity to sustain growth.');
    }

    return {
        period: periodLabel,
        currentIncome: cur.income,
        previousIncome: prv.income,
        currentExpense: cur.expense,
        previousExpense: prv.expense,
        currentProfit: cur.profit,
        previousProfit: prv.profit,
        profitChange,
        profitChangePct,
        incomeDrivers,
        expenseDrivers,
        primaryCause,
        diagnosis,
        recommendations,
        severity,
    };
}

// ─── Scenario modelling ────────────────────────────────────────────────────────
export interface ScenarioResult {
    label: string;
    baseProfit: number;
    newProfit: number;
    profitImpact: number;
    baseMargin: number;
    newMargin: number;
    baseCashRunway: number;
    newCashRunway: number;
    breakEvenRevenue: number;
    verdict: string;
    risks: string[];
    opportunities: string[];
}

export function modelHireStaff(
    finance: FinanceData,
    monthlySalary: number,
    currency: string,
): ScenarioResult {
    const annualCost    = monthlySalary * 12;
    const newExpense    = finance.expense + annualCost;
    const newProfit     = finance.income - newExpense;
    const newMargin     = finance.income > 0 ? (newProfit / finance.income) * 100 : 0;
    const baseCash      = finance.expense > 0 ? Math.floor(finance.cashBalance / (finance.expense / 30)) : 999;
    const newMonthlyExp = newExpense / 12;
    const newCashRunway = newMonthlyExp > 0 ? Math.floor(finance.cashBalance / (newMonthlyExp / 30)) : 999;
    const breakEven     = newExpense;

    const revenueNeeded = newExpense - finance.income;
    const affordable    = newProfit > 0;

    return {
        label: `Hire at ${currency}${monthlySalary.toLocaleString()}/month`,
        baseProfit: finance.profit,
        newProfit,
        profitImpact: newProfit - finance.profit,
        baseMargin: finance.margin,
        newMargin,
        baseCashRunway: baseCash,
        newCashRunway,
        breakEvenRevenue: breakEven,
        verdict: affordable
            ? `Affordable — profit remains positive at ${currency}${newProfit.toLocaleString()}. Cash runway drops from ${baseCash} to ${newCashRunway} days.`
            : `Risky — this hire would put you into loss (${currency}${Math.abs(newProfit).toLocaleString()} deficit). You need ${currency}${revenueNeeded.toLocaleString()} more revenue to break even.`,
        risks: [
            affordable
                ? `Cash runway reduces from ${baseCash} to ${newCashRunway} days — keep a revenue buffer.`
                : `You would be loss-making until revenue increases by ${currency}${revenueNeeded.toLocaleString()}.`,
            `Fixed cost commitment — salary continues even if revenue dips.`,
        ],
        opportunities: [
            `If this hire generates ${currency}${(monthlySalary * 2).toLocaleString()}/month in new revenue, ROI is 100%.`,
            affordable ? `Remaining profit of ${currency}${newProfit.toLocaleString()} gives a buffer for growth.` : `Consider a part-time hire at ${currency}${Math.round(monthlySalary * 0.5).toLocaleString()}/month first.`,
        ],
    };
}

export function modelRevenueChange(
    finance: FinanceData,
    changePercent: number,
    currency: string,
): ScenarioResult {
    const newIncome    = finance.income * (1 + changePercent / 100);
    const newProfit    = newIncome - finance.expense;
    const newMargin    = newIncome > 0 ? (newProfit / newIncome) * 100 : 0;
    const baseCash     = finance.expense > 0 ? Math.floor(finance.cashBalance / (finance.expense / 30)) : 999;
    const newCashBal   = finance.cashBalance + (newProfit - finance.profit);
    const newCashRunway = finance.expense > 0 ? Math.floor(newCashBal / (finance.expense / 30)) : 999;
    const dir          = changePercent >= 0 ? 'increase' : 'decrease';

    return {
        label: `Revenue ${changePercent >= 0 ? '+' : ''}${changePercent}%`,
        baseProfit: finance.profit,
        newProfit,
        profitImpact: newProfit - finance.profit,
        baseMargin: finance.margin,
        newMargin,
        baseCashRunway: baseCash,
        newCashRunway: Math.max(0, newCashRunway),
        breakEvenRevenue: finance.expense,
        verdict: newProfit >= 0
            ? `A ${Math.abs(changePercent)}% revenue ${dir} brings profit to ${currency}${newProfit.toLocaleString()} with a ${newMargin.toFixed(1)}% margin.`
            : `A ${Math.abs(changePercent)}% revenue ${dir} would push you into loss (${currency}${Math.abs(newProfit).toLocaleString()} deficit). Immediate cost action needed.`,
        risks: changePercent < 0
            ? [
                `Cash runway drops to ${Math.max(0, newCashRunway)} days — review all non-essential costs immediately.`,
                newProfit < 0 ? `Loss of ${currency}${Math.abs(newProfit).toLocaleString()} — identify which costs can be reduced to restore profitability.` : `Margin compresses from ${finance.margin.toFixed(1)}% to ${newMargin.toFixed(1)}%.`,
              ]
            : [`Ensure operations can handle increased volume without proportional cost increases.`],
        opportunities: changePercent > 0
            ? [`Additional ${currency}${(newProfit - finance.profit).toLocaleString()} profit can be reinvested in growth.`, `Use surplus to build cash reserve above minimum threshold.`]
            : [`A revenue drop is the time to review your top 3 expense categories for quick cuts.`, `Focus on retaining existing high-value customers before acquiring new ones.`],
    };
}

export function modelNewLoan(
    finance: FinanceData,
    principal: number,
    annualRatePercent: number,
    termMonths: number,
    currency: string,
): ScenarioResult {
    const monthlyRate   = annualRatePercent / 100 / 12;
    const monthlyPayment = monthlyRate > 0
        ? (principal * monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / (Math.pow(1 + monthlyRate, termMonths) - 1)
        : principal / termMonths;
    const annualPayment = monthlyPayment * 12;
    const totalRepay    = monthlyPayment * termMonths;
    const totalInterest = totalRepay - principal;

    const newExpense    = finance.expense + annualPayment;
    const newProfit     = finance.income - newExpense;
    const newMargin     = finance.income > 0 ? (newProfit / finance.income) * 100 : 0;
    const baseCash      = finance.expense > 0 ? Math.floor(finance.cashBalance / (finance.expense / 30)) : 999;
    const newMonthlyExp = newExpense / 12;
    const newCashRunway = newMonthlyExp > 0 ? Math.floor(finance.cashBalance / (newMonthlyExp / 30)) : 999;

    const dscr = annualPayment > 0 ? finance.income / annualPayment : 999;

    return {
        label: `Loan ${currency}${principal.toLocaleString()} @ ${annualRatePercent}%`,
        baseProfit: finance.profit,
        newProfit,
        profitImpact: newProfit - finance.profit,
        baseMargin: finance.margin,
        newMargin,
        baseCashRunway: baseCash,
        newCashRunway: Math.max(0, newCashRunway),
        breakEvenRevenue: newExpense,
        verdict: dscr >= 1.25
            ? `Manageable — monthly repayment of ${currency}${Math.round(monthlyPayment).toLocaleString()} is covered by income (DSCR: ${dscr.toFixed(2)}). Total interest cost: ${currency}${Math.round(totalInterest).toLocaleString()}.`
            : dscr >= 1
            ? `Tight — monthly repayment of ${currency}${Math.round(monthlyPayment).toLocaleString()} is just covered (DSCR: ${dscr.toFixed(2)}). Any revenue dip would cause repayment issues.`
            : `Dangerous — monthly repayment of ${currency}${Math.round(monthlyPayment).toLocaleString()} exceeds what the business can cover (DSCR: ${dscr.toFixed(2)}). Do not take this loan without increasing revenue first.`,
        risks: [
            `Monthly repayment: ${currency}${Math.round(monthlyPayment).toLocaleString()} for ${termMonths} months`,
            `Total interest cost: ${currency}${Math.round(totalInterest).toLocaleString()}`,
            dscr < 1.25 ? `DSCR of ${dscr.toFixed(2)} is below the safe threshold of 1.25` : `DSCR of ${dscr.toFixed(2)} — comfortably above safe threshold`,
        ],
        opportunities: [
            `If ${currency}${principal.toLocaleString()} generates ${currency}${(principal * 0.2).toLocaleString()} in additional annual profit, ROI covers the interest.`,
            `Use the capital for revenue-generating activities — equipment, stock, or marketing with measurable return.`,
        ],
    };
}

export function modelPriceIncrease(
    finance: FinanceData,
    increasePercent: number,
    currency: string,
): ScenarioResult {
    const newIncome  = finance.income * (1 + increasePercent / 100);
    const newProfit  = newIncome - finance.expense;
    const newMargin  = newIncome > 0 ? (newProfit / newIncome) * 100 : 0;
    const baseCash   = finance.expense > 0 ? Math.floor(finance.cashBalance / (finance.expense / 30)) : 999;

    return {
        label: `Price increase +${increasePercent}%`,
        baseProfit: finance.profit,
        newProfit,
        profitImpact: newProfit - finance.profit,
        baseMargin: finance.margin,
        newMargin,
        baseCashRunway: baseCash,
        newCashRunway: baseCash,
        breakEvenRevenue: finance.expense,
        verdict: `A ${increasePercent}% price increase (assuming same volume) adds ${currency}${(newProfit - finance.profit).toLocaleString()} in profit, lifting margin from ${finance.margin.toFixed(1)}% to ${newMargin.toFixed(1)}%.`,
        risks: [
            `Some customers may switch to cheaper alternatives — model assumes same sales volume.`,
            `If volume drops by more than ${increasePercent}%, revenue will actually fall.`,
        ],
        opportunities: [
            `Even a ${increasePercent / 2}% price increase with no volume loss improves margin by ${((newMargin - finance.margin) / 2).toFixed(1)}%.`,
            `Combine with added value (better service, quality, speed) to justify the increase and retain customers.`,
        ],
    };
}

export function modelNewProduct(
    finance: FinanceData,
    productName: string,
    pricePerUnit: number,
    costPerUnit: number,
    unitsSoldPerMonth: number,
    currency: string,
): ScenarioResult {
    const monthlyRevenue = pricePerUnit * unitsSoldPerMonth;
    const monthlyCost    = costPerUnit * unitsSoldPerMonth;
    const annualRevenue  = monthlyRevenue * 12;
    const annualCost     = monthlyCost * 12;
    const newIncome      = finance.income + annualRevenue;
    const newExpense     = finance.expense + annualCost;
    const newProfit      = newIncome - newExpense;
    const newMargin      = newIncome > 0 ? (newProfit / newIncome) * 100 : 0;
    const baseCash       = finance.expense > 0 ? Math.floor(finance.cashBalance / (finance.expense / 30)) : 999;
    const newMonthlyExp  = newExpense / 12;
    const newCashRunway  = newMonthlyExp > 0 ? Math.floor(finance.cashBalance / (newMonthlyExp / 30)) : 999;
    const grossMarginPct = pricePerUnit > 0 ? ((pricePerUnit - costPerUnit) / pricePerUnit) * 100 : 0;
    const good           = newProfit > finance.profit;

    return {
        label: `New product: ${productName}`,
        baseProfit: finance.profit,
        newProfit,
        profitImpact: newProfit - finance.profit,
        baseMargin: finance.margin,
        newMargin,
        baseCashRunway: baseCash,
        newCashRunway,
        breakEvenRevenue: newExpense,
        verdict: good
            ? `Selling ${unitsSoldPerMonth} units/month of ${productName} adds ${currency}${Math.round(annualRevenue - annualCost).toLocaleString()} annual profit (${grossMarginPct.toFixed(0)}% gross margin).`
            : `The cost of producing ${productName} outweighs the revenue — review your pricing or unit cost.`,
        risks: [
            `Assumes ${unitsSoldPerMonth} units sold every month — actual demand may vary.`,
            costPerUnit > 0 && pricePerUnit < costPerUnit * 1.2 ? `Gross margin of ${grossMarginPct.toFixed(0)}% is thin — small cost rises could wipe profit.` : `Track actual unit cost as volume grows.`,
        ].filter(Boolean) as string[],
        opportunities: [
            `At ${unitsSoldPerMonth} units/month, you hit break-even at ${Math.ceil(newExpense / (pricePerUnit * 12))} units/month.`,
            `Each extra unit sold adds ${currency}${(pricePerUnit - costPerUnit).toLocaleString()} directly to profit.`,
        ],
    };
}

export function modelCostCut(
    finance: FinanceData,
    categoryName: string,
    cutAmount: number,
    currency: string,
): ScenarioResult {
    const newExpense = Math.max(0, finance.expense - cutAmount);
    const newProfit  = finance.income - newExpense;
    const newMargin  = finance.income > 0 ? (newProfit / finance.income) * 100 : 0;
    const baseCash   = finance.expense > 0 ? Math.floor(finance.cashBalance / (finance.expense / 30)) : 999;
    const newMonthlyExp = newExpense / 12;
    const newCashRunway = newMonthlyExp > 0 ? Math.floor(finance.cashBalance / (newMonthlyExp / 30)) : 999;

    return {
        label: `Cut ${categoryName} by ${currency}${cutAmount.toLocaleString()}`,
        baseProfit: finance.profit,
        newProfit,
        profitImpact: newProfit - finance.profit,
        baseMargin: finance.margin,
        newMargin,
        baseCashRunway: baseCash,
        newCashRunway,
        breakEvenRevenue: newExpense,
        verdict: `Cutting ${currency}${cutAmount.toLocaleString()} from ${categoryName} improves profit by ${currency}${cutAmount.toLocaleString()}, lifting margin from ${finance.margin.toFixed(1)}% to ${newMargin.toFixed(1)}%.`,
        risks: [
            `Ensure cut doesn't reduce service quality or capacity to generate revenue.`,
            `One-time cuts don't solve structural cost problems — review if this is recurring spend.`,
        ],
        opportunities: [
            `Every ${currency}1 saved in costs goes directly to profit — this is the highest-impact lever for margin improvement.`,
            `Redirect saved ${currency}${cutAmount.toLocaleString()} into revenue-generating activities for compound effect.`,
        ],
    };
}
