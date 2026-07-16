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
import NextStepLink from '../components/NextStepLink';
import { suggestSolution } from '../utils/impactChain';
import { InventoryItem } from '../types';

type InventoryTab = 'stock' | 'analytics';

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
    const { inventory, addInventoryItem, updateInventoryItem, deleteInventoryItem, settings, navigate, addTransaction } = useApp();
    const { currency } = settings;

    const [activeTab, setActiveTab] = useState<InventoryTab>('stock');
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [sellModal, setSellModal] = useState<{ item: InventoryItem } | null>(null);
    const [sellQty, setSellQty] = useState('');

    // ── Summary calculations ──────────────────────────────────────────────────
    const totalStockValue = inventory.reduce((sum, item) => sum + item.quantity * item.costPrice, 0);
    const totalItems = inventory.length;
    const lowStockItems = inventory.filter(item => item.quantity <= item.lowStockThreshold);

    // ── Analytics calculations ────────────────────────────────────────────────
    const totalPotentialRevenue = inventory.reduce((sum, item) => sum + item.quantity * item.sellingPrice, 0);
    const grossProfitIfAllSold = totalPotentialRevenue - totalStockValue;
    const overallMargin = totalPotentialRevenue > 0 ? (grossProfitIfAllSold / totalPotentialRevenue) * 100 : 0;

    // Category breakdown
    const categoryMap = new Map<string, { items: InventoryItem[] }>();
    for (const item of inventory) {
        const cat = item.category || 'General';
        if (!categoryMap.has(cat)) categoryMap.set(cat, { items: [] });
        categoryMap.get(cat)!.items.push(item);
    }
    const categories = Array.from(categoryMap.entries()).map(([cat, { items }]) => {
        const stockVal = items.reduce((s, i) => s + i.quantity * i.costPrice, 0);
        const avgMargin = items.length > 0
            ? items.reduce((s, i) => s + (i.sellingPrice > 0 ? ((i.sellingPrice - i.costPrice) / i.sellingPrice) * 100 : 0), 0) / items.length
            : 0;
        return { cat, count: items.length, stockVal, avgMargin };
    });

    // Best margin items (top 3)
    const itemsWithMargin = inventory.map(item => ({
        ...item,
        margin: item.sellingPrice > 0 ? ((item.sellingPrice - item.costPrice) / item.sellingPrice) * 100 : 0,
    }));
    const bestMarginItems = [...itemsWithMargin].sort((a, b) => b.margin - a.margin).slice(0, 3);
    const lowMarginItems  = itemsWithMargin.filter(i => i.margin < 10);

    // Stock health score
    const outOfStockCount = inventory.filter(i => i.quantity === 0).length;
    const lowStockCount   = inventory.filter(i => i.quantity > 0 && i.quantity <= i.lowStockThreshold).length;
    let stockHealth = 100 - (outOfStockCount > 0 ? 20 : 0) - lowStockCount * 10;
    stockHealth = Math.max(0, Math.min(100, stockHealth));
    const healthColor = stockHealth >= 80 ? Colors.income : stockHealth >= 50 ? Colors.warning : Colors.expense;

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
        if (Platform.OS === 'web') {
            if (window.confirm(`Remove "${item.name}" from inventory?`)) {
                deleteInventoryItem(item.id);
            }
        } else {
            Alert.alert(
                'Delete Item',
                `Remove "${item.name}" from inventory?`,
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => deleteInventoryItem(item.id) },
                ],
            );
        }
    };

    const confirmSell = () => {
        if (!sellModal) return;
        const { item } = sellModal;
        const qty = parseFloat(sellQty);
        if (isNaN(qty) || qty <= 0) { Alert.alert('Validation', 'Enter a valid quantity.'); return; }
        if (qty > item.quantity) { Alert.alert('Validation', `Only ${item.quantity} ${item.unit} in stock.`); return; }
        updateInventoryItem(item.id, { quantity: item.quantity - qty });
        addTransaction({
            type: 'income',
            amount: qty * item.sellingPrice,
            description: `Sale: ${item.name}`,
            category: 'Sales',
            date: new Date().toISOString().split('T')[0],
            status: 'paid',
            transactionCategory: 'sale',
        });
        setSellModal(null);
        setSellQty('');
        Alert.alert('Recorded', `${qty} ${item.unit} of ${item.name} sold.`);
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

            {/* ── Tab bar ─────────────────────────────────────────────────── */}
            <View style={styles.tabBar}>
                <TouchableOpacity
                    style={[styles.tabBtn, activeTab === 'stock' && styles.tabBtnActive]}
                    onPress={() => setActiveTab('stock')}
                >
                    <Text style={[styles.tabText, activeTab === 'stock' && styles.tabTextActive]}>Stock</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tabBtn, activeTab === 'analytics' && styles.tabBtnActive]}
                    onPress={() => setActiveTab('analytics')}
                >
                    <Text style={[styles.tabText, activeTab === 'analytics' && styles.tabTextActive]}>Analytics</Text>
                </TouchableOpacity>
            </View>

            <ScrollView style={styles.scroll} contentContainerStyle={styles.pad}>

                {/* ── Title row ──────────────────────────────────────────── */}
                <View style={styles.titleRow}>
                    <Text style={styles.title}>Inventory & Stock</Text>
                    <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
                        <Text style={styles.addBtnText}>+ Add Item</Text>
                    </TouchableOpacity>
                </View>

                {/* ── STOCK TAB ──────────────────────────────────────────── */}
                {activeTab === 'stock' && (
                    <>
                        {/* Summary cards */}
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

                        {/* Low stock alert */}
                        {lowStockItems.length > 0 && (
                            <View style={styles.lowStockBanner}>
                                <Text style={styles.lowStockBannerText}>
                                    ⚠ {lowStockItems.length} item{lowStockItems.length > 1 ? 's' : ''} {lowStockItems.length > 1 ? 'are' : 'is'} running low — reorder soon
                                </Text>
                            </View>
                        )}

                        {/* Empty state */}
                        {inventory.length === 0 && (
                            <View style={styles.emptyState}>
                                <Text style={styles.emptyIcon}>📦</Text>
                                <Text style={styles.emptyText}>No inventory items yet.</Text>
                                <Text style={styles.emptySubText}>Tap '+ Add Item' to start tracking your stock.</Text>
                            </View>
                        )}

                        {/* Item list */}
                        {inventory.map(item => {
                            const margin = item.sellingPrice > 0
                                ? ((item.sellingPrice - item.costPrice) / item.sellingPrice) * 100
                                : 0;
                            const stockVal = item.quantity * item.costPrice;

                            return (
                                <View key={item.id} style={styles.itemCard}>
                                    <View style={styles.itemHeader}>
                                        <View style={styles.flex}>
                                            <Text style={styles.itemName}>{item.name}</Text>
                                            <Text style={styles.itemCategory}>{item.category}</Text>
                                        </View>
                                        <View style={styles.itemActions}>
                                            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.income }]} onPress={() => { setSellModal({ item }); setSellQty(''); }}>
                                                <Text style={[styles.actionBtnText, { color: '#fff' }]}>Sell</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(item)}>
                                                <Text style={styles.actionBtnText}>✏</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={() => confirmDelete(item)}>
                                                <Text style={styles.actionBtnText}>🗑</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>

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

                                    <View style={styles.itemFooter}>
                                        <Text style={styles.stockValLabel}>Stock value: </Text>
                                        <Text style={styles.stockValNum}>{currency}{stockVal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</Text>
                                    </View>
                                </View>
                            );
                        })}
                    </>
                )}

                {/* ── ANALYTICS TAB ──────────────────────────────────────── */}
                {activeTab === 'analytics' && (
                    <>
                        {/* Cost of Goods Summary */}
                        <View style={styles.analyticsCard}>
                            <Text style={styles.analyticsCardTitle}>Cost of Goods Summary</Text>
                            <View style={styles.analyticsRow}>
                                <Text style={styles.analyticsLabel}>Total Inventory Value</Text>
                                <Text style={[styles.analyticsVal, { color: Colors.asset }]}>
                                    {currency}{totalStockValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </Text>
                            </View>
                            <View style={styles.analyticsRow}>
                                <Text style={styles.analyticsLabel}>Total Potential Revenue</Text>
                                <Text style={[styles.analyticsVal, { color: Colors.income }]}>
                                    {currency}{totalPotentialRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </Text>
                            </View>
                            <View style={[styles.analyticsRow, styles.analyticsBorderTop]}>
                                <Text style={[styles.analyticsLabel, { fontWeight: '700', color: Colors.textPrimary }]}>Gross Profit if All Sold</Text>
                                <Text style={[styles.analyticsVal, { color: grossProfitIfAllSold >= 0 ? Colors.income : Colors.expense, fontWeight: 'bold' }]}>
                                    {currency}{grossProfitIfAllSold.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </Text>
                            </View>
                            <View style={styles.analyticsRow}>
                                <Text style={styles.analyticsLabel}>Overall Margin %</Text>
                                <Text style={[styles.analyticsVal, { color: marginColor(overallMargin) }]}>
                                    {overallMargin.toFixed(1)}%
                                </Text>
                            </View>
                        </View>

                        {/* Category Breakdown */}
                        <View style={styles.analyticsCard}>
                            <Text style={styles.analyticsCardTitle}>Category Breakdown</Text>
                            {categories.length === 0 && (
                                <Text style={styles.analyticsEmpty}>No items to analyse yet.</Text>
                            )}
                            {categories.map(({ cat, count, stockVal, avgMargin }) => (
                                <View key={cat} style={styles.categoryRow}>
                                    <View style={styles.flex}>
                                        <Text style={styles.categoryName}>{cat}</Text>
                                        <Text style={styles.categoryMeta}>{count} item{count !== 1 ? 's' : ''}</Text>
                                    </View>
                                    <View style={styles.categoryRight}>
                                        <Text style={[styles.analyticsVal, { color: Colors.asset }]}>
                                            {currency}{stockVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                        </Text>
                                        <Text style={[styles.categoryMeta, { color: marginColor(avgMargin) }]}>
                                            {avgMargin.toFixed(1)}% margin
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </View>

                        {/* Best Margin Items */}
                        {bestMarginItems.length > 0 && (
                            <View style={styles.analyticsCard}>
                                <Text style={styles.analyticsCardTitle}>Best Margin Items</Text>
                                {bestMarginItems.map(item => (
                                    <View key={item.id} style={styles.bestItemRow}>
                                        <View style={styles.flex}>
                                            <Text style={styles.bestItemName}>{item.name}</Text>
                                            <Text style={styles.categoryMeta}>{item.category}</Text>
                                        </View>
                                        <View style={[styles.marginBadge, { backgroundColor: 'rgba(34,197,94,0.15)' }]}>
                                            <Text style={[styles.marginBadgeText, { color: Colors.income }]}>
                                                {item.margin.toFixed(1)}%
                                            </Text>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        )}

                        {/* Low Margin Warning */}
                        {lowMarginItems.length > 0 && (
                            <View style={[styles.analyticsCard, { borderWidth: 1, borderColor: Colors.expense }]}>
                                <Text style={[styles.analyticsCardTitle, { color: Colors.expense }]}>Low Margin Warning (&lt;10%)</Text>
                                {lowMarginItems.map(item => (
                                    <View key={item.id} style={styles.bestItemRow}>
                                        <View style={styles.flex}>
                                            <Text style={styles.bestItemName}>{item.name}</Text>
                                            <Text style={styles.categoryMeta}>{item.category}</Text>
                                        </View>
                                        <View style={[styles.marginBadge, { backgroundColor: 'rgba(239,68,68,0.15)' }]}>
                                            <Text style={[styles.marginBadgeText, { color: Colors.expense }]}>
                                                {item.margin.toFixed(1)}%
                                            </Text>
                                        </View>
                                    </View>
                                ))}
                                <NextStepLink
                                    text="See pricing strategies to fix this"
                                    onPress={() => navigate('reports', { reportSection: 'growth', reportTab: 'pricing' })}
                                />
                            </View>
                        )}

                        {/* Stock Health Score */}
                        <View style={styles.analyticsCard}>
                            <Text style={styles.analyticsCardTitle}>Stock Health</Text>
                            <View style={styles.healthRow}>
                                <Text style={[styles.healthScore, { color: healthColor }]}>{stockHealth}</Text>
                                <Text style={styles.healthOutOf}>/100</Text>
                            </View>
                            {outOfStockCount > 0 && (
                                <Text style={styles.healthNote}>• {outOfStockCount} item{outOfStockCount !== 1 ? 's' : ''} out of stock (-20)</Text>
                            )}
                            {lowStockCount > 0 && (
                                <Text style={styles.healthNote}>• {lowStockCount} item{lowStockCount !== 1 ? 's' : ''} at/below threshold (-{lowStockCount * 10})</Text>
                            )}
                            {stockHealth === 100 && (
                                <Text style={[styles.healthNote, { color: Colors.income }]}>All stock levels healthy</Text>
                            )}
                        </View>

                        {/* Use in Reports button */}
                        <TouchableOpacity
                            style={styles.reportsBtn}
                            onPress={() => navigate('reports', { reportSection: 'statements', reportTab: 'inventory' })}
                        >
                            <Text style={styles.reportsBtnText}>Use in Reports →</Text>
                        </TouchableOpacity>
                    </>
                )}

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

                        {/* Margin preview — same "harmful gets a fix" pattern as the
                            rest of the app, applied to what this item actually earns. */}
                        {(() => {
                            const cost = parseFloat(form.costPrice);
                            const sell = parseFloat(form.sellingPrice);
                            if (isNaN(cost) || isNaN(sell) || sell <= 0) return null;
                            const margin = ((sell - cost) / sell) * 100;
                            const severity = margin < 0 ? 'harmful' : margin < 10 ? 'caution' : 'none';
                            const color = severity === 'harmful' ? Colors.expense : severity === 'caution' ? Colors.warning : Colors.income;
                            return (
                                <View style={[styles.marginPreview, { borderColor: color }]}>
                                    <Text style={styles.marginPreviewLabel}>Margin on this item</Text>
                                    <Text style={[styles.marginPreviewVal, { color }]}>{margin.toFixed(1)}%</Text>
                                    {severity !== 'none' && (
                                        <>
                                            <Text style={[styles.marginPreviewNote, { color }]}>
                                                {severity === 'harmful'
                                                    ? '⚠ Selling below cost — every sale loses money.'
                                                    : '⚠ Thin margin — barely covers overhead.'}
                                            </Text>
                                            <Text style={styles.marginPreviewSolution}>
                                                💡 {suggestSolution('pricing').title} — {suggestSolution('pricing').detail}
                                            </Text>
                                        </>
                                    )}
                                </View>
                            );
                        })()}

                        <TouchableOpacity style={styles.submitBtn} onPress={submitForm}>
                            <Text style={styles.submitBtnText}>{editingId ? 'Save Changes' : 'Add Item'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.cancelBtn} onPress={closeModal}>
                            <Text style={styles.cancelBtnText}>Cancel</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </KeyboardAvoidingView>
            </Modal>

            {/* ── Sell Stock Modal ──────────────────────────────────────────────── */}
            <Modal visible={!!sellModal} transparent animationType="slide" onRequestClose={() => setSellModal(null)}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSellModal(null)} />
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalSheet}>
                    <View style={styles.modalHandle} />
                    <Text style={styles.modalTitle}>Record Sale</Text>
                    {sellModal && (
                        <>
                            <Text style={{ color: Colors.textSecondary, marginBottom: 8 }}>
                                {sellModal.item.name} — {sellModal.item.quantity} {sellModal.item.unit} in stock
                            </Text>
                            <TextInput
                                style={styles.input}
                                placeholder={`Quantity sold (${sellModal.item.unit})`}
                                placeholderTextColor={Colors.textMuted}
                                keyboardType="decimal-pad"
                                value={sellQty}
                                onChangeText={setSellQty}
                            />
                            <Text style={{ color: Colors.textMuted, fontSize: 12, marginBottom: 12 }}>
                                Revenue: {currency}{sellQty ? (parseFloat(sellQty) * sellModal.item.sellingPrice || 0).toLocaleString() : '0'}
                            </Text>
                            <TouchableOpacity style={[styles.submitBtn, { backgroundColor: Colors.income }]} onPress={confirmSell}>
                                <Text style={styles.submitBtnText}>Record Sale</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setSellModal(null)}>
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                        </>
                    )}
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

    // Tab bar
    tabBar:         { flexDirection: 'row', backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
    tabBtn:         { flex: 1, paddingVertical: 12, alignItems: 'center' },
    tabBtnActive:   { borderBottomWidth: 2, borderBottomColor: Colors.primary },
    tabText:        { fontSize: 13, color: Colors.textMuted, fontWeight: '500' },
    tabTextActive:  { color: Colors.primary, fontWeight: '700' },

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

    // Analytics
    analyticsCard:      { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 12 },
    analyticsCardTitle: { fontSize: 14, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 10 },
    analyticsRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: Colors.border },
    analyticsBorderTop: { borderTopWidth: 1, borderTopColor: Colors.textMuted, marginTop: 4, paddingTop: 10, borderBottomWidth: 0 },
    analyticsLabel:     { fontSize: 13, color: Colors.textSecondary, flex: 1 },
    analyticsVal:       { fontSize: 13, fontWeight: '600' },
    analyticsEmpty:     { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic' },

    categoryRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.border },
    categoryName: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
    categoryMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
    categoryRight:{ alignItems: 'flex-end' },

    bestItemRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
    bestItemName:    { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
    marginBadge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    marginBadgeText: { fontSize: 12, fontWeight: 'bold' },

    healthRow:  { flexDirection: 'row', alignItems: 'baseline', marginBottom: 8 },
    healthScore:{ fontSize: 48, fontWeight: 'bold' },
    healthOutOf:{ fontSize: 18, color: Colors.textMuted, marginLeft: 4 },
    healthNote: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },

    reportsBtn:     { backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 4, marginBottom: 8 },
    reportsBtnText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 15 },

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
    marginPreview:      { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12 },
    marginPreviewLabel: { fontSize: 11, color: Colors.textMuted, marginBottom: 3 },
    marginPreviewVal:   { fontSize: 18, fontWeight: '800', marginBottom: 4 },
    marginPreviewNote:  { fontSize: 12, fontWeight: '600', lineHeight: 17, marginBottom: 6 },
    marginPreviewSolution: { fontSize: 11, color: Colors.textSecondary, lineHeight: 16 },
    cancelBtn:     { paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 8 },
    cancelBtnText: { color: Colors.textMuted, fontSize: 14 },
});
