import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { ProfitDriver } from '../utils/profitability';

interface Props {
    drivers: ProfitDriver[];
    currency: string;
}

function fmt(value: number, currency: string): string {
    const abs = Math.abs(value);
    const sign = value >= 0 ? '+' : '-';
    if (abs >= 1_000_000) return `${sign}${currency}${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000)     return `${sign}${currency}${(abs / 1_000).toFixed(1)}K`;
    return `${sign}${currency}${abs.toFixed(0)}`;
}

export default function ProfitDriversInsights({ drivers, currency }: Props) {
    const positives = drivers.filter(d => d.impact > 0);
    const negatives = drivers.filter(d => d.impact <= 0);

    const topAction = positives.length > 0 ? positives[0] : null;
    const avgImpact = topAction
        ? (topAction.impact / Math.max(positives.length, 1))
        : 0;

    if (drivers.length === 0) {
        return (
            <View style={styles.card}>
                <Text style={styles.title}>WHAT'S DRIVING PROFIT</Text>
                <Text style={styles.empty}>
                    Add transactions to see profit driver analysis.
                </Text>
            </View>
        );
    }

    return (
        <View style={styles.card}>
            <Text style={styles.title}>WHAT'S DRIVING PROFIT</Text>

            {positives.length > 0 && (
                <>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionIcon}>📈</Text>
                        <Text style={[styles.sectionLabel, { color: Colors.income }]}>
                            PROFIT DRIVERS (positive)
                        </Text>
                    </View>
                    <View style={styles.divider} />
                    {positives.map((driver, idx) => (
                        <View key={idx} style={styles.driverRow}>
                            <Text style={[styles.checkmark, { color: Colors.income }]}>✓</Text>
                            <View style={styles.driverText}>
                                <Text style={styles.driverTitle}>
                                    {driver.title}
                                    {'  '}
                                    <Text style={[styles.driverImpact, { color: Colors.income }]}>
                                        {fmt(driver.impact, currency)}
                                    </Text>
                                </Text>
                                <Text style={styles.driverDesc}>{driver.description}</Text>
                            </View>
                        </View>
                    ))}
                </>
            )}

            {negatives.length > 0 && (
                <>
                    <View style={[styles.sectionHeader, positives.length > 0 && { marginTop: 12 }]}>
                        <Text style={styles.sectionIcon}>📉</Text>
                        <Text style={[styles.sectionLabel, { color: Colors.expense }]}>
                            HEADWINDS (negative)
                        </Text>
                    </View>
                    <View style={styles.divider} />
                    {negatives.map((driver, idx) => (
                        <View key={idx} style={styles.driverRow}>
                            <Text style={[styles.checkmark, { color: Colors.expense }]}>✗</Text>
                            <View style={styles.driverText}>
                                <Text style={styles.driverTitle}>
                                    {driver.title}
                                    {'  '}
                                    <Text style={[styles.driverImpact, { color: Colors.expense }]}>
                                        {fmt(driver.impact, currency)}
                                    </Text>
                                </Text>
                                <Text style={styles.driverDesc}>{driver.description}</Text>
                            </View>
                        </View>
                    ))}
                </>
            )}

            {topAction && (
                <>
                    <View style={styles.divider} />
                    <View style={styles.topActionCard}>
                        <Text style={styles.topActionHeader}>💡 TOP ACTION</Text>
                        <Text style={styles.topActionText}>
                            Scale {topAction.title.toLowerCase()}:
                        </Text>
                        <Text style={styles.topActionMetric}>
                            Avg impact = {fmt(avgImpact, currency)} per driver
                        </Text>
                    </View>
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: Colors.surface,
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    title: {
        color: Colors.textMuted,
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 0.8,
        marginBottom: 12,
    },
    empty: {
        color: Colors.textMuted,
        fontSize: 13,
        textAlign: 'center',
        paddingVertical: 16,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 4,
    },
    sectionIcon: {
        fontSize: 14,
    },
    sectionLabel: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.6,
    },
    divider: {
        height: 1,
        backgroundColor: Colors.border,
        marginVertical: 8,
    },
    driverRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 10,
        gap: 8,
    },
    checkmark: {
        fontSize: 14,
        fontWeight: '700',
        marginTop: 1,
    },
    driverText: {
        flex: 1,
    },
    driverTitle: {
        color: Colors.textPrimary,
        fontSize: 13,
        fontWeight: '600',
        marginBottom: 2,
    },
    driverImpact: {
        fontSize: 12,
        fontWeight: '700',
    },
    driverDesc: {
        color: Colors.textSecondary,
        fontSize: 12,
        lineHeight: 17,
    },
    topActionCard: {
        backgroundColor: Colors.bg,
        borderRadius: 8,
        padding: 12,
        borderLeftWidth: 3,
        borderLeftColor: Colors.warning,
    },
    topActionHeader: {
        color: Colors.warning,
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.6,
        marginBottom: 6,
    },
    topActionText: {
        color: Colors.textPrimary,
        fontSize: 13,
        fontWeight: '600',
        marginBottom: 4,
    },
    topActionMetric: {
        color: Colors.textSecondary,
        fontSize: 12,
    },
});
