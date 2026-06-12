import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { FinanceData, Transaction } from '../types';
import { computeAgingBuckets } from '../utils/finance';

interface Props {
    finance: FinanceData;
    transactions: Transaction[];
    currency: string;
    minReserve: string;
}

export default function CashManagement({ finance, transactions, currency, minReserve }: Props) {
    const reserve = parseFloat(minReserve) || 0;
    const surplusShortfall = finance.cashBalance - reserve;
    const coverageRatio    = reserve > 0 ? finance.cashBalance / reserve : null;

    const arBuckets = useMemo(() => computeAgingBuckets(transactions, 'income'),  [transactions]);
    const apBuckets = useMemo(() => computeAgingBuckets(transactions, 'expense'), [transactions]);

    const totalAR = arBuckets.reduce((s, b) => s + b.total, 0);
    const totalAP = apBuckets.reduce((s, b) => s + b.total, 0);

    // Cash position if all AR collected
    const potentialCash = finance.cashBalance + totalAR;

    // Upcoming 30-day pressure (current bucket AP)
    const upcomingAP = apBuckets[0]?.total ?? 0;

    const cashAfterObligations = finance.cashBalance - upcomingAP;

    const getHealthColor = (val: number, threshold: number) =>
        val >= threshold ? Colors.income : val >= threshold * 0.5 ? Colors.warning : Colors.expense;

    return (
        <View>
            {/* Cash status */}
            <View style={styles.statusCard}>
                <Text style={styles.statusLabel}>Current Cash Balance</Text>
                <Text style={[styles.statusAmount, { color: Colors.income }]}>
                    {currency}{finance.cashBalance.toLocaleString()}
                </Text>
                <View style={[styles.statusBadge, {
                    backgroundColor: surplusShortfall >= 0
                        ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                }]}>
                    <Text style={[styles.statusBadgeText, { color: surplusShortfall >= 0 ? Colors.income : Colors.expense }]}>
                        {surplusShortfall >= 0
                            ? `${currency}${surplusShortfall.toLocaleString()} above minimum reserve`
                            : `${currency}${Math.abs(surplusShortfall).toLocaleString()} below minimum reserve`}
                    </Text>
                </View>
            </View>

            {/* Key ratios */}
            <View style={styles.ratioRow}>
                <RatioCard
                    label="Cash Reserve Coverage"
                    value={coverageRatio !== null ? `${coverageRatio.toFixed(2)}×` : 'N/A'}
                    sub={`Min reserve: ${currency}${reserve.toLocaleString()}`}
                    color={getHealthColor(finance.cashBalance, reserve)}
                />
                <RatioCard
                    label="After 30-day AP"
                    value={`${currency}${cashAfterObligations.toLocaleString()}`}
                    sub={`${currency}${upcomingAP.toLocaleString()} due in 30 days`}
                    color={getHealthColor(cashAfterObligations, reserve)}
                />
            </View>

            {/* AR / AP positions */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Working Capital</Text>
                <Row label="Outstanding Receivables (AR)" value={`${currency}${totalAR.toLocaleString()}`} color={Colors.income} />
                <Row label="Outstanding Payables (AP)"    value={`${currency}${totalAP.toLocaleString()}`} color={Colors.expense} />
                <Row label="Net Working Capital"           value={`${currency}${(totalAR - totalAP).toLocaleString()}`} color={(totalAR - totalAP) >= 0 ? Colors.income : Colors.expense} />
                <Row label="Potential Cash (if AR collected)" value={`${currency}${potentialCash.toLocaleString()}`} color={Colors.primary} />
            </View>

            {/* AR aging breakdown */}
            {totalAR > 0 && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Receivables Aging</Text>
                    {arBuckets.map((b, i) => {
                        if (b.total === 0) return null;
                        const pct = totalAR > 0 ? (b.total / totalAR) * 100 : 0;
                        const barColor = i === 0 ? Colors.income : i === 1 ? Colors.warning : Colors.expense;
                        return (
                            <View key={b.label} style={styles.barRow}>
                                <Text style={styles.barLabel}>{b.label}</Text>
                                <View style={styles.barTrack}>
                                    <View style={[styles.barFill, { width: `${pct}%` as any, backgroundColor: barColor }]} />
                                </View>
                                <Text style={[styles.barAmt, { color: barColor }]}>{currency}{b.total.toLocaleString()}</Text>
                            </View>
                        );
                    })}
                    <Text style={styles.hint}>Collect aged receivables to improve cash position immediately.</Text>
                </View>
            )}

            {/* Recommendations */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Cash Flow Actions</Text>
                {surplusShortfall < 0 && (
                    <ActionItem color={Colors.expense} text={`Cash is ${currency}${Math.abs(surplusShortfall).toLocaleString()} below your minimum reserve. Prioritise collecting outstanding AR or reducing near-term expenses.`} />
                )}
                {totalAR > 0 && (
                    <ActionItem color={Colors.warning} text={`Collecting all outstanding receivables (${currency}${totalAR.toLocaleString()}) would bring cash to ${currency}${potentialCash.toLocaleString()}.`} />
                )}
                {upcomingAP > 0 && (
                    <ActionItem color={Colors.warning} text={`${currency}${upcomingAP.toLocaleString()} in payables are due within 30 days. Ensure sufficient liquidity before then.`} />
                )}
                {surplusShortfall >= 0 && totalAR === 0 && (
                    <ActionItem color={Colors.income} text="Cash position is healthy and above reserve. Consider deploying surplus into growth or short-term investments." />
                )}
            </View>
        </View>
    );
}

function RatioCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
    return (
        <View style={ratioStyles.card}>
            <Text style={ratioStyles.label}>{label}</Text>
            <Text style={[ratioStyles.value, { color }]}>{value}</Text>
            <Text style={ratioStyles.sub}>{sub}</Text>
        </View>
    );
}

