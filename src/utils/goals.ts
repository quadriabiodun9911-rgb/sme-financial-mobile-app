import {
    FinancialGoal, GoalType, GoalStatus, GoalStrategy,
    StrategyAction, FinanceData, Transaction, BusinessSettings,
} from '../types';
import { getTopCategories } from './finance';

// ─── Goal progress computation ────────────────────────────────────────────────

export function computeGoalCurrent(
    goal: FinancialGoal,
    finance: FinanceData,
    transactions: Transaction[],
): number {
    switch (goal.type) {
        case 'revenue_growth': return finance.income;
        case 'margin_improvement': return parseFloat(finance.margin.toFixed(2));
        case 'cost_reduction': return finance.expense;
        case 'cash_reserve': return finance.cashBalance;
        case 'reduce_overdue_ar': {
            const overdue = transactions.filter(t => t.type === 'income' && t.status === 'overdue');
            return overdue.reduce((s, t) => s + t.amount, 0);
        }
        case 'custom': return goal.currentValue;
        default: return 0;
    }
}

export function computeGoalProgress(goal: FinancialGoal): number {
    const { type, baselineValue, targetValue, currentValue } = goal;

    if (type === 'cost_reduction' || type === 'reduce_overdue_ar') {
        const needed = baselineValue - targetValue;
        if (!isFinite(needed) || needed <= 0) return currentValue <= targetValue ? 100 : 0;
        const achieved = baselineValue - currentValue;
        const pct = (achieved / needed) * 100;
        return isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
    }

    const needed = targetValue - baselineValue;
    if (!isFinite(needed) || needed <= 0) return currentValue >= targetValue ? 100 : 0;
    const achieved = currentValue - baselineValue;
    const pct = (achieved / needed) * 100;
    return isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
}

export function computeGoalStatus(goal: FinancialGoal): GoalStatus {
    const { progress, deadline } = goal;
    if (progress >= 100) return 'achieved';

    const today = new Date();
    const due = new Date(deadline);
    const created = new Date(goal.createdAt);

    const totalDays = Math.max(1, (due.getTime() - created.getTime()) / 86400000);
    const elapsedDays = (today.getTime() - created.getTime()) / 86400000;
    const expectedProgress = Math.min(100, (elapsedDays / totalDays) * 100);

    const lag = expectedProgress - progress;
    if (lag <= 10) return 'on_track';
    if (lag <= 30) return 'at_risk';
    return 'off_track';
}

export function refreshGoal(
    goal: FinancialGoal,
    finance: FinanceData,
    transactions: Transaction[],
): FinancialGoal {
    const currentValue = computeGoalCurrent(goal, finance, transactions);
    const updated = { ...goal, currentValue };
    const progress = computeGoalProgress(updated);
    const status = computeGoalStatus({ ...updated, progress });
    return { ...updated, progress, status };
}

// ─── Strategy generation ──────────────────────────────────────────────────────

