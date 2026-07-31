import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../theme/colors';
import { computeProjectProfitability, ProjectProfitabilityVerdict } from '../utils/projectProfitability';

interface SavedProject {
    id: string;
    name: string;
    projectFee: number;
    hoursSpent: number;
    effectiveHourlyRate: number;
    verdict: ProjectProfitabilityVerdict;
}

const MAX_SAVED = 5;

const VERDICT_COLOR: Record<ProjectProfitabilityVerdict, string> = {
    healthy: Colors.income,
    caution: Colors.warning,
    high: Colors.expense,
};

const VERDICT_LABEL: Record<ProjectProfitabilityVerdict, string> = {
    healthy: '🟢 Healthy',
    caution: '🟡 Caution',
    high: '🔴 Below Target',
};

interface Props {
    currency: string;
}

function fmt(currency: string, n: number): string {
    return `${currency}${Math.round(n).toLocaleString()}`;
}

// No inventory involved — professional services sell time, not stock.
// Turns "was this project actually worth it" into a number: what it
// really paid per hour once the actual hours are in, checked against
// the rate the business needs to clear.
export default function ProjectProfitabilityCalculator({ currency }: Props) {
    const [projectName, setProjectName] = useState('');
    const [projectFee, setProjectFee] = useState('');
    const [hoursSpent, setHoursSpent] = useState('');
    const [staffCostPerHour, setStaffCostPerHour] = useState('0');
    const [targetHourlyRate, setTargetHourlyRate] = useState('');
    const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);

    const result = useMemo(
        () => computeProjectProfitability({
            projectFee: parseFloat(projectFee) || 0,
            hoursSpent: parseFloat(hoursSpent) || 0,
            staffCostPerHour: parseFloat(staffCostPerHour) || 0,
            targetHourlyRate: parseFloat(targetHourlyRate) || 0,
        }),
        [projectFee, hoursSpent, staffCostPerHour, targetHourlyRate],
    );

    const hasProject = (parseFloat(projectFee) || 0) > 0 && (parseFloat(hoursSpent) || 0) > 0;

    const saveProject = () => {
        if (!hasProject || savedProjects.length >= MAX_SAVED) return;
        setSavedProjects(prev => [...prev, {
            id: `${Date.now()}`,
            name: projectName.trim() || `Project ${prev.length + 1}`,
            projectFee: parseFloat(projectFee) || 0,
            hoursSpent: parseFloat(hoursSpent) || 0,
            effectiveHourlyRate: result.effectiveHourlyRate,
            verdict: result.verdict,
        }]);
        setProjectName('');
    };

    const removeProject = (id: string) => {
        setSavedProjects(prev => prev.filter(p => p.id !== id));
    };

    return (
        <View style={s.card}>
            <Text style={s.title}>⏱️ Project / Retainer Profitability</Text>
            <Text style={s.subtitle}>
                Not "was the invoice paid" — "was this actually worth doing." Checked against the hours it really took, not the estimate.
            </Text>

            <Text style={s.fieldLabel}>Project / Client Name</Text>
            <TextInput
                style={s.input}
                value={projectName}
                onChangeText={setProjectName}
                placeholder="e.g. Market entry report — AfriCorp"
                placeholderTextColor={Colors.textMuted}
            />

            <View style={s.row}>
                <View style={s.flex}>
                    <Text style={s.fieldLabel}>Project Fee</Text>
                    <View style={s.inputWrap}>
                        <Text style={s.affix}>{currency}</Text>
                        <TextInput
                            style={s.priceInput}
                            value={projectFee}
                            onChangeText={setProjectFee}
                            keyboardType="decimal-pad"
                            placeholder="0"
                            placeholderTextColor={Colors.textMuted}
                        />
                    </View>
                </View>
                <View style={s.flex}>
                    <Text style={s.fieldLabel}>Hours Spent</Text>
                    <TextInput
                        style={s.input}
                        value={hoursSpent}
                        onChangeText={setHoursSpent}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={Colors.textMuted}
                    />
                </View>
            </View>

            <View style={s.row}>
                <View style={s.flex}>
                    <Text style={s.fieldLabel}>Staff Cost / Hour</Text>
                    <View style={s.inputWrap}>
                        <Text style={s.affix}>{currency}</Text>
                        <TextInput
                            style={s.priceInput}
                            value={staffCostPerHour}
                            onChangeText={setStaffCostPerHour}
                            keyboardType="decimal-pad"
                            placeholder="0"
                            placeholderTextColor={Colors.textMuted}
                        />
                    </View>
                    <Text style={s.hint}>0 if solo and not paying yourself a wage</Text>
                </View>
                <View style={s.flex}>
                    <Text style={s.fieldLabel}>Target Hourly Rate</Text>
                    <View style={s.inputWrap}>
                        <Text style={s.affix}>{currency}</Text>
                        <TextInput
                            style={s.priceInput}
                            value={targetHourlyRate}
                            onChangeText={setTargetHourlyRate}
                            keyboardType="decimal-pad"
                            placeholder="0"
                            placeholderTextColor={Colors.textMuted}
                        />
                    </View>
                    <Text style={s.hint}>The rate this needs to clear to be worthwhile</Text>
                </View>
            </View>

            {hasProject && (
                <>
                    <View style={s.statRow}>
                        <View style={s.stat}>
                            <Text style={s.statLabel}>Effective Rate</Text>
                            <Text style={[s.statVal, { color: VERDICT_COLOR[result.verdict] }]}>{fmt(currency, result.effectiveHourlyRate)}/hr</Text>
                        </View>
                        <View style={s.stat}>
                            <Text style={s.statLabel}>Profit</Text>
                            <Text style={s.statVal}>{fmt(currency, result.profit)}</Text>
                        </View>
                        <View style={s.stat}>
                            <Text style={s.statLabel}>Margin</Text>
                            <Text style={s.statVal}>{result.marginPct.toFixed(1)}%</Text>
                        </View>
                    </View>

                    <View style={[s.verdictBox, { borderColor: VERDICT_COLOR[result.verdict] }]}>
                        <Text style={[s.verdictLabel, { color: VERDICT_COLOR[result.verdict] }]}>{VERDICT_LABEL[result.verdict]}</Text>
                        <Text style={s.verdictReason}>{result.reason}</Text>
                    </View>
                </>
            )}
            {!hasProject && (
                <Text style={s.emptyHint}>Enter a project fee and hours spent to see the effective hourly rate.</Text>
            )}

            {hasProject && savedProjects.length < MAX_SAVED && (
                <TouchableOpacity style={s.saveBtn} onPress={saveProject}>
                    <Text style={s.saveBtnText}>Save Project</Text>
                </TouchableOpacity>
            )}

            {savedProjects.length > 0 && (
                <View style={s.savedSection}>
                    <Text style={s.savedTitle}>Saved Projects</Text>
                    {savedProjects.map(p => (
                        <View key={p.id} style={s.savedRow}>
                            <View style={s.flex}>
                                <Text style={s.savedName}>{p.name}</Text>
                                <Text style={s.savedMeta}>{fmt(currency, p.projectFee)} · {p.hoursSpent}h · {fmt(currency, p.effectiveHourlyRate)}/hr</Text>
                            </View>
                            <View style={[s.savedBadge, { backgroundColor: VERDICT_COLOR[p.verdict] + '22' }]}>
                                <Text style={[s.savedBadgeText, { color: VERDICT_COLOR[p.verdict] }]}>{VERDICT_LABEL[p.verdict]}</Text>
                            </View>
                            <TouchableOpacity onPress={() => removeProject(p.id)} style={s.removeBtn}>
                                <Text style={s.removeBtnText}>✕</Text>
                            </TouchableOpacity>
                        </View>
                    ))}
                </View>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12 },
    title: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
    subtitle: { fontSize: 12, color: Colors.textMuted, marginBottom: 14, lineHeight: 17 },

    row: { flexDirection: 'row', gap: 10 },
    flex: { flex: 1 },
    fieldLabel: { fontSize: 12.5, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6, marginTop: 4 },
    input: { backgroundColor: Colors.bg, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.textPrimary, marginBottom: 4 },
    inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bg, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, marginBottom: 4 },
    affix: { fontSize: 14, color: Colors.textMuted, fontWeight: '600' },
    priceInput: { flex: 1, paddingVertical: 10, paddingHorizontal: 6, fontSize: 15, color: Colors.textPrimary },
    hint: { fontSize: 10, color: Colors.textMuted, marginBottom: 8, lineHeight: 13 },

    statRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
    stat: { flex: 1, backgroundColor: Colors.bg, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 10 },
    statLabel: { fontSize: 10.5, color: Colors.textMuted, marginBottom: 4, lineHeight: 14 },
    statVal: { fontSize: 13.5, fontWeight: '800', color: Colors.textPrimary },

    verdictBox: { borderRadius: 10, borderWidth: 1.5, padding: 12, marginTop: 12 },
    verdictLabel: { fontSize: 13, fontWeight: '800', marginBottom: 4 },
    verdictReason: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },

    emptyHint: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic', marginTop: 4 },

    saveBtn: { marginTop: 12, backgroundColor: Colors.primary, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
    saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

    savedSection: { marginTop: 14, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12 },
    savedTitle: { fontSize: 12.5, fontWeight: '700', color: Colors.textSecondary, marginBottom: 8 },
    savedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
    savedName: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary },
    savedMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
    savedBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
    savedBadgeText: { fontSize: 10.5, fontWeight: '700' },
    removeBtn: { paddingHorizontal: 6, paddingVertical: 4 },
    removeBtnText: { color: Colors.expense, fontSize: 13, fontWeight: '700' },
});
