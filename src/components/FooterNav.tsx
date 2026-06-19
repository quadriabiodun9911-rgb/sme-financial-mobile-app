import React, { useState } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet,
    Modal, SafeAreaView, StatusBar,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Screen } from '../types';

// ─── Groups shown on the More screen ────────────────────────────────────────

const ANALYTICS_ITEMS: { label: string; icon: string; screen: Screen }[] = [
    { label: 'Growth',    icon: '📈', screen: 'growth'   },
    { label: 'Insights',  icon: '💡', screen: 'insights' },
    { label: 'Analysis',  icon: '📊', screen: 'analysis' },
    { label: 'Advisor',   icon: '🧠', screen: 'cfo'      },
];

const FINANCE_ITEMS: { label: string; icon: string; screen: Screen }[] = [
    { label: 'Goals',     icon: '🎯', screen: 'goals'     },
    { label: 'Budget',    icon: '💰', screen: 'budget'    },
    { label: 'Assets',    icon: '🏢', screen: 'assets'    },
    { label: 'Loans',     icon: '🏦', screen: 'loans'     },
];

const OPERATIONS_ITEMS: { label: string; icon: string; screen: Screen }[] = [
    { label: 'Inventory', icon: '📦', screen: 'inventory' },
];

const ACCOUNT_ITEMS: { label: string; icon: string; screen: Screen }[] = [
    { label: 'Settings',  icon: '⚙️', screen: 'settings' },
];

