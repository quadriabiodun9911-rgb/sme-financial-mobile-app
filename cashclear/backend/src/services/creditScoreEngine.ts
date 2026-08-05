import { CreditReadinessResult, DebtRecord, DocumentChecklist, Invoice, PillarKey, PillarScore, Transaction } from '../types';

// Weighted 5-pillar Credit Readiness Score - the proprietary scoring engine
// referenced in the architecture diagram's "Core Services" box. Weights are
// data, not hardcoded logic, so they can be recalibrated per sector/region
// without touching the scoring functions themselves.
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

function scoreRecordIntegrity(txs: Transaction[]): PillarScore {
    const uncategorized = txs.filter((tx) => tx.category === 'Uncategorized').length;
    const ratio = txs.length ? uncategorized / txs.length : 0;
    const score = clampScore(100 - ratio * 100);
    const issues = uncategorized > 0 ? [`${uncategorized} transaction(s) uncategorized`] : [];
    const recommendations = uncategorized > 0 ? ['Review and categorize every uncategorized transaction so your books are audit-ready.'] : [];
    return { key: 'recordIntegrity', label: 'Record Integrity', score, weight: PILLAR_WEIGHTS.recordIntegrity, issues, recommendations };
}

function scoreCashFlowConsistency(txs: Transaction[], invoices: Invoice[]): PillarScore {
    const income = txs.filter((tx) => tx.type === 'income').map((tx) => tx.amount);
    const mean = income.reduce((s, v) => s + v, 0) / (income.length || 1);
    const variance = income.reduce((s, v) => s + (v - mean) ** 2, 0) / (income.length || 1);
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
    const consistencyScore = clampScore(100 - cv * 100);

    const overdueInvoices = invoices.filter((inv) => !inv.paid && new Date(inv.dueDate) < new Date());
    const score = clampScore(consistencyScore - Math.min(30, overdueInvoices.length * 10));

    const issues: string[] = [];
    const recommendations: string[] = [];
    if (cv > 0.4) { issues.push('Revenue swings significantly month to month'); recommendations.push('Diversify your client base or add recurring revenue lines.'); }
    if (overdueInvoices.length > 0) { issues.push(`${overdueInvoices.length} invoice(s) overdue`); recommendations.push('Chase overdue invoices to reduce receivables aging.'); }
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
            recommendations: ['Build history with a small fintech loan repaid on schedule.'],
        };
    }
    const totalPayments = debts.reduce((s, d) => s + d.onTimePayments + d.missedPayments, 0);
    const missed = debts.reduce((s, d) => s + d.missedPayments, 0);
    const onTimeRatio = totalPayments ? 1 - missed / totalPayments : 1;
    const score = clampScore(onTimeRatio * 100);
    const issues = missed > 0 ? [`${missed} missed payment(s) across ${debts.length} lender(s)`] : [];
    const recommendations = missed > 0 ? ['Set up automatic reminders or standing instructions to avoid missed repayments.'] : [];
    return { key: 'debtServiceHistory', label: 'Debt Service History', score, weight: PILLAR_WEIGHTS.debtServiceHistory, issues, recommendations };
}

function scoreBusinessPersonalSeparation(txs: Transaction[]): PillarScore {
    const commingled = txs.filter((tx) => tx.isCommingled).length;
    const ratio = txs.length ? commingled / txs.length : 0;
    const score = clampScore(100 - ratio * 200);
    const issues = commingled > 0 ? [`${commingled} personal transaction(s) found on business wallets`] : [];
    const recommendations = commingled > 0 ? ['Move personal spending to a separate account and pay yourself a fixed owner draw.'] : [];
    return { key: 'businessPersonalSeparation', label: 'Business-Personal Separation', score, weight: PILLAR_WEIGHTS.businessPersonalSeparation, issues, recommendations };
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
    if (!docs.hasFinancialStatements) { issues.push('Financial statements missing'); recommendations.push('Generate a lender-ready financial report.'); }
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
    businessId: string,
    txs: Transaction[],
    invoices: Invoice[],
    debts: DebtRecord[],
    docs: DocumentChecklist,
): CreditReadinessResult {
    const pillars = [
        scoreRecordIntegrity(txs),
        scoreCashFlowConsistency(txs, invoices),
        scoreDebtServiceHistory(debts),
        scoreBusinessPersonalSeparation(txs),
        scoreDocumentCompleteness(docs),
    ];
    const overallScore = clampScore(pillars.reduce((sum, p) => sum + p.score * p.weight, 0));
    return { businessId, overallScore, band: bandForScore(overallScore), pillars, computedAt: new Date().toISOString() };
}
