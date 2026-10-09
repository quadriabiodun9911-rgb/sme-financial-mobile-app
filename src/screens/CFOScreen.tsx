import React from 'react';
import { SafeAreaView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import CFOQuestionsTab from '../components/CFOQuestionsTab';

/**
 * Ask Advisor -- formerly "Fractional CFO," a 5-tab screen (Pulse, Forecast,
 * Finance, Quick Wins, Q&A). A business owner asked whether the screen was
 * worth keeping at all; investigating each tab found four of the five were
 * re-presentations of numbers already shown elsewhere, not new information:
 *  - Pulse's Debt & Risk Score duplicated the Scoreboard/Loans score; its
 *    "This Week at a Glance" + "Today's Focus" moved to Scoreboard instead,
 *    next to the same score it's a pulse on.
 *  - Forecast was explicitly, by its own doc comment, "the glance-friendly
 *    summary of the same numbers" the Financial Forecast screen already
 *    shows in full (including the risk-aware "what's likely to happen"
 *    pipeline the Anticipate nav section is built around) -- dropped
 *    entirely, nothing unique to preserve.
 *  - Finance (ratios) was mostly a duplicate of Scoreboard/Loans/this
 *    screen's own Q&A tab/Reports' P&L; its three genuinely new readings
 *    (Operating Margin, Cash Ratio, Debt-to-Cash-Flow) moved to the Reports
 *    tabs they're actually about, and its one standalone tool (a
 *    hypothetical Break-Even Calculator) moved to Analysis & Decisions'
 *    Decide tab.
 *  - Quick Wins' Pricing Opportunity and Where Your Money Goes duplicated
 *    Analysis & Decisions' "Raise Prices" scenario and Insights' Top
 *    Expense Categories respectively; its one unique card (Payments &
 *    Collections Due) moved to Insights.
 * Q&A -- the only tab that was genuinely irreplaceable, an ask-a-question
 * advisor deep-linked from all over the app -- is what's left. This screen
 * is now just that, renamed to say so.
 */
export default function CFOScreen() {
    const { transactions, setCurrentScreen, navigate } = useApp();
    const hasEnoughData = transactions.length >= 3;

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <TouchableOpacity style={s.backLinkRow} onPress={() => navigate('dashboard')}>
                <Text style={s.backBtn}>← Dashboard</Text>
            </TouchableOpacity>
            <View style={s.headerRow}>
                <Text style={s.screenTitle}>Ask Advisor</Text>
                <Text style={s.screenSub}>Ask about your numbers, get a straight answer — CFO-level insight on demand</Text>
            </View>

            {!hasEnoughData && (
                <View style={s.emptyState}>
                    <Text style={s.emptyIcon}>🧠</Text>
                    <Text style={s.emptyTitle}>Your Advisor is ready when you are</Text>
                    <Text style={s.emptyBody}>
                        Add at least 3 transactions so there's something real to ask about.
                    </Text>
                    <Text style={s.emptyProgress}>{transactions.length}/3 transactions added</Text>
                    <View style={s.emptyProgressBarBg}>
                        <View style={[s.emptyProgressBarFill, { width: `${Math.min(100, (transactions.length / 3) * 100)}%` as any }]} />
                    </View>
                    <TouchableOpacity style={s.emptyBtn} onPress={() => setCurrentScreen('transactions')}>
                        <Text style={s.emptyBtnText}>Add Transactions →</Text>
                    </TouchableOpacity>
                </View>
            )}

            {hasEnoughData && <CFOQuestionsTab />}

            <FooterNav />
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },

    backLinkRow: { paddingHorizontal: 16, paddingTop: 10 },
    backBtn:     { color: Colors.primary, fontSize: 14 },
    headerRow:   { flexDirection: 'row', alignItems: 'baseline', paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
    screenTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary },
    screenSub:   { fontSize: 11, color: Colors.textMuted, flexShrink: 1 },

    emptyState:           { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    emptyIcon:            { fontSize: 56, marginBottom: 16 },
    emptyTitle:           { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary, textAlign: 'center', marginBottom: 12 },
    emptyBody:            { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
    emptyProgress:        { fontSize: 13, color: Colors.textSecondary, marginBottom: 8 },
    emptyProgressBarBg:   { width: '100%', height: 6, backgroundColor: Colors.border, borderRadius: 3, marginBottom: 24 },
    emptyProgressBarFill: { height: 6, backgroundColor: Colors.primary, borderRadius: 3 },
    emptyBtn:             { backgroundColor: Colors.primary, paddingVertical: 13, paddingHorizontal: 32, borderRadius: 10 },
    emptyBtnText:         { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});
