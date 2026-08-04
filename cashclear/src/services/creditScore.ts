import { CreditReadinessResult, DebtRecord, Invoice, PillarKey, PillarScore, Transaction } from '../types';

// Weights sum to 1. Tunable per the "dynamic recalibration" note in the
// architecture doc - kept as data so a future model can adjust them per
// sector without changing the scoring logic below.
const PILLAR_WEIGHTS: Record<PillarKey, number> = {
    recordIntegrity: 0.2,
    cashFlowConsistency: 0.25,
    debtServiceHistory: 0.2,
    businessPersonalSeparation: 0.2,
    documentCompleteness: 0.15,
};

function clampScore(score: number): number {
    return Math.max(0, Math.min(100, Math.round(score)));
}

function scoreRecordIntegrity(transactions: Transaction[]): PillarScore {
    const uncategorized = transactions.filter((tx) => tx.category === 'Uncategorized').length;
    const uncategorizedRatio = transactions.length ? uncategorized / transactions.length : 0;
    const score = clampScore(100 - uncategorizedRatio * 100);
    const issues: string[] = [];
    const recommendations: string[] = [];
    if (uncategorized > 0) {
        issues.push(`${uncategorized} transaction${uncategorized > 1 ? 's are' : ' is'} uncategorized`);
        recommendations.push('Review and categorize every uncategorized transaction so your books are audit-ready.');
    }
    return { key: 'recordIntegrity', label: 'Record Integrity', score, weight: PILLAR_WEIGHTS.recordIntegrity, issues, recommendations };
}

function scoreCashFlowConsistency(transactions: Transaction[], invoices: Invoice[]): PillarScore {
    const income = transactions.filter((tx) => tx.type === 'income').map((tx) => tx.amount);
    const mean = income.reduce((s, v) => s + v, 0) / (income.length || 1);
    const variance = income.reduce((s, v) => s + (v - mean) ** 2, 0) / (income.length || 1);
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = mean > 0 ? stdDev / mean : 1;
    const consistencyScore = clampScore(100 - coefficientOfVariation * 100);

    const overdueInvoices = invoices.filter((inv) => !inv.paid && new Date(inv.dueDate) < new Date());
    const overduePenalty = Math.min(30, overdueInvoices.length * 10);
    const score = clampScore(consistencyScore - overduePenalty);

    const issues: string[] = [];
    const recommendations: string[] = [];
    if (coefficientOfVariation > 0.4) {
        issues.push('Revenue swings significantly month to month');
        recommendations.push('Diversify your client base or introduce recurring revenue lines to smooth out income.');
    }
    if (overdueInvoices.length > 0) {
        issues.push(`${overdueInvoices.length} invoice${overdueInvoices.length > 1 ? 's are' : ' is'} overdue`);
        recommendations.push('Chase overdue invoices - aging receivables signal unpredictable cash flow to lenders.');
    }
    return { key: 'cashFlowConsistency', label: 'Cash Flow Consistency', score, weight: PILLAR_WEIGHTS.cashFlowConsistency, issues, recommendations };
}

function scoreDebtServiceHistory(debts: DebtRecord[]): PillarScore {
    if (debts.length === 0) {
        return {
            key: 'debtServiceHistory',
            label: 'Debt Service History',
            score: 60,
            weight: PILLAR_WEIGHTS.debtServiceHistory,
            issues: ['No repayment history on file yet'],
            recommendations: ['Build a track record with a small fintech loan and repay it on schedule to establish history.'],
        };
    }
    const totalPayments = debts.reduce((s, d) => s + d.onTimePayments + d.missedPayments, 0);
    const missed = debts.reduce((s, d) => s + d.missedPayments, 0);
    const onTimeRatio = totalPayments ? 1 - missed / totalPayments : 1;
    const score = clampScore(onTimeRatio * 100);
    const issues: string[] = [];
    const recommendations: string[] = [];
    if (missed > 0) {
        issues.push(`${missed} missed payment${missed > 1 ? 's' : ''} across ${debts.length} lender${debts.length > 1 ? 's' : ''}`);
        recommendations.push('Set up automatic reminders or standing instructions to avoid missed repayments.');
    }
    return { key: 'debtServiceHistory', label: 'Debt Service History', score, weight: PILLAR_WEIGHTS.debtServiceHistory, issues, recommendations };
}

function scoreBusinessPersonalSeparation(transactions: Transaction[]): PillarScore {
    const commingled = transactions.filter((tx) => tx.isCommingled).length;
    const commingledRatio = transactions.length ? commingled / transactions.length : 0;
    const score = clampScore(100 - commingledRatio * 200); // commingling is penalized heavily
    const issues: string[] = [];
    const recommendations: string[] = [];
    if (commingled > 0) {
        issues.push(`${commingled} personal transaction${commingled > 1 ? 's' : ''} found on business wallets`);
        recommendations.push('Move personal spending to a separate personal account, and pay yourself a fixed owner draw instead.');
    }
    return { key: 'businessPersonalSeparation', label: 'Business-Personal Separation', score, weight: PILLAR_WEIGHTS.businessPersonalSeparation, issues, recommendations };
}

export interface DocumentChecklist {
    hasTaxFilings: boolean;
    hasBankStatements: boolean;
    hasBusinessRegistration: boolean;
    hasFinancialStatements: boolean;
}

function scoreDocumentCompleteness(docs: DocumentChecklist): PillarScore {
    const checks = Object.values(docs);
    const completed = checks.filter(Boolean).length;
    const score = clampScore((completed / checks.length) * 100);
    const issues: string[] = [];
    const recommendations: string[] = [];
    if (!docs.hasTaxFilings) { issues.push('Tax filings missing'); recommendations.push('Upload your latest tax filing receipts.'); }
    if (!docs.hasBankStatements) { issues.push('Bank statements missing'); recommendations.push('Connect your bank account so statements sync automatically.'); }
    if (!docs.hasBusinessRegistration) { issues.push('Business registration missing'); recommendations.push('Upload your CAC registration certificate.'); }
    if (!docs.hasFinancialStatements) { issues.push('Financial statements missing'); recommendations.push('Generate a lender-ready financial report from your Cash Flow dashboard.'); }
    return { key: 'documentCompleteness', label: 'Document Completeness', score, weight: PILLAR_WEIGHTS.documentCompleteness, issues, recommendations };
}

function bandForScore(score: number): CreditReadinessResult['band'] {
    if (score >= 85) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 55) return 'Fair';
    if (score >= 35) return 'Needs Work';
    return 'Not Bankable';
}

export function computeCreditReadinessScore(
    transactions: Transaction[],
    invoices: Invoice[],
    debts: DebtRecord[],
    docs: DocumentChecklist,
): CreditReadinessResult {
    const pillars = [
        scoreRecordIntegrity(transactions),
        scoreCashFlowConsistency(transactions, invoices),
        scoreDebtServiceHistory(debts),
        scoreBusinessPersonalSeparation(transactions),
        scoreDocumentCompleteness(docs),
    ];
    const overallScore = clampScore(pillars.reduce((sum, p) => sum + p.score * p.weight, 0));
    return {
        overallScore,
        band: bandForScore(overallScore),
        pillars,
        computedAt: new Date().toISOString(),
    };
}
