import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Colors } from '../theme/colors';
import { InventoryItem } from '../types';
import { computeProductionCost, ProductionCostVerdict } from '../utils/productionCost';

interface SelectedMaterial {
    inventoryItemId: string;
    quantity: string;
}

interface SavedBatch {
    id: string;
    name: string;
    unitsProduced: number;
    sellingPricePerUnit: number;
    costPerUnit: number;
    marginPct: number;
    verdict: ProductionCostVerdict;
}

const MAX_SAVED = 5;

const VERDICT_COLOR: Record<ProductionCostVerdict, string> = {
    healthy: Colors.income,
    caution: Colors.warning,
    high: Colors.expense,
};

const VERDICT_LABEL: Record<ProductionCostVerdict, string> = {
    healthy: '🟢 Healthy',
    caution: '🟡 Caution',
    high: '🔴 High Risk',
};

interface Props {
    inventory: InventoryItem[];
    currency: string;
}

// Raw materials come straight from Inventory — same cost-per-unit data
// used everywhere else, not a second list a user has to keep in sync.
export default function ProductionCostCalculator({ inventory, currency }: Props) {
    // A business's own finished product is never a valid input into
    // building itself -- excluded from the picker once an item is
    // explicitly tagged Finished Good (InventoryItem.itemType). Untagged
    // items still show up here: this is additive, not a requirement to
    // tag everything before the calculator works.
    const rawMaterialCandidates = useMemo(
        () => inventory.filter(i => i.itemType !== 'finished_good'),
        [inventory],
    );
    const [batchName, setBatchName] = useState('');
    const [unitsProduced, setUnitsProduced] = useState('');
    const [laborCost, setLaborCost] = useState('');
    const [overheadCost, setOverheadCost] = useState('');
    const [sellingPricePerUnit, setSellingPricePerUnit] = useState('');
    const [selected, setSelected] = useState<SelectedMaterial[]>([]);
    const [savedBatches, setSavedBatches] = useState<SavedBatch[]>([]);

    const toggleMaterial = (itemId: string) => {
        setSelected(prev =>
            prev.some(s => s.inventoryItemId === itemId)
                ? prev.filter(s => s.inventoryItemId !== itemId)
                : [...prev, { inventoryItemId: itemId, quantity: '1' }],
        );
    };

    const setQuantity = (itemId: string, qty: string) => {
        setSelected(prev => prev.map(s => (s.inventoryItemId === itemId ? { ...s, quantity: qty } : s)));
    };

    const materials = useMemo(() => {
        return selected.map(s => {
            const item = inventory.find(i => i.id === s.inventoryItemId);
            return {
                name: item?.name ?? 'Unknown item',
                quantityPerBatch: parseFloat(s.quantity) || 0,
                costPerUnit: item?.costPrice ?? 0,
            };
        });
    }, [selected, inventory]);

    const result = useMemo(
        () => computeProductionCost(
            parseFloat(unitsProduced) || 0,
            materials,
            parseFloat(laborCost) || 0,
            parseFloat(overheadCost) || 0,
            parseFloat(sellingPricePerUnit) || 0,
        ),
        [unitsProduced, materials, laborCost, overheadCost, sellingPricePerUnit],
    );

    const hasBatch = selected.length > 0 && (parseFloat(unitsProduced) || 0) > 0 && (parseFloat(sellingPricePerUnit) || 0) > 0;

    const saveBatch = () => {
        if (!hasBatch || savedBatches.length >= MAX_SAVED) return;
        setSavedBatches(prev => [...prev, {
            id: `${Date.now()}`,
            name: batchName.trim() || `Batch ${prev.length + 1}`,
            unitsProduced: parseFloat(unitsProduced) || 0,
            sellingPricePerUnit: parseFloat(sellingPricePerUnit) || 0,
            costPerUnit: result.costPerUnit,
            marginPct: result.marginPct,
            verdict: result.verdict,
        }]);
        setBatchName('');
    };

    const removeBatch = (id: string) => {
        setSavedBatches(prev => prev.filter(b => b.id !== id));
    };

    if (rawMaterialCandidates.length === 0) {
        return (
            <View style={s.card}>
                <Text style={s.title}>🏭 Production / Unit Cost Calculator</Text>
                <Text style={s.emptyHint}>
                    {inventory.length === 0
                        ? 'Add raw materials to Inventory first — this builds a batch\'s unit cost from the same cost-per-unit data already tracked there.'
                        : 'Everything in Inventory is currently tagged Finished Good — add or re-tag at least one raw material to build a batch from.'}
                </Text>
            </View>
        );
    }

    return (
        <View style={s.card}>
            <Text style={s.title}>🏭 Production / Unit Cost Calculator</Text>
            <Text style={s.subtitle}>
                Pick the raw materials in a production batch, add labour and overhead, and see cost per unit, margin, and how many units you need to sell to break even.
            </Text>

            <Text style={s.fieldLabel}>Batch / Product Name</Text>
            <TextInput
                style={s.input}
                value={batchName}
                onChangeText={setBatchName}
                placeholder="e.g. Smartwatch Model X — batch 12"
                placeholderTextColor={Colors.textMuted}
            />

            <View style={s.row}>
                <View style={s.flex}>
                    <Text style={s.fieldLabel}>Units Produced</Text>
                    <TextInput
                        style={s.input}
                        value={unitsProduced}
                        onChangeText={setUnitsProduced}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={Colors.textMuted}
                    />
                </View>
                <View style={s.flex}>
                    <Text style={s.fieldLabel}>Selling Price / Unit</Text>
                    <View style={s.inputWrap}>
                        <Text style={s.affix}>{currency}</Text>
                        <TextInput
                            style={s.priceInput}
                            value={sellingPricePerUnit}
                            onChangeText={setSellingPricePerUnit}
                            keyboardType="decimal-pad"
                            placeholder="0"
                            placeholderTextColor={Colors.textMuted}
                        />
                    </View>
                </View>
            </View>

            <View style={s.row}>
                <View style={s.flex}>
                    <Text style={s.fieldLabel}>Labour Cost (batch)</Text>
                    <View style={s.inputWrap}>
                        <Text style={s.affix}>{currency}</Text>
                        <TextInput
                            style={s.priceInput}
                            value={laborCost}
                            onChangeText={setLaborCost}
                            keyboardType="decimal-pad"
                            placeholder="0"
                            placeholderTextColor={Colors.textMuted}
                        />
                    </View>
                </View>
                <View style={s.flex}>
                    <Text style={s.fieldLabel}>Overhead Cost (batch)</Text>
                    <View style={s.inputWrap}>
                        <Text style={s.affix}>{currency}</Text>
                        <TextInput
                            style={s.priceInput}
                            value={overheadCost}
                            onChangeText={setOverheadCost}
                            keyboardType="decimal-pad"
                            placeholder="0"
                            placeholderTextColor={Colors.textMuted}
                        />
                    </View>
                </View>
            </View>

            <Text style={s.fieldLabel}>Raw Materials (from Inventory)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll}>
                <View style={s.chipRow}>
                    {rawMaterialCandidates.map(item => {
                        const isSelected = selected.some(sm => sm.inventoryItemId === item.id);
                        return (
                            <TouchableOpacity
                                key={item.id}
                                style={[s.chip, isSelected && s.chipSelected]}
                                onPress={() => toggleMaterial(item.id)}
                            >
                                <Text style={[s.chipText, isSelected && s.chipTextSelected]}>{item.name}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </ScrollView>

            {selected.map(sm => {
                const item = inventory.find(i => i.id === sm.inventoryItemId);
                return (
                    <View key={sm.inventoryItemId} style={s.materialRow}>
                        <Text style={s.materialName}>{item?.name ?? 'Unknown'}</Text>
                        <TextInput
                            style={s.qtyInput}
                            value={sm.quantity}
                            onChangeText={v => setQuantity(sm.inventoryItemId, v)}
                            keyboardType="decimal-pad"
                            placeholder="1"
                            placeholderTextColor={Colors.textMuted}
                        />
                        <Text style={s.materialUnit}>{item?.unit ?? ''}/batch</Text>
                        <Text style={s.materialCost}>
                            {currency}{((parseFloat(sm.quantity) || 0) * (item?.costPrice ?? 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </Text>
                    </View>
                );
            })}

            {hasBatch && (
                <>
                    <View style={s.statRow}>
                        <View style={s.stat}>
                            <Text style={s.statLabel}>Cost / Unit</Text>
                            <Text style={s.statVal}>{currency}{result.costPerUnit.toLocaleString(undefined, { maximumFractionDigits: 2 })}</Text>
                        </View>
                        <View style={s.stat}>
                            <Text style={s.statLabel}>Margin</Text>
                            <Text style={[s.statVal, { color: VERDICT_COLOR[result.verdict] }]}>{result.marginPct.toFixed(1)}%</Text>
                        </View>
                        <View style={s.stat}>
                            <Text style={s.statLabel}>Break-Even</Text>
                            <Text style={s.statVal}>{isFinite(result.breakEvenUnits) ? `${result.breakEvenUnits} units` : '—'}</Text>
                        </View>
                    </View>

                    <View style={[s.verdictBox, { borderColor: VERDICT_COLOR[result.verdict] }]}>
                        <Text style={[s.verdictLabel, { color: VERDICT_COLOR[result.verdict] }]}>{VERDICT_LABEL[result.verdict]}</Text>
                        <Text style={s.verdictReason}>{result.reason}</Text>
                    </View>
                </>
            )}
            {!hasBatch && (
                <Text style={s.emptyHint}>Pick at least one material, units produced, and a selling price to see cost per unit.</Text>
            )}

            {hasBatch && savedBatches.length < MAX_SAVED && (
                <TouchableOpacity style={s.saveBtn} onPress={saveBatch}>
                    <Text style={s.saveBtnText}>Save Batch</Text>
                </TouchableOpacity>
            )}

            {savedBatches.length > 0 && (
                <View style={s.savedSection}>
                    <Text style={s.savedTitle}>Saved Batches</Text>
                    {savedBatches.map(b => (
                        <View key={b.id} style={s.savedRow}>
                            <View style={s.flex}>
                                <Text style={s.savedName}>{b.name}</Text>
                                <Text style={s.savedMeta}>{b.unitsProduced} units · {currency}{b.costPerUnit.toFixed(2)}/unit · {b.marginPct.toFixed(1)}% margin</Text>
                            </View>
                            <View style={[s.savedBadge, { backgroundColor: VERDICT_COLOR[b.verdict] + '22' }]}>
                                <Text style={[s.savedBadgeText, { color: VERDICT_COLOR[b.verdict] }]}>{VERDICT_LABEL[b.verdict]}</Text>
                            </View>
                            <TouchableOpacity onPress={() => removeBatch(b.id)} style={s.removeBtn}>
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
    input: { backgroundColor: Colors.bg, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.textPrimary, marginBottom: 8 },
    inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bg, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, marginBottom: 8 },
    affix: { fontSize: 14, color: Colors.textMuted, fontWeight: '600' },
    priceInput: { flex: 1, paddingVertical: 10, paddingHorizontal: 6, fontSize: 15, color: Colors.textPrimary },

    chipScroll: { marginBottom: 8 },
    chipRow: { flexDirection: 'row', gap: 8 },
    chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border },
    chipSelected: { backgroundColor: Colors.primary + '20', borderColor: Colors.primary },
    chipText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
    chipTextSelected: { color: Colors.primary },

    materialRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
    materialName: { flex: 1, fontSize: 12.5, color: Colors.textPrimary },
    qtyInput: { width: 50, backgroundColor: Colors.bg, borderRadius: 6, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 6, paddingVertical: 4, fontSize: 12, color: Colors.textPrimary, textAlign: 'center' },
    materialUnit: { fontSize: 10.5, color: Colors.textMuted, width: 60 },
    materialCost: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, width: 70, textAlign: 'right' },

    statRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    stat: { flex: 1, backgroundColor: Colors.bg, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 10 },
    statLabel: { fontSize: 10.5, color: Colors.textMuted, marginBottom: 4, lineHeight: 14 },
    statVal: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },

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
