import React from 'react';
import { SafeAreaView, ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';

interface ProblemEntry {
    emoji: string;
    prompt: string;
    detail: string;
    screen: string;
    params?: Record<string, unknown>;
}

// Problem-first entry point: instead of asking a first-time owner to map
// "I have a cash problem" onto which of six pillars, a DNA screen, a
// Forecast screen, Analysis, and Reports actually answers it, this lets
// them say the problem in their own words and routes straight to the
// screen that already answers it. Nothing here is a new feature — every
// destination already exists; this is a front door onto the existing
// depth, not a replacement for it.
//
// These six are the actual questions the app is built to keep answering —
// not an arbitrary list of problem phrasings. Every screen in the app
// exists to answer one of these; this front door just says so directly,
// since that's the one place in the UI whose entire job is to ask the
// business owner "what's on your mind" and hand back the real answer.
const PROBLEMS: ProblemEntry[] = [
    { emoji: '💰', prompt: 'Am I making money?', detail: 'Profit, revenue, margins, expenses.', screen: 'analysis', params: { tab: 'diagnosis' } },
    { emoji: '💵', prompt: 'Will I run out of cash?', detail: 'Cash flow, runway, receivables, upcoming obligations.', screen: 'cashflow' },
    { emoji: '📦', prompt: 'Where is my money tied up?', detail: 'Inventory, customers owing, assets, deposits.', screen: 'inventory' },
    { emoji: '📈', prompt: 'Is my business getting healthier?', detail: 'Growth, margins, customer concentration, operating efficiency.', screen: 'growth' },
    { emoji: '🏦', prompt: 'Can I get funding?', detail: 'Funding readiness, financial history, debt capacity, documentation.', screen: 'credit-worthiness' },
    { emoji: '🧠', prompt: 'What should I do next?', detail: 'AI advisor, risks, opportunities, priorities and recommendations.', screen: 'action-tracker' },
];

export default function SolveScreen() {
    const { user, navigate, goBack } = useApp();

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
                <TouchableOpacity onPress={goBack}><Text style={s.back}>← Back</Text></TouchableOpacity>
                <Text style={s.title}>What can we help you solve today?</Text>
                <Text style={s.subtitle}>
                    {user?.businessName ? `${user.businessName} — tell us the problem, we'll take you to the answer.` : "Tell us the problem, we'll take you to the answer."}
                </Text>

                {PROBLEMS.map((p, i) => (
                    <TouchableOpacity
                        key={i}
                        style={s.card}
                        onPress={() => navigate(p.screen, p.params)}
                        activeOpacity={0.75}
                    >
                        <Text style={s.emoji}>{p.emoji}</Text>
                        <View style={{ flex: 1 }}>
                            <Text style={s.prompt}>{p.prompt}</Text>
                            <Text style={s.detail}>{p.detail}</Text>
                        </View>
                        <Text style={s.arrow}>→</Text>
                    </TouchableOpacity>
                ))}
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
    title: { fontSize: 24, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
    subtitle: { fontSize: 13.5, color: Colors.textSecondary, marginBottom: 18, lineHeight: 18 },
    card: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface,
        borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: Colors.border,
    },
    emoji: { fontSize: 26, marginRight: 14 },
    prompt: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
    detail: { fontSize: 12.5, color: Colors.textSecondary },
    arrow: { fontSize: 18, color: Colors.textSecondary, marginLeft: 8 },
});
