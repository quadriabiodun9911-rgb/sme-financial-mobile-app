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
 *
 * improvementProjection is the one place this file computes something new
 * from existing numbers rather than just reframing them — see
 * computeImprovementProjection in finance.ts for exactly how (same real
 * factor scores, bumped for the same dimensions the top 3 actions already
 * target, re-aggregated with the same weighting functions as everywhere
 * else). It is explicitly an illustrative "roughly here's where you'd
 * land" estimate, not a new canonical score.
 */

import { Transaction, Invoice, Loan, InventoryItem, Asset, FinanceData, BusinessSettings, User, Budget, StaffMember, FinancialGoal, FinancingContextData } from '../types';
import { buildBusinessFinancialDNA, BusinessFinancialDNA, detectDNADeviations, DNADeviation } from './businessFinancialDNA';
import { getMonthlyExpenseAverage, computeImprovementProjection, RiskScore } from './finance';
import { buildFundingReadinessPack, FundingReadinessPack } from './fundingReadiness';
import { estimateBusinessValuation, ValuationEstimate } from './businessValuation';
import { performFinancialDiagnosis, factorNamesForDimensions, ActionImpact, FinancialHealthSummary, computeFinancialHealthSummary } from './financialDiagnosisEngine';
import { computeDataQuality, DataQuality } from './dataQuality';
import { analyzeTrend } from './trendAnalysis';
import { buildStructuralSnapshot, StructuralSnapshot } from './structuralSnapshot';
import { computeRiskRadar } from './riskRadar';
import { generateActionPlan } from './actionRecommendationEngine';
import { calculateGoalBridge, mapSavedGoalToBridge } from './goalBridgeEngine';
import { assessGoalRisk, GoalRiskAssessment } from './goalRiskLinkage';
import { buildBehavioralProfile, BehavioralProfile } from './behavioralProfile';
import { computeInventoryPace } from './inventoryIntelligence';

// Below this many recorded transactions, a full diagnosis is too thin to
// trust — the Passport falls back to a structural snapshot built from
// whatever else exists (goals, budgets, loans, assets, invoices, stock)
// instead of showing a near-empty page. Same threshold the retired
// ClarityScreen used.
const MIN_TRANSACTIONS_FOR_DIAGNOSIS = 5;

