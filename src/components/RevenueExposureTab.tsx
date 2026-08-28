import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { computeCustomerConcentration, CustomerConcentration } from '../utils/finance';
import RadialGauge from './RadialGauge';
import BarList from './BarList';

const RISK_COLOR: Record<CustomerConcentration['risk'], string> = {
    low: Colors.income,
    medium: Colors.warning,
    high: Colors.expense,
};
const RISK_LABEL: Record<CustomerConcentration['risk'], string> = {
    low: 'Diversified',
    medium: 'Concentrated',
    high: 'Highly Concentrated',
};

function fmtCompact(currency: string, amount: number): string {
    const sign = amount < 0 ? '-' : '';
    const abs = Math.abs(amount);
    if (abs >= 1000000) return `${sign}${currency}${(abs / 1000000).toFixed(1)}M`;
    if (abs >= 1000) return `${sign}${currency}${(abs / 1000).toFixed(0)}K`;
    return `${sign}${currency}${Math.round(abs).toLocaleString()}`;
}

/**
 * The revenue-side mirror of Cost Exposure: instead of "which expense
 * category is eating my margin," this asks "which customer is my revenue
 * actually resting on." Same underlying risk tiers computeCustomerConcentration
 * already assigns (used on the Scoreboard's Business Resilience card and in
 * the financial diagnosis engine) -- this just gives them their own home
 * next to Cost Exposure instead of only surfacing as a single chip elsewhere.
 */
export default function RevenueExposureTab() {
    const { transactions, settings } = useApp();
    const currency = settings.currency || '₦';

    const customers = useMemo(() => computeCustomerConcentration(transactions), [transactions]);
    const totalRevenue = useMemo(
        () => transactions.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount ?? 0), 0),
        [transactions],
    );

    if (customers.length === 0) {
        return (
            <View style={s.emptyState}>
                <Text style={s.emptyTitle}>Not enough revenue history yet</Text>
                <Text style={s.emptySub}>Record income transactions with a customer name attached to see who your revenue depends on.</Text>
            </View>
        );
    }

    const top = customers[0];
    const topRiskColor = RISK_COLOR[top.risk];
    const namedCustomers = customers.filter(c => c.customer !== 'Unknown');
    const unnamedShare = customers.find(c => c.customer === 'Unknown')?.percentage ?? 0;

    return (
        <View>
            <Text style={s.subtitle}>
                A business that looks healthy on paper can still be one lost customer away from trouble. This ranks
                every customer by their real share of your recorded revenue, so concentration risk shows up before
                it becomes a crisis.
            </Text>

            <View style={[s.scoreCard, { borderTopColor: topRiskColor }]}>
                <Text style={s.scoreLabel}>Revenue Concentration</Text>
                <RadialGauge
                    displayValue={`${top.percentage.toFixed(0)}%`}
                    label={RISK_LABEL[top.risk]}
                    progress={top.percentage / 100}
                    color={topRiskColor}
                    size={104}
                    strokeWidth={9}
                />
                <Text style={s.verdict}>
                    {top.customer === 'Unknown'
                        ? `${top.percentage.toFixed(0)}% of revenue isn't tagged to a named customer, so concentration risk can't be fully assessed yet.`
                        : top.risk === 'high'
                        ? `${top.customer} alone accounts for ${top.percentage.toFixed(0)}% of your revenue. Losing this one relationship would hit the business hard — worth actively growing other customers.`
                        : top.risk === 'medium'
                        ? `${top.customer} is your biggest customer at ${top.percentage.toFixed(0)}% of revenue — not an emergency, but worth watching as it grows.`
                        : `Your biggest customer, ${top.customer}, is only ${top.percentage.toFixed(0)}% of revenue — a well-spread customer base.`}
                </Text>
            </View>

            {unnamedShare > 0 && (
                <View style={s.noteCard}>
                    <Text style={s.noteText}>
                        {unnamedShare.toFixed(0)}% of revenue has no customer name attached and shows as "Unknown" below —
                        tagging those transactions with who paid will make this picture more accurate.
                    </Text>
                </View>
            )}

            <View style={s.card}>
                <Text style={s.cardTitle}>Share of Revenue, Ranked</Text>
                <BarList
                    color={Colors.income}
                    items={customers.slice(0, 10).map(c => ({
                        label: c.customer,
                        value: c.percentage,
                        displayValue: `${c.percentage.toFixed(1)}%`,
                    }))}
                />
            </View>

            <View style={s.card}>
                <Text style={s.cardTitle}>Every Customer</Text>
                <View style={s.tableHeader}>
                    <Text style={[s.th, { flex: 1.4 }]}>Customer</Text>
                    <Text style={s.th}>Revenue</Text>
                    <Text style={s.th}>% of Total</Text>
                    <Text style={s.th}>Risk</Text>
                </View>
                {customers.map(c => (
                    <View key={c.customer} style={s.tableRow}>
                        <Text style={[s.td, { flex: 1.4, color: Colors.textPrimary, fontWeight: '700' }]} numberOfLines={1}>{c.customer}</Text>
                        <Text style={s.td}>{fmtCompact(currency, c.amount)}</Text>
                        <Text style={s.td}>{c.percentage.toFixed(1)}%</Text>
                        <Text style={[s.td, { color: RISK_COLOR[c.risk], fontWeight: '700' }]}>{c.risk}</Text>
                    </View>
                ))}
            </View>

            <View style={s.card}>
                <Text style={s.cardTitle}>Total Revenue Behind This</Text>
                <Text style={s.totalText}>
                    {fmtCompact(currency, totalRevenue)} across {namedCustomers.length || customers.length} customer{(namedCustomers.length || customers.length) === 1 ? '' : 's'}.
                </Text>
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    subtitle: { fontSize: 12, color: Colors.textMuted, marginBottom: 16, lineHeight: 17 },

    emptyState: { alignItems: 'center', padding: 32, backgroundColor: Colors.surface, borderRadius: 14 },
    emptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
    emptySub: { fontSize: 12, color: Colors.textMuted, textAlign: 'center' },

    scoreCard: { backgroundColor: Colors.surface, borderRadius: 14, borderTopWidth: 4, padding: 20, marginBottom: 14, alignItems: 'center' },
    scoreLabel: { fontSize: 13, color: Colors.textSecondary, marginBottom: 10 },
    verdict: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, marginTop: 12 },

    noteCard: { backgroundColor: Colors.warning + '15', borderRadius: 12, padding: 12, marginBottom: 14 },
    noteText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },

    card: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 14 },
    cardTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginBottom: 10 },

    tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border, paddingBottom: 8, marginBottom: 6 },
    th: { flex: 1, fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase' },
    tableRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
    td: { flex: 1, fontSize: 12, color: Colors.textSecondary },

    totalText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
});
