import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import Icon from './ui/Icon';
import { CapitalCommitment, CommitmentDecision, CommitmentStatus } from '../types';
import { computeCommitmentMonitor, SuggestedDecision } from '../utils/capitalCommitmentMonitor';

interface Props {
    currency: string;
}

const STATUS_META: Record<CommitmentStatus, { label: string; color: string }> = {
    'on-track': { label: 'On Track', color: Colors.income },
    'at-risk': { label: 'At Risk', color: Colors.warning },
    'off-track': { label: 'Off Track', color: Colors.expense },
    'not-started': { label: 'Not Started', color: Colors.textMuted },
};

const DECISION_OPTIONS: { key: CommitmentDecision; label: string }[] = [
    { key: 'continue', label: 'Continue' },
    { key: 'adjust', label: 'Adjust' },
    { key: 'pause', label: 'Pause' },
    { key: 'stop', label: 'Stop' },
    { key: 'scale', label: 'Scale' },
];

const SUGGESTED_DECISION_COLOR: Record<SuggestedDecision, string> = {
    scale: Colors.income, continue: Colors.income, adjust: Colors.warning, pause: Colors.expense,
};

const TARGET_DATE_OPTIONS: { label: string; months: number | null }[] = [
    { label: 'No target date', months: null },
    { label: '1 month', months: 1 },
    { label: '3 months', months: 3 },
    { label: '6 months', months: 6 },
    { label: '12 months', months: 12 },
];

function addMonths(iso: string, months: number): string {
    const d = new Date(iso);
    d.setMonth(d.getMonth() + months);
    return d.toISOString().slice(0, 10);
}

