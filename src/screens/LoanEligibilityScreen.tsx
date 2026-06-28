import React, { useMemo, useState } from 'react';
import {
    SafeAreaView, ScrollView, View, Text, TouchableOpacity, StyleSheet, Modal, Alert,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';

export default function LoanEligibilityScreen() {
    const { user, finance, navigate, financing, applyForMerchantFinancing, settings } = useApp();
    const { currency } = settings;
    const [selectedLoan, setSelectedLoan] = useState<string | null>(null);

    // Calculate eligibility for different loan types
    const loanOptions = useMemo(() => {
        const options = [];

        // 1. Merchant Financing (Quad360)
        const merchantFinancingEligible = (user?.daysActive || 0) >= 90
            && (user?.avgMonthlyRevenue || 0) >= 200000
            && (user?.financialHealthScore || 0) >= 50;

        options.push({
            id: 'merchant-financing',
            name: 'Merchant Financing',
            provider: 'Quad360',
            description: 'Fast, flexible capital for inventory and operations',
            emoji: '⚡',
            loanAmount: { min: 2000000, max: Math.min(5000000, ((user?.avgMonthlyProfit || 0) * 12)) },
            interestRate: 18,
            termMonths: 60,
            processingTime: '2 hours',
            fundingTime: '24 hours',
            requirements: [
                { label: 'Business Age', value: `${user?.daysActive || 0} days`, met: (user?.daysActive || 0) >= 90 },
                { label: 'Monthly Revenue', value: `${currency}${(user?.avgMonthlyRevenue || 0).toLocaleString()}`, met: (user?.avgMonthlyRevenue || 0) >= 200000 },
                { label: 'Health Score', value: `${user?.financialHealthScore || 0}/100`, met: (user?.financialHealthScore || 0) >= 50 },
            ],
            eligible: merchantFinancingEligible,
            pros: ['Fast approval', 'No collateral needed', 'Flexible use of funds', 'Instant funding'],
            cons: ['Higher interest rate', 'Shorter term', 'Monthly payments required'],
            status: financing?.activeLoan ? 'Already Active' : financing?.application ? 'Pending' : 'Apply Now',
        });

        // 2. Bank Personal Loan
        const bankLoanEligible = (user?.daysActive || 0) >= 180
            && (user?.avgMonthlyRevenue || 0) >= 500000
            && (user?.financialHealthScore || 0) >= 70;

        options.push({
            id: 'bank-personal',
            name: 'Bank Personal Loan',
            provider: 'Traditional Banks',
            description: 'Unsecured personal loan from traditional banks',
            emoji: '🏦',
            loanAmount: { min: 500000, max: 5000000 },
            interestRate: 12,
            termMonths: 60,
            processingTime: '5-7 days',
            fundingTime: '2-3 days',
            requirements: [
                { label: 'Business Age', value: `${user?.daysActive || 0} days`, met: (user?.daysActive || 0) >= 180 },
                { label: 'Monthly Revenue', value: `${currency}${(user?.avgMonthlyRevenue || 0).toLocaleString()}`, met: (user?.avgMonthlyRevenue || 0) >= 500000 },
                { label: 'Credit Score', value: `${user?.financialHealthScore || 0}/100`, met: (user?.financialHealthScore || 0) >= 70 },
            ],
            eligible: bankLoanEligible,
            pros: ['Lower interest rate', 'Longer repayment period', 'Professional lender', 'Flexible use'],
            cons: ['Longer approval time', 'Strict requirements', 'Credit checks', 'Requires documentation'],
            status: bankLoanEligible ? 'Ready to Apply' : 'Not Eligible Yet',
        });

        // 3. Equipment Financing
        const equipmentEligible = (user?.daysActive || 0) >= 90
            && (user?.avgMonthlyRevenue || 0) >= 300000;

        options.push({
            id: 'equipment-financing',
            name: 'Equipment Financing',
            provider: 'Finance Companies',
            description: 'Loans specifically for purchasing equipment/machinery',
            emoji: '🏭',
            loanAmount: { min: 1000000, max: 10000000 },
            interestRate: 14,
            termMonths: 84,
            processingTime: '3-5 days',
            fundingTime: '1-2 days',
            requirements: [
                { label: 'Business Age', value: `${user?.daysActive || 0} days`, met: (user?.daysActive || 0) >= 90 },
                { label: 'Monthly Revenue', value: `${currency}${(user?.avgMonthlyRevenue || 0).toLocaleString()}`, met: (user?.avgMonthlyRevenue || 0) >= 300000 },
                { label: 'Business Plan', value: 'Equipment list required', met: true },
            ],
            eligible: equipmentEligible,
            pros: ['Equipment is collateral', 'Longer term available', 'Competitive rates', 'Asset building'],
            cons: ['Equipment-use only', 'Asset is collateral', 'Requires quotes', 'Depreciation risk'],
            status: equipmentEligible ? 'Ready to Apply' : 'Not Eligible Yet',
        });

        // 4. Trade Credit/Supplier Financing
        const tradeEligible = (user?.daysActive || 0) >= 30;

        options.push({
            id: 'trade-credit',
            name: 'Trade Credit (Supplier)',
            provider: 'Your Suppliers',
            description: 'Extended payment terms from your suppliers',
            emoji: '🤝',
            loanAmount: { min: 100000, max: 2000000 },
            interestRate: 0,
            termMonths: 3,
            processingTime: 'Immediate',
            fundingTime: 'Upon delivery',
            requirements: [
                { label: 'Supplier Relationship', value: 'Established', met: true },
                { label: 'Payment History', value: 'Good standing', met: true },
                { label: 'Business Age', value: `${user?.daysActive || 0} days`, met: (user?.daysActive || 0) >= 30 },
            ],
            eligible: tradeEligible,
            pros: ['Zero interest', 'Fast approval', 'No credit check', 'Flexible terms'],
            cons: ['Limited amounts', 'Supplier dependent', 'Short term', 'Stock-only'],
            status: tradeEligible ? 'Talk to Suppliers' : 'Not Eligible Yet',
        });

        return options;
    }, [user, financing, currency]);

    const eligibleCount = loanOptions.filter(l => l.eligible).length;

    const handleApplyLoan = (loanId: string) => {
        const loan = loanOptions.find(l => l.id === loanId);
        if (loanId === 'merchant-financing') {
            if (financing?.activeLoan) {
                Alert.alert('Info', 'You already have an active merchant financing loan');
            } else if (financing?.application) {
                Alert.alert('Info', 'Your application is pending approval');
            } else {
                navigate('loans');
            }
        } else {
            Alert.alert('Coming Soon', `${loan?.name} applications will be available soon in Quad360 Pro`);
        }
    };

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
                <TouchableOpacity onPress={() => navigate('dashboard')}>
                    <Text style={{ color: Colors.primary, fontSize: 14, marginBottom: 12 }}>← Dashboard</Text>
                </TouchableOpacity>

                <Text style={s.title}>💰 Loan Options</Text>
                <Text style={s.subtitle}>Compare and apply for different loan types</Text>

                {/* Eligibility Summary */}
                <View style={s.summaryBox}>
                    <Text style={s.summaryTitle}>Your Eligibility</Text>
                    <View style={s.summaryStats}>
                        <View style={s.statBox}>
                            <Text style={s.statValue}>{eligibleCount}</Text>
                            <Text style={s.statLabel}>loans eligible</Text>
                        </View>
                        <View style={s.statBox}>
                            <Text style={s.statValue}>{Math.round(user?.financialHealthScore || 0)}</Text>
                            <Text style={s.statLabel}>health score</Text>
                        </View>
                        <View style={s.statBox}>
                            <Text style={s.statValue}>{Math.round((user?.daysActive || 0) / 30)}</Text>
                            <Text style={s.statLabel}>months active</Text>
                        </View>
                    </View>
                </View>

                {/* Loan Options */}
                {loanOptions.map(loan => (
                    <LoanCard
                        key={loan.id}
                        loan={loan}
                        onPress={() => {
                            setSelectedLoan(loan.id);
                        }}
                        onApply={() => handleApplyLoan(loan.id)}
                        currency={currency}
                    />
                ))}

                {/* Tips Section */}
                <View style={s.section}>
                    <Text style={s.sectionTitle}>💡 Tips for Loan Applications</Text>
                    <TipItem emoji="📊" text="Keep your Quad360 data updated - lenders will verify your financials" />
                    <TipItem emoji="✅" text="Improve your health score - on-time payments are crucial" />
                    <TipItem emoji="📈" text="Show consistent revenue - trending up is better for approval" />
                    <TipItem emoji="📝" text="Prepare documentation - have tax returns and bank statements ready" />
                    <TipItem emoji="⏱️" text="Apply when needed - credit inquiries may temporarily lower your score" />
                    <TipItem emoji="🎯" text="Start with Quad360 - fastest approval and no collateral needed" />
                </View>
            </ScrollView>

            {/* Loan Details Modal */}
            {selectedLoan && (
                <LoanDetailsModal
                    loan={loanOptions.find(l => l.id === selectedLoan)!}
                    onClose={() => setSelectedLoan(null)}
                    onApply={() => {
                        handleApplyLoan(selectedLoan);
                        setSelectedLoan(null);
                    }}
                    currency={currency}
                />
            )}

            <FooterNav />
        </SafeAreaView>
    );
}

