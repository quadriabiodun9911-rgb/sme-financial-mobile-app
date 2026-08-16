import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
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
    const { user, logout, setCurrentScreen, goBack, currentScreen, finance, transactions, invoices, settings } = useApp();
    const showBack = currentScreen !== 'dashboard' && currentScreen !== 'login';
    const { width } = useWindowDimensions();
    const isNarrow = width < 480;
    const [showSearch, setShowSearch] = useState(false);
    const [dismissedIds, setDismissedIds] = useState<string[]>([]);
    const currency = settings?.currency ?? '₦';

    useEffect(() => {
        AsyncStorage.getItem(DISMISSED_ALERTS_KEY).then(raw => {
            if (raw) {
                try { setDismissedIds(JSON.parse(raw)); } catch { /* corrupt value, start fresh */ }
            }
        });
    }, []);

    const alerts = useMemo(
        () => detectFinancialAlerts(finance?.cashBalance ?? 0, transactions ?? [], invoices ?? [], currency, dismissedIds),
        [finance?.cashBalance, transactions, invoices, currency, dismissedIds]
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
                <TouchableOpacity style={styles.iconBtn} onPress={() => setShowSearch(true)} activeOpacity={0.7}>
                    <Icon name="search" size={16} color={Colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={() => setCurrentScreen('settings')} activeOpacity={0.7}>
                    <Icon name="settings" size={16} color={Colors.textSecondary} />
                </TouchableOpacity>
                {!isNarrow && (
                    <View style={styles.userBlock}>
                        <Text style={styles.userText}>{user?.email?.split('@')[0] || 'Admin'}</Text>
                        <Text style={styles.userRole}>{user?.role || 'Administrator'}</Text>
                    </View>
                )}
                <TouchableOpacity style={styles.signOutBtn} onPress={logout} activeOpacity={0.8}>
                    <Text style={styles.signOutText}>{isNarrow ? 'Out' : 'Sign Out'}</Text>
                </TouchableOpacity>
            </View>
            <GlobalSearch visible={showSearch} onClose={() => setShowSearch(false)} />
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
});
