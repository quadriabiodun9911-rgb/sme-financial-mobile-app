import React, { useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { buildBusinessFinancialDNA, detectDNADeviations } from '../utils/businessFinancialDNA';
import { buildFinancialPassportExport } from '../utils/lenderSummaryExport';
import { generatePDF, sharePDF } from '../utils/pdfExport';

const RISK_COLOR = { low: Colors.income, medium: Colors.warning, high: Colors.expense } as const;
const SEVERITY_CONFIG = {
    info: { color: Colors.income, icon: '🟢' },
    warning: { color: Colors.warning, icon: '🟠' },
    critical: { color: Colors.expense, icon: '🔴' },
} as const;

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
    return (
        <View style={s.row}>
            <Text style={s.rowLabel}>{label}</Text>
            <Text style={[s.rowValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
        </View>
    );
}

export default function BusinessFinancialDNAScreen() {
    const { transactions, loans, inventory, finance, settings, user, goBack } = useApp();
    const { currency } = settings;

    const dna = useMemo(
        () => buildBusinessFinancialDNA(transactions, loans, inventory, finance, settings, user),
        [transactions, loans, inventory, finance, settings, user],
    );
    const deviations = useMemo(() => detectDNADeviations(transactions, currency), [transactions, currency]);

    const notEnoughData = dna.identity.monthsOfRecordedHistory < 1;

    const [exporting, setExporting] = useState(false);
    const handleExportPassport = async () => {
        setExporting(true);
        try {
            const exportData = buildFinancialPassportExport({ dna, deviations, currency, generatedAt: new Date() });
            const filePath = await generatePDF(exportData);
            await sharePDF(filePath, exportData.title);
        } catch (error) {
            Alert.alert('Export failed', 'Could not generate the Financial Passport. Please try again.');
        } finally {
            setExporting(false);
        }
    };

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
                <TouchableOpacity onPress={goBack}><Text style={s.back}>← Back</Text></TouchableOpacity>
                <Text style={s.title}>🧬 Business Financial DNA</Text>
                <Text style={s.subtitle}>How your business actually behaves — built from what you've recorded, not a guess.</Text>

                {!notEnoughData && (
                    <TouchableOpacity style={s.exportBtn} onPress={handleExportPassport} disabled={exporting}>
                        {exporting ? <ActivityIndicator color={Colors.textPrimary} /> : (
                            <Text style={s.exportBtnText}>📄 Export Financial Passport</Text>
                        )}
                    </TouchableOpacity>
                )}
                {!notEnoughData && (
                    <Text style={s.exportNote}>
                        A shareable record of your business's financial behaviour — for a lender, investor, or
                        partner. This is evidence, not a credit decision or funding offer.
                    </Text>
                )}

                {notEnoughData ? (
                    <View style={s.card}>
                        <Text style={s.cardTitle}>Still learning your business</Text>
                        <Text style={s.emptyText}>
                            Log transactions over the next few weeks and Quad360 will start building a real
                            profile of how your business behaves — what's normal for you, and what isn't.
                        </Text>
                    </View>
                ) : (
                    <>
                        {/* Something has changed */}
                        {deviations.length > 0 && (
                            <View style={s.card}>
                                <Text style={s.cardTitle}>⚡ Something changed this month</Text>
                                {deviations.map((d, i) => (
                                    <View key={i} style={[s.deviationRow, i < deviations.length - 1 && s.deviationDivider]}>
                                        <Text style={{ fontSize: 18, marginRight: 10 }}>{SEVERITY_CONFIG[d.severity].icon}</Text>
                                        <Text style={s.deviationText}>{d.changeDescription}</Text>
                                    </View>
                                ))}
                            </View>
                        )}

                        {/* Identity */}
                        <View style={s.card}>
                            <Text style={s.cardTitle}>Identity</Text>
                            <Row label="Business" value={dna.identity.businessName} />
                            <Row label="Type" value={dna.identity.businessType} />
                            <Row label="Industry" value={dna.identity.industry} />
                            <Row label="Recorded history" value={`${dna.identity.monthsOfRecordedHistory} month${dna.identity.monthsOfRecordedHistory === 1 ? '' : 's'}`} />
                            <Row
                                label="Profile maturity"
                                value={dna.identity.dataMaturity === 'established' ? 'Established' : dna.identity.dataMaturity === 'developing' ? 'Developing' : 'New'}
                                valueColor={dna.identity.dataMaturity === 'established' ? Colors.income : dna.identity.dataMaturity === 'developing' ? Colors.warning : Colors.textSecondary}
                            />
                        </View>

                        {/* Financial behaviour */}
                        <View style={s.card}>
                            <Text style={s.cardTitle}>Financial Behaviour</Text>
                            <Row label="Avg. monthly revenue" value={`${currency}${Math.round(dna.financial.avgMonthlyRevenue).toLocaleString()}`} />
                            <Row label="Avg. profit margin" value={`${dna.financial.avgMonthlyProfitMargin.toFixed(1)}%`} />
                            <Row
                                label="Revenue predictability"
                                value={dna.financial.revenueVolatility === 'stable' ? 'Stable' : dna.financial.revenueVolatility === 'variable' ? 'Variable' : 'Volatile'}
                                valueColor={dna.financial.revenueVolatility === 'stable' ? Colors.income : dna.financial.revenueVolatility === 'variable' ? Colors.warning : Colors.expense}
                            />
                            {dna.financial.yoyRevenueGrowthPct !== null && (
                                <Row
                                    label="Year-over-year growth"
                                    value={`${dna.financial.yoyRevenueGrowthPct >= 0 ? '+' : ''}${dna.financial.yoyRevenueGrowthPct.toFixed(1)}%`}
                                    valueColor={dna.financial.yoyRevenueGrowthPct >= 0 ? Colors.income : Colors.expense}
                                />
                            )}
                            <Row label="Customers pay in" value={`${dna.financial.dso} days`} />
                            <Row label="You pay suppliers in" value={`${dna.financial.dpo} days`} />
                            <Row label="Cash conversion cycle" value={`${dna.financial.cashConversionCycleDays} days`} />
                            <Row label="Monthly debt obligation" value={`${currency}${Math.round(dna.financial.monthlyDebtObligation).toLocaleString()}`} />
                            {dna.financial.seasonalLowMonths.length > 0 && (
                                <Row label="Historically slow months" value={dna.financial.seasonalLowMonths.join(', ')} />
                            )}
                        </View>

                        {/* Operational behaviour */}
                        <View style={s.card}>
                            <Text style={s.cardTitle}>Operational Behaviour</Text>
                            <Row label="Inventory value (at cost)" value={`${currency}${Math.round(dna.operational.inventoryValue).toLocaleString()}`} />
                            {dna.operational.totalInventoryItems > 0 && (
                                <Row
                                    label="Slow-moving stock"
                                    value={`${dna.operational.slowMovingItemCount} of ${dna.operational.totalInventoryItems} items`}
                                    valueColor={dna.operational.slowMovingItemCount > 0 ? Colors.warning : Colors.income}
                                />
                            )}
                            <Row label="Outstanding receivables" value={`${currency}${Math.round(dna.operational.outstandingReceivables).toLocaleString()}`} />
                            <Row label="Outstanding payables" value={`${currency}${Math.round(dna.operational.outstandingPayables).toLocaleString()}`} />
                            <Row
                                label="Top customer share of revenue"
                                value={`${dna.operational.topCustomerConcentrationPct.toFixed(0)}%`}
                                valueColor={RISK_COLOR[dna.risk.customerConcentrationRisk]}
                            />
                            {dna.operational.suppliers.length > 0 && (
                                <Row
                                    label="Top supplier share of spend"
                                    value={`${dna.operational.topSupplierConcentrationPct.toFixed(0)}%`}
                                    valueColor={RISK_COLOR[dna.risk.supplierConcentrationRisk]}
                                />
                            )}
                        </View>

                        {/* Risk behaviour */}
                        <View style={s.card}>
                            <Text style={s.cardTitle}>Risk Behaviour</Text>
                            <Row label="Business risk score" value={`${dna.risk.riskScore.score}/100 (${dna.risk.riskScore.grade})`} />
                            <Row
                                label="Customer concentration"
                                value={dna.risk.customerConcentrationRisk === 'high' ? 'High risk' : dna.risk.customerConcentrationRisk === 'medium' ? 'Moderate risk' : 'Low risk'}
                                valueColor={RISK_COLOR[dna.risk.customerConcentrationRisk]}
                            />
                            <Row
                                label="Supplier concentration"
                                value={dna.risk.supplierConcentrationRisk === 'high' ? 'High risk' : dna.risk.supplierConcentrationRisk === 'medium' ? 'Moderate risk' : 'Low risk'}
                                valueColor={RISK_COLOR[dna.risk.supplierConcentrationRisk]}
                            />
                            <Row
                                label="Margin trend (last 3 months)"
                                value={dna.risk.marginTrendDirection === 'improving' ? 'Improving' : dna.risk.marginTrendDirection === 'declining' ? 'Declining' : 'Stable'}
                                valueColor={dna.risk.marginTrendDirection === 'improving' ? Colors.income : dna.risk.marginTrendDirection === 'declining' ? Colors.expense : Colors.textSecondary}
                            />
                        </View>
                    </>
                )}
            </ScrollView>
            <FooterNav />
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: 16, paddingBottom: 100 },
    back: { color: Colors.primary, fontSize: 15, marginBottom: 8 },
    title: { fontSize: 26, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
    subtitle: { fontSize: 13.5, color: Colors.textSecondary, marginBottom: 16 },
    exportBtn: {
        backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 13,
        alignItems: 'center', marginBottom: 8,
    },
    exportBtnText: { color: '#fff', fontSize: 14.5, fontWeight: '700' },
    exportNote: { fontSize: 12, color: Colors.textSecondary, marginBottom: 16, lineHeight: 17 },
    card: {
        backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 14,
        borderWidth: 1, borderColor: Colors.border,
    },
    cardTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 10 },
    emptyText: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
    row: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border,
    },
    rowLabel: { fontSize: 13.5, color: Colors.textSecondary, flex: 1 },
    rowValue: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, textAlign: 'right', flexShrink: 0, marginLeft: 8 },
    deviationRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8 },
    deviationDivider: { borderBottomWidth: 1, borderBottomColor: Colors.border },
    deviationText: { fontSize: 13.5, color: Colors.textPrimary, flex: 1, lineHeight: 19 },
});
