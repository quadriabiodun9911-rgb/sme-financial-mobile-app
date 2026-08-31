import React, { useEffect, useMemo, useState } from 'react';
import {
    SafeAreaView, ScrollView, View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { monthlyPayment as calcMonthlyPayment } from '../utils/loanMath';
import { showAlert } from '../utils/webAlert';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import LowDataNotice from '../components/LowDataNotice';
import NextStepLink from '../components/NextStepLink';
import { generatePDF, sharePDF } from '../utils/pdfExport';
import { buildLenderSummaryExport, buildFundingReadinessPackExport } from '../utils/lenderSummaryExport';
import { computeDSCR, computeRiskScore, computeFinancingReadinessScore, computeAssetCurrentValue, computeWorkingCapitalMetrics, RiskScore, RISK_BAND_STYLE, getMonthlyExpenseAverage } from '../utils/finance';
import { computeLendingCapacityEstimate } from '../utils/lendingCapacity';
import { computeReadinessDelta } from '../utils/readinessHistory';
import { computeDataQuality } from '../utils/dataQuality';
import { computeInventoryValue } from '../utils/stockVelocity';
import { computeLeverageRatios, computeLiveLoanBalance } from '../utils/debtRatios';
import { buildFiveCsAssessment } from '../utils/fiveCsOfCredit';
import { buildFundingReadinessPack } from '../utils/fundingReadiness';
import { performFinancialDiagnosis } from '../utils/financialDiagnosisEngine';
import { generateActionPlan } from '../utils/actionRecommendationEngine';
import { calculateGoalBridge, mapSavedGoalToBridge } from '../utils/goalBridgeEngine';
import { assessGoalRisk, GoalRiskAssessment } from '../utils/goalRiskLinkage';
import { computeRiskRadar } from '../utils/riskRadar';
import { computeForecastSummary } from '../utils/forecastSummary';
import { computeForwardFinancingReadiness } from '../utils/forwardFinancingReadiness';
import Icon, { IconName } from '../components/ui/Icon';
import { Radius, Shadow, Spacing } from '../theme/tokens';

const FP_STATUS_LABEL: Record<string, string> = { good: 'Strong', warning: 'Watch', danger: 'High risk' };
const FP_STATUS_COLOR: Record<string, string> = { good: Colors.income, warning: Colors.warning, danger: Colors.expense };
const FP_BAND_COLOR: Record<string, string> = {
    Excellent: Colors.income,
    Strong: '#10b981',
    Moderate: Colors.warning,
    Weak: '#fb923c',
    Critical: Colors.expense,
};
const DSCR_STATUS_COLOR: Record<'healthy' | 'warning' | 'danger', string> = { healthy: Colors.income, warning: Colors.warning, danger: Colors.expense };

function fmtCompact(currency: string, amount: number): string {
    // Sign goes BEFORE the currency symbol ("-₦1.5M"), not between it and
    // the number ("₦-1.5M") -- matters here since netProfit legitimately
    // goes negative for a struggling business.
    const sign = amount < 0 ? '-' : '';
    const abs = Math.abs(amount);
    if (abs >= 1000000) return `${sign}${currency}${(abs / 1000000).toFixed(1)}M`;
    if (abs >= 1000) return `${sign}${currency}${(abs / 1000).toFixed(0)}K`;
    return `${sign}${currency}${Math.round(abs).toLocaleString()}`;
}

type PageTab = 'profile' | 'funding-pack';

export default function CreditWorthinessScreen() {
    const { user, finance, transactions, invoices, loans, navigate, navParams, settings, inventory, assets, readinessHistory, goals } = useApp();
    const { currency } = settings;
    const [tab, setTab] = useState<PageTab>(navParams?.tab === 'funding-pack' ? 'funding-pack' : 'profile');

    // Deep-link from Loans / Business Passport ("See the full Funding
    // Readiness Pack") — re-applies even if this screen instance stays
    // mounted across the navigation.
    useEffect(() => {
        if (navParams?.tab === 'funding-pack') setTab('funding-pack');
    }, [navParams]);

    // Calculate credit factors
    const creditFactors = useMemo(() => {
        const factors = [];

        // 1. Payment History (30% weight)
        const totalDuePayments = loans.reduce((sum, l) => {
            const paid = (l.payments ?? []).reduce((s: number, p: any) => s + (p.amount || 0), 0);
            // Shared, 0%-interest-safe amortization calc (the inline formula
            // here divided by zero — Infinity/NaN denominator — for any
            // interest-free loan, e.g. Trade Credit).
            const monthlyPayment = calcMonthlyPayment(l.principal, l.interestRate, l.termMonths);
            const expectedPayments = Math.floor((new Date().getTime() - new Date(l.startDate).getTime()) / (1000 * 60 * 60 * 24 * 30)) * monthlyPayment;
            return sum + Math.max(0, expectedPayments - paid);
        }, 0);

        // No loans ever taken means no payment record to judge — that's
        // "unscored," not "a perfect record." Scoring it 100/Excellent would
        // treat a brand-new borrower identically to a proven on-time payer.
        if (loans.length === 0) {
            factors.push({
                name: 'Payment History',
                score: 50,
                weight: 0.3,
                description: 'No loan history yet',
                status: 'Not Yet Scored',
                tips: [
                    'This factor updates once you have loan repayment history',
                    'On-time payments build this score over time',
                ],
            });
        } else {
            const isOnTimePayment = totalDuePayments === 0 ? 100 : Math.max(0, 100 - (totalDuePayments / (currency === '₦' ? 500000 : 5000) * 10));
            factors.push({
                name: 'Payment History',
                score: isOnTimePayment,
                weight: 0.3,
                description: 'On-time loan/invoice payments',
                status: isOnTimePayment >= 80 ? 'Excellent' : isOnTimePayment >= 60 ? 'Good' : 'Needs Work',
                tips: [
                    'Pay all invoices on time',
                    'Set up payment reminders',
                    'Automate recurring payments',
                ],
            });
        }

        // 2. Credit Utilization (25% weight)
        const availableCredit = (user?.avgMonthlyProfit || 0) * 6; // 6 months of profit = available credit
        // Same computeLiveLoanBalance() the Five C's/leverage section below
        // uses — the inline version this replaced summed every loan
        // regardless of status (including paid_off/defaulted) and never
        // floored an individual loan at 0, so Credit Utilization could
        // silently disagree with — or even go negative relative to — the
        // "how much is owed" figure shown elsewhere on this same screen.
        const currentDebt = computeLiveLoanBalance(loans);

        // No positive profit history means there's no basis to size available
        // credit — treating that as "0% utilized" scored it a false 100/
        // Excellent for businesses that are currently unprofitable or brand
        // new, not for businesses using credit responsibly.
        if (availableCredit <= 0) {
            factors.push({
                name: 'Credit Utilization',
                score: 50,
                weight: 0.25,
                description: 'Not enough profit history to calculate available credit',
                status: 'Not Yet Scored',
                tips: [
                    'Build a positive average monthly profit to unlock this factor',
                    'Keep debt below 30% of available credit once it is scored',
                ],
            });
        } else {
            const creditUtilization = (currentDebt / availableCredit) * 100;
            const utilizationScore = Math.max(0, 100 - (creditUtilization * 1.5)); // Lower is better

            factors.push({
                name: 'Credit Utilization',
                // Score is risk-adjusted (100 = using none of your available
                // credit, 0 = maxed out or over) — NOT the raw utilization %,
                // so the description spells out the actual % to avoid reading
                // a low/0 score as "0% used" (which would sound good, not bad).
                score: utilizationScore,
                weight: 0.25,
                description: `Using ${Math.min(999, Math.round(creditUtilization))}% of available credit`,
                status: utilizationScore >= 80 ? 'Excellent' : utilizationScore >= 60 ? 'Good' : 'High Risk',
                tips: [
                    'Keep debt below 30% of available credit',
                    'Pay down loans when possible',
                    'Avoid taking multiple loans at once',
                ],
            });
        }

        // 3. Business Age & Stability (20% weight)
        const businessAge = user?.daysActive || 0;
        const ageScore = Math.min(100, (businessAge / 365) * 100);

        factors.push({
            name: 'Business Stability',
            score: ageScore,
            weight: 0.2,
            description: 'Business age and consistency',
            status: ageScore >= 80 ? 'Established' : ageScore >= 50 ? 'Growing' : 'Early Stage',
            tips: [
                'Maintain consistent revenue',
                'Document all transactions',
                'Build transaction history',
            ],
        });

        // 4. Cash Flow Health (15% weight)
        const runway = finance.runway || 0;
        const runwayScore = Math.min(100, (runway / 180) * 100); // 6 months runway = 100 score

        factors.push({
            name: 'Cash Flow Health',
            score: runwayScore,
            weight: 0.15,
            description: 'Liquidity and runway',
            status: runwayScore >= 80 ? 'Strong' : runwayScore >= 50 ? 'Adequate' : 'Weak',
            tips: [
                'Maintain emergency fund (3-6 months)',
                'Collect invoices promptly',
                'Reduce payment terms from suppliers',
            ],
        });

        // 10% weight for each factor = 100% total
        // Let's add Profitability & Growth (10% weight)
        const monthlyGrowth = user?.avgMonthlyRevenue || 0;
        const growthScore = monthlyGrowth >= 200000 ? 100 : (monthlyGrowth / 200000) * 100;

        factors.push({
            name: 'Revenue Growth',
            score: growthScore,
            weight: 0.1,
            description: 'Business revenue trends',
            status: growthScore >= 80 ? 'Strong Growth' : growthScore >= 50 ? 'Moderate' : 'Needs Growth',
            tips: [
                'Increase sales channels',
                'Expand customer base',
                'Improve profit margins',
            ],
        });

        return factors;
    }, [user, finance, transactions, loans, currency]);

    // The canonical 7-pillar score — the same number Financial Health, the
    // CFO screen, Business Financial DNA, and the Funding Readiness Pack
    // all show. This screen used to compute its own separate weighted sum
    // from the 5 factors below (Payment History/Credit Utilization/
    // Business Stability/Cash Flow Health/Revenue Growth) — a different
    // number from every other "how healthy is this business" screen in the
    // app. Those 5 factors are still shown (see "Additional Lender
    // Signals" below) since Payment History and Credit Utilization reflect
    // real repayment behavior the canonical score doesn't capture — they
    // just no longer drive the headline number.
    const risk = useMemo(() => computeRiskScore(finance, loans, transactions, inventory), [finance, loans, transactions, inventory]);
    const overallCreditScore = risk.score;

    const BAND_COLOR: Record<RiskScore['band'], string> = {
        Excellent: Colors.income,
        Strong: '#10b981',
        Moderate: Colors.warning,
        Weak: '#fb923c',
        Critical: Colors.expense,
    };
    const creditRating = useMemo(
        () => ({ ...RISK_BAND_STYLE[risk.band], color: BAND_COLOR[risk.band] }),
        [risk.band]
    );

    const topFactors = useMemo(() => {
        return [...risk.factors].sort((a, b) => a.score - b.score).slice(0, 2);
    }, [risk.factors]);

    // "What could stop this business from reaching its own growth goals" —
    // same real diagnosis + Risk Radar + Goal Bridge pipeline GoalsScreen's
    // Risks tab uses (see goalRiskLinkage.ts), surfaced here too since a
    // lender assessing this business's readiness should see whether it's
    // steering around its own real risks, not just its historical score.
    // Gated the same way GoalsScreen gates its diagnosis call.
    const activeGoals = useMemo(() => goals.filter(g => g.status !== 'achieved'), [goals]);
    const goalRiskByGoalId = useMemo(() => {
        if (transactions.length < 5 || activeGoals.length === 0) return {};
        const diagnosis = performFinancialDiagnosis(transactions, invoices, finance.cashBalance, getMonthlyExpenseAverage(finance.expense, transactions), currency, loans, inventory, assets);
        const riskRadar = computeRiskRadar(transactions, loans, settings?.macroAssumptions ?? [], new Date(), assets);
        const tactics = generateActionPlan(diagnosis, diagnosis.metrics, currency);
        const allTactics = [...tactics.immediateActions, ...tactics.shortTermActions, ...tactics.strategicActions];
        const map: Record<string, GoalRiskAssessment> = {};
        for (const g of activeGoals) {
            const bridge = calculateGoalBridge(mapSavedGoalToBridge(g), diagnosis.metrics, allTactics, currency);
            map[g.id] = assessGoalRisk(g.type, diagnosis.diagnoses, riskRadar, bridge.successProbability);
        }
        return map;
    }, [transactions, invoices, finance, currency, loans, inventory, assets, activeGoals, settings?.macroAssumptions]);

    // Same conditions rendered by the "What Lenders Look For" checkpoints
    // below — kept in one place so the exported summary and the on-screen
    // checklist can never disagree.
    const lenderCheckpoints = useMemo(() => [
        { label: 'Credit Score', met: overallCreditScore >= 70, description: '70+ score increases approval odds' },
        { label: 'Payment History', met: (creditFactors[0]?.score ?? 0) >= 80, description: 'On-time payment record' },
        { label: 'Cash Flow', met: !!(finance.runway && finance.runway >= 90), description: '3+ months runway' },
        { label: 'Revenue Level', met: (user?.avgMonthlyRevenue || 0) >= 200000, description: `${currency}200k+ monthly revenue` },
        { label: 'Business Age', met: (user?.daysActive || 0) >= 90, description: '90+ days operating history' },
        { label: 'Debt Ratio', met: (creditFactors[1]?.score ?? 0) >= 70, description: 'Debt < 30% of available credit' },
    ], [overallCreditScore, creditFactors, finance.runway, user?.avgMonthlyRevenue, user?.daysActive, currency]);

    // Visibility Score: how much of this business's real history the app
    // (and by extension a lender) can actually see — reuses the same
    // coverage math dataQuality.ts already computes elsewhere, framed the
    // way a fintech underwriting engine frames it: not "is the score good"
    // but "how much of the business is visible in the first place."
    const dataQuality = useMemo(() => computeDataQuality(transactions), [transactions]);

    // Estimated Lending Capacity: an illustrative range, not a real offer —
    // Quad360 has no visibility into any actual lender's pricing, so this
    // must never look like a quote. hasReliableData gates it separately
    // from the credit score itself, same "unscored vs. actually poor"
    // distinction used throughout the credit factors above.
    const dscrResult = useMemo(() => computeDSCR(transactions, loans), [transactions, loans]);
    const inventoryValue = useMemo(() => computeInventoryValue(inventory), [inventory]);
    // Forward-Looking Financing Readiness -- "here's what's likely to
    // happen" alongside the trailing figures above. Built on the same
    // 12-month forecast the Forecast screen itself shows (computeForecastSummary),
    // never a second, independently-tuned projection. See forwardFinancingReadiness.ts.
    const forecastSummary12m = useMemo(
        () => computeForecastSummary(transactions, loans, finance, '12m', [], settings?.macroAssumptions ?? [], undefined, inventory, []),
        [transactions, loans, finance, settings?.macroAssumptions, inventory],
    );
    const forwardReadiness = useMemo(
        () => computeForwardFinancingReadiness(forecastSummary12m.cashFlowMonths, forecastSummary12m.headline.expectedRevenue, forecastSummary12m.monthsInPeriod, dscrResult),
        [forecastSummary12m, dscrResult],
    );
    // Reweighted toward debt-service coverage and liquidity -- what actually
    // predicts repayment ability -- rather than the general Credit-
    // Worthiness score above, which intentionally stays the same canonical
    // "how healthy is this business" number shown everywhere else. Same
    // underlying factor scores, just a different aggregation for the one
    // downstream calculation (how much could this business realistically
    // borrow) where that distinction actually matters.
    const financingReadiness = useMemo(() => computeFinancingReadinessScore(risk.factors), [risk.factors]);
    const lendingCapacity = useMemo(() => computeLendingCapacityEstimate({
        overallCreditScore: financingReadiness.score,
        avgMonthlyRevenue: user?.avgMonthlyRevenue || 0,
        dscr: dscrResult.dscr,
        hasReliableData: dataQuality.confidence !== 'none' && dataQuality.confidence !== 'limited',
        inventoryValue,
    }), [financingReadiness.score, user?.avgMonthlyRevenue, dscrResult.dscr, dataQuality.confidence, inventoryValue]);

    // Readiness trend -- null until there's a second snapshot to compare
    // against (roughly a week after the first one is recorded).
    const readinessDelta = useMemo(() => computeReadinessDelta(readinessHistory), [readinessHistory]);

    // The Five C's of Credit — the classic framework the canonical score
    // above is often read against. Built from the same already-computed
    // numbers on this screen (DSCR, inventory value) plus leverage/net
    // worth, which the weighted score doesn't include at all.
    // AR/AP folded in the same way LoansAndDebt (Reports > Loans & Debt) and
    // Reports > "What I Own & Owe" already do, so Capital's net worth agrees
    // with those screens instead of a narrower figure.
    const wcMetrics = useMemo(() => computeWorkingCapitalMetrics(transactions), [transactions]);
    const leverage = useMemo(
        () => computeLeverageRatios(finance, loans, wcMetrics.accountsReceivable, wcMetrics.accountsPayable, inventoryValue),
        [finance, loans, wcMetrics, inventoryValue],
    );
    const assetBookValue = useMemo(
        () => assets.filter(a => a.status === 'active').reduce((s, a) => s + computeAssetCurrentValue(a), 0),
        [assets],
    );
    const fiveCs = useMemo(
        () => buildFiveCsAssessment(risk, dscrResult, leverage, inventoryValue, assetBookValue, currency),
        [risk, dscrResult, leverage, inventoryValue, assetBookValue, currency],
    );

    const [exporting, setExporting] = useState(false);

    const handleExportLenderSummary = async () => {
        setExporting(true);
        try {
            const exportData = buildLenderSummaryExport({
                businessName: user?.businessName || 'Your Business',
                currency,
                overallCreditScore,
                creditRatingLabel: creditRating.label,
                // The canonical 8-factor breakdown, not the 5 supplementary
                // factors — this has to match the score shown above it, and
                // only the canonical factors actually sum to that score.
                factors: risk.factors.map(f => ({
                    name: f.name,
                    score: f.score,
                    weight: f.weight / 100,
                    description: f.status === 'good' ? 'Strong' : f.status === 'warning' ? 'Watch' : 'High risk',
                    status: f.status === 'good' ? 'Strong' : f.status === 'warning' ? 'Watch' : 'High risk',
                })),
                checkpoints: lenderCheckpoints,
                runwayDays: finance.runway || 0,
                avgMonthlyRevenue: user?.avgMonthlyRevenue || 0,
                daysActive: user?.daysActive || 0,
                generatedAt: new Date(),
            });
            const filePath = await generatePDF(exportData);
            await sharePDF(filePath, exportData.title);
        } catch (error) {
            showAlert('Export failed', 'Could not generate the lender-ready summary. Please try again.');
        } finally {
            setExporting(false);
        }
    };

    // Funding Pack tab — a document-oriented view built for a specific
    // funding application (financial profile snapshot, 12-month trend,
    // supporting-documents checklist), as opposed to the Credit Profile
    // tab's ongoing "how do I improve my score" framing. Shares the same
    // canonical risk score via buildFundingReadinessPack -> computeRiskScore.
    const pack = useMemo(
        () => buildFundingReadinessPack(transactions, invoices, loans, inventory, assets, finance, settings, user?.businessName || 'Your Business'),
        [transactions, invoices, loans, inventory, assets, finance, settings, user?.businessName],
    );
    const maxTrendRevenue = Math.max(1, ...pack.trend.map(m => Math.max(m.revenue, m.expense)));

    const handleExportFundingPack = async () => {
        setExporting(true);
        try {
            const exportData = buildFundingReadinessPackExport(pack, currency);
            const filePath = await generatePDF(exportData);
            await sharePDF(filePath, exportData.title);
        } catch {
            showAlert('Export failed', 'Could not generate the Funding Readiness Pack. Please try again.');
        } finally {
            setExporting(false);
        }
    };

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
                <TouchableOpacity onPress={() => navigate('dashboard')}>
                    <Text style={{ color: Colors.primary, fontSize: 14, marginBottom: 12 }}>← Dashboard</Text>
                </TouchableOpacity>

                <Text style={s.title}>💳 Credit-Worthiness</Text>
                <Text style={s.subtitle}>How your business looks against what lenders evaluate — not a loan decision, and not a guarantee.</Text>

                <View style={s.tabRow}>
                    <TouchableOpacity style={[s.tabBtn, tab === 'profile' && s.tabBtnActive]} onPress={() => setTab('profile')}>
                        <Text style={[s.tabBtnText, tab === 'profile' && s.tabBtnTextActive]}>Credit Profile</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.tabBtn, tab === 'funding-pack' && s.tabBtnActive]} onPress={() => setTab('funding-pack')}>
                        <Text style={[s.tabBtnText, tab === 'funding-pack' && s.tabBtnTextActive]}>Funding Pack</Text>
                    </TouchableOpacity>
                </View>

                {tab === 'profile' ? (
                <>
                <LowDataNotice transactionCount={transactions.length} label="your credit-worthiness score" />

                <TouchableOpacity style={s.exportButton} onPress={handleExportLenderSummary} disabled={exporting}>
                    <Text style={s.exportButtonText}>{exporting ? 'Preparing…' : '📄 Export Lender-Ready Summary'}</Text>
                </TouchableOpacity>
                <Text style={s.exportHint}>
                    A shareable document banks and lenders can actually review — your score, what it's built on, and where you stand against what they check for.
                </Text>

                {/* Overall Score Card */}
                <View style={[s.scoreCard, { borderTopColor: creditRating.color, borderTopWidth: 4 }]}>
                    <Text style={s.scoreEmoji}>{creditRating.emoji}</Text>
                    <Text style={s.scoreLabel}>Your Credit Score</Text>
                    <Text style={[s.scoreValue, { color: creditRating.color }]}>
                        {Math.round(overallCreditScore)}
                    </Text>
                    <Text style={s.scoreRating}>{creditRating.label} Credit Profile</Text>

                    {/* Score Composition — this score IS computeRiskScore
                        (overallCreditScore = risk.score above), and the
                        full factor-by-factor breakdown with explanations
                        now lives on Risk Management; this links there
                        instead of re-rendering the same list. */}
                    <NextStepLink text="See the full factor-by-factor breakdown → Risk Management" onPress={() => navigate('risk-management')} />
                </View>

                {/* The Five C's of Credit — the classic lender framework the
                    score above is often read against. Honest about which
                    of the five it can and can't actually evidence. */}
                <View style={s.fiveCsCard}>
                    <Text style={s.sectionTitle}>🔤 The Five C's of Credit</Text>
                    <Text style={s.visibilitySub}>
                        How your score maps onto what a lender actually asks — and where the gaps genuinely are, not papered over.
                    </Text>
                    {fiveCs.map((c, idx) => (
                        <View key={c.name} style={[s.fiveCRow, idx === fiveCs.length - 1 && { borderBottomWidth: 0 }]}>
                            <View style={s.fiveCHeader}>
                                <Text style={s.fiveCName}>{idx + 1}. {c.name}</Text>
                                <View style={[s.fiveCBadge, { backgroundColor: (c.evidenced ? Colors.income : Colors.textMuted) + '22' }]}>
                                    <Text style={[s.fiveCBadgeText, { color: c.evidenced ? Colors.income : Colors.textMuted }]}>
                                        {c.evidenced ? 'Evidenced' : 'Not evidenced'}
                                    </Text>
                                </View>
                            </View>
                            <Text style={s.fiveCQuestion}>{c.question}</Text>
                            <Text style={s.fiveCSummary}>{c.summary}</Text>
                        </View>
                    ))}
                </View>

                {/* Visibility Score */}
                <View style={s.visibilityCard}>
                    <Text style={s.sectionTitle}>👁️ Visibility Score</Text>
                    <Text style={s.visibilitySub}>
                        How much of your business's real history is actually visible right now — the more a lender can see, the more they can act on it before a problem becomes a missed payment.
                    </Text>
                    <View style={s.visibilityRow}>
                        <View style={s.visibilityBar}>
                            <View style={[s.visibilityBarFill, { width: `${Math.round(dataQuality.coveragePct)}%`, backgroundColor: dataQuality.confidence === 'strong' ? Colors.income : dataQuality.confidence === 'partial' ? Colors.warning : Colors.expense }]} />
                        </View>
                        <Text style={s.visibilityPct}>{Math.round(dataQuality.coveragePct)}%</Text>
                    </View>
                    <Text style={s.visibilityDetail}>{dataQuality.summary}</Text>
                    {dataQuality.confidence !== 'strong' && (
                        <View style={s.visibilityUnlockBox}>
                            <Text style={s.visibilityUnlockText}>
                                {dataQuality.confidence === 'none' && 'Add transactions to unlock a Visibility Score and an Estimated Lending Capacity range below.'}
                                {dataQuality.confidence === 'limited' && 'Keep logging — once your history is strong enough to be reliable, this unlocks an Estimated Lending Capacity range below.'}
                                {dataQuality.confidence === 'partial' && (lendingCapacity.tier === 'not-yet-bankable'
                                    ? 'A few more months of consistent history moves this toward an active Estimated Lending Capacity range.'
                                    : 'More months of consistent history typically moves the Estimated Lending Capacity range below into a higher, more precise tier.')}
                            </Text>
                        </View>
                    )}
                </View>

                {/* Estimated Lending Capacity */}
                <View style={[s.capacityCard, lendingCapacity.tier === 'not-yet-bankable' && s.capacityCardMuted]}>
                    <Text style={s.sectionTitle}>💰 Estimated Lending Capacity</Text>
                    <Text style={s.capacitySub}>
                        An illustrative range based on your own numbers — not an offer from any lender, and not a guarantee. Actual terms depend on the lender you approach.
                    </Text>
                    {lendingCapacity.maxAmount > 0 ? (
                        <>
                            <Text style={s.capacityRange}>
                                {currency}{lendingCapacity.minAmount.toLocaleString()} – {currency}{lendingCapacity.maxAmount.toLocaleString()}
                            </Text>
                            <View style={s.capacityMetaRow}>
                                <Text style={s.capacityMeta}>Tier: <Text style={s.capacityMetaVal}>{lendingCapacity.tierLabel}</Text></Text>
                                <Text style={s.capacityMeta}>Max tenure: <Text style={s.capacityMetaVal}>{lendingCapacity.maxTenureMonths} months</Text></Text>
                            </View>
                            <Text style={s.capacityRate}>{lendingCapacity.rateTierLabel}</Text>
                        </>
                    ) : (
                        <Text style={s.capacityUnavailable}>{lendingCapacity.tierLabel} — {lendingCapacity.reason}</Text>
                    )}

                    {lendingCapacity.inventoryBacked && (
                        <View style={s.inventoryBackedBox}>
                            <Text style={s.inventoryBackedTitle}>📦 + Inventory-Backed Potential</Text>
                            <Text style={s.capacityRange}>
                                {currency}{lendingCapacity.inventoryBacked.minAmount.toLocaleString()} – {currency}{lendingCapacity.inventoryBacked.maxAmount.toLocaleString()}
                            </Text>
                            <Text style={s.inventoryBackedNote}>
                                Based on {currency}{inventoryValue.toLocaleString()} of stock on hand, at a conservative {lendingCapacity.inventoryBacked.advanceRatePctRange[0]}–{lendingCapacity.inventoryBacked.advanceRatePctRange[1]}% advance rate. {lendingCapacity.inventoryBacked.reason}
                            </Text>
                        </View>
                    )}
                </View>

                {/* Readiness Over Time */}
                <View style={s.section}>
                    <Text style={s.sectionTitle}>📈 Readiness Over Time</Text>
                    {readinessHistory.length === 0 && (
                        <Text style={s.trendEmpty}>
                            Quad360 starts tracking your readiness trend from today. Check back in about a week to see your first data point.
                        </Text>
                    )}
                    {readinessHistory.length === 1 && (
                        <Text style={s.trendEmpty}>
                            First readiness snapshot recorded. Come back in about a week to start seeing a trend.
                        </Text>
                    )}
                    {readinessHistory.length > 1 && (
                        <>
                            <View style={s.trendChartArea}>
                                {readinessHistory.map((snap, i) => {
                                    const isLast = i === readinessHistory.length - 1;
                                    const barH = Math.max((snap.score / 100) * 64, 4);
                                    return (
                                        <View key={snap.id} style={s.trendBarCol}>
                                            <View style={s.trendBarTrack}>
                                                <View style={[s.trendBar, { height: barH, backgroundColor: isLast ? Colors.primary : Colors.primary + '55' }]} />
                                            </View>
                                            {isLast && <Text style={s.trendBarValue}>{snap.score}</Text>}
                                        </View>
                                    );
                                })}
                            </View>
                            {readinessDelta && (
                                <>
                                    <Text style={[
                                        s.trendSummary,
                                        { color: readinessDelta.trend === 'improving' ? Colors.income : readinessDelta.trend === 'declining' ? Colors.expense : Colors.textSecondary },
                                    ]}>
                                        {readinessDelta.trend === 'improving' && `Your readiness improved from ${readinessDelta.fromScore} → ${readinessDelta.toScore} over ${readinessDelta.periodLabel}.`}
                                        {readinessDelta.trend === 'declining' && `Your readiness dropped from ${readinessDelta.fromScore} → ${readinessDelta.toScore} over ${readinessDelta.periodLabel}.`}
                                        {readinessDelta.trend === 'stable' && `Your readiness has stayed roughly steady (${readinessDelta.fromScore} → ${readinessDelta.toScore}) over ${readinessDelta.periodLabel}.`}
                                    </Text>
                                    {(readinessDelta.improvedFactors.length > 0 || readinessDelta.worsenedFactors.length > 0) && (
                                        <View style={s.trendFactorsBox}>
                                            {readinessDelta.improvedFactors.map(f => (
                                                <Text key={f.name} style={s.trendFactorGood}>✅ {f.name} improved ({f.from} → {f.to})</Text>
                                            ))}
                                            {readinessDelta.worsenedFactors.map(f => (
                                                <Text key={f.name} style={s.trendFactorBad}>❌ {f.name} weakened ({f.from} → {f.to})</Text>
                                            ))}
                                        </View>
                                    )}
                                </>
                            )}
                            <Text style={s.trendFootnote}>A new data point roughly once a week, based on your recorded activity.</Text>
                        </>
                    )}
                </View>

                {/* Areas to Improve */}
                {topFactors.length > 0 && (
                    <View style={s.section}>
                        <Text style={s.sectionTitle}>⚡ Top Priorities to Improve</Text>
                        {topFactors.map((factor, idx) => (
                            <View key={idx} style={s.improvementCard}>
                                <View style={s.improvementHeader}>
                                    <Text style={s.improvementName}>{factor.name}</Text>
                                    <Text style={[s.improvementScore, { color: factor.score >= 70 ? Colors.income : Colors.warning }]}>
                                        {Math.round(factor.score)}
                                    </Text>
                                </View>
                                <Text style={s.improvementDescription}>
                                    {factor.status === 'danger' ? 'High risk' : 'Watch'} — {Math.round(factor.weight)}% of your score
                                </Text>
                                <View style={s.progressBar}>
                                    <View
                                        style={[
                                            s.progressFill,
                                            {
                                                width: `${factor.score}%`,
                                                backgroundColor: factor.score >= 70 ? Colors.income : Colors.warning,
                                            },
                                        ]}
                                    />
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {/* Growth Goals & Risk — what could stop THIS business from
                    reaching its own stated goals, not just general business
                    risk. Same real diagnosis + Risk Radar + Goal Bridge
                    pipeline GoalsScreen's Risks tab uses (see
                    goalRiskLinkage.ts). Only shown when there's a real active
                    goal to assess. */}
                {activeGoals.length > 0 && (
                    <View style={s.section}>
                        <Text style={s.sectionTitle}>🎯 Growth Goals & Risk</Text>
                        {activeGoals.map(g => {
                            const goalRisk = goalRiskByGoalId[g.id];
                            if (!goalRisk) return null;
                            return (
                                <View key={g.id} style={s.improvementCard}>
                                    <View style={s.improvementHeader}>
                                        <Text style={s.improvementName}>{g.title}</Text>
                                        <Text style={[s.improvementScore, { color: FP_BAND_COLOR[goalRisk.readinessBand] }]}>
                                            {Math.round(goalRisk.growthReadiness)}
                                        </Text>
                                    </View>
                                    <Text style={s.improvementDescription}>{goalRisk.narrative}</Text>
                                    <View style={s.progressBar}>
                                        <View style={[s.progressFill, { width: `${goalRisk.growthReadiness}%`, backgroundColor: FP_BAND_COLOR[goalRisk.readinessBand] }]} />
                                    </View>
                                </View>
                            );
                        })}
                        <NextStepLink text="See the full risk breakdown for each goal →" onPress={() => navigate('goals')} />
                    </View>
                )}

                {/* Forward-Looking Financing Readiness — "here's what
                    happened" (the trailing DSCR/factors above) plus "here's
                    what's likely to happen next, and under a downside".
                    Built on the same 12-month forecast the Forecast screen
                    already shows -- see forwardFinancingReadiness.ts. */}
                {forwardReadiness.available && (
                    <View style={s.section}>
                        <Text style={s.sectionTitle}>🔮 Forward-Looking Financing Readiness</Text>
                        <Text style={s.improvementDescription}>
                            Not just what happened — what's likely to happen next, the way a financing partner would want to see it.
                        </Text>
                        <View style={s.improvementCard}>
                            <View style={s.improvementHeader}>
                                <Text style={s.improvementName}>Base Case (next 12 months)</Text>
                                <Text style={[s.improvementScore, { color: DSCR_STATUS_COLOR[forwardReadiness.base.dscrStatus] }]}>
                                    {forwardReadiness.base.dscr >= 999 ? '∞' : `${forwardReadiness.base.dscr.toFixed(1)}×`}
                                </Text>
                            </View>
                            <Text style={s.improvementDescription}>
                                Base-case projected revenue: {currency}{Math.round(forwardReadiness.baseCaseRevenue).toLocaleString()}{'\n'}
                                Expected operating cash flow: {currency}{Math.round(forwardReadiness.base.annualizedOperatingCashFlow).toLocaleString()}{'\n'}
                                Expected debt service coverage: {forwardReadiness.base.dscr >= 999 ? 'No scheduled debt service' : `${forwardReadiness.base.dscr.toFixed(1)}×`}
                            </Text>
                        </View>
                        <View style={s.improvementCard}>
                            <View style={s.improvementHeader}>
                                <Text style={s.improvementName}>Downside (-{forwardReadiness.downsideRevenueDropPct}% revenue)</Text>
                                <Text style={[s.improvementScore, { color: forwardReadiness.downsideStaysPositive ? Colors.income : Colors.expense }]}>
                                    {forwardReadiness.downsideStaysPositive ? 'Stays positive' : 'Turns negative'}
                                </Text>
                            </View>
                            <Text style={s.improvementDescription}>
                                Operating cash flow: {currency}{Math.round(forwardReadiness.downside.annualizedOperatingCashFlow).toLocaleString()}{'\n'}
                                Debt service coverage: {forwardReadiness.downside.dscr >= 999 ? 'No scheduled debt service' : `${forwardReadiness.downside.dscr.toFixed(1)}×`}
                            </Text>
                        </View>
                    </View>
                )}

                {/* Additional Lender Signals — real repayment behavior and
                    credit utilization the canonical score above doesn't
                    capture (it only sees DSCR, not on-time payment history).
                    These are supplementary context, not part of the score
                    composition shown above. */}
                <View style={s.section}>
                    <Text style={s.sectionTitle}>📊 Additional Lender Signals</Text>
                    {creditFactors.map((factor, idx) => (
                        <View key={idx} style={s.factorCard}>
                            <View style={s.factorHeader}>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.factorName}>{factor.name}</Text>
                                    <Text style={s.factorDescription}>{factor.description}</Text>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={[s.factorScore, { color: factor.score >= 70 ? Colors.income : Colors.warning }]}>
                                        {Math.round(factor.score)}
                                    </Text>
                                    <Text style={s.factorStatus}>{factor.status}</Text>
                                </View>
                            </View>
                            <View style={s.progressBar}>
                                <View
                                    style={[
                                        s.progressFill,
                                        {
                                            width: `${factor.score}%`,
                                            backgroundColor: factor.score >= 70 ? Colors.income : Colors.warning,
                                        },
                                    ]}
                                />
                            </View>
                        </View>
                    ))}
                </View>

                {/* Lender Requirements */}
                <View style={s.section}>
                    <Text style={s.sectionTitle}>🏦 What Lenders Look For</Text>
                    {lenderCheckpoints.map((c, idx) => (
                        <LenderCheckpoint key={idx} label={c.label} status={c.met} description={c.description} />
                    ))}
                    {!(finance.runway && finance.runway >= 90) && (
                        <NextStepLink text="Improve your cash runway" onPress={() => navigate('cashflow')} />
                    )}
                </View>

                {/* Tips Box */}
                <View style={s.tipsBox}>
                    <Text style={s.tipsTitle}>💡 How to Improve Your Credit Profile</Text>
                    <TipItem emoji="💳" text="Make all payments on time - set up payment reminders" />
                    <TipItem emoji="📊" text="Keep credit utilization low - use less than 30% of available credit" />
                    <TipItem emoji="📈" text="Maintain consistent revenue - log all transactions" />
                    <TipItem emoji="💰" text="Build cash reserves - aim for 3-6 months runway" />
                    <TipItem emoji="📝" text="Document business records - keep receipts and contracts" />
                    <TipItem emoji="🎯" text="Show growth - increase revenue and profitability" />
                </View>
                </>
                ) : (
                <>
                <Text style={fp.subtitle}>
                    Not a loan decision — Quad360 doesn't lend and can't guarantee an outcome. This shows how your
                    business would look to a lender doing their own assessment, and exactly what to fix first.
                </Text>

                <LowDataNotice transactionCount={transactions.length} label="your Funding Readiness Pack" />

                <TouchableOpacity style={s.exportButton} onPress={handleExportFundingPack} disabled={exporting}>
                    <Text style={s.exportButtonText}>{exporting ? 'Preparing…' : '📄 Export Funding Readiness Pack'}</Text>
                </TouchableOpacity>
                <Text style={s.exportHint}>A shareable document a lender can actually review.</Text>

                {/* Business Financial Profile */}
                <View style={fp.card}>
                    <Text style={fp.cardTitle}>Business Financial Profile</Text>
                    <Text style={fp.businessName}>{pack.businessName}</Text>
                    <View style={fp.profileGrid}>
                        <FpProfileStat label="Revenue (TTM)" value={fmtCompact(currency, pack.profile.revenue)} />
                        <FpProfileStat label="Gross Profit" value={fmtCompact(currency, pack.profile.grossProfit)} sub={`${pack.profile.grossMargin.toFixed(0)}% margin`} />
                        <FpProfileStat label="Net Profit" value={fmtCompact(currency, pack.profile.netProfit)} color={pack.profile.netProfit >= 0 ? Colors.income : Colors.expense} />
                        <FpProfileStat label="Cash" value={fmtCompact(currency, pack.profile.cash)} />
                        <FpProfileStat label="Receivables" value={fmtCompact(currency, pack.profile.receivables)} />
                        <FpProfileStat label="Debt" value={fmtCompact(currency, pack.profile.debt)} sub={pack.profile.debtCurrentPortion > 0 ? `${fmtCompact(currency, pack.profile.debtCurrentPortion)} due within 1yr` : undefined} />
                    </View>
                </View>

                {/* Financial performance */}
                <View style={fp.card}>
                    <Text style={fp.cardTitle}>Financial Performance — Last 12 Months</Text>
                    {pack.trend.length === 0 ? (
                        <Text style={fp.emptyText}>Not enough recorded history yet to show a trend.</Text>
                    ) : (
                        <View style={fp.trendChart}>
                            {pack.trend.map(m => (
                                <View key={m.month} style={fp.trendCol}>
                                    <View style={fp.trendBars}>
                                        <View style={[fp.trendBar, { height: `${Math.max(2, (m.revenue / maxTrendRevenue) * 100)}%`, backgroundColor: Colors.income }]} />
                                        <View style={[fp.trendBar, { height: `${Math.max(2, (m.expense / maxTrendRevenue) * 100)}%`, backgroundColor: Colors.expense }]} />
                                    </View>
                                    <Text style={fp.trendLabel}>{m.month.slice(5)}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                    <View style={fp.trendLegend}>
                        <FpLegendDot color={Colors.income} label="Revenue" />
                        <FpLegendDot color={Colors.expense} label="Expenses" />
                    </View>
                </View>

                {/* Risk profile */}
                <View style={fp.card}>
                    <Text style={fp.cardTitle}>Risk Profile</Text>
                    {pack.riskProfile.map(f => (
                        <View key={f.name} style={fp.riskRow}>
                            <View style={[fp.legendDot, { backgroundColor: FP_STATUS_COLOR[f.status], marginRight: 8 }]} />
                            <Text style={fp.riskLabel}>{f.name}</Text>
                            <Text style={[fp.riskStatus, { color: FP_STATUS_COLOR[f.status] }]}>{FP_STATUS_LABEL[f.status]}</Text>
                        </View>
                    ))}
                </View>

                {/* Funding readiness score */}
                <View style={[fp.scoreCard, { borderTopColor: FP_BAND_COLOR[pack.band] }]}>
                    <Text style={fp.cardTitle}>Funding Readiness</Text>
                    <Text style={[fp.scoreValue, { color: FP_BAND_COLOR[pack.band] }]}>{pack.score}/100 — {pack.band}</Text>
                    <Text style={fp.scoreCaveat}>
                        This reflects how prepared your records are for a lender's own assessment — not a
                        pre-approval, and not a promise of funding.
                    </Text>
                    <NextStepLink text="See what's holding your score back" onPress={() => navigate('financial-assessment')} />
                    <NextStepLink text="See which financing products fit your business →" onPress={() => navigate('financing-marketplace')} />
                </View>

                {/* Top actions + after-improvement projection — same
                    prioritized fixes performFinancialDiagnosis surfaces
                    elsewhere (e.g. the Business Passport), reused here so a
                    lender reading this document sees not just the score but
                    what specifically is holding it back and roughly how
                    much fixing it would move the needle. Hidden entirely
                    when there's too little history for a diagnosis. */}
                {pack.topActions.length > 0 && (
                    <View style={fp.card}>
                        <Text style={fp.cardTitle}>What's Holding This Back</Text>
                        {pack.topActionImpacts.map((item, idx) => (
                            <View key={idx} style={fp.actionRow}>
                                <Text style={fp.actionNumber}>{idx + 1}</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={fp.actionText}>{item.action}</Text>
                                    {(item.profitImpact > 0 || item.cashImpact > 0) && (
                                        <Text style={fp.actionImpactText}>
                                            If not solved:{' '}
                                            {item.profitImpact > 0 && `${fmtCompact(currency, item.profitImpact)}/mo off profit`}
                                            {item.profitImpact > 0 && item.cashImpact > 0 && item.cashImpact !== item.profitImpact ? ' · ' : ''}
                                            {item.cashImpact > 0 && item.cashImpact !== item.profitImpact && `${fmtCompact(currency, item.cashImpact)} tied up in cash`}
                                        </Text>
                                    )}
                                </View>
                            </View>
                        ))}
                        {pack.improvementProjection && (
                            <View style={fp.improvementBlock}>
                                <Text style={fp.improvementLabel}>If these are addressed</Text>
                                <View style={fp.improvementScoreRow}>
                                    <Text style={fp.improvementCurrent}>{pack.improvementProjection.currentScore}</Text>
                                    <Icon name="arrow-right" size={13} color={Colors.textMuted} />
                                    <Text style={[fp.improvementProjected, { color: FP_BAND_COLOR[pack.improvementProjection.projectedBand] }]}>
                                        {pack.improvementProjection.projectedScore}
                                    </Text>
                                    <Text style={fp.improvementProjectedBand}>({pack.improvementProjection.projectedBand})</Text>
                                </View>
                                <Text style={fp.improvementCaveat}>
                                    An illustrative estimate based on your own recorded numbers, not a guarantee.
                                </Text>
                            </View>
                        )}
                    </View>
                )}

                {/* Supporting documents */}
                <View style={fp.card}>
                    <Text style={fp.cardTitle}>Supporting Documents</Text>
                    <Text style={fp.docsHint}>
                        Quad360 doesn't store uploaded files — this shows whether your recorded data is complete
                        enough to generate each document, not whether a file exists.
                    </Text>
                    {pack.documents.map(d => (
                        <View key={d.id} style={fp.docRow}>
                            <Text style={fp.docIcon}>{d.ready ? '✅' : '⚠️'}</Text>
                            <View style={{ flex: 1 }}>
                                <Text style={fp.docLabel}>{d.label}</Text>
                                <Text style={fp.docDetail}>{d.detail}</Text>
                            </View>
                        </View>
                    ))}
                </View>
                </>
                )}
            </ScrollView>

            <FooterNav />
        </SafeAreaView>
    );
}

function FpProfileStat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
    return (
        <View style={fp.profileBox}>
            <Text style={fp.profileLabel}>{label}</Text>
            <Text style={[fp.profileValue, color ? { color } : null]}>{value}</Text>
            {sub ? <Text style={fp.profileSub}>{sub}</Text> : null}
        </View>
    );
}

function FpLegendDot({ color, label }: { color: string; label: string }) {
    return (
        <View style={fp.legendRow}>
            <View style={[fp.legendDot, { backgroundColor: color }]} />
            <Text style={fp.legendText}>{label}</Text>
        </View>
    );
}

function LenderCheckpoint({ label, status, description }: { label: string; status: boolean; description: string }) {
    return (
        <View style={s.checkpoint}>
            <View style={[s.checkpointIcon, { backgroundColor: status ? Colors.income + '20' : Colors.expense + '20' }]}>
                <Text style={{ fontSize: 18, color: status ? Colors.income : Colors.expense }}>
                    {status ? '✅' : '⏳'}
                </Text>
            </View>
            <View style={{ flex: 1 }}>
                <Text style={s.checkpointLabel}>{label}</Text>
                <Text style={s.checkpointDesc}>{description}</Text>
            </View>
        </View>
    );
}

function TipItem({ emoji, text }: { emoji: string; text: string }) {
    return (
        <View style={s.tipItem}>
            <Text style={s.tipEmoji}>{emoji}</Text>
            <Text style={s.tipText}>{text}</Text>
        </View>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: 16, paddingBottom: 80 },
    title: { fontSize: 28, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
    subtitle: { fontSize: 14, color: Colors.textSecondary, marginBottom: 16 },
    tabRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
    tabBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    tabBtnText: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
    tabBtnTextActive: { color: '#fff' },
    exportButton: { backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginBottom: 6 },
    exportButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    exportHint: { fontSize: 11.5, color: Colors.textMuted, marginBottom: 20, lineHeight: 16 },
    fiveCsCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 20 },
    fiveCRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
    fiveCHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
    fiveCName: { fontSize: 13.5, fontWeight: '700', color: Colors.textPrimary },
    fiveCBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    fiveCBadgeText: { fontSize: 10, fontWeight: '700' },
    fiveCQuestion: { fontSize: 11.5, color: Colors.textMuted, fontStyle: 'italic', marginBottom: 5 },
    fiveCSummary: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },

    visibilityCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 20 },
    visibilitySub: { fontSize: 12, color: Colors.textSecondary, marginBottom: 14, lineHeight: 17 },
    visibilityRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    visibilityBar: { flex: 1, height: 10, backgroundColor: Colors.muted, borderRadius: 5, overflow: 'hidden' },
    visibilityBarFill: { height: 10, borderRadius: 5 },
    visibilityPct: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary, width: 48, textAlign: 'right' },
    visibilityDetail: { fontSize: 11.5, color: Colors.textMuted, marginTop: 8 },
    visibilityUnlockBox: { marginTop: 10, backgroundColor: Colors.bg, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: Colors.border },
    visibilityUnlockText: { fontSize: 11.5, color: Colors.textSecondary, lineHeight: 16 },
    capacityCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 20, borderLeftWidth: 4, borderLeftColor: Colors.income },
    capacityCardMuted: { borderLeftColor: Colors.textMuted },
    capacitySub: { fontSize: 11.5, color: Colors.textMuted, marginBottom: 12, lineHeight: 16, fontStyle: 'italic' },
    capacityRange: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary, marginBottom: 8 },
    capacityMetaRow: { flexDirection: 'row', gap: 20, marginBottom: 6 },
    capacityMeta: { fontSize: 12, color: Colors.textSecondary },
    capacityMetaVal: { fontWeight: '700', color: Colors.textPrimary },
    capacityRate: { fontSize: 12.5, color: Colors.textSecondary, marginTop: 4 },
    capacityUnavailable: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
    inventoryBackedBox: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: Colors.border },
    inventoryBackedTitle: { fontSize: 12.5, fontWeight: '700', color: Colors.textSecondary, marginBottom: 6 },
    inventoryBackedNote: { fontSize: 11, color: Colors.textMuted, lineHeight: 15, marginTop: 6 },
    scoreCard: {
        backgroundColor: Colors.surface,
        borderRadius: 12,
        padding: 24,
        alignItems: 'center',
        marginBottom: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    scoreEmoji: { fontSize: 48, marginBottom: 8 },
    scoreLabel: { fontSize: 14, color: Colors.textSecondary, marginBottom: 4 },
    scoreValue: { fontSize: 56, fontWeight: 'bold', marginBottom: 4 },
    scoreRating: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary, marginBottom: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.muted, width: '100%', textAlign: 'center' },
    section: { marginBottom: 24, backgroundColor: Colors.surface, borderRadius: 12, padding: 16, borderLeftWidth: 4, borderLeftColor: Colors.primary },
    sectionTitle: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary, marginBottom: 12 },

    trendEmpty: { fontSize: 12.5, color: Colors.textMuted, lineHeight: 18, fontStyle: 'italic' },
    trendChartArea: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 84, marginBottom: 10 },
    trendBarCol: { flex: 1, alignItems: 'center' },
    trendBarTrack: { height: 64, width: '100%', justifyContent: 'flex-end', alignItems: 'center' },
    trendBar: { width: '55%', borderRadius: 2, minHeight: 4 },
    trendBarValue: { fontSize: 11, fontWeight: '700', color: Colors.primary, marginTop: 4 },
    trendSummary: { fontSize: 13, fontWeight: '600', lineHeight: 19, marginBottom: 8 },
    trendFactorsBox: { backgroundColor: Colors.bg, borderRadius: 8, padding: 10, marginBottom: 8 },
    trendFactorGood: { fontSize: 12, color: Colors.income, lineHeight: 18 },
    trendFactorBad: { fontSize: 12, color: Colors.expense, lineHeight: 18 },
    trendFootnote: { fontSize: 10.5, color: Colors.textMuted, fontStyle: 'italic' },
    improvementCard: { backgroundColor: Colors.bg, borderRadius: 8, padding: 12, marginBottom: 12 },
    improvementHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    improvementName: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
    improvementScore: { fontSize: 14, fontWeight: '700' },
    improvementDescription: { fontSize: 12, color: Colors.textSecondary, marginBottom: 8 },
    progressBar: { height: 6, backgroundColor: Colors.muted, borderRadius: 3, overflow: 'hidden', marginBottom: 8 },
    progressFill: { height: 6, borderRadius: 3 },
    tipsList: { gap: 4 },
    tipItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    factorCard: { backgroundColor: Colors.bg, borderRadius: 8, padding: 12, marginBottom: 12 },
    factorHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
    factorName: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
    factorDescription: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
    factorScore: { fontSize: 14, fontWeight: '700' },
    factorStatus: { fontSize: 10, color: Colors.textSecondary, marginTop: 2 },
    checkpoint: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.muted, gap: 12 },
    checkpointIcon: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    checkpointLabel: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
    checkpointDesc: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
    tipsBox: { backgroundColor: Colors.primary + '15', borderRadius: 12, padding: 16, borderLeftWidth: 4, borderLeftColor: Colors.primary },
    tipsTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, marginBottom: 12 },
    tipEmoji: { fontSize: 16, marginRight: 8, marginTop: 4 },
    tipText: { fontSize: 12, color: Colors.textPrimary, flex: 1, lineHeight: 18 },
});

