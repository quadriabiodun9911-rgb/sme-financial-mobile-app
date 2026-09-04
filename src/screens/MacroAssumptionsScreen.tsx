import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, TouchableOpacity, StyleSheet, TextInput, Modal, Platform, useWindowDimensions } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { generateId } from '../utils/uuid';
import { MacroAssumption, MacroDriver, MacroAssumptionConfidence } from '../types';
import { showAlert, confirmAction } from '../utils/webAlert';
import Icon, { IconName } from '../components/ui/Icon';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import { canWriteBusinessData } from '../utils/rolePermissions';

const DRIVER_OPTIONS: { value: MacroDriver; label: string; icon: IconName }[] = [
    { value: 'energy', label: 'Energy', icon: 'zap' },
    { value: 'fx', label: 'FX', icon: 'repeat' },
    { value: 'interestRate', label: 'Interest Rate', icon: 'percent' },
    { value: 'inflation', label: 'Inflation', icon: 'trending-up' },
    { value: 'commodity', label: 'Commodity Price', icon: 'package' },
    { value: 'regulation', label: 'Regulation', icon: 'file-text' },
    { value: 'supplyChain', label: 'Supply Chain', icon: 'truck' },
    { value: 'demand', label: 'Market Demand', icon: 'activity' },
];

const CONFIDENCE_OPTIONS: { value: MacroAssumptionConfidence; label: string; color: string }[] = [
    { value: 'low', label: 'Low — a guess or rumor', color: Colors.expense },
    { value: 'medium', label: 'Medium — heard from someone reliable', color: Colors.warning },
    { value: 'high', label: 'High — from an official source', color: Colors.income },
];

function confidenceMeta(confidence: MacroAssumptionConfidence | undefined) {
    return CONFIDENCE_OPTIONS.find(c => c.value === confidence) ?? null;
}

const DEFAULT_CATEGORIES = [
    'Utilities', 'Fuel', 'Rent', 'Salaries', 'Transport', 'Supplies',
    'Equipment', 'Software', 'Insurance', 'Professional Fees', 'Maintenance', 'Other',
];

function driverMeta(driver: MacroDriver) {
    return DRIVER_OPTIONS.find(d => d.value === driver) ?? DRIVER_OPTIONS[0];
}

