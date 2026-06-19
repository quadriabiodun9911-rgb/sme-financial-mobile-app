import React, { useState, useEffect } from 'react';
import {
    View, Text, TouchableOpacity, ScrollView,
    StyleSheet, Alert, ActivityIndicator, Platform,
} from 'react-native';
import { go, PNGME_RESPONSES } from '@pngme/react-native-sms-pngme-android';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Config } from '../config';

const STORAGE_KEY_STATUS   = 'pngme_connected';
const STORAGE_KEY_SYNCED   = 'pngme_synced_count';
const STORAGE_KEY_LAST_SYNC = 'pngme_last_sync';

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';

export default function ConnectBankScreen() {
    const { navigate, user, settings, addTransaction } = useApp() as any;

    const [status, setStatus]       = useState<ConnectionStatus>('idle');
    const [syncedCount, setSyncedCount] = useState(0);
    const [lastSynced, setLastSynced]   = useState<string | null>(null);
    const [loadingSync, setLoadingSync] = useState(false);

    const userEmail    = user?.email || '';
    const businessName = user?.businessName || 'My Business';
    const currency     = settings.currency || '₦';

    useEffect(() => {
        AsyncStorage.multiGet([STORAGE_KEY_STATUS, STORAGE_KEY_SYNCED, STORAGE_KEY_LAST_SYNC])
            .then(pairs => {
                const map = Object.fromEntries(pairs.map(([k, v]) => [k, v]));
                if (map[STORAGE_KEY_STATUS] === 'connected') setStatus('connected');
                if (map[STORAGE_KEY_SYNCED]) setSyncedCount(Number(map[STORAGE_KEY_SYNCED]));
                if (map[STORAGE_KEY_LAST_SYNC]) setLastSynced(map[STORAGE_KEY_LAST_SYNC]);
            })
            .catch(() => {});
    }, []);

    const handleConnect = async () => {
        if (!userEmail) {
            Alert.alert('Login required', 'Please log in before connecting your bank.');
            return;
        }

        if (Platform.OS === 'ios') {
            Alert.alert(
                'Android only',
                'SMS-based bank connection is only available on Android. This feature reads mobile money and bank SMS alerts.'
            );
            return;
        }

        setStatus('connecting');

        try {
            const response = await go({
                clientKey:   Config.PNGME_SDK_TOKEN,
                companyName: businessName,
                externalId:  userEmail,
                email:       userEmail,
            });

            if (response === PNGME_RESPONSES.SUCCESS) {
                setStatus('connected');
                await AsyncStorage.setItem(STORAGE_KEY_STATUS, 'connected');
                Alert.alert(
                    '✅ Connected!',
                    'Your bank/mobile money SMS data is now being processed. Tap "Sync Now" to import your transactions.'
                );
            } else if (response === PNGME_RESPONSES.ERROR) {
                setStatus('error');
                Alert.alert('Connection failed', 'Could not complete the bank connection. Please try again.');
            } else {
                // User cancelled
                setStatus('idle');
            }
        } catch (err: any) {
            setStatus('error');
            Alert.alert('Error', err.message || 'Something went wrong connecting to Pngme.');
        }
    };

    const handleSyncNow = async () => {
        if (!userEmail) return;
        setLoadingSync(true);

        try {
            const since = lastSynced ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
            const res = await fetch(
                `${Config.BACKEND_URL}/api/transactions/${encodeURIComponent(userEmail)}?since=${encodeURIComponent(since)}`
            );

            if (!res.ok) throw new Error(`Server error ${res.status} — is the backend deployed?`);

            const transactions: any[] = await res.json();
            const newCount = syncedCount + transactions.length;
            const now = new Date().toISOString();

            setSyncedCount(newCount);
            setLastSynced(now);
            await AsyncStorage.multiSet([
                [STORAGE_KEY_SYNCED, String(newCount)],
                [STORAGE_KEY_LAST_SYNC, now],
            ]);

            Alert.alert(
                'Sync complete',
                transactions.length > 0
                    ? `${transactions.length} new transaction(s) imported from your bank/mobile money.`
                    : 'No new transactions since last sync.'
            );
        } catch (err: any) {
            Alert.alert('Sync error', err.message);
        } finally {
            setLoadingSync(false);
        }
    };

    const handleDisconnect = () => {
        Alert.alert(
            'Disconnect accounts',
            'This will stop syncing transactions from your bank/mobile money. Your existing transactions will not be deleted.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Disconnect',
                    style: 'destructive',
                    onPress: async () => {
                        setStatus('idle');
                        setSyncedCount(0);
                        setLastSynced(null);
                        await AsyncStorage.multiRemove([STORAGE_KEY_STATUS, STORAGE_KEY_SYNCED, STORAGE_KEY_LAST_SYNC]);
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
                    <Text style={styles.title}>🏦 Connect Bank</Text>
                    <Text style={styles.subtitle}>Auto-import transactions via Pngme</Text>
                </View>
            </View>

            {/* Status card */}
            <View style={[styles.statusCard, status === 'connected' ? styles.statusConnected : styles.statusIdle]}>
                <View style={styles.statusRow}>
                    <View style={[styles.dot, status === 'connected' ? styles.dotGreen : styles.dotGrey]} />
                    <Text style={styles.statusText}>
                        {status === 'idle'       && 'Not connected'}
                        {status === 'connecting' && 'Connecting…'}
                        {status === 'connected'  && 'Connected'}
                        {status === 'error'      && 'Connection error'}
                    </Text>
                </View>
                {status === 'connected' && lastSynced && (
                    <Text style={styles.lastSynced}>
                        Last synced: {new Date(lastSynced).toLocaleString()}
                    </Text>
                )}
                {status === 'connected' && syncedCount > 0 && (
                    <Text style={styles.syncCount}>{syncedCount} transactions imported</Text>
                )}
            </View>

            {/* What Pngme does */}
            {status === 'idle' && (
                <View style={styles.infoCard}>
                    <Text style={styles.infoTitle}>How it works</Text>
                    {[
                        { icon: '📱', text: 'Reads your bank & mobile money SMS alerts (M-Pesa, MTN MoMo, Airtel, bank alerts)' },
                        { icon: '🔄', text: 'Automatically imports sales and expenses into Quad360' },
                        { icon: '📊', text: 'Reconciles payments against your invoices' },
                        { icon: '🔒', text: 'Powered by Pngme — read-only access, no login credentials shared' },
                    ].map((item, i) => (
                        <View key={i} style={styles.infoRow}>
                            <Text style={styles.infoIcon}>{item.icon}</Text>
                            <Text style={styles.infoText}>{item.text}</Text>
                        </View>
                    ))}
                </View>
            )}

            {/* Connected summary */}
            {status === 'connected' && (
                <View style={styles.accountsCard}>
                    <Text style={styles.sectionTitle}>Connection Active</Text>
                    <View style={styles.accountRow}>
                        <View style={styles.accountIcon}>
                            <Text style={{ fontSize: 20 }}>📱</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.accountName}>SMS Bank & Mobile Money</Text>
                            <Text style={styles.accountType}>M-Pesa · MTN MoMo · Bank alerts</Text>
                        </View>
                        <Text style={styles.accountCount}>{syncedCount} txns</Text>
                    </View>
                </View>
            )}

            {/* Supported providers */}
            <View style={styles.providersCard}>
                <Text style={styles.sectionTitle}>Supported Providers</Text>
                <View style={styles.providerGrid}>
                    {['🇳🇬 GTBank', '🇳🇬 Access', '🇳🇬 Zenith', '🇳🇬 MTN MoMo', '🇰🇪 M-Pesa', '🇬🇭 GCB', '🇿🇦 FNB', '🇿🇦 Standard Bank', '🇺🇬 Airtel', '🇷🇼 Bank of Kigali', '+ 300 more'].map((p, i) => (
                        <View key={i} style={styles.providerChip}>
                            <Text style={styles.providerText}>{p}</Text>
                        </View>
                    ))}
                </View>
            </View>

            {/* Actions */}
            <View style={styles.actions}>
                {status !== 'connected' ? (
                    <TouchableOpacity
                        style={styles.primaryBtn}
                        onPress={handleConnect}
                        disabled={status === 'connecting'}
                    >
                        {status === 'connecting'
                            ? <ActivityIndicator color="#fff" />
                            : <Text style={styles.primaryBtnText}>🔗  Connect My Bank / Mobile Money</Text>
                        }
                    </TouchableOpacity>
                ) : (
                    <>
                        <TouchableOpacity
                            style={styles.syncBtn}
                            onPress={handleSyncNow}
                            disabled={loadingSync}
                        >
                            {loadingSync
                                ? <ActivityIndicator color={Colors.primary} />
                                : <Text style={styles.syncBtnText}>🔄  Sync Now</Text>
                            }
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect}>
                            <Text style={styles.disconnectBtnText}>Disconnect</Text>
                        </TouchableOpacity>
                    </>
                )}
            </View>

            {/* Android-only notice for iOS users */}
            {Platform.OS === 'ios' && (
                <View style={styles.tipCard}>
                    <Text style={styles.tipTitle}>📱 Android only</Text>
                    <Text style={styles.tipBody}>
                        SMS-based bank connection works on Android devices only. Pngme reads mobile money and bank SMS alerts to import your transactions automatically.
                    </Text>
                </View>
            )}

            {/* Backend sync tip */}
            {status === 'connected' && (
                <View style={styles.tipCard}>
                    <Text style={styles.tipTitle}>💡 How syncing works</Text>
                    <Text style={styles.tipBody}>
                        Pngme sends your transaction data to the Quad360 backend automatically. Tap "Sync Now" anytime to pull the latest transactions into your records.
                    </Text>
                </View>
            )}
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

    statusCard: {
        borderRadius: 14,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
    },
    statusIdle:      { backgroundColor: Colors.surface, borderColor: Colors.border },
    statusConnected: { backgroundColor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.3)' },

    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dot:       { width: 10, height: 10, borderRadius: 5 },
    dotGreen:  { backgroundColor: '#22c55e' },
    dotGrey:   { backgroundColor: Colors.textMuted },
    statusText: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
    lastSynced: { fontSize: 11, color: Colors.textMuted, marginTop: 6 },
    syncCount:  { fontSize: 12, color: '#22c55e', fontWeight: '600', marginTop: 4 },

    infoCard:  { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 14 },
    infoTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 12 },
    infoRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
    infoIcon:  { fontSize: 18, width: 26 },
    infoText:  { flex: 1, fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },

    accountsCard: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 14 },
    sectionTitle: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
    accountRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
    accountIcon:  { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' },
    accountName:  { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
    accountType:  { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
    accountCount: { fontSize: 12, color: Colors.textMuted },

    providersCard: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 16 },
    providerGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    providerChip:  { backgroundColor: Colors.bg, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: Colors.border },
    providerText:  { fontSize: 11, color: Colors.textSecondary },

    actions: { gap: 10, marginBottom: 16 },

    primaryBtn:     { backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

    syncBtn:     { backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    syncBtnText: { color: Colors.primary, fontWeight: '700', fontSize: 15 },

    disconnectBtn:     { paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
    disconnectBtnText: { color: Colors.danger ?? '#ef4444', fontWeight: '600', fontSize: 14 },

    tipCard:  { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, borderLeftWidth: 3, borderLeftColor: '#f97316' },
    tipTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
    tipBody:  { fontSize: 12, color: Colors.textMuted, lineHeight: 18, marginBottom: 10 },
    tipLink:  { fontSize: 13, color: Colors.primary, fontWeight: '700' },
});