function LoanCard({ loan, onPress, onApply, currency }: any) {
    const statusColor = loan.eligible ? Colors.income : Colors.warning;
    const statusBg = loan.eligible ? Colors.income + '15' : Colors.warning + '15';

    return (
        <TouchableOpacity style={s.loanCard} onPress={onPress} activeOpacity={0.9}>
            <View style={s.loanHeader}>
                <View style={{ flex: 1 }}>
                    <View style={s.loanTitleRow}>
                        <Text style={s.loanEmoji}>{loan.emoji}</Text>
                        <View>
                            <Text style={s.loanName}>{loan.name}</Text>
                            <Text style={s.loanProvider}>{loan.provider}</Text>
                        </View>
                    </View>
                </View>
                <View style={[s.statusBadge, { backgroundColor: statusBg }]}>
                    <Text style={[s.statusText, { color: statusColor }]}>{loan.status}</Text>
                </View>
            </View>

            <Text style={s.loanDescription}>{loan.description}</Text>

            {/* Key Details */}
            <View style={s.keyDetails}>
                <DetailItem label="Amount" value={`${currency}${(loan.loanAmount.min / 1000000).toFixed(1)}M - ${(loan.loanAmount.max / 1000000).toFixed(1)}M`} />
                <DetailItem label="Rate" value={`${loan.interestRate}% p.a.`} />
                <DetailItem label="Term" value={`${loan.termMonths} months`} />
                <DetailItem label="Approval" value={loan.processingTime} />
            </View>

            {/* Requirements Status */}
            <View style={s.requirementsBox}>
                <Text style={s.requirementsTitle}>Requirements:</Text>
                {loan.requirements.map((req: any, idx: number) => (
                    <View key={idx} style={s.requirementRow}>
                        <Text style={[s.requirementCheck, { color: req.met ? Colors.income : Colors.warning }]}>
                            {req.met ? '✅' : '⏳'}
                        </Text>
                        <Text style={s.requirementText}>{req.label}</Text>
                        <Text style={[s.requirementValue, { color: req.met ? Colors.income : Colors.warning }]}>
                            {req.value}
                        </Text>
                    </View>
                ))}
            </View>

            <TouchableOpacity
                style={[s.applyBtn, !loan.eligible && s.applyBtnDisabled]}
                onPress={onApply}
                disabled={!loan.eligible && loan.id !== 'merchant-financing'}
            >
                <Text style={s.applyBtnText}>{loan.status}</Text>
            </TouchableOpacity>
        </TouchableOpacity>
    );
}