export function generateStrategy(
    goal: FinancialGoal,
    finance: FinanceData,
    transactions: Transaction[],
    settings: BusinessSettings,
): GoalStrategy {
    const { currency } = settings;
    const actions: StrategyAction[] = [];
    const topExpenses = getTopCategories(transactions, 'expense', 3);
    const topIncome = getTopCategories(transactions, 'income', 3);
    const overdueAR = transactions.filter(t => t.type === 'income' && t.status === 'overdue');
    const overdueARTotal = overdueAR.reduce((s, t) => s + t.amount, 0);

    switch (goal.type) {

        case 'revenue_growth': {
            const gap = goal.targetValue - finance.income;
            actions.push({
                priority: 'high',
                title: 'Close the revenue gap',
                detail: `You need ${currency}${Math.max(0, gap).toLocaleString()} more in revenue to hit your target. Focus efforts on your top income category first.`,
                metric: `Current: ${currency}${finance.income.toLocaleString()} / Target: ${currency}${goal.targetValue.toLocaleString()}`,
            });
            if (topIncome.length > 0) {
                actions.push({
                    priority: 'high',
                    title: `Double down on "${topIncome[0].category}"`,
                    detail: `This is your highest-revenue category (${currency}${topIncome[0].amount.toLocaleString()}). Expand capacity, upsell, or acquire new customers in this segment.`,
                    metric: `Top revenue source`,
                });
            }
            if (topIncome.length < 3) {
                actions.push({
                    priority: 'medium',
                    title: 'Diversify income sources',
                    detail: 'You have fewer than 3 active income categories. Adding new revenue streams reduces concentration risk and opens growth paths.',
                });
            }
            actions.push({
                priority: 'medium',
                title: 'Accelerate invoicing and collections',
                detail: overdueARTotal > 0
                    ? `You have ${currency}${overdueARTotal.toLocaleString()} in overdue receivables. Collecting these immediately counts toward your revenue target.`
                    : 'Send invoices within 24 hours of delivery and follow up on any outstanding payments weekly.',
                metric: overdueARTotal > 0 ? `Overdue AR: ${currency}${overdueARTotal.toLocaleString()}` : undefined,
            });
            actions.push({
                priority: 'low',
                title: 'Review pricing',
                detail: `Your current profit margin is ${finance.margin.toFixed(1)}%. If margin is healthy, consider modest price increases (5–10%) to grow revenue without adding volume.`,
                metric: `Margin: ${finance.margin.toFixed(1)}%`,
            });
            break;
        }

        case 'margin_improvement': {
            const marginGap = goal.targetValue - finance.margin;
            actions.push({
                priority: 'high',
                title: 'Identify your largest cost levers',
                detail: `Your margin needs to improve by ${marginGap.toFixed(1)} percentage points. The fastest path is reducing your top expense categories.`,
                metric: `Current margin: ${finance.margin.toFixed(1)}% / Target: ${goal.targetValue}%`,
            });
            topExpenses.forEach((exp, i) => {
                const reductionNeeded = exp.amount * (marginGap / 100);
                actions.push({
                    priority: i === 0 ? 'high' : 'medium',
                    title: `Reduce "${exp.category}" costs`,
                    detail: `This category costs ${currency}${exp.amount.toLocaleString()}. A 10% reduction saves ${currency}${(exp.amount * 0.1).toLocaleString()} and adds ~${((exp.amount * 0.1 / Math.max(1, finance.income)) * 100).toFixed(1)} pts to margin.`,
                    metric: `Spend: ${currency}${exp.amount.toLocaleString()}`,
                });
            });
            actions.push({
                priority: 'medium',
                title: 'Increase revenue without increasing costs',
                detail: 'Adding revenue on your existing cost base directly expands margin. Focus on digital or scalable delivery channels if available.',
            });
            actions.push({
                priority: 'low',
                title: 'Audit fixed vs variable costs',
                detail: 'Reclassify costs into fixed and variable. Eliminate or reduce underperforming fixed costs — they drag margin regardless of revenue.',
            });
            break;
        }

        case 'cost_reduction': {
            const savingNeeded = finance.expense - goal.targetValue;
            actions.push({
                priority: 'high',
                title: 'Set a spending budget per category',
                detail: `You need to cut ${currency}${Math.max(0, savingNeeded).toLocaleString()} in total costs. Assign monthly caps to each expense category and review weekly.`,
                metric: `Current expenses: ${currency}${finance.expense.toLocaleString()} / Target: ${currency}${goal.targetValue.toLocaleString()}`,
            });
            topExpenses.forEach((exp, i) => {
                actions.push({
                    priority: i === 0 ? 'high' : 'medium',
                    title: `Cut "${exp.category}" by 15%`,
                    detail: `A 15% reduction saves ${currency}${(exp.amount * 0.15).toLocaleString()}. Renegotiate contracts, reduce frequency, or find cheaper alternatives.`,
                    metric: `Current: ${currency}${exp.amount.toLocaleString()}`,
                });
            });
            actions.push({
                priority: 'medium',
                title: 'Eliminate recurring low-value expenses',
                detail: 'Review all subscriptions and recurring expenses. Cancel anything that doesn\'t directly contribute to revenue or operations.',
            });
            actions.push({
                priority: 'low',
                title: 'Negotiate supplier terms',
                detail: 'Request extended payment terms (net 60 vs net 30) and volume discounts from your top 3 suppliers.',
            });
            break;
        }

        case 'cash_reserve': {
            const shortfall = goal.targetValue - finance.cashBalance;
            actions.push({
                priority: 'high',
                title: 'Build cash from operations first',
                detail: shortfall > 0
                    ? `You need ${currency}${shortfall.toLocaleString()} more in cash. Prioritise collecting outstanding receivables before seeking external funding.`
                    : `Your cash balance (${currency}${finance.cashBalance.toLocaleString()}) already meets the target.`,
                metric: `Cash balance: ${currency}${finance.cashBalance.toLocaleString()} / Target: ${currency}${goal.targetValue.toLocaleString()}`,
            });
            if (overdueARTotal > 0) {
                actions.push({
                    priority: 'high',
                    title: 'Collect overdue receivables immediately',
                    detail: `You have ${currency}${overdueARTotal.toLocaleString()} in overdue AR across ${overdueAR.length} invoice(s). Recovering even half would materially boost your cash reserve.`,
                    metric: `Overdue AR: ${currency}${overdueARTotal.toLocaleString()}`,
                });
            }
            actions.push({
                priority: 'medium',
                title: 'Reduce your monthly expense run rate',
                detail: `Your current monthly expense is ${currency}${finance.expense.toLocaleString()}. Each ${currency} saved flows directly into your cash reserve.`,
                metric: `Monthly expenses: ${currency}${finance.expense.toLocaleString()}`,
            });
            actions.push({
                priority: 'medium',
                title: 'Set up automated cash sweeping',
                detail: 'Each time your operating account balance exceeds your target reserve, automatically sweep the surplus into a dedicated savings buffer.',
            });
            actions.push({
                priority: 'low',
                title: 'Consider a revolving credit facility',
                detail: 'A pre-approved credit line (not used regularly) acts as a safety net without diluting equity or creating fixed repayment obligations.',
            });
            break;
        }

        case 'reduce_overdue_ar': {
            actions.push({
                priority: 'high',
                title: 'Contact all overdue customers this week',
                detail: `You have ${currency}${overdueARTotal.toLocaleString()} outstanding across ${overdueAR.length} invoice(s). Personal outreach (call, not just email) recovers 2–3× more than automated reminders.`,
                metric: `Overdue AR: ${currency}${overdueARTotal.toLocaleString()}`,
            });
            actions.push({
                priority: 'high',
                title: 'Implement a payment terms policy',
                detail: 'Enforce net-30 terms by default. Require deposits (30–50%) for new clients and send automated payment reminders 7, 3, and 1 day before due dates.',
            });
            actions.push({
                priority: 'medium',
                title: 'Offer early payment incentives',
                detail: 'A 2% discount for payment within 10 days (2/10 net 30) accelerates cash collection and is often cheaper than chasing overdue invoices.',
            });
            actions.push({
                priority: 'medium',
                title: 'Stop delivery to chronic late-payers',
                detail: 'Identify customers with a pattern of late payment. Pause new work until outstanding balances are cleared.',
            });
            actions.push({
                priority: 'low',
                title: 'Review credit terms for high-risk clients',
                detail: 'For clients with a history of delays, switch to upfront payment or shorter net terms (net 15 or net 7).',
            });
            break;
        }

        case 'custom':
        default: {
            actions.push({
                priority: 'high',
                title: 'Define measurable milestones',
                detail: `Break your goal into monthly checkpoints. With ${Math.max(0, Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / (86400000 * 30)))} months remaining, set one sub-target per month.`,
            });
            actions.push({
                priority: 'medium',
                title: 'Review your top financial levers',
                detail: `Revenue is ${currency}${finance.income.toLocaleString()}, expenses are ${currency}${finance.expense.toLocaleString()}, and margin is ${finance.margin.toFixed(1)}%. Identify which lever most directly impacts your goal.`,
            });
            actions.push({
                priority: 'low',
                title: 'Track weekly — not monthly',
                detail: 'Custom goals drift when reviewed infrequently. Log progress weekly and adjust your tactics if you fall behind the pace needed.',
            });
            break;
        }
    }

    return { goalId: goal.id, actions, generatedAt: new Date().toISOString() };
}

