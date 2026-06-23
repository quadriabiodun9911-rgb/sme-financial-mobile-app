import React, { useState, useMemo } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet,
    Modal, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Screen } from '../types';

// ─── Icon accent colours per section ────────────────────────────────────────
const ANALYTICS_ITEMS: { label: string; icon: string; screen: Screen; color: string }[] = [
    { label: 'Growth',   icon: '📈', screen: 'growth',   color: '#10b981' },
    { label: 'Insights', icon: '💡', screen: 'insights', color: '#f59e0b' },
    { label: 'Analysis', icon: '📊', screen: 'analysis', color: '#3b82f6' },
    { label: 'Advisor',  icon: '🧠', screen: 'cfo',      color: '#8b5cf6' },
];

const FINANCE_ITEMS: { label: string; icon: string; screen: Screen; color: string }[] = [
    { label: 'Goals',  icon: '🎯', screen: 'goals',  color: '#ef4444' },
    { label: 'Budget', icon: '💰', screen: 'budget', color: '#10b981' },
    { label: 'Assets', icon: '🏢', screen: 'assets', color: '#3b82f6' },
    { label: 'Loans',  icon: '🏦', screen: 'loans',  color: '#f97316' },
];

const OPERATIONS_ITEMS: { label: string; icon: string; screen: Screen; color: string; desc: string }[] = [
    { label: 'Inventory',      icon: '📦', screen: 'inventory',      color: '#f59e0b', desc: 'Stock levels & margins' },
    { label: 'Cash Flow',      icon: '💧', screen: 'cashflow',       color: '#3b82f6', desc: 'Forecast, runway & AR risk' },
    { label: 'Payroll',        icon: '👥', screen: 'payroll',        color: '#10b981', desc: 'Staff & monthly pay runs' },
    { label: 'Reconciliation', icon: '🔗', screen: 'reconciliation', color: '#8b5cf6', desc: 'Match bank vs app records' },
];

const ACCOUNT_ITEMS: { label: string; icon: string; screen: Screen; color: string; desc: string }[] = [
    { label: 'Settings', icon: '⚙️', screen: 'settings', color: '#94a3b8', desc: 'Business, team & account' },
];

// ─── Footer tabs ─────────────────────────────────────────────────────────────
const TABS: { label: string; screen: Screen; icon: string }[] = [
    { label: 'Home',      screen: 'dashboard',    icon: '🏠' },
    { label: 'Sales',     screen: 'transactions', icon: '📋' },
    { label: 'Invoices',  screen: 'invoices',     icon: '🧾' },
    { label: 'Reports',   screen: 'reports',      icon: '📊' },
];

