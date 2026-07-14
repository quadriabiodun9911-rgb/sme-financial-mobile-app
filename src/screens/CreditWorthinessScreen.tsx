import React, { useMemo } from 'react';
import {
    SafeAreaView, ScrollView, View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';

export default function CreditWorthinessScreen() {
    const { user, finance, transactions, loans, navigate, settings } = useApp();
    const { currency } = settings;

    // Calculate credit factors
    const creditFactors = useMemo(() => {
        const factors = [];

        // 1. Payment History (30% weight)
        const totalDuePayments = loans.reduce((sum, l) => {
            const paid = (l.payments ?? []).reduce((s: number, p: any) => s + (p.amount || 0), 0);
            const monthlyPayment = (l.principal * (l.interestRate / 100 / 12)) / (1 - Math.pow(1 + (l.interestRate / 100 / 12), -l.termMonths));
            const expectedPayments = Math.floor((new Date().getTime() - new Date(l.startDate).getTime()) / (1000 * 60 * 60 * 24 * 30)) * monthlyPayment;
            return sum + Math.max(0, expectedPayments - paid);
        }, 0);

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

        // 2. Credit Utilization (25% weight)
        const availableCredit = (user?.avgMonthlyProfit || 0) * 6; // 6 months of profit = available credit
        const currentDebt = loans.reduce((sum, l) => sum + ((l.principal || 0) - ((l.payments ?? []).reduce((s: number, p: any) => s + (p.amount || 0), 0) || 0)), 0);
        const creditUtilization = availableCredit > 0 ? (currentDebt / availableCredit) * 100 : 0;
        const utilizationScore = Math.max(0, 100 - (creditUtilization * 1.5)); // Lower is better

        factors.push({
            name: 'Credit Utilization',
            score: utilizationScore,
            weight: 0.25,
            description: 'Debt vs available credit',
            status: utilizationScore >= 80 ? 'Excellent' : utilizationScore >= 60 ? 'Good' : 'High Risk',
            tips: [
                'Keep debt below 30% of available credit',
                'Pay down loans when possible',
                'Avoid taking multiple loans at once',
            ],
        });

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

    // Calculate overall credit score
    const overallCreditScore = useMemo(() => {
        return creditFactors.reduce((sum, factor) => sum + (factor.score * factor.weight), 0);
    }, [creditFactors]);

    const creditRating = useMemo(() => {
        if (overallCreditScore >= 80) return { label: 'Excellent', color: Colors.income, emoji: '💎' };
        if (overallCreditScore >= 70) return { label: 'Good', color: '#10b981', emoji: '✅' };
        if (overallCreditScore >= 60) return { label: 'Fair', color: Colors.warning, emoji: '⚠️' };
        return { label: 'Poor', color: Colors.expense, emoji: '⛔' };
    }, [overallCreditScore]);

    const topFactors = useMemo(() => {
        return [...creditFactors].sort((a, b) => a.score - b.score).slice(0, 2);
    }, [creditFactors]);

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
                <TouchableOpacity onPress={() => navigate('dashboard')}>
                    <Text style={{ color: Colors.primary, fontSize: 14, marginBottom: 12 }}>← Dashboard</Text>
                </TouchableOpacity>

                <Text style={s.title}>💳 Credit-Worthiness</Text>
                <Text style={s.subtitle}>Track factors that lenders evaluate</Text>

                {/* Overall Score Card */}
                <View style={[s.scoreCard, { borderTopColor: creditRating.color, borderTopWidth: 4 }]}>
                    <Text style={s.scoreEmoji}>{creditRating.emoji}</Text>
                    <Text style={s.scoreLabel}>Your Credit Score</Text>
                    <Text style={[s.scoreValue, { color: creditRating.color }]}>
                        {Math.round(overallCreditScore)}
                    </Text>
                    <Text style={s.scoreRating}>{creditRating.label} Credit Profile</Text>

                    {/* Score Breakdown */}
                    <View style={s.scoreBreakdown}>
                        <Text style={s.breakdownLabel}>Score Composition:</Text>
                        {creditFactors.map((factor, idx) => (
                            <View key={idx} style={s.breakdownItem}>
                                <Text style={s.breakdownName}>{factor.name}</Text>
                                <Text style={s.breakdownWeight}>
                                    {Math.round(factor.score * factor.weight)} ({Math.round(factor.weight * 100)}%)
                                </Text>
                            </View>
                        ))}
                    </View>
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
                                <Text style={s.improvementDescription}>{factor.description}</Text>
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
                                <View style={s.tipsList}>
                                    {factor.tips.map((tip, tipIdx) => (
                                        <Text key={tipIdx} style={s.tipItem}>
                                            ✓ {tip}
                                        </Text>
                                    ))}
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {/* All Credit Factors */}
                <View style={s.section}>
                    <Text style={s.sectionTitle}>📊 All Credit Factors</Text>
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
                    <LenderCheckpoint label="Credit Score" status={overallCreditScore >= 70} description="70+ score increases approval odds" />
                    <LenderCheckpoint label="Payment History" status={creditFactors[0]?.score >= 80} description="On-time payment record" />
                    <LenderCheckpoint label="Cash Flow" status={!!(finance.runway && finance.runway >= 90)} description="3+ months runway" />
                    <LenderCheckpoint label="Revenue Level" status={(user?.avgMonthlyRevenue || 0) >= 200000} description={`${currency}200k+ monthly revenue`} />
                    <LenderCheckpoint label="Business Age" status={(user?.daysActive || 0) >= 90} description="90+ days operating history" />
                    <LenderCheckpoint label="Debt Ratio" status={creditFactors[1]?.score >= 70} description="Debt < 30% of available credit" />
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
    subtitle: { fontSize: 14, color: Colors.textSecondary, marginBottom: 24 },
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