export default function FooterNav() {
    const { currentScreen, setCurrentScreen, user } = useApp();
    const [moreOpen, setMoreOpen] = useState(false);

    const TABS: { label: string; screen: Screen; icon: string }[] = [
        { label: 'Home',      screen: 'dashboard',    icon: '⬛' },
        { label: 'Sales Log', screen: 'transactions', icon: '📋' },
        { label: 'Invoices',  screen: 'invoices',     icon: '🧾' },
        { label: 'Reports',   screen: 'reports',      icon: '📊' },
    ];

    const goTo = (screen: Screen) => { setCurrentScreen(screen); setMoreOpen(false); };

    // Initials avatar from business name
    const initials = (user?.businessName || 'Q')
        .split(' ')
        .map(w => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

    const maskedEmail = user?.email
        ? user.email.replace(/(.{2}).+(@.+)/, '$1•••$2')
        : '';

    return (
        <>
            {/* ── Bottom tab bar ──────────────────────────────────────────── */}
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
                <TouchableOpacity
                    style={styles.item}
                    onPress={() => setMoreOpen(true)}
                >
                    <Text style={styles.icon}>👤</Text>
                    <Text style={[styles.text, moreOpen && styles.active]}>Me</Text>
                    {moreOpen && <View style={styles.indicator} />}
                </TouchableOpacity>
            </View>

            {/* ── Full-screen Me page ─────────────────────────────────────── */}
            <Modal visible={moreOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setMoreOpen(false)}>
                <SafeAreaView style={styles.page}>
                    <StatusBar barStyle="dark-content" />

                    {/* Close button */}
                    <TouchableOpacity style={styles.closeBtn} onPress={() => setMoreOpen(false)}>
                        <Text style={styles.closeBtnText}>✕</Text>
                    </TouchableOpacity>

                    {/* ── Profile card ──────────────────────────────────── */}
                    <View style={styles.profileCard}>
                        <View style={styles.avatar}>
                            <Text style={styles.avatarText}>{initials}</Text>
                        </View>
                        <View style={styles.profileInfo}>
                            <Text style={styles.profileName}>{user?.businessName || 'My Business'}</Text>
                            <Text style={styles.profileEmail}>{maskedEmail}</Text>
                        </View>
                        <TouchableOpacity onPress={() => goTo('settings')}>
                            <Text style={styles.profileArrow}>›</Text>
                        </TouchableOpacity>
                    </View>

                    {/* ── Analytics group ───────────────────────────────── */}
                    <Text style={styles.groupLabel}>Analytics</Text>
                    <View style={styles.iconGrid}>
                        {ANALYTICS_ITEMS.map(item => (
                            <TouchableOpacity key={item.screen} style={styles.gridItem} onPress={() => goTo(item.screen)}>
                                <View style={styles.gridIconBox}>
                                    <Text style={styles.gridIcon}>{item.icon}</Text>
                                </View>
                                <Text style={styles.gridLabel}>{item.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* ── Finance group ─────────────────────────────────── */}
                    <Text style={styles.groupLabel}>Finance</Text>
                    <View style={styles.iconGrid}>
                        {FINANCE_ITEMS.map(item => (
                            <TouchableOpacity key={item.screen} style={styles.gridItem} onPress={() => goTo(item.screen)}>
                                <View style={styles.gridIconBox}>
                                    <Text style={styles.gridIcon}>{item.icon}</Text>
                                </View>
                                <Text style={styles.gridLabel}>{item.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* ── Operations & Account — list rows ──────────────── */}
                    <Text style={styles.groupLabel}>Operations</Text>
                    <View style={styles.listCard}>
                        {OPERATIONS_ITEMS.map((item, i) => (
                            <TouchableOpacity
                                key={item.screen}
                                style={[styles.listRow, i > 0 && styles.listRowBorder]}
                                onPress={() => goTo(item.screen)}
                            >
                                <Text style={styles.listIcon}>{item.icon}</Text>
                                <Text style={styles.listLabel}>{item.label}</Text>
                                <Text style={styles.listArrow}>›</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <View style={[styles.listCard, { marginTop: 10 }]}>
                        {ACCOUNT_ITEMS.map((item, i) => (
                            <TouchableOpacity
                                key={item.screen}
                                style={[styles.listRow, i > 0 && styles.listRowBorder]}
                                onPress={() => goTo(item.screen)}
                            >
                                <Text style={styles.listIcon}>{item.icon}</Text>
                                <Text style={styles.listLabel}>{item.label}</Text>
                                <Text style={styles.listArrow}>›</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </SafeAreaView>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    // ── Footer tab bar ──────────────────────────────────────────────────────
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingVertical: 10,
        paddingBottom: 14,
        backgroundColor: Colors.surface,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
    },
    item:      { alignItems: 'center', flex: 1 },
    icon:      { fontSize: 14, marginBottom: 2 },
    text:      { color: Colors.textMuted, fontSize: 10 },
    active:    { color: Colors.primary, fontWeight: 'bold' },
    indicator: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.primary, marginTop: 3 },

    // ── Me page ─────────────────────────────────────────────────────────────
    page: { flex: 1, backgroundColor: '#f2f3f7' },

    closeBtn:     { alignSelf: 'flex-end', padding: 16 },
    closeBtnText: { fontSize: 18, color: Colors.textMuted },

    // Profile card
    profileCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        marginHorizontal: 16,
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
        gap: 14,
    },
    avatar:      { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
    avatarText:  { color: '#fff', fontSize: 20, fontWeight: '800' },
    profileInfo: { flex: 1 },
    profileName: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary },
    profileEmail:{ fontSize: 12, color: Colors.textMuted, marginTop: 3 },
    profileArrow:{ fontSize: 24, color: Colors.textMuted },

    // Group label
    groupLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: Colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        marginLeft: 20,
        marginBottom: 8,
    },

    // Icon grid (4-across)
    iconGrid: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        marginHorizontal: 16,
        borderRadius: 16,
        marginBottom: 20,
        paddingVertical: 16,
        justifyContent: 'space-around',
    },
    gridItem:    { alignItems: 'center', flex: 1 },
    gridIconBox: { width: 48, height: 48, borderRadius: 14, backgroundColor: Colors.bg, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
    gridIcon:    { fontSize: 22 },
    gridLabel:   { fontSize: 11, color: Colors.textPrimary, fontWeight: '600', textAlign: 'center' },

    // List card rows
    listCard:      { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 16, overflow: 'hidden' },
    listRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, paddingHorizontal: 16, gap: 14 },
    listRowBorder: { borderTopWidth: 1, borderTopColor: '#f0f0f0' },
    listIcon:      { fontSize: 20, width: 28, textAlign: 'center' },
    listLabel:     { flex: 1, fontSize: 15, color: Colors.textPrimary, fontWeight: '600' },
    listArrow:     { fontSize: 22, color: Colors.textMuted },
});
