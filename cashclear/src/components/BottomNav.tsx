import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { Screen } from '../types';

const TABS: Array<{ screen: Screen; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
    { screen: 'dashboard', label: 'Dashboard', icon: 'home-outline' },
    { screen: 'transactions', label: 'Transactions', icon: 'swap-horizontal-outline' },
    { screen: 'creditScore', label: 'Score', icon: 'speedometer-outline' },
    { screen: 'projectAccounts', label: 'Projects', icon: 'folder-outline' },
    { screen: 'lenderPortal', label: 'Lenders', icon: 'business-outline' },
];

export default function BottomNav({ current, onSelect }: { current: Screen; onSelect: (screen: Screen) => void }) {
    return (
        <View style={styles.container}>
            {TABS.map((tab) => {
                const active = tab.screen === current;
                return (
                    <TouchableOpacity key={tab.screen} style={styles.tab} onPress={() => onSelect(tab.screen)}>
                        <Ionicons name={tab.icon} size={20} color={active ? colors.primary : colors.textFaint} />
                        <Text style={[styles.label, active ? styles.labelActive : null]}>{tab.label}</Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: colors.surface,
        paddingTop: 8,
        paddingBottom: 8,
    },
    tab: { flex: 1, alignItems: 'center', gap: 4 },
    label: { fontSize: 10, color: colors.textFaint },
    labelActive: { color: colors.primary, fontWeight: '600' },
});
