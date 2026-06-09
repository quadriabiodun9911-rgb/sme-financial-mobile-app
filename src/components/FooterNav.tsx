import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Screen } from '../types';

const TABS: { label: string; screen: Screen }[] = [
    { label: 'Dashboard', screen: 'dashboard' },
    { label: 'Reports', screen: 'reports' },
    { label: 'Ledger', screen: 'transactions' },
    { label: 'Insights', screen: 'insights' },
];

export default function FooterNav() {
    const { currentScreen, setCurrentScreen } = useApp();

    return (
        <View style={styles.footer}>
            {TABS.map(tab => (
                <TouchableOpacity
                    key={tab.screen}
                    style={styles.item}
                    onPress={() => setCurrentScreen(tab.screen)}
                >
                    <Text style={[styles.text, currentScreen === tab.screen && styles.active]}>
                        {tab.label}
                    </Text>
                    {currentScreen === tab.screen && <View style={styles.indicator} />}
                </TouchableOpacity>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingVertical: 12,
        backgroundColor: Colors.surface,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
    },
    item: { alignItems: 'center', flex: 1 },
    text: { color: Colors.textMuted, fontSize: 12 },
    active: { color: Colors.primary, fontWeight: 'bold' },
    indicator: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: Colors.primary,
        marginTop: 3,
    },
});