// Investment Decision Monitor -- generalizes the same "did this actually
// work" question postFinancingMonitor.ts already asks about a loan
// (Post-Financing Intelligence) to any significant spend a business
// approves: hiring, marketing, equipment, technology, a new location.
// Built entirely on CapitalCommitment (types.ts) and computeCommitmentMonitor
// (capitalCommitmentMonitor.ts) -- both already existed (persistence and
// CRUD were already wired into OptimizedContexts.tsx) but had no UI. This
// component is that missing UI, not a new data model.
export default function CapitalCommitmentTracker({ currency }: Props) {
    const { capitalCommitments, addCommitment, updateCommitment, deleteCommitment } = useApp();
    const [showForm, setShowForm] = useState(false);
    const [name, setName] = useState('');
    const [purpose, setPurpose] = useState('');
    const [amount, setAmount] = useState('');
    const [targetMonths, setTargetMonths] = useState<number | null>(3);
    const [assumptionsText, setAssumptionsText] = useState('');
    const [kpiDrafts, setKpiDrafts] = useState<{ name: string; target: string }[]>([{ name: '', target: '' }]);

    // Local draft of each KPI's "actual" TextInput value, keyed by
    // `${commitmentId}:${kpiId}` -- committed to context onBlur, not on
    // every keystroke, so typing a number doesn't write to storage on every
    // character. (onEndEditing is a no-op on react-native-web -- TextInput
    // there never fires it -- so onBlur is the only web-reliable signal
    // that editing this field has finished.)
    const [actualDrafts, setActualDrafts] = useState<Record<string, string>>({});

    const monitors = useMemo(
        () => Object.fromEntries(capitalCommitments.map(c => [c.id, computeCommitmentMonitor(c)])),
        [capitalCommitments],
    );

    function resetForm() {
        setName(''); setPurpose(''); setAmount(''); setTargetMonths(3); setAssumptionsText('');
        setKpiDrafts([{ name: '', target: '' }]);
    }

    function handleSave() {
        const amountNum = parseFloat(amount) || 0;
        const kpis = kpiDrafts
            .filter(k => k.name.trim().length > 0)
            .map(k => ({ id: Math.random().toString(36).slice(2), name: k.name.trim(), target: parseFloat(k.target) || 0, actual: 0 }));
        if (!name.trim() || amountNum <= 0) return;
        const today = new Date().toISOString().slice(0, 10);
        addCommitment({
            name: name.trim(),
            purpose: purpose.trim(),
            amountApproved: amountNum,
            approvedDate: today,
            targetDate: targetMonths !== null ? addMonths(today, targetMonths) : undefined,
            assumptions: assumptionsText.split('\n').map(a => a.trim()).filter(Boolean),
            kpis,
            status: 'not-started',
        });
        resetForm();
        setShowForm(false);
    }

    function commitActual(commitment: CapitalCommitment, kpiId: string) {
        const draftKey = `${commitment.id}:${kpiId}`;
        const raw = actualDrafts[draftKey];
        if (raw === undefined) return;
        const value = parseFloat(raw) || 0;
        const updatedKpis = commitment.kpis.map(k => k.id === kpiId ? { ...k, actual: value } : k);
        const monitor = computeCommitmentMonitor({ ...commitment, kpis: updatedKpis });
        updateCommitment(commitment.id, { kpis: updatedKpis, status: monitor.suggestedStatus });
    }

    function recordDecision(commitment: CapitalCommitment, decision: CommitmentDecision) {
        updateCommitment(commitment.id, { decision, decidedAt: new Date().toISOString().slice(0, 10) });
    }

    return (
        <View>
            <Text style={s.subtitle}>
                Every significant investment has an expected outcome -- log what you're committing to, then update the real evidence over time to see whether it's actually working.
            </Text>

            {capitalCommitments.length === 0 && !showForm && (
                <Text style={s.emptyHint}>No investment decisions tracked yet.</Text>
            )}

            {capitalCommitments.map(c => {
                const monitor = monitors[c.id];
                const statusMeta = STATUS_META[monitor.suggestedStatus];
                return (
                    <View key={c.id} style={s.card}>
                        <View style={s.cardHeaderRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={s.commitmentName}>{c.name}</Text>
                                <Text style={s.commitmentMeta}>{currency}{c.amountApproved.toLocaleString()} — {monitor.daysSinceApproval} days ago</Text>
                            </View>
                            <View style={[s.statusBadge, { backgroundColor: statusMeta.color + '22' }]}>
                                <Text style={[s.statusBadgeText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
                            </View>
                            <TouchableOpacity onPress={() => deleteCommitment(c.id)} style={s.deleteBtn}>
                                <Icon name="trash-2" size={14} color={Colors.textMuted} />
                            </TouchableOpacity>
                        </View>
                        {c.purpose ? <Text style={s.commitmentPurpose}>{c.purpose}</Text> : null}

                        {c.assumptions && c.assumptions.length > 0 && (
                            <View style={s.assumptionsBox}>
                                <Text style={s.blockLabel}>Assumptions</Text>
                                {c.assumptions.map((a, i) => <Text key={i} style={s.assumptionLine}>• {a}</Text>)}
                            </View>
                        )}

                        <Text style={s.blockLabel}>KPIs (target vs. actual)</Text>
                        {c.kpis.length === 0 && <Text style={s.emptyHint}>No KPIs set — nothing to measure yet.</Text>}
                        {c.kpis.map((k, i) => {
                            const progress = monitor.kpiProgress[i];
                            const draftKey = `${c.id}:${k.id}`;
                            return (
                                <View key={k.id} style={s.kpiRow}>
                                    <Text style={s.kpiName} numberOfLines={1}>{k.name}</Text>
                                    <Text style={s.kpiTarget}>target {k.target.toLocaleString()}</Text>
                                    <TextInput
                                        style={s.kpiInput}
                                        value={actualDrafts[draftKey] ?? String(k.actual)}
                                        onChangeText={v => setActualDrafts(prev => ({ ...prev, [draftKey]: v }))}
                                        onBlur={() => commitActual(c, k.id)}
                                        keyboardType="decimal-pad"
                                        placeholder="actual"
                                        placeholderTextColor={Colors.textMuted}
                                    />
                                    {progress?.achievementPct !== null && progress?.achievementPct !== undefined && (
                                        <Text style={[s.kpiPct, { color: progress.achievementPct >= 80 ? Colors.income : progress.achievementPct >= 40 ? Colors.warning : Colors.expense }]}>
                                            {progress.achievementPct.toFixed(0)}%
                                        </Text>
                                    )}
                                </View>
                            );
                        })}

                        <View style={s.rationaleBox}>
                            <Text style={s.rationaleText}>{monitor.decisionRationale}</Text>
                        </View>

                        {monitor.suggestedDecision && (
                            <Text style={[s.suggestedLine, { color: SUGGESTED_DECISION_COLOR[monitor.suggestedDecision] }]}>
                                Suggested: {monitor.suggestedDecision.charAt(0).toUpperCase() + monitor.suggestedDecision.slice(1)}
                            </Text>
                        )}

                        <Text style={s.blockLabel}>Your Decision</Text>
                        <View style={s.decisionRow}>
                            {DECISION_OPTIONS.map(opt => (
                                <TouchableOpacity
                                    key={opt.key}
                                    style={[s.decisionChip, c.decision === opt.key && s.decisionChipActive]}
                                    onPress={() => recordDecision(c, opt.key)}
                                >
                                    <Text style={[s.decisionChipText, c.decision === opt.key && s.decisionChipTextActive]}>{opt.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        {c.decision && c.decidedAt && (
                            <Text style={s.decidedNote}>Recorded "{c.decision}" on {c.decidedAt}.</Text>
                        )}
                    </View>
                );
            })}

            {!showForm ? (
                <TouchableOpacity style={s.addBtn} onPress={() => setShowForm(true)}>
                    <Icon name="plus" size={14} color={Colors.primary} />
                    <Text style={s.addBtnText}>Track a new investment decision</Text>
                </TouchableOpacity>
            ) : (
                <View style={s.formCard}>
                    <Text style={s.formLabel}>What is it?</Text>
                    <TextInput style={s.formInput} value={name} onChangeText={setName} placeholder="e.g. New POS/inventory system" placeholderTextColor={Colors.textMuted} />

                    <Text style={s.formLabel}>Objective — what are you trying to achieve?</Text>
                    <TextInput style={[s.formInput, s.formInputMultiline]} value={purpose} onChangeText={setPurpose} placeholder="e.g. Reduce manual processing time" placeholderTextColor={Colors.textMuted} multiline />

                    <Text style={s.formLabel}>Amount committed ({currency})</Text>
                    <TextInput style={s.formInput} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={Colors.textMuted} />

                    <Text style={s.formLabel}>When should evidence appear?</Text>
                    <View style={s.pillRow}>
                        {TARGET_DATE_OPTIONS.map(opt => (
                            <TouchableOpacity
                                key={opt.label}
                                style={[s.pill, targetMonths === opt.months && s.pillActive]}
                                onPress={() => setTargetMonths(opt.months)}
                            >
                                <Text style={[s.pillText, targetMonths === opt.months && s.pillTextActive]}>{opt.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <Text style={s.formLabel}>Key assumptions (one per line)</Text>
                    <TextInput
                        style={[s.formInput, s.formInputMultiline]}
                        value={assumptionsText}
                        onChangeText={setAssumptionsText}
                        placeholder={'e.g. System adoption > 80%\nRevenue doesn\'t decline during rollout'}
                        placeholderTextColor={Colors.textMuted}
                        multiline
                    />

                    <Text style={s.formLabel}>KPIs to track (name + target)</Text>
                    {kpiDrafts.map((k, i) => (
                        <View key={i} style={s.kpiDraftRow}>
                            <TextInput
                                style={[s.formInput, { flex: 2 }]}
                                value={k.name}
                                onChangeText={v => setKpiDrafts(prev => prev.map((row, idx) => idx === i ? { ...row, name: v } : row))}
                                placeholder="e.g. Monthly cost savings"
                                placeholderTextColor={Colors.textMuted}
                            />
                            <TextInput
                                style={[s.formInput, { flex: 1 }]}
                                value={k.target}
                                onChangeText={v => setKpiDrafts(prev => prev.map((row, idx) => idx === i ? { ...row, target: v } : row))}
                                keyboardType="decimal-pad"
                                placeholder="target"
                                placeholderTextColor={Colors.textMuted}
                            />
                        </View>
                    ))}
                    <TouchableOpacity onPress={() => setKpiDrafts(prev => [...prev, { name: '', target: '' }])}>
                        <Text style={s.addKpiText}>+ Add another KPI</Text>
                    </TouchableOpacity>

                    <View style={s.formActionsRow}>
                        <TouchableOpacity style={s.cancelBtn} onPress={() => { resetForm(); setShowForm(false); }}>
                            <Text style={s.cancelBtnText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
                            <Text style={s.saveBtnText}>Save</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    subtitle: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginBottom: Spacing.md },
    emptyHint: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic', marginBottom: Spacing.sm },

    card: { backgroundColor: Colors.bg, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.md },
    cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    commitmentName: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
    commitmentMeta: { fontSize: 11.5, color: Colors.textMuted, marginTop: 1 },
    commitmentPurpose: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 17, marginBottom: 8 },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.pill },
    statusBadgeText: { fontSize: 10.5, fontWeight: '700' },
    deleteBtn: { padding: 4 },

    assumptionsBox: { backgroundColor: Colors.card, borderRadius: Radius.sm, padding: Spacing.sm, marginBottom: Spacing.sm },
    assumptionLine: { fontSize: 11.5, color: Colors.textSecondary, lineHeight: 16 },

    blockLabel: { fontSize: 10.5, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 6, marginBottom: 4 },

    kpiRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    kpiName: { flex: 1.4, fontSize: 12, color: Colors.textPrimary },
    kpiTarget: { flex: 1, fontSize: 11, color: Colors.textMuted },
    kpiInput: { flex: 0.8, backgroundColor: Colors.card, borderRadius: 6, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 8, paddingVertical: 6, fontSize: 12, color: Colors.textPrimary },
    kpiPct: { width: 40, fontSize: 12, fontWeight: '800', textAlign: 'right' },

    rationaleBox: { backgroundColor: Colors.card, borderRadius: Radius.sm, padding: Spacing.sm, marginTop: 6 },
    rationaleText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
    suggestedLine: { fontSize: 12, fontWeight: '700', marginTop: 6 },

    decisionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    decisionChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card },
    decisionChipActive: { backgroundColor: Colors.primary + '22', borderColor: Colors.primary },
    decisionChipText: { fontSize: 11.5, fontWeight: '600', color: Colors.textSecondary },
    decisionChipTextActive: { color: Colors.primary },
    decidedNote: { fontSize: 11, color: Colors.textMuted, marginTop: 6, fontStyle: 'italic' },

    addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.primary, borderStyle: 'dashed' },
    addBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },

    formCard: { backgroundColor: Colors.bg, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, ...Shadow.sm },
    formLabel: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, marginBottom: 4, marginTop: 8 },
    formInput: { backgroundColor: Colors.card, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: Colors.textPrimary },
    formInputMultiline: { minHeight: 50, textAlignVertical: 'top' },

    pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card },
    pillActive: { backgroundColor: Colors.primary + '22', borderColor: Colors.primary },
    pillText: { fontSize: 11.5, fontWeight: '600', color: Colors.textSecondary },
    pillTextActive: { color: Colors.primary },

    kpiDraftRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
    addKpiText: { fontSize: 12, fontWeight: '700', color: Colors.primary, marginTop: 2 },

    formActionsRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
    cancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
    cancelBtnText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
    saveBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: Radius.md, backgroundColor: Colors.primary },
    saveBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});
