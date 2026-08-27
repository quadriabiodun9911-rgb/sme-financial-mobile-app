import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import LowDataNotice from '../components/LowDataNotice';
import MissionVisionCard from '../components/MissionVisionCard';
import { generatePDF, sharePDF } from '../utils/pdfExport';
import { buildBusinessPassportExport } from '../utils/lenderSummaryExport';
import { buildBusinessPassport } from '../utils/businessPassport';
import { showAlert } from '../utils/webAlert';
import Icon, { IconName } from '../components/ui/Icon';
import { Radius, Shadow, Spacing } from '../theme/tokens';

const STATUS_LABEL: Record<string, string> = { good: 'Strong', warning: 'Watch', danger: 'High risk' };
const STATUS_COLOR: Record<string, string> = { good: Colors.income, warning: Colors.warning, danger: Colors.expense };

const BAND_COLOR: Record<string, string> = {
    Excellent: Colors.income,
    Strong: '#10b981',
    Moderate: Colors.warning,
    Weak: '#fb923c',
    Critical: Colors.expense,
};

const CONCENTRATION_COLOR: Record<string, string> = { low: Colors.income, medium: Colors.warning, high: Colors.expense };

function fmtCompact(currency: string, amount: number): string {
    if (Math.abs(amount) >= 1000000) return `${currency}${(amount / 1000000).toFixed(1)}M`;
    if (Math.abs(amount) >= 1000) return `${currency}${(amount / 1000).toFixed(0)}K`;
    return `${currency}${Math.round(amount).toLocaleString()}`;
}

