import React, { useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { Colors } from '../theme/colors';
import { Shadow } from '../theme/tokens';
import DataQualityBadge from './DataQualityBadge';
import MissionVisionCard from './MissionVisionCard';
import { computeWeeklySummary } from '../utils/weeklySummary';
import { Transaction, Invoice, FinanceData, Loan, BusinessSettings } from '../types';

interface Props {
    visible: boolean;
    onClose: () => void;
    onEditMission: () => void;
    transactions: Transaction[];
    invoices: Invoice[];
    finance: FinanceData;
    loans: Loan[];
    settings: BusinessSettings;
}

export default function WeeklyReportModal({ visible, onClose, onEditMission, transactions, invoices, finance, loans, settings }: Props) {
    const currency = settings.currency || '₦';

    // Modal renders via a portal on web, outside App.tsx's width constraint --
    // see FooterNav.tsx for the reference fix. Applied here to the bottom
    // sheet so it doesn't stretch full-bleed on desktop.
    const { width: windowWidth } = useWindowDimensions();
    const constrainSheetWidth = Platform.OS === 'web' && windowWidth >= 720;

    const summary = useMemo(
        () => computeWeeklySummary(transactions, invoices, finance, loans),
        [transactions, invoices, finance, loans]
    );

    const fmt = (n: number) => `${currency}${Math.round(n).toLocaleString()}`;
    const fmtPct = (n: number | null) => n === null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(0)}%`;
    const pctColor = (n: number | null) => n === null ? Colors.textMuted : n >= 0 ? Colors.income : Colors.expense;

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={s.overlay}>
                <View style={[s.sheet, constrainSheetWidth && s.sheetWide]}>
                    <ScrollView showsVerticalScrollIndicator={false}>
                        <Text style={s.title}>🗓️ Weekly Dashboard</Text>
                        <Text style={s.subtitle}>{summary.weekLabel} — a summary of this week, so far</Text>

                        <DataQualityBadge transactions={transactions} style={{ marginHorizontal: 0, marginTop: 0, marginBottom: 12 }} />

                        {/* Revenue / Cost / Profit */}
                        <View style={s.metricRow}>
                            <View style={s.metricCard}>
                                <Text style={s.metricLabel}>Total Revenue</Text>
                                <Text style={[s.metricValue, { color: Colors.income }]}>{fmt(summary.revenue)}</Text>
                                <Text style={[s.metricChange, { color: pctColor(summary.revenueChangePct) }]}>{fmtPct(summary.revenueChangePct)} vs last week</Text>
                            </View>
                            <View style={s.metricCard}>
                                <Text style={s.metricLabel}>Total Cost</Text>
                                <Text style={[s.metricValue, { color: Colors.expense }]}>{fmt(summary.cost)}</Text>
                                <Text style={[s.metricChange, { color: pctColor(summary.costChangePct === null ? null : -summary.costChangePct) }]}>{fmtPct(summary.costChangePct)} vs last week</Text>
                            </View>
                            <View style={s.metricCard}>
                                <Text style={s.metricLabel}>Profit</Text>
                                <Text style={[s.metricValue, { color: summary.profit >= 0 ? Colors.income : Colors.expense }]}>{fmt(summary.profit)}</Text>
                                <Text style={s.metricChange}>vs {fmt(summary.lastWeekProfit)} last week</Text>
                            </View>
                        </View>

                        {/* Customer growth & Cash position */}
                        <View style={s.metricRow}>
                            <View style={s.metricCard}>
                                <Text style={s.metricLabel}>Customer Growth</Text>
                                <Text style={s.metricValue}>{summary.customerGrowth.newThisWeek} new</Text>
                                <Text style={s.metricChange}>
                                    {summary.customerGrowth.newLastWeek} last week · {summary.customerGrowth.totalCustomers} total
                                </Text>
                            </View>
                            <View style={s.metricCard}>
                                <Text style={s.metricLabel}>Cash Position</Text>
                                <Text style={s.metricValue}>{fmt(summary.cashPosition.current)}</Text>
                                <Text style={[s.metricChange, { color: pctColor(summary.cashPosition.weeklyChange) }]}>
                                    {summary.cashPosition.weeklyChange >= 0 ? '+' : ''}{fmt(summary.cashPosition.weeklyChange)} this week
                                </Text>
                            </View>
                        </View>

                        {/* Wins */}
                        <Section title="🏆 Wins This Week" color={Colors.income}>
                            {summary.wins.map((w, i) => <BulletRow key={i} text={w} />)}
                        </Section>

                        {/* Problems */}
                        <Section title="⚠️ Business Problems" color={Colors.expense}>
                            {summary.problems.map((p, i) => <BulletRow key={i} text={p} />)}
                        </Section>

                        {/* Mission/Vision — the guideline to check these priorities against */}
                        <MissionVisionCard
                            missionStatement={settings.missionStatement}
                            visionStatement={settings.visionStatement}
                            coreValues={settings.coreValues}
                            onEdit={onEditMission}
                        />

                        {/* Top priorities — the 4 levers that drive growth, ranked by £ opportunity */}
                        <Section title="🎯 Top Priorities for Growth" color={Colors.primary}>
                            <Text style={s.sectionHint}>
                                Ranked by which lever has the biggest impact on the business right now.
                            </Text>
                            {summary.topPriorities.map((p, i) => (
                                <View key={p.lever} style={s.priorityCard}>
                                    <View style={s.priorityHeader}>
                                        <Text style={s.priorityRank}>{i + 1}</Text>
                                        <Text style={s.priorityLabel}>{p.label}</Text>
                                    </View>
                                    <Text style={s.priorityText}>{p.text}</Text>
                                </View>
                            ))}
                        </Section>

                        {/* Lessons */}
                        <Section title="💡 What to Learn From This Week" color={Colors.warning}>
                            {summary.lessons.map((l, i) => <BulletRow key={i} text={l} />)}
                        </Section>

                        {/* Next week plan */}
                        <Section title="➡️ What to Do Next Week" color={Colors.secondary}>
                            {summary.nextWeekPlan.map((n, i) => <BulletRow key={i} text={n} num={i + 1} />)}
                        </Section>

                        <Text style={s.footnote}>
                            Figures cover {summary.weekStart} to {summary.weekEnd} (week-to-date). Comparisons are against the same days last week.
                        </Text>

                        <TouchableOpacity style={s.closeBtn} onPress={onClose}>
                            <Text style={s.closeBtnText}>Close</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
    return (
        <View style={[s.section, { borderLeftColor: color }]}>
            <Text style={s.sectionTitle}>{title}</Text>
            {children}
        </View>
    );
}

function BulletRow({ text, num }: { text: string; num?: number }) {
    return (
        <View style={s.bulletRow}>
            <Text style={s.bulletMark}>{num ? `${num}.` : '•'}</Text>
            <Text style={s.bulletText}>{text}</Text>
        </View>
    );
}

const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: Colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 24, maxHeight: '92%' },
    sheetWide: { maxWidth: 560, width: '100%', alignSelf: 'center' },
    title: { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
    subtitle: { fontSize: 13, color: Colors.textSecondary, marginBottom: 16 },
    metricRow: { flexDirection: 'row', gap: 10, marginBottom: 10, flexWrap: 'wrap' },
    metricCard: {
        flex: 1,
        minWidth: 140,
        backgroundColor: Colors.surface,
        borderRadius: 10,
        padding: 12,
        borderWidth: 1,
        borderColor: Colors.border,
        ...Shadow.sm,
    },
    metricLabel: { fontSize: 11, color: Colors.textSecondary, marginBottom: 6 },
    metricValue: { fontSize: 17, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
    metricChange: { fontSize: 11, color: Colors.textMuted },
    section: {
        backgroundColor: Colors.surface,
        borderRadius: 10,
        padding: 14,
        marginTop: 14,
        borderLeftWidth: 4,
        ...Shadow.sm,
    },
    sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 10 },
    bulletRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    bulletMark: { fontSize: 12, color: Colors.textMuted, width: 16 },
    bulletText: { flex: 1, fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },
    sectionHint: { fontSize: 11, color: Colors.textMuted, marginBottom: 12, marginTop: -4, fontStyle: 'italic' },
    priorityCard: {
        backgroundColor: Colors.bg,
        borderRadius: 8,
        padding: 10,
        marginBottom: 8,
    },
    priorityHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    priorityRank: {
        fontSize: 11, fontWeight: 'bold', color: '#fff', backgroundColor: Colors.primary,
        width: 18, height: 18, borderRadius: 9, textAlign: 'center', lineHeight: 18,
    },
    priorityLabel: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary },
    priorityText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
    footnote: { fontSize: 10.5, color: Colors.textMuted, marginTop: 18, fontStyle: 'italic', lineHeight: 15 },
    closeBtn: { backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 16 },
    closeBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});
