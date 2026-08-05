import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, Alert } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import LowDataNotice from '../components/LowDataNotice';
import NextStepLink from '../components/NextStepLink';
import { generatePDF, sharePDF } from '../utils/pdfExport';
import { buildFundingReadinessPackExport } from '../utils/lenderSummaryExport';
import { buildFundingReadinessPack } from '../utils/fundingReadiness';

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

function fmtCompact(currency: string, amount: number): string {
    if (Math.abs(amount) >= 1000000) return `${currency}${(amount / 1000000).toFixed(1)}M`;
    if (Math.abs(amount) >= 1000) return `${currency}${(amount / 1000).toFixed(0)}K`;
    return `${currency}${Math.round(amount).toLocaleString()}`;
}

export default function FundingQualificationScreen() {
    const { transactions, invoices, loans, inventory, assets, finance, settings, user, navigate } = useApp();
    const { currency } = settings;
    const [exporting, setExporting] = useState(false);

    const pack = useMemo(
        () => buildFundingReadinessPack(transactions, invoices, loans, inventory, assets, finance, settings, user?.businessName || 'Your Business'),
        [transactions, invoices, loans, inventory, assets, finance, settings, user?.businessName],
    );

    const maxTrendRevenue = Math.max(1, ...pack.trend.map(m => Math.max(m.revenue, m.expense)));

    const handleExport = async () => {
        setExporting(true);
        try {
            const exportData = buildFundingReadinessPackExport(pack, currency);
            const filePath = await generatePDF(exportData);
            await sharePDF(filePath, exportData.title);
        } catch {
            Alert.alert('Export failed', 'Could not generate the Funding Readiness Pack. Please try again.');
        } finally {
            setExporting(false);
        }
    };

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
                <Text style={s.title}>Funding Readiness</Text>
                <Text style={s.subtitle}>
                    Not a loan decision — Quad360 doesn't lend and can't guarantee an outcome. This shows how your
                    business would look to a lender doing their own assessment, and exactly what to fix first.
                </Text>

                <LowDataNotice transactionCount={transactions.length} label="your Funding Readiness Pack" />

                <TouchableOpacity style={s.exportButton} onPress={handleExport} disabled={exporting}>
                    <Text style={s.exportButtonText}>{exporting ? 'Preparing…' : '📄 Export Funding Readiness Pack'}</Text>
                </TouchableOpacity>
                <Text style={s.exportHint}>A shareable document a lender can actually review.</Text>

                {/* Business Financial Profile */}
                <View style={s.card}>
                    <Text style={s.cardTitle}>Business Financial Profile</Text>
                    <Text style={s.businessName}>{pack.businessName}</Text>
                    <View style={s.profileGrid}>
                        <ProfileStat label="Revenue (TTM)" value={fmtCompact(currency, pack.profile.revenue)} />
                        <ProfileStat label="Gross Profit" value={fmtCompact(currency, pack.profile.grossProfit)} sub={`${pack.profile.grossMargin.toFixed(0)}% margin`} />
                        <ProfileStat label="Net Profit" value={fmtCompact(currency, pack.profile.netProfit)} color={pack.profile.netProfit >= 0 ? Colors.income : Colors.expense} />
                        <ProfileStat label="Cash" value={fmtCompact(currency, pack.profile.cash)} />
                        <ProfileStat label="Receivables" value={fmtCompact(currency, pack.profile.receivables)} />
                        <ProfileStat label="Debt" value={fmtCompact(currency, pack.profile.debt)} />
                    </View>
                </View>

                {/* Financial performance */}
                <View style={s.card}>
                    <Text style={s.cardTitle}>Financial Performance — Last 12 Months</Text>
                    {pack.trend.length === 0 ? (
                        <Text style={s.emptyText}>Not enough recorded history yet to show a trend.</Text>
                    ) : (
                        <View style={s.trendChart}>
                            {pack.trend.map(m => (
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
                    <View style={s.trendLegend}>
                        <LegendDot color={Colors.income} label="Revenue" />
                        <LegendDot color={Colors.expense} label="Expenses" />
                    </View>
                </View>

                {/* Risk profile */}
                <View style={s.card}>
                    <Text style={s.cardTitle}>Risk Profile</Text>
                    {pack.riskProfile.map(f => (
                        <View key={f.name} style={s.riskRow}>
                            <Text style={s.riskDot}>{STATUS_DOT[f.status]}</Text>
                            <Text style={s.riskLabel}>{f.name}</Text>
                            <Text style={[s.riskStatus, { color: STATUS_COLOR[f.status] }]}>{STATUS_LABEL[f.status]}</Text>
                        </View>
                    ))}
                </View>

                {/* Funding readiness score */}
                <View style={[s.scoreCard, { borderTopColor: BAND_COLOR[pack.band] }]}>
                    <Text style={s.cardTitle}>Funding Readiness</Text>
                    <Text style={[s.scoreValue, { color: BAND_COLOR[pack.band] }]}>{pack.score}/100 — {pack.band}</Text>
                    <Text style={s.scoreCaveat}>
                        This reflects how prepared your records are for a lender's own assessment — not a
                        pre-approval, and not a promise of funding.
                    </Text>
                    <NextStepLink text="See what's holding your score back" onPress={() => navigate('financial-assessment')} />
                </View>

                {/* Supporting documents */}
                <View style={s.card}>
                    <Text style={s.cardTitle}>Supporting Documents</Text>
                    <Text style={s.docsHint}>
                        Quad360 doesn't store uploaded files — this shows whether your recorded data is complete
                        enough to generate each document, not whether a file exists.
                    </Text>
                    {pack.documents.map(d => (
                        <View key={d.id} style={s.docRow}>
                            <Text style={s.docIcon}>{d.ready ? '✅' : '⚠️'}</Text>
                            <View style={{ flex: 1 }}>
                                <Text style={s.docLabel}>{d.label}</Text>
                                <Text style={s.docDetail}>{d.detail}</Text>
                            </View>
                        </View>
                    ))}
                </View>
            </ScrollView>
            <FooterNav />
        </SafeAreaView>
    );
}

function ProfileStat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
    return (
        <View style={pStyles.box}>
            <Text style={pStyles.label}>{label}</Text>
            <Text style={[pStyles.value, color ? { color } : null]}>{value}</Text>
            {sub ? <Text style={pStyles.sub}>{sub}</Text> : null}
        </View>
    );
}

function LegendDot({ color, label }: { color: string; label: string }) {
    return (
        <View style={legendStyles.row}>
            <View style={[legendStyles.dot, { backgroundColor: color }]} />
            <Text style={legendStyles.text}>{label}</Text>
        </View>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: 16, paddingBottom: 100 },
    title: { fontSize: 24, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
    subtitle: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18, marginBottom: 16 },
    exportButton: { backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 8 },
    exportButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    exportHint: { fontSize: 11, color: Colors.textMuted, textAlign: 'center', marginTop: 6, marginBottom: 16 },
    card: { backgroundColor: Colors.card, borderRadius: 14, padding: 16, marginBottom: 16 },
    cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 10 },
    businessName: { fontSize: 12, color: Colors.textMuted, marginBottom: 12 },
    profileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    emptyText: { fontSize: 12, color: Colors.textMuted },
    trendChart: { flexDirection: 'row', alignItems: 'flex-end', height: 100, gap: 4 },
    trendCol: { flex: 1, alignItems: 'center' },
    trendBars: { flexDirection: 'row', gap: 2, height: 80, alignItems: 'flex-end' },
    trendBar: { width: 5, borderRadius: 2, minHeight: 2 },
    trendLabel: { fontSize: 8, color: Colors.textMuted, marginTop: 4 },
    trendLegend: { flexDirection: 'row', gap: 16, marginTop: 12, justifyContent: 'center' },
    riskRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
    riskDot: { fontSize: 12, marginRight: 8 },
    riskLabel: { flex: 1, fontSize: 12.5, color: Colors.textSecondary, fontWeight: '600' },
    riskStatus: { fontSize: 12.5, fontWeight: '700' },
    scoreCard: { backgroundColor: Colors.card, borderRadius: 14, borderTopWidth: 4, padding: 16, marginBottom: 16, alignItems: 'center' },
    scoreValue: { fontSize: 28, fontWeight: '800', marginVertical: 8 },
    scoreCaveat: { fontSize: 11.5, color: Colors.textMuted, textAlign: 'center', lineHeight: 16, marginBottom: 10 },
    docsHint: { fontSize: 11, color: Colors.textMuted, marginBottom: 12, lineHeight: 16, fontStyle: 'italic' },
    docRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 10 },
    docIcon: { fontSize: 14 },
    docLabel: { fontSize: 12.5, fontWeight: '600', color: Colors.textPrimary },
    docDetail: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
});

const pStyles = StyleSheet.create({
    box: { width: '31%', backgroundColor: Colors.bg, borderRadius: 10, padding: 10 },
    label: { fontSize: 9.5, color: Colors.textMuted, fontWeight: '600', marginBottom: 4 },
    value: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
    sub: { fontSize: 9, color: Colors.textMuted, marginTop: 2 },
});

const legendStyles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    text: { fontSize: 11, color: Colors.textMuted },
});
