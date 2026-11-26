/**
 * Internal Funding & Financial Stability -- "Before looking outside your
 * business for money, understand how much value and financing potential
 * already exist within your business." Many SMEs assume they need more
 * capital when the real problem is slow-moving stock, uncollected
 * invoices, or cash that's simply unaccounted for -- this is the one place
 * that answers "how much could I actually release myself" before any
 * financing conversation, deliberately positioned ahead of Credit
 * (Financing Readiness) in the Fund section below: internal financing
 * first, external financing second.
 *
 * Every number here is computeInternalFundingAssessment's own aggregation
 * of engines that already exist and are already trusted elsewhere
 * (discretionaryCash.ts, affordableInventory.ts, computeAgingBuckets,
 * supplierPricePressure.ts) -- see that file's header comment for exactly
 * what's reused and why. The protection panel below is the same reuse
 * discipline applied to the seven stability indicators: nothing here is a
 * new calculation, just a single place that already-computed cash runway,
 * DSCR, margin, working capital and inventory turnover are shown together.
 */
import React, { useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, StyleSheet, TextInput, TouchableOpacity, Modal, Platform, useWindowDimensions } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import Icon from '../components/ui/Icon';
import { computeInternalFundingAssessment, InternalFundingSource } from '../utils/internalFundingAssessment';
import { computeCashRunway } from '../utils/cashRunway';
import { computeDSCR, computeWorkingCapitalMetrics, latestTransactionDate } from '../utils/finance';
import { computeOutcomeMetricsRollup } from '../utils/outcomeMetricsRollup';
import { computeInsuranceCoverageAssessment } from '../utils/insuranceCoverage';
import { InsurancePolicy, InsurancePolicyType } from '../types';
import { generateId } from '../utils/uuid';
import { showAlert } from '../utils/webAlert';

const POLICY_TYPE_LABEL: Record<InsurancePolicyType, string> = {
    property: 'Property',
    'inventory-stock': 'Inventory / Stock',
    liability: 'Liability',
    vehicle: 'Vehicle',
    equipment: 'Equipment',
    other: 'Other',
};

