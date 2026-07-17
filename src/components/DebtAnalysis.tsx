import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { FinanceData, Loan } from '../types';

interface Props {
    finance: FinanceData;
    currency: string;
    loans?: Loan[];
}

function healthColor(score: 'strong' | 'stable' | 'concerning') {
    return score === 'strong' ? Colors.income : score === 'stable' ? Colors.warning : Colors.expense;
}

function healthScore(val: number, thresholds: [number, number]): 'strong' | 'stable' | 'concerning' {
    if (val >= thresholds[0]) return 'strong';
    if (val >= thresholds[1]) return 'stable';
    return 'concerning';
}

// What each score level actually means for day-to-day decisions — not just
// the number, but what happens to the business at that level.
const IMPACT: Record<string, Record<'strong' | 'stable' | 'concerning', string>> = {
    debtToAssets: {
        strong: 'Most of what you own is yours, not the bank\'s — lenders see you as low-risk, so new financing should be easy to get if you need it.',
        stable: 'A meaningful share of your assets is debt-financed. Still manageable, but leaves less room to absorb a bad month or take on more debt.',
        concerning: 'Most of your assets are financed by debt, not equity — a downturn could leave you owing more than you own, and lenders will see you as high-risk.',
    },
    debtToEquity: {
        strong: 'Your own capital covers your debt several times over — you\'re financing growth with your own money, not the bank\'s.',
        stable: 'Debt and equity are roughly balanced. Fine for now, but taking on more debt from here raises risk faster than it raises capacity.',
        concerning: 'You owe more than the business is worth to you. This is the single biggest red flag lenders and investors look for — expect higher rates or rejected applications.',
    },
    equityRatio: {
        strong: 'The business is mostly self-funded. You keep more of the upside, and a bad quarter is less likely to threaten survival.',
        stable: 'A workable mix of your money and borrowed money. Keep an eye on it — it can tip toward risky if debt grows faster than equity.',
        concerning: 'Borrowed money funds most of the business. Profits are increasingly going toward debt service instead of back into the business or to you.',
    },
    roa: {
        strong: 'Every pound tied up in the business is working hard — a strong sign you could productively deploy more capital, borrowed or not.',
        stable: 'Assets are generating a reasonable return, but there\'s room to get more out of what you already own before adding more.',
        concerning: 'Assets aren\'t earning their keep. Adding more debt to buy more assets right now would likely just repeat the problem at a larger scale.',
    },
    roe: {
        strong: 'Your own money is earning a strong return in this business — better than it would likely earn sitting elsewhere.',
        stable: 'A reasonable return on your capital, though not spectacular. Worth comparing against what else you could do with that money.',
        concerning: 'Your capital is earning little to nothing here. Before borrowing more, fix why the business isn\'t returning enough on what\'s already invested.',
    },
};

export default function DebtAnalysis({ finance, currency, loans = [] }: Props) {
    // finance.liabilities only ever reflects Settings' manual "opening
    // liabilities" figure — computeFinance never folds in the live Loan
    // Register — same root cause fixed in EnhancedDebtManagement.tsx
    // (Reports > Loans & Debt). This component had the identical gap: an
    // account with real active loans could show "No recorded liabilities"
    // here and 0% debt-to-assets, understating leverage risk entirely.
    const liveLoanBalance = loans
        .filter(l => l.status === 'active')
        .reduce((sum, l) => {
            const paid = (l.payments ?? []).reduce((s, p) => s + (p.amount || 0), 0);
            return sum + Math.max(0, (l.principal || 0) - paid);
        }, 0);
    const liabilities = finance.liabilities + liveLoanBalance;
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
                    impact={IMPACT.debtToAssets[debtToAssetsScore]}
                />
                <RatioRow
                    label="Debt-to-Equity"
                    value={debtToEquity === Infinity ? 'N/A' : debtToEquity.toFixed(2)}
                    score={debtToEquityScore}
                    desc="Leverage ratio. Below 0.5× is strong, above 1× is high."
                    impact={IMPACT.debtToEquity[debtToEquityScore]}
                />
                <RatioRow
                    label="Equity Ratio"
                    value={`${equityRatio.toFixed(1)}%`}
                    score={healthScore(equityRatio, [70, 50])}
                    desc="% of assets financed by equity. Higher is safer."
                    impact={IMPACT.equityRatio[healthScore(equityRatio, [70, 50])]}
                    last
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
                    impact={IMPACT.roa[roaScore]}
                />
                <RatioRow
                    label="Return on Equity (ROE)"
                    value={`${returnOnEquity.toFixed(1)}%`}
                    score={roeScore}
                    desc="Profit as % of owner equity. Above 15% is strong."
                    impact={IMPACT.roe[roeScore]}
                    last
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

function RatioRow({ label, value, score, desc, impact, last }: {
    label: string; value: string;
    score: 'strong' | 'stable' | 'concerning'; desc: string;
    impact?: string; last?: boolean;
}) {
    const color = healthColor(score);
    return (
        <View style={[ratioStyles.row, last && { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 }, { borderLeftColor: color }]}>
            <View style={ratioStyles.headRow}>
                <View style={ratioStyles.left}>
                    <Text style={ratioStyles.label}>{label}</Text>
                    <Text style={ratioStyles.desc}>{desc}</Text>
                </View>
                <View style={ratioStyles.right}>
                    <Text style={[ratioStyles.value, { color }]}>{value}</Text>
                    <View style={[ratioStyles.badge, { backgroundColor: color }]}>
                        <Text style={ratioStyles.badgeText}>{score}</Text>
                    </View>
                </View>
            </View>
            {impact && (
                <Text style={ratioStyles.impact}>
                    <Text style={{ fontWeight: '700', color }}>What this means: </Text>
                    {impact}
                </Text>
            )}
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
    row:       { borderLeftWidth: 4, paddingLeft: 12, paddingVertical: 12, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
    headRow:   { flexDirection: 'row', justifyContent: 'space-between' },
    left:      { flex: 1, marginRight: 12 },
    label:     { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
    desc:      { fontSize: 12, color: Colors.textMuted, lineHeight: 17 },
    right:     { alignItems: 'flex-end', gap: 6 },
    value:     { fontSize: 19, fontWeight: '800' },
    badge:     { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
    badgeText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', color: '#fff', letterSpacing: 0.3 },
    impact:    { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18, marginTop: 10 },
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
