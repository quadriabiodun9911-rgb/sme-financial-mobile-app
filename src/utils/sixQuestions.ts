/**
 * The Six Questions — the app's organizing framework. Instead of asking a
 * business owner to map their situation onto a pillar name (Make Money,
 * Protect Money, etc.), this answers the actual question in one line, with
 * a live number pulled from data already in the app, and a status color so
 * the answer is legible at a glance without reading the sentence.
 *
 * Every figure here is delegated to the one canonical implementation used
 * elsewhere (computeMonthlyBaseline, computeCashRunway,
 * computeInventoryValue, computeWorkingCapitalMetrics, analyzeTrend,
 * performFinancialDiagnosis/generateActionPlan) — nothing is recomputed
 * with a different formula that could quietly disagree with the screen
 * it deep-links to.
 */

import { Transaction, Loan, Asset, Invoice, InventoryItem, FinanceData, User } from '../types';
import { computeMonthlyBaseline } from './analysis';
import { computeCashRunway } from './cashRunway';
import { computeInventoryValue } from './stockVelocity';
import { computeWorkingCapitalMetrics, computeAssetCurrentValue } from './finance';
import { analyzeTrend } from './trendAnalysis';
import { performFinancialDiagnosis } from './financialDiagnosisEngine';
import { generateActionPlan } from './actionRecommendationEngine';

export type QuestionStatus = 'good' | 'warning' | 'danger' | 'unknown';

export interface QuestionAnswer {
    id: 'money' | 'cash' | 'tiedUp' | 'health' | 'funding' | 'next';
    emoji: string;
    question: string;
    answer: string;
    status: QuestionStatus;
    screen: string;
}

export interface SixQuestions {
    questions: QuestionAnswer[];
}

export function buildSixQuestions(
    transactions: Transaction[],
    loans: Loan[],
    assets: Asset[],
    invoices: Invoice[],
    inventory: InventoryItem[],
    finance: FinanceData,
    user: User | null | undefined,
    currency: string,
): SixQuestions {
    const fmt = (n: number) => `${currency}${Math.round(n).toLocaleString()}`;
    const hasHistory = transactions.length > 0;

    // 1. Am I making money?
    const monthly = computeMonthlyBaseline(transactions, finance);
    const money: QuestionAnswer = hasHistory ? {
        id: 'money', emoji: '💰', question: 'Am I making money?',
        answer: `${fmt(monthly.profit)}/mo profit (${monthly.margin.toFixed(0)}% margin)`,
        status: monthly.profit > 0 && monthly.margin >= 15 ? 'good' : monthly.profit > 0 ? 'warning' : 'danger',
        screen: 'clarity',
    } : { id: 'money', emoji: '💰', question: 'Am I making money?', answer: 'Log transactions to find out', status: 'unknown', screen: 'transactions' };

    // 2. Will I run out of cash?
    const runway = computeCashRunway(transactions, finance.cashBalance);
    const cash: QuestionAnswer = hasHistory ? {
        id: 'cash', emoji: '💵', question: 'Will I run out of cash?',
        answer: runway.runwayDays >= 999 ? 'Cash is stable — no burn detected' : `${runway.runwayDays} days of cash left`,
        status: runway.runwayDays >= 999 || runway.runwayDays >= 60 ? 'good' : runway.runwayDays >= 30 ? 'warning' : 'danger',
        screen: 'cashflow',
    } : { id: 'cash', emoji: '💵', question: 'Will I run out of cash?', answer: 'Log transactions to find out', status: 'unknown', screen: 'cashflow' };

    // 3. Where is my money tied up?
    const wc = computeWorkingCapitalMetrics(transactions);
    const inventoryValue = computeInventoryValue(inventory);
    const activeAssetValue = assets.filter(a => a.status === 'active').reduce((s, a) => s + computeAssetCurrentValue(a), 0);
    const tiedUpTotal = inventoryValue + wc.accountsReceivable + activeAssetValue;
    const tiedUp: QuestionAnswer = {
        id: 'tiedUp', emoji: '📦', question: 'Where is my money tied up?',
        answer: tiedUpTotal > 0
            ? `${fmt(tiedUpTotal)} — ${fmt(inventoryValue)} stock, ${fmt(wc.accountsReceivable)} owed to you`
            : 'Nothing tied up in stock or receivables right now',
        status: wc.accountsReceivable > (monthly.income || 1) ? 'warning' : 'good',
        screen: 'inventory',
    };

    // 4. Is my business getting healthier?
    const trend = analyzeTrend(transactions);
    const health: QuestionAnswer = trend.monthly.length >= 2 ? {
        id: 'health', emoji: '📈', question: 'Is my business getting healthier?',
        answer: trend.yoyRevenueGrowthPct !== null
            ? `Revenue ${trend.yoyRevenueGrowthPct >= 0 ? 'up' : 'down'} ${Math.abs(trend.yoyRevenueGrowthPct).toFixed(0)}% year over year`
            : `Avg. margin ${trend.avgMonthlyProfitMargin.toFixed(0)}% over ${trend.monthly.length} recorded months`,
        status: (trend.yoyRevenueGrowthPct ?? 0) >= 0 ? 'good' : 'warning',
        screen: 'financial-dna',
    } : { id: 'health', emoji: '📈', question: 'Is my business getting healthier?', answer: 'Need more recorded months to tell', status: 'unknown', screen: 'financial-dna' };

    // 5. Can I get funding?
    const daysActive = user?.daysActive ?? 0;
    const healthScore = user?.financialHealthScore ?? 0;
    const fundingReady = transactions.length >= 5 && daysActive >= 90 && healthScore >= 50;
    const funding: QuestionAnswer = {
        id: 'funding', emoji: '🏦', question: 'Can I get funding?',
        answer: transactions.length < 5
            ? 'Not enough recorded history yet'
            : fundingReady
                ? `Financial health ${healthScore}/100 — worth checking your credit profile`
                : `Financial health ${healthScore}/100 — building toward funding-ready`,
        status: transactions.length < 5 ? 'unknown' : fundingReady ? 'good' : 'warning',
        screen: 'credit-worthiness',
    };

    // 6. What should I do next?
    let next: QuestionAnswer;
    if (hasHistory) {
        const diagnosis = performFinancialDiagnosis(transactions, invoices, finance.cashBalance, monthly.expense || 1, currency);
        const plan = generateActionPlan(diagnosis, diagnosis.metrics, currency);
        const topAction = plan.immediateActions[0] ?? plan.shortTermActions[0] ?? plan.strategicActions[0];
        next = {
            id: 'next', emoji: '🧠', question: 'What should I do next?',
            answer: topAction ? topAction.title : 'Nothing urgent — keep monitoring your numbers',
            status: plan.immediateActions.length > 0 ? 'warning' : 'good',
            screen: 'action-tracker',
        };
    } else {
        next = { id: 'next', emoji: '🧠', question: 'What should I do next?', answer: 'Log your first transactions to get started', status: 'unknown', screen: 'transactions' };
    }

    return { questions: [money, cash, tiedUp, health, funding, next] };
}
