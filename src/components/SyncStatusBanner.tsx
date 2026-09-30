import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Colors } from '../theme/colors';
import { subscribeOfflineSyncStatus, OfflineSyncStatus } from '../utils/offlineSync';

// Non-blocking, self-dismissing — unlike AlertHost's modal, this must never
// stop the owner from using the app while offline changes sync in the
// background. 'synced' auto-clears itself (see offlineSync.ts); 'error'
// stays until the next connectivity change resolves it, worded as a
// pending retry rather than a failure since flushQueue already retries
// each op up to 10 times before giving up.
export default function SyncStatusBanner() {
    const [status, setStatus] = useState<OfflineSyncStatus>({ phase: 'idle' });

    useEffect(() => subscribeOfflineSyncStatus(setStatus), []);

    if (status.phase === 'idle') return null;

    const label =
        status.phase === 'syncing' ? `Syncing ${status.total} offline change${status.total === 1 ? '' : 's'}…` :
        status.phase === 'synced'  ? `✓ ${status.count} offline change${status.count === 1 ? '' : 's'} synced` :
        `${status.failed} change${status.failed === 1 ? '' : 's'} will retry when back online`;

    const backgroundColor = status.phase === 'error' ? Colors.warning : Colors.primary;

    return (
        <View style={[styles.banner, { backgroundColor }]} pointerEvents="none">
            <Text style={styles.text}>{label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    banner: {
        position: 'absolute',
        top: Platform.OS === 'web' ? 12 : 48,
        alignSelf: 'center',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        zIndex: 999,
        elevation: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
    },
    text: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
    },
});