export default function BusinessPassportScreen() {
    const { transactions, invoices, loans, inventory, assets, finance, settings, user, navigate, setCurrentScreen, budgets, staff, goals } = useApp();
    const { currency } = settings;
    const [exporting, setExporting] = useState(false);

    const passport = useMemo(
        () => buildBusinessPassport(transactions, invoices, loans, inventory, assets, finance, settings, user, budgets, staff, goals),
        [transactions, invoices, loans, inventory, assets, finance, settings, user, budgets, staff, goals],
    );

    const maxTrendRevenue = Math.max(1, ...passport.growth.trend.map(m => Math.max(m.revenue, m.expense)));
    const snapshot = passport.structuralSnapshot;

    const handleExport = async () => {
        setExporting(true);
        try {
            const exportData = buildBusinessPassportExport(passport, currency);
            const filePath = await generatePDF(exportData);
            await sharePDF(filePath, exportData.title);
        } catch {
            showAlert('Export failed', 'Could not generate the Business Passport. Please try again.');
        } finally {
            setExporting(false);
        }
    };

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
                <View style={s.titleRow}>
                    <Icon name="shield" size={20} color={Colors.textPrimary} />
                    <Text style={s.title}>{passport.businessName}</Text>
                </View>
                <Text style={s.tagline}>Understand your business. Fix what needs fixing. Build your financial track record.</Text>
                <Text style={s.subtitle}>
                    This updates automatically as you record transactions — nothing here needs to be "prepared."
                    It's your business's financial identity, current as of today.
                </Text>

                <LowDataNotice transactionCount={transactions.length} label="your Business Passport" />

                <TouchableOpacity style={s.exportButton} onPress={handleExport} disabled={exporting}>
                    {exporting ? (
                        <Text style={s.exportButtonText}>Preparing…</Text>
                    ) : (
                        <>
                            <Icon name="file-text" size={16} color="#fff" />
                            <Text style={s.exportButtonText}>Export Business Passport</Text>
                        </>
                    )}
                </TouchableOpacity>

                {/* Track record */}
                <View style={s.trackRecordCard}>
                    <Text style={s.trackRecordLabel}>Financial Track Record</Text>
                    <Text style={s.trackRecordValue}>
                        {passport.trackRecord.monthsOfRecordedHistory} month{passport.trackRecord.monthsOfRecordedHistory === 1 ? '' : 's'} of recorded history
                        {' · '}{passport.trackRecord.dataMaturity}
                    </Text>
                    <Text style={s.trackRecordDetail}>{passport.trackRecord.dataQuality.summary}</Text>
                </View>

                {/* Estimated starting position — while there's not enough
                    transaction history for a full diagnosis, build a rough
                    picture from goals/budgets/loans/assets/invoices/stock
                    instead of showing an empty page. */}
                {!passport.trackRecord.hasEnoughDataForDiagnosis && snapshot?.hasData && (
                    <View style={s.snapshotCard}>
                        <Text style={s.cardTitle}>Estimated Starting Position</Text>
                        <Text style={s.readinessNote}>
                            Not enough recorded transactions yet for a full diagnosis ({transactions.length}/5). This
                            is built from your goals, budget, loans, assets, invoices and stock instead.
                        </Text>
                        <View style={s.profileGrid}>
                            <Stat label="Committed monthly costs" value={fmtCompact(currency, snapshot.committedMonthlyCosts)} />
                            <Stat label="Outstanding receivables" value={fmtCompact(currency, snapshot.outstandingReceivables)} />
                            <Stat label="Stock on hand (cost)" value={fmtCompact(currency, snapshot.inventoryStockValue)} />
                            <Stat label="Active asset value" value={fmtCompact(currency, snapshot.activeAssetValue)} />
                        </View>
                        <TouchableOpacity style={s.linkRow} onPress={() => setCurrentScreen('import-transactions')}>
                            <Icon name="file-text" size={13} color={Colors.primary} />
                            <Text style={[s.linkText, { marginTop: 0 }]}>Upload a bank statement to unlock the full Passport →</Text>
                        </TouchableOpacity>
                    </View>
                )}

                <MissionVisionCard
                    missionStatement={settings.missionStatement}
                    visionStatement={settings.visionStatement}
                    coreValues={settings.coreValues}
                    onEdit={() => setCurrentScreen('settings')}
                />

                {/* 1. Business Identity */}
                <Section title="Business Identity" subtitle="Who are you?" teaser={`${passport.identity.businessType} · ${passport.identity.industry}`}>
                    <Row label="Business" value={passport.identity.businessName} />
                    <Row label="Type" value={passport.identity.businessType} />
                    <Row label="Industry" value={passport.identity.industry} />
                    <Row label="Operating" value={`${passport.identity.yearsOperating.toFixed(1)} years`} />
                </Section>

                {/* 2. Financial Identity */}
                <Section
                    title="Financial Identity"
                    subtitle="What is happening financially?"
                    teaser={`Revenue ${fmtCompact(currency, passport.financialIdentity.revenue)} · Net Profit ${fmtCompact(currency, passport.financialIdentity.netProfit)}`}
                >
                    <View style={s.profileGrid}>
                        <Stat label="Revenue (TTM)" value={fmtCompact(currency, passport.financialIdentity.revenue)} />
                        <Stat label="Gross Profit" value={fmtCompact(currency, passport.financialIdentity.grossProfit)} sub={`${passport.financialIdentity.grossMargin.toFixed(0)}% margin`} />
                        <Stat label="Net Profit" value={fmtCompact(currency, passport.financialIdentity.netProfit)} color={passport.financialIdentity.netProfit >= 0 ? Colors.income : Colors.expense} />
                        <Stat label="Cash" value={fmtCompact(currency, passport.financialIdentity.cash)} />
                        <Stat label="Receivables" value={fmtCompact(currency, passport.financialIdentity.receivables)} />
                        <Stat label="Debt" value={fmtCompact(currency, passport.financialIdentity.debt)} sub={passport.financialIdentity.debtCurrentPortion > 0 ? `${fmtCompact(currency, passport.financialIdentity.debtCurrentPortion)} due within 1yr` : undefined} />
                    </View>
                    <Row label="Revenue predictability" value={passport.financialIdentity.revenueVolatility} />
                </Section>

                {/* 3. Health */}
                <Section title="Health" subtitle="Is the business healthy?" teaser={`${passport.health.score}/100 — ${passport.health.band}`}>
                    <Text style={[s.scoreValue, { color: BAND_COLOR[passport.health.band] }]}>
                        {passport.health.score}/100 — {passport.health.band}
                    </Text>
                    {passport.health.categories.map(f => (
                        <View key={f.name} style={s.dotRow}>
                            <Icon name="circle" size={10} color={STATUS_COLOR[f.status]} />
                            <Text style={s.dotLabel}>{f.name}</Text>
                            <Text style={[s.dotStatus, { color: STATUS_COLOR[f.status] }]}>{STATUS_LABEL[f.status]}</Text>
                        </View>
                    ))}
                </Section>

                {/* 4. Risk */}
                <Section title="Risk" subtitle="What could go wrong?" teaser={`${passport.risk.customerConcentrationRisk} customer concentration risk`}>
                    <Row label="Customer concentration" value={passport.risk.customerConcentrationRisk} valueColor={CONCENTRATION_COLOR[passport.risk.customerConcentrationRisk]} />
                    <Row label="Supplier concentration" value={passport.risk.supplierConcentrationRisk} valueColor={CONCENTRATION_COLOR[passport.risk.supplierConcentrationRisk]} />
                    {passport.risk.deviations.length === 0 ? (
                        <Text style={s.emptyText}>No significant recent changes vs. this business's own history.</Text>
                    ) : (
                        passport.risk.deviations.map((d, i) => {
                            const sevColor = d.severity === 'critical' ? Colors.expense : d.severity === 'warning' ? Colors.warning : Colors.textMuted;
                            const sevIcon: IconName = d.severity === 'critical' ? 'alert-circle' : d.severity === 'warning' ? 'alert-triangle' : 'info';
                            return (
                                <View key={i} style={s.deviationRow}>
                                    <Icon name={sevIcon} size={12} color={sevColor} />
                                    <Text style={s.deviationText}>{d.changeDescription}</Text>
                                </View>
                            );
                        })
                    )}
                </Section>

                {/* 5. Credit Readiness */}
                <Section
                    title="Credit Readiness"
                    subtitle="How prepared are you for debt?"
                    teaser={`${passport.creditReadiness.score}/100 — ${passport.creditReadiness.band}`}
                >
                    <Text style={s.readinessNote}>
                        Same score as Health above, read the way a lender's own assessment would read it — not a
                        pre-approval, and not a promise of funding.
                    </Text>
                    <Text style={[s.scoreValue, { color: BAND_COLOR[passport.creditReadiness.band] }]}>
                        {passport.creditReadiness.score}/100 — {passport.creditReadiness.band}
                    </Text>
                    <Row label="Supporting documents" value={`${passport.creditReadiness.documentsReady} of ${passport.creditReadiness.documentsTotal} ready`} />
                    <TouchableOpacity onPress={() => navigate('credit-worthiness', { tab: 'funding-pack' })}>
                        <Text style={s.linkText}>See the full Funding Readiness Pack →</Text>
                    </TouchableOpacity>
                </Section>

                {/* 6. Investment Readiness */}
                <Section
                    title="Investment Readiness"
                    subtitle="How prepared are you for equity/investment?"
                    teaser={`${passport.investmentReadiness.availableSignals.length} of ${passport.investmentReadiness.availableSignals.length + passport.investmentReadiness.missingSignals.length} signals evidenced`}
                >
                    <Text style={s.readinessNote}>
                        Investment readiness needs more than creditworthiness — a bank asks "can you repay me," an
                        investor asks "can this grow my money." Quad360 can evidence part of that today; the rest
                        needs your own input, not a fabricated score.
                    </Text>
                    {passport.investmentReadiness.valuation.hasReliableData ? (
                        <Text style={s.valuationRange}>
                            {fmtCompact(currency, passport.investmentReadiness.valuation.lowValuation)} – {fmtCompact(currency, passport.investmentReadiness.valuation.highValuation)}
                        </Text>
                    ) : (
                        <Text style={s.emptyText}>{passport.investmentReadiness.valuation.reason}</Text>
                    )}
                    <Text style={s.valuationCaption}>Illustrative valuation range — a starting point for a conversation, not an appraisal.</Text>
                    <Row label="Recurring revenue" value={`${passport.investmentReadiness.recurringRevenuePct.toFixed(0)}%`} />
                    <Row label="Revenue growth (YoY)" value={passport.investmentReadiness.yoyRevenueGrowthPct !== null ? `${passport.investmentReadiness.yoyRevenueGrowthPct.toFixed(0)}%` : 'Not yet available'} />

                    <Text style={s.signalsHeading}>What's already evidenced</Text>
                    {passport.investmentReadiness.availableSignals.map((sig, i) => (
                        <View key={i} style={s.signalRow}>
                            <Icon name="check" size={12} color={Colors.income} />
                            <Text style={s.signalReady}>{sig}</Text>
                        </View>
                    ))}
                    <Text style={s.signalsHeading}>What still needs your input</Text>
                    {passport.investmentReadiness.missingSignals.map((sig, i) => (
                        <View key={i} style={s.signalRow}>
                            <Icon name="alert-triangle" size={12} color={Colors.warning} />
                            <Text style={s.signalMissing}>{sig}</Text>
                        </View>
                    ))}
                </Section>

                {/* 7. Growth */}
                <Section
                    title="Growth"
                    subtitle="Is the business improving?"
                    teaser={passport.growth.yoyRevenueGrowthPct !== null ? `${passport.growth.yoyRevenueGrowthPct >= 0 ? '+' : ''}${passport.growth.yoyRevenueGrowthPct.toFixed(0)}% YoY revenue` : 'Not enough history yet'}
                >
                    {passport.growth.trend.length === 0 ? (
                        <Text style={s.emptyText}>Not enough recorded history yet to show a trend.</Text>
                    ) : (
                        <View style={s.trendChart}>
                            {passport.growth.trend.map(m => (
                                <View key={m.month} style={s.trendCol}>
                                    <View style={s.trendBars}>
                                        <View style={[s.trendBar, { height: `${Math.max(2, (m.revenue / maxTrendRevenue) * 100)}%`, backgroundColor: Colors.income }]} />
                                        <View style={[s.trendBar, { height: `${Math.max(2, (m.expense / maxTrendRevenue) * 100)}%`, backgroundColor: Colors.expense }]} />
                                    </View>
                                    <Text style={s.trendLabel}>{m.month.slice(5)}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                    <Row label="Revenue growth (YoY)" value={passport.growth.yoyRevenueGrowthPct !== null ? `${passport.growth.yoyRevenueGrowthPct.toFixed(0)}%` : 'Not yet available'} />
                    <Row label="Profit growth (YoY)" value={passport.growth.yoyProfitGrowthPct !== null ? `${passport.growth.yoyProfitGrowthPct.toFixed(0)}%` : 'Not yet available'} />
                    <Row label="Margin trend (3mo)" value={passport.growth.marginTrend} />
                    <TouchableOpacity onPress={() => navigate('growth')}>
                        <Text style={s.linkText}>See the full Growth Intelligence breakdown →</Text>
                    </TouchableOpacity>
                </Section>

                {/* 8. Growth Goals & Risk — what could stop the business's
                    own stated growth goals, not just general business risk.
                    Same real diagnosis + Risk Radar + Goal Bridge pipeline
                    GoalsScreen's Risks tab uses (see goalRiskLinkage.ts).
                    Only rendered when there's something real to show: a
                    lender reading "no active goals" as a section would be
                    noise, not evidence. */}
                {passport.goalRisks.length > 0 && (
                    <Section
                        title="Growth Goals & Risk"
                        subtitle="What could stop this business from reaching its own goals?"
                        teaser={`${passport.goalRisks.length} active goal${passport.goalRisks.length === 1 ? '' : 's'} assessed`}
                    >
                        <Text style={s.readinessNote}>
                            For each goal the business has set for itself, this filters the same real diagnosis and
                            risk signals shown above down to whichever ones actually threaten reaching it — not
                            general business risk, but risk specific to this goal.
                        </Text>
                        {passport.goalRisks.map(gr => (
                            <View key={gr.goalId} style={s.goalRiskRow}>
                                <View style={s.goalRiskHeader}>
                                    <Text style={s.goalRiskTitle}>{gr.goalTitle}</Text>
                                    <Text style={[s.goalRiskBand, { color: BAND_COLOR[gr.readinessBand] }]}>
                                        {gr.growthReadiness}/100 · {gr.readinessBand}
                                    </Text>
                                </View>
                                <Text style={s.readinessNote}>{gr.narrative}</Text>
                            </View>
                        ))}
                        <TouchableOpacity onPress={() => navigate('goals')}>
                            <Text style={s.linkText}>See the full risk breakdown for each goal →</Text>
                        </TouchableOpacity>
                    </Section>
                )}

                {/* 9. Actions — always visible, not collapsible; this is
                    the "what do I do now" summary the whole page builds to. */}
                <View style={s.actionsCard}>
                    <Text style={s.cardTitle}>Actions</Text>
                    <Text style={s.cardSubtitle}>What should you do next?</Text>
                    {passport.narrativeSummary !== '' && (
                        <Text style={s.narrativeText}>{passport.narrativeSummary}</Text>
                    )}
                    {passport.topActions.length === 0 ? (
                        <Text style={s.emptyText}>No urgent actions identified right now.</Text>
                    ) : (
                        passport.topActionImpacts.map((item, idx) => (
                            <View key={idx} style={s.actionRow}>
                                <Text style={s.actionNumber}>{idx + 1}</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.actionText}>{item.action}</Text>
                                    {/* Left unresolved: what it's costing today.
                                        Omitted entirely when the engine has no
                                        honest $ estimate for this issue (e.g.
                                        customer concentration risk) rather than
                                        showing a misleading ₦0. */}
                                    {(item.profitImpact > 0 || item.cashImpact > 0) && (
                                        <Text style={s.actionImpact}>
                                            If not solved:{' '}
                                            {item.profitImpact > 0 && `${fmtCompact(currency, item.profitImpact)}/mo off profit`}
                                            {item.profitImpact > 0 && item.cashImpact > 0 && item.cashImpact !== item.profitImpact ? ' · ' : ''}
                                            {item.cashImpact > 0 && item.cashImpact !== item.profitImpact && `${fmtCompact(currency, item.cashImpact)} tied up in cash`}
                                        </Text>
                                    )}
                                </View>
                            </View>
                        ))
                    )}
                    <TouchableOpacity onPress={() => navigate('financial-assessment')}>
                        <Text style={s.linkText}>See the full action plan →</Text>
                    </TouchableOpacity>
                </View>

                {/* 10. After Improvement — an illustrative "if you fixed the
                    actions above, here's roughly where your scores would
                    land" projection. Not a promise: see
                    computeImprovementProjection in finance.ts for exactly
                    how it's derived (same real factor scores, no new
                    estimate invented). Hidden whenever there's nothing to
                    project from (too little history, or no targeted
                    actions). */}
                {passport.improvementProjection && (
                    <View style={s.improvementCard}>
                        <Text style={s.cardTitle}>After Improvement</Text>
                        <Text style={s.cardSubtitle}>If you complete the actions above</Text>
                        <View style={s.improvementRow}>
                            <Text style={s.improvementLabel}>Financial Health</Text>
                            <View style={s.improvementScoreRow}>
                                <Text style={s.improvementCurrent}>{passport.improvementProjection.currentHealthScore}</Text>
                                <Icon name="arrow-right" size={13} color={Colors.textMuted} />
                                <Text style={[s.improvementProjected, { color: BAND_COLOR[passport.improvementProjection.projectedHealthBand] }]}>
                                    {passport.improvementProjection.projectedHealthScore}
                                </Text>
                            </View>
                        </View>
                        <View style={s.improvementRow}>
                            <Text style={s.improvementLabel}>Financing Readiness</Text>
                            <View style={s.improvementScoreRow}>
                                <Text style={s.improvementCurrent}>{passport.improvementProjection.currentFinancingReadinessScore}</Text>
                                <Icon name="arrow-right" size={13} color={Colors.textMuted} />
                                <Text style={[s.improvementProjected, { color: BAND_COLOR[passport.improvementProjection.projectedFinancingReadinessBand] }]}>
                                    {passport.improvementProjection.projectedFinancingReadinessScore}
                                </Text>
                            </View>
                        </View>
                        <Text style={s.improvementCaveat}>
                            An illustrative estimate based on your own recorded numbers, not a guarantee.
                        </Text>
                    </View>
                )}
            </ScrollView>
            <FooterNav />
        </SafeAreaView>
    );
}

// Tap-to-expand, matching the retired Solve screen's "tap a question for
// the answer" pattern — a one-line teaser is always visible, the full
// section opens on tap instead of every section being fully expanded at
// once on a page with eight of them.
function Section({ title, subtitle, teaser, children }: { title: string; subtitle: string; teaser: string; children: React.ReactNode }) {
    const [open, setOpen] = useState(false);
    return (
        <View style={s.card}>
            <TouchableOpacity onPress={() => setOpen(o => !o)} activeOpacity={0.75}>
                <View style={s.sectionHeaderRow}>
                    <View style={{ flex: 1 }}>
                        <Text style={s.cardTitle}>{title}</Text>
                        <Text style={s.cardSubtitle}>{subtitle}</Text>
                    </View>
                    <View style={s.sectionArrow}>
                        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.textMuted} />
                    </View>
                </View>
                {!open && <Text style={s.teaserText}>{teaser}</Text>}
            </TouchableOpacity>
            {open && <View style={s.sectionBody}>{children}</View>}
        </View>
    );
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
    return (
        <View style={s.row}>
            <Text style={s.rowLabel}>{label}</Text>
            <Text style={[s.rowValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
        </View>
    );
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
    return (
        <View style={pStyles.box}>
            <Text style={pStyles.label}>{label}</Text>
            <Text style={[pStyles.value, color ? { color } : null]}>{value}</Text>
            {sub ? <Text style={pStyles.sub}>{sub}</Text> : null}
        </View>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: 16, paddingBottom: 100 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    title: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
    tagline: { fontSize: 13, fontWeight: '600', color: Colors.primary, marginBottom: 6 },
    subtitle: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginBottom: 16 },
    exportButton: { backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg, ...Shadow.sm },
    exportButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    trackRecordCard: { backgroundColor: Colors.card, borderRadius: Radius.md, padding: 14, marginBottom: Spacing.lg, borderLeftWidth: 4, borderLeftColor: Colors.primary, ...Shadow.sm },
    trackRecordLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '600', marginBottom: 4 },
    trackRecordValue: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4, textTransform: 'capitalize' },
    trackRecordDetail: { fontSize: 11, color: Colors.textMuted },
    snapshotCard: { backgroundColor: Colors.card, borderRadius: 14, padding: Spacing.lg, marginBottom: Spacing.lg, borderWidth: 1, borderColor: Colors.primary, ...Shadow.sm },
    card: { backgroundColor: Colors.card, borderRadius: 14, padding: Spacing.lg, marginBottom: Spacing.lg, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
    cardSubtitle: { fontSize: 11.5, color: Colors.textMuted, marginBottom: 4, fontStyle: 'italic' },
    narrativeText: { fontSize: 13.5, color: Colors.textPrimary, lineHeight: 20, marginBottom: 12 },
    sectionHeaderRow: { flexDirection: 'row', alignItems: 'flex-start' },
    sectionArrow: { marginLeft: 8, marginTop: 2 },
    teaserText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginTop: 6 },
    sectionBody: { marginTop: 10 },
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
    rowLabel: { fontSize: 12.5, color: Colors.textSecondary, textTransform: 'capitalize' },
    rowValue: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary, textTransform: 'capitalize' },
    profileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
    scoreValue: { fontSize: 24, fontWeight: '800', marginBottom: 10 },
    dotRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
    dotLabel: { flex: 1, fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
    dotStatus: { fontSize: 12, fontWeight: '700' },
    emptyText: { fontSize: 12, color: Colors.textMuted },
    deviationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 6 },
    deviationText: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
    readinessNote: { fontSize: 11.5, color: Colors.textMuted, lineHeight: 16, marginBottom: 10, fontStyle: 'italic' },
    goalRiskRow: { backgroundColor: Colors.bg, borderRadius: 10, padding: 12, marginBottom: 10 },
    goalRiskHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    goalRiskTitle: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary, flex: 1, marginRight: 8 },
    goalRiskBand: { fontSize: 11.5, fontWeight: '800' },
    linkText: { fontSize: 12.5, color: Colors.primary, fontWeight: '700', marginTop: 8 },
    linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.sm },
    valuationRange: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
    valuationCaption: { fontSize: 10.5, color: Colors.textMuted, marginBottom: 10 },
    signalsHeading: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, marginTop: 10, marginBottom: 6, textTransform: 'uppercase' },
    signalRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 4 },
    signalReady: { flex: 1, fontSize: 12, color: Colors.textSecondary },
    signalMissing: { flex: 1, fontSize: 12, color: Colors.textSecondary },
    trendChart: { flexDirection: 'row', alignItems: 'flex-end', height: 100, gap: 4, marginBottom: 10 },
    trendCol: { flex: 1, alignItems: 'center' },
    trendBars: { flexDirection: 'row', gap: 2, height: 80, alignItems: 'flex-end' },
    trendBar: { width: 5, borderRadius: 2, minHeight: 2 },
    trendLabel: { fontSize: 8, color: Colors.textMuted, marginTop: 4 },
    actionsCard: { backgroundColor: Colors.card, borderRadius: 14, padding: Spacing.lg, marginBottom: Spacing.lg, borderLeftWidth: 4, borderLeftColor: Colors.primary, ...Shadow.sm },
    actionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: Spacing.sm },
    actionNumber: {
        fontSize: 12, fontWeight: '800', color: Colors.primary,
        backgroundColor: Colors.primary + '22', borderRadius: 10,
        width: 20, height: 20, textAlign: 'center', lineHeight: 20,
    },
    actionText: { flex: 1, fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },
    actionImpact: { fontSize: 11, color: Colors.expense, fontWeight: '600', marginTop: 3 },
    improvementCard: { backgroundColor: Colors.card, borderRadius: 14, padding: Spacing.lg, marginBottom: Spacing.lg, borderLeftWidth: 4, borderLeftColor: Colors.income, ...Shadow.sm },
    improvementRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.sm },
    improvementLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
    improvementScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    improvementCurrent: { fontSize: 15, fontWeight: '700', color: Colors.textMuted },
    improvementProjected: { fontSize: 17, fontWeight: '800' },
    improvementCaveat: { fontSize: 10.5, color: Colors.textMuted, marginTop: 6, fontStyle: 'italic' },
});

const pStyles = StyleSheet.create({
    box: { width: '31%', backgroundColor: Colors.bg, borderRadius: 10, padding: 10 },
    label: { fontSize: 9.5, color: Colors.textMuted, fontWeight: '600', marginBottom: 4 },
    value: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
    sub: { fontSize: 9, color: Colors.textMuted, marginTop: 2 },
});