function Row({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <View style={rowStyles.row}>
            <Text style={rowStyles.label}>{label}</Text>
            <Text style={[rowStyles.value, { color }]}>{value}</Text>
        </View>
    );
}

function ActionItem({ color, text }: { color: string; text: string }) {
    return (
        <View style={[actionStyles.item, { borderLeftColor: color }]}>
            <Text style={actionStyles.text}>{text}</Text>
        </View>
    );
}

const ratioStyles = StyleSheet.create({
    card:  { flex: 1, backgroundColor: Colors.bg, borderRadius: 10, padding: 12, alignItems: 'center' },
    label: { fontSize: 10, color: Colors.textMuted, textAlign: 'center', marginBottom: 6, lineHeight: 14 },
    value: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
    sub:   { fontSize: 10, color: Colors.textMuted, textAlign: 'center' },
});

const rowStyles = StyleSheet.create({
    row:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
    label: { fontSize: 13, color: Colors.textSecondary, flex: 1, marginRight: 8 },
    value: { fontSize: 13, fontWeight: '600' },
});

const actionStyles = StyleSheet.create({
    item: { borderLeftWidth: 3, paddingLeft: 10, marginBottom: 10 },
    text: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
});

const styles = StyleSheet.create({
    statusCard:      { backgroundColor: Colors.surface, borderRadius: 12, padding: 20, marginBottom: 12, alignItems: 'center' },
    statusLabel:     { fontSize: 12, color: Colors.textMuted, marginBottom: 6 },
    statusAmount:    { fontSize: 30, fontWeight: 'bold', marginBottom: 8 },
    statusBadge:     { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10 },
    statusBadgeText: { fontSize: 12, fontWeight: '600' },

    ratioRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },

    card:      { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12 },
    cardTitle: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 12 },

    barRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
    barLabel: { fontSize: 10, color: Colors.textMuted, width: 100 },
    barTrack: { flex: 1, height: 8, backgroundColor: Colors.bg, borderRadius: 4, overflow: 'hidden' },
    barFill:  { height: 8, borderRadius: 4, minWidth: 2 },
    barAmt:   { fontSize: 11, fontWeight: '600', width: 70, textAlign: 'right' },
    hint:     { fontSize: 11, color: Colors.textMuted, marginTop: 8, fontStyle: 'italic' },
});
