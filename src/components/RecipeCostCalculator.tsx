import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Colors } from '../theme/colors';
import { InventoryItem } from '../types';
import { computeRecipeCost, FoodCostVerdict } from '../utils/recipeCost';

interface SelectedIngredient {
    inventoryItemId: string;
    quantity: string;
}

interface SavedRecipe {
    id: string;
    name: string;
    sellingPrice: number;
    ingredients: { name: string; quantity: number; costPerUnit: number }[];
    foodCostPct: number;
    verdict: FoodCostVerdict;
}

const MAX_SAVED = 5;

const VERDICT_COLOR: Record<FoodCostVerdict, string> = {
    excellent: Colors.income,
    healthy: Colors.income,
    caution: Colors.warning,
    high: Colors.expense,
};

const VERDICT_LABEL: Record<FoodCostVerdict, string> = {
    excellent: '🟢 Excellent',
    healthy: '🟢 Healthy',
    caution: '🟡 Caution',
    high: '🔴 High',
};

interface Props {
    inventory: InventoryItem[];
    currency: string;
}

// Every ingredient here IS an Inventory item — a menu item's food cost is
// built from the same cost-per-unit data already tracked for stock,
// rather than a second, disconnected ingredient list a user would have to
// keep in sync by hand.
export default function RecipeCostCalculator({ inventory, currency }: Props) {
    const [recipeName, setRecipeName] = useState('');
    const [sellingPrice, setSellingPrice] = useState('');
    const [selected, setSelected] = useState<SelectedIngredient[]>([]);
    const [savedRecipes, setSavedRecipes] = useState<SavedRecipe[]>([]);

    const toggleIngredient = (itemId: string) => {
        setSelected(prev =>
            prev.some(s => s.inventoryItemId === itemId)
                ? prev.filter(s => s.inventoryItemId !== itemId)
                : [...prev, { inventoryItemId: itemId, quantity: '1' }],
        );
    };

    const setQuantity = (itemId: string, qty: string) => {
        setSelected(prev => prev.map(s => (s.inventoryItemId === itemId ? { ...s, quantity: qty } : s)));
    };

    const ingredientCosts = useMemo(() => {
        return selected.map(s => {
            const item = inventory.find(i => i.id === s.inventoryItemId);
            return {
                name: item?.name ?? 'Unknown item',
                quantity: parseFloat(s.quantity) || 0,
                costPerUnit: item?.costPrice ?? 0,
            };
        });
    }, [selected, inventory]);

    const result = useMemo(
        () => computeRecipeCost(parseFloat(sellingPrice) || 0, ingredientCosts),
        [sellingPrice, ingredientCosts],
    );

    const hasRecipe = selected.length > 0 && (parseFloat(sellingPrice) || 0) > 0;

    const saveRecipe = () => {
        if (!hasRecipe || savedRecipes.length >= MAX_SAVED) return;
        setSavedRecipes(prev => [...prev, {
            id: `${Date.now()}`,
            name: recipeName.trim() || `Menu item ${prev.length + 1}`,
            sellingPrice: parseFloat(sellingPrice) || 0,
            ingredients: ingredientCosts,
            foodCostPct: result.foodCostPct,
            verdict: result.verdict,
        }]);
        setRecipeName('');
    };

    const removeRecipe = (id: string) => {
        setSavedRecipes(prev => prev.filter(r => r.id !== id));
    };

    if (inventory.length === 0) {
        return (
            <View style={s.card}>
                <Text style={s.title}>🍽️ Recipe / Menu Item Costing</Text>
                <Text style={s.emptyHint}>
                    Add ingredients to Inventory first — this builds a menu item's food cost from the same cost-per-unit data already tracked there.
                </Text>
            </View>
        );
    }

    return (
        <View style={s.card}>
            <Text style={s.title}>🍽️ Recipe / Menu Item Costing</Text>
            <Text style={s.subtitle}>
                Pick the ingredients that go into a menu item and how much of each — see food cost % against what you charge, before you set the price.
            </Text>

            <Text style={s.fieldLabel}>Menu Item Name</Text>
            <TextInput
                style={s.input}
                value={recipeName}
                onChangeText={setRecipeName}
                placeholder="e.g. Jollof Rice & Chicken"
                placeholderTextColor={Colors.textMuted}
            />

            <Text style={s.fieldLabel}>Selling Price</Text>
            <View style={s.inputWrap}>
                <Text style={s.affix}>{currency}</Text>
                <TextInput
                    style={s.priceInput}
                    value={sellingPrice}
                    onChangeText={setSellingPrice}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={Colors.textMuted}
                />
            </View>

            <Text style={s.fieldLabel}>Ingredients (from Inventory)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll}>
                <View style={s.chipRow}>
                    {inventory.map(item => {
                        const isSelected = selected.some(sIng => sIng.inventoryItemId === item.id);
                        return (
                            <TouchableOpacity
                                key={item.id}
                                style={[s.chip, isSelected && s.chipSelected]}
                                onPress={() => toggleIngredient(item.id)}
                            >
                                <Text style={[s.chipText, isSelected && s.chipTextSelected]}>{item.name}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </ScrollView>

            {selected.map(sIng => {
                const item = inventory.find(i => i.id === sIng.inventoryItemId);
                return (
                    <View key={sIng.inventoryItemId} style={s.ingredientRow}>
                        <Text style={s.ingredientName}>{item?.name ?? 'Unknown'}</Text>
                        <TextInput
                            style={s.qtyInput}
                            value={sIng.quantity}
                            onChangeText={v => setQuantity(sIng.inventoryItemId, v)}
                            keyboardType="decimal-pad"
                            placeholder="1"
                            placeholderTextColor={Colors.textMuted}
                        />
                        <Text style={s.ingredientUnit}>{item?.unit ?? ''}</Text>
                        <Text style={s.ingredientCost}>
                            {currency}{((parseFloat(sIng.quantity) || 0) * (item?.costPrice ?? 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </Text>
                    </View>
                );
            })}

            {hasRecipe && (
                <>
                    <View style={s.statRow}>
                        <View style={s.stat}>
                            <Text style={s.statLabel}>Ingredient Cost</Text>
                            <Text style={s.statVal}>{currency}{result.totalIngredientCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                        </View>
                        <View style={s.stat}>
                            <Text style={s.statLabel}>Food Cost %</Text>
                            <Text style={[s.statVal, { color: VERDICT_COLOR[result.verdict] }]}>{result.foodCostPct.toFixed(1)}%</Text>
                        </View>
                        <View style={s.stat}>
                            <Text style={s.statLabel}>Gross Profit</Text>
                            <Text style={s.statVal}>{currency}{result.grossProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                        </View>
                    </View>

                    <View style={[s.verdictBox, { borderColor: VERDICT_COLOR[result.verdict] }]}>
                        <Text style={[s.verdictLabel, { color: VERDICT_COLOR[result.verdict] }]}>{VERDICT_LABEL[result.verdict]}</Text>
                        <Text style={s.verdictReason}>{result.reason}</Text>
                    </View>
                </>
            )}
            {!hasRecipe && (
                <Text style={s.emptyHint}>Pick at least one ingredient and set a selling price to see food cost %.</Text>
            )}

            {hasRecipe && savedRecipes.length < MAX_SAVED && (
                <TouchableOpacity style={s.saveBtn} onPress={saveRecipe}>
                    <Text style={s.saveBtnText}>Save Menu Item</Text>
                </TouchableOpacity>
            )}

            {savedRecipes.length > 0 && (
                <View style={s.savedSection}>
                    <Text style={s.savedTitle}>Saved Menu Items</Text>
                    {savedRecipes.map(r => (
                        <View key={r.id} style={s.savedRow}>
                            <View style={s.flex}>
                                <Text style={s.savedName}>{r.name}</Text>
                                <Text style={s.savedMeta}>{currency}{r.sellingPrice.toLocaleString()} · {r.foodCostPct.toFixed(1)}% food cost</Text>
                            </View>
                            <View style={[s.savedBadge, { backgroundColor: VERDICT_COLOR[r.verdict] + '22' }]}>
                                <Text style={[s.savedBadgeText, { color: VERDICT_COLOR[r.verdict] }]}>{VERDICT_LABEL[r.verdict]}</Text>
                            </View>
                            <TouchableOpacity onPress={() => removeRecipe(r.id)} style={s.removeBtn}>
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

    ingredientRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
    ingredientName: { flex: 1, fontSize: 12.5, color: Colors.textPrimary },
    qtyInput: { width: 50, backgroundColor: Colors.bg, borderRadius: 6, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 6, paddingVertical: 4, fontSize: 12, color: Colors.textPrimary, textAlign: 'center' },
    ingredientUnit: { fontSize: 10.5, color: Colors.textMuted, width: 40 },
    ingredientCost: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, width: 70, textAlign: 'right' },

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
    flex: { flex: 1 },
    savedName: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary },
    savedMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
    savedBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
    savedBadgeText: { fontSize: 10.5, fontWeight: '700' },
    removeBtn: { paddingHorizontal: 6, paddingVertical: 4 },
    removeBtnText: { color: Colors.expense, fontSize: 13, fontWeight: '700' },
});