// Funding Pack tab — styles carried over from the retired
// FundingQualificationScreen, namespaced to avoid colliding with the
// Credit Profile tab's `s` styles above (e.g. both had a `scoreCard`).
const fp = StyleSheet.create({
    subtitle: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18, marginBottom: 16 },
    card: { backgroundColor: Colors.card, borderRadius: 14, padding: 16, marginBottom: 16 },
    cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 10 },
    businessName: { fontSize: 12, color: Colors.textMuted, marginBottom: 12 },
    profileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    emptyText: { fontSize: 12, color: Colors.textMuted },
    trendChart: { flexDirection: 'row', alignItems: 'flex-end', height: 100, gap: 4 },
    trendCol: { flex: 1, alignItems: 'center' },
    trendBars: { flexDirection: 'row', gap: 2, height: 80, alignItems: 'flex-end' },
    trendBar: { width: 5, borderRadius: 2, minHeight: 2 },
    trendLabel: { fontSize: 8, color: Colors.textMuted, marginTop: 4 },
    trendLegend: { flexDirection: 'row', gap: 16, marginTop: 12, justifyContent: 'center' },
    riskRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
    riskLabel: { flex: 1, fontSize: 12.5, color: Colors.textSecondary, fontWeight: '600' },
    riskStatus: { fontSize: 12.5, fontWeight: '700' },
    scoreCard: { backgroundColor: Colors.card, borderRadius: 14, borderTopWidth: 4, padding: 16, marginBottom: 16, alignItems: 'center' },
    scoreValue: { fontSize: 28, fontWeight: '800', marginVertical: 8 },
    scoreCaveat: { fontSize: 11.5, color: Colors.textMuted, textAlign: 'center', lineHeight: 16, marginBottom: 10 },
    actionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8 },
    actionNumber: {
        fontSize: 12, fontWeight: '800', color: Colors.primary,
        backgroundColor: Colors.primary + '22', borderRadius: 10,
        width: 20, height: 20, textAlign: 'center', lineHeight: 20,
    },
    actionText: { flex: 1, fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },
    actionImpactText: { fontSize: 11, color: Colors.expense, fontWeight: '600', marginTop: 3 },
    improvementBlock: { marginTop: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border },
    improvementLabel: { fontSize: 11.5, fontWeight: '700', color: Colors.textMuted, marginBottom: 6, textTransform: 'uppercase' },
    improvementScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    improvementCurrent: { fontSize: 16, fontWeight: '700', color: Colors.textMuted },
    improvementProjected: { fontSize: 18, fontWeight: '800' },
    improvementProjectedBand: { fontSize: 12, color: Colors.textMuted },
    improvementCaveat: { fontSize: 10.5, color: Colors.textMuted, marginTop: 6, fontStyle: 'italic' },
    docsHint: { fontSize: 11, color: Colors.textMuted, marginBottom: 12, lineHeight: 16, fontStyle: 'italic' },
    docRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 10 },
    docIcon: { fontSize: 14 },
    docLabel: { fontSize: 12.5, fontWeight: '600', color: Colors.textPrimary },
    docDetail: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
    profileBox: { width: '31%', backgroundColor: Colors.bg, borderRadius: 10, padding: 10 },
    profileLabel: { fontSize: 9.5, color: Colors.textMuted, fontWeight: '600', marginBottom: 4 },
    profileValue: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
    profileSub: { fontSize: 9, color: Colors.textMuted, marginTop: 2 },
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { fontSize: 11, color: Colors.textMuted },
});