export interface ImprovementProjectionSummary {
    currentHealthScore: number;
    projectedHealthScore: number;
    projectedHealthBand: RiskScore['band'];
    currentFinancingReadinessScore: number;
    projectedFinancingReadinessScore: number;
    projectedFinancingReadinessBand: RiskScore['band'];
}

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
        // Same indirect-method operating cash flow and conversion-%
        // computeRiskScore's own Operating Cash Flow factor uses (finance.ts,
        // via performFinancialDiagnosis's metrics) -- never a second,
        // independently-computed cash figure for the same document.
        operatingCashFlow: number;
        cashFlowConversionPct: number | null; // null when there's no positive profit to rate a conversion % against
        // Days Sales Outstanding -- how long, on average, cash sits in
        // receivables before it's collected. Same figure Working Capital
        // and the CFO screen already show, just named for a lender reading
        // this document rather than someone already familiar with "DSO".
        averageCollectionPeriodDays: number;
        // Honest proxy, not a fabricated value trend: this app has no dated
        // history of past inventory VALUE (see balanceSheetTrend.ts's own
        // doc comment), so "inventory trend" here reads real dated stock-
        // in transactions instead -- is the business buying more or less
        // stock lately, not whether unsold value is rising or falling.
        inventoryTrend: {
            direction: 'increasing' | 'decreasing' | 'stable' | 'unavailable';
            summary: string;
        };
    };
    health: {
        score: number;
        band: FundingReadinessPack['band'];
        categories: FundingReadinessPack['riskProfile'];
        // The "Dimension | Score" table's own summary row -- overall
        // interpretation, biggest concern, biggest strength -- see
        // computeFinancialHealthSummary in financialDiagnosisEngine.ts.
        summary: FinancialHealthSummary;
    };
    risk: {
        customerConcentrationRisk: BusinessFinancialDNA['risk']['customerConcentrationRisk'];
        supplierConcentrationRisk: BusinessFinancialDNA['risk']['supplierConcentrationRisk'];
        // Mirrors computeRiskScore's own Operating Cash Flow factor tiers
        // exactly (finance.ts) -- negative OCF is 'high', any conversion
        // below 90% is 'moderate', else 'low' -- so this never disagrees
        // with that pillar's own score or chip color anywhere else in the app.
        cashFlowRisk: { level: 'low' | 'moderate' | 'high'; summary: string };
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
    // Same top 3 actions as topActions above, paired with what each one is
    // actually costing today in profit and/or cash if left unresolved — see
    // deriveTopActionImpacts in financialDiagnosisEngine.ts.
    topActionImpacts: ActionImpact[];
    // "If you fixed these top actions, here's roughly where your scores
    // would land" — see computeImprovementProjection in finance.ts for the
    // exact method (same real factor scores, bumped one tier for the
    // targeted dimensions, then re-aggregated with the same weighting
    // functions used everywhere else). Null when there's not enough
    // transaction history for a full diagnosis, or no actions to target.
    improvementProjection: ImprovementProjectionSummary | null;
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
    // "Here's what's happening -> what's likely -> what to do -> what
    // capital fits" chained from the real pattern/prediction/financing-fit
    // engines already used elsewhere in this file — see behavioralProfile.ts.
    // Null under the same MIN_TRANSACTIONS_FOR_DIAGNOSIS gate as
    // narrativeSummary/improvementProjection above.
    behavioralProfile: BehavioralProfile | null;
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
    financing: Pick<FinancingContextData, 'pastApplications' | 'application'> = {},
): BusinessPassport {
    const dna = buildBusinessFinancialDNA(transactions, loans, inventory, finance, settings, user);
    const pack = buildFundingReadinessPack(transactions, invoices, loans, inventory, assets, finance, settings, dna.identity.businessName);
    const deviations = detectDNADeviations(transactions, settings.currency);
    const diagnosis = performFinancialDiagnosis(transactions, invoices, finance.cashBalance, getMonthlyExpenseAverage(finance.expense, transactions), settings.currency, loans, inventory, assets);
    const dataQuality = computeDataQuality(transactions);
    const trend = analyzeTrend(transactions);

    const hasEnoughDataForDiagnosis = transactions.length >= MIN_TRANSACTIONS_FOR_DIAGNOSIS;
    const structuralSnapshot = hasEnoughDataForDiagnosis
        ? null
        : buildStructuralSnapshot(budgets, loans, assets, invoices, inventory, staff, goals);

    // "After improvement" — targets the same dimensions the top 3 actions
    // above already address (diagnosis.diagnoses is sorted worst-first, same
    // ordering topOpportunities is sliced from), so the projection is always
    // "if you did what this page just told you to do," never a
    // disconnected, arbitrary set of factors.
    const targetFactorNames = factorNamesForDimensions(diagnosis.diagnoses.slice(0, 3).map(d => d.dimension));
    const improvementProjection: ImprovementProjectionSummary | null =
        hasEnoughDataForDiagnosis && targetFactorNames.length > 0
            ? (() => {
                const projected = computeImprovementProjection(pack.riskProfile, targetFactorNames);
                return {
                    // Same current values as the Health/Credit Readiness
                    // sections above (pack.score) -- never a second,
                    // independently-computed "current" figure for the
                    // same page.
                    currentHealthScore: pack.score,
                    projectedHealthScore: projected.health.score,
                    projectedHealthBand: projected.health.band,
                    currentFinancingReadinessScore: pack.score,
                    projectedFinancingReadinessScore: projected.financingReadiness.score,
                    projectedFinancingReadinessBand: projected.financingReadiness.band,
                };
            })()
            : null;

    const valuation = estimateBusinessValuation(
        dna.financial.avgMonthlyRevenue,
        dna.identity.monthsOfRecordedHistory,
        dna.financial.avgMonthlyProfitMargin,
        dna.financial.yoyRevenueGrowthPct,
        settings.industry,
        settings.currency,
    );

    // Cash-flow risk -- same tiers computeRiskScore's own Operating Cash
    // Flow factor uses (finance.ts), so this label never disagrees with
    // that pillar's score or chip color anywhere else in the app.
    const cashFlowRisk: BusinessPassport['risk']['cashFlowRisk'] = diagnosis.metrics.operatingCashFlow < 0
        ? { level: 'high', summary: 'Operating cash flow is negative -- normal operations are consuming cash rather than generating it.' }
        : diagnosis.metrics.cashFlowConversionPct !== null && diagnosis.metrics.cashFlowConversionPct < 90
            ? { level: 'moderate', summary: `Only ${diagnosis.metrics.cashFlowConversionPct.toFixed(0)}% of profit has converted into real cash this period.` }
            : { level: 'low', summary: 'Operating cash flow is positive and converting well into real cash.' };

    // Inventory trend -- deliberately a purchase-PACE proxy (real, dated
    // stock-in transactions), not a fabricated value trend. See the
    // inventoryTrend field's own doc comment on BusinessPassport above.
    const inventoryPace = computeInventoryPace(transactions);
    const inventoryTrend: BusinessPassport['financialIdentity']['inventoryTrend'] =
        inventoryPace.purchaseGrowthPct === null
            ? { direction: 'unavailable', summary: 'Not enough recent stock-purchase history to trend this yet.' }
            : inventoryPace.purchaseGrowthPct >= 15
                ? { direction: 'increasing', summary: `Stock purchases are up ${inventoryPace.purchaseGrowthPct.toFixed(0)}% vs last month.` }
                : inventoryPace.purchaseGrowthPct <= -15
                    ? { direction: 'decreasing', summary: `Stock purchases are down ${Math.abs(inventoryPace.purchaseGrowthPct).toFixed(0)}% vs last month.` }
                    : { direction: 'stable', summary: 'Stock purchase pace has held steady vs last month.' };

    const activeGoals = goals.filter(g => g.status !== 'achieved');
    const goalRisks = (hasEnoughDataForDiagnosis && activeGoals.length > 0)
        ? (() => {
            const riskRadar = computeRiskRadar(transactions, loans, settings.macroAssumptions ?? [], new Date(), assets);
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

    // No persisted readiness history is available to this aggregation
    // layer (buildBusinessPassport isn't given readinessHistory), so the
    // one financing-fit signal that depends on a readiness trend simply
    // doesn't fire here -- same "no basis for this signal, don't guess"
    // behavior recommendFinancingTypes already applies to every other
    // ungated signal, not a gap unique to this call site.
    const behavioralProfile = hasEnoughDataForDiagnosis
        ? buildBehavioralProfile({
            transactions, invoices, assets, loans, inventory, settings, user,
            readinessTrend: null,
            topActionSummary: diagnosis.topOpportunities[0] ?? null,
            pastFinancingApplications: financing.pastApplications,
            currentFinancingApplication: financing.application,
            staff,
        })
        : null;

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
            operatingCashFlow: diagnosis.metrics.operatingCashFlow,
            cashFlowConversionPct: diagnosis.metrics.cashFlowConversionPct,
            averageCollectionPeriodDays: diagnosis.metrics.dso,
            inventoryTrend,
        },
        health: {
            score: pack.score,
            band: pack.band,
            categories: pack.riskProfile,
            // Recomputed against pack.band, not diagnosis.healthSummary's
            // own band -- performFinancialDiagnosis derives that from
            // computeRiskScore's general weighting, while this section's
            // headline score/band above is pack.score/pack.band (financing-
            // readiness weighted). Individual factor scores/statuses are
            // identical either way (only the aggregate weighting differs),
            // so only the overall interpretation's band-adjective needed
            // reconciling -- otherwise a lender could read "Weak" next to
            // "Moderate business" in the same section.
            summary: computeFinancialHealthSummary(pack.band, diagnosis.categories, diagnosis.diagnoses),
        },
        risk: {
            customerConcentrationRisk: dna.risk.customerConcentrationRisk,
            supplierConcentrationRisk: dna.risk.supplierConcentrationRisk,
            cashFlowRisk,
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
                'Cash flow generation & conversion',
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
        topActionImpacts: diagnosis.topActionImpacts,
        improvementProjection,
        narrativeSummary: hasEnoughDataForDiagnosis ? diagnosis.narrativeSummary : '',
        goalRisks,
        behavioralProfile,
    };
}
