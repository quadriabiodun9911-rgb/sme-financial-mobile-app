import React, { useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, bandColor } from '../theme/colors';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';

const LENDERS = [
    { id: 'moniepoint', name: 'Moniepoint', icon: 'card-outline' as const },
    { id: 'carbon', name: 'Carbon', icon: 'flash-outline' as const },
    { id: 'zenith', name: 'Zenith Bank', icon: 'business-outline' as const },
    { id: 'access', name: 'Access Bank', icon: 'business-outline' as const },
];

export default function LenderPortalScreen() {
    const { creditResult, user } = useApp();
    const [shared, setShared] = useState<Record<string, boolean>>({});

    const shareWith = (lenderId: string, lenderName: string) => {
        setShared((prev) => ({ ...prev, [lenderId]: true }));
        Alert.alert(
            'Report shared',
            `${lenderName} now has read-only access to ${user?.businessName}'s Credit Readiness Score (${creditResult.overallScore}) and financial report. This reduces their due diligence time and can unlock better rates.`,
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scroll}>
                <Text style={styles.title}>Lender Portal</Text>
                <Text style={styles.subtitle}>Share your bankable proof with one tap</Text>

                <Card style={styles.summaryCard}>
                    <View>
                        <Text style={styles.summaryLabel}>Credit Readiness Score</Text>
                        <Text style={[styles.summaryScore, { color: bandColor(creditResult.band) }]}>
                            {creditResult.overallScore} · {creditResult.band}
                        </Text>
                    </View>
                    <TouchableOpacity style={styles.reportButton} onPress={() => Alert.alert('Report generated', 'A lender-ready PDF financial report has been generated from your latest data.')}>
                        <Ionicons name="document-text-outline" size={16} color={colors.background} />
                        <Text style={styles.reportButtonText}>Generate report</Text>
                    </TouchableOpacity>
                </Card>

                <Text style={styles.sectionTitle}>Connected lenders</Text>
                {LENDERS.map((lender) => (
                    <Card key={lender.id} style={styles.lenderRow}>
                        <View style={styles.lenderInfo}>
                            <Ionicons name={lender.icon} size={20} color={colors.primary} />
                            <Text style={styles.lenderName}>{lender.name}</Text>
                        </View>
                        {shared[lender.id] ? (
                            <View style={styles.sharedBadge}>
                                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                                <Text style={styles.sharedText}>Shared</Text>
                            </View>
                        ) : (
                            <TouchableOpacity style={styles.shareButton} onPress={() => shareWith(lender.id, lender.name)}>
                                <Text style={styles.shareButtonText}>Share</Text>
                            </TouchableOpacity>
                        )}
                    </Card>
                ))}

                <Text style={styles.footnote}>
                    CashClear-certified businesses give lenders a verified, real-time picture of creditworthiness, cutting
                    due diligence costs and enabling better rates.
                </Text>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { padding: 20, paddingBottom: 40, gap: 14 },
    title: { color: colors.text, fontSize: 22, fontWeight: '700' },
    subtitle: { color: colors.textMuted, fontSize: 12, marginBottom: 4 },
    summaryCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
    summaryLabel: { color: colors.textMuted, fontSize: 12 },
    summaryScore: { fontSize: 20, fontWeight: '800', marginTop: 4 },
    reportButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
    reportButtonText: { color: colors.background, fontWeight: '700', fontSize: 12 },
    sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 8 },
    lenderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    lenderInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    lenderName: { color: colors.text, fontSize: 14, fontWeight: '600' },
    shareButton: { borderWidth: 1, borderColor: colors.primary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
    shareButtonText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
    sharedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    sharedText: { color: colors.success, fontSize: 12, fontWeight: '600' },
    footnote: { color: colors.textFaint, fontSize: 11, marginTop: 12, lineHeight: 16, textAlign: 'center' },
});
