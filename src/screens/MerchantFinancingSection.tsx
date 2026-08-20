import React, { useState, useMemo, useEffect } from 'react';
import {
    SafeAreaView, ScrollView, View, Text, TextInput,
    TouchableOpacity, StyleSheet, Modal, Platform, useWindowDimensions,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import DateInput from '../components/DateInput';
import { showAlert } from '../utils/webAlert';
import Icon, { IconName } from '../components/ui/Icon';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import { LoanPurpose } from '../types';
import { computeDSCR } from '../utils/finance';

// Shared between the purpose picker grid and the review step so the label
// shown for a selection never disagrees with what's actually submitted.
const PURPOSE_OPTIONS: { id: LoanPurpose; label: string; icon: IconName }[] = [
    { id: 'inventory', label: 'Inventory Purchase', icon: 'package' },
    { id: 'equipment', label: 'Equipment', icon: 'tool' },
    { id: 'supplier_payment', label: 'Supplier Payment', icon: 'truck' },
    { id: 'invoice_financing', label: 'Invoice Financing', icon: 'file-text' },
    { id: 'expansion', label: 'Expansion', icon: 'trending-up' },
    { id: 'emergency_working_capital', label: 'Emergency Working Capital', icon: 'alert-circle' },
    { id: 'other', label: 'Other', icon: 'help-circle' },
];

// ── MAIN SECTION COMPONENT ────────────────────────────────────────────────────

export default function MerchantFinancingSection() {
    const { user, financing, applyForMerchantFinancing, settings, navigate, transactions, loans } = useApp();
    const { currency } = settings;

    const [showApplyModal, setShowApplyModal] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Same DSCR the Financing Marketplace already gates every third-party
    // product on -- a business whose current income doesn't cover its
    // existing debt shouldn't be pre-qualified for Quad360's own financing
    // either. Without this, the two tabs on this same screen could (and
    // did) contradict each other: the Marketplace correctly refusing every
    // product for an over-leveraged business, while this tab still showed
    // "PRE-QUALIFIED -- Start Application".
    const dscr = useMemo(() => computeDSCR(transactions, loans), [transactions, loans]);

    // Check qualification
    const isQualified = useMemo(() => {
        return (user?.daysActive || 0) >= 90
            && (user?.avgMonthlyRevenue || 0) >= 200000
            && (user?.financialHealthScore || 0) >= 50
            && dscr.dscr >= 1;
    }, [user?.daysActive, user?.avgMonthlyRevenue, user?.financialHealthScore, dscr.dscr]);

    const hasApplied = financing?.applicationStatus !== null;
    const isApproved = financing?.applicationStatus === 'approved' || financing?.applicationStatus === 'funded';
    const hasActiveLoan = financing?.activeLoan != null;

    // Show loading state if user data not loaded yet
    if (!user) {
        return (
            <View style={[s.container, { justifyContent: 'center', alignItems: 'center', paddingVertical: 60 }]}>
                <Text style={s.loadingText}>Loading financing information...</Text>
            </View>
        );
    }

    return (
        <View style={s.container}>
            {/* SECTION 1: Active Merchant Loan - Priority 1 */}
            {hasActiveLoan && financing?.activeLoan ? (
                <ActiveMerchantLoanCard
                    loan={financing.activeLoan}
                    currency={currency}
                    expanded={expandedId === 'active'}
                    onToggle={() => setExpandedId(expandedId === 'active' ? null : 'active')}
                />
            ) : hasActiveLoan && !financing?.activeLoan ? (
                /* Fallback: hasActiveLoan is true but activeLoan data is missing */
                <View style={s.emptyStateContainer}>
                    <View style={s.emptyStateIcon}>
                        <Icon name="dollar-sign" size={40} color={Colors.textMuted} />
                    </View>
                    <Text style={s.emptyStateTitle}>Active Merchant Loan</Text>
                    <Text style={s.emptyStateSubtitle}>Your loan details are loading...</Text>
                </View>
            ) : null}

            {/* SECTION 2: Application Status - Priority 2 */}
            {hasApplied && !isApproved && financing?.application ? (
                <ApplicationStatusCard
                    application={financing.application}
                    currency={currency}
                />
            ) : null}

            {/* SECTION 3: Pre-Qualification Widget - Priority 3 */}
            {!hasActiveLoan && isQualified && !hasApplied ? (
                <PreQualificationWidget
                    maxLoan={financing?.maxQualifiedAmount || 5000000}
                    minLoan={financing?.minQualifiedAmount || 2000000}
                    readinessScore={user?.financialHealthScore || 0}
                    currency={currency}
                    onApply={() => setShowApplyModal(true)}
                />
            ) : null}

            {/* SECTION 4: Application History */}
            {financing?.pastApplications && financing.pastApplications.length > 0 ? (
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
            ) : null}

            {/* EMPTY STATE: Not Qualified Yet - Fallback */}
            {!hasActiveLoan && !hasApplied && !isQualified ? (
                <NotQualifiedState
                    daysActive={user?.daysActive || 0}
                    monthlyRevenue={user?.avgMonthlyRevenue || 0}
                    healthScore={user?.financialHealthScore || 0}
                    dscr={dscr.dscr}
                    currency={currency}
                />
            ) : null}

            {/* EMPTY STATE: Qualified No Activity - Fallback */}
            {!hasActiveLoan && isQualified && !hasApplied && !isApproved ? (
                <QualifiedEmptyState
                    onApply={() => setShowApplyModal(true)}
                />
            ) : null}

            {/* ULTIMATE FALLBACK: If absolutely nothing rendered, show a message */}
            {hasActiveLoan || hasApplied || isApproved || isQualified ? null : (
                <View style={s.emptyStateContainer}>
                    <Text style={s.emptyStateTitle}>Merchant Financing</Text>
                    <Text style={s.emptyStateSubtitle}>Complete your profile to get started</Text>
                </View>
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
                        applyForMerchantFinancing(amount, purpose as any).then(() => {
                            setShowApplyModal(false);
                            showAlert('Success', 'Your application has been submitted');
                        }).catch(() => {
                            showAlert('Error', 'Failed to submit application');
                        });
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
                    <View style={[s.badgeRow, { marginBottom: Spacing.xs }]}>
                        <Icon name="check-circle" size={12} color={Colors.income} />
                        <Text style={s.preQualBadge}>PRE-QUALIFIED</Text>
                    </View>
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
                <Icon name="info" size={16} color={Colors.primary} />
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
                        <View style={[s.badgeRow, { marginBottom: Spacing.xs }]}>
                            <Icon name="dollar-sign" size={11} color={Colors.primary} />
                            <Text style={s.loanBadge}>MERCHANT FINANCING</Text>
                        </View>
                        <Text style={s.activeLoanTitle}>Approved Inventory Loan</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                        <View style={[s.badgeRow, { marginBottom: 2 }]}>
                            <Icon name="check-circle" size={11} color={Colors.income} />
                            <Text style={[s.statusBadge, { color: Colors.income, marginBottom: 0 }]}>
                                {loan.status === 'repaying' ? 'Active' : 'Funded'}
                            </Text>
                        </View>
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
        pending: { text: 'Under Review', icon: 'clock' as IconName, color: Colors.warning, bg: 'rgba(245,158,11,0.1)' },
        approved: { text: 'Approved', icon: 'check-circle' as IconName, color: Colors.income, bg: 'rgba(34,197,94,0.1)' },
        rejected: { text: 'Declined', icon: 'x-circle' as IconName, color: Colors.expense, bg: 'rgba(239,68,68,0.1)' },
    };

    const status = statusDisplay[application.status as keyof typeof statusDisplay] || statusDisplay.pending;

    return (
        <View style={[s.statusCard, { backgroundColor: status.bg }]}>
            <View style={s.statusCardHeader}>
                <View style={s.badgeRow}>
                    <Icon name={status.icon} size={14} color={status.color} />
                    <Text style={[s.statusText, { color: status.color, fontSize: 14, fontWeight: '600' }]}>
                        {status.text}
                    </Text>
                </View>
                <Text style={s.dateText}>Applied {application.appliedDate}</Text>
            </View>

            <View style={s.statusDetails}>
                <DetailRow label="Requested Amount" value={`${currency}${application.requestedAmount.toLocaleString()}`} />
                <DetailRow label="Status" value={application.status} />
            </View>

            {application.status === 'rejected' && application.rejectionReason && (
                <View style={[s.infoBox, { marginTop: Spacing.md }]}>
                    <Icon name="info" size={16} color={Colors.textMuted} />
                    <Text style={s.infoText}>{application.rejectionReason}</Text>
                </View>
            )}

            {application.status === 'approved' && (
                <View style={[s.infoBox, { marginTop: Spacing.md, backgroundColor: 'rgba(34,197,94,0.05)' }]}>
                    <Icon name="star" size={16} color={Colors.income} />
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
                <View style={s.badgeRow}>
                    <Icon name={application.status === 'rejected' ? 'x-circle' : 'check-circle'} size={12} color={statusColor} />
                    <Text style={[s.historyStatus, { color: statusColor }]}>
                        {application.status === 'rejected' ? 'Declined' : 'Approved'}
                    </Text>
                </View>
            </View>
        </View>
    );
}

/**
 * NOT QUALIFIED STATE
 * Shows what SME needs to reach qualification
 */
function NotQualifiedState({ daysActive, monthlyRevenue, healthScore, dscr, currency }: {
    daysActive: number;
    monthlyRevenue: number;
    healthScore: number;
    dscr: number;
    currency: string;
}) {
    const daysRemaining = Math.max(0, 90 - daysActive);
    const estimatedQualificationDate = useMemo(() => {
        if (daysActive >= 90) return null;
        const today = new Date();
        const qualifyDate = new Date(today);
        qualifyDate.setDate(qualifyDate.getDate() + daysRemaining);
        return qualifyDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }, [daysActive, daysRemaining]);

    const requirements = [
        {
            met: daysActive >= 90,
            label: 'Account Age',
            current: daysActive,
            needed: 90,
            type: 'days',
            hint: daysActive >= 90 ? 'Complete ✅' : `${daysRemaining} days remaining`,
            progress: Math.min(100, (daysActive / 90) * 100),
        },
        {
            met: monthlyRevenue >= 200000,
            label: 'Monthly Revenue',
            current: monthlyRevenue,
            needed: 200000,
            type: 'currency',
            currency,
            hint: monthlyRevenue >= 200000 ? 'Complete ✅' : `Need ${currency}${(200000 - monthlyRevenue).toLocaleString()} more`,
            progress: Math.min(100, (monthlyRevenue / 200000) * 100),
        },
        {
            met: healthScore >= 50,
            label: 'Financial Health Score',
            current: healthScore,
            needed: 50,
            type: 'score',
            hint: healthScore >= 50 ? 'Complete ✅' : `${50 - healthScore} points needed`,
            progress: Math.min(100, (healthScore / 50) * 100),
        },
        {
            met: dscr >= 1,
            label: 'Debt Coverage',
            // Stored x100 so the shared percent-bar math (current/needed) still
            // works unmodified; 'ratio' render divides back down to an "x" figure.
            current: Math.round(Math.min(dscr, 1) * 100),
            needed: 100,
            type: 'ratio',
            hint: dscr >= 1
                ? 'Complete ✅'
                : `Current income doesn't fully cover existing debt payments (${dscr.toFixed(2)}x — needs 1.00x)`,
            progress: Math.min(100, dscr * 100),
        },
    ];

    const completedCount = requirements.filter(r => r.met).length;
    const totalCount = requirements.length;

    return (
        <View style={s.emptyStateContainer}>
            <View style={s.emptyStateIcon}>
                <Icon name="target" size={40} color={Colors.primary} />
            </View>
            <Text style={s.emptyStateTitle}>Almost There!</Text>
            <Text style={s.emptyStateSubtitle}>
                You're {completedCount}/{totalCount} steps away from qualifying for merchant financing.
            </Text>

            {estimatedQualificationDate && (
                <View style={[s.infoBox, { marginBottom: Spacing.lg, backgroundColor: Colors.primary + '15', borderLeftColor: Colors.primary }]}>
                    <Icon name="calendar" size={16} color={Colors.primary} />
                    <View>
                        <Text style={[s.infoText, { fontWeight: '600', color: Colors.primary }]}>Estimated Qualification Date</Text>
                        <Text style={[s.infoText, { color: Colors.textPrimary, fontSize: 14, marginTop: 4 }]}>{estimatedQualificationDate}</Text>
                    </View>
                </View>
            )}

            {requirements.map((req, idx) => {
                const percent = Math.min(100, (req.current / req.needed) * 100);
                return (
                    <View key={idx} style={s.requirementItem}>
                        <View style={s.requirementHeader}>
                            <View style={s.badgeRow}>
                                <Icon name={req.met ? 'check-circle' : 'map-pin'} size={12} color={req.met ? Colors.income : Colors.textSecondary} />
                                <Text style={[s.requirementLabel, { color: req.met ? Colors.income : Colors.textSecondary }]}>
                                    {req.label}
                                </Text>
                            </View>
                            <Text style={s.requirementValue}>
                                {req.type === 'days' && `${req.current}/${req.needed} days`}
                                {req.type === 'currency' && `${currency}${req.current.toLocaleString()}/${req.needed.toLocaleString()}`}
                                {req.type === 'score' && `${req.current}/${req.needed}`}
                                {req.type === 'ratio' && (dscr >= 900 ? 'No existing debt' : `${(req.current / 100).toFixed(2)}x / ${(req.needed / 100).toFixed(2)}x`)}
                            </Text>
                        </View>
                        <View style={s.requirementBar}>
                            <View style={[s.requirementFill, { width: `${percent}%`, backgroundColor: req.met ? Colors.income : Colors.primary }]} />
                        </View>
                        <Text style={s.requirementHint}>{req.hint}</Text>
                    </View>
                );
            })}

            <View style={[s.infoBox, { marginTop: Spacing.lg, borderLeftColor: Colors.primary, borderLeftWidth: 4 }]}>
                <Icon name="zap" size={16} color={Colors.primary} />
                <View>
                    <Text style={[s.infoText, { fontWeight: '600', marginBottom: 4 }]}>How to improve:</Text>
                    {daysActive < 90 && (
                        <Text style={s.infoText}>• Log transactions consistently for {daysRemaining} more days</Text>
                    )}
                    {monthlyRevenue < 200000 && (
                        <Text style={s.infoText}>• Increase sales and log all transactions (invoices, payments, transfers)</Text>
                    )}
                    {healthScore < 50 && (
                        <Text style={s.infoText}>• Maintain healthy cash flow and settle due payments on time</Text>
                    )}
                    {dscr < 1 && (
                        <Text style={s.infoText}>• Pay down existing debt or grow operating profit before taking on more</Text>
                    )}
                </View>
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
                <Icon name="zap" size={40} color={Colors.primary} />
            </View>
            <Text style={s.emptyStateTitle}>Ready to Scale Your Business?</Text>
            <Text style={s.emptyStateSubtitle}>
                You're pre-qualified for merchant financing. Apply now to get inventory or equipment capital.
            </Text>

            <TouchableOpacity style={s.emptyStateCTA} onPress={onApply}>
                <Text style={s.emptyStateCTAText}>Start Application</Text>
            </TouchableOpacity>

            <View style={[s.infoBox, { marginTop: Spacing.lg }]}>
                <Icon name="star" size={16} color={Colors.income} />
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
                <View style={[s.gaugeInterpretation, s.gaugeInterpretationRow, { backgroundColor: 'rgba(34,197,94,0.1)' }]}>
                    <Icon name="check-circle" size={14} color={Colors.income} />
                    <Text style={[s.gaugeInterpText, { color: Colors.income }]}>
                        Your profit covers this payment {capacityRatio.toFixed(1)}x over. This is a safe loan.
                    </Text>
                </View>
            )}

            {isTight && (
                <View style={[s.gaugeInterpretation, s.gaugeInterpretationRow, { backgroundColor: 'rgba(245,158,11,0.1)' }]}>
                    <Icon name="alert-triangle" size={14} color={Colors.warning} />
                    <Text style={[s.gaugeInterpText, { color: Colors.warning }]}>
                        Your profit covers payment {capacityRatio.toFixed(1)}x. If revenue drops, budget carefully.
                    </Text>
                </View>
            )}

            {!isOnTrack && !isTight && (
                <View style={[s.gaugeInterpretation, s.gaugeInterpretationRow, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
                    <Icon name="x-circle" size={14} color={Colors.expense} />
                    <Text style={[s.gaugeInterpText, { color: Colors.expense }]}>
                        Payment exceeds your available profit. Consider a smaller loan amount.
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
    onSubmit: (amount: number, purpose: LoanPurpose) => void;
}) {
    const [amount, setAmount] = useState(minLoan);
    const [purpose, setPurpose] = useState<LoanPurpose>('inventory');
    const [step, setStep] = useState<'amount' | 'purpose' | 'review'>('amount');

    // Modal renders via a portal on web, outside App.tsx's width constraint --
    // see FooterNav.tsx for the reference fix. Applied here to the bottom
    // sheet so it doesn't stretch full-bleed on desktop.
    const { width: windowWidth } = useWindowDimensions();
    const constrainSheetWidth = Platform.OS === 'web' && windowWidth >= 720;

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
                <View style={[s.modalSheet, constrainSheetWidth && s.modalSheetWide]}>
                    <ScrollView keyboardShouldPersistTaps="handled">
                        {/* Header */}
                        <View style={s.modalHeader}>
                            <TouchableOpacity onPress={onClose}>
                                <Icon name="x" size={20} color={Colors.textMuted} />
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

                                {/* Amount Input */}
                                <View style={s.amountInputContainer}>
                                    <TextInput
                                        style={s.amountInput}
                                        placeholder={`Enter amount (${minLoan} - ${maxLoan})`}
                                        placeholderTextColor={Colors.textMuted}
                                        keyboardType="decimal-pad"
                                        value={amount.toString()}
                                        onChangeText={(text) => {
                                            const val = parseInt(text.replace(/\D/g, ''), 10) || minLoan;
                                            setAmount(Math.max(minLoan, Math.min(maxLoan, val)));
                                        }}
                                    />
                                </View>

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
                                        <View style={s.badgeRow}>
                                            <Text style={[s.previewValue, { color: canAfford ? Colors.income : Colors.expense }]}>
                                                {capacityRatio.toFixed(1)}x
                                            </Text>
                                            <Icon name={canAfford ? 'check-circle' : 'alert-triangle'} size={12} color={canAfford ? Colors.income : Colors.expense} />
                                        </View>
                                    </View>
                                </View>

                                {!canAfford && (
                                    <View style={[s.infoBox, { backgroundColor: 'rgba(245,158,11,0.1)' }]}>
                                        <Icon name="alert-triangle" size={16} color={Colors.warning} />
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
                                    {PURPOSE_OPTIONS.map((opt) => (
                                        <TouchableOpacity
                                            key={opt.id}
                                            style={[
                                                s.purposeCard,
                                                purpose === opt.id && s.purposeCardActive,
                                            ]}
                                            onPress={() => setPurpose(opt.id)}
                                        >
                                            <View style={s.purposeIconWrap}>
                                                <Icon name={opt.icon} size={26} color={purpose === opt.id ? Colors.primary : Colors.textSecondary} />
                                            </View>
                                            <Text style={[
                                                s.purposeLabel,
                                                purpose === opt.id && s.purposeLabelActive,
                                            ]}>
                                                {opt.label}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                <View style={[s.infoBox, { marginTop: Spacing.lg }]}>
                                    <Icon name="zap" size={16} color={Colors.primary} />
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
                                        value={purpose === 'both' ? 'Inventory & Equipment' : PURPOSE_OPTIONS.find(o => o.id === purpose)?.label ?? purpose}
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
                                    <Icon name="star" size={16} color={Colors.income} />
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
        padding: 0,
        paddingBottom: Spacing.xl,
        width: '100%',
    },

    // Small icon + label row shared by badges, status pills and inline
    // interpretation text throughout this screen.
    badgeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
    },

    loadingState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 50,
    },

    loadingText: {
        fontSize: 14,
        color: Colors.textMuted,
        textAlign: 'center',
    },

    // ── Pre-Qualification Widget ──────────────────────────────────────────
    preQualCard: {
        backgroundColor: Colors.surface,
        borderRadius: Radius.lg,
        padding: Spacing.lg,
        marginBottom: Spacing.xl,
        borderWidth: 2,
        borderColor: Colors.primary + '44',
        ...Shadow.sm,
    },
    preQualHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: Spacing.lg,
    },
    preQualBadge: {
        fontSize: 11,
        fontWeight: '700',
        color: Colors.income,
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
        marginBottom: Spacing.xs,
    },
    rangeValue: {
        fontSize: 16,
        fontWeight: '700',
        color: Colors.textPrimary,
        marginBottom: Spacing.sm,
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
        gap: Spacing.sm,
        marginBottom: 14,
    },
    metricPill: {
        flex: 1,
        borderWidth: 2,
        borderRadius: Radius.sm,
        paddingHorizontal: 10,
        paddingVertical: Spacing.sm,
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
        borderRadius: Radius.md,
        paddingVertical: 14,
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    preQualCTAText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 14,
    },
    preQualCTASubtext: {
        color: '#fff',
        fontSize: 10,
        marginTop: 2,
        opacity: 0.8,
    },
    infoBox: {
        flexDirection: 'row',
        backgroundColor: 'rgba(59,130,246,0.1)',
        borderRadius: Radius.sm,
        padding: Spacing.md,
        gap: 10,
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
        borderRadius: Radius.md,
        borderWidth: 1,
        borderColor: Colors.border,
        padding: 14,
        marginBottom: Spacing.lg,
        ...Shadow.sm,
    },
    activeLoanHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: Spacing.md,
    },
    loanBadge: {
        fontSize: 10,
        fontWeight: '700',
        color: Colors.primary,
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
        marginBottom: Spacing.xs,
        overflow: 'hidden',
    },
    progressFill: {
        height: 6,
        borderRadius: 3,
    },
    progressLabel: {
        fontSize: 10,
        color: Colors.textMuted,
        marginBottom: Spacing.md,
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
        paddingTop: Spacing.md,
    },

    // ── Repayment Capacity Gauge ──────────────────────────────────────────
    gaugeBox: {
        backgroundColor: Colors.bg,
        borderRadius: 10,
        padding: Spacing.md,
        marginBottom: Spacing.md,
    },
    gaugeHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: Spacing.sm,
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
        borderRadius: Radius.sm,
        padding: 10,
    },
    gaugeInterpretationRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: Spacing.sm,
    },
    gaugeInterpText: {
        flex: 1,
        fontSize: 11,
        lineHeight: 16,
    },

    // ── Next Payment Box ──────────────────────────────────────────────────
    nextPaymentBox: {
        backgroundColor: 'rgba(34,197,94,0.1)',
        borderRadius: Radius.sm,
        padding: Spacing.md,
        marginBottom: Spacing.md,
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
        borderRadius: Radius.sm,
        padding: 10,
        marginBottom: Spacing.md,
    },
    detailsTitle: {
        fontSize: 11,
        fontWeight: '700',
        color: Colors.textSecondary,
        marginBottom: Spacing.sm,
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
        borderRadius: Radius.sm,
        padding: 10,
        marginBottom: Spacing.md,
    },
    paymentHistoryTitle: {
        fontSize: 11,
        fontWeight: '700',
        color: Colors.textSecondary,
        marginBottom: Spacing.sm,
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
        gap: Spacing.sm,
    },
    actionBtn: {
        flex: 1,
        paddingVertical: Spacing.sm,
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
        borderRadius: Radius.md,
        padding: 14,
        marginBottom: Spacing.lg,
        borderWidth: 1,
        borderColor: Colors.border,
        ...Shadow.sm,
    },
    statusCardHeader: {
        marginBottom: Spacing.md,
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
        marginTop: Spacing.md,
        paddingVertical: 10,
        backgroundColor: Colors.primary,
        borderRadius: Radius.sm,
        alignItems: 'center',
    },
    reapplyBtnText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 12,
    },

    // ── History Section ───────────────────────────────────────────────────
    historySection: {
        marginBottom: Spacing.xl,
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
        padding: Spacing.md,
        marginBottom: Spacing.sm,
        borderWidth: 1,
        borderColor: Colors.border,
        ...Shadow.sm,
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
        marginBottom: Spacing.md,
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
        paddingHorizontal: Spacing.xl,
        marginBottom: Spacing.xl,
    },
    emptyStateCTA: {
        backgroundColor: Colors.primary,
        borderRadius: 10,
        paddingHorizontal: 28,
        paddingVertical: Spacing.md,
        marginBottom: Spacing.xl,
    },
    emptyStateCTAText: {
        color: '#fff',
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
    requirementHint: {
        fontSize: 11,
        color: Colors.textMuted,
        marginTop: Spacing.xs,
        fontStyle: 'italic',
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
        paddingBottom: Spacing.xl,
        ...Shadow.md,
    },
    modalSheetWide: { maxWidth: 560, width: '100%', alignSelf: 'center' },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.xl,
        paddingTop: Spacing.lg,
        paddingBottom: Spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
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
        padding: Spacing.xl,
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
        marginBottom: Spacing.xl,
        lineHeight: 18,
    },

    // ── Amount Step ───────────────────────────────────────────────────────
    amountDisplay: {
        backgroundColor: Colors.bg,
        borderRadius: Radius.md,
        paddingVertical: Spacing.xl,
        alignItems: 'center',
        marginBottom: Spacing.lg,
    },
    amountValue: {
        fontSize: 32,
        fontWeight: '700',
        color: Colors.primary,
    },
    amountInputContainer: {
        marginBottom: Spacing.lg,
    },
    amountInput: {
        width: '100%',
        paddingVertical: Spacing.md,
        paddingHorizontal: Spacing.md,
        borderRadius: Radius.sm,
        borderWidth: 1,
        borderColor: Colors.border,
        color: Colors.textPrimary,
        fontSize: 16,
        backgroundColor: Colors.surface,
    },
    slider: {
        width: '100%',
        height: 40,
        marginBottom: Spacing.lg,
    },
    quickAmountsRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: Spacing.lg,
    },
    quickAmountBtn: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: Radius.sm,
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
        color: '#fff',
    },
    previewBox: {
        backgroundColor: Colors.bg,
        borderRadius: 10,
        padding: Spacing.md,
        borderWidth: 1,
        borderColor: Colors.primary + '44',
    },
    previewTitle: {
        fontSize: 11,
        fontWeight: '700',
        color: Colors.primary,
        marginBottom: Spacing.sm,
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
    purposeIconWrap: {
        marginBottom: Spacing.sm,
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
        padding: Spacing.md,
        marginBottom: Spacing.lg,
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
        paddingVertical: Spacing.md,
        marginBottom: Spacing.lg,
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
        paddingHorizontal: Spacing.xl,
    },
    btn: {
        flex: 1,
        backgroundColor: Colors.primary,
        paddingVertical: 13,
        borderRadius: Radius.sm,
        alignItems: 'center',
    },
    btnSecondary: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: Colors.border,
    },
    btnText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 14,
    },
    btnSecondaryText: {
        color: Colors.textSecondary,
        fontWeight: '600',
        fontSize: 14,
    },
});