function DetailItem({ label, value }: { label: string; value: string }) {
    return (
        <View style={s.detailItem}>
            <Text style={s.detailLabel}>{label}</Text>
            <Text style={s.detailValue}>{value}</Text>
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

function LoanDetailsModal({ loan, onClose, onApply, currency }: any) {
    return (
        <Modal visible={true} animationType="slide" transparent>
            <SafeAreaView style={s.modalSafe}>
                <ScrollView style={s.modalScroll}>
                    <View style={s.modalContent}>
                        <TouchableOpacity onPress={onClose}>
                            <Text style={s.modalClose}>✕ Close</Text>
                        </TouchableOpacity>

                        <Text style={s.modalTitle}>{loan.emoji} {loan.name}</Text>
                        <Text style={s.modalProvider}>{loan.provider}</Text>

                        {/* Full Details */}
                        <View style={s.modalSection}>
                            <Text style={s.modalSectionTitle}>Loan Details</Text>
                            <DetailRow label="Loan Amount" value={`${currency}${(loan.loanAmount.min / 1000000).toFixed(1)}M - ${(loan.loanAmount.max / 1000000).toFixed(1)}M`} />
                            <DetailRow label="Interest Rate" value={`${loan.interestRate}% per annum`} />
                            <DetailRow label="Loan Term" value={`${loan.termMonths} months`} />
                            <DetailRow label="Processing Time" value={loan.processingTime} />
                            <DetailRow label="Funding Time" value={loan.fundingTime} />
                        </View>

                        {/* Pros */}
                        <View style={s.modalSection}>
                            <Text style={s.modalSectionTitle}>✅ Advantages</Text>
                            {loan.pros.map((pro: string, idx: number) => (
                                <Text key={idx} style={s.listItem}>✓ {pro}</Text>
                            ))}
                        </View>

                        {/* Cons */}
                        <View style={s.modalSection}>
                            <Text style={s.modalSectionTitle}>⚠️ Considerations</Text>
                            {loan.cons.map((con: string, idx: number) => (
                                <Text key={idx} style={s.listItem}>• {con}</Text>
                            ))}
                        </View>

                        {/* Action */}
                        <TouchableOpacity style={s.modalApplyBtn} onPress={onApply}>
                            <Text style={s.modalApplyBtnText}>{loan.status}</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </SafeAreaView>
        </Modal>
    );
}

function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <View style={s.detailRow}>
            <Text style={s.detailRowLabel}>{label}</Text>
            <Text style={s.detailRowValue}>{value}</Text>
        </View>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: 16, paddingBottom: 80 },
    title: { fontSize: 28, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
    subtitle: { fontSize: 14, color: Colors.textSecondary, marginBottom: 24 },
    summaryBox: { backgroundColor: Colors.primary + '15', borderRadius: 12, padding: 16, marginBottom: 24, borderLeftWidth: 4, borderLeftColor: Colors.primary },
    summaryTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, marginBottom: 12 },
    summaryStats: { flexDirection: 'row', gap: 12 },
    statBox: { flex: 1, backgroundColor: Colors.bg, borderRadius: 8, padding: 12, alignItems: 'center' },
    statValue: { fontSize: 20, fontWeight: 'bold', color: Colors.primary },
    statLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 4 },
    loanCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12, borderTopWidth: 3, borderTopColor: Colors.primary },
    loanHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
    loanTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    loanEmoji: { fontSize: 32 },
    loanName: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
    loanProvider: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
    statusBadge: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6 },
    statusText: { fontSize: 11, fontWeight: '600' },
    loanDescription: { fontSize: 12, color: Colors.textSecondary, marginBottom: 12 },
    keyDetails: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    detailItem: { flex: 1, minWidth: '48%', backgroundColor: Colors.bg, padding: 8, borderRadius: 6 },
    detailLabel: { fontSize: 10, color: Colors.textSecondary },
    detailValue: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, marginTop: 4 },
    requirementsBox: { backgroundColor: Colors.bg, borderRadius: 8, padding: 12, marginBottom: 12 },
    requirementsTitle: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary, marginBottom: 8 },
    requirementRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 },
    requirementCheck: { fontSize: 14 },
    requirementText: { flex: 1, fontSize: 12, color: Colors.textSecondary },
    requirementValue: { fontSize: 12, fontWeight: '600' },
    applyBtn: { backgroundColor: Colors.primary, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
    applyBtnDisabled: { backgroundColor: Colors.muted },
    applyBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
    section: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, borderLeftWidth: 4, borderLeftColor: Colors.primary, marginBottom: 24 },
    sectionTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, marginBottom: 12 },
    tipItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 8 },
    tipEmoji: { fontSize: 16 },
    tipText: { fontSize: 12, color: Colors.textSecondary, flex: 1, lineHeight: 18 },
    modalSafe: { flex: 1, backgroundColor: Colors.bg },
    modalScroll: { flex: 1 },
    modalContent: { padding: 16, paddingBottom: 40 },
    modalClose: { color: Colors.primary, fontSize: 14, fontWeight: '600', marginBottom: 16 },
    modalTitle: { fontSize: 24, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
    modalProvider: { fontSize: 13, color: Colors.textSecondary, marginBottom: 20 },
    modalSection: { marginBottom: 20, backgroundColor: Colors.surface, borderRadius: 12, padding: 16 },
    modalSectionTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, marginBottom: 12 },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.muted },
    detailRowLabel: { fontSize: 12, color: Colors.textSecondary },
    detailRowValue: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
    listItem: { fontSize: 12, color: Colors.textSecondary, marginBottom: 6, lineHeight: 18 },
    modalApplyBtn: { backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
    modalApplyBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