export default function FooterNav() {
    const { currentScreen, setCurrentScreen, user, pendingSyncCount, transactions, goals, invoices, finance } = useApp();
    const [moreOpen, setMoreOpen] = useState(false);

    const goTo = (screen: Screen) => { setCurrentScreen(screen); setMoreOpen(false); };

    const initials = useMemo(() =>
        (user?.businessName || 'Q')
            .split(' ')
            .map((w: string) => w[0])
            .join('')
            .toUpperCase()
            .slice(0, 2),
        [user?.businessName]
    );

    const maskedEmail = user?.email
        ? user.email.replace(/(.{2}).+(@.+)/, '$1•••$2')
        : '';

    // Quick stats for the profile summary strip
    const totalTx     = transactions.length;
    const activeGoals = goals.filter(g => g.status !== 'achieved').length;
    const unpaidInv   = invoices.filter(i => i.status === 'sent' || i.status === 'overdue').length;
    const profit      = finance?.profit ?? 0;

    return (
        <>
            {/* ── Bottom tab bar ─────────────────────────────────────────── */}
            <View style={styles.footer}>
                {TABS.map(tab => {
                    const active = currentScreen === tab.screen;
                    return (
                        <TouchableOpacity
                            key={tab.screen}
                            style={styles.tabItem}
                            onPress={() => setCurrentScreen(tab.screen)}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.tabIcon}>{tab.icon}</Text>
                            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
                            {active && <View style={styles.tabIndicator} />}
                        </TouchableOpacity>
                    );
                })}

                {/* Me tab */}
                <TouchableOpacity
                    style={styles.tabItem}
                    onPress={() => setMoreOpen(true)}
                    activeOpacity={0.7}
                >
                    <View style={styles.meAvatarSmall}>
                        <Text style={styles.meAvatarSmallText}>{initials}</Text>
                        {pendingSyncCount > 0 && (
                            <View style={styles.syncBadge}>
                                <Text style={styles.syncBadgeText}>{pendingSyncCount > 9 ? '9+' : pendingSyncCount}</Text>
                            </View>
                        )}
                    </View>
                    <Text style={[styles.tabLabel, moreOpen && styles.tabLabelActive]}>Me</Text>
                    {moreOpen && <View style={styles.tabIndicator} />}
                </TouchableOpacity>
            </View>

            {/* ── Me full-screen modal ────────────────────────────────────── */}
            <Modal
                visible={moreOpen}
                animationType="slide"
                presentationStyle="fullScreen"
                onRequestClose={() => setMoreOpen(false)}
            >
                <SafeAreaView style={styles.page}>
                    <StatusBar style="light" backgroundColor={Colors.bg} />

                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>My Account</Text>
                        <TouchableOpacity style={styles.closeBtn} onPress={() => setMoreOpen(false)} activeOpacity={0.7}>
                            <Text style={styles.closeBtnText}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

                        {/* ── Profile card ──────────────────────────────── */}
                        <TouchableOpacity style={styles.profileCard} onPress={() => goTo('settings')} activeOpacity={0.85}>
                            <View style={styles.avatar}>
                                <Text style={styles.avatarText}>{initials}</Text>
                            </View>
                            <View style={styles.profileInfo}>
                                <Text style={styles.profileName}>{user?.businessName || 'My Business'}</Text>
                                <Text style={styles.profileEmail}>{maskedEmail}</Text>
                                <View style={styles.syncRow}>
                                    {pendingSyncCount > 0 ? (
                                        <>
                                            <View style={[styles.syncDot, { backgroundColor: '#f59e0b' }]} />
                                            <Text style={styles.syncTextPending}>{pendingSyncCount} change{pendingSyncCount > 1 ? 's' : ''} pending sync</Text>
                                        </>
                                    ) : (
                                        <>
                                            <View style={[styles.syncDot, { backgroundColor: Colors.success }]} />
                                            <Text style={styles.syncTextOk}>All data synced</Text>
                                        </>
                                    )}
                                </View>
                            </View>
                            <Text style={styles.profileArrow}>›</Text>
                        </TouchableOpacity>

                        {/* ── Quick stats strip ─────────────────────────── */}
                        <View style={styles.statsRow}>
                            <TouchableOpacity style={styles.statBox} onPress={() => goTo('transactions')} activeOpacity={0.8}>
                                <Text style={styles.statValue}>{totalTx}</Text>
                                <Text style={styles.statLabel}>Transactions</Text>
                            </TouchableOpacity>
                            <View style={styles.statDivider} />
                            <TouchableOpacity style={styles.statBox} onPress={() => goTo('goals')} activeOpacity={0.8}>
                                <Text style={styles.statValue}>{activeGoals}</Text>
                                <Text style={styles.statLabel}>Active Goals</Text>
                            </TouchableOpacity>
                            <View style={styles.statDivider} />
                            <TouchableOpacity style={styles.statBox} onPress={() => goTo('invoices')} activeOpacity={0.8}>
                                <Text style={styles.statValue}>{unpaidInv}</Text>
                                <Text style={styles.statLabel}>Unpaid Inv.</Text>
                            </TouchableOpacity>
                            <View style={styles.statDivider} />
                            <TouchableOpacity style={styles.statBox} onPress={() => goTo('dashboard')} activeOpacity={0.8}>
                                <Text style={[styles.statValue, { color: profit >= 0 ? Colors.income : Colors.expense }]}>
                                    {profit >= 0 ? '+' : ''}{Math.abs(profit) >= 1000 ? `${(profit / 1000).toFixed(0)}k` : profit.toFixed(0)}
                                </Text>
                                <Text style={styles.statLabel}>Profit</Text>
                            </TouchableOpacity>
                        </View>

                        {/* ── Analytics ─────────────────────────────────── */}
                        <Text style={styles.sectionTitle}>Analytics</Text>
                        <View style={styles.gridCard}>
                            {ANALYTICS_ITEMS.map(item => (
                                <TouchableOpacity
                                    key={item.screen}
                                    style={styles.gridItem}
                                    onPress={() => goTo(item.screen)}
                                    activeOpacity={0.75}
                                >
                                    <View style={[styles.gridIconBox, { backgroundColor: item.color + '22' }]}>
                                        <Text style={styles.gridIcon}>{item.icon}</Text>
                                    </View>
                                    <Text style={styles.gridLabel}>{item.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* ── Finance ───────────────────────────────────── */}
                        <Text style={styles.sectionTitle}>Finance</Text>
                        <View style={styles.gridCard}>
                            {FINANCE_ITEMS.map(item => (
                                <TouchableOpacity
                                    key={item.screen}
                                    style={styles.gridItem}
                                    onPress={() => goTo(item.screen)}
                                    activeOpacity={0.75}
                                >
                                    <View style={[styles.gridIconBox, { backgroundColor: item.color + '22' }]}>
                                        <Text style={styles.gridIcon}>{item.icon}</Text>
                                    </View>
                                    <Text style={styles.gridLabel}>{item.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* ── Operations & Account — list rows ──────────── */}
                        <Text style={styles.sectionTitle}>Operations & Account</Text>
                        <View style={styles.listCard}>
                            {[...OPERATIONS_ITEMS, ...ACCOUNT_ITEMS].map((item, i, arr) => (
                                <TouchableOpacity
                                    key={item.screen}
                                    style={[styles.listRow, i < arr.length - 1 && styles.listRowBorder]}
                                    onPress={() => goTo(item.screen)}
                                    activeOpacity={0.75}
                                >
                                    <View style={[styles.listIconBox, { backgroundColor: item.color + '22' }]}>
                                        <Text style={styles.listIcon}>{item.icon}</Text>
                                    </View>
                                    <View style={styles.listTextCol}>
                                        <Text style={styles.listLabel}>{item.label}</Text>
                                        <Text style={styles.listDesc}>{item.desc}</Text>
                                    </View>
                                    <Text style={styles.listArrow}>›</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* ── App version ───────────────────────────────── */}
                        <Text style={styles.versionText}>Quad360 · v1.0.0</Text>

                    </ScrollView>
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
        paddingVertical: 8,
        paddingBottom: 12,
        backgroundColor: Colors.surface,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
    },
    tabItem:        { alignItems: 'center', flex: 1, paddingTop: 4 },
    tabIcon:        { fontSize: 16, marginBottom: 2 },
    tabLabel:       { color: Colors.textMuted, fontSize: 10, fontWeight: '500' },
    tabLabelActive: { color: Colors.primary, fontWeight: '700' },
    tabIndicator:   { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.primary, marginTop: 3 },

    // Me avatar in tab bar
    meAvatarSmall:     { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', marginBottom: 2, position: 'relative' },
    meAvatarSmallText: { color: '#fff', fontSize: 9, fontWeight: '800' },
    syncBadge:         { position: 'absolute', top: -3, right: -4, backgroundColor: '#f59e0b', borderRadius: 6, minWidth: 13, height: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
    syncBadgeText:     { color: '#fff', fontSize: 8, fontWeight: '800' },

    // ── Me page ─────────────────────────────────────────────────────────────
    page:   { flex: 1, backgroundColor: Colors.bg },
    scroll: { paddingBottom: 40 },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    headerTitle:  { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
    closeBtn:     { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
    closeBtnText: { fontSize: 14, color: Colors.textMuted, fontWeight: '700' },

    // Profile card
    profileCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.surface,
        marginHorizontal: 16,
        marginTop: 20,
        borderRadius: 16,
        padding: 16,
        gap: 14,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    avatar:      { width: 54, height: 54, borderRadius: 27, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
    avatarText:  { color: '#fff', fontSize: 20, fontWeight: '800' },
    profileInfo: { flex: 1 },
    profileName:  { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
    profileEmail: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
    syncRow:      { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
    syncDot:      { width: 7, height: 7, borderRadius: 4 },
    syncTextOk:   { fontSize: 11, color: Colors.success, fontWeight: '600' },
    syncTextPending: { fontSize: 11, color: '#f59e0b', fontWeight: '600' },
    profileArrow: { fontSize: 22, color: Colors.textMuted },

    // Quick stats
    statsRow: {
        flexDirection: 'row',
        backgroundColor: Colors.surface,
        marginHorizontal: 16,
        marginTop: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: Colors.border,
        overflow: 'hidden',
    },
    statBox:     { flex: 1, alignItems: 'center', paddingVertical: 14 },
    statValue:   { fontSize: 17, fontWeight: '800', color: Colors.textPrimary },
    statLabel:   { fontSize: 10, color: Colors.textMuted, marginTop: 3, fontWeight: '500' },
    statDivider: { width: 1, backgroundColor: Colors.border, marginVertical: 10 },

    // Section titles
    sectionTitle: {
        fontSize: 11,
        fontWeight: '700',
        color: Colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginLeft: 20,
        marginTop: 24,
        marginBottom: 10,
    },

    // Icon grid
    gridCard: {
        flexDirection: 'row',
        backgroundColor: Colors.surface,
        marginHorizontal: 16,
        borderRadius: 16,
        paddingVertical: 18,
        borderWidth: 1,
        borderColor: Colors.border,
        justifyContent: 'space-around',
    },
    gridItem:    { alignItems: 'center', flex: 1 },
    gridIconBox: { width: 50, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 7 },
    gridIcon:    { fontSize: 22 },
    gridLabel:   { fontSize: 11, color: Colors.textSecondary, fontWeight: '600', textAlign: 'center' },

    // List card
    listCard:      { backgroundColor: Colors.surface, marginHorizontal: 16, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
    listRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 12 },
    listRowBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
    listIconBox:   { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    listIcon:      { fontSize: 18 },
    listTextCol:   { flex: 1 },
    listLabel:     { fontSize: 15, color: Colors.textPrimary, fontWeight: '700' },
    listDesc:      { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
    listArrow:     { fontSize: 20, color: Colors.textMuted },

    // Footer
    versionText: { textAlign: 'center', fontSize: 12, color: Colors.textMuted, marginTop: 32 },
});