function fmt(currency: string, value: number): string {
    const sign = value < 0 ? '-' : '';
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${sign}${currency}${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}${currency}${(abs / 1_000).toFixed(1)}K`;
    return `${sign}${currency}${Math.round(abs).toLocaleString()}`;
}

const CONFIDENCE_LABEL: Record<InternalFundingSource['confidence'], string> = {
    available: 'Available now',
    identified: 'Needs collecting',
    estimate: 'Needs selling',
};
const CONFIDENCE_COLOR: Record<InternalFundingSource['confidence'], string> = {
    available: Colors.income,
    identified: Colors.warning,
    estimate: Colors.warning,
};

function SectionCard({ icon, title, subtitle, children }: { icon: string; title: string; subtitle: string; children: React.ReactNode }) {
    return (
        <View style={s.card}>
            <View style={s.cardHead}>
                <View style={s.cardIconWrap}><Icon name={icon as any} size={16} color={Colors.primary} /></View>
                <View style={{ flex: 1 }}>
                    <Text style={s.cardTitle}>{title}</Text>
                    <Text style={s.cardSubtitle}>{subtitle}</Text>
                </View>
            </View>
            {children}
        </View>
    );
}

function IndicatorRow({ label, value, hint, color }: { label: string; value: string; hint: string; color?: string }) {
    return (
        <View style={s.indicatorRow}>
            <View style={{ flex: 1 }}>
                <Text style={s.indicatorLabel}>{label}</Text>
                <Text style={s.indicatorHint}>{hint}</Text>
            </View>
            <Text style={[s.indicatorValue, color ? { color } : null]}>{value}</Text>
        </View>
    );
}

export default function InternalFundingScreen() {
    const { inventory, transactions, finance, settings, updateSettings, loans, bills, invoices, cashPockets, readinessHistory, assets, navigate } = useApp();
    const cur = settings.currency || '';

    const { width: windowWidth } = useWindowDimensions();
    const constrainSheetWidth = Platform.OS === 'web' && windowWidth >= 720;

    const [fundingNeedInput, setFundingNeedInput] = useState('');
    const fundingNeed = fundingNeedInput.trim() ? (parseFloat(fundingNeedInput) || 0) : null;

    const policies = settings.insurancePolicies ?? [];
    const [showPolicyModal, setShowPolicyModal] = useState(false);
    const [policyInsurer, setPolicyInsurer] = useState('');
    const [policyType, setPolicyType] = useState<InsurancePolicyType>('inventory-stock');
    const [policyCoverage, setPolicyCoverage] = useState('');
    const [policyPremium, setPolicyPremium] = useState('');
    const [policyRenewal, setPolicyRenewal] = useState('');

    const insurance = useMemo(
        () => computeInsuranceCoverageAssessment(policies, inventory, assets),
        [policies, inventory, assets],
    );

    const handleAddPolicy = () => {
        if (!policyInsurer.trim()) { showAlert('Error', 'Please enter the insurer name'); return; }
        const coverage = parseFloat(policyCoverage);
        if (isNaN(coverage) || coverage <= 0) { showAlert('Error', 'Please enter a valid coverage amount'); return; }
        const premium = parseFloat(policyPremium) || 0;
        if (!policyRenewal.trim() || isNaN(new Date(policyRenewal).getTime())) { showAlert('Error', 'Please enter a valid renewal date (YYYY-MM-DD)'); return; }
        const newPolicy: InsurancePolicy = {
            id: generateId(), insurer: policyInsurer.trim(), policyType: policyType,
            coverageAmount: coverage, premium, renewalDate: policyRenewal.trim(),
            createdAt: new Date().toISOString(),
        };
        updateSettings({ insurancePolicies: [...policies, newPolicy] });
        setPolicyInsurer(''); setPolicyCoverage(''); setPolicyPremium(''); setPolicyRenewal('');
        setPolicyType('inventory-stock');
        setShowPolicyModal(false);
    };

    const handleRemovePolicy = (id: string) => {
        updateSettings({ insurancePolicies: policies.filter(p => p.id !== id) });
    };

    const pocketsTotal = useMemo(() => (cashPockets ?? []).reduce((sum, p) => sum + p.amount, 0), [cashPockets]);
    const emergencyBufferTarget = parseFloat(settings?.minReserve || '') || 0;
    const effectiveCash = finance.cashBalance + pocketsTotal;

    const assessment = useMemo(
        () => computeInternalFundingAssessment(transactions, inventory, invoices, loans, bills, effectiveCash, emergencyBufferTarget, fundingNeed),
        [transactions, inventory, invoices, loans, bills, effectiveCash, emergencyBufferTarget, fundingNeed],
    );

    // Protection panel -- every figure below is an existing, already-shown-
    // elsewhere engine, reused here rather than recomputed independently
    // (see this file's own header comment).
    const runway = useMemo(
        () => computeCashRunway(transactions, effectiveCash, latestTransactionDate(transactions) ?? new Date()),
        [transactions, effectiveCash],
    );
    const dscr = useMemo(() => computeDSCR(transactions, loans), [transactions, loans]);
    const workingCapital = useMemo(() => computeWorkingCapitalMetrics(transactions, invoices), [transactions, invoices]);
    const outcomeRollup = useMemo(
        () => computeOutcomeMetricsRollup(transactions, loans, invoices, inventory, readinessHistory),
        [transactions, loans, invoices, inventory, readinessHistory],
    );
    const marginPct = finance.income > 0 ? (finance.profit / finance.income) * 100 : 0;
    const reserveCoverage = emergencyBufferTarget > 0 ? effectiveCash / emergencyBufferTarget : null;

    const dscrColor = dscr.status === 'healthy' ? Colors.income : dscr.status === 'warning' ? Colors.warning : Colors.expense;

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 48 }}>
                <View style={s.pad}>
                    <Text style={s.title}>Internal Funding & Financial Stability</Text>
                    <Text style={s.subtitle}>
                        Before looking outside your business for money — understand how much value and financing potential already exist within it.
                    </Text>

                    {/* 1. Internal Funding Opportunities */}
                    <SectionCard
                        icon="unlock"
                        title="Internal Funding Opportunities"
                        subtitle="What your business could realistically release on its own, before borrowing"
                    >
                        <View style={s.totalBox}>
                            <Text style={s.totalValue}>{fmt(cur, assessment.totalPotentialInternalFunding)}</Text>
                            <Text style={s.totalLabel}>potential internal funding identified</Text>
                        </View>

                        {assessment.sources.map(src => (
                            <View key={src.key} style={s.sourceRow}>
                                <View style={{ flex: 1 }}>
                                    <View style={s.sourceHeadRow}>
                                        <Text style={s.sourceLabel}>{src.label}</Text>
                                        <View style={[s.confidenceBadge, { backgroundColor: CONFIDENCE_COLOR[src.confidence] + '22' }]}>
                                            <Text style={[s.confidenceBadgeText, { color: CONFIDENCE_COLOR[src.confidence] }]}>{CONFIDENCE_LABEL[src.confidence]}</Text>
                                        </View>
                                    </View>
                                    <Text style={s.sourceNote}>{src.note}</Text>
                                </View>
                                <Text style={s.sourceValue}>{fmt(cur, src.amount)}</Text>
                            </View>
                        ))}

                        {assessment.doubtfulReceivables > 0 && (
                            <Text style={s.footnote}>
                                {fmt(cur, assessment.doubtfulReceivables)} more sits in invoices overdue 90+ days — tracked separately as doubtful and not counted above, since very old receivables are unlikely to actually be collected.
                            </Text>
                        )}

                        {assessment.costPressureFlags.length > 0 && (
                            <TouchableOpacity style={s.linkRow} onPress={() => navigate('margin-watch')}>
                                <Icon name="trending-up" size={13} color={Colors.primary} />
                                <Text style={s.linkText}>
                                    {assessment.costPressureFlags.length} item{assessment.costPressureFlags.length > 1 ? 's show' : ' shows'} rising cost pressure — see Margin Watch for which ones and by how much →
                                </Text>
                            </TouchableOpacity>
                        )}

                        {assessment.stabilityWarning && (
                            <View style={s.warnBox}>
                                <Icon name="alert-triangle" size={16} color={Colors.warning} />
                                <Text style={s.warnText}>{assessment.stabilityWarning}</Text>
                            </View>
                        )}

                        <Text style={s.footnote}>
                            Releasing inventory value or collecting overdue invoices turns existing assets into cash — it isn't new profit, and neither is guaranteed until it actually happens.
                        </Text>
                    </SectionCard>

                    {/* 2. Protect Your Financial Stability */}
                    <SectionCard
                        icon="shield"
                        title="Protect Your Financial Stability"
                        subtitle="Whether using this money would weaken the business, not just whether it's available"
                    >
                        <IndicatorRow
                            label="Cash runway"
                            value={Number.isFinite(runway.runwayDays) ? `${Math.round(runway.runwayDays)} days` : '∞'}
                            hint="How long available cash can support operations at the current burn rate"
                        />
                        <IndicatorRow
                            label="Debt service coverage"
                            value={dscr.dscr > 100 ? '∞' : `${dscr.dscr.toFixed(2)}x`}
                            hint="Whether operating cash flow can support current loan repayments"
                            color={dscrColor}
                        />
                        <IndicatorRow
                            label="Gross profit margin"
                            value={`${marginPct.toFixed(1)}%`}
                            hint="Whether the business itself is profitable, not just busy"
                        />
                        <IndicatorRow
                            label="Working capital"
                            value={fmt(cur, workingCapital.netWorkingCapital)}
                            hint="Receivables minus payables — short-term resources against short-term obligations"
                            color={workingCapital.netWorkingCapital < 0 ? Colors.expense : undefined}
                        />
                        <IndicatorRow
                            label="Inventory turnover"
                            value={outcomeRollup.current.inventoryTurnoverRatio !== null ? `${outcomeRollup.current.inventoryTurnoverRatio.toFixed(1)}x / yr` : 'Not enough data'}
                            hint="How efficiently stock converts into sales over the last 12 months"
                        />
                        <IndicatorRow
                            label="Cash reserve coverage"
                            value={reserveCoverage !== null ? `${reserveCoverage.toFixed(1)}x` : 'No reserve target set'}
                            hint="Cash on hand against your own minimum reserve target (Settings)"
                            color={reserveCoverage !== null && reserveCoverage < 1 ? Colors.expense : undefined}
                        />
                    </SectionCard>

                    {/* 3. Insurance Coverage */}
                    <SectionCard
                        icon="life-buoy"
                        title="Insurance Coverage"
                        subtitle="Whether an actual loss would be covered, not just whether a policy exists"
                    >
                        <IndicatorRow
                            label="Insurable value"
                            value={fmt(cur, insurance.totalInsurableValue)}
                            hint="Stock on hand plus owned equipment/property at current book value"
                        />
                        <IndicatorRow
                            label="Active coverage"
                            value={fmt(cur, insurance.totalActiveCoverage)}
                            hint="Sum of policies still in force today — lapsed policies don't count"
                            color={insurance.underinsured ? Colors.expense : undefined}
                        />
                        <IndicatorRow
                            label="Coverage ratio"
                            value={insurance.coverageRatio !== null ? `${Math.round(insurance.coverageRatio * 100)}%` : 'Nothing to insure yet'}
                            hint="Active coverage against insurable value"
                            color={insurance.underinsured ? Colors.expense : undefined}
                        />

                        {insurance.warning && (
                            <View style={s.warnBox}>
                                <Icon name="alert-triangle" size={16} color={Colors.warning} />
                                <Text style={s.warnText}>{insurance.warning}</Text>
                            </View>
                        )}

                        <View style={s.sectionHeaderRow}>
                            <Text style={s.policiesHeading}>Policies</Text>
                            <TouchableOpacity style={s.addBtn} onPress={() => setShowPolicyModal(true)}>
                                <Text style={s.addBtnText}>+ Add</Text>
                            </TouchableOpacity>
                        </View>

                        {policies.length === 0 ? (
                            <Text style={s.footnote}>No policies logged yet. Add one to see whether it actually covers what's at risk.</Text>
                        ) : (
                            policies.map(p => {
                                const expired = insurance.expiredPolicies.some(e => e.policy.id === p.id);
                                const expiring = insurance.expiringPolicies.some(e => e.policy.id === p.id);
                                return (
                                    <View key={p.id} style={s.policyRow}>
                                        <View style={{ flex: 1 }}>
                                            <View style={s.sourceHeadRow}>
                                                <Text style={s.sourceLabel}>{p.insurer} — {POLICY_TYPE_LABEL[p.policyType]}</Text>
                                                {expired && (
                                                    <View style={[s.confidenceBadge, { backgroundColor: Colors.expense + '22' }]}>
                                                        <Text style={[s.confidenceBadgeText, { color: Colors.expense }]}>Lapsed</Text>
                                                    </View>
                                                )}
                                                {!expired && expiring && (
                                                    <View style={[s.confidenceBadge, { backgroundColor: Colors.warning + '22' }]}>
                                                        <Text style={[s.confidenceBadgeText, { color: Colors.warning }]}>Renews soon</Text>
                                                    </View>
                                                )}
                                            </View>
                                            <Text style={s.sourceNote}>Renews {p.renewalDate} · Premium {fmt(cur, p.premium)}</Text>
                                        </View>
                                        <Text style={s.sourceValue}>{fmt(cur, p.coverageAmount)}</Text>
                                        <TouchableOpacity onPress={() => handleRemovePolicy(p.id)} style={{ padding: 4 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                            <Icon name="x" size={14} color={Colors.textMuted} />
                                        </TouchableOpacity>
                                    </View>
                                );
                            })
                        )}
                    </SectionCard>

                    {/* 4. Funding gap + verdict */}
                    <SectionCard
                        icon="target"
                        title="Do You Actually Need External Financing?"
                        subtitle="Size the remaining gap, if any, after internal funding"
                    >
                        <Text style={s.fieldLabel}>{`What do you need funding for? (optional, ${cur})`}</Text>
                        <TextInput
                            style={s.input}
                            value={fundingNeedInput}
                            onChangeText={setFundingNeedInput}
                            keyboardType="numeric"
                            placeholder={`e.g. ${cur}1,000,000`}
                            placeholderTextColor={Colors.textMuted}
                        />

                        {fundingNeed === null ? (
                            <Text style={s.footnote}>Enter an amount to see whether internal funding already covers it.</Text>
                        ) : (
                            <>
                                <View style={s.gapRow}>
                                    <Text style={s.gapLabel}>Funding need</Text>
                                    <Text style={s.gapValue}>{fmt(cur, fundingNeed)}</Text>
                                </View>
                                <View style={s.gapRow}>
                                    <Text style={s.gapLabel}>Covered internally</Text>
                                    <Text style={[s.gapValue, { color: Colors.income }]}>
                                        -{fmt(cur, Math.min(fundingNeed, assessment.totalPotentialInternalFunding))}
                                    </Text>
                                </View>
                                <View style={[s.gapRow, s.gapRowTotal]}>
                                    <Text style={s.gapLabelTotal}>Remaining gap</Text>
                                    <Text style={[s.gapValueTotal, { color: (assessment.fundingGap ?? 0) > 0 ? Colors.expense : Colors.income }]}>
                                        {fmt(cur, assessment.fundingGap ?? 0)}
                                    </Text>
                                </View>

                                {(assessment.fundingGap ?? 0) <= 0 ? (
                                    <View style={s.verdictBox}>
                                        <Icon name="check-circle" size={16} color={Colors.income} />
                                        <Text style={s.verdictText}>
                                            Internal funding already covers this — there's no need to borrow for it yet.
                                        </Text>
                                    </View>
                                ) : (
                                    <View style={[s.verdictBox, { borderColor: Colors.warning, backgroundColor: Colors.warning + '12' }]}>
                                        <Icon name="alert-triangle" size={16} color={Colors.warning} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.verdictText}>
                                                A gap of {fmt(cur, assessment.fundingGap!)} remains after internal funding.{' '}
                                                {dscr.dscr < 1
                                                    ? "Current income doesn't fully cover existing debt payments, though — address that before taking on more."
                                                    : 'Worth checking what financing actually fits before applying.'}
                                            </Text>
                                            <TouchableOpacity style={s.linkRow} onPress={() => navigate('financing-marketplace')}>
                                                <Text style={s.linkText}>See financing options for the gap →</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                )}
                            </>
                        )}
                    </SectionCard>
                </View>
            </ScrollView>
            <FooterNav />

            <Modal visible={showPolicyModal} animationType="slide" transparent>
                <View style={s.modalOverlay}>
                    <View style={[s.modalContent, constrainSheetWidth && s.modalContentWide]}>
                        <Text style={s.modalTitle}>Add Insurance Policy</Text>

                        <Text style={s.fieldLabel}>Insurer</Text>
                        <TextInput
                            style={s.input}
                            placeholder="e.g. AIICO, Leadway"
                            value={policyInsurer}
                            onChangeText={setPolicyInsurer}
                            placeholderTextColor={Colors.textMuted}
                        />

                        <Text style={s.fieldLabel}>Policy Type</Text>
                        <View style={s.typeGrid}>
                            {(Object.keys(POLICY_TYPE_LABEL) as InsurancePolicyType[]).map(t => (
                                <TouchableOpacity
                                    key={t}
                                    style={[s.typeBtn, policyType === t && s.typeBtnActive]}
                                    onPress={() => setPolicyType(t)}
                                >
                                    <Text style={[s.typeBtnText, policyType === t && s.typeBtnTextActive]}>{POLICY_TYPE_LABEL[t]}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text style={s.fieldLabel}>{`Coverage Amount (${cur})`}</Text>
                        <TextInput
                            style={s.input}
                            placeholder="0"
                            value={policyCoverage}
                            onChangeText={setPolicyCoverage}
                            keyboardType="numeric"
                            placeholderTextColor={Colors.textMuted}
                        />

                        <Text style={s.fieldLabel}>{`Premium (${cur})`}</Text>
                        <TextInput
                            style={s.input}
                            placeholder="0"
                            value={policyPremium}
                            onChangeText={setPolicyPremium}
                            keyboardType="numeric"
                            placeholderTextColor={Colors.textMuted}
                        />

                        <Text style={s.fieldLabel}>Renewal Date (YYYY-MM-DD)</Text>
                        <TextInput
                            style={s.input}
                            placeholder="2027-01-01"
                            value={policyRenewal}
                            onChangeText={setPolicyRenewal}
                            placeholderTextColor={Colors.textMuted}
                        />

                        <View style={s.modalButtons}>
                            <TouchableOpacity style={[s.btn, s.btnSecondary]} onPress={() => setShowPolicyModal(false)}>
                                <Text style={s.btnSecondaryText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[s.btn, s.btnPrimary]} onPress={handleAddPolicy}>
                                <Text style={s.btnPrimaryText}>Add Policy</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: Spacing.lg },
    title: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
    subtitle: { fontSize: 13, color: Colors.textMuted, marginTop: 4, marginBottom: Spacing.lg, lineHeight: 18 },

    card: {
        backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.lg,
        marginBottom: Spacing.md, ...Shadow.sm,
    },
    cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.md },
    cardIconWrap: {
        width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.surfaceVariant,
        alignItems: 'center', justifyContent: 'center',
    },
    cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
    cardSubtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 2, lineHeight: 16 },

    totalBox: { alignItems: 'center', paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: Spacing.sm },
    totalValue: { fontSize: 28, fontWeight: '800', color: Colors.primary },
    totalLabel: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },

    sourceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
    sourceHeadRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flexWrap: 'wrap' },
    sourceLabel: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    sourceNote: { fontSize: 11.5, color: Colors.textMuted, lineHeight: 15, marginTop: 2 },
    sourceValue: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
    confidenceBadge: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
    confidenceBadgeText: { fontSize: 9.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 },

    warnBox: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start', backgroundColor: Colors.warning + '14', borderRadius: Radius.sm, padding: Spacing.md, marginTop: Spacing.sm },
    warnText: { flex: 1, fontSize: 12.5, color: Colors.textPrimary, lineHeight: 17 },

    footnote: { fontSize: 11, color: Colors.textMuted, lineHeight: 15, marginTop: Spacing.sm, fontStyle: 'italic' },

    linkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginTop: Spacing.sm },
    linkText: { fontSize: 12, color: Colors.primary, fontWeight: '600', flex: 1 },

    indicatorRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
    indicatorLabel: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
    indicatorHint: { fontSize: 11, color: Colors.textMuted, marginTop: 2, lineHeight: 15 },
    indicatorValue: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginLeft: Spacing.sm },

    fieldLabel: { fontSize: 12.5, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
    input: { backgroundColor: Colors.bg, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, padding: 12, color: Colors.textPrimary, fontSize: 13, marginBottom: Spacing.sm },

    gapRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
    gapLabel: { fontSize: 12.5, color: Colors.textSecondary },
    gapValue: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    gapRowTotal: { borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 4, paddingTop: 8 },
    gapLabelTotal: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    gapValueTotal: { fontSize: 16, fontWeight: '800' },

    verdictBox: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start', borderWidth: 1, borderColor: Colors.income, backgroundColor: Colors.income + '12', borderRadius: Radius.sm, padding: Spacing.md, marginTop: Spacing.md },
    verdictText: { flex: 1, fontSize: 12.5, color: Colors.textPrimary, lineHeight: 17 },

    sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.md, marginBottom: Spacing.xs },
    policiesHeading: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    addBtn: { backgroundColor: Colors.primary, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6 },
    addBtnText: { color: '#fff', fontWeight: '600', fontSize: 12 },
    policyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 },
    modalContentWide: { maxWidth: 480, width: '100%', alignSelf: 'center' },
    modalTitle: { fontSize: 18, fontWeight: '600', color: Colors.textPrimary, marginBottom: 16 },
    modalButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
    btn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
    btnPrimary: { backgroundColor: Colors.primary },
    btnPrimaryText: { color: '#fff', fontWeight: '600', fontSize: 14 },
    btnSecondary: { backgroundColor: Colors.border },
    btnSecondaryText: { color: Colors.textPrimary, fontWeight: '600', fontSize: 14 },
    typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.sm },
    typeBtn: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border },
    typeBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    typeBtnText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
    typeBtnTextActive: { color: '#fff' },
});
