import React, { useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, TouchableOpacity, StyleSheet, TextInput, Modal, Platform, useWindowDimensions } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { generateId } from '../utils/uuid';
import { FutureEvent, FutureEventCategory } from '../types';
import { showAlert, confirmAction } from '../utils/webAlert';
import Icon, { IconName } from '../components/ui/Icon';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import { localDateStr } from '../utils/localDate';

const CATEGORY_OPTIONS: { value: FutureEventCategory; label: string; icon: IconName }[] = [
    { value: 'expansion', label: 'Expansion', icon: 'trending-up' },
    { value: 'hiring', label: 'Hiring', icon: 'users' },
    { value: 'contract', label: 'Contract', icon: 'file-text' },
    { value: 'equipment', label: 'Equipment', icon: 'tool' },
    { value: 'marketing', label: 'Marketing', icon: 'volume-2' },
    { value: 'other', label: 'Other', icon: 'more-horizontal' },
];

function categoryMeta(category: FutureEventCategory) {
    return CATEGORY_OPTIONS.find(c => c.value === category) ?? CATEGORY_OPTIONS[CATEGORY_OPTIONS.length - 1];
}

function todayIso(): string {
    return localDateStr();
}

export default function FutureEventsScreen() {
    const { settings, updateSettings, navigate } = useApp();
    const events = settings.futureEvents ?? [];
    const currency = settings.currency || '₦';

    // Modal renders via a portal on web, outside App.tsx's width constraint --
    // see FooterNav.tsx for the reference fix. Applied here to the bottom
    // sheet so it doesn't stretch full-bleed on desktop.
    const { width: windowWidth } = useWindowDimensions();
    const constrainSheetWidth = Platform.OS === 'web' && windowWidth >= 720;

    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [category, setCategory] = useState<FutureEventCategory>('expansion');
    const [label, setLabel] = useState('');
    const [amount, setAmount] = useState('');
    const [direction, setDirection] = useState<'inflow' | 'outflow'>('outflow');
    const [recurring, setRecurring] = useState(false);
    const [date, setDate] = useState(todayIso());
    const [note, setNote] = useState('');

    function openAdd() {
        setEditingId(null);
        setCategory('expansion');
        setLabel('');
        setAmount('');
        setDirection('outflow');
        setRecurring(false);
        setDate(todayIso());
        setNote('');
        setShowForm(true);
    }

    function openEdit(ev: FutureEvent) {
        setEditingId(ev.id);
        setCategory(ev.category);
        setLabel(ev.label);
        setAmount(String(ev.amount));
        setDirection(ev.direction);
        setRecurring(ev.recurring);
        setDate(ev.date);
        setNote(ev.note ?? '');
        setShowForm(true);
    }

    function handleSave() {
        const trimmedLabel = label.trim();
        const amt = parseFloat(amount);

        if (!trimmedLabel) { showAlert('Error', 'Give this event a label, e.g. "New branch opening".'); return; }
        if (isNaN(amt) || amt <= 0) { showAlert('Error', 'Enter the amount this event is expected to move.'); return; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { showAlert('Error', 'Enter the date as YYYY-MM-DD.'); return; }

        const next: FutureEvent = {
            id: editingId ?? generateId(),
            label: trimmedLabel,
            category,
            amount: amt,
            direction,
            recurring,
            date,
            note: note.trim() || undefined,
            createdAt: editingId ? (events.find(e => e.id === editingId)?.createdAt ?? new Date().toISOString()) : new Date().toISOString(),
        };

        const updated = editingId
            ? events.map(e => e.id === editingId ? next : e)
            : [...events, next];
        updateSettings({ futureEvents: updated });
        setShowForm(false);
    }

    function handleDelete(id: string, lbl: string) {
        confirmAction('Delete Event', `Remove "${lbl}"?`, 'Delete', () => {
            updateSettings({ futureEvents: events.filter(e => e.id !== id) });
        });
    }

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <View style={s.headerRow}>
                <TouchableOpacity onPress={() => navigate('settings')}>
                    <Text style={s.backBtn}>← Settings</Text>
                </TouchableOpacity>
                <Text style={s.screenTitle}>Known Future Events</Text>
                <TouchableOpacity style={s.addBtn} onPress={openAdd}>
                    <Text style={s.addBtnText}>+ Add</Text>
                </TouchableOpacity>
            </View>

            <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
                <Text style={s.subtitle}>
                    Plans you already know about — a new branch, a hire, a signed contract, an equipment purchase —
                    aren't in your transaction history yet, so the forecast can't see them unless you tell it. Add
                    them here and they'll land in the exact month you specify, never applied silently.
                </Text>

                {events.length === 0 ? (
                    <View style={s.emptyState}>
                        <Text style={s.emptyTitle}>No future events yet</Text>
                        <Text style={s.emptySub}>
                            e.g. "New generator" — a one-time {currency}500,000 outflow next month
                        </Text>
                        <TouchableOpacity style={s.emptyBtn} onPress={openAdd}>
                            <Text style={s.emptyBtnText}>+ Add Your First Event</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    events.map(ev => {
                        const meta = categoryMeta(ev.category);
                        return (
                            <TouchableOpacity key={ev.id} style={s.card} onPress={() => openEdit(ev)}>
                                <View style={s.cardHeaderRow}>
                                    <Icon name={meta.icon} size={20} color={Colors.textSecondary} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.cardLabel}>{ev.label}</Text>
                                        <Text style={s.cardDriver}>{meta.label} · {new Date(`${ev.date}T00:00:00`).toLocaleDateString()}</Text>
                                    </View>
                                    <Text style={[s.cardChange, { color: ev.direction === 'inflow' ? Colors.income : Colors.expense }]}>
                                        {ev.direction === 'inflow' ? '+' : '-'}{currency}{ev.amount.toLocaleString()}
                                    </Text>
                                </View>
                                <View style={s.chipRow}>
                                    <View style={s.catChip}><Text style={s.catChipText}>{ev.recurring ? 'Recurring' : 'One-time'}</Text></View>
                                </View>
                                {ev.note ? <Text style={s.cardNote}>{ev.note}</Text> : null}
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
                        <Text style={s.sheetTitle}>{editingId ? 'Edit Event' : 'Add Future Event'}</Text>

                        <Text style={s.fieldLabel}>What kind of event is this?</Text>
                        <View style={s.driverGrid}>
                            {CATEGORY_OPTIONS.map(opt => (
                                <TouchableOpacity
                                    key={opt.value}
                                    style={[s.driverChip, category === opt.value && s.driverChipActive]}
                                    onPress={() => setCategory(opt.value)}
                                >
                                    <View style={s.driverChipInner}>
                                        <Icon name={opt.icon} size={14} color={category === opt.value ? Colors.primary : Colors.textSecondary} />
                                        <Text style={[s.driverChipText, category === opt.value && s.driverChipTextActive]}>{opt.label}</Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <TextInput
                            style={s.input}
                            placeholder='Label, e.g. "New branch opening"'
                            placeholderTextColor={Colors.textMuted}
                            value={label}
                            onChangeText={setLabel}
                        />

                        <View style={s.row2}>
                            <TouchableOpacity
                                style={[s.toggleChip, direction === 'inflow' && s.toggleChipActiveIncome]}
                                onPress={() => setDirection('inflow')}
                            >
                                <Text style={[s.toggleChipText, direction === 'inflow' && s.toggleChipTextActive]}>Money in</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[s.toggleChip, direction === 'outflow' && s.toggleChipActiveExpense]}
                                onPress={() => setDirection('outflow')}
                            >
                                <Text style={[s.toggleChipText, direction === 'outflow' && s.toggleChipTextActive]}>Money out</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={s.row2}>
                            <TextInput
                                style={[s.input, { flex: 1 }]}
                                placeholder={`Amount (${currency})`}
                                placeholderTextColor={Colors.textMuted}
                                keyboardType="numeric"
                                value={amount}
                                onChangeText={setAmount}
                            />
                            <TextInput
                                style={[s.input, { flex: 1 }]}
                                placeholder="YYYY-MM-DD"
                                placeholderTextColor={Colors.textMuted}
                                value={date}
                                onChangeText={setDate}
                            />
                        </View>

                        <TouchableOpacity style={s.row2} onPress={() => setRecurring(!recurring)}>
                            <View style={[s.checkbox, recurring && s.checkboxActive]}>
                                {recurring && <Icon name="check" size={12} color="#fff" />}
                            </View>
                            <Text style={s.checkboxLabel}>Recurring every month from this date onward (leave unchecked for a one-time event)</Text>
                        </TouchableOpacity>

                        <TextInput
                            style={[s.input, s.noteInput]}
                            placeholder="Note (optional)"
                            placeholderTextColor={Colors.textMuted}
                            value={note}
                            onChangeText={setNote}
                            multiline
                        />

                        <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
                            <Text style={s.saveBtnText}>{editingId ? 'Save Changes' : 'Add Event'}</Text>
                        </TouchableOpacity>

                        {editingId && (
                            <TouchableOpacity style={s.deleteBtn} onPress={() => {
                                const ev = events.find(e => e.id === editingId);
                                if (ev) { setShowForm(false); setTimeout(() => handleDelete(ev.id, ev.label), 300); }
                            }}>
                                <Text style={s.deleteBtnText}>Delete Event</Text>
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
    cardLabel: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
    cardDriver: { fontSize: 11, color: Colors.textMuted },
    cardChange: { fontSize: 13, fontWeight: '700' },
    cardNote: { fontSize: 12, color: Colors.textSecondary, marginTop: 6, lineHeight: 17 },

    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    catChip: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 6 },
    catChipText: { fontSize: 11, color: Colors.textSecondary },

    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.xxl, paddingBottom: 30, maxHeight: '85%' },
    sheetWide: { maxWidth: 560, width: '100%', alignSelf: 'center' },
    sheetHandle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.lg },
    sheetTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.lg },

    fieldLabel: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, marginBottom: Spacing.sm, marginTop: Spacing.xs },
    driverGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: 14 },
    driverChip: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: Spacing.sm },
    driverChipActive: { backgroundColor: Colors.primary + '20', borderColor: Colors.primary },
    driverChipInner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    driverChipText: { fontSize: 12, color: Colors.textSecondary },
    driverChipTextActive: { color: Colors.primary, fontWeight: '700' },

    row2: { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: Spacing.md },
    input: { backgroundColor: Colors.bg, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, color: Colors.textPrimary, fontSize: 14 },
    noteInput: { minHeight: 60, textAlignVertical: 'top', marginBottom: Spacing.md },

    toggleChip: { flex: 1, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingVertical: Spacing.md, alignItems: 'center' },
    toggleChipActiveIncome: { backgroundColor: Colors.income + '20', borderColor: Colors.income },
    toggleChipActiveExpense: { backgroundColor: Colors.expense + '20', borderColor: Colors.expense },
    toggleChipText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
    toggleChipTextActive: { color: Colors.textPrimary, fontWeight: '700' },

    checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg },
    checkboxActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    checkboxLabel: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 16 },

    saveBtn: { backgroundColor: Colors.primary, borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 10, marginTop: 6 },
    saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    deleteBtn: { borderRadius: 10, padding: Spacing.md, alignItems: 'center' },
    deleteBtnText: { color: Colors.expense, fontWeight: '600', fontSize: 14 },
});
