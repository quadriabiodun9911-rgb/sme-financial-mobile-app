import React, { useMemo } from 'react';
import { SafeAreaView, ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { computeTaxFilingReadiness } from '../utils/taxFilingReadiness';

export default function TaxFilingReadinessScreen() {
    const { transactions, invoices, settings, finance, setCurrentScreen } = useApp();

    const readiness = useMemo(
        () => computeTaxFilingReadiness(transactions, invoices, settings, finance),
        [transactions, invoices, settings, finance]
    );

    const d = readiness.daysUntilDeadline;
    const deadlineColor = d === null ? Colors.textMuted : d < 0 ? Colors.expense : d <= 14 ? Colors.warning : Colors.income;
    const deadlineHeadline = d === null
        ? 'No deadline set'
        : d < 0
            ? `Overdue by ${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'}`
            : d === 0
                ? 'Due today'
                : `${d} day${d === 1 ? '' : 's'} left`;

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
                <Text style={s.title}>🧾 Tax Filing Readiness</Text>
                <Text style={s.subtitle}>
                    Whether your records are clean enough to hand to an accountant — Quad360 does not file tax returns itself.
                </Text>

                {/* Deadline gets top billing, not buried in the checklist below —
                    missed deadlines are the documented #1 cause of SME tax
                    penalties, not messy bookkeeping. */}
                <TouchableOpacity
                    style={[s.deadlineCard, { borderColor: deadlineColor }]}
                    onPress={() => setCurrentScreen('settings')}
                    activeOpacity={0.8}
                >
                    <Text style={s.deadlineLabel}>NEXT TAX DEADLINE</Text>
                    <Text style={[s.deadlineValue, { color: deadlineColor }]}>{deadlineHeadline}</Text>
                    {settings.nextTaxDeadline && (
                        <Text style={s.deadlineDate}>{settings.nextTaxDeadline}</Text>
                    )}
                    <Text style={s.deadlineEdit}>{settings.nextTaxDeadline ? 'Edit in Settings' : 'Set it in Settings →'}</Text>
                </TouchableOpacity>

                <View style={[s.summaryCard, { borderColor: readiness.overallReady ? Colors.income : Colors.warning }]}>
                    <Text style={[s.summaryScore, { color: readiness.overallReady ? Colors.income : Colors.warning }]}>
                        {readiness.passedCount} / {readiness.totalChecks}
                    </Text>
                    <Text style={s.summaryLabel}>
                        {readiness.overallReady ? 'Records look ready to hand off' : 'Checks to resolve before handing off'}
                    </Text>
                </View>

                {readiness.checks.map(check => (
                    <View key={check.id} style={[s.checkRow, { borderLeftColor: check.passed ? Colors.income : Colors.expense }]}>
                        <Text style={s.checkIcon}>{check.passed ? '✅' : '⚠️'}</Text>
                        <View style={{ flex: 1 }}>
                            <Text style={s.checkLabel}>{check.label}</Text>
                            <Text style={s.checkDetail}>{check.detail}</Text>
                        </View>
                    </View>
                ))}

                <View style={s.noticeCard}>
                    <Text style={s.noticeTitle}>What this does — and doesn't — do</Text>
                    <Text style={s.noticeText}>
                        Quad360 is not a certified e-filing provider in any country (currently tracking {readiness.countryCode}). Actually submitting a tax return requires either a licensed accountant, or software certified with your local tax authority (e.g. HMRC's Making Tax Digital in the UK, or an IRS Authorized e-file Provider in the US). This screen only tells you whether your bookkeeping is complete enough to make that process painless — it does not submit anything on your behalf.
                    </Text>
                </View>
            </ScrollView>
            <FooterNav />
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: 16, paddingBottom: 40 },
    title: { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
    subtitle: { fontSize: 13, color: Colors.textSecondary, marginBottom: 16, lineHeight: 18 },
    deadlineCard: {
        backgroundColor: Colors.surface,
        borderRadius: 12,
        borderWidth: 2,
        padding: 18,
        alignItems: 'center',
        marginBottom: 12,
    },
    deadlineLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.6, marginBottom: 6 },
    deadlineValue: { fontSize: 30, fontWeight: '900', marginBottom: 2 },
    deadlineDate: { fontSize: 12, color: Colors.textMuted, marginBottom: 8 },
    deadlineEdit: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
    summaryCard: {
        backgroundColor: Colors.surface,
        borderRadius: 12,
        borderWidth: 2,
        padding: 18,
        alignItems: 'center',
        marginBottom: 16,
    },
    summaryScore: { fontSize: 32, fontWeight: '900', marginBottom: 4 },
    summaryLabel: { fontSize: 13, color: Colors.textSecondary },
    checkRow: {
        flexDirection: 'row',
        gap: 10,
        backgroundColor: Colors.surface,
        borderRadius: 10,
        borderLeftWidth: 4,
        padding: 12,
        marginBottom: 8,
        alignItems: 'flex-start',
    },
    checkIcon: { fontSize: 16 },
    checkLabel: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, marginBottom: 3 },
    checkDetail: { fontSize: 12, color: Colors.textMuted, lineHeight: 16 },
    noticeCard: {
        backgroundColor: Colors.surface,
        borderRadius: 10,
        padding: 14,
        marginTop: 12,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    noticeTitle: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
    noticeText: { fontSize: 11.5, color: Colors.textMuted, lineHeight: 17 },
});