export default function MacroAssumptionsScreen() {
    const { transactions, settings, updateSettings, navigate, navParams, userRole } = useApp();
    const assumptions = settings.macroAssumptions ?? [];
    // 'viewer'/'external_accountant' can open this screen (it's on both
    // EXTERNAL_ACCOUNTANT_ALLOWED_SCREENS and VIEWER_ALLOWED_SCREENS in
    // rolePermissions.ts) but are documented as never writing anywhere --
    // adding, editing, and deleting an assumption had no role check at all.
    const canWrite = canWriteBusinessData(userRole);

    // Modal renders via a portal on web, outside App.tsx's width constraint --
    // see FooterNav.tsx for the reference fix. Applied here to the bottom
    // sheet so it doesn't stretch full-bleed on desktop.
    const { width: windowWidth } = useWindowDimensions();
    const constrainSheetWidth = Platform.OS === 'web' && windowWidth >= 720;

    const knownCategories = useMemo(() => {
        const fromTxs = Array.from(new Set(transactions.filter(t => t.type === 'expense').map(t => t.category)));
        return Array.from(new Set([...fromTxs, ...DEFAULT_CATEGORIES])).sort();
    }, [transactions]);

    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [driver, setDriver] = useState<MacroDriver>('energy');
    const [label, setLabel] = useState('');
    const [changePct, setChangePct] = useState('');
    const [periodMonths, setPeriodMonths] = useState('3');
    const [linkedCategories, setLinkedCategories] = useState<string[]>([]);
    const [note, setNote] = useState('');
    const [source, setSource] = useState('');
    const [confidence, setConfidence] = useState<MacroAssumptionConfidence | undefined>(undefined);

    function openAdd() {
        setEditingId(null);
        setDriver('energy');
        setLabel('');
        setChangePct('');
        setPeriodMonths('3');
        setLinkedCategories([]);
        setNote('');
        setSource('');
        setConfidence(undefined);
        setShowForm(true);
    }

    function openEdit(a: MacroAssumption) {
        setEditingId(a.id);
        setDriver(a.driver);
        setLabel(a.label);
        setChangePct(String(a.changePct));
        setPeriodMonths(String(a.periodMonths));
        setLinkedCategories(a.linkedCategories);
        setNote(a.note ?? '');
        setSource(a.source ?? '');
        setConfidence(a.confidence);
        setShowForm(true);
    }

    // Opens a fresh Add form pre-filled from a real, computed suggestion
    // (currently just the live FX-rate card on Risk Management's Economic
    // tab) -- the owner still reviews, links a category, and taps Save
    // themselves; nothing here writes an assumption on its own.
    function openAddPrefilled(p: { driver: MacroDriver; label: string; changePct?: number; periodMonths?: number; source?: string; confidence?: MacroAssumptionConfidence }) {
        setEditingId(null);
        setDriver(p.driver);
        setLabel(p.label);
        setChangePct(p.changePct !== undefined ? String(Math.round(p.changePct * 10) / 10) : '');
        setPeriodMonths(p.periodMonths !== undefined ? String(p.periodMonths) : '3');
        setLinkedCategories([]);
        setNote('');
        setSource(p.source ?? '');
        setConfidence(p.confidence);
        setShowForm(true);
    }

    // Runs once per navigation into this screen with a prefill payload --
    // a ref (not state) tracks whether it's already been consumed so
    // re-renders from typing in the form don't keep re-opening it.
    const consumedPrefill = useRef(false);
    useEffect(() => {
        if (navParams?.prefill && !consumedPrefill.current) {
            consumedPrefill.current = true;
            openAddPrefilled(navParams.prefill);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [navParams]);

    function toggleCategory(cat: string) {
        setLinkedCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
    }

    function handleSave() {
        const trimmedLabel = label.trim();
        const pct = parseFloat(changePct);
        const months = parseInt(periodMonths, 10);

        if (!trimmedLabel) { showAlert('Error', 'Give this assumption a label, e.g. "Diesel price".'); return; }
        if (isNaN(pct)) { showAlert('Error', 'Enter the % change you\'ve observed or expect.'); return; }
        if (!months || months <= 0) { showAlert('Error', 'Enter the number of months that % change applies to.'); return; }
        // Market Demand isn't corroborated against a specific expense
        // category the way a cost driver is (there's nothing in the books
        // to match a demand belief against), so it doesn't require one.
        if (driver !== 'demand' && linkedCategories.length === 0) { showAlert('Error', 'Link at least one expense category so this can be matched against your actual spending.'); return; }

        const next: MacroAssumption = {
            id: editingId ?? generateId(),
            driver,
            label: trimmedLabel,
            changePct: pct,
            periodMonths: months,
            linkedCategories,
            note: note.trim() || undefined,
            source: source.trim() || undefined,
            confidence,
            updatedAt: new Date().toISOString(),
        };

        const updated = editingId
            ? assumptions.map(a => a.id === editingId ? next : a)
            : [...assumptions, next];
        updateSettings({ macroAssumptions: updated });
        setShowForm(false);
    }

    function handleDelete(id: string, lbl: string) {
        confirmAction('Delete Assumption', `Remove "${lbl}"?`, 'Delete', () => {
            updateSettings({ macroAssumptions: assumptions.filter(a => a.id !== id) });
        });
    }

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <View style={s.headerRow}>
                <TouchableOpacity onPress={() => navigate('settings')}>
                    <Text style={s.backBtn}>← Settings</Text>
                </TouchableOpacity>
                <Text style={s.screenTitle}>Macro Assumptions</Text>
                {canWrite && (
                    <TouchableOpacity style={s.addBtn} onPress={openAdd}>
                        <Text style={s.addBtnText}>+ Add</Text>
                    </TouchableOpacity>
                )}
            </View>

            <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
                <Text style={s.subtitle}>
                    Quad360 has no live feed for energy prices, FX, interest rates or inflation — so tell it what
                    you're seeing. Link an assumption to the expense categories it affects, and when that category
                    is also rising in your own transactions, the Cost Exposure tab (Transactions screen) turns the
                    two into a specific, actionable warning instead of a generic headline.
                </Text>

                {assumptions.length === 0 ? (
                    <View style={s.emptyState}>
                        <Text style={s.emptyTitle}>No assumptions yet</Text>
                        <Text style={s.emptySub}>
                            e.g. "Diesel price up 20% this quarter" linked to your Fuel/Utilities category
                        </Text>
                        {canWrite && (
                            <TouchableOpacity style={s.emptyBtn} onPress={openAdd}>
                                <Text style={s.emptyBtnText}>+ Add Your First Assumption</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                ) : (
                    assumptions.map(a => {
                        const meta = driverMeta(a.driver);
                        return (
                            <TouchableOpacity key={a.id} style={s.card} onPress={canWrite ? () => openEdit(a) : undefined} activeOpacity={canWrite ? 0.7 : 1}>
                                <View style={s.cardHeaderRow}>
                                    <Icon name={meta.icon} size={20} color={Colors.textSecondary} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.cardLabel}>{a.label}</Text>
                                        <Text style={s.cardDriver}>{meta.label}</Text>
                                    </View>
                                    <Text style={[s.cardChange, { color: (a.changePct >= 0) === (a.driver === 'demand') ? Colors.income : Colors.expense }]}>
                                        {a.changePct >= 0 ? '+' : ''}{a.changePct}% / {a.periodMonths}mo
                                    </Text>
                                </View>
                                <View style={s.chipRow}>
                                    {a.driver === 'demand'
                                        ? <View style={s.catChip}><Text style={s.catChipText}>Applies business-wide</Text></View>
                                        : a.linkedCategories.map(c => (
                                            <View key={c} style={s.catChip}><Text style={s.catChipText}>{c}</Text></View>
                                        ))}
                                </View>
                                {a.note ? <Text style={s.cardNote}>{a.note}</Text> : null}
                                <View style={s.metaRow}>
                                    <Text style={s.cardUpdated}>
                                        {a.source ? `Source: ${a.source} · ` : 'Source not recorded · '}
                                        Updated {new Date(a.updatedAt).toLocaleDateString()}
                                    </Text>
                                    {confidenceMeta(a.confidence) && (
                                        <View style={[s.confidenceBadge, { backgroundColor: confidenceMeta(a.confidence)!.color + '22' }]}>
                                            <Text style={[s.confidenceBadgeText, { color: confidenceMeta(a.confidence)!.color }]}>
                                                {a.confidence} confidence
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            </TouchableOpacity>
                        );
                    })
                )}
            </ScrollView>

            <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}>
                <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowForm(false)} />
                <View style={[s.sheet, constrainSheetWidth && s.sheetWide]}>
                    <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
                        <View style={s.sheetHandle} />
                        <Text style={s.sheetTitle}>{editingId ? 'Edit Assumption' : 'Add Assumption'}</Text>

                        <Text style={s.fieldLabel}>What kind of factor is this?</Text>
                        <View style={s.driverGrid}>
                            {DRIVER_OPTIONS.map(opt => (
                                <TouchableOpacity
                                    key={opt.value}
                                    style={[s.driverChip, driver === opt.value && s.driverChipActive]}
                                    onPress={() => setDriver(opt.value)}
                                >
                                    <View style={s.driverChipInner}>
                                        <Icon name={opt.icon} size={14} color={driver === opt.value ? Colors.primary : Colors.textSecondary} />
                                        <Text style={[s.driverChipText, driver === opt.value && s.driverChipTextActive]}>{opt.label}</Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <TextInput
                            style={s.input}
                            placeholder='Label, e.g. "Diesel price"'
                            placeholderTextColor={Colors.textMuted}
                            value={label}
                            onChangeText={setLabel}
                        />
                        {driver === 'demand' && (
                            <Text style={s.demandHint}>For Market Demand, a positive % means demand is strengthening — the opposite of a cost driver, where positive means costs are rising.</Text>
                        )}
                        <View style={s.row2}>
                            <TextInput
                                style={[s.input, { flex: 1 }]}
                                placeholder="% change"
                                placeholderTextColor={Colors.textMuted}
                                keyboardType="numbers-and-punctuation"
                                value={changePct}
                                onChangeText={setChangePct}
                            />
                            <TextInput
                                style={[s.input, { flex: 1 }]}
                                placeholder="Over how many months"
                                placeholderTextColor={Colors.textMuted}
                                keyboardType="number-pad"
                                value={periodMonths}
                                onChangeText={setPeriodMonths}
                            />
                        </View>

                        {driver !== 'demand' && (
                            <>
                                <Text style={s.fieldLabel}>Which expense categories does this affect?</Text>
                                <View style={s.chipRow}>
                                    {knownCategories.map(cat => (
                                        <TouchableOpacity
                                            key={cat}
                                            style={[s.catChip, linkedCategories.includes(cat) && s.catChipActive]}
                                            onPress={() => toggleCategory(cat)}
                                        >
                                            <Text style={[s.catChipText, linkedCategories.includes(cat) && s.catChipTextActive]}>{cat}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </>
                        )}

                        <Text style={s.fieldLabel}>Where did this come from?</Text>
                        <TextInput
                            style={s.input}
                            placeholder='e.g. "NNPC pump price bulletin" or "Heard from my supplier"'
                            placeholderTextColor={Colors.textMuted}
                            value={source}
                            onChangeText={setSource}
                        />

                        <Text style={s.fieldLabel}>How sure are you of this figure?</Text>
                        <View style={s.chipRow}>
                            {CONFIDENCE_OPTIONS.map(opt => (
                                <TouchableOpacity
                                    key={opt.value}
                                    style={[s.catChip, confidence === opt.value && { backgroundColor: opt.color + '20', borderColor: opt.color }]}
                                    onPress={() => setConfidence(confidence === opt.value ? undefined : opt.value)}
                                >
                                    <Text style={[s.catChipText, confidence === opt.value && { color: opt.color, fontWeight: '700' }]}>{opt.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <TextInput
                            style={[s.input, s.noteInput]}
                            placeholder="Note (optional)"
                            placeholderTextColor={Colors.textMuted}
                            value={note}
                            onChangeText={setNote}
                            multiline
                        />

                        <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
                            <Text style={s.saveBtnText}>{editingId ? 'Save Changes' : 'Add Assumption'}</Text>
                        </TouchableOpacity>

                        {editingId && (
                            <TouchableOpacity style={s.deleteBtn} onPress={() => {
                                const a = assumptions.find(a => a.id === editingId);
                                if (a) { setShowForm(false); setTimeout(() => handleDelete(a.id, a.label), 300); }
                            }}>
                                <Text style={s.deleteBtnText}>Delete Assumption</Text>
                            </TouchableOpacity>
                        )}
                    </ScrollView>
                </View>
            </Modal>

            <FooterNav />
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1, backgroundColor: Colors.bg },
    pad: { padding: Spacing.lg, paddingBottom: 100 },

    headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, gap: Spacing.md },
    backBtn: { color: Colors.primary, fontSize: 14 },
    screenTitle: { flex: 1, fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary },
    addBtn: { backgroundColor: Colors.primary, borderRadius: Radius.sm, paddingHorizontal: 14, paddingVertical: 7 },
    addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

    subtitle: { fontSize: 12, color: Colors.textMuted, marginBottom: Spacing.lg, lineHeight: 17 },

    emptyState: { alignItems: 'center', padding: Spacing.xxxl, backgroundColor: Colors.surface, borderRadius: 14 },
    emptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
    emptySub: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', marginBottom: Spacing.lg },
    emptyBtn: { backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
    emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

    card: {
        backgroundColor: Colors.surface, borderRadius: 14, padding: Spacing.lg, marginBottom: Spacing.md,
        borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
    },
    cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: Spacing.sm },
    cardIcon: { fontSize: 20 },
    cardLabel: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
    cardDriver: { fontSize: 11, color: Colors.textMuted },
    cardChange: { fontSize: 13, fontWeight: '700' },
    cardNote: { fontSize: 12, color: Colors.textSecondary, marginTop: 6, lineHeight: 17 },
    cardUpdated: { fontSize: 10, color: Colors.textMuted, marginTop: Spacing.sm },
    metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm, flexWrap: 'wrap', gap: 6 },
    confidenceBadge: { borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
    confidenceBadgeText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },

    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    catChip: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 6 },
    catChipActive: { backgroundColor: Colors.primary + '20', borderColor: Colors.primary },
    catChipText: { fontSize: 11, color: Colors.textSecondary },
    catChipTextActive: { color: Colors.primary, fontWeight: '700' },

    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.xxl, paddingBottom: 30, maxHeight: '85%' },
    sheetWide: { maxWidth: 560, width: '100%', alignSelf: 'center' },
    sheetHandle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.lg },
    sheetTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.lg },

    fieldLabel: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, marginBottom: Spacing.sm, marginTop: Spacing.xs },
    demandHint: { fontSize: 11.5, color: Colors.textMuted, lineHeight: 16, marginBottom: Spacing.sm },
    driverGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: 14 },
    driverChip: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: Spacing.sm },
    driverChipActive: { backgroundColor: Colors.primary + '20', borderColor: Colors.primary },
    driverChipInner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    driverChipText: { fontSize: 12, color: Colors.textSecondary },
    driverChipTextActive: { color: Colors.primary, fontWeight: '700' },

    row2: { flexDirection: 'row', gap: 10 },
    input: { backgroundColor: Colors.bg, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, color: Colors.textPrimary, marginBottom: Spacing.md, fontSize: 14 },
    noteInput: { minHeight: 60, textAlignVertical: 'top', marginTop: 14 },

    saveBtn: { backgroundColor: Colors.primary, borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 10, marginTop: 6 },
    saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    deleteBtn: { borderRadius: 10, padding: Spacing.md, alignItems: 'center' },
    deleteBtnText: { color: Colors.expense, fontWeight: '600', fontSize: 14 },
});
