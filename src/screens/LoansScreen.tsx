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

import React, { useState, useMemo } from 'react';
import {
    SafeAreaView, ScrollView, View, Text, TextInput,
    TouchableOpacity, StyleSheet, Modal, Alert, Platform,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { Loan, LoanStatus } from '../types';
import DateInput from '../components/DateInput';
import MerchantFinancingSection from './MerchantFinancingSection';
import { computeDebtOptimiser } from '../utils/finance';

// Original Loans Screen helpers
function monthlyPayment(principal: number, annualRate: number, termMonths: number): number {
    if (!termMonths || termMonths <= 0) return 0;
    if (annualRate === 0) return principal / termMonths;
    const r = annualRate / 100 / 12;
    const factor = Math.pow(1 + r, termMonths);
    return principal * (r * factor) / (factor - 1);
}

function totalInterest(principal: number, annualRate: number, termMonths: number): number {
    return monthlyPayment(principal, annualRate, termMonths) * termMonths - principal;
}

function totalPaid(loan: Loan): number {
    return (loan.payments ?? []).reduce((s, p) => s + p.amount, 0);
}

function outstandingBalance(loan: Loan): number {
    return Math.max(0, loan.principal - totalPaid(loan));
}

function nextDueDate(loan: Loan): string {
    const start = new Date(loan.startDate);
    const paid = (loan.payments ?? []).length;
    const next = new Date(start);
    next.setMonth(next.getMonth() + paid + 1);
    return next.toISOString().split('T')[0];
}

function payoffDate(loan: Loan): string {
    const start = new Date(loan.startDate);
    const end = new Date(start);
    end.setMonth(end.getMonth() + loan.termMonths);
    return end.toISOString().split('T')[0];
}

function isOverdue(loan: Loan): boolean {
    if (loan.status !== 'active') return false;
    const due = new Date(nextDueDate(loan));
    return due < new Date();
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────

export default function LoansScreen() {
    const { loans, addLoan, updateLoan, deleteLoan, addLoanPayment, settings, navigate, finance } = useApp();
    const { currency } = settings;

    // Feature flag for merchant financing
    const enableFinancing = process.env.EXPO_PUBLIC_ENABLE_FINANCING !== 'false';

    const [activeTab, setActiveTab] = useState<'existing' | 'financing'>('existing');
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showPayment, setShowPayment] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Loan form
    const [lender, setLender] = useState('');
    const [purpose, setPurpose] = useState('');
    const [principal, setPrincipal] = useState('');
    const [rate, setRate] = useState('');
    const [term, setTerm] = useState('');
    const [startDate, setStart] = useState(new Date().toISOString().split('T')[0]);
    const [status, setStatus] = useState<LoanStatus>('active');

    // Payment form
    const [payAmount, setPayAmount] = useState('');
    const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
    const [payNote, setPayNote] = useState('');

    const resetForm = () => {
        setLender(''); setPurpose(''); setPrincipal(''); setRate('');
        setTerm(''); setStart(new Date().toISOString().split('T')[0]);
        setStatus('active'); setEditingId(null);
    };

    const openAdd = () => { resetForm(); setShowForm(true); };

    const openEdit = (l: Loan) => {
        setLender(l.lenderName); setPurpose(l.purpose);
        setPrincipal(String(l.principal)); setRate(String(l.interestRate));
        setTerm(String(l.termMonths)); setStart(l.startDate);
        setStatus(l.status); setEditingId(l.id); setShowForm(true);
    };

    const handleSave = () => {
        if (!lender.trim()) { Alert.alert('Error', 'Please enter the lender name.'); return; }
        const p = parseFloat(principal);
        const r = parseFloat(rate);
        const t = parseInt(term, 10);
        if (isNaN(p) || p <= 0) { Alert.alert('Error', 'Please enter a valid loan amount.'); return; }
        if (isNaN(r) || r < 0) { Alert.alert('Error', 'Please enter a valid interest rate (0 for interest-free).'); return; }
        if (isNaN(t) || t <= 0) { Alert.alert('Error', 'Please enter a valid loan term in months.'); return; }

        const payload = {
            lenderName: lender.trim(), purpose: purpose.trim(),
            principal: p, interestRate: r, termMonths: t,
            startDate, status,
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
        if (isNaN(amt) || amt <= 0) { Alert.alert('Error', 'Please enter a valid payment amount.'); return; }
        addLoanPayment(loanId, { amount: amt, date: payDate, note: payNote.trim() || undefined });
        setShowPayment(null);
        setPayAmount(''); setPayNote('');
        setPayDate(new Date().toISOString().split('T')[0]);
    };

    const confirmDelete = (id: string) => {
        if (Platform.OS === 'web') {
            if (window.confirm('Remove this loan and all its payment history?')) {
                deleteLoan(id);
            }
        } else {
            Alert.alert('Delete Loan', 'Remove this loan and all its payment history?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => deleteLoan(id) },
            ]);
        }
    };

    // Summary stats
    const activeLoans = loans.filter(l => l.status === 'active');
    const totalDebt = activeLoans.reduce((s, l) => s + outstandingBalance(l), 0);
    const totalMonthly = activeLoans.reduce((s, l) => s + monthlyPayment(l.principal, l.interestRate, l.termMonths), 0);
    const overdueLoans = activeLoans.filter(isOverdue);

    // Multi-loan payoff strategy (avalanche vs snowball) — only meaningful
    // with 2+ active loans; a single loan has no ordering decision to make.
    const debtOpt = useMemo(() => computeDebtOptimiser(loans), [loans]);
    const showDebtStrategy = activeLoans.length >= 2;

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
                    label="Loan Register"
                    active={activeTab === 'existing'}
                    onPress={() => setActiveTab('existing')}
                />
                {enableFinancing && (
                    <TabButton
                        label="Merchant Financing"
                        active={activeTab === 'financing'}
                        onPress={() => setActiveTab('financing')}
                    />
                )}
            </View>

            {/* TAB CONTENT */}
            {(activeTab === 'existing' || !enableFinancing) ? (
                <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
                    <Text style={s.title}>Loan Register</Text>

                    {/* Summary */}
                    <View style={s.summaryRow}>
                        <SummaryCard label="Total Outstanding" value={`${currency}${totalDebt.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} color={Colors.expense} />
                        <SummaryCard label="Monthly Repayment" value={`${currency}${totalMonthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} color={Colors.warning} />
                        <SummaryCard label="Active Loans" value={String(activeLoans.length)} color={Colors.textPrimary} />
                    </View>

                    {/* Debt Payoff Strategy — which loan to attack first and why,
                        with real interest saved, not just a flat list of loans. */}
                    {showDebtStrategy && (
                        <View style={s.strategyCard}>
                            <Text style={s.strategyTitle}>🎯 Debt Payoff Strategy</Text>
                            <Text style={s.strategyRecommendation}>{debtOpt.recommendation}</Text>

                            <View style={s.strategyMethodRow}>
                                <View style={s.strategyMethod}>
                                    <Text style={s.strategyMethodLabel}>⚡ Avalanche (lowest total interest)</Text>
                                    {debtOpt.avalanche.order.map((name, i) => (
                                        <Text key={i} style={s.strategyOrderItem}>{i + 1}. {name}</Text>
                                    ))}
                                    <Text style={[s.strategySaved, { color: Colors.income }]}>
                                        Saves {currency}{Math.abs(debtOpt.avalanche.totalInterestSaved).toLocaleString(undefined, { maximumFractionDigits: 0 })} in interest
                                    </Text>
                                </View>
                                <View style={s.strategyMethod}>
                                    <Text style={s.strategyMethodLabel}>❄️ Snowball (fastest wins)</Text>
                                    {debtOpt.snowball.order.map((name, i) => (
                                        <Text key={i} style={s.strategyOrderItem}>{i + 1}. {name}</Text>
                                    ))}
                                    <Text style={s.strategyOrderItem}>Clears smallest balance first for momentum</Text>
                                </View>
                            </View>
                        </View>
                    )}

                    {/* Loan Eligibility Tool */}
                    <TouchableOpacity onPress={() => navigate('loan-eligibility')} style={s.featureCard}>
                        <Text style={s.featureIcon}>💼</Text>
                        <View style={s.featureContent}>
                            <Text style={s.featureTitle}>Loan Eligibility Tracker</Text>
                            <Text style={s.featureDesc}>Compare 4 loan types and check your eligibility</Text>
                        </View>
                        <Text style={s.featureArrow}>→</Text>
                    </TouchableOpacity>

                    {/* Overdue alert */}
                    {overdueLoans.length > 0 && (
                        <View style={s.alertBanner}>
                            <Text style={s.alertText}>
                                ⚠️ {overdueLoans.length} loan payment{overdueLoans.length > 1 ? 's are' : ' is'} overdue
                            </Text>
                        </View>
                    )}

                    {loans.length === 0 ? (
                        <View style={s.emptyState}>
                            <Text style={s.emptyIcon}>🏦</Text>
                            <Text style={s.emptyTitle}>No loans recorded yet.</Text>
                            <Text style={s.emptySub}>
                                Add bank loans, family loans, or any money your business owes. Tracking loans helps you see total repayment obligations and interest costs.
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
                                onToggle={() => setExpandedId(expandedId === loan.id ? null : loan.id)}
                                onEdit={() => openEdit(loan)}
                                onDelete={() => confirmDelete(loan.id)}
                                onAddPayment={() => {
                                    setShowPayment(loan.id);
                                    setPayDate(new Date().toISOString().split('T')[0]);
                                }}
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
                    <View style={s.sheet}>
                        <ScrollView keyboardShouldPersistTaps="handled">
                            <Text style={s.modalTitle}>{editingId ? 'Edit Loan' : 'Add Loan'}</Text>

                            <FieldLabel text="Lender Name" />
                            <TextInput style={s.input} value={lender} onChangeText={setLender}
                                placeholder="e.g. GTBank, Family Friend" placeholderTextColor={Colors.muted} />

                            <FieldLabel text="Purpose (optional)" />
                            <TextInput style={s.input} value={purpose} onChangeText={setPurpose}
                                placeholder="e.g. Equipment purchase" placeholderTextColor={Colors.muted} />

                            <FieldLabel text={`Loan Amount (${currency})`} />
                            <TextInput style={s.input} value={principal} onChangeText={setPrincipal}
                                placeholder="0" placeholderTextColor={Colors.muted} keyboardType="decimal-pad" />

                            <FieldLabel text="Annual Interest Rate (%)" />
                            <TextInput style={s.input} value={rate} onChangeText={setRate}
                                placeholder="e.g. 15 for 15% (enter 0 if interest-free)" placeholderTextColor={Colors.muted} keyboardType="decimal-pad" />

                            <FieldLabel text="Loan Term (months)" />
                            <TextInput style={s.input} value={term} onChangeText={setTerm}
                                placeholder="e.g. 12 for 1 year, 24 for 2 years" placeholderTextColor={Colors.muted} keyboardType="number-pad" />

                            <FieldLabel text="Start Date" />
                            <DateInput value={startDate} onChange={setStart} />

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
                                        <View style={[s.verdictBox, { backgroundColor: (!affordable ? Colors.expense : tight ? Colors.warning : Colors.income) + '18', borderColor: (!affordable ? Colors.expense : tight ? Colors.warning : Colors.income) }]}>
                                            <Text style={[s.verdictText, { color: !affordable ? Colors.expense : tight ? Colors.warning : Colors.income }]}>
                                                {!affordable
                                                    ? `⚠ This repayment (${currency}${mPay.toFixed(0)}/mo) exceeds your current monthly profit — it would push you into a monthly loss. Consider a longer term or smaller amount.`
                                                    : tight
                                                        ? `⚠ Manageable but heavy: it consumes ${profitShare.toFixed(0)}% of monthly profit, leaving little buffer. A longer term lowers the monthly payment.`
                                                        : `✓ Affordable: leaves ${currency}${profitAfter.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo in profit after repayment.`}
                                            </Text>
                                        </View>
                                    </View>
                                );
                            })()}

                            <View style={s.btnRow}>
                                <TouchableOpacity style={[s.btn, s.btnSec]} onPress={() => { setShowForm(false); resetForm(); }}>
                                    <Text style={s.btnSecText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={s.btn} onPress={handleSave}>
                                    <Text style={s.btnText}>Save</Text>
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
                        <View style={[s.sheet, { maxHeight: 380 }]}>
                            <Text style={s.modalTitle}>Record Payment</Text>

                            <FieldLabel text={`Amount Paid (${currency})`} />
                            <TextInput style={s.input} value={payAmount} onChangeText={setPayAmount}
                                placeholder="0" placeholderTextColor={Colors.muted} keyboardType="decimal-pad" autoFocus />

                            <FieldLabel text="Payment Date" />
                            <DateInput value={payDate} onChange={setPayDate} />

                            <FieldLabel text="Note (optional)" />
                            <TextInput style={s.input} value={payNote} onChangeText={setPayNote}
                                placeholder="e.g. Monthly installment" placeholderTextColor={Colors.muted} />

                            <View style={s.btnRow}>
                                <TouchableOpacity style={[s.btn, s.btnSec]} onPress={() => setShowPayment(null)}>
                                    <Text style={s.btnSecText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={s.btn} onPress={() => handleAddPayment(showPayment)}>
                                    <Text style={s.btnText}>Record</Text>
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

function LoanCard({ loan, currency, expanded, onToggle, onEdit, onDelete, onAddPayment }: {
    loan: Loan; currency: string; expanded: boolean;
    onToggle: () => void; onEdit: () => void; onDelete: () => void; onAddPayment: () => void;
}) {
    const paid = totalPaid(loan);
    const balance = outstandingBalance(loan);
    const monthly = monthlyPayment(loan.principal, loan.interestRate, loan.termMonths);
    const interest = totalInterest(loan.principal, loan.interestRate, loan.termMonths);
    const progress = Math.min(100, (paid / loan.principal) * 100);
    const overdue = isOverdue(loan);
    const statusColor = loan.status === 'paid_off' ? Colors.income : loan.status === 'defaulted' ? Colors.expense : overdue ? Colors.warning : Colors.textMuted;

    return (
        <View style={[s.card, overdue && { borderColor: Colors.warning, borderWidth: 1.5 }]}>
            <TouchableOpacity onPress={onToggle} activeOpacity={0.8}>
                <View style={s.cardHeader}>
                    <View style={{ flex: 1 }}>
                        <Text style={s.lenderName}>{loan.lenderName}</Text>
                        {loan.purpose ? <Text style={s.loanPurpose}>{loan.purpose}</Text> : null}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[s.statusBadge, { color: statusColor }]}>
                            {loan.status === 'paid_off' ? '✅ Paid Off' : loan.status === 'defaulted' ? '❌ Defaulted' : overdue ? '⚠️ Overdue' : '🔄 Active'}
                        </Text>
                        <Text style={s.balanceText}>{currency}{balance.toLocaleString(undefined, { maximumFractionDigits: 0 })} left</Text>
                    </View>
                </View>

                {/* Progress bar */}
                <View style={s.progressBg}>
                    <View style={[s.progressFill, { width: `${progress}%` as any, backgroundColor: loan.status === 'paid_off' ? Colors.income : Colors.primary }]} />
                </View>
                <Text style={s.progressLabel}>{progress.toFixed(0)}% repaid · {currency}{paid.toLocaleString(undefined, { maximumFractionDigits: 0 })} of {currency}{loan.principal.toLocaleString()}</Text>

                {/* Key metrics row */}
                <View style={s.metricsRow}>
                    <Metric label="Monthly" value={`${currency}${monthly.toFixed(0)}`} />
                    <Metric label="Rate" value={`${loan.interestRate}% p.a.`} />
                    <Metric label="Total Interest" value={`${currency}${interest.toFixed(0)}`} color={Colors.expense} />
                    <Metric label="Payoff Date" value={payoffDate(loan)} />
                </View>
            </TouchableOpacity>

            {/* Expanded: payment history + actions */}
            {expanded && (
                <View style={s.expanded}>
                    {loan.status === 'active' && (
                        <View style={s.nextDueRow}>
                            <Text style={s.nextDueLabel}>Next payment due:</Text>
                            <Text style={[s.nextDueDate, overdue && { color: Colors.warning }]}>{nextDueDate(loan)}</Text>
                        </View>
                    )}

                    {(loan.payments ?? []).length > 0 && (
                        <View style={s.paymentHistory}>
                            <Text style={s.paymentHistoryTitle}>Payment History</Text>
                            {[...(loan.payments ?? [])].reverse().slice(0, 5).map(p => (
                                <View key={p.id} style={s.paymentRow}>
                                    <Text style={s.paymentDate}>{p.date}</Text>
                                    <Text style={s.paymentNote}>{p.note || 'Payment'}</Text>
                                    <Text style={[s.paymentAmt, { color: Colors.income }]}>+{currency}{p.amount.toLocaleString()}</Text>
                                </View>
                            ))}
                            {(loan.payments ?? []).length > 5 && (
                                <Text style={s.morePayments}>+{(loan.payments ?? []).length - 5} more payments</Text>
                            )}
                        </View>
                    )}

                    <View style={s.actionRow}>
                        {loan.status === 'active' && (
                            <TouchableOpacity style={s.actionBtn} onPress={onAddPayment}>
                                <Text style={[s.actionBtnText, { color: Colors.income }]}>+ Record Payment</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity style={s.actionBtn} onPress={onEdit}>
                            <Text style={s.actionBtnText}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[s.actionBtn, { borderColor: Colors.expense }]} onPress={onDelete}>
                            <Text style={[s.actionBtnText, { color: Colors.expense }]}>Delete</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}
        </View>
    );
}

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
    pad: { padding: 16, paddingBottom: 100 },
    title: { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 14 },

    // Tab Bar
    tabBar: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
        backgroundColor: Colors.surface,
    },
    tabButton: {
        flex: 1,
        paddingVertical: 12,
        paddingHorizontal: 16,
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

    summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
    strategyCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 14, borderLeftWidth: 3, borderLeftColor: Colors.primary },
    strategyTitle: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary, marginBottom: 6 },
    strategyRecommendation: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginBottom: 12 },
    strategyMethodRow: { flexDirection: 'row', gap: 10 },
    strategyMethod: { flex: 1, backgroundColor: Colors.bg, borderRadius: 10, padding: 10 },
    strategyMethodLabel: { fontSize: 11, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
    strategyOrderItem: { fontSize: 11, color: Colors.textSecondary, marginBottom: 3 },
    strategySaved: { fontSize: 11, fontWeight: '800', marginTop: 6 },
    summaryCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: 10, padding: 12, alignItems: 'center' },
    summaryLabel: { fontSize: 10, color: Colors.textMuted, marginBottom: 3, textAlign: 'center' },
    summaryValue: { fontSize: 14, fontWeight: '700' },

    alertBanner: { backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: Colors.expense, borderRadius: 10, padding: 12, marginBottom: 12 },
    alertText: { color: Colors.expense, fontWeight: '600', fontSize: 13, textAlign: 'center' },

    emptyState: { alignItems: 'center', paddingTop: 60 },
    emptyIcon: { fontSize: 48, marginBottom: 12 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
    emptySub: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20, marginBottom: 20 },
    emptyAddBtn: { backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 28, paddingVertical: 12 },
    emptyAddBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

    card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
    cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
    lenderName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
    loanPurpose: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
    statusBadge: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
    balanceText: { fontSize: 16, fontWeight: '800', color: Colors.expense },

    progressBg: { height: 6, backgroundColor: Colors.border, borderRadius: 3, marginBottom: 4 },
    progressFill: { height: 6, borderRadius: 3 },
    progressLabel: { fontSize: 10, color: Colors.textMuted, marginBottom: 10 },

    metricsRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 },
    metricLabel: { fontSize: 9, color: Colors.textMuted, textAlign: 'center', marginBottom: 2 },
    metricValue: { fontSize: 11, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },

    expanded: { borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 10, paddingTop: 10 },
    nextDueRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
    nextDueLabel: { fontSize: 12, color: Colors.textMuted },
    nextDueDate: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },

    paymentHistory: { backgroundColor: Colors.bg, borderRadius: 8, padding: 10, marginBottom: 10 },
    paymentHistoryTitle: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
    paymentRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    paymentDate: { fontSize: 11, color: Colors.textMuted, width: 85 },
    paymentNote: { flex: 1, fontSize: 11, color: Colors.textSecondary },
    paymentAmt: { fontSize: 12, fontWeight: '700' },
    morePayments: { fontSize: 10, color: Colors.textMuted, textAlign: 'center', marginTop: 2 },

    actionRow: { flexDirection: 'row', gap: 8 },
    actionBtn: { flex: 1, paddingVertical: 7, borderRadius: 6, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
    actionBtnText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },

    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '92%' },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 16 },

    fieldLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 5, marginTop: 10 },
    input: {
        backgroundColor: Colors.bg, borderColor: Colors.border, borderWidth: 1,
        borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
        color: Colors.textPrimary, fontSize: 14,
    },

    previewBox: { backgroundColor: Colors.bg, borderRadius: 8, padding: 12, marginTop: 12, borderWidth: 1, borderColor: Colors.primary + '44' },
    previewTitle: { fontSize: 12, fontWeight: '700', color: Colors.primary, marginBottom: 6 },
    previewLine: { fontSize: 12, color: Colors.textSecondary, marginBottom: 3 },
    previewVal: { fontWeight: '700', color: Colors.textPrimary },
    impactDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 10 },
    verdictBox: { borderRadius: 8, borderWidth: 1, padding: 10, marginTop: 10 },
    verdictText: { fontSize: 11, fontWeight: '600', lineHeight: 16 },

    btnRow: { flexDirection: 'row', gap: 10, marginTop: 20, marginBottom: 10 },
    btn: { flex: 1, backgroundColor: Colors.primary, paddingVertical: 13, borderRadius: 8, alignItems: 'center' },
    btnSec: { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.border },
    btnText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 14 },
    btnSecText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 14 },

    fab: {
        position: 'absolute', right: 20, bottom: 80,
        width: 54, height: 54, borderRadius: 27,
        backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.3, shadowRadius: 6, elevation: 8,
    },
    fabText: { fontSize: 28, color: Colors.textPrimary, lineHeight: 32 },

    featureCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: Colors.primary + '40' },
    featureIcon: { fontSize: 28 },
    featureContent: { flex: 1 },
    featureTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
    featureDesc: { fontSize: 12, color: Colors.textMuted },
    featureArrow: { fontSize: 16, color: Colors.primary, fontWeight: 'bold' },
});
