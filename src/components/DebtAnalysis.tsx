import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { FinanceData } from '../types';

interface Props {
    finance: FinanceData;
    currency: string;
}

function healthColor(score: 'strong' | 'stable' | 'concerning') {
    return score === 'strong' ? Colors.income : score === 'stable' ? Colors.warning : Colors.expense;
}

function healthScore(val: number, thresholds: [number, number]): 'strong' | 'stable' | 'concerning' {
    if (val >= thresholds[0]) return 'strong';
    if (val >= thresholds[1]) return 'stable';
    return 'concerning';
}

export default function DebtAnalysis({ finance, currency }: Props) {
    const liabilities = finance.liabilities;
    const assets      = finance.assets;
    const equity      = finance.equity;
    const profit      = finance.profit;

    // Key ratios
    const debtToAssets   = assets > 0 ? (liabilities / assets) * 100 : 0;
    const debtToEquity   = equity > 0 ? liabilities / equity : liabilities > 0 ? Infinity : 0;
    const equityRatio    = assets > 0 ? (equity / assets) * 100 : 100;
    const returnOnAssets = assets > 0 ? (profit / assets) * 100 : 0;
    const returnOnEquity = equity > 0 ? (profit / equity) * 100 : 0;

    const debtToAssetsScore = healthScore(100 - debtToAssets, [70, 50]);
    const debtToEquityScore: 'strong' | 'stable' | 'concerning' =
        debtToEquity === Infinity ? 'concerning'
        : debtToEquity <= 0.5 ? 'strong'
        : debtToEquity <= 1   ? 'stable'
        : 'concerning';
    const roaScore = healthScore(returnOnAssets, [10, 5]);
    const roeScore = healthScore(returnOnEquity, [15, 8]);

    return (
        <View>
            {/* Balance summary */}
            <View style={styles.summaryRow}>
                <SummaryCard label="Total Assets"      value={`${currency}${assets.toLocaleString()}`}      color={Colors.asset} />
                <SummaryCard label="Total Liabilities" value={`${currency}${liabilities.toLocaleString()}`} color={Colors.liability} />
                <SummaryCard label="Owner's Equity"    value={`${currency}${equity.toLocaleString()}`}      color={Colors.equity} />
            </View>

            {/* Solvency ratios */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Solvency & Leverage</Text>

                <RatioRow
                    label="Debt-to-Assets"
                    value={`${debtToAssets.toFixed(1)}%`}
                    score={debtToAssetsScore}
                    desc="% of assets financed by debt. Below 30% is strong."
                />
                <RatioRow
                    label="Debt-to-Equity"
                    value={debtToEquity === Infinity ? 'N/A' : debtToEquity.toFixed(2)}
                    score={debtToEquityScore}
                    desc="Leverage ratio. Below 0.5× is strong, above 1× is high."
                />
                <RatioRow
                    label="Equity Ratio"
                    value={`${equityRatio.toFixed(1)}%`}
                    score={healthScore(equityRatio, [70, 50])}
                    desc="% of assets financed by equity. Higher is safer."
                />
            </View>

            {/* Profitability ratios */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Return on Capital</Text>

                <RatioRow
                    label="Return on Assets (ROA)"
                    value={`${returnOnAssets.toFixed(1)}%`}
                    score={roaScore}
                    desc="Profit as % of assets. Above 10% is strong."
                />
                <RatioRow
                    label="Return on Equity (ROE)"
                    value={`${returnOnEquity.toFixed(1)}%`}
                    score={roeScore}
                    desc="Profit as % of owner equity. Above 15% is strong."
                />
            </View>

            {/* Interpretation */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>What This Means</Text>
                {liabilities === 0 && (
                    <ActionItem color={Colors.income} text="No recorded liabilities. Update Opening Liabilities in Settings to reflect real debt obligations." />
                )}
                {debtToAssets > 50 && (
                    <ActionItem color={Colors.expense} text={`Debt-to-assets of ${debtToAssets.toFixed(1)}% means more than half your assets are financed by debt. Focus on reducing liabilities or growing retained earnings.`} />
                )}
                {debtToEquity > 1 && debtToEquity !== Infinity && (
                    <ActionItem color={Colors.warning} text={`Debt-to-equity of ${debtToEquity.toFixed(2)}× means your debt exceeds your equity. This increases financial risk and may affect borrowing capacity.`} />
                )}
                {returnOnEquity >= 15 && (
                    <ActionItem color={Colors.income} text={`Strong ROE of ${returnOnEquity.toFixed(1)}% — your equity is generating healthy returns.`} />
                )}
                {returnOnAssets < 5 && assets > 0 && (
                    <ActionItem color={Colors.warning} text={`Low ROA of ${returnOnAssets.toFixed(1)}%. Consider improving profit margins or reducing asset base.`} />
                )}
                <Text style={styles.disclaimer}>
                    Ratios are based on opening balances set in Settings and cumulative transaction data. Update opening balances for accurate results.
                </Text>
            </View>
        </View>
    );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <View style={summaryStyles.card}>
            <Text style={summaryStyles.label}>{label}</Text>
            <Text style={[summaryStyles.value, { color }]}>{value}</Text>
        </View>
    );
}

function RatioRow({ label, value, score, desc }: {
    label: string; value: string;
    score: 'strong' | 'stable' | 'concerning'; desc: string;
}) {
    const color = healthColor(score);
    return (
        <View style={ratioStyles.row}>
            <View style={ratioStyles.left}>
                <Text style={ratioStyles.label}>{label}</Text>
                <Text style={ratioStyles.desc}>{desc}</Text>
            </View>
            <View style={ratioStyles.right}>
                <Text style={[ratioStyles.value, { color }]}>{value}</Text>
                <View style={[ratioStyles.badge, { backgroundColor: color + '22' }]}>
                    <Text style={[ratioStyles.badgeText, { color }]}>{score}</Text>
                </View>
            </View>
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

const summaryStyles = StyleSheet.create({
    card:  { flex: 1, backgroundColor: Colors.bg, borderRadius: 10, padding: 10, alignItems: 'center' },
    label: { fontSize: 10, color: Colors.textMuted, textAlign: 'center', marginBottom: 4 },
    value: { fontSize: 13, fontWeight: 'bold', textAlign: 'center' },
});

const ratioStyles = StyleSheet.create({
    row:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
    left:      { flex: 1, marginRight: 12 },
    label:     { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, marginBottom: 4 },
    desc:      { fontSize: 11, color: Colors.textMuted, lineHeight: 16 },
    right:     { alignItems: 'flex-end', gap: 4 },
    value:     { fontSize: 16, fontWeight: 'bold' },
    badge:     { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    badgeText: { fontSize: 10, fontWeight: 'bold', textTransform: 'capitalize' },
});

const actionStyles = StyleSheet.create({
    item: { borderLeftWidth: 3, paddingLeft: 10, marginBottom: 10 },
    text: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
});

const styles = StyleSheet.create({
    summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    card:       { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12 },
    cardTitle:  { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 12 },
    disclaimer: { fontSize: 10, color: Colors.textMuted, marginTop: 10, fontStyle: 'italic', lineHeight: 15 },
});
