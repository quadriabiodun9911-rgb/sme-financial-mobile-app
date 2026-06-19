import React, { useState, useEffect } from 'react';
import {
    View, Text, TouchableOpacity, ScrollView,
    StyleSheet, Alert, ActivityIndicator, Linking,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';

// Replace with your deployed Railway/Render backend URL
const BACKEND_URL = 'https://your-quad360-backend.railway.app';

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';

interface ConnectedAccount {
    institutionName: string;
    accountType: string;
    connectedAt: string;
    transactionCount: number;
}

export default function ConnectBankScreen() {
    const { navigate, user, settings } = useApp();

    const [status, setStatus]                   = useState<ConnectionStatus>('idle');
    const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([]);
    const [syncedCount, setSyncedCount]         = useState(0);
    const [lastSynced, setLastSynced]           = useState<string | null>(null);
    const [loadingSync, setLoadingSync]         = useState(false);

    const currency     = settings.currency || '₦';
    const userEmail    = user?.email || '';
    const businessName = user?.businessName || 'My Business';

    useEffect(() => {
        // In a real app: load saved connection status from AsyncStorage
        // and fetch latest sync info from backend
    }, []);

    const handleConnect = async () => {
        if (!userEmail) {
            Alert.alert('Login required', 'Please log in before connecting your bank.');
            return;
        }

        setStatus('connecting');

        try {
            // Step 1: Register user with backend → get Pngme widget URL
            const res = await fetch(`${BACKEND_URL}/api/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: userEmail, businessName }),
            });

            if (!res.ok) throw new Error('Backend error: ' + res.status);

            const { widgetUrl } = await res.json();

            // Step 2: Open Pngme widget in browser (user grants SMS/bank access)
            await Linking.openURL(widgetUrl);

            // Pngme will call your webhook once the user completes the flow.
            // The app polls for transactions after the user returns.
            setStatus('connected');
            setConnectedAccounts([
                {
                    institutionName: 'Connecting…',
                    accountType: 'mobile money / bank',
                    connectedAt: new Date().toISOString(),
                    transactionCount: 0,
                },
            ]);
        } catch (err: any) {
            setStatus('error');
            Alert.alert(
                'Connection failed',
                err.message?.includes('Backend')
                    ? 'Could not reach the Quad360 server. Check your internet connection.'
                    : 'Could not open Pngme. Make sure your backend URL is configured.'
            );
        }
    };

    const handleSyncNow = async () => {
        if (!userEmail) return;
        setLoadingSync(true);

        try {
            const since = lastSynced ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const res = await fetch(
                `${BACKEND_URL}/api/transactions/${encodeURIComponent(userEmail)}?since=${encodeURIComponent(since)}`
            );

            if (!res.ok) throw new Error('Sync failed: ' + res.status);

            const transactions: any[] = await res.json();

            // TODO (Phase 2): merge these into AppContext transactions
            setSyncedCount(prev => prev + transactions.length);
            setLastSynced(new Date().toISOString());

            Alert.alert(
                'Sync complete',
                transactions.length > 0
                    ? `${transactions.length} new transaction(s) fetched.`
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
                    onPress: () => {
                        setStatus('idle');
                        setConnectedAccounts([]);
                        setSyncedCount(0);
                        setLastSynced(null);
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

            {/* Connected accounts list */}
            {status === 'connected' && connectedAccounts.length > 0 && (
                <View style={styles.accountsCard}>
                    <Text style={styles.sectionTitle}>Connected Accounts</Text>
                    {connectedAccounts.map((acc, i) => (
                        <View key={i} style={styles.accountRow}>
                            <View style={styles.accountIcon}>
                                <Text style={{ fontSize: 20 }}>🏛</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.accountName}>{acc.institutionName}</Text>
                                <Text style={styles.accountType}>{acc.accountType}</Text>
                            </View>
                            <Text style={styles.accountCount}>{acc.transactionCount} txns</Text>
                        </View>
                    ))}
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
                {status === 'idle' || status === 'error' ? (
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

            {/* Backend config notice */}
            <View style={styles.tipCard}>
                <Text style={styles.tipTitle}>⚙️ Backend Required</Text>
                <Text style={styles.tipBody}>
                    Pngme requires a backend server to receive transaction webhooks. Deploy the Quad360 backend to Railway and update BACKEND_URL in ConnectBankScreen.tsx before this feature goes live.
                </Text>
                <TouchableOpacity onPress={() => Linking.openURL('https://railway.app')}>
                    <Text style={styles.tipLink}>Deploy on Railway →</Text>
                </TouchableOpacity>
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
