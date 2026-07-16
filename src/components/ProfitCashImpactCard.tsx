import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { ProfitCashImpact, ImpactSource, suggestSolution } from '../utils/impactChain';
import NextStepLink from './NextStepLink';

interface Props {
    impact: ProfitCashImpact;
    source: ImpactSource;
    currency: string;
    onSeeFullPicture: () => void; // always the same terminal step: Clarity's profit -> cash pathway
}

// The consistent last leg of every decision chain in the app: does this
// help or hurt profit, does that flow through to cash, and — if it's
// harmful — what's the concrete fix. Every chain ends here (or points here)
// so "what does this decision actually do to my business" always gets
// answered the same way, no matter which screen the decision started on.
export default function ProfitCashImpactCard({ impact, source, currency, onSeeFullPicture }: Props) {
    const { projectedProfit, profitChange, projectedCashBalance, cashChange, severity, isHarmful } = impact;
    const color = severity === 'harmful' ? Colors.expense : severity === 'caution' ? Colors.warning : Colors.income;
    const solution = isHarmful ? suggestSolution(source) : null;

    const fmt = (n: number) => `${n >= 0 ? '+' : ''}${currency}${Math.round(n).toLocaleString()}`;

    return (
        <View style={[s.card, { borderColor: color }]}>
            <Text style={s.title}>Effect on Profit → Cash Balance</Text>

            <View style={s.row}>
                <Text style={s.label}>Profit after this</Text>
                <Text style={[s.val, { color: projectedProfit >= 0 ? Colors.income : Colors.expense }]}>
                    {currency}{Math.round(projectedProfit).toLocaleString()} <Text style={s.delta}>({fmt(profitChange)})</Text>
                </Text>
            </View>
            <View style={s.row}>
                <Text style={s.label}>Cash balance after this</Text>
                <Text style={[s.val, { color: projectedCashBalance >= 0 ? Colors.income : Colors.expense }]}>
                    {currency}{Math.round(projectedCashBalance).toLocaleString()} <Text style={s.delta}>({fmt(cashChange)})</Text>
                </Text>
            </View>

            <View style={[s.verdict, { backgroundColor: color + '18', borderColor: color }]}>
                <Text style={[s.verdictText, { color }]}>
                    {severity === 'harmful'
                        ? '⚠ This would hurt your financial position.'
                        : severity === 'caution'
                            ? '⚠ Manageable, but it takes a real bite out of profit.'
                            : '✓ This keeps you on solid ground.'}
                </Text>
            </View>

            {solution && (
                <View style={s.solutionBox}>
                    <Text style={s.solutionTitle}>💡 {solution.title}</Text>
                    <Text style={s.solutionDetail}>{solution.detail}</Text>
                </View>
            )}

            <NextStepLink text="See the full profit → cash picture" onPress={onSeeFullPicture} />
        </View>
    );
}

const s = StyleSheet.create({
    card:   { backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, padding: 14, marginTop: 10 },
    title:  { fontSize: 12, fontWeight: '800', color: Colors.textPrimary, marginBottom: 10 },
    row:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
    label:  { fontSize: 12, color: Colors.textSecondary },
    val:    { fontSize: 12, fontWeight: '700' },
    delta:  { fontSize: 11, fontWeight: '600', opacity: 0.8 },

    verdict:     { marginTop: 10, borderRadius: 8, borderWidth: 1, padding: 10 },
    verdictText: { fontSize: 11, fontWeight: '600', lineHeight: 16 },

    solutionBox:    { marginTop: 10, backgroundColor: Colors.primary + '10', borderRadius: 8, padding: 10 },
    solutionTitle:  { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, marginBottom: 3 },
    solutionDetail: { fontSize: 11, color: Colors.textSecondary, lineHeight: 16 },
});
