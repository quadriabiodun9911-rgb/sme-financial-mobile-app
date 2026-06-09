import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';

export default function Header() {
    const { user, logout, setCurrentScreen } = useApp();

    return (
        <View style={styles.header}>
            <TouchableOpacity onPress={() => setCurrentScreen('dashboard')}>
                <Text style={styles.title}>FinanceBook</Text>
                <Text style={styles.subtitle}>{user?.businessName || 'Business Suite'}</Text>
            </TouchableOpacity>
            <View style={styles.right}>
                <TouchableOpacity onPress={() => setCurrentScreen('settings')}>
                    <Text style={styles.userText}>{user?.email.split('@')[0] || 'Admin'}</Text>
                    <Text style={styles.settingsHint}>Tap to settings</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.signOutBtn} onPress={logout}>
                    <Text style={styles.signOutText}>Sign Out</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        backgroundColor: Colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    title: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary },
    subtitle: { fontSize: 12, color: Colors.textMuted },
    right: { alignItems: 'flex-end' },
    userText: { fontSize: 12, color: Colors.textMuted, marginBottom: 2 },
    settingsHint: { fontSize: 10, color: Colors.primary, marginBottom: 4 },
    signOutBtn: {
        backgroundColor: Colors.criticalBorder,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
    },
    signOutText: { color: Colors.textPrimary, fontSize: 12, fontWeight: '500' },
});
