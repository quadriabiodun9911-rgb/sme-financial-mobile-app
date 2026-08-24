import React, { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { Radius, Spacing } from '../theme/tokens';
import Icon from '../components/ui/Icon';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { loadRecentAuditLogs, describeAuditLog, AuditLogRecord } from '../utils/auditLog';

const SEVERITY_COLOR: Record<AuditLogRecord['severity'], string> = {
    low: Colors.textMuted,
    medium: Colors.warning,
    high: Colors.expense,
};

function formatEntryDate(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const datePart = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    const timePart = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return `${datePart} — ${timePart}`;
}

export default function AuditLogScreen() {
    const [entries, setEntries] = useState<AuditLogRecord[] | null>(null);

    useEffect(() => {
        let cancelled = false;
        loadRecentAuditLogs(100).then(rows => { if (!cancelled) setEntries(rows); });
        return () => { cancelled = true; };
    }, []);

    return (
        <SafeAreaView style={styles.safe}>
            <Header />
            <ScrollView style={styles.scroll} contentContainerStyle={styles.pad}>
                <Text style={styles.title}>Activity Log</Text>
                <Text style={styles.subtitle}>
                    A record of security-relevant actions on your account — logins, PIN changes, team changes, data exports and imports.
                    This shows your own activity; a teammate's actions appear only in their own log.
                </Text>

                {entries === null ? (
                    <View style={styles.emptyCard}>
                        <ActivityIndicator color={Colors.primary} />
                    </View>
                ) : entries.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <Icon name="shield" size={28} color={Colors.textMuted} />
                        <Text style={styles.emptyTitle}>No Activity Yet</Text>
                        <Text style={styles.emptyText}>Security-relevant actions on this account will show up here.</Text>
                    </View>
                ) : (
                    entries.map(entry => (
                        <View key={entry.id} style={styles.row}>
                            <View style={[styles.dot, { backgroundColor: SEVERITY_COLOR[entry.severity] }]} />
                            <View style={{ flex: 1 }}>
                                <Text style={styles.rowLabel}>{describeAuditLog(entry)}</Text>
                                <Text style={styles.rowDate}>{formatEntryDate(entry.timestamp)}</Text>
                            </View>
                        </View>
                    ))
                )}
            </ScrollView>
            <FooterNav />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: Spacing.lg, paddingBottom: 100, width: '100%', maxWidth: 560, alignSelf: 'center' },
    title: { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 6 },
    subtitle: { fontSize: 13, color: Colors.textMuted, lineHeight: 19, marginBottom: Spacing.lg },
    emptyCard: {
        alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.lg,
        padding: Spacing.xl, gap: 8,
    },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
    emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },
    row: {
        flexDirection: 'row', alignItems: 'flex-start', backgroundColor: Colors.surface,
        borderRadius: Radius.md, padding: Spacing.md, marginBottom: 8, gap: 10,
    },
    dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
    rowLabel: { fontSize: 14, color: Colors.textPrimary, fontWeight: '600' },
    rowDate: { fontSize: 11.5, color: Colors.textMuted, marginTop: 2 },
});
