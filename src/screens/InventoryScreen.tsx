import React, { useState } from 'react';
import {
    SafeAreaView, ScrollView, View, Text,
    TouchableOpacity, StyleSheet, Modal,
    TextInput, KeyboardAvoidingView, Platform,
    Alert,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { InventoryItem } from '../types';

type FormState = {
    name: string;
    category: string;
    quantity: string;
    unit: string;
    costPrice: string;
    sellingPrice: string;
    lowStockThreshold: string;
};

const EMPTY_FORM: FormState = {
    name: '',
    category: '',
    quantity: '',
    unit: '',
    costPrice: '',
    sellingPrice: '',
    lowStockThreshold: '5',
};

export default function InventoryScreen() {
    const { inventory, addInventoryItem, updateInventoryItem, deleteInventoryItem, settings } = useApp();
    const { currency } = settings;

    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);

    // ── Summary calculations ──────────────────────────────────────────────────
    const totalStockValue = inventory.reduce((sum, item) => sum + item.quantity * item.costPrice, 0);
    const totalItems = inventory.length;
    const lowStockItems = inventory.filter(item => item.quantity <= item.lowStockThreshold);

    // ── Modal helpers ─────────────────────────────────────────────────────────
    const openAdd = () => {
        setEditingId(null);
        setForm(EMPTY_FORM);
        setModalOpen(true);
    };

    const openEdit = (item: InventoryItem) => {
        setEditingId(item.id);
        setForm({
            name: item.name,
            category: item.category,
            quantity: String(item.quantity),
            unit: item.unit,
            costPrice: String(item.costPrice),
            sellingPrice: String(item.sellingPrice),
            lowStockThreshold: String(item.lowStockThreshold),
        });
        setModalOpen(true);
    };

    const closeModal = () => {
        setModalOpen(false);
        setEditingId(null);
        setForm(EMPTY_FORM);
    };

    const submitForm = () => {
        const qty = parseFloat(form.quantity);
        const cost = parseFloat(form.costPrice);
        const sell = parseFloat(form.sellingPrice);
        const threshold = parseFloat(form.lowStockThreshold) || 5;

        if (!form.name.trim()) { Alert.alert('Validation', 'Item name is required.'); return; }
        if (isNaN(qty) || qty < 0) { Alert.alert('Validation', 'Enter a valid quantity.'); return; }
        if (isNaN(cost) || cost < 0) { Alert.alert('Validation', 'Enter a valid cost price.'); return; }
        if (isNaN(sell) || sell < 0) { Alert.alert('Validation', 'Enter a valid selling price.'); return; }

        const payload = {
            name: form.name.trim(),
            category: form.category.trim() || 'General',
            quantity: qty,
            unit: form.unit.trim() || 'pcs',
            costPrice: cost,
            sellingPrice: sell,
            lowStockThreshold: threshold,
        };

        if (editingId) {
            updateInventoryItem(editingId, payload);
        } else {
            addInventoryItem(payload);
        }
        closeModal();
    };

    const confirmDelete = (item: InventoryItem) => {
        Alert.alert(
            'Delete Item',
            `Remove "${item.name}" from inventory?`,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => deleteInventoryItem(item.id) },
            ],
        );
    };

    // ── Stock colour helper ───────────────────────────────────────────────────
    const stockColor = (item: InventoryItem): string => {
        if (item.quantity <= item.lowStockThreshold) return Colors.expense;
        if (item.quantity <= item.lowStockThreshold * 1.2) return Colors.warning;
        return Colors.textPrimary;
    };

    // ── Margin colour helper ──────────────────────────────────────────────────
    const marginColor = (pct: number): string => {
        if (pct >= 20) return Colors.income;
        if (pct >= 10) return Colors.warning;
        return Colors.expense;
    };

    return (
        <SafeAreaView style={styles.safe}>
            <Header />
            <ScrollView style={styles.scroll} contentContainerStyle={styles.pad}>

                {/* ── Title row ──────────────────────────────────────────── */}
                <View style={styles.titleRow}>
                    <Text style={styles.title}>Inventory & Stock</Text>
                    <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
                        <Text style={styles.addBtnText}>+ Add Item</Text>
                    </TouchableOpacity>
                </View>

                {/* ── Summary cards ──────────────────────────────────────── */}
                <View style={styles.summaryRow}>
                    <View style={[styles.summaryCard, styles.flex]}>
                        <Text style={styles.summaryLabel}>Stock Value</Text>
                        <Text style={[styles.summaryVal, { color: Colors.asset }]}>
                            {currency}{totalStockValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </Text>
                    </View>
                    <View style={[styles.summaryCard, styles.flex]}>
                        <Text style={styles.summaryLabel}>Total Items</Text>
                        <Text style={[styles.summaryVal, { color: Colors.textPrimary }]}>{totalItems}</Text>
                    </View>
                    <View style={[styles.summaryCard, styles.flex]}>
                        <Text style={styles.summaryLabel}>Low Stock</Text>
                        <Text style={[styles.summaryVal, { color: lowStockItems.length > 0 ? Colors.expense : Colors.income }]}>
                            {lowStockItems.length}
                        </Text>
                    </View>
                </View>

                {/* ── Low stock alert ────────────────────────────────────── */}
                {lowStockItems.length > 0 && (
                    <View style={styles.lowStockBanner}>
                        <Text style={styles.lowStockBannerText}>
                            ⚠ {lowStockItems.length} item{lowStockItems.length > 1 ? 's' : ''} {lowStockItems.length > 1 ? 'are' : 'is'} running low — reorder soon
                        </Text>
                    </View>
                )}

                {/* ── Empty state ────────────────────────────────────────── */}
                {inventory.length === 0 && (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyIcon}>📦</Text>
                        <Text style={styles.emptyText}>No inventory items yet.</Text>
                        <Text style={styles.emptySubText}>Tap '+ Add Item' to start tracking your stock.</Text>
                    </View>
                )}

                {/* ── Item list ──────────────────────────────────────────── */}
                {inventory.map(item => {
                    const margin = item.sellingPrice > 0
                        ? ((item.sellingPrice - item.costPrice) / item.sellingPrice) * 100
                        : 0;
                    const stockVal = item.quantity * item.costPrice;

                    return (
                        <View key={item.id} style={styles.itemCard}>
                            {/* Name + category row */}
                            <View style={styles.itemHeader}>
                                <View style={styles.flex}>
                                    <Text style={styles.itemName}>{item.name}</Text>
                                    <Text style={styles.itemCategory}>{item.category}</Text>
                                </View>
                                <View style={styles.itemActions}>
                                    <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(item)}>
                                        <Text style={styles.actionBtnText}>✏</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={() => confirmDelete(item)}>
                                        <Text style={styles.actionBtnText}>🗑</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {/* Metrics grid */}
                            <View style={styles.metricsGrid}>
                                <View style={styles.metricCell}>
                                    <Text style={styles.metricLabel}>Stock</Text>
                                    <Text style={[styles.metricVal, { color: stockColor(item) }]}>
                                        {item.quantity} {item.unit}
                                    </Text>
                                </View>
                                <View style={styles.metricCell}>
                                    <Text style={styles.metricLabel}>Cost/unit</Text>
                                    <Text style={styles.metricVal}>{currency}{item.costPrice.toLocaleString()}</Text>
                                </View>
                                <View style={styles.metricCell}>
                                    <Text style={styles.metricLabel}>Sell/unit</Text>
                                    <Text style={styles.metricVal}>{currency}{item.sellingPrice.toLocaleString()}</Text>
                                </View>
                                <View style={styles.metricCell}>
                                    <Text style={styles.metricLabel}>Margin</Text>
                                    <Text style={[styles.metricVal, { color: marginColor(margin) }]}>
                                        {margin.toFixed(1)}%
                                    </Text>
                                </View>
                            </View>

                            {/* Stock value footer */}
                            <View style={styles.itemFooter}>
                                <Text style={styles.stockValLabel}>Stock value: </Text>
                                <Text style={styles.stockValNum}>{currency}{stockVal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</Text>
                            </View>
                        </View>
                    );
                })}

            </ScrollView>

            <FooterNav />

            {/* ── Add / Edit Modal ─────────────────────────────────────────────── */}
            <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={closeModal}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={closeModal} />
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalSheet}>
                    <View style={styles.modalHandle} />
                    <Text style={styles.modalTitle}>{editingId ? 'Edit Item' : 'Add Inventory Item'}</Text>

                    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                        <TextInput
                            style={styles.input}
                            placeholder="Item name"
                            placeholderTextColor={Colors.textMuted}
                            value={form.name}
                            onChangeText={v => setForm(f => ({ ...f, name: v }))}
                        />
                        <TextInput
                            style={styles.input}
                            placeholder="Category (e.g. Electronics, Food)"
                            placeholderTextColor={Colors.textMuted}
                            value={form.category}
                            onChangeText={v => setForm(f => ({ ...f, category: v }))}
                        />
                        <View style={styles.inputRow}>
                            <TextInput
                                style={[styles.input, styles.flex, { marginRight: 8 }]}
                                placeholder="Quantity"
                                placeholderTextColor={Colors.textMuted}
                                keyboardType="decimal-pad"
                                value={form.quantity}
                                onChangeText={v => setForm(f => ({ ...f, quantity: v }))}
                            />
                            <TextInput
                                style={[styles.input, styles.flex]}
                                placeholder="Unit (pcs / kg / litres)"
                                placeholderTextColor={Colors.textMuted}
                                value={form.unit}
                                onChangeText={v => setForm(f => ({ ...f, unit: v }))}
                            />
                        </View>
                        <TextInput
                            style={styles.input}
                            placeholder={`Cost price per unit (${currency})`}
                            placeholderTextColor={Colors.textMuted}
                            keyboardType="decimal-pad"
                            value={form.costPrice}
                            onChangeText={v => setForm(f => ({ ...f, costPrice: v }))}
                        />
                        <TextInput
                            style={styles.input}
                            placeholder={`Selling price per unit (${currency})`}
                            placeholderTextColor={Colors.textMuted}
                            keyboardType="decimal-pad"
                            value={form.sellingPrice}
                            onChangeText={v => setForm(f => ({ ...f, sellingPrice: v }))}
                        />
                        <TextInput
                            style={styles.input}
                            placeholder="Low stock alert at (default 5)"
                            placeholderTextColor={Colors.textMuted}
                            keyboardType="number-pad"
                            value={form.lowStockThreshold}
                            onChangeText={v => setForm(f => ({ ...f, lowStockThreshold: v }))}
                        />

                        <TouchableOpacity style={styles.submitBtn} onPress={submitForm}>
                            <Text style={styles.submitBtnText}>{editingId ? 'Save Changes' : 'Add Item'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.cancelBtn} onPress={closeModal}>
                            <Text style={styles.cancelBtnText}>Cancel</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </KeyboardAvoidingView>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe:   { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1, backgroundColor: Colors.bg },
    pad:    { padding: 16, paddingBottom: 100 },
    flex:   { flex: 1 },

    titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    title:    { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary },
    addBtn:   { backgroundColor: Colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
    addBtnText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 13 },

    summaryRow:  { flexDirection: 'row', gap: 10, marginBottom: 12 },
    summaryCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 12, alignItems: 'center' },
    summaryLabel:{ fontSize: 10, color: Colors.textMuted, marginBottom: 4 },
    summaryVal:  { fontSize: 16, fontWeight: 'bold' },

    lowStockBanner: {
        backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1,
        borderColor: Colors.warning, borderRadius: 10, padding: 12, marginBottom: 12,
    },
    lowStockBannerText: { color: Colors.warning, fontWeight: '600', fontSize: 13 },

    emptyState:   { alignItems: 'center', paddingVertical: 60 },
    emptyIcon:    { fontSize: 48, marginBottom: 16 },
    emptyText:    { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 6 },
    emptySubText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: 32 },

    itemCard: {
        backgroundColor: Colors.surface, borderRadius: 12, padding: 14,
        marginBottom: 12, borderWidth: 1, borderColor: Colors.border,
    },
    itemHeader:   { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
    itemName:     { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 2 },
    itemCategory: { fontSize: 11, color: Colors.textMuted },
    itemActions:  { flexDirection: 'row', gap: 6 },
    actionBtn:    { backgroundColor: Colors.muted, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
    deleteBtn:    { backgroundColor: 'rgba(239,68,68,0.2)' },
    actionBtnText:{ fontSize: 14 },

    metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
    metricCell:  { minWidth: '45%', flex: 1 },
    metricLabel: { fontSize: 10, color: Colors.textMuted, marginBottom: 2 },
    metricVal:   { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },

    itemFooter:    { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 8 },
    stockValLabel: { fontSize: 11, color: Colors.textMuted },
    stockValNum:   { fontSize: 12, fontWeight: 'bold', color: Colors.asset },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
    modalSheet: {
        backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
        padding: 24, paddingBottom: 40, maxHeight: '90%',
    },
    modalHandle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
    modalTitle:  { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 16 },
    inputRow:    { flexDirection: 'row' },
    input: {
        backgroundColor: Colors.bg, borderColor: Colors.border, borderWidth: 1,
        borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11,
        color: Colors.textPrimary, fontSize: 14, marginBottom: 12,
    },
    submitBtn:     { backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 4 },
    submitBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
    cancelBtn:     { paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 8 },
    cancelBtnText: { color: Colors.textMuted, fontSize: 14 },
});
