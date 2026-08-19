/**
 * Quad360 Business Passport — the financial identity of the business,
 * continuously assembled from what it has already recorded, not something
 * an owner sits down to "prepare" when they need funding.
 *
 * Deliberately a thin aggregation layer over what already exists, not a
 * new engine: Business Identity + Financial Identity come from
 * businessFinancialDNA.ts, Health/Credit Readiness are the same
 * computeRiskScore-derived score used everywhere else in the app (just
 * framed for a lender here), Investment Readiness reuses
 * businessValuation.ts's illustrative range, and Actions reuse
 * performFinancialDiagnosis's own prioritized list. No new score is
 * invented anywhere in this file — that's the point: Quad360 manufactures
 * the evidence, not a fifth competing number.
 *
 * Investment Readiness is deliberately NOT a fabricated 0-100 score.
 * Customer acquisition/retention, market opportunity, management quality,
 * and a capital ask/use-of-funds plan aren't things Quad360 can compute
 * from transaction data — inventing a number that pretends otherwise would
 * be exactly the "manufactured score" this file exists to avoid. Instead
 * it lists what evidence IS available and names what isn't, honestly.
 */

import { Transaction, Invoice, Loan, InventoryItem, Asset, FinanceData, BusinessSettings, User, Budget, StaffMember, FinancialGoal } from '../types';
import { buildBusinessFinancialDNA, BusinessFinancialDNA, detectDNADeviations, DNADeviation } from './businessFinancialDNA';
import { getMonthlyExpenseAverage } from './finance';
import { buildFundingReadinessPack, FundingReadinessPack } from './fundingReadiness';
import { estimateBusinessValuation, ValuationEstimate } from './businessValuation';
import { performFinancialDiagnosis } from './financialDiagnosisEngine';
import { computeDataQuality, DataQuality } from './dataQuality';
import { analyzeTrend } from './trendAnalysis';
import { buildStructuralSnapshot, StructuralSnapshot } from './structuralSnapshot';
import { computeRiskRadar } from './riskRadar';
import { generateActionPlan } from './actionRecommendationEngine';
import { calculateGoalBridge, mapSavedGoalToBridge } from './goalBridgeEngine';
import { assessGoalRisk, GoalRiskAssessment } from './goalRiskLinkage';

// Below this many recorded transactions, a full diagnosis is too thin to
// trust — the Passport falls back to a structural snapshot built from
// whatever else exists (goals, budgets, loans, assets, invoices, stock)
// instead of showing a near-empty page. Same threshold the retired
// ClarityScreen used.
const MIN_TRANSACTIONS_FOR_DIAGNOSIS = 5;

export interface InvestmentReadinessSummary {
    valuation: ValuationEstimate;
    recurringRevenuePct: number;
    yoyRevenueGrowthPct: number | null;
    topCustomerConcentrationPct: number;
    availableSignals: string[];
    missingSignals: string[];
}

export interface BusinessPassport {
    businessName: string;
    generatedAt: string;
    trackRecord: {
        monthsOfRecordedHistory: number;
        dataMaturity: BusinessFinancialDNA['identity']['dataMaturity'];
        dataQuality: DataQuality;
        hasEnoughDataForDiagnosis: boolean;
    };
    // Populated only when hasEnoughDataForDiagnosis is false — a rough
    // picture built from goals/budgets/loans/assets/invoices/stock instead
    // of a near-empty page while transaction history is still thin.
    structuralSnapshot: StructuralSnapshot | null;
    identity: BusinessFinancialDNA['identity'];
    financialIdentity: FundingReadinessPack['profile'] & {
        avgMonthlyRevenue: number;
        avgMonthlyProfitMargin: number;
        revenueVolatility: BusinessFinancialDNA['financial']['revenueVolatility'];
    };
    health: {
        score: number;
        band: FundingReadinessPack['band'];
        categories: FundingReadinessPack['riskProfile'];
    };
    risk: {
        customerConcentrationRisk: BusinessFinancialDNA['risk']['customerConcentrationRisk'];
        supplierConcentrationRisk: BusinessFinancialDNA['risk']['supplierConcentrationRisk'];
        deviations: DNADeviation[];
    };
    creditReadiness: {
        score: number;
        band: FundingReadinessPack['band'];
        documentsReady: number;
        documentsTotal: number;
    };
    investmentReadiness: InvestmentReadinessSummary;
    growth: {
        trend: FundingReadinessPack['trend'];
        yoyRevenueGrowthPct: number | null;
        yoyProfitGrowthPct: number | null;
        marginTrend: BusinessFinancialDNA['risk']['marginTrendDirection'];
    };
    topActions: string[];
    // One connected paragraph tying the trend, worst root cause, and top
    // action together — see generateNarrativeSummary in
    // financialDiagnosisEngine.ts. Empty when there's not enough
    // transaction history for a full diagnosis (see structuralSnapshot).
    narrativeSummary: string;
    // "What could stop this business from reaching its stated goals" —
    // the same real diagnosis + Risk Radar + Goal Bridge pipeline
    // GoalsScreen's Risks tab uses, run per active goal. A lender reading
    // this document sees not just where the business stands today but
    // whether it's steering around its own real risks — empty when there's
    // not enough history for a diagnosis, or no active goals set.
    goalRisks: {
        goalId: string;
        goalTitle: string;
        readinessBand: GoalRiskAssessment['readinessBand'];
        growthReadiness: number;
        narrative: string;
    }[];
}

