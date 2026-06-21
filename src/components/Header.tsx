import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';

export default function Header() {
    const { user, logout, setCurrentScreen, currentScreen } = useApp();
    const showBack = currentScreen !== 'dashboard' && currentScreen !== 'login';

    return (
        <View style={styles.header}>
            <View style={styles.left}>
                {showBack && (
                    <TouchableOpacity style={styles.backBtn} onPress={() => setCurrentScreen('dashboard')}>
                        <Text style={styles.backText}>← Back</Text>
                    </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setCurrentScreen('dashboard')}>
                    <Text style={styles.title}>Quad360</Text>
                    <Text style={styles.subtitle}>{user?.businessName || 'Business Suite'}</Text>
                </TouchableOpacity>
            </View>
            <View style={styles.right}>
                <TouchableOpacity style={styles.settingsBtn} onPress={() => setCurrentScreen('dashboard')}>
                    <Text style={styles.settingsIcon}>🔍</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.settingsBtn} onPress={() => setCurrentScreen('settings')}>
                    <Text style={styles.settingsIcon}>⚙</Text>
                </TouchableOpacity>
                <View style={styles.userBlock}>
                    <Text style={styles.userText}>{user?.email?.split('@')[0] || 'Admin'}</Text>
                    <Text style={styles.userRole}>{user?.role || 'Administrator'}</Text>
                </View>
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
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: Colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    left:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
    backBtn:  { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border },
    backText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
    title:    { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary },
    subtitle: { fontSize: 11, color: Colors.textMuted },
    right:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
    settingsBtn: {
        width: 34, height: 34, borderRadius: 17,
        backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border,
        alignItems: 'center', justifyContent: 'center',
    },
    settingsIcon: { fontSize: 16, color: Colors.textMuted },
    userBlock:  { alignItems: 'flex-end' },
    userText:   { fontSize: 12, color: Colors.textPrimary, fontWeight: '600' },
    userRole:   { fontSize: 10, color: Colors.textMuted },
    signOutBtn: {
        backgroundColor: Colors.criticalBorder,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 6,
    },
    signOutText: { color: Colors.textPrimary, fontSize: 11, fontWeight: '600' },
});
