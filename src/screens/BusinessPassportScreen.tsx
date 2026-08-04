import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import LowDataNotice from '../components/LowDataNotice';
import { buildBusinessPassport } from '../utils/businessPassport';

const STATUS_DOT: Record<string, string> = { good: '🟢', warning: '🟡', danger: '🔴' };
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
    const { transactions, invoices, loans, inventory, assets, finance, settings, user, navigate } = useApp();
    const { currency } = settings;

    const passport = useMemo(
        () => buildBusinessPassport(transactions, invoices, loans, inventory, assets, finance, settings, user),
        [transactions, invoices, loans, inventory, assets, finance, settings, user],
    );

    const maxTrendRevenue = Math.max(1, ...passport.growth.trend.map(m => Math.max(m.revenue, m.expense)));

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
                <Text style={s.title}>🛂 {passport.businessName}</Text>
                <Text style={s.tagline}>Understand your business. Fix what needs fixing. Build your financial track record.</Text>
                <Text style={s.subtitle}>
                    This updates automatically as you record transactions — nothing here needs to be "prepared."
                    It's your business's financial identity, current as of today.
                </Text>

                <LowDataNotice transactionCount={transactions.length} label="your Business Passport" />

                {/* Track record */}
                <View style={s.trackRecordCard}>
                    <Text style={s.trackRecordLabel}>Financial Track Record</Text>
                    <Text style={s.trackRecordValue}>
                        {passport.trackRecord.monthsOfRecordedHistory} month{passport.trackRecord.monthsOfRecordedHistory === 1 ? '' : 's'} of recorded history
                        {' · '}{passport.trackRecord.dataMaturity}
                    </Text>
                    <Text style={s.trackRecordDetail}>{passport.trackRecord.dataQuality.summary}</Text>
                </View>

                {/* 1. Business Identity */}
                <Section title="Business Identity" subtitle="Who are you?">
                    <Row label="Business" value={passport.identity.businessName} />
                    <Row label="Type" value={passport.identity.businessType} />
                    <Row label="Industry" value={passport.identity.industry} />
                    <Row label="Operating" value={`${passport.identity.yearsOperating.toFixed(1)} years`} />
                </Section>

                {/* 2. Financial Identity */}
                <Section title="Financial Identity" subtitle="What is happening financially?">
                    <View style={s.profileGrid}>
                        <Stat label="Revenue (TTM)" value={fmtCompact(currency, passport.financialIdentity.revenue)} />
                        <Stat label="Gross Profit" value={fmtCompact(currency, passport.financialIdentity.grossProfit)} sub={`${passport.financialIdentity.grossMargin.toFixed(0)}% margin`} />
                        <Stat label="Net Profit" value={fmtCompact(currency, passport.financialIdentity.netProfit)} color={passport.financialIdentity.netProfit >= 0 ? Colors.income : Colors.expense} />
                        <Stat label="Cash" value={fmtCompact(currency, passport.financialIdentity.cash)} />
                        <Stat label="Receivables" value={fmtCompact(currency, passport.financialIdentity.receivables)} />
                        <Stat label="Debt" value={fmtCompact(currency, passport.financialIdentity.debt)} />
                    </View>
                    <Row label="Revenue predictability" value={passport.financialIdentity.revenueVolatility} />
                </Section>

                {/* 3. Health */}
                <Section title="Health" subtitle="Is the business healthy?">
                    <Text style={[s.scoreValue, { color: BAND_COLOR[passport.health.band] }]}>
                        {passport.health.score}/100 — {passport.health.band}
                    </Text>
                    {passport.health.categories.map(f => (
                        <View key={f.name} style={s.dotRow}>
                            <Text style={s.dot}>{STATUS_DOT[f.status]}</Text>
                            <Text style={s.dotLabel}>{f.name}</Text>
                            <Text style={[s.dotStatus, { color: STATUS_COLOR[f.status] }]}>{STATUS_LABEL[f.status]}</Text>
                        </View>
                    ))}
                </Section>

                {/* 4. Risk */}
                <Section title="Risk" subtitle="What could go wrong?">
                    <Row label="Customer concentration" value={passport.risk.customerConcentrationRisk} valueColor={CONCENTRATION_COLOR[passport.risk.customerConcentrationRisk]} />
                    <Row label="Supplier concentration" value={passport.risk.supplierConcentrationRisk} valueColor={CONCENTRATION_COLOR[passport.risk.supplierConcentrationRisk]} />
                    {passport.risk.deviations.length === 0 ? (
                        <Text style={s.emptyText}>No significant recent changes vs. this business's own history.</Text>
                    ) : (
                        passport.risk.deviations.map((d, i) => (
                            <Text key={i} style={s.deviationText}>
                                {d.severity === 'critical' ? '🔴' : d.severity === 'warning' ? '🟡' : 'ℹ️'} {d.changeDescription}
                            </Text>
                        ))
                    )}
                </Section>

                {/* 5. Credit Readiness */}
                <Section title="Credit Readiness" subtitle="How prepared are you for debt?">
                    <Text style={s.readinessNote}>
                        Same score as Health above, read the way a lender's own assessment would read it — not a
                        pre-approval, and not a promise of funding.
                    </Text>
                    <Text style={[s.scoreValue, { color: BAND_COLOR[passport.creditReadiness.band] }]}>
                        {passport.creditReadiness.score}/100 — {passport.creditReadiness.band}
                    </Text>
                    <Row label="Supporting documents" value={`${passport.creditReadiness.documentsReady} of ${passport.creditReadiness.documentsTotal} ready`} />
                    <TouchableOpacity onPress={() => navigate('funding-qualification')}>
                        <Text style={s.linkText}>See the full Funding Readiness Pack →</Text>
                    </TouchableOpacity>
                </Section>

                {/* 6. Investment Readiness */}
                <Section title="Investment Readiness" subtitle="How prepared are you for equity/investment?">
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
                        <Text key={i} style={s.signalReady}>✅ {sig}</Text>
                    ))}
                    <Text style={s.signalsHeading}>What still needs your input</Text>
                    {passport.investmentReadiness.missingSignals.map((sig, i) => (
                        <Text key={i} style={s.signalMissing}>⚠️ {sig}</Text>
                    ))}
                </Section>

                {/* 7. Growth */}
                <Section title="Growth" subtitle="Is the business improving?">
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
                </Section>

                {/* 8. Actions */}
                <View style={s.actionsCard}>
                    <Text style={s.cardTitle}>Actions</Text>
                    <Text style={s.cardSubtitle}>What should you do next?</Text>
                    {passport.topActions.length === 0 ? (
                        <Text style={s.emptyText}>No urgent actions identified right now.</Text>
                    ) : (
                        passport.topActions.map((action, idx) => (
                            <View key={idx} style={s.actionRow}>
                                <Text style={s.actionNumber}>{idx + 1}</Text>
                                <Text style={s.actionText}>{action}</Text>
                            </View>
                        ))
                    )}
                    <TouchableOpacity onPress={() => navigate('financial-assessment')}>
                        <Text style={s.linkText}>See the full action plan →</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
            <FooterNav />
        </SafeAreaView>
    );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
    return (
        <View style={s.card}>
            <Text style={s.cardTitle}>{title}</Text>
            <Text style={s.cardSubtitle}>{subtitle}</Text>
            {children}
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
    title: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
    tagline: { fontSize: 13, fontWeight: '600', color: Colors.primary, marginBottom: 6 },
    subtitle: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginBottom: 16 },
    trackRecordCard: { backgroundColor: Colors.card, borderRadius: 12, padding: 14, marginBottom: 16, borderLeftWidth: 4, borderLeftColor: Colors.primary },
    trackRecordLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '600', marginBottom: 4 },
    trackRecordValue: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4, textTransform: 'capitalize' },
    trackRecordDetail: { fontSize: 11, color: Colors.textMuted },
    card: { backgroundColor: Colors.card, borderRadius: 14, padding: 16, marginBottom: 16 },
    cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
    cardSubtitle: { fontSize: 11.5, color: Colors.textMuted, marginBottom: 12, fontStyle: 'italic' },
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
    rowLabel: { fontSize: 12.5, color: Colors.textSecondary, textTransform: 'capitalize' },
    rowValue: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary, textTransform: 'capitalize' },
    profileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
    scoreValue: { fontSize: 24, fontWeight: '800', marginBottom: 10 },
    dotRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
    dot: { fontSize: 11, marginRight: 8 },
    dotLabel: { flex: 1, fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
    dotStatus: { fontSize: 12, fontWeight: '700' },
    emptyText: { fontSize: 12, color: Colors.textMuted },
    deviationText: { fontSize: 12, color: Colors.textSecondary, marginBottom: 6, lineHeight: 17 },
    readinessNote: { fontSize: 11.5, color: Colors.textMuted, lineHeight: 16, marginBottom: 10, fontStyle: 'italic' },
    linkText: { fontSize: 12.5, color: Colors.primary, fontWeight: '700', marginTop: 8 },
    valuationRange: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
    valuationCaption: { fontSize: 10.5, color: Colors.textMuted, marginBottom: 10 },
    signalsHeading: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, marginTop: 10, marginBottom: 6, textTransform: 'uppercase' },
    signalReady: { fontSize: 12, color: Colors.textSecondary, marginBottom: 4 },
    signalMissing: { fontSize: 12, color: Colors.textSecondary, marginBottom: 4 },
    trendChart: { flexDirection: 'row', alignItems: 'flex-end', height: 100, gap: 4, marginBottom: 10 },
    trendCol: { flex: 1, alignItems: 'center' },
    trendBars: { flexDirection: 'row', gap: 2, height: 80, alignItems: 'flex-end' },
    trendBar: { width: 5, borderRadius: 2, minHeight: 2 },
    trendLabel: { fontSize: 8, color: Colors.textMuted, marginTop: 4 },
    actionsCard: { backgroundColor: Colors.card, borderRadius: 14, padding: 16, marginBottom: 16, borderLeftWidth: 4, borderLeftColor: Colors.primary },
    actionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8 },
    actionNumber: {
        fontSize: 12, fontWeight: '800', color: Colors.primary,
        backgroundColor: Colors.primary + '22', borderRadius: 10,
        width: 20, height: 20, textAlign: 'center', lineHeight: 20,
    },
    actionText: { flex: 1, fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },
});

const pStyles = StyleSheet.create({
    box: { width: '31%', backgroundColor: Colors.bg, borderRadius: 10, padding: 10 },
    label: { fontSize: 9.5, color: Colors.textMuted, fontWeight: '600', marginBottom: 4 },
    value: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
    sub: { fontSize: 9, color: Colors.textMuted, marginTop: 2 },
});
