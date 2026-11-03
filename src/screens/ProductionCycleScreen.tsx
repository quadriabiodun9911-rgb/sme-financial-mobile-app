/**
 * Production Cycles -- cost and profit per unit (bird, loaf, batch, crate --
 * whatever this business produces) for a specific production run. An
 * ordinary P&L answers "what was revenue/COGS for this period"; this
 * answers the question that actually drives a pricing or expansion decision:
 * "what did it cost me to produce ONE of these, and what did I actually make
 * on each one I sold." Built for a poultry operation sizing up a transition
 * from broilers to layers, but the shape -- a date range + a unit count,
 * read against the real transactions already recorded -- generalizes to any
 * batch-production business.
 *
 * Deliberately NOT a new ledger concept: a cycle posts no journal entry and
 * carries no financial weight of its own (see ProductionCycle's own doc
 * comment in types/index.ts) -- it's a lens over transactions that are
 * already real, via computeProductionCycleSummary (productionCycle.ts),
 * which reuses computeEnhancedPnL rather than re-deriving revenue/COGS a
 * second way.
 */
import React, { useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, StyleSheet, TouchableOpacity, TextInput, Modal, Platform, useWindowDimensions } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import Icon from '../components/ui/Icon';
import DateInput from '../components/DateInput';
import SourceOfTruthPanel from '../components/SourceOfTruthPanel';
import { canWriteBusinessData } from '../utils/rolePermissions';
import { computeProductionCycleSummary } from '../utils/productionCycle';
import { classifyExpenseLine } from '../utils/finance';
import { localDateStr } from '../utils/localDate';
import { confirmAction } from '../utils/webAlert';
import { ProductionCycle } from '../types';

