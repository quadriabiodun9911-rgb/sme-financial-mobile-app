import React, { useState, useMemo } from 'react';
import {
    SafeAreaView, ScrollView, View, Text,
    TouchableOpacity, StyleSheet, TextInput, Modal, Alert,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { computeBudgetVsActual } from '../utils/finance';
import { Budget } from '../types';

const EXPENSE_CATEGORIES = [
    'Office & Admin', 'Salaries', 'Marketing', 'Equipment', 'Software',
    'Rent', 'Utilities', 'Transport', 'Insurance', 'Professional Fees',
    'Supplies', 'Maintenance', 'Travel', 'Training', 'Other',
];

export default function BudgetScreen() {
    const { transactions, budgets, addBudget, updateBudget, deleteBudget, settings, navigate } = useApp();
    const { currency } = settings;

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel   = now.toLocaleString('default', { month: 'long', year: 'numeric' });

    const [showForm,    setShowForm]    = useState(false);
    const [editingId,   setEditingId]   = useState<string | null>(null);
    const [category,    setCategory]    = useState('');
    const [amount,      setAmount]      = useState('');
    const [customCat,   setCustomCat]   = useState('');
    const [showCatPick, setShowCatPick] = useState(false);

    const bva = useMemo(() => computeBudgetVsActual(transactions, budgets, currentMonth), [transactions, budgets, currentMonth]);

    const totalBudgeted = budgets.reduce((s, b) => s + b.monthlyAmount, 0);
    const totalActual   = bva.reduce((s, b) => s + b.actual, 0);
    const totalVariance = totalBudgeted - totalActual;
    const overCount     = bva.filter(b => b.status === 'over').length;

    function openAdd() {
        setEditingId(null);
        setCategory('');
        setAmount('');
        setCustomCat('');
        setShowForm(true);
    }

    function openEdit(b: Budget) {
        setEditingId(b.id);
        setCategory(b.category);
        setAmount(String(b.monthlyAmount));
        setCustomCat('');
        setShowForm(true);
    }

    function handleSave() {
        const cat = customCat.trim() || category;
        const amt = parseFloat(amount);
        if (!cat) { Alert.alert('Error', 'Please select or enter a category.'); return; }
        if (!amt || amt <= 0) { Alert.alert('Error', 'Please enter a valid amount.'); return; }

        if (editingId) {
            updateBudget(editingId, { category: cat, monthlyAmount: amt, period: currentMonth });
        } else {
            // Check duplicate category
            if (budgets.find(b => b.category.toLowerCase() === cat.toLowerCase())) {
                Alert.alert('Duplicate', `A budget for "${cat}" already exists. Edit the existing one.`);
                return;
            }
            addBudget({ category: cat, monthlyAmount: amt, period: currentMonth });
        }
        setShowForm(false);
    }

    function handleDelete(id: string, cat: string) {
        Alert.alert('Delete Budget', `Remove budget for "${cat}"?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteBudget(id) },
        ]);
    }

    function statusColor(status: string) {
        if (status === 'over')     return Colors.expense;
        if (status === 'on_track') return Colors.income;
        return Colors.textMuted;
    }

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <View style={s.headerRow}>
                <TouchableOpacity onPress={() => navigate('dashboard')}>
                    <Text style={s.backBtn}>← Dashboard</Text>
                </TouchableOpacity>
                <Text style={s.screenTitle}>Budget</Text>
                <TouchableOpacity style={s.addBtn} onPress={openAdd}>
                    <Text style={s.addBtnText}>+ Add</Text>
                </TouchableOpacity>
            </View>

            <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
                {/* Month summary */}
                <View style={s.summaryCard}>
                    <Text style={s.summaryMonth}>{monthLabel}</Text>
                    <View style={s.summaryRow}>
                        <View style={s.summaryBox}>
                            <Text style={s.summaryLabel}>Budgeted</Text>
                            <Text style={[s.summaryVal, { color: Colors.primary }]}>{currency}{totalBudgeted.toLocaleString()}</Text>
                        </View>
                        <View style={s.summaryDivider} />
                        <View style={s.summaryBox}>
                            <Text style={s.summaryLabel}>Actual</Text>
                            <Text style={[s.summaryVal, { color: Colors.expense }]}>{currency}{totalActual.toLocaleString()}</Text>
                        </View>
                        <View style={s.summaryDivider} />
                        <View style={s.summaryBox}>
                            <Text style={s.summaryLabel}>Variance</Text>
                            <Text style={[s.summaryVal, { color: totalVariance >= 0 ? Colors.income : Colors.expense }]}>
                                {totalVariance >= 0 ? '+' : ''}{currency}{totalVariance.toLocaleString()}
                            </Text>
                        </View>
                    </View>
                    {overCount > 0 && (
                        <Text style={s.overAlert}>⚠ {overCount} categor{overCount > 1 ? 'ies' : 'y'} over budget</Text>
                    )}
                </View>

                {/* Budget vs actual table */}
                {budgets.length === 0 ? (
                    <View style={s.emptyState}>
                        <Text style={s.emptyTitle}>No budgets yet</Text>
                        <Text style={s.emptySub}>Tap "+ Add" to set monthly spending targets per category</Text>
                        <TouchableOpacity style={s.emptyBtn} onPress={openAdd}>
                            <Text style={s.emptyBtnText}>Add Your First Budget</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <>
                        {/* Table header */}
                        <View style={s.tableHeader}>
                            <Text style={[s.th, { flex: 2 }]}>Category</Text>
                            <Text style={s.th}>Budget</Text>
                            <Text style={s.th}>Actual</Text>
                            <Text style={s.th}>Var %</Text>
                        </View>

                        {bva.map((row, i) => {
                            const budget = budgets.find(b => b.category === row.category);
                            return (
                                <TouchableOpacity key={i} style={[s.tableRow, row.status === 'over' && s.overRow]} onPress={() => budget && openEdit(budget)}>
                                    <View style={[s.statusDot, { backgroundColor: statusColor(row.status) }]} />
                                    <Text style={[s.td, { flex: 2, color: Colors.textPrimary, fontWeight: '600' }]} numberOfLines={1}>{row.category}</Text>
                                    <Text style={[s.td, { color: Colors.textSecondary }]}>{currency}{row.budgeted.toLocaleString()}</Text>
                                    <Text style={[s.td, { color: row.status === 'over' ? Colors.expense : Colors.textSecondary }]}>{currency}{row.actual.toLocaleString()}</Text>
                                    <Text style={[s.td, { color: statusColor(row.status), fontWeight: '700' }]}>
                                        {row.variancePct >= 0 ? '+' : ''}{row.variancePct.toFixed(0)}%
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}

                        {/* Show budgets with no transactions */}
                        {budgets
                            .filter(b => !bva.find(r => r.category === b.category))
                            .map((b, i) => (
                                <TouchableOpacity key={`no-tx-${i}`} style={s.tableRow} onPress={() => openEdit(b)}>
                                    <View style={[s.statusDot, { backgroundColor: Colors.textMuted }]} />
                                    <Text style={[s.td, { flex: 2, color: Colors.textPrimary, fontWeight: '600' }]} numberOfLines={1}>{b.category}</Text>
                                    <Text style={[s.td, { color: Colors.textSecondary }]}>{currency}{b.monthlyAmount.toLocaleString()}</Text>
                                    <Text style={[s.td, { color: Colors.textMuted, fontSize: 10 }]}>No spending yet</Text>
                                    <Text style={[s.td, { color: Colors.textMuted, fontWeight: '700' }]}>-</Text>
                                </TouchableOpacity>
                            ))
                        }
                    </>
                )}

                {/* Over-budget callout */}
                {bva.filter(r => r.status === 'over').map((r, i) => (
                    <View key={i} style={s.overCard}>
                        <Text style={s.overCardTitle}>Over Budget: {r.category}</Text>
                        <Text style={s.overCardText}>
                            Spent {currency}{r.actual.toLocaleString()} vs {currency}{r.budgeted.toLocaleString()} budget
                            {' '}({Math.abs(r.variancePct).toFixed(0)}% over)
                        </Text>
                    </View>
                ))}
            </ScrollView>

            {/* Add/Edit modal */}
            <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}>
                <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowForm(false)} />
                <View style={s.sheet}>
                    <View style={s.sheetHandle} />
                    <Text style={s.sheetTitle}>{editingId ? 'Edit Budget' : 'Add Budget'}</Text>

                    {/* Category picker */}
                    <TouchableOpacity style={s.catSelector} onPress={() => setShowCatPick(v => !v)}>
                        <Text style={[s.catSelectorText, !category && { color: Colors.textMuted }]}>
                            {category || 'Select category...'}
                        </Text>
                        <Text style={s.catArrow}>{showCatPick ? '▲' : '▼'}</Text>
                    </TouchableOpacity>
                    {showCatPick && (
                        <ScrollView style={s.catList} nestedScrollEnabled>
                            {EXPENSE_CATEGORIES.map(cat => (
                                <TouchableOpacity key={cat} style={[s.catOption, category === cat && s.catOptionActive]} onPress={() => { setCategory(cat); setCustomCat(''); setShowCatPick(false); }}>
                                    <Text style={[s.catOptionText, category === cat && s.catOptionTextActive]}>{cat}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    )}
                    <TextInput
                        style={s.input}
                        placeholder="Or type custom category..."
                        placeholderTextColor={Colors.textMuted}
                        value={customCat}
                        onChangeText={v => { setCustomCat(v); setCategory(''); }}
                    />
                    <TextInput
                        style={s.input}
                        placeholder={`Monthly budget amount (${currency})`}
                        placeholderTextColor={Colors.textMuted}
                        keyboardType="decimal-pad"
                        value={amount}
                        onChangeText={setAmount}
                    />

                    <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
                        <Text style={s.saveBtnText}>{editingId ? 'Save Changes' : 'Add Budget'}</Text>
                    </TouchableOpacity>

                    {editingId && (
                        <TouchableOpacity style={s.deleteBtn} onPress={() => {
                            const b = budgets.find(b => b.id === editingId);
                            if (b) { setShowForm(false); setTimeout(() => handleDelete(b.id, b.category), 300); }
                        }}>
                            <Text style={s.deleteBtnText}>Delete Budget</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </Modal>

            <FooterNav />
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe:         { flex: 1, backgroundColor: Colors.bg },
    scroll:       { flex: 1, backgroundColor: Colors.bg },
    pad:          { padding: 16, paddingBottom: 100 },

    headerRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 12 },
    backBtn:      { color: Colors.primary, fontSize: 14 },
    screenTitle:  { flex: 1, fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary },
    addBtn:       { backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
    addBtnText:   { color: '#fff', fontSize: 13, fontWeight: '700' },

    summaryCard:   { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 16 },
    summaryMonth:  { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 12 },
    summaryRow:    { flexDirection: 'row', alignItems: 'center' },
    summaryBox:    { flex: 1, alignItems: 'center' },
    summaryLabel:  { fontSize: 10, color: Colors.textMuted, marginBottom: 4 },
    summaryVal:    { fontSize: 18, fontWeight: 'bold' },
    summaryDivider:{ width: 1, backgroundColor: Colors.border, alignSelf: 'stretch', marginHorizontal: 8 },
    overAlert:     { marginTop: 10, fontSize: 13, color: Colors.expense, fontWeight: '600', textAlign: 'center' },

    emptyState:    { alignItems: 'center', paddingVertical: 40 },
    emptyTitle:    { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 8 },
    emptySub:      { fontSize: 13, color: Colors.textMuted, textAlign: 'center', marginBottom: 20, lineHeight: 20 },
    emptyBtn:      { backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
    emptyBtnText:  { color: '#fff', fontWeight: '700', fontSize: 14 },

    tableHeader:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingLeft: 20 },
    th:            { flex: 1, fontSize: 10, color: Colors.textMuted, fontWeight: '700', textAlign: 'right' },

    tableRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(51,65,85,0.4)' },
    overRow:       { backgroundColor: 'rgba(239,68,68,0.06)' },
    statusDot:     { width: 8, height: 8, borderRadius: 4, marginRight: 8, marginLeft: 4 },
    td:            { flex: 1, fontSize: 12, textAlign: 'right', color: Colors.textSecondary },

    overCard:      { backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: Colors.expense, borderRadius: 10, padding: 12, marginBottom: 10 },
    overCardTitle: { fontSize: 13, fontWeight: '700', color: Colors.expense, marginBottom: 4 },
    overCardText:  { fontSize: 12, color: Colors.textSecondary },

    overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet:        { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 },
    sheetHandle:  { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
    sheetTitle:   { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: 16 },

    catSelector:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.bg, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, padding: 12, marginBottom: 10 },
    catSelectorText: { fontSize: 14, color: Colors.textPrimary },
    catArrow:      { fontSize: 12, color: Colors.textMuted },
    catList:       { maxHeight: 180, backgroundColor: Colors.bg, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, marginBottom: 10 },
    catOption:     { padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
    catOptionActive: { backgroundColor: 'rgba(37,99,235,0.15)' },
    catOptionText: { fontSize: 14, color: Colors.textSecondary },
    catOptionTextActive: { color: Colors.primary, fontWeight: '700' },

    input:        { backgroundColor: Colors.bg, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, padding: 12, color: Colors.textPrimary, marginBottom: 12, fontSize: 14 },
    saveBtn:      { backgroundColor: Colors.primary, borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 10 },
    saveBtnText:  { color: '#fff', fontWeight: '700', fontSize: 15 },
    deleteBtn:    { borderRadius: 10, padding: 12, alignItems: 'center' },
    deleteBtnText:{ color: Colors.expense, fontWeight: '600', fontSize: 14 },
});
