import React, { useMemo, useState } from 'react';
import {
    SafeAreaView, ScrollView, View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions, Alert,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { monthlyPayment as calcMonthlyPayment } from '../utils/loanMath';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import LowDataNotice from '../components/LowDataNotice';
import NextStepLink from '../components/NextStepLink';
import { generatePDF, sharePDF } from '../utils/pdfExport';
import { buildLenderSummaryExport } from '../utils/lenderSummaryExport';
import { computeDSCR, computeRiskScore, RiskScore } from '../utils/finance';
import { computeLendingCapacityEstimate } from '../utils/lendingCapacity';
import { computeDataQuality } from '../utils/dataQuality';
import { computeInventoryValue } from '../utils/stockVelocity';

export default function CreditWorthinessScreen() {
    const { user, finance, transactions, loans, navigate, settings, inventory } = useApp();
    const { currency } = settings;

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
        const currentDebt = loans.reduce((sum, l) => sum + ((l.principal || 0) - ((l.payments ?? []).reduce((s: number, p: any) => s + (p.amount || 0), 0) || 0)), 0);

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

    const BAND_STYLE: Record<RiskScore['band'], { label: string; color: string; emoji: string }> = {
        Excellent: { label: 'Excellent', color: Colors.income, emoji: '💎' },
        Strong: { label: 'Strong', color: '#10b981', emoji: '✅' },
        Moderate: { label: 'Moderate', color: Colors.warning, emoji: '⚠️' },
        Weak: { label: 'Weak', color: '#fb923c', emoji: '⚠️' },
        Critical: { label: 'Critical', color: Colors.expense, emoji: '⛔' },
    };
    const creditRating = useMemo(() => BAND_STYLE[risk.band], [risk.band]);

    const topFactors = useMemo(() => {
        return [...risk.factors].sort((a, b) => a.score - b.score).slice(0, 2);
    }, [risk.factors]);

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
    const lendingCapacity = useMemo(() => computeLendingCapacityEstimate({
        overallCreditScore,
        avgMonthlyRevenue: user?.avgMonthlyRevenue || 0,
        dscr: dscrResult.dscr,
        hasReliableData: dataQuality.confidence !== 'none' && dataQuality.confidence !== 'limited',
        inventoryValue,
    }), [overallCreditScore, user?.avgMonthlyRevenue, dscrResult.dscr, dataQuality.confidence, inventoryValue]);

    const [exporting, setExporting] = useState(false);

    const handleExportLenderSummary = async () => {
        setExporting(true);
        try {
            const exportData = buildLenderSummaryExport({
                businessName: user?.businessName || 'Your Business',
                currency,
                overallCreditScore,
                creditRatingLabel: creditRating.label,
                // The canonical 7-factor breakdown, not the 5 supplementary
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
            Alert.alert('Export failed', 'Could not generate the lender-ready summary. Please try again.');
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

                    {/* Score Breakdown — the same 7-pillar composition
                        Financial Health and the Funding Readiness Pack use */}
                    <View style={s.scoreBreakdown}>
                        <Text style={s.breakdownLabel}>Score Composition:</Text>
                        {risk.factors.map((factor, idx) => (
                            <View key={idx} style={s.breakdownItem}>
                                <Text style={s.breakdownName}>{factor.name}</Text>
                                <Text style={s.breakdownWeight}>
                                    {Math.round(factor.score * factor.weight / 100)} ({Math.round(factor.weight)}%)
                                </Text>
                            </View>
                        ))}
                    </View>
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
            </ScrollView>

            <FooterNav />
        </SafeAreaView>
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
    exportButton: { backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginBottom: 6 },
    exportButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    exportHint: { fontSize: 11.5, color: Colors.textMuted, marginBottom: 20, lineHeight: 16 },
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
    scoreBreakdown: { width: '100%', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: Colors.muted },
    breakdownLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 8 },
    breakdownItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
    breakdownName: { fontSize: 11, color: Colors.textPrimary },
    breakdownWeight: { fontSize: 11, fontWeight: '600', color: Colors.primary },
    section: { marginBottom: 24, backgroundColor: Colors.surface, borderRadius: 12, padding: 16, borderLeftWidth: 4, borderLeftColor: Colors.primary },
    sectionTitle: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary, marginBottom: 12 },
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
