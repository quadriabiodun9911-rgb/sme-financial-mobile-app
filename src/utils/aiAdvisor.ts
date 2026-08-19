/**
 * AI Advisor -- a genuine LLM-backed conversational advisor (Anthropic
 * Claude, called server-side so the API key never reaches the client).
 *
 * The model is never handed raw access to the app's data store; it's given
 * exactly the same real, already-computed figures the rest of Quad360
 * surfaces (health score, cash position, risk radar, goals, etc.), packed
 * into AdvisorContext by buildAdvisorContext below. It's instructed
 * (backend/routes/advisor.js) to answer only from that data -- never to
 * fabricate a number, matching every other engine in this app.
 *
 * Lives on the CFO Questions tab (not the Dashboard, which is already dense
 * with cards) -- takes already-computed diagnosis/riskRadar rather than raw
 * transactions, reusing the exact same call shape CFOQuestionsTab and
 * DashboardScreen already use for those two engines.
 */

import { apiFetch } from './api';
import { FinanceData, BusinessSettings, FinancialGoal, CapitalCommitment } from '../types';
import { DiagnosisResult } from './financialDiagnosisEngine';
import { RiskRadar } from './riskRadar';

export interface AdvisorContext {
    currency: string;
    cashBalance: number;
    reserveTarget: number;
    healthScore: number;
    healthStatus: 'critical' | 'warning' | 'healthy';
    narrativeSummary: string;
    topOpportunities: string[];
    riskRadar: { overallLevel: string; topRisks: { label: string; level: string; summary: string }[] };
    goals: { title: string; type: string; progress: number; status: string; currentValue: number; targetValue: number; unit: string }[];
    capitalCommitments: { name: string; amountApproved: number; status: string }[];
}

export function buildAdvisorContext(
    finance: FinanceData,
    settings: BusinessSettings,
    diagnosis: DiagnosisResult,
    riskRadar: RiskRadar,
    goals: FinancialGoal[],
    capitalCommitments: CapitalCommitment[],
): AdvisorContext {
    return {
        currency: settings.currency,
        cashBalance: finance.cashBalance,
        reserveTarget: parseFloat(settings.minReserve) || 0,
        healthScore: diagnosis.overallHealth,
        healthStatus: diagnosis.healthStatus,
        narrativeSummary: diagnosis.narrativeSummary,
        topOpportunities: diagnosis.topOpportunities,
        riskRadar: {
            overallLevel: riskRadar.overallLevel,
            topRisks: riskRadar.topRisks.map(r => ({ label: r.label, level: r.level, summary: r.summary })),
        },
        goals: goals.map(g => ({ title: g.title, type: g.type, progress: g.progress, status: g.status, currentValue: g.currentValue, targetValue: g.targetValue, unit: g.unit })),
        capitalCommitments: capitalCommitments.map(c => ({ name: c.name, amountApproved: c.amountApproved, status: c.status })),
    };
}

export async function askAdvisor(question: string, context: AdvisorContext): Promise<string> {
    const res = await apiFetch('/api/advisor/ask', {
        method: 'POST',
        body: JSON.stringify({ question, context }),
    });
    return res.answer;
}