export function buildBusinessPassport(
    transactions: Transaction[],
    invoices: Invoice[],
    loans: Loan[],
    inventory: InventoryItem[],
    assets: Asset[],
    finance: FinanceData,
    settings: BusinessSettings,
    user: User | null | undefined,
    budgets: Budget[] = [],
    staff: StaffMember[] = [],
    goals: FinancialGoal[] = [],
): BusinessPassport {
    const dna = buildBusinessFinancialDNA(transactions, loans, inventory, finance, settings, user);
    const pack = buildFundingReadinessPack(transactions, invoices, loans, inventory, assets, finance, settings, dna.identity.businessName);
    const deviations = detectDNADeviations(transactions, settings.currency);
    const diagnosis = performFinancialDiagnosis(transactions, invoices, finance.cashBalance, getMonthlyExpenseAverage(finance.expense, transactions), settings.currency, loans, inventory);
    const dataQuality = computeDataQuality(transactions);
    const trend = analyzeTrend(transactions);

    const hasEnoughDataForDiagnosis = transactions.length >= MIN_TRANSACTIONS_FOR_DIAGNOSIS;
    const structuralSnapshot = hasEnoughDataForDiagnosis
        ? null
        : buildStructuralSnapshot(budgets, loans, assets, invoices, inventory, staff, goals);

    const valuation = estimateBusinessValuation(
        dna.financial.avgMonthlyRevenue,
        dna.identity.monthsOfRecordedHistory,
        dna.financial.avgMonthlyProfitMargin,
        dna.financial.yoyRevenueGrowthPct,
        settings.industry,
        settings.currency,
    );

    const activeGoals = goals.filter(g => g.status !== 'achieved');
    const goalRisks = (hasEnoughDataForDiagnosis && activeGoals.length > 0)
        ? (() => {
            const riskRadar = computeRiskRadar(transactions, loans, settings.macroAssumptions ?? []);
            const tactics = generateActionPlan(diagnosis, diagnosis.metrics, settings.currency);
            const allTactics = [...tactics.immediateActions, ...tactics.shortTermActions, ...tactics.strategicActions];
            return activeGoals.map(g => {
                const bridge = calculateGoalBridge(mapSavedGoalToBridge(g), diagnosis.metrics, allTactics, settings.currency);
                const assessment = assessGoalRisk(g.type, diagnosis.diagnoses, riskRadar, bridge.successProbability);
                return {
                    goalId: g.id,
                    goalTitle: g.title,
                    readinessBand: assessment.readinessBand,
                    growthReadiness: assessment.growthReadiness,
                    narrative: assessment.narrative,
                };
            });
        })()
        : [];

    return {
        businessName: dna.identity.businessName,
        generatedAt: new Date().toISOString(),
        trackRecord: {
            monthsOfRecordedHistory: dna.identity.monthsOfRecordedHistory,
            dataMaturity: dna.identity.dataMaturity,
            dataQuality,
            hasEnoughDataForDiagnosis,
        },
        structuralSnapshot,
        identity: dna.identity,
        financialIdentity: {
            ...pack.profile,
            avgMonthlyRevenue: dna.financial.avgMonthlyRevenue,
            avgMonthlyProfitMargin: dna.financial.avgMonthlyProfitMargin,
            revenueVolatility: dna.financial.revenueVolatility,
        },
        health: {
            score: pack.score,
            band: pack.band,
            categories: pack.riskProfile,
        },
        risk: {
            customerConcentrationRisk: dna.risk.customerConcentrationRisk,
            supplierConcentrationRisk: dna.risk.supplierConcentrationRisk,
            deviations,
        },
        creditReadiness: {
            // Same score as Health above, deliberately — Quad360 doesn't
            // maintain a separate "credit" number, only a different frame
            // (how a lender would read the same evidence) on the one score.
            score: pack.score,
            band: pack.band,
            documentsReady: pack.documents.filter(d => d.ready).length,
            documentsTotal: pack.documents.length,
        },
        investmentReadiness: {
            valuation,
            recurringRevenuePct: diagnosis.metrics.revenueRecurringPct,
            yoyRevenueGrowthPct: dna.financial.yoyRevenueGrowthPct,
            topCustomerConcentrationPct: dna.operational.topCustomerConcentrationPct,
            // 'Illustrative valuation range' only counts as evidenced when
            // estimateBusinessValuation() actually produced one — listing
            // it as available while the section above says "too little
            // history to estimate" would be exactly the manufactured
            // confidence this file exists to avoid.
            availableSignals: [
                'Revenue & profit trend',
                'Gross/net margin',
                'Recurring revenue share',
                'Customer & supplier concentration',
                ...(valuation.hasReliableData ? ['Illustrative valuation range'] : []),
            ],
            missingSignals: [
                'Customer acquisition & retention',
                'Market opportunity',
                'Management quality',
                'Capital ask & use of funds',
                ...(valuation.hasReliableData ? [] : ['Illustrative valuation range']),
            ],
        },
        growth: {
            trend: pack.trend,
            yoyRevenueGrowthPct: trend.yoyRevenueGrowthPct,
            yoyProfitGrowthPct: trend.yoyProfitGrowthPct,
            marginTrend: dna.risk.marginTrendDirection,
        },
        topActions: diagnosis.topOpportunities,
        narrativeSummary: hasEnoughDataForDiagnosis ? diagnosis.narrativeSummary : '',
        goalRisks,
    };
}
