import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Screen } from '../types';

const TABS: { label: string; screen: Screen; icon: string }[] = [
    { label: 'Dashboard', screen: 'dashboard', icon: '⬛' },
    { label: 'Reports', screen: 'reports', icon: '📊' },
    { label: 'Ledger', screen: 'transactions', icon: '📒' },
    { label: 'Goals', screen: 'goals', icon: '🎯' },
    { label: 'Insights', screen: 'insights', icon: '💡' },
];

export default function FooterNav() {
    const { currentScreen, setCurrentScreen } = useApp();

    return (
        <View style={styles.footer}>
            {TABS.map(tab => {
                const active = currentScreen === tab.screen;
                return (
                    <TouchableOpacity
                        key={tab.screen}
                        style={styles.item}
                        onPress={() => setCurrentScreen(tab.screen)}
                    >
                        <Text style={styles.icon}>{tab.icon}</Text>
                        <Text style={[styles.text, active && styles.active]}>{tab.label}</Text>
                        {active && <View style={styles.indicator} />}
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingVertical: 10,
        paddingBottom: 14,
        backgroundColor: Colors.surface,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
    },
    item: { alignItems: 'center', flex: 1 },
    icon: { fontSize: 14, marginBottom: 2 },
    text: { color: Colors.textMuted, fontSize: 10 },
    active: { color: Colors.primary, fontWeight: 'bold' },
    indicator: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: Colors.primary,
        marginTop: 3,
    },
});
