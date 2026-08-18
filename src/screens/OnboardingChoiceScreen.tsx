import React from 'react';
import { SafeAreaView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Screen } from '../types';
import Icon from '../components/ui/Icon';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import { PRIMARY_GOAL_OPTIONS } from '../utils/primaryGoals';

// Shown once, immediately after a brand-new account is created — the two
// starting paths the app is built around: upload real data for an instant
// diagnosis, or set a goal and build history toward it. Everything the
// diagnosis/strategy engines do downstream depends on one of these two
// paths being taken, so this is asked explicitly instead of leaving a new
// user to discover it (or not) on a busy Dashboard.
export default function OnboardingChoiceScreen() {
    const { setCurrentScreen, user, settings, updateSettings } = useApp();

    // Any choice here — including Skip — already answers "how do I get my
    // first data in," so Dashboard's separate FirstRunWizard (which asks the
    // same thing again via a 3-step "what do you sell / money in / money
    // out" quick-add) would otherwise pop up right behind this screen. Mark
    // it done up front, the same flag FirstRunWizard itself sets on completion.
    const choose = (screen: Screen) => {
        AsyncStorage.setItem('@quad360/first_run_done', '1').catch(() => {});
        setCurrentScreen(screen);
    };

    return (
        <SafeAreaView style={s.safe}>
            <View style={s.content}>
                <View style={s.iconWrap}>
                    <Icon name="smile" size={36} color={Colors.primary} />
                </View>
                <Text style={s.title}>Welcome{user?.businessName ? `, ${user.businessName}` : ''}!</Text>
                <Text style={s.subtitle}>
                    Let's find out where your business stands financially. Choose how you'd like to start —
                    you can always do the other one later.
                </Text>

                {/* Optional, doesn't block or navigate -- just tells Dashboard's
                    priority list and the action plan what to surface first.
                    Editable later in Settings, same as the rest of the
                    business profile. */}
                <Text style={s.goalLabel}>What matters most to you right now?</Text>
                <View style={s.goalRow}>
                    {PRIMARY_GOAL_OPTIONS.map(opt => {
                        const selected = (settings.primaryGoal ?? null) === opt.value;
                        return (
                            <TouchableOpacity
                                key={opt.label}
                                style={[s.goalChip, selected && s.goalChipSelected]}
                                onPress={() => updateSettings({ primaryGoal: opt.value ?? undefined })}
                                activeOpacity={0.8}
                            >
                                <Icon name={opt.icon} size={13} color={selected ? '#fff' : Colors.textSecondary} />
                                <Text style={[s.goalChipText, selected && s.goalChipTextSelected]}>{opt.label}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                <TouchableOpacity style={s.card} onPress={() => choose('import-transactions')} activeOpacity={0.85}>
                    <View style={s.cardIconBadge}>
                        <Icon name="file-text" size={22} color={Colors.primary} />
                    </View>
                    <Text style={s.cardTitle}>Upload My Bank Statement</Text>
                    <Text style={s.cardDesc}>
                        Get an instant read on your business — cash position, what's working, what needs
                        fixing — from a CSV, Excel, or PDF statement.
                    </Text>
                    <Text style={s.cardCta}>Recommended if you have one handy →</Text>
                </TouchableOpacity>

                <TouchableOpacity style={s.card} onPress={() => choose('goals')} activeOpacity={0.85}>
                    <View style={s.cardIconBadge}>
                        <Icon name="target" size={22} color={Colors.primary} />
                    </View>
                    <Text style={s.cardTitle}>Set a Financial Goal</Text>
                    <Text style={s.cardDesc}>
                        No statement handy yet? Set a target — grow revenue, cut costs, build cash reserve —
                        and log your transactions as you go to track real progress toward it.
                    </Text>
                    <Text style={s.cardCta}>Good starting point either way →</Text>
                </TouchableOpacity>

                <TouchableOpacity style={s.skip} onPress={() => choose('dashboard')}>
                    <Text style={s.skipText}>Skip for now</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe:    { flex: 1, backgroundColor: Colors.bg },
    content: { flex: 1, padding: Spacing.xxl, justifyContent: 'center' },

    iconWrap: { alignItems: 'center', marginBottom: Spacing.md },
    title:    { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center', marginBottom: 8 },
    subtitle: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 28 },

    goalLabel: { fontSize: 12.5, fontWeight: '700', color: Colors.textSecondary, marginBottom: Spacing.sm, textAlign: 'center' },
    goalRow:   { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.xs, marginBottom: Spacing.xl },
    goalChip: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
        borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
    },
    goalChipSelected:   { backgroundColor: Colors.primary, borderColor: Colors.primary },
    goalChipText:       { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
    goalChipTextSelected: { color: '#fff' },

    card:     { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.xl, marginBottom: 14, ...Shadow.sm },
    cardIconBadge: { width: 44, height: 44, borderRadius: Radius.md, backgroundColor: Colors.primary + '18', alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm },
    cardTitle:{ fontSize: 17, fontWeight: '800', color: Colors.textPrimary, marginBottom: 6 },
    cardDesc: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19, marginBottom: 10 },
    cardCta:  { fontSize: 12, color: Colors.primary, fontWeight: '700' },

    skip:     { alignItems: 'center', paddingVertical: 14 },
    skipText: { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },
});
