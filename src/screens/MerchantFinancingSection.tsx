import React, { useState, useMemo } from 'react';
import {
    SafeAreaView, ScrollView, View, Text, TextInput,
    TouchableOpacity, StyleSheet, Modal, Alert, Platform, Slider,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import DateInput from '../components/DateInput';

// ── MAIN SECTION COMPONENT ────────────────────────────────────────────────────

export default function MerchantFinancingSection() {
    const { user, financing, addMerchantLoan, updateMerchantLoan, settings, navigate } = useApp();
    const { currency } = settings;

    const [showApplyModal, setShowApplyModal] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Check qualification
    const isQualified = useMemo(() => {
        return (user?.daysActive || 0) >= 90
            && (user?.avgMonthlyRevenue || 0) >= 200000
            && (user?.financialHealthScore || 0) >= 50;
    }, [user?.daysActive, user?.avgMonthlyRevenue, user?.financialHealthScore]);

    const hasApplied = financing?.applicationStatus !== null;
    const isApproved = financing?.applicationStatus === 'approved' || financing?.applicationStatus === 'funded';
    const hasActiveLoan = financing?.activeLoan !== null;

    return (
        <View style={s.container}>
            {/* SECTION 1: Pre-Qualification Widget */}
            {isQualified && !hasActiveLoan && (
                <PreQualificationWidget
                    maxLoan={financing?.maxQualifiedAmount || 5000000}
                    minLoan={financing?.minQualifiedAmount || 2000000}
                    readinessScore={user?.financialHealthScore || 0}
                    currency={currency}
                    onApply={() => setShowApplyModal(true)}
                />
            )}

            {/* SECTION 2: Active Merchant Loan */}
            {hasActiveLoan && financing?.activeLoan && (
                <ActiveMerchantLoanCard
                    loan={financing.activeLoan}
                    currency={currency}
                    expanded={expandedId === 'active'}
                    onToggle={() => setExpandedId(expandedId === 'active' ? null : 'active')}
                />
            )}

            {/* SECTION 3: Application Status (Pending/Rejected) */}
            {hasApplied && !isApproved && financing?.application && (
                <ApplicationStatusCard
                    application={financing.application}
                    currency={currency}
                />
            )}

            {/* SECTION 4: Application History */}
            {financing?.pastApplications && financing.pastApplications.length > 0 && (
                <View style={s.historySection}>
                    <Text style={s.sectionTitle}>Previous Applications</Text>
                    {financing.pastApplications.map((app, idx) => (
                        <PastApplicationCard
                            key={idx}
                            application={app}
                            currency={currency}
                            onReapply={() => setShowApplyModal(true)}
                        />
                    ))}
                </View>
            )}

            {/* EMPTY STATE: Not Qualified Yet */}
            {!isQualified && !hasActiveLoan && (
                <NotQualifiedState
                    daysActive={user?.daysActive || 0}
                    monthlyRevenue={user?.avgMonthlyRevenue || 0}
                    healthScore={user?.financialHealthScore || 0}
                    currency={currency}
                />
            )}

            {/* EMPTY STATE: No Activity */}
            {isQualified && !hasActiveLoan && !hasApplied && (
                <QualifiedEmptyState
                    onApply={() => setShowApplyModal(true)}
                />
            )}

            {/* Apply For Financing Modal */}
            {showApplyModal && (
                <ApplyForFinancingModal
                    visible={showApplyModal}
                    maxLoan={financing?.maxQualifiedAmount || 5000000}
                    minLoan={financing?.minQualifiedAmount || 2000000}
                    monthlyProfit={user?.avgMonthlyProfit || 0}
                    currency={currency}
                    onClose={() => setShowApplyModal(false)}
                    onSubmit={(amount, purpose) => {
                        addMerchantLoan({ amount, purpose });
                        setShowApplyModal(false);
                    }}
                />
            )}
        </View>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ────────────────────────────────────────────────────────────────────────────

/**
 * PRE-QUALIFICATION WIDGET
 * Shows SME they're eligible and invites them to apply
 */
function PreQualificationWidget({ maxLoan, minLoan, readinessScore, currency, onApply }: {
    maxLoan: number;
    minLoan: number;
    readinessScore: number;
    currency: string;
    onApply: () => void;
}) {
    const scoreLevel = readinessScore >= 80 ? 'excellent' : readinessScore >= 60 ? 'good' : 'fair';
    const scoreColor = scoreLevel === 'excellent' ? Colors.income : scoreLevel === 'good' ? Colors.primary : Colors.warning;

    return (
        <View style={s.preQualCard}>
            {/* Header */}
            <View style={s.preQualHeader}>
                <View>
                    <Text style={s.preQualBadge}>✅ PRE-QUALIFIED</Text>
                    <Text style={s.preQualTitle}>Inventory Financing Available</Text>
                </View>
                <Text style={[s.scoreCircle, { backgroundColor: scoreColor }]}>
                    {readinessScore}
                </Text>
            </View>

            {/* Amount Range */}
            <View style={s.preQualRange}>
                <Text style={s.rangeLabel}>Financing Range</Text>
                <Text style={s.rangeValue}>
                    {currency}{minLoan.toLocaleString()} – {currency}{maxLoan.toLocaleString()}
                </Text>
                <View style={s.rangeBar}>
                    <View style={[s.rangeFill, { width: '100%' }]} />
                </View>
            </View>

            {/* Key Metrics */}
            <View style={s.preQualMetrics}>
                <MetricPill label="Readiness" value={`${readinessScore}/100`} color={scoreColor} />
                <MetricPill label="Status" value={scoreLevel} color={scoreColor} />
            </View>

            {/* CTA */}
            <TouchableOpacity style={s.preQualCTA} onPress={onApply}>
                <Text style={s.preQualCTAText}>Start Application</Text>
                <Text style={s.preQualCTASubtext}>~5 min · Instant approval</Text>
            </TouchableOpacity>

            {/* Info Box */}
            <View style={s.infoBox}>
                <Text style={s.infoIcon}>ℹ️</Text>
                <Text style={s.infoText}>
                    We're pre-approving you based on your Quad360 financial data. No collateral required.
                </Text>
            </View>
        </View>
    );
}

/**
 * ACTIVE MERCHANT LOAN CARD
 * Shows loan details, repayment status, and next payment
 */
function ActiveMerchantLoanCard({ loan, currency, expanded, onToggle }: {
    loan: any;
    currency: string;
    expanded: boolean;
    onToggle: () => void;
}) {
    const balance = loan.approvedAmount - (loan.totalRepaid || 0);
    const progress = Math.min(100, ((loan.totalRepaid || 0) / loan.approvedAmount) * 100);
    const monthlyPayment = loan.monthlyPayment || 0;
    const repaymentCapacity = (loan.monthlyProfitAtApproval || 0) / monthlyPayment;

    const isOnTrack = repaymentCapacity > 3;
    const isTight = repaymentCapacity > 1 && repaymentCapacity <= 3;
    const isRisky = repaymentCapacity <= 1;

    const capacityColor = isOnTrack ? Colors.income : isTight ? Colors.warning : Colors.expense;

    return (
        <View style={s.activeLoanCard}>
            <TouchableOpacity onPress={onToggle} activeOpacity={0.8}>
                {/* Header */}
                <View style={s.activeLoanHeader}>
                    <View>
                        <Text style={s.loanBadge}>💰 MERCHANT FINANCING</Text>
                        <Text style={s.activeLoanTitle}>Approved Inventory Loan</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[s.statusBadge, { color: Colors.income }]}>
                            ✅ {loan.status === 'repaying' ? 'Active' : 'Funded'}
                        </Text>
                        <Text style={s.balanceText}>
                            {currency}{balance.toLocaleString(undefined, { maximumFractionDigits: 0 })} left
                        </Text>
                    </View>
                </View>

                {/* Progress Bar */}
                <View style={s.progressBg}>
                    <View style={[s.progressFill, { width: `${progress}%` as any, backgroundColor: Colors.primary }]} />
                </View>
                <Text style={s.progressLabel}>
                    {progress.toFixed(0)}% repaid · {currency}{(loan.totalRepaid || 0).toLocaleString()} of {currency}{loan.approvedAmount.toLocaleString()}
                </Text>

                {/* Quick Stats */}
                <View style={s.activeLoanMetrics}>
                    <Metric label="Loan Amount" value={`${currency}${loan.approvedAmount.toLocaleString()}`} />
                    <Metric label="Monthly Payment" value={`${currency}${monthlyPayment.toFixed(0)}`} />
                    <Metric label="Rate" value={`${loan.interestRate}% p.a.`} />
                    <Metric label="Capacity" value={`${repaymentCapacity.toFixed(1)}x`} color={capacityColor} />
                </View>
            </TouchableOpacity>

            {/* Expanded Section */}
            {expanded && (
                <View style={s.expandedContent}>
                    {/* Repayment Capacity Gauge */}
                    <RepaymentCapacityGauge
                        monthlyProfit={loan.monthlyProfitCurrent || loan.monthlyProfitAtApproval}
                        monthlyPayment={monthlyPayment}
                        capacityRatio={repaymentCapacity}
                        currency={currency}
                        isOnTrack={isOnTrack}
                        isTight={isTight}
                    />

                    {/* Next Payment */}
                    {loan.nextPaymentDue && (
                        <View style={s.nextPaymentBox}>
                            <Text style={s.nextPaymentLabel}>Next Payment Due</Text>
                            <Text style={s.nextPaymentDate}>{loan.nextPaymentDue}</Text>
                            <Text style={s.nextPaymentAmount}>
                                {currency}{monthlyPayment.toFixed(0)}
                            </Text>
                        </View>
                    )}

                    {/* Loan Details */}
                    <View style={s.loanDetailsBox}>
                        <Text style={s.detailsTitle}>Loan Details</Text>
                        <DetailRow label="Approved Date" value={loan.approvalDate} />
                        <DetailRow label="Funded Date" value={loan.fundingDate} />
                        <DetailRow label="Payoff Date" value={loan.payoffDate} />
                        <DetailRow label="Purpose" value={loan.purpose || 'Inventory'} />
                        <DetailRow label="Lender" value={loan.lenderName || 'Zenith Bank'} />
                    </View>

                    {/* Payment History */}
                    {loan.payments && loan.payments.length > 0 && (
                        <View style={s.paymentHistoryBox}>
                            <Text style={s.paymentHistoryTitle}>Recent Payments</Text>
                            {loan.payments.slice(-3).reverse().map((p: any, idx: number) => (
                                <View key={idx} style={s.paymentRow}>
                                    <Text style={s.paymentDate}>{p.date}</Text>
                                    <Text style={s.paymentNote}>{p.note || 'Payment'}</Text>
                                    <Text style={[s.paymentAmount, { color: Colors.income }]}>
                                        +{currency}{p.amount.toLocaleString()}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    )}

                    {/* Action Buttons */}
                    <View style={s.actionRow}>
                        <TouchableOpacity style={[s.actionBtn, { borderColor: Colors.income }]}>
                            <Text style={[s.actionBtnText, { color: Colors.income, fontWeight: '600' }]}>
                                + Record Payment
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.actionBtn}>
                            <Text style={s.actionBtnText}>View Details</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}
        </View>
    );
}

/**
 * APPLICATION STATUS CARD
 * Shows status of pending or rejected applications
 */
function ApplicationStatusCard({ application, currency }: {
    application: any;
    currency: string;
}) {
    const statusDisplay = {
        pending: { text: '⏳ Under Review', color: Colors.warning, bg: 'rgba(245,158,11,0.1)' },
        approved: { text: '✅ Approved', color: Colors.income, bg: 'rgba(34,197,94,0.1)' },
        rejected: { text: '❌ Declined', color: Colors.expense, bg: 'rgba(239,68,68,0.1)' },
    };

    const status = statusDisplay[application.status as keyof typeof statusDisplay] || statusDisplay.pending;

    return (
        <View style={[s.statusCard, { backgroundColor: status.bg }]}>
            <View style={s.statusCardHeader}>
                <Text style={[s.statusText, { color: status.color, fontSize: 14, fontWeight: '600' }]}>
                    {status.text}
                </Text>
                <Text style={s.dateText}>Applied {application.appliedDate}</Text>
            </View>

            <View style={s.statusDetails}>
                <DetailRow label="Requested Amount" value={`${currency}${application.requestedAmount.toLocaleString()}`} />
                <DetailRow label="Status" value={application.status} />
            </View>

            {application.status === 'rejected' && application.rejectionReason && (
                <View style={[s.infoBox, { marginTop: 12 }]}>
                    <Text style={s.infoIcon}>ℹ️</Text>
                    <Text style={s.infoText}>{application.rejectionReason}</Text>
                </View>
            )}

            {application.status === 'approved' && (
                <View style={[s.infoBox, { marginTop: 12, backgroundColor: 'rgba(34,197,94,0.05)' }]}>
                    <Text style={[s.infoIcon, { color: Colors.income }]}>✨</Text>
                    <Text style={[s.infoText, { color: Colors.textPrimary }]}>
                        Funds will be transferred within 24 hours.
                    </Text>
                </View>
            )}

            {application.status === 'rejected' && (
                <TouchableOpacity style={s.reapplyBtn}>
                    <Text style={s.reapplyBtnText}>Reapply After 30 Days</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

/**
 * PAST APPLICATION CARD
 * Shows history of previous financing applications
 */
function PastApplicationCard({ application, currency, onReapply }: {
    application: any;
    currency: string;
    onReapply: () => void;
}) {
    const statusColor = application.status === 'rejected' ? Colors.expense : Colors.income;

    return (
        <View style={s.historyCard}>
            <View style={s.historyHeader}>
                <View>
                    <Text style={s.historyAmount}>{currency}{application.requestedAmount.toLocaleString()}</Text>
                    <Text style={s.historyDate}>{application.appliedDate}</Text>
                </View>
                <Text style={[s.historyStatus, { color: statusColor }]}>
                    {application.status === 'rejected' ? '❌ Declined' : '✅ Approved'}
                </Text>
            </View>
        </View>
    );
}

/**
 * NOT QUALIFIED STATE
 * Shows what SME needs to reach qualification
 */
function NotQualifiedState({ daysActive, monthlyRevenue, healthScore, currency }: {
    daysActive: number;
    monthlyRevenue: number;
    healthScore: number;
    currency: string;
}) {
    const requirements = [
        { met: daysActive >= 90, label: 'Track for 90 days', current: daysActive, needed: 90, type: 'days' },
        { met: monthlyRevenue >= 200000, label: 'Monthly revenue', current: monthlyRevenue, needed: 200000, type: 'currency', currency },
        { met: healthScore >= 50, label: 'Financial health score', current: healthScore, needed: 50, type: 'score' },
    ];

    return (
        <View style={s.emptyStateContainer}>
            <View style={s.emptyStateIcon}>
                <Text style={s.emptyStateIconText}>🔐</Text>
            </View>
            <Text style={s.emptyStateTitle}>Not Yet Qualified</Text>
            <Text style={s.emptyStateSubtitle}>
                Complete these requirements to unlock merchant financing:
            </Text>

            {requirements.map((req, idx) => {
                const percent = Math.min(100, (req.current / req.needed) * 100);
                return (
                    <View key={idx} style={s.requirementItem}>
                        <View style={s.requirementHeader}>
                            <Text style={[s.requirementLabel, { color: req.met ? Colors.income : Colors.textSecondary }]}>
                                {req.met ? '✅' : '⏳'} {req.label}
                            </Text>
                            <Text style={s.requirementValue}>
                                {req.type === 'days' && `${req.current}/${req.needed} days`}
                                {req.type === 'currency' && `${currency}${req.current.toLocaleString()}/${req.needed.toLocaleString()}`}
                                {req.type === 'score' && `${req.current}/${req.needed}`}
                            </Text>
                        </View>
                        <View style={s.requirementBar}>
                            <View style={[s.requirementFill, { width: `${percent}%` }]} />
                        </View>
                    </View>
                );
            })}

            <View style={[s.infoBox, { marginTop: 16 }]}>
                <Text style={s.infoIcon}>💡</Text>
                <Text style={s.infoText}>
                    Keep logging transactions daily to build your financial profile. You're making progress!
                </Text>
            </View>
        </View>
    );
}

/**
 * QUALIFIED EMPTY STATE
 * Invites qualified SME to apply
 */
function QualifiedEmptyState({ onApply }: { onApply: () => void }) {
    return (
        <View style={s.emptyStateContainer}>
            <View style={s.emptyStateIcon}>
                <Text style={s.emptyStateIconText}>🚀</Text>
            </View>
            <Text style={s.emptyStateTitle}>Ready to Scale Your Business?</Text>
            <Text style={s.emptyStateSubtitle}>
                You're pre-qualified for merchant financing. Apply now to get inventory or equipment capital.
            </Text>

            <TouchableOpacity style={s.emptyStateCTA} onPress={onApply}>
                <Text style={s.emptyStateCTAText}>Start Application</Text>
            </TouchableOpacity>

            <View style={[s.infoBox, { marginTop: 16 }]}>
                <Text style={s.infoIcon}>✨</Text>
                <Text style={s.infoText}>
                    Approval takes ~2 hours. Funds arrive within 24 hours. No collateral needed.
                </Text>
            </View>
        </View>
    );
}

/**
 * REPAYMENT CAPACITY GAUGE
 * Shows visual representation of whether SME can afford the loan
 */
function RepaymentCapacityGauge({ monthlyProfit, monthlyPayment, capacityRatio, currency, isOnTrack, isTight }: {
    monthlyProfit: number;
    monthlyPayment: number;
    capacityRatio: number;
    currency: string;
    isOnTrack: boolean;
    isTight: boolean;
}) {
    const gaugeColor = isOnTrack ? Colors.income : isTight ? Colors.warning : Colors.expense;
    const gaugeLabel = isOnTrack ? 'Safe' : isTight ? 'Tight' : 'At Risk';
    const gaugeWidth = Math.min(100, capacityRatio * 25);

    return (
        <View style={s.gaugeBox}>
            <View style={s.gaugeHeader}>
                <Text style={s.gaugeTitle}>Repayment Capacity</Text>
                <Text style={[s.gaugeLabel, { color: gaugeColor }]}>{gaugeLabel}</Text>
            </View>

            <Text style={s.gaugeMetric}>
                Monthly profit (<Text style={{ fontWeight: '700', color: gaugeColor }}>{currency}{monthlyProfit.toFixed(0)}</Text>) ÷ Loan payment (<Text style={{ fontWeight: '700' }}>{currency}{monthlyPayment.toFixed(0)}</Text>)
            </Text>

            {/* Gauge Visualization */}
            <View style={s.gaugeContainer}>
                <View style={s.gaugeBg}>
                    <View style={[s.gaugeFill, { width: `${gaugeWidth}%`, backgroundColor: gaugeColor }]} />
                </View>
                <View style={s.gaugeMarkersRow}>
                    <Text style={s.gaugeMark}>1x</Text>
                    <Text style={s.gaugeMark}>2x</Text>
                    <Text style={s.gaugeMark}>3x</Text>
                    <Text style={s.gaugeMark}>4x</Text>
                </View>
            </View>

            {/* Interpretation */}
            {isOnTrack && (
                <View style={[s.gaugeInterpretation, { backgroundColor: 'rgba(34,197,94,0.1)' }]}>
                    <Text style={[s.gaugeInterpText, { color: Colors.income }]}>
                        ✅ Your profit covers this payment {capacityRatio.toFixed(1)}x over. This is a safe loan.
                    </Text>
                </View>
            )}

            {isTight && (
                <View style={[s.gaugeInterpretation, { backgroundColor: 'rgba(245,158,11,0.1)' }]}>
                    <Text style={[s.gaugeInterpText, { color: Colors.warning }]}>
                        ⚠️ Your profit covers payment {capacityRatio.toFixed(1)}x. If revenue drops, budget carefully.
                    </Text>
                </View>
            )}

            {!isOnTrack && !isTight && (
                <View style={[s.gaugeInterpretation, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
                    <Text style={[s.gaugeInterpText, { color: Colors.expense }]}>
                        ❌ Payment exceeds your available profit. Consider a smaller loan amount.
                    </Text>
                </View>
            )}
        </View>
    );
}

/**
 * APPLY FOR FINANCING MODAL
 * Main form for applying for merchant financing
 */
function ApplyForFinancingModal({ visible, maxLoan, minLoan, monthlyProfit, currency, onClose, onSubmit }: {
    visible: boolean;
    maxLoan: number;
    minLoan: number;
    monthlyProfit: number;
    currency: string;
    onClose: () => void;
    onSubmit: (amount: number, purpose: string) => void;
}) {
    const [amount, setAmount] = useState(minLoan);
    const [purpose, setPurpose] = useState('inventory');
    const [step, setStep] = useState<'amount' | 'purpose' | 'review'>('amount');

    const estimatedMonthlyPayment = calculateMonthlyPayment(amount, 18, 60); // 18% APR, 60 months
    const capacityRatio = monthlyProfit / estimatedMonthlyPayment;
    const canAfford = capacityRatio >= 1.5;

    const handleNext = () => {
        if (step === 'amount') setStep('purpose');
        else if (step === 'purpose') setStep('review');
    };

    const handleSubmit = () => {
        onSubmit(amount, purpose);
    };

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={s.modalOverlay}>
                <View style={s.modalSheet}>
                    <ScrollView keyboardShouldPersistTaps="handled">
                        {/* Header */}
                        <View style={s.modalHeader}>
                            <TouchableOpacity onPress={onClose}>
                                <Text style={s.modalClose}>✕</Text>
                            </TouchableOpacity>
                            <Text style={s.modalTitle}>Apply for Financing</Text>
                            <Text style={s.modalStep}>
                                {step === 'amount' ? 'Step 1/3' : step === 'purpose' ? 'Step 2/3' : 'Step 3/3'}
                            </Text>
                        </View>

                        {/* STEP 1: Loan Amount */}
                        {step === 'amount' && (
                            <View style={s.modalContent}>
                                <Text style={s.stepTitle}>How much do you need?</Text>
                                <Text style={s.stepSubtitle}>
                                    Choose between {currency}{minLoan.toLocaleString()} and {currency}{maxLoan.toLocaleString()}
                                </Text>

                                {/* Amount Display */}
                                <View style={s.amountDisplay}>
                                    <Text style={s.amountValue}>
                                        {currency}{amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    </Text>
                                </View>

                                {/* Slider */}
                                <Slider
                                    style={s.slider}
                                    minimumValue={minLoan}
                                    maximumValue={maxLoan}
                                    step={50000}
                                    value={amount}
                                    onValueChange={setAmount}
                                    minimumTrackTintColor={Colors.primary}
                                    maximumTrackTintColor={Colors.border}
                                />

                                {/* Quick Amounts */}
                                <View style={s.quickAmountsRow}>
                                    {[minLoan, (minLoan + maxLoan) / 2, maxLoan].map((val, idx) => (
                                        <TouchableOpacity
                                            key={idx}
                                            style={[
                                                s.quickAmountBtn,
                                                amount === val && s.quickAmountBtnActive,
                                            ]}
                                            onPress={() => setAmount(val)}
                                        >
                                            <Text style={[
                                                s.quickAmountBtnText,
                                                amount === val && s.quickAmountBtnTextActive,
                                            ]}>
                                                {currency}{(val / 1000000).toFixed(1)}M
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                {/* Repayment Preview */}
                                <View style={s.previewBox}>
                                    <Text style={s.previewTitle}>Monthly Repayment Estimate</Text>
                                    <View style={s.previewRow}>
                                        <Text style={s.previewLabel}>Estimated Payment:</Text>
                                        <Text style={s.previewValue}>{currency}{estimatedMonthlyPayment.toFixed(0)}</Text>
                                    </View>
                                    <View style={s.previewRow}>
                                        <Text style={s.previewLabel}>Your Monthly Profit:</Text>
                                        <Text style={s.previewValue}>{currency}{monthlyProfit.toFixed(0)}</Text>
                                    </View>
                                    <View style={s.previewRow}>
                                        <Text style={s.previewLabel}>Coverage Ratio:</Text>
                                        <Text style={[s.previewValue, { color: canAfford ? Colors.income : Colors.expense }]}>
                                            {capacityRatio.toFixed(1)}x {canAfford ? '✅' : '⚠️'}
                                        </Text>
                                    </View>
                                </View>

                                {!canAfford && (
                                    <View style={[s.infoBox, { backgroundColor: 'rgba(245,158,11,0.1)' }]}>
                                        <Text style={s.infoIcon}>⚠️</Text>
                                        <Text style={[s.infoText, { color: Colors.warning }]}>
                                            This amount exceeds recommended capacity. You can still apply, but consider a smaller amount.
                                        </Text>
                                    </View>
                                )}
                            </View>
                        )}

                        {/* STEP 2: Purpose */}
                        {step === 'purpose' && (
                            <View style={s.modalContent}>
                                <Text style={s.stepTitle}>What will you use this for?</Text>
                                <Text style={s.stepSubtitle}>
                                    Tell us the primary purpose of this financing
                                </Text>

                                <View style={s.purposeGrid}>
                                    {[
                                        { id: 'inventory', label: 'Inventory Purchase', icon: '📦' },
                                        { id: 'equipment', label: 'Equipment', icon: '🔧' },
                                        { id: 'both', label: 'Both', icon: '📦🔧' },
                                        { id: 'other', label: 'Other', icon: '❓' },
                                    ].map((opt) => (
                                        <TouchableOpacity
                                            key={opt.id}
                                            style={[
                                                s.purposeCard,
                                                purpose === opt.id && s.purposeCardActive,
                                            ]}
                                            onPress={() => setPurpose(opt.id)}
                                        >
                                            <Text style={s.purposeIcon}>{opt.icon}</Text>
                                            <Text style={[
                                                s.purposeLabel,
                                                purpose === opt.id && s.purposeLabelActive,
                                            ]}>
                                                {opt.label}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                <View style={[s.infoBox, { marginTop: 16 }]}>
                                    <Text style={s.infoIcon}>💡</Text>
                                    <Text style={s.infoText}>
                                        This helps us track how the loan impacts your business performance.
                                    </Text>
                                </View>
                            </View>
                        )}

                        {/* STEP 3: Review */}
                        {step === 'review' && (
                            <View style={s.modalContent}>
                                <Text style={s.stepTitle}>Confirm Your Application</Text>

                                <View style={s.reviewBox}>
                                    <ReviewItem
                                        label="Loan Amount"
                                        value={`${currency}${amount.toLocaleString()}`}
                                    />
                                    <ReviewItem
                                        label="Purpose"
                                        value={purpose === 'both' ? 'Inventory & Equipment' : purpose.charAt(0).toUpperCase() + purpose.slice(1)}
                                    />
                                    <ReviewItem
                                        label="Estimated Rate"
                                        value="18% per annum"
                                    />
                                    <ReviewItem
                                        label="Monthly Payment"
                                        value={`${currency}${estimatedMonthlyPayment.toFixed(0)}`}
                                    />
                                    <ReviewItem
                                        label="Loan Term"
                                        value="60 months (5 years)"
                                    />
                                </View>

                                <View style={[s.infoBox, { backgroundColor: 'rgba(34,197,94,0.1)' }]}>
                                    <Text style={[s.infoIcon, { color: Colors.income }]}>✨</Text>
                                    <Text style={[s.infoText, { color: Colors.textPrimary }]}>
                                        By submitting this application, you authorize Quad360 to share your financial data with our lending partners for evaluation.
                                    </Text>
                                </View>

                                {/* Terms Checkbox */}
                                <View style={s.termsBox}>
                                    <Text style={s.termsText}>
                                        I agree to the <Text style={{ fontWeight: '700', color: Colors.primary }}>financing terms</Text> and <Text style={{ fontWeight: '700', color: Colors.primary }}>privacy policy</Text>
                                    </Text>
                                </View>
                            </View>
                        )}

                        {/* Navigation Buttons */}
                        <View style={s.modalButtonRow}>
                            {step !== 'amount' && (
                                <TouchableOpacity
                                    style={[s.btn, s.btnSecondary]}
                                    onPress={() => {
                                        if (step === 'purpose') setStep('amount');
                                        else if (step === 'review') setStep('purpose');
                                    }}
                                >
                                    <Text style={s.btnSecondaryText}>← Back</Text>
                                </TouchableOpacity>
                            )}

                            {step !== 'review' ? (
                                <TouchableOpacity
                                    style={[s.btn, { flex: step !== 'amount' ? 1 : 1 }]}
                                    onPress={handleNext}
                                >
                                    <Text style={s.btnText}>Next →</Text>
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity
                                    style={[s.btn]}
                                    onPress={handleSubmit}
                                >
                                    <Text style={s.btnText}>Submit Application</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// HELPER COMPONENTS
// ────────────────────────────────────────────────────────────────────────────

function MetricPill({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <View style={[s.metricPill, { borderColor: color }]}>
            <Text style={s.metricPillLabel}>{label}</Text>
            <Text style={[s.metricPillValue, { color }]}>{value}</Text>
        </View>
    );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
    return (
        <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={s.metricLabel}>{label}</Text>
            <Text style={[s.metricValue, color ? { color } : {}]}>{value}</Text>
        </View>
    );
}

function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <View style={s.detailRow}>
            <Text style={s.detailLabel}>{label}</Text>
            <Text style={s.detailValue}>{value}</Text>
        </View>
    );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
    return (
        <View style={s.reviewItem}>
            <Text style={s.reviewLabel}>{label}</Text>
            <Text style={s.reviewValue}>{value}</Text>
        </View>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// UTILITY FUNCTIONS
// ────────────────────────────────────────────────────────────────────────────

function calculateMonthlyPayment(principal: number, annualRate: number, termMonths: number): number {
    if (!termMonths || termMonths <= 0) return 0;
    if (annualRate === 0) return principal / termMonths;
    const r = annualRate / 100 / 12;
    const factor = Math.pow(1 + r, termMonths);
    return principal * (r * factor) / (factor - 1);
}

// ────────────────────────────────────────────────────────────────────────────
// STYLES
// ────────────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
        paddingBottom: 100,
    },

    // ── Pre-Qualification Widget ──────────────────────────────────────────
    preQualCard: {
        backgroundColor: Colors.surface,
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
        borderWidth: 2,
        borderColor: Colors.primary + '44',
    },
    preQualHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    preQualBadge: {
        fontSize: 11,
        fontWeight: '700',
        color: Colors.income,
        marginBottom: 4,
    },
    preQualTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: Colors.textPrimary,
    },
    scoreCircle: {
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 20,
        fontWeight: '700',
        color: '#fff',
    },
    preQualRange: {
        marginBottom: 14,
    },
    rangeLabel: {
        fontSize: 11,
        color: Colors.textMuted,
        marginBottom: 4,
    },
    rangeValue: {
        fontSize: 16,
        fontWeight: '700',
        color: Colors.textPrimary,
        marginBottom: 8,
    },
    rangeBar: {
        height: 8,
        backgroundColor: Colors.border,
        borderRadius: 4,
        overflow: 'hidden',
    },
    rangeFill: {
        height: 8,
        backgroundColor: Colors.primary,
        borderRadius: 4,
    },
    preQualMetrics: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 14,
    },
    metricPill: {
        flex: 1,
        borderWidth: 2,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
        alignItems: 'center',
    },
    metricPillLabel: {
        fontSize: 9,
        color: Colors.textMuted,
        marginBottom: 2,
    },
    metricPillValue: {
        fontSize: 12,
        fontWeight: '700',
    },
    preQualCTA: {
        backgroundColor: Colors.primary,
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
        marginBottom: 12,
    },
    preQualCTAText: {
        color: Colors.textPrimary,
        fontWeight: '700',
        fontSize: 14,
    },
    preQualCTASubtext: {
        color: Colors.textPrimary,
        fontSize: 10,
        marginTop: 2,
        opacity: 0.8,
    },
    infoBox: {
        flexDirection: 'row',
        backgroundColor: 'rgba(59,130,246,0.1)',
        borderRadius: 8,
        padding: 12,
        gap: 10,
    },
    infoIcon: {
        fontSize: 16,
        width: 20,
    },
    infoText: {
        flex: 1,
        fontSize: 12,
        color: Colors.textSecondary,
        lineHeight: 18,
    },

    // ── Active Loan Card ──────────────────────────────────────────────────
    activeLoanCard: {
        backgroundColor: Colors.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: Colors.border,
        padding: 14,
        marginBottom: 16,
    },
    activeLoanHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    loanBadge: {
        fontSize: 10,
        fontWeight: '700',
        color: Colors.primary,
        marginBottom: 4,
    },
    activeLoanTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: Colors.textPrimary,
    },
    statusBadge: {
        fontSize: 11,
        fontWeight: '600',
        marginBottom: 2,
    },
    balanceText: {
        fontSize: 16,
        fontWeight: '800',
        color: Colors.expense,
    },
    progressBg: {
        height: 6,
        backgroundColor: Colors.border,
        borderRadius: 3,
        marginBottom: 4,
        overflow: 'hidden',
    },
    progressFill: {
        height: 6,
        borderRadius: 3,
    },
    progressLabel: {
        fontSize: 10,
        color: Colors.textMuted,
        marginBottom: 12,
    },
    activeLoanMetrics: {
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: Colors.border,
        paddingTop: 10,
    },
    metricLabel: {
        fontSize: 9,
        color: Colors.textMuted,
        marginBottom: 2,
        textAlign: 'center',
    },
    metricValue: {
        fontSize: 11,
        fontWeight: '700',
        color: Colors.textPrimary,
        textAlign: 'center',
    },
    expandedContent: {
        borderTopWidth: 1,
        borderTopColor: Colors.border,
        marginTop: 10,
        paddingTop: 12,
    },

    // ── Repayment Capacity Gauge ──────────────────────────────────────────
    gaugeBox: {
        backgroundColor: Colors.bg,
        borderRadius: 10,
        padding: 12,
        marginBottom: 12,
    },
    gaugeHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    gaugeTitle: {
        fontSize: 12,
        fontWeight: '700',
        color: Colors.textPrimary,
    },
    gaugeLabel: {
        fontSize: 11,
        fontWeight: '700',
    },
    gaugeMetric: {
        fontSize: 11,
        color: Colors.textSecondary,
        marginBottom: 10,
        lineHeight: 16,
    },
    gaugeContainer: {
        marginBottom: 10,
    },
    gaugeBg: {
        height: 12,
        backgroundColor: Colors.border,
        borderRadius: 6,
        overflow: 'hidden',
        marginBottom: 6,
    },
    gaugeFill: {
        height: 12,
        borderRadius: 6,
    },
    gaugeMarkersRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 2,
    },
    gaugeMark: {
        fontSize: 8,
        color: Colors.textMuted,
        fontWeight: '600',
    },
    gaugeInterpretation: {
        borderRadius: 8,
        padding: 10,
    },
    gaugeInterpText: {
        fontSize: 11,
        lineHeight: 16,
    },

    // ── Next Payment Box ──────────────────────────────────────────────────
    nextPaymentBox: {
        backgroundColor: 'rgba(34,197,94,0.1)',
        borderRadius: 8,
        padding: 12,
        marginBottom: 12,
        borderLeftWidth: 4,
        borderLeftColor: Colors.income,
    },
    nextPaymentLabel: {
        fontSize: 10,
        color: Colors.textMuted,
        marginBottom: 4,
    },
    nextPaymentDate: {
        fontSize: 14,
        fontWeight: '700',
        color: Colors.textPrimary,
        marginBottom: 2,
    },
    nextPaymentAmount: {
        fontSize: 12,
        fontWeight: '600',
        color: Colors.income,
    },

    // ── Loan Details Box ──────────────────────────────────────────────────
    loanDetailsBox: {
        backgroundColor: Colors.bg,
        borderRadius: 8,
        padding: 10,
        marginBottom: 12,
    },
    detailsTitle: {
        fontSize: 11,
        fontWeight: '700',
        color: Colors.textSecondary,
        marginBottom: 8,
        textTransform: 'uppercase',
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    detailLabel: {
        fontSize: 11,
        color: Colors.textMuted,
    },
    detailValue: {
        fontSize: 11,
        fontWeight: '600',
        color: Colors.textPrimary,
    },

    // ── Payment History Box ───────────────────────────────────────────────
    paymentHistoryBox: {
        backgroundColor: Colors.bg,
        borderRadius: 8,
        padding: 10,
        marginBottom: 12,
    },
    paymentHistoryTitle: {
        fontSize: 11,
        fontWeight: '700',
        color: Colors.textSecondary,
        marginBottom: 8,
        textTransform: 'uppercase',
    },
    paymentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    paymentDate: {
        fontSize: 10,
        color: Colors.textMuted,
        width: 80,
    },
    paymentNote: {
        flex: 1,
        fontSize: 10,
        color: Colors.textSecondary,
    },
    paymentAmount: {
        fontSize: 11,
        fontWeight: '700',
    },

    // ── Action Buttons ────────────────────────────────────────────────────
    actionRow: {
        flexDirection: 'row',
        gap: 8,
    },
    actionBtn: {
        flex: 1,
        paddingVertical: 8,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: Colors.border,
        alignItems: 'center',
    },
    actionBtnText: {
        fontSize: 12,
        fontWeight: '600',
        color: Colors.textSecondary,
    },

    // ── Application Status Card ───────────────────────────────────────────
    statusCard: {
        borderRadius: 12,
        padding: 14,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    statusCardHeader: {
        marginBottom: 12,
    },
    statusText: {
        marginBottom: 2,
    },
    dateText: {
        fontSize: 10,
        color: Colors.textMuted,
    },
    statusDetails: {
        gap: 8,
    },
    reapplyBtn: {
        marginTop: 12,
        paddingVertical: 10,
        backgroundColor: Colors.primary,
        borderRadius: 8,
        alignItems: 'center',
    },
    reapplyBtnText: {
        color: Colors.textPrimary,
        fontWeight: '600',
        fontSize: 12,
    },

    // ── History Section ───────────────────────────────────────────────────
    historySection: {
        marginBottom: 20,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: Colors.textPrimary,
        marginBottom: 10,
    },
    historyCard: {
        backgroundColor: Colors.surface,
        borderRadius: 10,
        padding: 12,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    historyHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    historyAmount: {
        fontSize: 14,
        fontWeight: '700',
        color: Colors.textPrimary,
    },
    historyDate: {
        fontSize: 10,
        color: Colors.textMuted,
        marginTop: 2,
    },
    historyStatus: {
        fontSize: 11,
        fontWeight: '600',
    },

    // ── Empty States ──────────────────────────────────────────────────────
    emptyStateContainer: {
        alignItems: 'center',
        paddingVertical: 60,
    },
    emptyStateIcon: {
        marginBottom: 12,
    },
    emptyStateIconText: {
        fontSize: 48,
    },
    emptyStateTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: Colors.textPrimary,
        marginBottom: 6,
        textAlign: 'center',
    },
    emptyStateSubtitle: {
        fontSize: 13,
        color: Colors.textMuted,
        textAlign: 'center',
        lineHeight: 20,
        paddingHorizontal: 20,
        marginBottom: 20,
    },
    emptyStateCTA: {
        backgroundColor: Colors.primary,
        borderRadius: 10,
        paddingHorizontal: 28,
        paddingVertical: 12,
        marginBottom: 20,
    },
    emptyStateCTAText: {
        color: Colors.textPrimary,
        fontWeight: '700',
        fontSize: 14,
    },

    // ── Requirement Items (Not Qualified) ─────────────────────────────────
    requirementItem: {
        marginBottom: 14,
    },
    requirementHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    requirementLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: Colors.textSecondary,
    },
    requirementValue: {
        fontSize: 11,
        color: Colors.textMuted,
    },
    requirementBar: {
        height: 6,
        backgroundColor: Colors.border,
        borderRadius: 3,
        overflow: 'hidden',
    },
    requirementFill: {
        height: 6,
        backgroundColor: Colors.primary,
        borderRadius: 3,
    },

    // ── Modal ─────────────────────────────────────────────────────────────
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    modalSheet: {
        backgroundColor: Colors.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '95%',
        paddingBottom: 20,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    modalClose: {
        fontSize: 20,
        color: Colors.textMuted,
        fontWeight: '600',
    },
    modalTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: Colors.textPrimary,
        flex: 1,
        textAlign: 'center',
    },
    modalStep: {
        fontSize: 11,
        color: Colors.textMuted,
        fontWeight: '600',
    },
    modalContent: {
        padding: 20,
    },
    stepTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: Colors.textPrimary,
        marginBottom: 6,
    },
    stepSubtitle: {
        fontSize: 13,
        color: Colors.textMuted,
        marginBottom: 20,
        lineHeight: 18,
    },

    // ── Amount Step ───────────────────────────────────────────────────────
    amountDisplay: {
        backgroundColor: Colors.bg,
        borderRadius: 12,
        paddingVertical: 20,
        alignItems: 'center',
        marginBottom: 16,
    },
    amountValue: {
        fontSize: 32,
        fontWeight: '700',
        color: Colors.primary,
    },
    slider: {
        width: '100%',
        height: 40,
        marginBottom: 16,
    },
    quickAmountsRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 16,
    },
    quickAmountBtn: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: Colors.border,
        alignItems: 'center',
    },
    quickAmountBtnActive: {
        backgroundColor: Colors.primary,
        borderColor: Colors.primary,
    },
    quickAmountBtnText: {
        fontSize: 12,
        fontWeight: '600',
        color: Colors.textSecondary,
    },
    quickAmountBtnTextActive: {
        color: Colors.textPrimary,
    },
    previewBox: {
        backgroundColor: Colors.bg,
        borderRadius: 10,
        padding: 12,
        borderWidth: 1,
        borderColor: Colors.primary + '44',
    },
    previewTitle: {
        fontSize: 11,
        fontWeight: '700',
        color: Colors.primary,
        marginBottom: 8,
    },
    previewRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 4,
    },
    previewLabel: {
        fontSize: 11,
        color: Colors.textSecondary,
    },
    previewValue: {
        fontSize: 12,
        fontWeight: '700',
        color: Colors.textPrimary,
    },

    // ── Purpose Step ──────────────────────────────────────────────────────
    purposeGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    purposeCard: {
        flex: 0.48,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: Colors.border,
        paddingVertical: 16,
        alignItems: 'center',
        backgroundColor: Colors.bg,
    },
    purposeCardActive: {
        borderColor: Colors.primary,
        backgroundColor: Colors.primary + '11',
    },
    purposeIcon: {
        fontSize: 28,
        marginBottom: 8,
    },
    purposeLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: Colors.textSecondary,
        textAlign: 'center',
    },
    purposeLabelActive: {
        color: Colors.primary,
        fontWeight: '700',
    },

    // ── Review Step ───────────────────────────────────────────────────────
    reviewBox: {
        backgroundColor: Colors.bg,
        borderRadius: 10,
        padding: 12,
        marginBottom: 16,
    },
    reviewItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    reviewLabel: {
        fontSize: 12,
        color: Colors.textMuted,
    },
    reviewValue: {
        fontSize: 12,
        fontWeight: '700',
        color: Colors.textPrimary,
    },
    termsBox: {
        paddingVertical: 12,
        marginBottom: 16,
    },
    termsText: {
        fontSize: 11,
        color: Colors.textMuted,
        lineHeight: 16,
    },

    // ── Modal Buttons ─────────────────────────────────────────────────────
    modalButtonRow: {
        flexDirection: 'row',
        gap: 10,
        paddingHorizontal: 20,
    },
    btn: {
        flex: 1,
        backgroundColor: Colors.primary,
        paddingVertical: 13,
        borderRadius: 8,
        alignItems: 'center',
    },
    btnSecondary: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: Colors.border,
    },
    btnText: {
        color: Colors.textPrimary,
        fontWeight: '700',
        fontSize: 14,
    },
    btnSecondaryText: {
        color: Colors.textSecondary,
        fontWeight: '600',
        fontSize: 14,
    },
});
