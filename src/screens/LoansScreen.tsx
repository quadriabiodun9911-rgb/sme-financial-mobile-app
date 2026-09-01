/**
 * UPDATED LoansScreen with Merchant Financing Tab
 *
 * This is the new version of LoansScreen that includes both:
 * 1. Loan Register (existing loans the SME has)
 * 2. Merchant Financing (new financing available through Quad360)
 *
 * Integration note: Replace src/screens/LoansScreen.tsx with this file,
 * or import MerchantFinancingSection as a separate component.
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
    SafeAreaView, ScrollView, View, Text, TextInput,
    TouchableOpacity, StyleSheet, Modal, Platform, useWindowDimensions,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { Loan, LoanStatus, Transaction, ReadinessSnapshot } from '../types';
import DateInput from '../components/DateInput';
import MerchantFinancingSection from './MerchantFinancingSection';
import { computeDebtOptimiser, computeDSCR, computeInterestRateShock, DSCRResult, computeUnlinkedLoanRepayments, computeLoanPaymentSplit } from '../utils/finance';
import { computeDSCRIntelligence } from '../utils/metricIntelligence';
import { generateId } from '../utils/uuid';
import { computePostFinancingMonitor, PostFinancingStatus } from '../utils/postFinancingMonitor';
import { buildPostFinancingShareExport } from '../utils/lenderSummaryExport';
import { generatePDF, sharePDF } from '../utils/pdfExport';
import { loadActiveLenderOrganizations, LenderDirectoryEntry } from '../utils/lenderDirectory';
import { publishLoanMonitoringShare, revokeLoanMonitoringShare } from '../utils/loanMonitoringShare';
import NextStepLink from '../components/NextStepLink';
import ProfitCashImpactCard from '../components/ProfitCashImpactCard';
import { computeProfitCashImpact } from '../utils/impactChain';
import { monthlyPayment, totalInterest, outstandingLoanBalance, nextLoanPaymentDueDate, isLoanPaymentOverdue } from '../utils/loanMath';
import { showAlert, confirmAction } from '../utils/webAlert';
import Icon from '../components/ui/Icon';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import { t } from '../utils/i18n';
import PinConfirmModal from '../components/PinConfirmModal';
import { computeTenorCycleCheck } from '../utils/tenorCycleMatch';
import { computeRepaymentSeasonalAlignment } from '../utils/repaymentSeasonalAlignment';
import { computeRepaymentWeekdayAlignment } from '../utils/repaymentWeekdayAlignment';

function totalPaid(loan: Loan): number {
    return (loan.payments ?? []).reduce((s, p) => s + p.amount, 0);
}

const outstandingBalance = outstandingLoanBalance;

function statusColorFor(status: 'healthy' | 'warning' | 'danger'): string {
    if (status === 'healthy') return Colors.income;
    if (status === 'warning') return Colors.warning;
    return Colors.expense;
}

function nextDueDate(loan: Loan): string {
    return nextLoanPaymentDueDate(loan).toISOString().split('T')[0];
}

function payoffDate(loan: Loan): string {
    const start = new Date(loan.startDate);
    const end = new Date(start);
    end.setMonth(end.getMonth() + loan.termMonths);
    return end.toISOString().split('T')[0];
}

const isOverdue = isLoanPaymentOverdue;


// ── MAIN COMPONENT ────────────────────────────────────────────────────────

export default function LoansScreen() {
    const { loans, addLoan, updateLoan, deleteLoan, addLoanPayment, settings, navigate, finance, navParams, transactions, updateTransaction, readinessHistory, user, language, isDemoMode, inventory } = useApp();
    const { currency } = settings;

    // Modal renders via a portal on web, outside App.tsx's width constraint --
    // see FooterNav.tsx for the reference fix. Applied here to the bottom
    // sheets so they don't stretch full-bleed on desktop.
    const { width: windowWidth } = useWindowDimensions();
    const constrainSheetWidth = Platform.OS === 'web' && windowWidth >= 720;

    // Feature flag for merchant financing
    const enableFinancing = process.env.EXPO_PUBLIC_ENABLE_FINANCING !== 'false';

    const [activeTab, setActiveTab] = useState<'existing' | 'financing'>(
        navParams?.tab === 'financing' ? 'financing' : 'existing'
    );
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showPayment, setShowPayment] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Phase 2b: linking a loan to a real lender_organizations row so its
    // ongoing status can be shared. Directory loads lazily on first open
    // rather than on screen mount -- most sessions never touch this.
    const [linkingLoanId, setLinkingLoanId] = useState<string | null>(null);
    const [lenderDirectory, setLenderDirectory] = useState<LenderDirectoryEntry[] | null>(null);
    const [directoryQuery, setDirectoryQuery] = useState('');

    const openLinkLender = useCallback((loanId: string) => {
        setLinkingLoanId(loanId);
        setDirectoryQuery('');
        if (lenderDirectory === null) {
            loadActiveLenderOrganizations().then(setLenderDirectory);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lenderDirectory]);

    const handlePickLender = useCallback((entry: LenderDirectoryEntry) => {
        if (linkingLoanId) updateLoan(linkingLoanId, { lenderOrgId: entry.id });
        setLinkingLoanId(null);
    }, [linkingLoanId, updateLoan]);

    // Loan form
    const [lender, setLender] = useState('');
    const [purpose, setPurpose] = useState('');
    const [principal, setPrincipal] = useState('');
    const [rate, setRate] = useState('');
    const [term, setTerm] = useState('');
    const [startDate, setStart] = useState(new Date().toISOString().split('T')[0]);
    const [status, setStatus] = useState<LoanStatus>('active');
    const [fromMarketplace, setFromMarketplace] = useState(false);
    const [collateralPledged, setCollateralPledged] = useState('');
    const [covenants, setCovenants] = useState('');

    // Payment form
    const [payAmount, setPayAmount] = useState('');
    const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
    const [payNote, setPayNote] = useState('');

    const resetForm = () => {
        setLender(''); setPurpose(''); setPrincipal(''); setRate('');
        setTerm(''); setStart(new Date().toISOString().split('T')[0]);
        setStatus('active'); setFromMarketplace(false); setEditingId(null);
        setCollateralPledged(''); setCovenants('');
    };

    const openAdd = () => { resetForm(); setShowForm(true); };

    // useCallback with an empty dep array is safe here: every call inside
    // is a setState setter, and React guarantees those are referentially
    // stable across renders. A stable `openEdit` lets it be passed directly
    // to every LoanCard as the `onEdit` prop without each one wrapping it
    // in a fresh per-render closure (see the LoanCard React.memo note below).
    const openEdit = useCallback((l: Loan) => {
        setLender(l.lenderName ?? ''); setPurpose(l.purpose);
        setPrincipal(String(l.principal)); setRate(l.interestRate != null ? String(l.interestRate) : '');
        setTerm(String(l.termMonths)); setStart(l.startDate);
        setStatus(l.status); setFromMarketplace(!!l.fromMarketplace); setEditingId(l.id); setShowForm(true);
        setCollateralPledged(l.collateralPledged ?? ''); setCovenants(l.covenants ?? '');
    }, []);

    const handleSave = () => {
        if (!lender.trim()) { showAlert('Error', 'Please enter the lender name.'); return; }
        const p = parseFloat(principal);
        const r = parseFloat(rate);
        const t = parseInt(term, 10);
        if (isNaN(p) || p <= 0) { showAlert('Error', 'Please enter a valid loan amount.'); return; }
        if (isNaN(r) || r < 0) { showAlert('Error', 'Please enter a valid interest rate (0 for interest-free).'); return; }
        if (isNaN(t) || t <= 0) { showAlert('Error', 'Please enter a valid loan term in months.'); return; }

        const payload = {
            lenderName: lender.trim(), purpose: purpose.trim(),
            principal: p, interestRate: r, termMonths: t,
            startDate, status, fromMarketplace,
            collateralPledged: collateralPledged.trim() || undefined,
            covenants: covenants.trim() || undefined,
        };
        if (editingId) {
            updateLoan(editingId, payload);
        } else {
            addLoan(payload);
        }
        setShowForm(false);
        resetForm();
    };

    const handleAddPayment = (loanId: string) => {
        const amt = parseFloat(payAmount);
        if (isNaN(amt) || amt <= 0) { showAlert('Error', 'Please enter a valid payment amount.'); return; }
        addLoanPayment(loanId, { amount: amt, date: payDate, note: payNote.trim() || undefined });
        setShowPayment(null);
        setPayAmount(''); setPayNote('');
        setPayDate(new Date().toISOString().split('T')[0]);
    };

    const confirmDelete = useCallback((id: string) => {
        confirmAction('Delete Loan', 'Remove this loan and all its payment history?', 'Delete', () => deleteLoan(id));
    }, [deleteLoan]);

    const handleToggleLoan = useCallback((id: string) => {
        setExpandedId(prev => (prev === id ? null : id));
    }, []);

    const handleOpenPayment = useCallback((id: string) => {
        setShowPayment(id);
        setPayDate(new Date().toISOString().split('T')[0]);
    }, []);

    // Bank-statement import can tag a row "Loan Repayment" but can't know
    // which loan it belongs to (see computeUnlinkedLoanRepayments) -- this
    // surfaces those so completing the link is one tap when there's only
    // one active loan to apply it to, or one tap-to-pick when there's more.
    const unlinkedRepayments = useMemo(() => computeUnlinkedLoanRepayments(transactions), [transactions]);
    const [pickingLoanForRepayment, setPickingLoanForRepayment] = useState<string | null>(null);
    const applyRepaymentToLoan = useCallback((transactionId: string, loanId: string) => {
        const tx = transactions.find(t => t.id === transactionId);
        const loan = loans.find(l => l.id === loanId);
        if (!tx || !loan) return;
        const { principalPortion, interestPortion } = computeLoanPaymentSplit(loan, tx.amount ?? 0);
        updateTransaction(transactionId, { principalPortion });
        const payments = [...(loan.payments ?? []), { id: generateId(), date: tx.date, amount: principalPortion, interestPortion, note: tx.description }];
        const totalPrincipalPaid = payments.reduce((s, p) => s + p.amount, 0);
        updateLoan(loanId, { payments, status: totalPrincipalPaid >= loan.principal ? 'paid_off' : loan.status });
        setPickingLoanForRepayment(null);
    }, [transactions, loans, updateTransaction, updateLoan]);

    // Summary stats
    const activeLoans = loans.filter(l => l.status === 'active');
    const totalDebt = activeLoans.reduce((s, l) => s + outstandingBalance(l), 0);
    const totalMonthly = activeLoans.reduce((s, l) => s + monthlyPayment(l.principal, l.interestRate, l.termMonths), 0);
    const overdueLoans = activeLoans.filter(l => isOverdue(l));

    // Multi-loan payoff strategy (avalanche vs snowball) — only meaningful
    // with 2+ active loans; a single loan has no ordering decision to make.
    const debtOpt = useMemo(() => computeDebtOptimiser(loans, currency), [loans, currency]);
    const dscr = useMemo(() => computeDSCR(transactions, loans), [transactions, loans]);
    // Metric Intelligence pilot -- same Definition/Owner-confidence/Trigger
    // treatment as the Dashboard's Business Health Score. See
    // metricIntelligence.ts for exactly what's reused vs new.
    const dscrIntelligence = useMemo(() => computeDSCRIntelligence(dscr, transactions), [dscr, transactions]);
    const [dscrWhyOpen, setDscrWhyOpen] = useState(false);
    const showDebtStrategy = activeLoans.length >= 2;
    const dscrStatusColor = dscr.status === 'healthy' ? Colors.income : dscr.status === 'warning' ? Colors.warning : Colors.expense;

    // Interest Rate Shock -- a forward-looking "what if my loans repriced
    // higher" stress test, distinct from the payoff strategy above (which
    // only reorders payments against today's rates). A user-set
    // hypothetical, not a prediction. Applies uniformly across active
    // loans since Quad360 doesn't track fixed vs. variable rate per loan.
    const [shockPoints, setShockPoints] = useState('0');
    const rateShock = useMemo(
        () => computeInterestRateShock(loans, transactions, parseFloat(shockPoints) || 0),
        [loans, transactions, shockPoints]
    );

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
                <TouchableOpacity onPress={() => navigate('dashboard')}>
                    <Text style={{ color: Colors.primary, fontSize: 14 }}>← Dashboard</Text>
                </TouchableOpacity>
            </View>

            {/* TAB BAR */}
            <View style={s.tabBar}>
                <TabButton
                    label={t(language, 'loanRegisterTitle')}
                    active={activeTab === 'existing'}
                    onPress={() => setActiveTab('existing')}
                />
                {enableFinancing && (
                    <TabButton
                        label={t(language, 'merchantFinancingTab')}
                        active={activeTab === 'financing'}
                        onPress={() => setActiveTab('financing')}
                    />
                )}
            </View>

            {/* TAB CONTENT */}
            {(activeTab === 'existing' || !enableFinancing) ? (
                <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
                    <Text style={s.title}>{t(language, 'loanRegisterTitle')}</Text>

                    {/* Summary */}
                    <View style={s.summaryRow}>
                        <SummaryCard label={t(language, 'totalOutstandingLabel')} value={`${currency}${totalDebt.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} color={Colors.expense} />
                        <SummaryCard label={t(language, 'monthlyRepaymentLabel')} value={`${currency}${totalMonthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} color={Colors.warning} />
                        <SummaryCard label={t(language, 'activeLoansLabel')} value={String(activeLoans.length)} color={Colors.textPrimary} />
                    </View>

                    {/* Can You Afford Your Loans? -- Debt Service Coverage
                        Ratio, the canonical "is income covering debt
                        payments" answer used everywhere else in the app
                        (Credit-Worthiness, Financing Marketplace, Risk
                        Radar's Debt Coverage category). This is its one
                        prominent, standalone home. */}
                    {activeLoans.length > 0 && (
                        <View style={[s.strategyCard, { borderLeftWidth: 3, borderLeftColor: dscrStatusColor }]}>
                            <View style={s.strategyTitleRow}>
                                <Icon name="shield" size={14} color={Colors.textPrimary} />
                                <Text style={s.strategyTitle}>Can You Afford Your Loans?</Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                                <Text style={[s.dscrBigNum, { color: dscrStatusColor }]}>{dscr.dscr > 100 ? '∞' : dscr.dscr.toFixed(2)}x</Text>
                                <Text style={[s.dscrStatusBadge, { backgroundColor: dscrStatusColor + '20', color: dscrStatusColor }]}>
                                    {dscr.status === 'healthy' ? 'HEALTHY' : dscr.status === 'warning' ? 'BORDERLINE' : 'AT RISK'}
                                </Text>
                            </View>
                            <Text style={s.strategyRecommendation}>
                                {dscr.status === 'healthy'
                                    ? '✓ Your income comfortably covers loan repayments.'
                                    : dscr.status === 'warning'
                                    ? '⚠ Your income barely covers loan repayments. Reduce debt or increase revenue.'
                                    : '✗ Income may not cover loan repayments. Act now.'}
                                {' '}Above 1.0x = you cover repayments. Above 2.0x = excellent buffer.
                            </Text>
                            <View style={s.dscrDetailRow}>
                                <Text style={s.dscrDetailLabel}>Net Operating Income</Text>
                                <Text style={[s.dscrDetailVal, { color: Colors.income }]}>{currency}{Math.round(dscr.netOperatingIncome).toLocaleString()}</Text>
                            </View>
                            <View style={s.dscrDetailRow}>
                                <Text style={s.dscrDetailLabel}>Annual Debt Payments</Text>
                                <Text style={[s.dscrDetailVal, { color: Colors.expense }]}>{currency}{Math.round(dscr.totalDebtService).toLocaleString()}</Text>
                            </View>

                            <TouchableOpacity style={s.dscrWhyBtn} onPress={() => setDscrWhyOpen(o => !o)}>
                                <Text style={s.dscrWhyBtnText}>Why? What is this built on?</Text>
                                <Text style={s.dscrWhyBtnText}>{dscrWhyOpen ? '▲' : '▼'}</Text>
                            </TouchableOpacity>
                            {dscrWhyOpen && (
                                <View style={s.dscrWhyBox}>
                                    <Text style={s.dscrWhyLabel}>Definition</Text>
                                    <Text style={s.dscrWhyText}>{dscrIntelligence.definition}</Text>

                                    <Text style={s.dscrWhyLabel}>Data confidence</Text>
                                    <Text style={s.dscrWhyText}>{dscrIntelligence.dataQuality.summary}</Text>
                                    {dscrIntelligence.builtOn.map((line, i) => (
                                        <Text key={i} style={s.dscrWhyBullet}>• {line}</Text>
                                    ))}

                                    <Text style={s.dscrWhyLabel}>Trigger</Text>
                                    <Text style={[s.dscrWhyText, { color: Colors.warning, fontWeight: '700' }]}>⚠️ {dscrIntelligence.trigger}</Text>
                                </View>
                            )}
                        </View>
                    )}

                    {/* Interest Rate Shock -- what if rates rose? */}
                    {activeLoans.length > 0 && (
                        <View style={[s.strategyCard, { borderLeftWidth: 3, borderLeftColor: statusColorFor(rateShock.newStatus) }]}>
                            <View style={s.strategyTitleRow}>
                                <Icon name="trending-up" size={14} color={Colors.textPrimary} />
                                <Text style={s.strategyTitle}>Interest Rate Shock</Text>
                            </View>
                            <Text style={s.strategyRecommendation}>What if your loans repriced higher? Model a rate rise and see the effect on repayments and coverage.</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, marginBottom: 10 }}>
                                {[1, 2, 3, 5].map(p => (
                                    <TouchableOpacity
                                        key={p}
                                        style={[s.shockChip, shockPoints === String(p) && s.shockChipActive]}
                                        onPress={() => setShockPoints(String(p))}
                                    >
                                        <Text style={[s.shockChipText, shockPoints === String(p) && s.shockChipTextActive]}>+{p}pt</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <TextInput
                                style={s.shockInput}
                                placeholder="or type a custom rate rise (percentage points)"
                                placeholderTextColor={Colors.textMuted}
                                keyboardType="decimal-pad"
                                value={shockPoints === '0' ? '' : shockPoints}
                                onChangeText={v => setShockPoints(v || '0')}
                            />
                            {(parseFloat(shockPoints) || 0) > 0 && (
                                <>
                                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                                        <Text style={[s.dscrBigNum, { color: statusColorFor(rateShock.newStatus) }]}>{rateShock.newDSCR > 100 ? '∞' : rateShock.newDSCR.toFixed(2)}x</Text>
                                        <Text style={[s.dscrStatusBadge, { backgroundColor: statusColorFor(rateShock.newStatus) + '20', color: statusColorFor(rateShock.newStatus) }]}>
                                            {rateShock.newStatus === 'healthy' ? 'HEALTHY' : rateShock.newStatus === 'warning' ? 'BORDERLINE' : 'AT RISK'}
                                        </Text>
                                    </View>
                                    <View style={s.dscrDetailRow}>
                                        <Text style={s.dscrDetailLabel}>New Monthly Debt Payments</Text>
                                        <Text style={[s.dscrDetailVal, { color: Colors.expense }]}>{currency}{Math.round(rateShock.newMonthlyDebtService).toLocaleString()}</Text>
                                    </View>
                                    <View style={s.dscrDetailRow}>
                                        <Text style={s.dscrDetailLabel}>Extra Cost per Year</Text>
                                        <Text style={[s.dscrDetailVal, { color: Colors.expense }]}>+{currency}{Math.round(rateShock.extraAnnualCost).toLocaleString()}</Text>
                                    </View>
                                </>
                            )}
                        </View>
                    )}

                    {/* Debt Payoff Strategy — which loan to attack first and why,
                        with real interest saved, not just a flat list of loans. */}
                    {showDebtStrategy && (
                        <View style={s.strategyCard}>
                            <View style={s.strategyTitleRow}>
                                <Icon name="target" size={14} color={Colors.textPrimary} />
                                <Text style={s.strategyTitle}>{t(language, 'debtPayoffStrategyTitle')}</Text>
                            </View>
                            <Text style={s.strategyRecommendation}>{debtOpt.recommendation}</Text>

                            <View style={s.strategyMethodRow}>
                                <View style={s.strategyMethod}>
                                    <View style={s.strategyMethodLabelRow}>
                                        <Icon name="percent" size={11} color={Colors.textPrimary} />
                                        <Text style={s.strategyMethodLabel}>{t(language, 'avalancheLabel')}</Text>
                                    </View>
                                    {debtOpt.avalanche.order.map((name, i) => (
                                        <Text key={i} style={s.strategyOrderItem}>{i + 1}. {name}</Text>
                                    ))}
                                    <Text style={[s.strategySaved, { color: Colors.income }]}>
                                        {t(language, 'savesPrefix')} {currency}{Math.abs(debtOpt.avalanche.totalInterestSaved).toLocaleString(undefined, { maximumFractionDigits: 0 })} {t(language, 'inInterestSuffix')}
                                    </Text>
                                </View>
                                <View style={s.strategyMethod}>
                                    <View style={s.strategyMethodLabelRow}>
                                        <Icon name="zap" size={11} color={Colors.textPrimary} />
                                        <Text style={s.strategyMethodLabel}>{t(language, 'snowballLabel')}</Text>
                                    </View>
                                    {debtOpt.snowball.order.map((name, i) => (
                                        <Text key={i} style={s.strategyOrderItem}>{i + 1}. {name}</Text>
                                    ))}
                                    <Text style={s.strategyOrderItem}>{t(language, 'clearsSmallestFirst')}</Text>
                                </View>
                            </View>
                        </View>
                    )}

                    {/* Financing Marketplace — replaces the old Loan
                        Eligibility Tracker modal, which hardcoded its own
                        eligibility thresholds independent of computeRiskScore/
                        computeDSCR and offered 3 "Apply Now" options that were
                        never real (always alerted "Coming Soon"). Its one real
                        option, Quad360's own Merchant Financing, is already
                        its own tab on this screen (above) — nothing lost. */}
                    <TouchableOpacity onPress={() => navigate('financing-marketplace')} style={s.featureCard}>
                        <Icon name="search" size={28} color={Colors.primary} />
                        <View style={s.featureContent}>
                            <Text style={s.featureTitle}>{t(language, 'financingMarketplaceTitle')}</Text>
                            <Text style={s.featureDesc}>{t(language, 'financingMarketplaceDesc')}</Text>
                        </View>
                        <Text style={s.featureArrow}>→</Text>
                    </TouchableOpacity>

                    {/* Financing Readiness Check — the Funding Pack tab on
                        Credit-Worthiness (folded in from the now-removed
                        standalone screen). Renamed from "Bank Loan
                        Qualification": Quad360 doesn't decide (or predict)
                        whether a lender approves anyone, so the label
                        shouldn't imply it does — this is about the business's
                        own readiness, not a lending decision. */}
                    <TouchableOpacity onPress={() => navigate('credit-worthiness', { tab: 'funding-pack' })} style={s.featureCard}>
                        <Icon name="home" size={28} color={Colors.primary} />
                        <View style={s.featureContent}>
                            <Text style={s.featureTitle}>{t(language, 'financingReadinessCheckTitle')}</Text>
                            <Text style={s.featureDesc}>{t(language, 'financingReadinessCheckDesc')}</Text>
                        </View>
                        <Text style={s.featureArrow}>→</Text>
                    </TouchableOpacity>

                    {/* Overdue alert */}
                    {overdueLoans.length > 0 && (
                        <View style={s.alertBanner}>
                            <View style={s.alertTextRow}>
                                <Icon name="alert-triangle" size={14} color={Colors.expense} />
                                <Text style={s.alertText}>
                                    {overdueLoans.length} loan payment{overdueLoans.length > 1 ? 's are' : ' is'} overdue
                                </Text>
                            </View>
                            <NextStepLink text={t(language, 'seeCreditScoreEffect')} onPress={() => navigate('credit-worthiness')} />
                        </View>
                    )}

                    {/* Loan repayments imported from a bank statement (see
                        computeUnlinkedLoanRepayments) -- until linked to a
                        loan, the full amount silently overstates expense
                        (only interest should hit the P&L) and the loan's
                        outstanding balance never reflects that it was paid. */}
                    {unlinkedRepayments.length > 0 && (
                        <View style={s.detectedAlert}>
                            <View style={s.alertTextRow}>
                                <Icon name="upload" size={14} color={Colors.primary} />
                                <Text style={[s.alertText, { color: Colors.primary }]}>
                                    {unlinkedRepayments.length} loan repayment{unlinkedRepayments.length > 1 ? 's' : ''} found in your transactions {unlinkedRepayments.length > 1 ? "aren't" : "isn't"} linked to a loan yet.
                                </Text>
                            </View>
                            {unlinkedRepayments.slice(0, 3).map(r => (
                                <View key={r.transactionId} style={s.unlinkedRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.unlinkedName} numberOfLines={1}>{r.description}</Text>
                                        <Text style={s.unlinkedMeta}>{r.date} · {currency}{r.amount.toLocaleString()}</Text>
                                        {pickingLoanForRepayment === r.transactionId && activeLoans.length > 1 && (
                                            <View style={s.loanPickRow}>
                                                {activeLoans.map(l => (
                                                    <TouchableOpacity key={l.id} style={s.loanPickChip} onPress={() => applyRepaymentToLoan(r.transactionId, l.id)}>
                                                        <Text style={s.loanPickChipText}>{l.lenderName || 'Loan'}</Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        )}
                                    </View>
                                    {activeLoans.length === 0 ? (
                                        <Text style={s.unlinkedMeta}>Add the loan first</Text>
                                    ) : activeLoans.length === 1 ? (
                                        <TouchableOpacity onPress={() => applyRepaymentToLoan(r.transactionId, activeLoans[0].id)}>
                                            <Text style={s.unlinkedAdd}>Apply to {activeLoans[0].lenderName || 'loan'} →</Text>
                                        </TouchableOpacity>
                                    ) : pickingLoanForRepayment !== r.transactionId ? (
                                        <TouchableOpacity onPress={() => setPickingLoanForRepayment(r.transactionId)}>
                                            <Text style={s.unlinkedAdd}>Apply to loan →</Text>
                                        </TouchableOpacity>
                                    ) : null}
                                </View>
                            ))}
                        </View>
                    )}

                    {loans.length === 0 ? (
                        <View style={s.emptyState}>
                            <View style={s.emptyIcon}>
                                <Icon name="home" size={48} color={Colors.textMuted} />
                            </View>
                            <Text style={s.emptyTitle}>{t(language, 'noLoansYetTitle')}</Text>
                            <Text style={s.emptySub}>
                                {t(language, 'noLoansYetSub')}
                            </Text>
                            <TouchableOpacity style={s.emptyAddBtn} onPress={openAdd}>
                                <Text style={s.emptyAddBtnText}>+ Add Loan</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        loans.map(loan => (
                            <LoanCard
                                key={loan.id}
                                loan={loan}
                                currency={currency}
                                expanded={expandedId === loan.id}
                                transactions={transactions}
                                readinessHistory={readinessHistory}
                                dscr={dscr}
                                user={user}
                                updateLoan={updateLoan}
                                onToggle={handleToggleLoan}
                                onEdit={openEdit}
                                onDelete={confirmDelete}
                                onAddPayment={handleOpenPayment}
                                onLinkLender={openLinkLender}
                                language={language}
                                isDemoMode={isDemoMode}
                            />
                        ))
                    )}
                </ScrollView>
            ) : enableFinancing && activeTab === 'financing' ? (
                <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
                    <MerchantFinancingSection />
                </ScrollView>
            ) : null}

            <TouchableOpacity style={s.fab} onPress={openAdd}>
                <Text style={s.fabText}>+</Text>
            </TouchableOpacity>

            {/* Add / Edit Loan Modal */}
            <Modal visible={showForm} animationType="slide" transparent>
                <View style={s.overlay}>
                    <View style={[s.sheet, constrainSheetWidth && s.sheetWide]}>
                        <ScrollView keyboardShouldPersistTaps="handled">
                            <Text style={s.modalTitle}>{editingId ? t(language, 'editLoanTitle') : t(language, 'addLoanTitle')}</Text>

                            <FieldLabel text={t(language, 'lenderNameLabel')} />
                            <TextInput style={s.input} value={lender} onChangeText={setLender}
                                placeholder="e.g. GTBank, Family Friend" placeholderTextColor={Colors.muted} />

                            <FieldLabel text={t(language, 'purposeOptionalLabel')} />
                            <TextInput style={s.input} value={purpose} onChangeText={setPurpose}
                                placeholder="e.g. Equipment purchase" placeholderTextColor={Colors.muted} />

                            <FieldLabel text={`${t(language, 'loanAmountLabel')} (${currency})`} />
                            <TextInput style={s.input} value={principal} onChangeText={setPrincipal}
                                placeholder="0" placeholderTextColor={Colors.muted} keyboardType="decimal-pad" />

                            <FieldLabel text={t(language, 'annualInterestRateLabel')} />
                            <TextInput style={s.input} value={rate} onChangeText={setRate}
                                placeholder="e.g. 15 for 15% (enter 0 if interest-free)" placeholderTextColor={Colors.muted} keyboardType="decimal-pad" />

                            <FieldLabel text={t(language, 'loanTermLabel')} />
                            <TextInput style={s.input} value={term} onChangeText={setTerm}
                                placeholder="e.g. 12 for 1 year, 24 for 2 years" placeholderTextColor={Colors.muted} keyboardType="number-pad" />

                            <FieldLabel text={t(language, 'startDateLabel')} />
                            <DateInput value={startDate} onChange={setStart} />

                            <FieldLabel text="Security / Collateral Pledged (optional)" />
                            <TextInput style={s.input} value={collateralPledged} onChangeText={setCollateralPledged}
                                placeholder="e.g. Delivery van, shop inventory -- leave blank if unsecured" placeholderTextColor={Colors.muted} />

                            <FieldLabel text="Covenants / Restrictions (optional)" />
                            <TextInput style={s.input} value={covenants} onChangeText={setCovenants}
                                placeholder="e.g. No further borrowing without lender consent" placeholderTextColor={Colors.muted} />

                            <TouchableOpacity style={s.marketplaceToggleRow} onPress={() => setFromMarketplace(v => !v)} activeOpacity={0.7}>
                                <View style={[s.checkbox, fromMarketplace && s.checkboxChecked]}>
                                    {fromMarketplace && <Icon name="check-circle" size={13} color="#fff" />}
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.marketplaceToggleLabel}>{t(language, 'cameFromMarketplaceLabel')}</Text>
                                    <Text style={s.marketplaceToggleHint}>{t(language, 'unlocksImpactHint')}</Text>
                                </View>
                            </TouchableOpacity>

                            {/* Live preview */}
                            {principal && rate && term && !isNaN(parseFloat(principal)) && !isNaN(parseFloat(rate)) && !isNaN(parseInt(term)) && (() => {
                                const mPay = monthlyPayment(parseFloat(principal), parseFloat(rate), parseInt(term));
                                const monthlyProfit = finance?.profit ?? 0;
                                const profitAfter = monthlyProfit - mPay;
                                // Share of current monthly profit consumed by the repayment
                                const profitShare = monthlyProfit > 0 ? (mPay / monthlyProfit) * 100 : (mPay > 0 ? Infinity : 0);
                                const affordable = profitAfter >= 0;
                                const tight = affordable && profitShare > 40; // heavy but survivable
                                return (
                                    <View style={s.previewBox}>
                                        <Text style={s.previewTitle}>Repayment Preview</Text>
                                        <Text style={s.previewLine}>Monthly payment: <Text style={s.previewVal}>{currency}{mPay.toFixed(2)}</Text></Text>
                                        <Text style={s.previewLine}>Total interest: <Text style={[s.previewVal, { color: Colors.expense }]}>{currency}{totalInterest(parseFloat(principal), parseFloat(rate), parseInt(term)).toFixed(2)}</Text></Text>
                                        <Text style={s.previewLine}>Total repayable: <Text style={s.previewVal}>{currency}{(parseFloat(principal) + totalInterest(parseFloat(principal), parseFloat(rate), parseInt(term))).toFixed(2)}</Text></Text>

                                        {/* Effect on profit */}
                                        <View style={s.impactDivider} />
                                        <Text style={s.previewTitle}>Effect on Monthly Profit</Text>
                                        <Text style={s.previewLine}>Current monthly profit: <Text style={s.previewVal}>{currency}{monthlyProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text></Text>
                                        <Text style={s.previewLine}>
                                            Profit after repayment:{' '}
                                            <Text style={[s.previewVal, { color: affordable ? Colors.income : Colors.expense }]}>
                                                {currency}{profitAfter.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                            </Text>
                                        </Text>
                                        <Text style={s.previewLine}>
                                            Repayment uses{' '}
                                            <Text style={[s.previewVal, { color: tight || !affordable ? Colors.expense : Colors.textPrimary }]}>
                                                {isFinite(profitShare) ? `${profitShare.toFixed(0)}%` : 'more than 100%'}
                                            </Text>{' '}of current profit
                                        </Text>

                                        {/* Verdict */}
                                        {(() => {
                                            const verdictColor = !affordable ? Colors.expense : tight ? Colors.warning : Colors.income;
                                            return (
                                                <View style={[s.verdictBox, { backgroundColor: verdictColor + '18', borderColor: verdictColor }]}>
                                                    <Icon name={!affordable || tight ? 'alert-triangle' : 'check-circle'} size={14} color={verdictColor} />
                                                    <Text style={[s.verdictText, { color: verdictColor }]}>
                                                        {!affordable
                                                            ? `This repayment (${currency}${mPay.toFixed(0)}/mo) exceeds your current monthly profit — it would push you into a monthly loss. Consider a longer term or smaller amount.`
                                                            : tight
                                                                ? `Manageable but heavy: it consumes ${profitShare.toFixed(0)}% of monthly profit, leaving little buffer. A longer term lowers the monthly payment.`
                                                                : `Affordable: leaves ${currency}${profitAfter.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo in profit after repayment.`}
                                                    </Text>
                                                </View>
                                            );
                                        })()}
                                        {(!affordable || tight) && (
                                            <NextStepLink text="See the full effect on your cash forecast before committing" onPress={() => navigate('cashflow')} />
                                        )}

                                        {/* Before You Take This On -- two questions worth
                                            asking before signing: does the term give this
                                            facility enough runway to complete a full cash
                                            cycle, and does a flat monthly payment sit
                                            comfortably against how this business's revenue
                                            actually moves through the year. Silent when
                                            there isn't enough history to answer honestly. */}
                                        {(() => {
                                            const tenorCheck = computeTenorCycleCheck(parseInt(term, 10), transactions, inventory);
                                            const seasonalCheck = computeRepaymentSeasonalAlignment(transactions, mPay);
                                            const weekdayCheck = computeRepaymentWeekdayAlignment(transactions);
                                            if (!tenorCheck && !seasonalCheck.available && !weekdayCheck.available) return null;
                                            return (
                                                <>
                                                    <View style={s.impactDivider} />
                                                    <Text style={s.previewTitle}>Before You Take This On</Text>
                                                    {tenorCheck && (
                                                        <View style={[s.tenorNote, tenorCheck.status === 'shorter_than_cycle' && s.tenorNoteWarn]}>
                                                            <Text style={s.tenorNoteLabel}>
                                                                {tenorCheck.status === 'shorter_than_cycle' ? '⚠️ Tenor vs. Cash Cycle' : '✅ Tenor vs. Cash Cycle'}
                                                            </Text>
                                                            <Text style={s.tenorNoteText}>{tenorCheck.message}</Text>
                                                        </View>
                                                    )}
                                                    {seasonalCheck.available && (
                                                        <View style={[s.tenorNote, !seasonalCheck.aligned && s.tenorNoteWarn]}>
                                                            <Text style={s.tenorNoteLabel}>
                                                                {seasonalCheck.aligned ? '✅ Repayment vs. Sales Pattern' : '⚠️ Repayment vs. Sales Pattern'}
                                                            </Text>
                                                            <Text style={s.tenorNoteText}>{seasonalCheck.message}</Text>
                                                        </View>
                                                    )}
                                                    {weekdayCheck.available && (
                                                        <View style={[s.tenorNote, weekdayCheck.concentrated && s.tenorNoteWarn]}>
                                                            <Text style={s.tenorNoteLabel}>
                                                                {weekdayCheck.concentrated ? '⚠️ Repayment vs. Weekday Cash Flow' : '✅ Repayment vs. Weekday Cash Flow'}
                                                            </Text>
                                                            <Text style={s.tenorNoteText}>{weekdayCheck.message}</Text>
                                                        </View>
                                                    )}
                                                </>
                                            );
                                        })()}

                                        <ProfitCashImpactCard
                                            impact={computeProfitCashImpact(monthlyProfit, finance?.cashBalance ?? 0, -mPay)}
                                            source="loan"
                                            currency={currency}
                                            onSeeFullPicture={() => navigate('business-passport')}
                                        />
                                    </View>
                                );
                            })()}

                            <View style={s.btnRow}>
                                <TouchableOpacity style={[s.btn, s.btnSec]} onPress={() => { setShowForm(false); resetForm(); }}>
                                    <Text style={s.btnSecText}>{t(language, 'cancel')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={s.btn} onPress={handleSave}>
                                    <Text style={s.btnText}>{t(language, 'save')}</Text>
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Record Payment Modal */}
            {showPayment && (
                <Modal visible animationType="slide" transparent>
                    <View style={s.overlay}>
                        <View style={[s.sheet, { maxHeight: 380 }, constrainSheetWidth && s.sheetWide]}>
                            <Text style={s.modalTitle}>{t(language, 'recordPaymentTitle')}</Text>

                            <FieldLabel text={`${t(language, 'amountPaidLabel')} (${currency})`} />
                            <TextInput style={s.input} value={payAmount} onChangeText={setPayAmount}
                                placeholder="0" placeholderTextColor={Colors.muted} keyboardType="decimal-pad" autoFocus />

                            <FieldLabel text={t(language, 'paymentDateLabel')} />
                            <DateInput value={payDate} onChange={setPayDate} />

                            <FieldLabel text={t(language, 'noteOptionalLabel')} />
                            <TextInput style={s.input} value={payNote} onChangeText={setPayNote}
                                placeholder="e.g. Monthly installment" placeholderTextColor={Colors.muted} />

                            <View style={s.btnRow}>
                                <TouchableOpacity style={[s.btn, s.btnSec]} onPress={() => setShowPayment(null)}>
                                    <Text style={s.btnSecText}>{t(language, 'cancel')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={s.btn} onPress={() => handleAddPayment(showPayment)}>
                                    <Text style={s.btnText}>{t(language, 'recordBtn')}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>
            )}

            {/* Link Loan to Lender Modal (Phase 2b) */}
            {linkingLoanId && (
                <Modal visible animationType="slide" transparent>
                    <View style={s.overlay}>
                        <View style={[s.sheet, { maxHeight: 480 }, constrainSheetWidth && s.sheetWide]}>
                            <Text style={s.modalTitle}>{t(language, 'linkToYourLenderTitle')}</Text>
                            <Text style={s.linkModalHint}>
                                {t(language, 'linkModalHintText')}
                            </Text>
                            <TextInput
                                style={s.input}
                                value={directoryQuery}
                                onChangeText={setDirectoryQuery}
                                placeholder={t(language, 'searchLendersPlaceholder')}
                                placeholderTextColor={Colors.muted}
                                autoFocus
                            />
                            <ScrollView style={{ maxHeight: 280, marginTop: 8 }} keyboardShouldPersistTaps="handled">
                                {lenderDirectory === null ? (
                                    <Text style={s.linkModalEmpty}>{t(language, 'loadingEllipsis')}</Text>
                                ) : lenderDirectory.filter(e => e.name.toLowerCase().includes(directoryQuery.trim().toLowerCase())).length === 0 ? (
                                    <Text style={s.linkModalEmpty}>{t(language, 'noRegisteredLendersMatch')} "{directoryQuery}".</Text>
                                ) : (
                                    lenderDirectory
                                        .filter(e => e.name.toLowerCase().includes(directoryQuery.trim().toLowerCase()))
                                        .map(entry => (
                                            <TouchableOpacity key={entry.id} style={s.directoryRow} onPress={() => handlePickLender(entry)}>
                                                <View>
                                                    <Text style={s.directoryName}>{entry.name}</Text>
                                                    <Text style={s.directoryType}>{entry.orgType}</Text>
                                                </View>
                                                <Icon name="chevron-right" size={16} color={Colors.textMuted} />
                                            </TouchableOpacity>
                                        ))
                                )}
                            </ScrollView>
                            <View style={s.btnRow}>
                                <TouchableOpacity style={[s.btn, s.btnSec]} onPress={() => setLinkingLoanId(null)}>
                                    <Text style={s.btnSecText}>{t(language, 'cancel')}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>
            )}

            <FooterNav />
        </SafeAreaView>
    );
}

// ── SUB-COMPONENTS ────────────────────────────────────────────────────────

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
    return (
        <TouchableOpacity
            style={[s.tabButton, active && s.tabButtonActive]}
            onPress={onPress}
        >
            <Text style={[s.tabButtonText, active && s.tabButtonTextActive]}>
                {label}
            </Text>
            {active && <View style={s.tabUnderline} />}
        </TouchableOpacity>
    );
}

// React.memo only pays off if props are referentially stable across
// re-renders -- the parent now passes the same onToggle/onEdit/onDelete/
// onAddPayment function on every render (wrapped in useCallback) instead of
// a fresh per-item closure, so a card whose own loan/expanded state hasn't
// changed can actually skip re-rendering when a sibling card is toggled or
// an unrelated part of LoansScreen re-renders.
const LoanCard = React.memo(function LoanCard({ loan, currency, expanded, transactions, readinessHistory, dscr, user, updateLoan, onToggle, onEdit, onDelete, onAddPayment, onLinkLender, language, isDemoMode }: {
    loan: Loan; currency: string; expanded: boolean;
    transactions: Transaction[]; readinessHistory: ReadinessSnapshot[]; dscr: DSCRResult;
    user: ReturnType<typeof useApp>['user']; updateLoan: ReturnType<typeof useApp>['updateLoan'];
    onToggle: (id: string) => void; onEdit: (loan: Loan) => void; onDelete: (id: string) => void; onAddPayment: (id: string) => void;
    onLinkLender: (loanId: string) => void;
    language: import('../utils/i18n').Language;
    isDemoMode: boolean;
}) {
    const paid = totalPaid(loan);
    const balance = outstandingBalance(loan);
    const monthly = monthlyPayment(loan.principal, loan.interestRate, loan.termMonths);
    const interest = totalInterest(loan.principal, loan.interestRate, loan.termMonths);
    const progress = Math.min(100, (paid / loan.principal) * 100);
    const overdue = isOverdue(loan);
    const statusColor = loan.status === 'paid_off' ? Colors.income : loan.status === 'defaulted' ? Colors.expense : overdue ? Colors.warning : Colors.textMuted;

    const monitor = useMemo(
        () => loan.fromMarketplace ? computePostFinancingMonitor(loan, transactions, readinessHistory, dscr) : null,
        [loan, transactions, readinessHistory, dscr],
    );
    const MONITOR_STATUS_STYLE: Record<PostFinancingStatus, { label: string; color: string }> = {
        healthy: { label: t(language, 'healthyLabel'), color: Colors.income },
        watch: { label: t(language, 'watchLabel'), color: Colors.warning },
        'at-risk': { label: t(language, 'atRiskLabel'), color: Colors.expense },
    };

    // Phase 2a: consent lives on the loan itself (updateLoan), and the
    // business name comes from `user` -- both now passed down as props
    // instead of each LoanCard calling useApp() itself. useApp() rebuilds
    // its whole return value (and, until recently, ran a full financial-
    // diagnosis scan) on every call; with one loan that's cheap, but with
    // N loans rendered in a list, N independent useApp() calls per render
    // multiplied that cost by N. The parent already calls useApp() once.
    const [sharing, setSharing] = useState(false);
    const [pinConfirmVisible, setPinConfirmVisible] = useState(false);
    const applyShareConsent = (next: boolean) => {
        updateLoan(loan.id, { shareWithLenderConsent: next, shareConsentUpdatedAt: new Date().toISOString() });
        // Revocation must take effect immediately, not on the next monitor
        // recompute -- the useEffect below only handles publishing while
        // consent is active, so turning it off has to be handled here.
        if (!next) revokeLoanMonitoringShare(loan.id);
    };
    // Granting consent (turning sharing on) is the step-up-worthy direction --
    // it's the moment loan status starts leaving the business and going to a
    // lender. Revoking needs no PIN: reducing what's shared is never the risky
    // action.
    const toggleShareConsent = () => {
        const next = !loan.shareWithLenderConsent;
        if (next && !isDemoMode) { setPinConfirmVisible(true); return; }
        applyShareConsent(next);
    };

    // Phase 2b: keeps the lender's portfolio view current as the monitor's
    // own signals change over time (not just at the moment consent was
    // granted) -- re-publishes whenever status/trend/flags actually differ,
    // guarded so an unlinked loan or withheld consent never writes anything.
    useEffect(() => {
        if (!monitor || !loan.lenderOrgId || !loan.shareWithLenderConsent) return;
        publishLoanMonitoringShare(loan, monitor, user?.businessName || 'Your Business', currency);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [monitor?.status, monitor?.readinessSinceFunding?.trend, monitor?.signals.map(s => s.tripped).join(','), loan.lenderOrgId, loan.shareWithLenderConsent]);

    const handleShareStatus = async () => {
        if (!monitor) return;
        setSharing(true);
        try {
            const exportData = buildPostFinancingShareExport(loan, monitor, user?.businessName || 'Your Business');
            const filePath = await generatePDF(exportData);
            await sharePDF(filePath, exportData.title);
        } catch {
            showAlert('Share failed', 'Could not generate the status summary. Please try again.');
        } finally {
            setSharing(false);
        }
    };

    return (
        <View style={[s.card, overdue && { borderColor: Colors.warning, borderWidth: 1.5 }]}>
            <TouchableOpacity onPress={() => onToggle(loan.id)} activeOpacity={0.8}>
                <View style={s.cardHeader}>
                    <View style={{ flex: 1 }}>
                        <Text style={s.lenderName}>{loan.lenderName}</Text>
                        {loan.purpose ? <Text style={s.loanPurpose}>{loan.purpose}</Text> : null}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                        <View style={[s.badgeRow, { marginBottom: 2 }]}>
                            <Icon
                                name={loan.status === 'paid_off' ? 'check-circle' : loan.status === 'defaulted' ? 'x-circle' : overdue ? 'alert-triangle' : 'refresh-cw'}
                                size={11}
                                color={statusColor}
                            />
                            <Text style={[s.statusBadge, { color: statusColor, marginBottom: 0 }]}>
                                {loan.status === 'paid_off' ? t(language, 'statusPaidOff') : loan.status === 'defaulted' ? t(language, 'statusDefaulted') : overdue ? t(language, 'overdue') : t(language, 'statusActive')}
                            </Text>
                        </View>
                        <Text style={s.balanceText}>{currency}{balance.toLocaleString(undefined, { maximumFractionDigits: 0 })} {t(language, 'balanceLeftSuffix')}</Text>
                    </View>
                </View>

                {/* Progress bar */}
                <View style={s.progressBg}>
                    <View style={[s.progressFill, { width: `${progress}%` as any, backgroundColor: loan.status === 'paid_off' ? Colors.income : Colors.primary }]} />
                </View>
                <Text style={s.progressLabel}>{progress.toFixed(0)}% repaid · {currency}{paid.toLocaleString(undefined, { maximumFractionDigits: 0 })} of {currency}{loan.principal.toLocaleString()}</Text>

                {/* Key metrics row */}
                <View style={s.metricsRow}>
                    <Metric label={t(language, 'monthlyMetricLabel')} value={`${currency}${monthly.toFixed(0)}`} />
                    <Metric label={t(language, 'rateMetricLabel')} value={`${loan.interestRate ?? 0}% p.a.`} />
                    <Metric label={t(language, 'totalInterestMetricLabel')} value={`${currency}${interest.toFixed(0)}`} color={Colors.expense} />
                    <Metric label={t(language, 'payoffDateMetricLabel')} value={payoffDate(loan)} />
                </View>
            </TouchableOpacity>

            {/* Expanded: payment history + actions */}
            {expanded && (
                <View style={s.expanded}>
                    {(loan.collateralPledged || loan.covenants) && (
                        <View style={s.securityBox}>
                            <Text style={s.securityBoxTitle}>🔒 Security &amp; Covenants</Text>
                            {loan.collateralPledged && (
                                <Text style={s.securityBoxLine}><Text style={s.securityBoxLabel}>Pledged: </Text>{loan.collateralPledged}</Text>
                            )}
                            {loan.covenants && (
                                <Text style={s.securityBoxLine}><Text style={s.securityBoxLabel}>Covenants: </Text>{loan.covenants}</Text>
                            )}
                        </View>
                    )}
                    {loan.status === 'active' && (
                        <View style={s.nextDueRow}>
                            <Text style={s.nextDueLabel}>{t(language, 'nextPaymentDueLabel')}</Text>
                            <Text style={[s.nextDueDate, overdue && { color: Colors.warning }]}>{nextDueDate(loan)}</Text>
                        </View>
                    )}

                    {(loan.payments ?? []).length > 0 && (
                        <View style={s.paymentHistory}>
                            <Text style={s.paymentHistoryTitle}>{t(language, 'paymentHistoryTitle')}</Text>
                            {[...(loan.payments ?? [])].reverse().slice(0, 5).map(p => {
                                const totalPaid = p.amount + (p.interestPortion || 0);
                                return (
                                    <View key={p.id} style={s.paymentRow}>
                                        <Text style={s.paymentDate}>{p.date}</Text>
                                        <Text style={s.paymentNote}>{p.note || t(language, 'paymentWord')}</Text>
                                        <View style={{ alignItems: 'flex-end' }}>
                                            <Text style={[s.paymentAmt, { color: Colors.income }]}>+{currency}{totalPaid.toLocaleString()}</Text>
                                            {!!p.interestPortion && (
                                                <Text style={s.paymentBreakdown}>{currency}{p.amount.toLocaleString()} principal + {currency}{p.interestPortion.toLocaleString()} interest</Text>
                                            )}
                                        </View>
                                    </View>
                                );
                            })}
                            {(loan.payments ?? []).length > 5 && (
                                <Text style={s.morePayments}>+{(loan.payments ?? []).length - 5} more payments</Text>
                            )}
                        </View>
                    )}

                    {monitor && (
                        <View style={s.monitorBox}>
                            <View style={s.monitorHeaderRow}>
                                <Text style={s.monitorTitle}>📡 {t(language, 'thisLoansImpactTitle')}</Text>
                                <View style={[s.monitorBadge, { backgroundColor: MONITOR_STATUS_STYLE[monitor.status].color + '22' }]}>
                                    <Text style={[s.monitorBadgeText, { color: MONITOR_STATUS_STYLE[monitor.status].color }]}>{MONITOR_STATUS_STYLE[monitor.status].label}</Text>
                                </View>
                            </View>
                            <Text style={s.monitorSub}>{t(language, 'trackedSinceFunded')}</Text>

                            {monitor.signals.map(sig => (
                                <View key={sig.label} style={s.monitorSignalRow}>
                                    <Text style={[s.monitorSignalIcon, { color: sig.tripped ? Colors.expense : Colors.income }]}>{sig.tripped ? '⚠' : '✓'}</Text>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.monitorSignalLabel}>{sig.label}</Text>
                                        <Text style={s.monitorSignalDetail}>{sig.detail}</Text>
                                    </View>
                                </View>
                            ))}

                            {monitor.readinessSinceFunding && (
                                <Text style={[s.monitorReadiness, { color: monitor.readinessSinceFunding.trend === 'improving' ? Colors.income : monitor.readinessSinceFunding.trend === 'declining' ? Colors.expense : Colors.textSecondary }]}>
                                    Readiness since funding: {monitor.readinessSinceFunding.fromScore} → {monitor.readinessSinceFunding.toScore} over {monitor.readinessSinceFunding.periodLabel}
                                </Text>
                            )}

                            {monitor.tactics.length > 0 && (
                                <View style={s.monitorTacticsBox}>
                                    {monitor.tactics.map((t, i) => <Text key={i} style={s.monitorTactic}>• {t}</Text>)}
                                </View>
                            )}

                            <View style={s.shareDivider} />

                            {!loan.lenderOrgId ? (
                                <TouchableOpacity style={s.linkLenderRow} onPress={() => onLinkLender(loan.id)} activeOpacity={0.7}>
                                    <Icon name="link" size={14} color={Colors.primary} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.linkLenderLabel}>Link to {loan.lenderName || 'this lender'} on Quad360</Text>
                                        <Text style={s.marketplaceToggleHint}>
                                            If {loan.lenderName || 'this lender'} is registered on Quad360, linking lets you share this status with them on an ongoing basis — not just a one-time export.
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity style={s.shareToggleRow} onPress={toggleShareConsent} activeOpacity={0.7}>
                                    <View style={[s.checkbox, loan.shareWithLenderConsent && s.checkboxChecked]}>
                                        {loan.shareWithLenderConsent && <Icon name="check-circle" size={13} color="#fff" />}
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.marketplaceToggleLabel}>Keep {loan.lenderName || 'this lender'} updated on this loan's status</Text>
                                        <Text style={s.marketplaceToggleHint}>
                                            Only the status above (Healthy/Watch/At Risk), the trend, and which signals are flagged — never transaction data, exact figures, or account details. Updates automatically as your numbers change, renewing the share for another 90 days each time. Revocable any time.
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            )}

                            {loan.lenderOrgId && loan.shareWithLenderConsent && (
                                <TouchableOpacity style={s.shareBtn} onPress={handleShareStatus} disabled={sharing}>
                                    <Icon name="share-2" size={13} color={Colors.primary} />
                                    <Text style={s.shareBtnText}>{sharing ? t(language, 'preparingEllipsis') : t(language, 'exportStatusSummaryBtn')}</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}

                    <View style={s.actionRow}>
                        {loan.status === 'active' && (
                            <TouchableOpacity style={s.actionBtn} onPress={() => onAddPayment(loan.id)}>
                                <Text style={[s.actionBtnText, { color: Colors.income }]}>{t(language, 'recordPaymentBtn')}</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity style={s.actionBtn} onPress={() => onEdit(loan)}>
                            <Text style={s.actionBtnText}>{t(language, 'edit')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[s.actionBtn, { borderColor: Colors.expense }]} onPress={() => onDelete(loan.id)}>
                            <Text style={[s.actionBtnText, { color: Colors.expense }]}>{t(language, 'delete')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            <PinConfirmModal
                visible={pinConfirmVisible}
                title="Confirm sharing with lender"
                message={`Enter your PIN to start sharing this loan's status with ${loan.lenderName || 'this lender'}.`}
                confirmLabel="Share status"
                onCancel={() => setPinConfirmVisible(false)}
                onConfirm={() => { setPinConfirmVisible(false); applyShareConsent(true); }}
            />
        </View>
    );
});

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>{label}</Text>
            <Text style={[s.summaryValue, { color }]}>{value}</Text>
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

function FieldLabel({ text }: { text: string }) {
    return <Text style={s.fieldLabel}>{text}</Text>;
}

// ── STYLES ────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: Spacing.lg, paddingBottom: 100 },
    title: { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 14 },

    // Small icon + label row shared by status badges and section titles.
    badgeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
    },

    // Tab Bar
    tabBar: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
        backgroundColor: Colors.surface,
    },
    tabButton: {
        flex: 1,
        paddingVertical: Spacing.md,
        paddingHorizontal: Spacing.lg,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tabButtonActive: {
        borderBottomWidth: 3,
        borderBottomColor: Colors.primary,
    },
    tabButtonText: {
        fontSize: 12,
        fontWeight: '600',
        color: Colors.textMuted,
    },
    tabButtonTextActive: {
        color: Colors.primary,
        fontWeight: '700',
    },
    tabUnderline: {
        position: 'absolute',
        bottom: 0,
        height: 3,
        backgroundColor: Colors.primary,
    },

    summaryRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: 14 },
    strategyCard: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.lg, marginBottom: 14, borderLeftWidth: 3, borderLeftColor: Colors.primary },
    strategyTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: 6 },
    strategyTitle: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },
    strategyRecommendation: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginBottom: 12 },
    strategyMethodRow: { flexDirection: 'row', gap: 10 },
    strategyMethod: { flex: 1, backgroundColor: Colors.bg, borderRadius: 10, padding: 10 },
    strategyMethodLabelRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: 6 },
    strategyMethodLabel: { fontSize: 11, fontWeight: '700', color: Colors.textPrimary },
    strategyOrderItem: { fontSize: 11, color: Colors.textSecondary, marginBottom: 3 },
    strategySaved: { fontSize: 11, fontWeight: '800', marginTop: 6 },

    dscrBigNum: { fontSize: 28, fontWeight: 'bold' },
    dscrStatusBadge: { fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    dscrDetailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderTopWidth: 1, borderTopColor: Colors.border },
    dscrDetailLabel: { fontSize: 12.5, color: Colors.textSecondary },
    dscrDetailVal: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    dscrWhyBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border },
    dscrWhyBtnText: { fontSize: 11.5, fontWeight: '600', color: Colors.textMuted },
    dscrWhyBox: { backgroundColor: Colors.bg, borderRadius: Radius.md, padding: Spacing.md, marginTop: 8, gap: 2 },
    dscrWhyLabel: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 8 },
    dscrWhyText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
    dscrWhyBullet: { fontSize: 11, color: Colors.textMuted, lineHeight: 16, marginTop: 2 },

    shockChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg },
    shockChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    shockChipText: { fontSize: 12.5, color: Colors.textSecondary, fontWeight: '600' },
    shockChipTextActive: { color: '#fff' },
    shockInput: { backgroundColor: Colors.bg, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, padding: 12, color: Colors.textPrimary, marginBottom: 10, fontSize: 13 },

    summaryCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: 10, padding: Spacing.md, alignItems: 'center' },
    summaryLabel: { fontSize: 10, color: Colors.textMuted, marginBottom: 3, textAlign: 'center' },
    summaryValue: { fontSize: 14, fontWeight: '700' },

    alertBanner: { backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: Colors.expense, borderRadius: 10, padding: Spacing.md, marginBottom: Spacing.md },
    alertTextRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
    alertText: { color: Colors.expense, fontWeight: '600', fontSize: 13, textAlign: 'center' },

    detectedAlert: { backgroundColor: Colors.primary + '12', borderWidth: 1, borderColor: Colors.primary, borderRadius: 10, padding: Spacing.md, marginBottom: Spacing.md },
    unlinkedRow: { flexDirection: 'row', alignItems: 'center', paddingTop: Spacing.sm, marginTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.primary + '30', gap: Spacing.sm },
    unlinkedName: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary },
    unlinkedMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
    unlinkedAdd: { fontSize: 11.5, color: Colors.primary, fontWeight: '700' },
    loanPickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.xs },
    loanPickChip: { backgroundColor: Colors.primary + '18', borderWidth: 1, borderColor: Colors.primary, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8 },
    loanPickChipText: { fontSize: 11, fontWeight: '700', color: Colors.primary },

    emptyState: { alignItems: 'center', paddingTop: 60 },
    emptyIcon: { marginBottom: Spacing.md },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
    emptySub: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20, marginBottom: 20 },
    emptyAddBtn: { backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 28, paddingVertical: Spacing.md },
    emptyAddBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

    card: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 14, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
    lenderName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
    loanPurpose: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
    statusBadge: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
    balanceText: { fontSize: 16, fontWeight: '800', color: Colors.expense },

    progressBg: { height: 6, backgroundColor: Colors.border, borderRadius: 3, marginBottom: Spacing.xs },
    progressFill: { height: 6, borderRadius: 3 },
    progressLabel: { fontSize: 10, color: Colors.textMuted, marginBottom: 10 },

    metricsRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 },
    metricLabel: { fontSize: 9, color: Colors.textMuted, textAlign: 'center', marginBottom: 2 },
    metricValue: { fontSize: 11, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },

    expanded: { borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 10, paddingTop: 10 },
    nextDueRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
    nextDueLabel: { fontSize: 12, color: Colors.textMuted },

    securityBox: { backgroundColor: Colors.surface, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, padding: 10, marginBottom: 10 },
    securityBoxTitle: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
    securityBoxLine: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginTop: 2 },
    securityBoxLabel: { fontWeight: '700', color: Colors.textPrimary },
    nextDueDate: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },

    paymentHistory: { backgroundColor: Colors.bg, borderRadius: Radius.sm, padding: 10, marginBottom: 10 },
    paymentHistoryTitle: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, marginBottom: Spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
    paymentRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    paymentDate: { fontSize: 11, color: Colors.textMuted, width: 85 },
    paymentNote: { flex: 1, fontSize: 11, color: Colors.textSecondary },
    paymentAmt: { fontSize: 12, fontWeight: '700' },
    paymentBreakdown: { fontSize: 9.5, color: Colors.textMuted, marginTop: 1 },
    morePayments: { fontSize: 10, color: Colors.textMuted, textAlign: 'center', marginTop: 2 },

    actionRow: { flexDirection: 'row', gap: Spacing.sm },
    actionBtn: { flex: 1, paddingVertical: 7, borderRadius: 6, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
    actionBtnText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },

    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.xl, maxHeight: '92%', ...Shadow.md },
    sheetWide: { maxWidth: 640, width: '100%', alignSelf: 'center' },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: Spacing.lg },

    fieldLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 5, marginTop: 10 },
    marketplaceToggleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 14, backgroundColor: Colors.bg, borderRadius: 10, padding: 12 },
    checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
    checkboxChecked: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    marketplaceToggleLabel: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
    marketplaceToggleHint: { fontSize: 11, color: Colors.textMuted, marginTop: 3, lineHeight: 15 },

    monitorBox: { backgroundColor: Colors.bg, borderRadius: 10, padding: 12, marginTop: 12, marginBottom: 4 },
    monitorHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    monitorTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    monitorBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    monitorBadgeText: { fontSize: 10.5, fontWeight: '700' },
    monitorSub: { fontSize: 10.5, color: Colors.textMuted, fontStyle: 'italic', marginBottom: 8, lineHeight: 14 },
    monitorSignalRow: { flexDirection: 'row', marginBottom: 7 },
    monitorSignalIcon: { fontSize: 13, fontWeight: '800', width: 18 },
    monitorSignalLabel: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary },
    monitorSignalDetail: { fontSize: 11, color: Colors.textSecondary, marginTop: 1, lineHeight: 15 },
    monitorReadiness: { fontSize: 11.5, fontWeight: '600', marginTop: 2, marginBottom: 6 },
    monitorTacticsBox: { backgroundColor: Colors.surface, borderRadius: 8, padding: 9, marginTop: 4 },
    monitorTactic: { fontSize: 11, color: Colors.textSecondary, lineHeight: 16, marginBottom: 3 },
    shareDivider: { height: 1, backgroundColor: Colors.border, marginTop: 12, marginBottom: 10 },
    shareToggleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    linkLenderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    linkLenderLabel: { fontSize: 13, fontWeight: '600', color: Colors.primary },
    linkModalHint: { fontSize: 12, color: Colors.textMuted, lineHeight: 17, marginBottom: 12 },
    linkModalEmpty: { fontSize: 12.5, color: Colors.textMuted, textAlign: 'center', paddingVertical: 20 },
    directoryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
    directoryName: { fontSize: 13.5, fontWeight: '600', color: Colors.textPrimary },
    directoryType: { fontSize: 11, color: Colors.textMuted, marginTop: 2, textTransform: 'capitalize' },
    shareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, borderWidth: 1, borderColor: Colors.primary, borderRadius: 8, paddingVertical: 9 },
    shareBtnText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
    input: {
        backgroundColor: Colors.bg, borderColor: Colors.border, borderWidth: 1,
        borderRadius: Radius.sm, paddingHorizontal: Spacing.md, paddingVertical: 10,
        color: Colors.textPrimary, fontSize: 14,
    },

    previewBox: { backgroundColor: Colors.bg, borderRadius: Radius.sm, padding: Spacing.md, marginTop: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '44' },
    previewTitle: { fontSize: 12, fontWeight: '700', color: Colors.primary, marginBottom: 6 },
    previewLine: { fontSize: 12, color: Colors.textSecondary, marginBottom: 3 },
    previewVal: { fontWeight: '700', color: Colors.textPrimary },
    impactDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 10 },
    verdictBox: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, borderRadius: Radius.sm, borderWidth: 1, padding: 10, marginTop: 10 },
    verdictText: { flex: 1, fontSize: 11, fontWeight: '600', lineHeight: 16 },

    tenorNote: { borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, padding: 10, marginBottom: 8 },
    tenorNoteWarn: { borderColor: Colors.warning + '88', backgroundColor: Colors.warning + '14' },
    tenorNoteLabel: { fontSize: 11.5, fontWeight: '700', color: Colors.textPrimary, marginBottom: 3 },
    tenorNoteText: { fontSize: 11.5, color: Colors.textSecondary, lineHeight: 16 },

    btnRow: { flexDirection: 'row', gap: 10, marginTop: Spacing.xxl, marginBottom: 10 },
    btn: { flex: 1, backgroundColor: Colors.primary, paddingVertical: 13, borderRadius: Radius.sm, alignItems: 'center' },
    btnSec: { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.border },
    btnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
    btnSecText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 14 },

    fab: {
        position: 'absolute', right: 20, bottom: 80,
        width: 54, height: 54, borderRadius: Radius.pill,
        backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
        ...Shadow.md,
    },
    fabText: { fontSize: 28, color: '#fff', lineHeight: 32 },

    featureCard: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.lg, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '40', ...Shadow.sm },
    featureIcon: { fontSize: 28 },
    featureContent: { flex: 1 },
    featureTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
    featureDesc: { fontSize: 12, color: Colors.textMuted },
    featureArrow: { fontSize: 16, color: Colors.primary, fontWeight: 'bold' },
});
