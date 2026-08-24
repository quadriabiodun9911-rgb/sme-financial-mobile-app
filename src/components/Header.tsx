import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, Modal, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import Icon from './ui/Icon';
import GlobalSearch from './GlobalSearch';
import AlertsWidget from './AlertsWidget';
import { detectFinancialAlerts, DEFAULT_THRESHOLDS } from '../utils/alertEngine';
import { ForecastAlert } from '../types/forecast';
import { sendCashFlowAlert, sendOverdueInvoiceAlert } from '../utils/whatsappIntegration';

const DISMISSED_ALERTS_KEY = '@quad360/dismissed_alerts';

export default function Header() {
    const { user, logout, setCurrentScreen, goBack, currentScreen, finance, transactions, invoices, loans, staff, payrollRuns, settings, goals, budgets, assets, inventory, localAccounts, switchAccountDirect, teamMemberships, refreshTeamMemberships, switchBusiness } = useApp();
    const showBack = currentScreen !== 'dashboard' && currentScreen !== 'login';
    const { width } = useWindowDimensions();
    const isNarrow = width < 480;
    const [showSearch, setShowSearch] = useState(false);
    const [dismissedIds, setDismissedIds] = useState<string[]>([]);
    const currency = settings?.currency ?? '₦';

    // In-app account switcher -- reachable without signing out first, and
    // (unlike the pre-login Welcome Back screen's Switch Account) doesn't
    // ask for a PIN again: this device is already unlocked and rendering
    // real data for one account, so re-verifying to move to another
    // account it already knows about adds friction without adding
    // security. See switchLocalAccountDirect's comment in storage.ts.
    const [switcherOpen, setSwitcherOpen] = useState(false);
    const [switchingTo, setSwitchingTo] = useState<string | null>(null);
    const otherAccounts = useMemo(
        () => localAccounts.filter(a => a.email.toLowerCase() !== (user?.email ?? '').toLowerCase()),
        [localAccounts, user?.email]
    );
    const handleSwitchTo = useCallback(async (email: string) => {
        setSwitchingTo(email);
        try {
            const result = await switchAccountDirect(email);
            if (result === 'ok') setSwitcherOpen(false);
        } finally {
            setSwitchingTo(null);
        }
    }, [switchAccountDirect]);

    // Businesses this signed-in user has been invited into as a team
    // member (as opposed to otherAccounts above, which are separate local
    // logins on this device). Same switcher sheet, different action:
    // switching business keeps the current login, just re-points which
    // owner's data is active.
    const [switchingToBusiness, setSwitchingToBusiness] = useState<string | null>(null);
    const canSwitch = otherAccounts.length > 0 || teamMemberships.length > 0;
    const handleSwitchBusiness = useCallback(async (ownerUserId: string) => {
        setSwitchingToBusiness(ownerUserId);
        try {
            await switchBusiness(ownerUserId);
            setSwitcherOpen(false);
        } finally {
            setSwitchingToBusiness(null);
        }
    }, [switchBusiness]);

    useEffect(() => {
        AsyncStorage.getItem(DISMISSED_ALERTS_KEY).then(raw => {
            if (raw) {
                try { setDismissedIds(JSON.parse(raw)); } catch { /* corrupt value, start fresh */ }
            }
        });
        refreshTeamMemberships().catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const alerts = useMemo(
        () => detectFinancialAlerts(finance?.cashBalance ?? 0, transactions ?? [], invoices ?? [], currency, dismissedIds, loans ?? [], staff ?? [], payrollRuns ?? [], settings?.nextTaxDeadline, goals ?? [], budgets ?? [], assets ?? [], inventory ?? [], finance?.totalTaxCollected, finance?.totalTaxPaid, settings?.minReserve),
        [finance?.cashBalance, transactions, invoices, currency, dismissedIds, loans, staff, payrollRuns, settings?.nextTaxDeadline, goals, budgets, assets, inventory, finance?.totalTaxCollected, finance?.totalTaxPaid, settings?.minReserve]
    );

    const handleDismiss = useCallback((alertId: string) => {
        setDismissedIds(prev => {
            const next = [...prev, alertId];
            AsyncStorage.setItem(DISMISSED_ALERTS_KEY, JSON.stringify(next));
            return next;
        });
    }, []);

    // Overdue-invoice alert ids are `alert-overdue-${invoice.id}` (see
    // alertEngine.ts) -- recovering the invoice from that id keeps this a
    // pure lookup instead of duplicating invoice data onto the alert.
    const overdueInvoiceFor = useCallback(
        (alert: ForecastAlert) => (invoices ?? []).find(inv => alert.id === `alert-overdue-${inv.id}`),
        [invoices]
    );

    const canNotify = useCallback((alert: ForecastAlert): boolean => {
        if (alert.type === 'overdue_invoice') return !!overdueInvoiceFor(alert)?.clientPhone;
        if (alert.type === 'low_cash' || alert.type === 'negative_forecast' || alert.type === 'large_expense_coming') return !!user?.phone;
        return false;
    }, [overdueInvoiceFor, user?.phone]);

    // Every send here opens WhatsApp with a pre-filled draft the sender
    // still has to tap "send" on themselves -- one merchant-initiated tap
    // per alert, never an automatic background send to a customer.
    const handleNotify = useCallback((alert: ForecastAlert) => {
        if (alert.type === 'overdue_invoice') {
            const invoice = overdueInvoiceFor(alert);
            if (!invoice?.clientPhone) return;
            const daysOverdue = Math.floor((Date.now() - new Date(invoice.dueDate).getTime()) / (1000 * 60 * 60 * 24));
            sendOverdueInvoiceAlert(invoice.clientPhone, user?.businessName || 'your supplier', invoice.invoiceNumber, invoice.total, daysOverdue, currency);
            return;
        }
        if (!user?.phone) return;
        if (alert.type !== 'low_cash' && alert.type !== 'negative_forecast' && alert.type !== 'large_expense_coming') return;
        const cashFlowAlertType = alert.type === 'large_expense_coming' ? 'large_expense' : alert.type;
        sendCashFlowAlert(user.phone, cashFlowAlertType, {
            currentCash: finance?.cashBalance,
            threshold: alert.type === 'low_cash' ? DEFAULT_THRESHOLDS.lowCashThreshold : undefined,
            expenseAmount: alert.type === 'large_expense_coming' ? alert.amount : undefined,
            projectedMonth: alert.affectedDate,
            currency,
        });
    }, [overdueInvoiceFor, user?.phone, user?.businessName, finance?.cashBalance, currency]);

    return (
        <View style={styles.header}>
            <View style={styles.left}>
                {showBack && (
                    <TouchableOpacity style={styles.backBtn} onPress={() => { if (!goBack()) setCurrentScreen('dashboard'); }} activeOpacity={0.7}>
                        <Icon name="chevron-left" size={16} color={Colors.primary} />
                    </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.brandRow} onPress={() => setCurrentScreen('dashboard')} activeOpacity={0.8}>
                    <LinearGradient colors={[Colors.primary, Colors.secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.mark} />
                    <View>
                        <Text style={styles.title}>Quad360</Text>
                        <Text style={styles.subtitle}>{user?.businessName || 'Business Suite'}</Text>
                    </View>
                </TouchableOpacity>
            </View>
            <View style={styles.right}>
                <AlertsWidget
                    alerts={alerts}
                    currency={currency}
                    onDismiss={handleDismiss}
                    canNotify={canNotify}
                    onNotify={handleNotify}
                />
                {canSwitch && isNarrow && (
                    <TouchableOpacity style={styles.iconBtn} onPress={() => setSwitcherOpen(true)} activeOpacity={0.7}>
                        <Icon name="repeat" size={16} color={Colors.textSecondary} />
                    </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.iconBtn} onPress={() => setShowSearch(true)} activeOpacity={0.7}>
                    <Icon name="search" size={16} color={Colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={() => setCurrentScreen('settings')} activeOpacity={0.7}>
                    <Icon name="settings" size={16} color={Colors.textSecondary} />
                </TouchableOpacity>
                {!isNarrow && (
                    <TouchableOpacity
                        style={styles.userBlock}
                        onPress={() => canSwitch && setSwitcherOpen(true)}
                        activeOpacity={canSwitch ? 0.7 : 1}
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={styles.userText}>{user?.email?.split('@')[0] || 'Admin'}</Text>
                            {canSwitch && <Icon name="chevron-down" size={12} color={Colors.textMuted} />}
                        </View>
                        <Text style={styles.userRole}>{user?.role || 'Administrator'}</Text>
                    </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.signOutBtn} onPress={logout} activeOpacity={0.8}>
                    <Text style={styles.signOutText}>{isNarrow ? 'Out' : 'Sign Out'}</Text>
                </TouchableOpacity>
            </View>
            <GlobalSearch visible={showSearch} onClose={() => setShowSearch(false)} />
            <Modal
                visible={switcherOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setSwitcherOpen(false)}
            >
                <TouchableOpacity style={styles.switcherBackdrop} activeOpacity={1} onPress={() => setSwitcherOpen(false)}>
                    <TouchableOpacity activeOpacity={1} style={styles.switcherSheet}>
                        <Text style={styles.switcherTitle}>Switch Account</Text>
                        <View style={styles.switcherCurrentRow}>
                            <View style={[styles.switcherAvatar, styles.switcherAvatarCurrent]}>
                                <Text style={styles.switcherAvatarText}>{(user?.businessName || '?').trim().charAt(0).toUpperCase()}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.switcherName} numberOfLines={1}>{user?.businessName}</Text>
                                <Text style={styles.switcherEmail} numberOfLines={1}>{user?.email} · Current</Text>
                            </View>
                            <Icon name="check" size={16} color={Colors.primary} />
                        </View>
                        {teamMemberships.length > 0 && (
                            <>
                                <Text style={styles.switcherSectionLabel}>Businesses You're On</Text>
                                {teamMemberships.map(m => (
                                    <TouchableOpacity
                                        key={m.membershipId}
                                        style={styles.switcherRow}
                                        onPress={() => handleSwitchBusiness(m.ownerUserId)}
                                        disabled={switchingToBusiness !== null}
                                        activeOpacity={0.7}
                                    >
                                        <View style={styles.switcherAvatar}>
                                            <Text style={styles.switcherAvatarText}>{m.ownerBusinessName.trim().charAt(0).toUpperCase() || '?'}</Text>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.switcherName} numberOfLines={1}>{m.ownerBusinessName}</Text>
                                            <Text style={styles.switcherEmail} numberOfLines={1}>Your role: {m.role}</Text>
                                        </View>
                                        {switchingToBusiness === m.ownerUserId
                                            ? <ActivityIndicator size="small" color={Colors.primary} />
                                            : <Icon name="chevron-right" size={16} color={Colors.textMuted} />
                                        }
                                    </TouchableOpacity>
                                ))}
                            </>
                        )}
                        {otherAccounts.length > 0 && teamMemberships.length > 0 && (
                            <Text style={styles.switcherSectionLabel}>Other Accounts</Text>
                        )}
                        {otherAccounts.map(acct => (
                            <TouchableOpacity
                                key={acct.email}
                                style={styles.switcherRow}
                                onPress={() => handleSwitchTo(acct.email)}
                                disabled={switchingTo !== null}
                                activeOpacity={0.7}
                            >
                                <View style={styles.switcherAvatar}>
                                    <Text style={styles.switcherAvatarText}>{acct.businessName.trim().charAt(0).toUpperCase() || '?'}</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.switcherName} numberOfLines={1}>{acct.businessName}</Text>
                                    <Text style={styles.switcherEmail} numberOfLines={1}>{acct.email}</Text>
                                </View>
                                {switchingTo === acct.email
                                    ? <ActivityIndicator size="small" color={Colors.primary} />
                                    : <Icon name="chevron-right" size={16} color={Colors.textMuted} />
                                }
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity style={styles.switcherCancelBtn} onPress={() => setSwitcherOpen(false)} disabled={switchingTo !== null}>
                            <Text style={styles.switcherCancelText}>Cancel</Text>
                        </TouchableOpacity>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        backgroundColor: Colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    left:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    brandRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    mark:      { width: 26, height: 26, borderRadius: Radius.sm },
    backBtn: {
        width: 30, height: 30, borderRadius: Radius.pill,
        backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border,
        alignItems: 'center', justifyContent: 'center',
    },
    title:    { fontSize: 17, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.3 },
    subtitle: { fontSize: 11, color: Colors.textMuted, fontWeight: '500' },
    right:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    iconBtn: {
        width: 34, height: 34, borderRadius: Radius.pill,
        backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border,
        alignItems: 'center', justifyContent: 'center',
        ...Shadow.sm,
    },
    userBlock:  { alignItems: 'flex-end' },
    userText:   { fontSize: 12, color: Colors.textPrimary, fontWeight: '700' },
    userRole:   { fontSize: 10, color: Colors.textMuted, fontWeight: '500' },
    signOutBtn: {
        backgroundColor: Colors.surfaceVariant,
        borderWidth: 1,
        borderColor: Colors.border,
        paddingHorizontal: Spacing.md,
        paddingVertical: 6,
        borderRadius: Radius.pill,
    },
    signOutText: { color: Colors.textSecondary, fontSize: 11, fontWeight: '700' },

    switcherBackdrop: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center', justifyContent: 'flex-start',
        paddingTop: 70, paddingHorizontal: Spacing.lg,
    },
    switcherSheet: {
        width: '100%', maxWidth: 340, backgroundColor: Colors.surface,
        borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
        padding: Spacing.md, ...Shadow.lg,
    },
    switcherTitle: {
        fontSize: 11, fontWeight: '700', color: Colors.textMuted,
        textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, paddingHorizontal: 2,
    },
    switcherSectionLabel: {
        fontSize: 10, fontWeight: '700', color: Colors.textMuted,
        textTransform: 'uppercase', letterSpacing: 0.5,
        marginTop: 10, marginBottom: 2, paddingHorizontal: 4,
    },
    switcherCurrentRow: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingVertical: 8, paddingHorizontal: 4,
        backgroundColor: Colors.bg, borderRadius: Radius.md, marginBottom: 4,
    },
    switcherRow: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingVertical: 10, paddingHorizontal: 4,
    },
    switcherAvatar: {
        width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.surfaceVariant,
        alignItems: 'center', justifyContent: 'center',
    },
    switcherAvatarCurrent: { backgroundColor: Colors.primary + '22' },
    switcherAvatarText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
    switcherName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
    switcherEmail: { fontSize: 11.5, color: Colors.textMuted, marginTop: 1 },
    switcherCancelBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
    switcherCancelText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
});