function fmt(currency: string, value: number): string {
    const sign = value < 0 ? '-' : '';
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${sign}${currency}${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}${currency}${(abs / 1_000).toFixed(1)}K`;
    return `${sign}${currency}${Math.round(abs).toLocaleString()}`;
}

function fmtFull(currency: string, value: number): string {
    const sign = value < 0 ? '-' : '';
    return `${sign}${currency}${Math.round(Math.abs(value)).toLocaleString()}`;
}

type FormState = { name: string; startDate: string; endDate: string; unitsRaised: string; unitsSold: string; note: string };
const EMPTY_FORM: FormState = { name: '', startDate: localDateStr(), endDate: localDateStr(), unitsRaised: '', unitsSold: '', note: '' };

function SectionCard({ icon, title, subtitle, children }: { icon: string; title: string; subtitle: string; children: React.ReactNode }) {
    return (
        <View style={s.card}>
            <View style={s.cardHead}>
                <View style={s.cardIconWrap}><Icon name={icon as any} size={16} color={Colors.primary} /></View>
                <View style={{ flex: 1 }}>
                    <Text style={s.cardTitle}>{title}</Text>
                    <Text style={s.cardSubtitle}>{subtitle}</Text>
                </View>
            </View>
            {children}
        </View>
    );
}

export default function ProductionCycleScreen() {
    const {
        productionCycles, addProductionCycle, updateProductionCycle, deleteProductionCycle,
        transactions, assets, badDebtProvisions, receivableWriteOffs, inventoryWriteDowns,
        settings, userRole,
    } = useApp();
    const cur = settings.currency || '';
    const canWrite = canWriteBusinessData(userRole);
    const { width: windowWidth } = useWindowDimensions();
    const constrainSheetWidth = Platform.OS === 'web' && windowWidth >= 720;

    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [formError, setFormError] = useState<string | null>(null);

    const sortedCycles = useMemo(
        () => [...productionCycles].sort((a, b) => b.endDate.localeCompare(a.endDate) || b.createdAt.localeCompare(a.createdAt)),
        [productionCycles]
    );

    const summaries = useMemo(
        () => new Map(sortedCycles.map(c => [c.id, computeProductionCycleSummary(c, transactions, assets, badDebtProvisions, receivableWriteOffs, inventoryWriteDowns)])),
        [sortedCycles, transactions, assets, badDebtProvisions, receivableWriteOffs, inventoryWriteDowns]
    );

    const openNew = () => {
        setEditingId(null);
        setForm(EMPTY_FORM);
        setFormError(null);
        setShowForm(true);
    };

    const openEdit = (cycle: ProductionCycle) => {
        setEditingId(cycle.id);
        setForm({
            name: cycle.name, startDate: cycle.startDate, endDate: cycle.endDate,
            unitsRaised: String(cycle.unitsRaised), unitsSold: cycle.unitsSold ? String(cycle.unitsSold) : '',
            note: cycle.note ?? '',
        });
        setFormError(null);
        setShowForm(true);
    };

    const handleSave = () => {
        if (!form.name.trim()) { setFormError('Give this cycle a name, e.g. "Broiler Batch 3".'); return; }
        if (form.endDate < form.startDate) { setFormError('End date must be on or after the start date.'); return; }
        const unitsRaised = parseFloat(form.unitsRaised);
        if (!(unitsRaised > 0)) { setFormError('Enter how many units (birds, loaves, batches) this cycle raised or produced.'); return; }
        const unitsSold = form.unitsSold.trim() ? parseFloat(form.unitsSold) : undefined;
        if (unitsSold !== undefined && !(unitsSold > 0)) { setFormError('Units sold must be a positive number, or left blank.'); return; }

        const payload = {
            name: form.name.trim(), startDate: form.startDate, endDate: form.endDate,
            unitsRaised, unitsSold, note: form.note.trim() || undefined,
        };
        if (editingId) updateProductionCycle(editingId, payload);
        else addProductionCycle(payload);
        setShowForm(false);
        setForm(EMPTY_FORM);
        setEditingId(null);
    };

    const handleDelete = (cycle: ProductionCycle) => {
        confirmAction('Delete Cycle', `Remove "${cycle.name}"? This only removes the cycle record -- none of the underlying transactions are affected.`, 'Delete', () => deleteProductionCycle(cycle.id));
    };

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 48 }}>
                <View style={s.pad}>
                    <View style={s.titleRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={s.title}>Production Cycles</Text>
                            <Text style={s.subtitle}>
                                Cost and profit per unit for a specific batch or run -- built from the transactions you've already recorded, not a separate set of numbers.
                            </Text>
                        </View>
                    </View>

                    {canWrite && (
                        <TouchableOpacity style={s.addBtn} onPress={openNew}>
                            <Icon name="plus" size={14} color="#fff" />
                            <Text style={s.addBtnText}>New Cycle</Text>
                        </TouchableOpacity>
                    )}

                    {sortedCycles.length === 0 ? (
                        <View style={s.emptyBox}>
                            <Icon name="repeat" size={24} color={Colors.textMuted} />
                            <Text style={s.emptyTitle}>No production cycles yet</Text>
                            <Text style={s.emptyText}>
                                Add one for your last (or current) batch -- give it a date range and how many units you raised, and Quad360 will work out the cost and profit per unit from your real recorded transactions.
                            </Text>
                        </View>
                    ) : (
                        sortedCycles.map(cycle => {
                            const summary = summaries.get(cycle.id)!;
                            const expanded = expandedId === cycle.id;
                            const cogsTransactions = summary.transactions.filter(t => t.type === 'expense' && classifyExpenseLine(t.category) === 'cogs');
                            const revenueTransactions = summary.transactions.filter(t => t.type === 'income');
                            return (
                                <View key={cycle.id} style={s.card}>
                                    <TouchableOpacity style={s.cycleHeadRow} onPress={() => setExpandedId(expanded ? null : cycle.id)} activeOpacity={0.7}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.cycleName}>{cycle.name}</Text>
                                            <Text style={s.cycleDates}>{cycle.startDate} → {cycle.endDate} · {cycle.unitsRaised.toLocaleString()} units</Text>
                                        </View>
                                        <View style={s.cycleHeadRight}>
                                            <Text style={s.cycleCostPerUnit}>{fmtFull(cur, summary.costPerUnit)}</Text>
                                            <Text style={s.cycleCostPerUnitLabel}>cost/unit</Text>
                                        </View>
                                        <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
                                    </TouchableOpacity>

                                    {expanded && (
                                        <View style={s.expandedBody}>
                                            <View style={s.metricsGrid}>
                                                <View style={s.metricCell}>
                                                    <Text style={s.metricLabel}>Cost per unit</Text>
                                                    <Text style={s.metricValue}>{fmtFull(cur, summary.costPerUnit)}</Text>
                                                    <Text style={s.metricHint}>Direct production cost only</Text>
                                                </View>
                                                <View style={s.metricCell}>
                                                    <Text style={s.metricLabel}>All-in cost per unit</Text>
                                                    <Text style={s.metricValue}>{fmtFull(cur, summary.allInCostPerUnit)}</Text>
                                                    <Text style={s.metricHint}>Including overhead</Text>
                                                </View>
                                                <View style={s.metricCell}>
                                                    <Text style={s.metricLabel}>Revenue per unit sold</Text>
                                                    <Text style={s.metricValue}>{fmtFull(cur, summary.revenuePerUnitSold)}</Text>
                                                    <Text style={s.metricHint}>{summary.unitsSold.toLocaleString()} units sold</Text>
                                                </View>
                                                <View style={s.metricCell}>
                                                    <Text style={[s.metricValue, s.metricValueLg, { color: summary.profitPerUnitSold >= 0 ? Colors.income : Colors.expense }]}>
                                                        {fmtFull(cur, summary.profitPerUnitSold)}
                                                    </Text>
                                                    <Text style={s.metricLabel}>Profit per unit sold</Text>
                                                </View>
                                            </View>

                                            <View style={s.breakEvenBox}>
                                                <Icon name="target" size={14} color={Colors.warning} />
                                                <Text style={s.breakEvenText}>
                                                    Break-even selling price: <Text style={s.breakEvenAmount}>{fmtFull(cur, summary.breakEvenPricePerUnit)}</Text> per unit -- the minimum to cover direct production cost (doesn't include overhead).
                                                </Text>
                                            </View>

                                            <View style={s.totalsRow}>
                                                <Text style={s.totalsText}>Revenue {fmtFull(cur, summary.revenue)}</Text>
                                                <Text style={s.totalsText}>COGS {fmtFull(cur, summary.cogs)}</Text>
                                                <Text style={s.totalsText}>Overhead {fmtFull(cur, summary.sgaExpenses)}</Text>
                                                <Text style={[s.totalsText, s.totalsBold]}>Gross Profit {fmtFull(cur, summary.grossProfit)}</Text>
                                            </View>

                                            {cogsTransactions.length > 0 && (
                                                <SourceOfTruthPanel
                                                    label="Cost of Goods Sold"
                                                    amount={summary.cogs}
                                                    currency={cur}
                                                    transactions={cogsTransactions}
                                                    periodLabel={`${cycle.startDate} to ${cycle.endDate}`}
                                                />
                                            )}
                                            {revenueTransactions.length > 0 && (
                                                <SourceOfTruthPanel
                                                    label="Revenue"
                                                    amount={summary.revenue}
                                                    currency={cur}
                                                    transactions={revenueTransactions}
                                                    periodLabel={`${cycle.startDate} to ${cycle.endDate}`}
                                                />
                                            )}

                                            {cycle.note ? <Text style={s.cycleNote}>{cycle.note}</Text> : null}

                                            {canWrite && (
                                                <View style={s.cycleActions}>
                                                    <TouchableOpacity style={s.actionBtn} onPress={() => openEdit(cycle)}>
                                                        <Icon name="edit-2" size={13} color={Colors.textPrimary} />
                                                        <Text style={s.actionBtnText}>Edit</Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity style={[s.actionBtn, s.deleteBtn]} onPress={() => handleDelete(cycle)}>
                                                        <Icon name="trash-2" size={13} color={Colors.expense} />
                                                        <Text style={[s.actionBtnText, { color: Colors.expense }]}>Delete</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            )}
                                        </View>
                                    )}
                                </View>
                            );
                        })
                    )}
                </View>
            </ScrollView>
            <FooterNav />

            {/* ── New / Edit Cycle Modal ────────────────────────────────── */}
            <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}>
                <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowForm(false)} />
                <View style={[s.modalSheet, constrainSheetWidth && s.modalSheetWide]}>
                    <View style={s.handle} />
                    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                        <Text style={s.modalTitle}>{editingId ? 'Edit Cycle' : 'New Production Cycle'}</Text>

                        <Text style={s.fieldLabel}>Name</Text>
                        <TextInput
                            style={s.input}
                            placeholder='e.g. "Broiler Batch 3"'
                            placeholderTextColor={Colors.textMuted}
                            value={form.name}
                            onChangeText={v => setForm(f => ({ ...f, name: v }))}
                        />

                        <Text style={s.fieldLabel}>Start Date</Text>
                        <DateInput value={form.startDate} onChange={v => setForm(f => ({ ...f, startDate: v }))} />

                        <Text style={[s.fieldLabel, { marginTop: Spacing.sm }]}>End Date</Text>
                        <DateInput value={form.endDate} onChange={v => setForm(f => ({ ...f, endDate: v }))} />

                        <Text style={[s.fieldLabel, { marginTop: Spacing.sm }]}>Units Raised / Produced</Text>
                        <TextInput
                            style={s.input}
                            placeholder="e.g. 200"
                            placeholderTextColor={Colors.textMuted}
                            keyboardType="numeric"
                            value={form.unitsRaised}
                            onChangeText={v => setForm(f => ({ ...f, unitsRaised: v }))}
                        />

                        <Text style={s.fieldLabel}>Units Sold (optional)</Text>
                        <TextInput
                            style={s.input}
                            placeholder="Leave blank if the whole batch sold within this cycle"
                            placeholderTextColor={Colors.textMuted}
                            keyboardType="numeric"
                            value={form.unitsSold}
                            onChangeText={v => setForm(f => ({ ...f, unitsSold: v }))}
                        />

                        <Text style={s.fieldLabel}>Note (optional)</Text>
                        <TextInput
                            style={[s.input, { minHeight: 60 }]}
                            placeholder="Anything worth remembering about this cycle"
                            placeholderTextColor={Colors.textMuted}
                            multiline
                            value={form.note}
                            onChangeText={v => setForm(f => ({ ...f, note: v }))}
                        />

                        {formError && (
                            <View style={s.warnBox}>
                                <Icon name="alert-triangle" size={14} color={Colors.warning} />
                                <Text style={s.warnText}>{formError}</Text>
                            </View>
                        )}

                        <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
                            <Text style={s.saveBtnText}>{editingId ? 'Save Changes' : 'Add Cycle'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.cancelBtn} onPress={() => setShowForm(false)}>
                            <Text style={s.cancelBtnText}>Cancel</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe:  { flex: 1, backgroundColor: Colors.bg },
    scroll:{ flex: 1 },
    pad:   { padding: Spacing.lg },

    titleRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.md },
    title:    { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
    subtitle: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },

    addBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 12, marginBottom: Spacing.md,
    },
    addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

    emptyBox: { alignItems: 'center', padding: Spacing.xl, backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border },
    emptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginTop: Spacing.sm, marginBottom: 4 },
    emptyText: { fontSize: 12.5, color: Colors.textMuted, textAlign: 'center', lineHeight: 18 },

    card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, marginBottom: Spacing.md, ...Shadow.sm },
    cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.sm },
    cardIconWrap: { width: 32, height: 32, borderRadius: Radius.sm, backgroundColor: Colors.primary + '18', alignItems: 'center', justifyContent: 'center' },
    cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
    cardSubtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },

    cycleHeadRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    cycleName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
    cycleDates: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
    cycleHeadRight: { alignItems: 'flex-end' },
    cycleCostPerUnit: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
    cycleCostPerUnitLabel: { fontSize: 10, color: Colors.textMuted },

    expandedBody: { marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
    metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
    metricCell: { flexBasis: '47%', flexGrow: 1, backgroundColor: Colors.bg, borderRadius: Radius.sm, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
    metricLabel: { fontSize: 10.5, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
    metricValue: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary, marginVertical: 2 },
    metricValueLg: { fontSize: 20 },
    metricHint: { fontSize: 10.5, color: Colors.textMuted },

    breakEvenBox: { flexDirection: 'row', gap: 8, backgroundColor: '#FEF3C7', borderRadius: Radius.sm, padding: Spacing.sm, marginBottom: Spacing.md, alignItems: 'flex-start' },
    breakEvenText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 16 },
    breakEvenAmount: { fontWeight: '800' },

    totalsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginBottom: Spacing.sm },
    totalsText: { fontSize: 11.5, color: Colors.textSecondary },
    totalsBold: { fontWeight: '700', color: Colors.textPrimary },

    cycleNote: { fontSize: 12, color: Colors.textSecondary, fontStyle: 'italic', marginTop: Spacing.xs },

    cycleActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
    actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.muted ?? Colors.bg, borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: Colors.border },
    actionBtnText: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary },
    deleteBtn: { backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.3)' },

    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    modalSheet: {
        backgroundColor: Colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
        paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.xl,
        maxHeight: '88%', position: 'absolute', left: 0, right: 0, bottom: 0,
    },
    modalSheetWide: { maxWidth: 560, left: undefined, right: undefined, alignSelf: 'center', borderRadius: 20 },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: Spacing.md },
    modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.md },

    fieldLabel: { fontSize: 12.5, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
    input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 10, color: Colors.textPrimary, fontSize: 14, marginBottom: Spacing.sm },

    warnBox: { flexDirection: 'row', gap: Spacing.sm, backgroundColor: '#FEF3C7', borderRadius: Radius.sm, padding: Spacing.md, alignItems: 'flex-start', marginTop: Spacing.sm },
    warnText: { flex: 1, fontSize: 12.5, color: '#92400E', lineHeight: 17 },

    saveBtn: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center', marginTop: Spacing.md },
    saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    cancelBtn: { alignItems: 'center', paddingVertical: 12 },
    cancelBtnText: { color: Colors.textMuted, fontWeight: '600', fontSize: 13 },
});