// ─── Goal template defaults ───────────────────────────────────────────────────

export function goalDefaults(
    type: GoalType,
    finance: FinanceData,
    settings: BusinessSettings,
    transactions: Transaction[] = [],
): Partial<FinancialGoal> {
    const { currency } = settings;
    switch (type) {
        case 'revenue_growth':
            return {
                title: 'Increase Revenue by 20%',
                description: 'Grow total income by at least 20% within the goal period.',
                targetValue: Math.round(finance.income * 1.2),
                baselineValue: finance.income,
                unit: currency,
                percentTarget: 20,
            };
        case 'margin_improvement':
            return {
                title: 'Improve Profit Margin by 10 pts',
                description: 'Raise profit margin by 10 percentage points through revenue growth and cost discipline.',
                targetValue: parseFloat((finance.margin + 10).toFixed(1)),
                baselineValue: parseFloat(finance.margin.toFixed(1)),
                unit: '%',
                percentTarget: 10,
            };
        case 'cost_reduction':
            return {
                title: 'Reduce Operating Costs by 15%',
                description: 'Cut total business expenses by 15% without impacting revenue.',
                targetValue: Math.round(finance.expense * 0.85),
                baselineValue: finance.expense,
                unit: currency,
                percentTarget: 15,
            };
        case 'cash_reserve':
            return {
                title: `Build Cash Reserve to ${currency}${(parseFloat(settings.minReserve) * 2).toLocaleString()}`,
                description: 'Grow the cash buffer to twice the minimum reserve threshold.',
                targetValue: parseFloat(settings.minReserve) * 2,
                baselineValue: finance.cashBalance,
                unit: currency,
            };
        case 'reduce_overdue_ar': {
            const overdueAR = transactions
                .filter(t => t.type === 'income' && t.status === 'overdue')
                .reduce((s, t) => s + t.amount, 0);
            return {
                title: 'Eliminate Overdue Receivables',
                description: 'Collect all outstanding overdue invoices and keep AR current.',
                targetValue: 0,
                baselineValue: overdueAR,
                unit: currency,
            };
        }
        case 'custom':
        default:
            return {
                title: 'Custom Goal',
                description: 'Define your own financial goal.',
                targetValue: 0,
                baselineValue: 0,
                unit: '%',
            };
    }
}
