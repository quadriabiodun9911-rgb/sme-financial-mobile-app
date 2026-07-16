import React, { useState, useEffect } from 'react';
import {
    View, Text, TouchableOpacity, ScrollView,
    StyleSheet, Alert, ActivityIndicator, Platform, Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Config } from '../config';
import { apiFetch } from '../utils/api';

// Mirror of backend/providers/index.js — currency → provider
const CURRENCY_PROVIDER_MAP: Record<string, string> = {
    NGN: 'plaid', GHS: 'plaid',
    KES: 'pngme', UGX: 'pngme', TZS: 'pngme', RWF: 'pngme', ZMW: 'pngme', ETB: 'pngme', MWK: 'pngme',
    EGP: 'lean',  SAR: 'lean',  AED: 'lean',  BHD: 'lean',  KWD: 'lean',  JOD: 'lean',  QAR: 'lean',
    USD: 'plaid', GBP: 'plaid', EUR: 'plaid', CAD: 'plaid', AUD: 'plaid', CHF: 'plaid',
};

// Provider metadata shown in the UI
const PROVIDER_INFO: Record<string, { name: string; logo: string; description: string; countries: string }> = {
    mono:  { name: 'Mono',  logo: '🇳🇬', description: 'Direct bank API — GTBank, Access, Zenith, UBA + more', countries: 'Nigeria · Ghana · Kenya' },
    pngme: { name: 'Pngme', logo: '📱', description: 'SMS-based mobile money & bank alerts (Android only)',   countries: 'Kenya · Uganda · Tanzania · Rwanda · Zambia · Ethiopia' },
    lean:  { name: 'Lean',  logo: '🌍', description: 'Open banking for MENA region',                          countries: 'Egypt · Saudi Arabia · UAE · Bahrain · Kuwait' },
    plaid: { name: 'Plaid', logo: '🌐', description: 'Open banking for Western markets',                      countries: 'USA · UK · Canada · EU · Nigeria (sandbox)' },
};

const STORAGE_KEY = 'bank_connection_v2';

interface ConnectionState {
    provider: string;
    currencyCode: string;
    connectedAt: string;
    accountCount: number;
    lastSynced: string | null;
    syncedCount: number;
}

