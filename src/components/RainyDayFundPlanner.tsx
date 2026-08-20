import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../theme/colors';
import { computeRainyDayFundPlan } from '../utils/rainyDayFund';
import RadialGauge from './RadialGauge';

interface Props {
    currency: string;
    currentCashBalance: number;
    dailyBurn: number;
}

const TARGET_MONTHS_OPTIONS = [3, 4, 5, 6];
const TIMELINE_OPTIONS = [6, 12, 18, 24];

function fmt(currency: string, n: number): string {
    return `${currency}${Math.round(n).toLocaleString()}`;
}

// Turns generic "save 3-6 months of expenses" advice into a number against
// this business's own burn rate — reuses the same dailyBurn source as Cash
// Runway and the Cash Flow Stress Test, not a separate estimate.
export default function RainyDayFundPlanner({ currency, currentCashBalance, dailyBurn }: Props) {
    const [targetMonths, setTargetMonths] = useState(3);
    const [timelineMonths, setTimelineMonths] = useState(12);

    const plan = useMemo(
        () => computeRainyDayFundPlan({ currentCashBalance, dailyBurn, targetMonths, timelineMonths }),
        [currentCashBalance, dailyBurn, targetMonths, timelineMonths],
    );

    const progressPct = plan.targetAmount > 0
        ? Math.min(100, (plan.currentReserve / plan.targetAmount) * 100)
        : 100;

    return (
        <View style={s.card}>
            <Text style={s.title}>🌧️ Rainy-Day Fund Target</Text>
            <Text style={s.subtitle}>
                Not for expansion, inventory, or payroll — a reserve set aside specifically to keep the business running through a shock. Based on your own burn rate, not a guess.
            </Text>

            <Text style={s.fieldLabel}>Target: months of expenses in reserve</Text>
            <View style={s.chipRow}>
                {TARGET_MONTHS_OPTIONS.map(m => (
                    <TouchableOpacity
                        key={m}
                        style={[s.chip, targetMonths === m && s.chipSelected]}
                        onPress={() => setTargetMonths(m)}
                    >
                        <Text style={[s.chipText, targetMonths === m && s.chipTextSelected]}>{m} months</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <Text style={s.fieldLabel}>Timeline to reach it</Text>
            <View style={s.chipRow}>
                {TIMELINE_OPTIONS.map(m => (
                    <TouchableOpacity
                        key={m}
                        style={[s.chip, timelineMonths === m && s.chipSelected]}
                        onPress={() => setTimelineMonths(m)}
                    >
                        <Text style={[s.chipText, timelineMonths === m && s.chipTextSelected]}>{m} mo</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <View style={s.statRow}>
                <RadialGauge
                    displayValue={`${progressPct.toFixed(0)}%`}
                    label="of target"
                    progress={progressPct / 100}
                    color={plan.onTrack ? Colors.income : Colors.warning}
                    size={72}
                />
                <View style={s.statCol}>
                    <View style={s.stat}>
                        <Text style={s.statLabel}>Target Reserve</Text>
                        <Text style={s.statVal}>{fmt(currency, plan.targetAmount)}</Text>
                    </View>
                    <View style={s.stat}>
                        <Text style={s.statLabel}>Current Reserve</Text>
                        <Text style={s.statVal}>{fmt(currency, plan.currentReserve)}</Text>
                    </View>
                    <View style={s.stat}>
                        <Text style={s.statLabel}>Months Covered Now</Text>
                        <Text style={s.statVal}>{isFinite(plan.monthsOfCoverageNow) ? plan.monthsOfCoverageNow.toFixed(1) : '∞'}</Text>
                    </View>
                </View>
            </View>

            <View style={[s.verdictBox, { borderColor: plan.onTrack ? Colors.income : Colors.warning }]}>
                {plan.onTrack ? (
                    <Text style={[s.verdictText, { color: Colors.income }]}>
                        🟢 Current cash already covers {targetMonths} months of expenses at this burn rate — target met.
                    </Text>
                ) : (
                    <Text style={[s.verdictText, { color: Colors.warning }]}>
                        🟡 Set aside about {fmt(currency, plan.suggestedMonthlySetAside)}/month for {timelineMonths} months to close the {fmt(currency, plan.gap)} gap to a {targetMonths}-month reserve.
                    </Text>
                )}
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12 },
    title: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
    subtitle: { fontSize: 12, color: Colors.textMuted, marginBottom: 14, lineHeight: 17 },

    fieldLabel: { fontSize: 12.5, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6, marginTop: 4 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
    chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border },
    chipSelected: { backgroundColor: Colors.primary + '20', borderColor: Colors.primary },
    chipText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
    chipTextSelected: { color: Colors.primary },

    statRow: { flexDirection: 'row', gap: 12, marginTop: 8, alignItems: 'center' },
    statCol: { flex: 1, gap: 8 },
    stat: { backgroundColor: Colors.bg, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 10 },
    statLabel: { fontSize: 10, color: Colors.textMuted, marginBottom: 4, lineHeight: 13 },
    statVal: { fontSize: 13.5, fontWeight: '800', color: Colors.textPrimary },

    verdictBox: { borderRadius: 10, borderWidth: 1.5, padding: 12, marginTop: 12 },
    verdictText: { fontSize: 12.5, lineHeight: 18, fontWeight: '600' },
});
