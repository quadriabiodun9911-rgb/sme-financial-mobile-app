/**
 * AI Advisor -- a genuine LLM-backed conversational advisor (Anthropic
 * Claude, called from a Supabase Edge Function so the API key never reaches
 * the client). Quad360's /backend Express app was never actually deployed
 * anywhere by this project's owner (no Render, no Vercel project for it) --
 * Supabase is the real backend infrastructure here, matching the existing
 * supabase/functions/delete-account pattern, so this calls
 * supabase.functions.invoke('advisor') rather than a separate HTTP backend.
 *
 * The model is never handed raw access to the app's data store; it's given
 * exactly the same real, already-computed figures the rest of Quad360
 * surfaces (health score, cash position, risk radar, goals, etc.), packed
 * into AdvisorContext by buildAdvisorContext below. It's instructed
 * (supabase/functions/advisor/index.ts) to answer only from that data --
 * never to fabricate a number, matching every other engine in this app.
 *
 * Lives on the CFO Questions tab (not the Dashboard, which is already dense
 * with cards) -- takes already-computed diagnosis/riskRadar rather than raw
 * transactions, reusing the exact same call shape CFOQuestionsTab and
 * DashboardScreen already use for those two engines.
 */

import { supabase } from './supabase';
import { FinanceData, BusinessSettings, FinancialGoal, CapitalCommitment } from '../types';
import { DiagnosisResult } from './financialDiagnosisEngine';
import { RiskRadar } from './riskRadar';
import { BehavioralProfile } from './behavioralProfile';

export interface AdvisorContext {
    currency: string;
    cashBalance: number;
    // null (not 0) when the owner has never set one in Settings -- a real
    // 0 target and "never set" both used to arrive here as the same number,
    // so a question like "am I above my reserve target?" could get a
    // confidently reassuring answer grounded in a target the owner never
    // actually chose. The system prompt (advisor edge function) already
    // tells the model to say so plainly instead of assuming a value for
    // any field that's genuinely absent.
    reserveTarget: number | null;
    healthScore: number;
    healthStatus: 'critical' | 'warning' | 'healthy';
    narrativeSummary: string;
    topOpportunities: string[];
    riskRadar: { overallLevel: string; topRisks: { label: string; level: string; summary: string }[] };
    goals: { title: string; type: string; progress: number; status: string; currentValue: number; targetValue: number; unit: string }[];
    capitalCommitments: { name: string; amountApproved: number; status: string }[];
    // Optional: the same "what's happening / what's likely / what to do /
    // what capital fits" chain Business Passport shows (see
    // behavioralProfile.ts) -- covers pattern signals (seasonality, growth
    // quality, cost trajectory, financing fit) the diagnosis/riskRadar
    // fields above don't. Kept to compact strings, not the full sub-engine
    // results, so it stays well inside the edge function's context-size
    // limit. Omitted when the caller doesn't have enough history to build
    // one (undefined, never a fabricated placeholder).
    behavioralProfile?: {
        narrative: string;
        whatsHappening: string[];
        whatsLikely: string[];
        whatToDo: string[];
        capitalFit: { label: string; reason: string }[];
    };
}

export function buildAdvisorContext(
    finance: FinanceData,
    settings: BusinessSettings,
    diagnosis: DiagnosisResult,
    riskRadar: RiskRadar,
    goals: FinancialGoal[],
    capitalCommitments: CapitalCommitment[],
    behavioralProfile?: BehavioralProfile | null,
): AdvisorContext {
    return {
        currency: settings.currency,
        cashBalance: finance.cashBalance,
        reserveTarget: (() => {
            if (!settings.minReserve || !settings.minReserve.trim()) return null;
            const parsed = parseFloat(settings.minReserve);
            return isNaN(parsed) ? null : parsed;
        })(),
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
        ...(behavioralProfile && behavioralProfile.available ? {
            behavioralProfile: {
                narrative: behavioralProfile.narrative,
                whatsHappening: behavioralProfile.whatsHappening,
                whatsLikely: behavioralProfile.whatsLikely,
                whatToDo: behavioralProfile.whatToDo,
                capitalFit: behavioralProfile.capitalFit.map(r => ({ label: r.label, reason: r.reasons[0] })),
            },
        } : {}),
    };
}

export async function askAdvisor(question: string, context: AdvisorContext): Promise<string> {
    const { data, error } = await supabase.functions.invoke('advisor', {
        body: { question, context },
    });
    if (error) {
        // FunctionsHttpError carries the real Response on .context -- the
        // edge function always replies with a JSON { error } body (see
        // supabase/functions/advisor), so surface that message instead of
        // the generic "Edge Function returned a non-2xx status code".
        // .context is only a real Response for an actual HTTP error reply;
        // a network-level failure (e.g. unreachable Supabase project) sets
        // it to something else, so check for a real .json() before calling
        // it instead of throwing a confusing "not a function" error.
        const errResponse = (error as { context?: Response }).context;
        if (errResponse && typeof errResponse.json === 'function') {
            const body = await errResponse.json().catch(() => null);
            if (body?.error) throw new Error(body.error);
        }
        throw new Error(error.message || 'Could not reach the AI Advisor.');
    }
    return data.answer;
}
