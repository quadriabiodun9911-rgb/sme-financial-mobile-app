import React from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useApp } from '../context/AppContext';

const PILLARS = [
    { icon: 'shield-checkmark-outline' as const, text: 'Separate business and personal money automatically' },
    { icon: 'trending-up-outline' as const, text: 'See cash shortfalls 30, 60, 90 days before they hit' },
    { icon: 'speedometer-outline' as const, text: 'Track your Credit Readiness Score and fix what\'s low' },
    { icon: 'business-outline' as const, text: 'Share lender-ready reports with one tap' },
];

export default function OnboardingScreen() {
    const { setCurrentScreen } = useApp();
    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.hero}>
                <View style={styles.logoMark}>
                    <Ionicons name="cash-outline" size={32} color={colors.background} />
                </View>
                <Text style={styles.title}>CashClear</Text>
                <Text style={styles.tagline}>Turn your business data into bankable proof.</Text>
            </View>

            <View style={styles.list}>
                {PILLARS.map((item) => (
                    <View key={item.text} style={styles.listItem}>
                        <Ionicons name={item.icon} size={20} color={colors.primary} />
                        <Text style={styles.listText}>{item.text}</Text>
                    </View>
                ))}
            </View>

            <TouchableOpacity style={styles.cta} onPress={() => setCurrentScreen('login')}>
                <Text style={styles.ctaText}>Get Started</Text>
            </TouchableOpacity>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, padding: 24, justifyContent: 'space-between' },
    hero: { alignItems: 'center', marginTop: 48 },
    logoMark: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    title: { fontSize: 32, fontWeight: '800', color: colors.text },
    tagline: { fontSize: 15, color: colors.textMuted, marginTop: 8, textAlign: 'center' },
    list: { gap: 16, marginVertical: 32 },
    listItem: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
    listText: { color: colors.text, fontSize: 14, flex: 1 },
    cta: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 16 },
    ctaText: { color: colors.background, fontWeight: '700', fontSize: 16 },
});
