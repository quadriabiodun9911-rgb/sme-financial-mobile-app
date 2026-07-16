import React from 'react';
import { SafeAreaView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';

// Shown once, immediately after a brand-new account is created — the two
// starting paths the app is built around: upload real data for an instant
// diagnosis, or set a goal and build history toward it. Everything the
// diagnosis/strategy engines do downstream depends on one of these two
// paths being taken, so this is asked explicitly instead of leaving a new
// user to discover it (or not) on a busy Dashboard.
export default function OnboardingChoiceScreen() {
    const { setCurrentScreen, user } = useApp();

    return (
        <SafeAreaView style={s.safe}>
            <View style={s.content}>
                <Text style={s.icon}>👋</Text>
                <Text style={s.title}>Welcome{user?.businessName ? `, ${user.businessName}` : ''}!</Text>
                <Text style={s.subtitle}>
                    Let's find out where your business stands financially. Choose how you'd like to start —
                    you can always do the other one later.
                </Text>

                <TouchableOpacity style={s.card} onPress={() => setCurrentScreen('import-transactions')} activeOpacity={0.85}>
                    <Text style={s.cardIcon}>📄</Text>
                    <Text style={s.cardTitle}>Upload My Bank Statement</Text>
                    <Text style={s.cardDesc}>
                        Get an instant read on your business — cash position, what's working, what needs
                        fixing — from a CSV, Excel, or PDF statement.
                    </Text>
                    <Text style={s.cardCta}>Recommended if you have one handy →</Text>
                </TouchableOpacity>

                <TouchableOpacity style={s.card} onPress={() => setCurrentScreen('goals')} activeOpacity={0.85}>
                    <Text style={s.cardIcon}>🎯</Text>
                    <Text style={s.cardTitle}>Set a Financial Goal</Text>
                    <Text style={s.cardDesc}>
                        No statement handy yet? Set a target — grow revenue, cut costs, build cash reserve —
                        and log your transactions as you go to track real progress toward it.
                    </Text>
                    <Text style={s.cardCta}>Good starting point either way →</Text>
                </TouchableOpacity>

                <TouchableOpacity style={s.skip} onPress={() => setCurrentScreen('dashboard')}>
                    <Text style={s.skipText}>Skip for now</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe:    { flex: 1, backgroundColor: Colors.bg },
    content: { flex: 1, padding: 24, justifyContent: 'center' },

    icon:     { fontSize: 40, textAlign: 'center', marginBottom: 12 },
    title:    { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center', marginBottom: 8 },
    subtitle: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 28 },

    card:     { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 20, marginBottom: 14 },
    cardIcon: { fontSize: 28, marginBottom: 8 },
    cardTitle:{ fontSize: 17, fontWeight: '800', color: Colors.textPrimary, marginBottom: 6 },
    cardDesc: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19, marginBottom: 10 },
    cardCta:  { fontSize: 12, color: Colors.primary, fontWeight: '700' },

    skip:     { alignItems: 'center', paddingVertical: 14 },
    skipText: { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },
});