export default function BankAggregatorScreen() {
    const { navigate, goBack, user, settings, addTransaction, transactions } = useApp();

    const [connection, setConnection]     = useState<ConnectionState | null>(null);
    const [loading, setLoading]           = useState(false);
    const [loadingMsg, setLoadingMsg]     = useState('');
    const [syncing, setSyncing]           = useState(false);
    const [accounts, setAccounts]         = useState<any[]>([]);
    const [providerName, setProviderName] = useState('');
    const [showManualConfirm, setShowManualConfirm] = useState(false);

    const currency     = settings.currencyCode || 'NGN';
    const userEmail    = user?.email || '';
    const businessName = user?.businessName || 'My Business';

    useEffect(() => {
        AsyncStorage.getItem(STORAGE_KEY).then(raw => {
            if (raw) setConnection(JSON.parse(raw));
        }).catch(() => {});
        setProviderName(CURRENCY_PROVIDER_MAP[currency] || 'pngme');

        // If returning from Plaid hosted page (mobile fallback), show confirm card
        if (Platform.OS === 'web' && sessionStorage.getItem('plaid_pending')) {
            setShowManualConfirm(true);
        }
    }, [currency]);

    const providerInfo = PROVIDER_INFO[providerName] || PROVIDER_INFO['pngme'];

    // Load Plaid Link JS SDK (web only)
    const loadPlaidScript = (): Promise<void> => new Promise((resolve, reject) => {
        if ((window as any).Plaid) { resolve(); return; }
        const s = document.createElement('script');
        s.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Failed to load Plaid SDK'));
        document.head.appendChild(s);
    });

    const openPlaidWeb = async (linkToken: string) => {
        // On mobile browsers (iOS/Android) the Plaid JS SDK popup is always
        // blocked silently — skip it and navigate directly to the hosted page.
        const isMobileBrowser = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (isMobileBrowser) {
            sessionStorage.setItem('plaid_pending', '1');
            sessionStorage.setItem('plaid_link_token', linkToken);
            setLoading(false);
            setLoadingMsg('');
            window.location.href = `https://cdn.plaid.com/link/v2/stable/link.html?token=${linkToken}`;
            return;
        }

        // Desktop: try JS SDK (works in non-popup-blocking desktop browsers)
        try {
            await loadPlaidScript();
        } catch {
            sessionStorage.setItem('plaid_pending', '1');
            sessionStorage.setItem('plaid_link_token', linkToken);
            window.location.href = `https://cdn.plaid.com/link/v2/stable/link.html?token=${linkToken}`;
            return;
        }

        let widgetOpened = false;
        try {
            const handler = (window as any).Plaid.create({
                token: linkToken,
                onSuccess: async (publicToken: string) => {
                    setLoading(true);
                    setLoadingMsg('Finalising bank connection…');
                    try {
                        await apiFetch('/api/bank-data/plaid-exchange', {
                            method: 'POST',
                            body: JSON.stringify({ userId: userEmail, publicToken }),
                        });
                        sessionStorage.removeItem('plaid_pending');
                        await saveConnection('plaid');
                    } catch (e: any) {
                        Alert.alert('Connection error', e.message || 'Could not finalise bank connection.');
                    } finally {
                        setLoading(false);
                        setLoadingMsg('');
                    }
                },
                onExit: () => { setLoading(false); setLoadingMsg(''); },
                onLoad: () => { widgetOpened = true; },
            });
            handler.open();
        } catch {
            sessionStorage.setItem('plaid_pending', '1');
            sessionStorage.setItem('plaid_link_token', linkToken);
            window.location.href = `https://cdn.plaid.com/link/v2/stable/link.html?token=${linkToken}`;
            return;
        }

        // Desktop fallback: if widget didn't open after 2s, show manual confirm
        setTimeout(() => {
            if (!widgetOpened) {
                setLoading(false);
                setLoadingMsg('');
                setShowManualConfirm(true);
                sessionStorage.setItem('plaid_pending', '1');
                sessionStorage.setItem('plaid_link_token', linkToken);
            }
        }, 2000);
    };

    const handleConnect = async () => {
        if (!userEmail) {
            Alert.alert('Login required', 'Please log in first.');
            return;
        }

        if (providerName === 'pngme') {
            if (Platform.OS !== 'android') {
                Alert.alert(
                    'Android only',
                    'SMS-based bank connection (Pngme) only works on Android devices. For Kenya, Uganda, Tanzania and other East African markets, use the Quad360 Android app.',
                );
                return;
            }
            navigate('connect-bank');
            return;
        }

        setLoading(true);
        setLoadingMsg('Connecting… please wait');
        const wakeTimer = setTimeout(() => setLoadingMsg('Server starting up, please wait ~30s…'), 5000);
        try {
            let data: any;
            try {
                data = await apiFetch('/api/bank-data/connect', {
                    method: 'POST',
                    body: JSON.stringify({ userId: userEmail, currencyCode: currency, businessName, name: businessName, email: userEmail }),
                });
            } catch (e: any) {
                Alert.alert(
                    '🔌 Sync Server Unavailable',
                    'The bank connection service is currently offline or starting up (Render free tier sleeps after inactivity).\n\nTry again in 30 seconds, or use "Import Bank Statement (CSV/Excel)" in Settings to upload transactions manually.',
                    [{ text: 'OK' }]
                );
                setLoading(false);
                return;
            }

            if (data.monoConnectUrl) {
                if (Platform.OS === 'web') {
                    window.location.href = data.monoConnectUrl;
                } else {
                    await Linking.openURL(data.monoConnectUrl);
                }
                Alert.alert(
                    'Complete connection in browser',
                    'After you connect your bank in the Mono widget, come back and tap "I\'ve connected" to finish.',
                    [{ text: "I've connected", onPress: () => saveConnection(data.provider || 'mono') }]
                );
                setLoading(false);
                return;
            }

            if (data.linkToken) {
                if (Platform.OS === 'web') {
                    await openPlaidWeb(data.linkToken);
                } else {
                    await Linking.openURL(`https://cdn.plaid.com/link/v2/stable/link.html?token=${data.linkToken}`);
                    Alert.alert(
                        'Complete connection in browser',
                        'After you connect your bank via Plaid Link, come back and tap "I\'ve connected".',
                        [{ text: "I've connected", onPress: () => saveConnection('plaid') }]
                    );
                }
                setLoading(false);
                return;
            }

            if (data.customerId) {
                const leanUrl = `https://cdn.leantech.me/link/loader/prod/ae/latest/index.html?customer_id=${data.customerId}`;
                if (Platform.OS === 'web') {
                    window.location.href = leanUrl;
                } else {
                    await Linking.openURL(leanUrl);
                }
                Alert.alert(
                    'Complete connection in browser',
                    'After you connect your bank via Lean, come back and tap "I\'ve connected".',
                    [{ text: "I've connected", onPress: () => saveConnection('lean') }]
                );
                setLoading(false);
                return;
            }

            saveConnection(data.provider || providerName);
        } catch (err: any) {
            Alert.alert('Connection failed', err.message);
        } finally {
            clearTimeout(wakeTimer);
            setLoading(false);
            setLoadingMsg('');
        }
    };

    const saveConnection = async (provider: string) => {
        const newConn: ConnectionState = {
            provider,
            currencyCode: currency,
            connectedAt: new Date().toISOString(),
            accountCount: 0,
            lastSynced: null,
            syncedCount: 0,
        };
        setConnection(newConn);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newConn));
        Alert.alert('✅ Connected!', `Your bank is linked via ${provider}. Tap "Sync Transactions" to import your data.`);
    };

    const handleSync = async () => {
        if (!connection || !userEmail) return;
        setSyncing(true);
        try {
            const since = connection.lastSynced
                ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

            const data = await apiFetch(
                `/api/bank-data/transactions?currencyCode=${currency}&since=${encodeURIComponent(since)}`
            );
            const txns: any[] = data.transactions || data;

            // De-duplicate: skip any bank transaction whose reference already exists
            const existingRefs = new Set(transactions.map((t: any) => t.reference).filter(Boolean));
            let imported = 0;
            for (const tx of txns) {
                const ref = tx.id || tx.reference || tx.transaction_id;
                if (ref && existingRefs.has(ref)) continue; // already imported
                addTransaction({
                    type:            tx.type === 'debit' ? 'expense' : 'income',
                    amount:          Math.abs(parseFloat(tx.amount) || 0),
                    description:     tx.narration || tx.description || tx.name || 'Bank transaction',
                    category:        tx.category || (tx.type === 'debit' ? 'General' : 'Sales'),
                    date:            (tx.date || tx.created_at || new Date().toISOString()).split('T')[0],
                    vendorCustomer:  tx.counterparty || tx.merchant_name || '',
                    reference:       ref || undefined,
                    status:          'paid',
                });
                imported++;
            }

            const updated: ConnectionState = {
                ...connection,
                lastSynced: new Date().toISOString(),
                syncedCount: (connection.syncedCount || 0) + imported,
            };
            setConnection(updated);
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

            Alert.alert(
                'Sync complete',
                imported > 0
                    ? `${imported} new transaction(s) imported from ${providerInfo.name}. Check your Transactions screen.`
                    : 'No new transactions since last sync.'
            );
        } catch (err: any) {
            Alert.alert('Sync failed', err.message);
        } finally {
            setSyncing(false);
        }
    };

    const handleDisconnect = () => {
        const msg = 'Stop syncing from this bank connection? Existing transactions will not be deleted.';
        const doDisconnect = async () => {
            setConnection(null);
            setAccounts([]);
            sessionStorage.removeItem('plaid_pending');
            sessionStorage.removeItem('plaid_link_token');
            setShowManualConfirm(false);
            await AsyncStorage.removeItem(STORAGE_KEY);
        };
        if (Platform.OS === 'web') {
            if (window.confirm(msg)) doDisconnect();
            return;
        }
        Alert.alert('Disconnect', msg, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Disconnect', style: 'destructive', onPress: doDisconnect },
        ]);
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => { if (!goBack()) navigate('settings'); }}>
                    <Text style={styles.backBtn}>← Back</Text>
                </TouchableOpacity>
                <View>
                    <Text style={styles.title}>🏦 Bank Connection</Text>
                    <Text style={styles.subtitle}>Auto-import your transactions</Text>
                </View>
            </View>

            <View style={styles.providerCard}>
                <Text style={styles.providerLogo}>{providerInfo.logo}</Text>
                <View style={{ flex: 1 }}>
                    <View style={styles.providerRow}>
                        <Text style={styles.providerName}>{providerInfo.name}</Text>
                        <View style={[styles.badge, connection ? styles.badgeGreen : styles.badgeGrey]}>
                            <Text style={styles.badgeText}>{connection ? 'Connected' : 'Not connected'}</Text>
                        </View>
                    </View>
                    <Text style={styles.providerDesc}>{providerInfo.description}</Text>
                    <Text style={styles.providerCountries}>{providerInfo.countries}</Text>
                </View>
            </View>

            {connection && (
                <View style={styles.statsRow}>
                    <View style={styles.statBox}>
                        <Text style={styles.statNum}>{connection.syncedCount}</Text>
                        <Text style={styles.statLabel}>Transactions</Text>
                    </View>
                    <View style={styles.statBox}>
                        <Text style={styles.statNum}>{connection.provider.toUpperCase()}</Text>
                        <Text style={styles.statLabel}>Provider</Text>
                    </View>
                    <View style={styles.statBox}>
                        <Text style={styles.statNum}>
                            {connection.lastSynced
                                ? new Date(connection.lastSynced).toLocaleDateString()
                                : '—'}
                        </Text>
                        <Text style={styles.statLabel}>Last Sync</Text>
                    </View>
                </View>
            )}

            {!connection && (
                <View style={styles.infoCard}>
                    <Text style={styles.infoTitle}>How it works</Text>
                    {[
                        { icon: '🔗', text: `Connect your bank via ${providerInfo.name} — secure, read-only access` },
                        { icon: '🔄', text: 'Transactions are automatically categorised and imported' },
                        { icon: '📊', text: 'Your dashboard, reports, and invoices update in real time' },
                        { icon: '🔒', text: 'Your login credentials are never stored or shared' },
                    ].map((item, i) => (
                        <View key={i} style={styles.infoRow}>
                            <Text style={styles.infoIcon}>{item.icon}</Text>
                            <Text style={styles.infoText}>{item.text}</Text>
                        </View>
                    ))}
                </View>
            )}

            <View style={styles.allProvidersCard}>
                <Text style={styles.sectionTitle}>Coverage by Region</Text>
                {Object.entries(PROVIDER_INFO).map(([key, info]) => (
                    <View key={key} style={[styles.providerRow2, providerName === key && styles.providerRow2Active]}>
                        <Text style={styles.providerLogo2}>{info.logo}</Text>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.providerName2}>{info.name}</Text>
                            <Text style={styles.providerCountries2}>{info.countries}</Text>
                        </View>
                        {providerName === key && (
                            <View style={styles.yoursBadge}>
                                <Text style={styles.yoursBadgeText}>Yours</Text>
                            </View>
                        )}
                    </View>
                ))}
            </View>

            {/* Manual confirm card — shown when Plaid widget was blocked or user returns from hosted page */}
            {showManualConfirm && !connection && (
                <View style={styles.confirmCard}>
                    <Text style={styles.confirmTitle}>🏦 Connect your bank</Text>
                    <Text style={styles.confirmBody}>
                        Your browser blocked the Plaid popup. Tap the button below to open Plaid in this tab and connect your bank.
                        When you're done, come back here and tap "I've connected".
                    </Text>
                    <TouchableOpacity style={styles.primaryBtn} onPress={() => {
                        const token = sessionStorage.getItem('plaid_link_token');
                        if (token) window.location.href = `https://cdn.plaid.com/link/v2/stable/link.html?token=${token}`;
                    }}>
                        <Text style={styles.primaryBtnText}>🔗  Open Plaid</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.syncBtn, { marginTop: 10 }]} onPress={() => {
                        sessionStorage.removeItem('plaid_pending');
                        setShowManualConfirm(false);
                        saveConnection('plaid');
                    }}>
                        <Text style={styles.syncBtnText}>✅  I've connected — confirm</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { sessionStorage.removeItem('plaid_pending'); setShowManualConfirm(false); }}>
                        <Text style={[styles.disconnectBtnText, { marginTop: 10, textAlign: 'center' }]}>Cancel</Text>
                    </TouchableOpacity>
                </View>
            )}

            <View style={styles.comingSoonCard}>
                <Text style={styles.comingSoonIcon}>🚧</Text>
                <Text style={styles.comingSoonTitle}>Coming Soon — Bank Connection</Text>
                <Text style={styles.comingSoonBody}>
                    We're finalising production access with our banking partners (Plaid, Mono, Lean, Pngme).
                    This feature will be fully available shortly after beta launch.
                </Text>
            </View>

            <View style={styles.actions}>
                {!!loadingMsg && <Text style={styles.loadingMsg}>⏳ {loadingMsg}</Text>}
                {!connection ? (
                    <View style={[styles.primaryBtn, { opacity: 0.45 }]}>
                        <Text style={styles.primaryBtnText}>🔗  Connect via {providerInfo.name}</Text>
                        <Text style={{ color: '#ffffff99', fontSize: 11, marginTop: 3 }}>Available after beta</Text>
                    </View>
                ) : (
                    <>
                        <TouchableOpacity
                            style={[styles.syncBtn, syncing && styles.btnDisabled]}
                            onPress={handleSync}
                            disabled={syncing}
                        >
                            {syncing
                                ? <ActivityIndicator color={Colors.primary} />
                                : <Text style={styles.syncBtnText}>🔄  Sync Transactions</Text>
                            }
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect}>
                            <Text style={styles.disconnectBtnText}>Disconnect</Text>
                        </TouchableOpacity>
                    </>
                )}
            </View>

            <View style={styles.tipCard}>
                <Text style={styles.tipTitle}>💡 Provider is selected automatically</Text>
                <Text style={styles.tipBody}>
                    Quad360 routes your connection to the best provider for your currency ({currency}).
                    Change your currency in Settings to switch regions.
                </Text>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg },
    content:   { padding: 16, paddingBottom: 60 },

    header:   { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
    backBtn:  { color: Colors.primary, fontSize: 14, fontWeight: '600' },
    title:    { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
    subtitle: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

    providerCard: { flexDirection: 'row', gap: 14, backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 14, alignItems: 'flex-start' },
    providerLogo: { fontSize: 36, width: 44 },
    providerRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    providerName: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
    providerDesc: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18, marginBottom: 4 },
    providerCountries: { fontSize: 11, color: Colors.textMuted },

    badge:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
    badgeGreen: { backgroundColor: 'rgba(34,197,94,0.15)' },
    badgeGrey:  { backgroundColor: Colors.bg },
    badgeText:  { fontSize: 10, fontWeight: '700', color: Colors.textSecondary },

    statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    statBox:  { flex: 1, backgroundColor: Colors.surface, borderRadius: 12, padding: 12, alignItems: 'center' },
    statNum:  { fontSize: 15, fontWeight: '800', color: Colors.primary, marginBottom: 2 },
    statLabel: { fontSize: 10, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },

    infoCard:  { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 14 },
    infoTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 12 },
    infoRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
    infoIcon:  { fontSize: 18, width: 26 },
    infoText:  { flex: 1, fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },

    allProvidersCard: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 16 },
    sectionTitle:     { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
    providerRow2:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
    providerRow2Active: { backgroundColor: Colors.primary + '10', marginHorizontal: -4, paddingHorizontal: 4, borderRadius: 8 },
    providerLogo2:      { fontSize: 22, width: 30 },
    providerName2:      { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    providerCountries2: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
    yoursBadge:         { backgroundColor: Colors.primary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
    yoursBadgeText:     { fontSize: 10, color: '#fff', fontWeight: '700' },

    actions: { gap: 10, marginBottom: 16 },

    primaryBtn:     { backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    btnDisabled:    { opacity: 0.5 },

    syncBtn:     { backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    syncBtnText: { color: Colors.primary, fontWeight: '700', fontSize: 15 },

    disconnectBtn:     { paddingVertical: 12, alignItems: 'center' },
    disconnectBtnText: { color: '#ef4444', fontWeight: '600', fontSize: 14 },

    tipCard:  { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, borderLeftWidth: 3, borderLeftColor: Colors.primary },
    tipTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
    tipBody:  { fontSize: 12, color: Colors.textMuted, lineHeight: 18 },

    comingSoonCard:  { backgroundColor: '#f59e0b18', borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#f59e0b55', alignItems: 'center' },
    comingSoonIcon:  { fontSize: 28, marginBottom: 6 },
    comingSoonTitle: { fontSize: 14, fontWeight: '800', color: '#b45309', marginBottom: 6, textAlign: 'center' },
    comingSoonBody:  { fontSize: 12, color: '#92400e', lineHeight: 18, textAlign: 'center' },

    loadingMsg:    { fontSize: 12, color: Colors.primary, textAlign: 'center', marginBottom: 8, fontWeight: '600' },
    confirmCard:   { backgroundColor: Colors.surface, borderRadius: 14, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: Colors.primary + '40' },
    confirmTitle:  { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, marginBottom: 8 },
    confirmBody:   { fontSize: 13, color: Colors.textSecondary, lineHeight: 20, marginBottom: 14 },
});
