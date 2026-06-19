import React, { useState, useEffect } from 'react';
import {
    View, Text, TouchableOpacity, ScrollView,
    StyleSheet, Alert, ActivityIndicator, Platform, Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Config } from '../config';

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
    const { navigate, user, settings } = useApp();

    const [connection, setConnection]   = useState<ConnectionState | null>(null);
    const [loading, setLoading]         = useState(false);
    const [syncing, setSyncing]         = useState(false);
    const [accounts, setAccounts]       = useState<any[]>([]);
    const [providerName, setProviderName] = useState('');

    const currency     = (settings as any).currencyCode || 'NGN';
    const userEmail    = user?.email || '';
    const businessName = user?.businessName || 'My Business';

    useEffect(() => {
        AsyncStorage.getItem(STORAGE_KEY).then(raw => {
            if (raw) setConnection(JSON.parse(raw));
        }).catch(() => {});
        // Resolve provider from local map — no async needed
        setProviderName(CURRENCY_PROVIDER_MAP[currency] || 'pngme');
    }, [currency]);

    const providerInfo = PROVIDER_INFO[providerName] || PROVIDER_INFO['pngme'];

    const handleConnect = async () => {
        if (!userEmail) {
            Alert.alert('Login required', 'Please log in first.');
            return;
        }

        // Pngme requires Android native SDK
        if (providerName === 'pngme') {
            if (Platform.OS !== 'android') {
                Alert.alert(
                    'Android only',
                    'SMS-based bank connection (Pngme) only works on Android devices. For Kenya, Uganda, Tanzania and other East African markets, use the Quad360 Android app.',
                );
                return;
            }
            navigate('connect-bank' as any);
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`${Config.BACKEND_URL}/api/bank-data/connect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: userEmail, currencyCode: currency, businessName, name: businessName, email: userEmail }),
            });

            if (!res.ok) throw new Error(`Server error ${res.status} — make sure MONO_SECRET_KEY / LEAN_APP_TOKEN / PLAID_SECRET is set on Render.`);
            const data = await res.json();

            // Mono — open Connect widget URL in browser
            if (data.monoConnectUrl) {
                await Linking.openURL(data.monoConnectUrl);
                Alert.alert(
                    'Complete connection in browser',
                    'After you connect your bank in the Mono widget, come back and tap "I\'ve connected" to finish.',
                    [{ text: "I've connected", onPress: () => saveConnection(data.provider || 'mono') }]
                );
                setLoading(false);
                return;
            }

            // Plaid — open Link widget URL in browser
            if (data.linkToken) {
                await Linking.openURL(`https://cdn.plaid.com/link/v2/stable/link.html?token=${data.linkToken}`);
                Alert.alert(
                    'Complete connection in browser',
                    'After you connect your bank via Plaid Link, come back and tap "I\'ve connected".',
                    [{ text: "I've connected", onPress: () => saveConnection('plaid') }]
                );
                setLoading(false);
                return;
            }

            // Lean — open Link widget URL in browser
            if (data.customerId) {
                const leanUrl = `https://cdn.leantech.me/link/loader/prod/ae/latest/index.html?customer_id=${data.customerId}`;
                await Linking.openURL(leanUrl);
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
            setLoading(false);
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

            const res = await fetch(
                `${Config.BACKEND_URL}/api/bank-data/transactions/${encodeURIComponent(userEmail)}?currencyCode=${currency}&since=${encodeURIComponent(since)}`
            );

            if (!res.ok) throw new Error(`Sync error ${res.status}`);
            const txns: any[] = await res.json();

            const updated: ConnectionState = {
                ...connection,
                lastSynced: new Date().toISOString(),
                syncedCount: (connection.syncedCount || 0) + txns.length,
            };
            setConnection(updated);
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

            Alert.alert(
                'Sync complete',
                txns.length > 0
                    ? `${txns.length} transaction(s) imported from ${providerInfo.name}.`
                    : 'No new transactions since last sync.'
            );
        } catch (err: any) {
            Alert.alert('Sync failed', err.message);
        } finally {
            setSyncing(false);
        }
    };

    const handleDisconnect = () => {
        Alert.alert(
            'Disconnect',
            'Stop syncing from this bank connection? Existing transactions will not be deleted.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Disconnect', style: 'destructive',
                    onPress: async () => {
                        setConnection(null);
                        setAccounts([]);
                        await AsyncStorage.removeItem(STORAGE_KEY);
                    },
                },
            ]
        );
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigate('settings')}>
                    <Text style={styles.backBtn}>← Back</Text>
                </TouchableOpacity>
                <View>
                    <Text style={styles.title}>🏦 Bank Connection</Text>
                    <Text style={styles.subtitle}>Auto-import your transactions</Text>
                </View>
            </View>

            {/* Active provider card */}
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

            {/* Connection stats */}
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

            {/* How it works */}
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

            {/* All providers */}
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

            {/* Actions */}
            <View style={styles.actions}>
                {!connection ? (
                    <TouchableOpacity
                        style={[styles.primaryBtn, loading && styles.btnDisabled]}
                        onPress={handleConnect}
                        disabled={loading}
                    >
                        {loading
                            ? <ActivityIndicator color="#fff" />
                            : <Text style={styles.primaryBtnText}>🔗  Connect via {providerInfo.name}</Text>
                        }
                    </TouchableOpacity>
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

            {/* Tip */}
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
});
