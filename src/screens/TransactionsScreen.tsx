import React, { useState, useMemo } from 'react';
import {
    SafeAreaView, ScrollView, View, Text, TextInput,
    TouchableOpacity, Modal, StyleSheet, Alert,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { Transaction } from '../types';

type FilterType = 'all' | 'income' | 'expense';

const CATEGORIES = [
    'Personnel expenses', 'Software sales', 'Consulting', 'Marketing',
    'Office & Admin', 'Equipment', 'Travel', 'Utilities', 'Other',
];

const TX_CATEGORIES: Transaction['transactionCategory'][] = [
    'purchase', 'sale', 'expense', 'cost', 'other',
];

export default function TransactionsScreen() {
    const { transactions, addTransaction, deleteTransaction, settings } = useApp();
    const { currency } = settings;

    const [modalOpen, setModalOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<FilterType>('all');

    const [form, setForm] = useState({
        description: '',
        amount: '',
        type: 'expense' as 'income' | 'expense',
        category: 'Personnel expenses',
        transactionCategory: 'expense' as Transaction['transactionCategory'],
        reference: '',
        vendorCustomer: '',
    });

    const filtered = useMemo(() => {
        return transactions.filter(tx => {
            const matchType = filter === 'all' || tx.type === filter;
            const q = search.toLowerCase();
            const matchSearch =
                !q ||
                tx.description.toLowerCase().includes(q) ||
                tx.category.toLowerCase().includes(q) ||
                (tx.vendorCustomer?.toLowerCase().includes(q) ?? false) ||
                (tx.reference?.toLowerCase().includes(q) ?? false);
            return matchType && matchSearch;
        });
    }, [transactions, filter, search]);

    const handleAdd = () => {
        const amt = parseFloat(form.amount);
        if (!form.description || isNaN(amt) || amt <= 0) {
            Alert.alert('Invalid entry', 'Please enter a description and a valid amount.');
            return;
        }
        addTransaction({
            description: form.description,
            amount: amt,
            type: form.type,
            category: form.category,
            transactionCategory: form.transactionCategory,
            reference: form.reference,
            vendorCustomer: form.vendorCustomer,
        });
        setForm({
            description: '',
            amount: '',
            type: 'expense',
            category: 'Personnel expenses',
            transactionCategory: 'expense',
            reference: '',
            vendorCustomer: '',
        });
        setModalOpen(false);
    };

    const handleDelete = (id: string, desc: string) => {
        Alert.alert('Delete Transaction', `Remove "${desc}"?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteTransaction(id) },
        ]);
    };

    return (
        <SafeAreaView style={styles.safe}>
            <Header />
            <View style={styles.topBar}>
                <TextInput
                    style={styles.search}
                    placeholder="Search transactions..."
                    placeholderTextColor={Colors.muted}
                    value={search}
                    onChangeText={setSearch}
                />
                <TouchableOpacity style={styles.addBtn} onPress={() => setModalOpen(true)}>
                    <Text style={styles.addBtnText}>+ New</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.filterRow}>
                {(['all', 'income', 'expense'] as FilterType[]).map(f => (
                    <TouchableOpacity
                        key={f}
                        style={[styles.filterBtn, filter === f && styles.filterActive]}
                        onPress={() => setFilter(f)}
                    >
                        <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                        </Text>
                    </TouchableOpacity>
                ))}
                <Text style={styles.count}>{filtered.length} entries</Text>
            </View>

            <ScrollView style={styles.scroll}>
                <View style={styles.pad}>
                    {filtered.length === 0 && (
                        <Text style={styles.empty}>No transactions match your search.</Text>
                    )}
                    {filtered.map(tx => (
                        <View key={tx.id} style={[styles.txCard, tx.type === 'income' ? styles.incomeCard : styles.expenseCard]}>
                            <View style={styles.txTop}>
                                <Text style={styles.txDesc} numberOfLines={1}>{tx.description}</Text>
                                <Text style={tx.type === 'income' ? styles.incomeAmt : styles.expenseAmt}>
                                    {tx.type === 'income' ? '+' : '-'}{currency}{tx.amount.toLocaleString()}
                                </Text>
                            </View>
                            <View style={styles.txMeta}>
                                <Text style={styles.metaText}>{tx.date}</Text>
                                <Text style={styles.metaText}>{tx.category}</Text>
                                {tx.reference ? <Text style={styles.metaText}>#{tx.reference}</Text> : null}
                                {tx.vendorCustomer ? <Text style={styles.metaText}>{tx.vendorCustomer}</Text> : null}
                                <TouchableOpacity onPress={() => handleDelete(tx.id, tx.description)}>
                                    <Text style={styles.deleteText}>Delete</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))}
                </View>
            </ScrollView>
            <FooterNav />

            <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
                <View style={styles.overlay}>
                    <ScrollView>
                        <View style={styles.modal}>
                            <Text style={styles.modalTitle}>Log New Transaction</Text>

                            <Text style={styles.label}>Description *</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Enter description"
                                placeholderTextColor={Colors.muted}
                                value={form.description}
                                onChangeText={v => setForm(f => ({ ...f, description: v }))}
                            />

                            <Text style={styles.label}>Amount ({currency}) *</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="0.00"
                                placeholderTextColor={Colors.muted}
                                keyboardType="numeric"
                                value={form.amount}
                                onChangeText={v => setForm(f => ({ ...f, amount: v }))}
                            />

                            <Text style={styles.label}>Type</Text>
                            <View style={styles.optRow}>
                                {(['income', 'expense'] as const).map(t => (
                                    <TouchableOpacity
                                        key={t}
                                        style={[styles.opt, form.type === t && styles.optActive]}
                                        onPress={() => setForm(f => ({ ...f, type: t }))}
                                    >
                                        <Text style={styles.optText}>{t.charAt(0).toUpperCase() + t.slice(1)}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <Text style={styles.label}>Category</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
                                {CATEGORIES.map(c => (
                                    <TouchableOpacity
                                        key={c}
                                        style={[styles.catChip, form.category === c && styles.catChipActive]}
                                        onPress={() => setForm(f => ({ ...f, category: c }))}
                                    >
                                        <Text style={styles.catText}>{c}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>

                            <Text style={styles.label}>Transaction Category</Text>
                            <View style={styles.optRow}>
                                {TX_CATEGORIES.map(tc => (
                                    <TouchableOpacity
                                        key={tc}
                                        style={[styles.opt, form.transactionCategory === tc && styles.optActive]}
                                        onPress={() => setForm(f => ({ ...f, transactionCategory: tc }))}
                                    >
                                        <Text style={styles.optText}>{tc}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <Text style={styles.label}>Reference (optional)</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Invoice number, etc."
                                placeholderTextColor={Colors.muted}
                                value={form.reference}
                                onChangeText={v => setForm(f => ({ ...f, reference: v }))}
                            />

                            <Text style={styles.label}>Vendor / Customer (optional)</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Name"
                                placeholderTextColor={Colors.muted}
                                value={form.vendorCustomer}
                                onChangeText={v => setForm(f => ({ ...f, vendorCustomer: v }))}
                            />

                            <View style={styles.modalBtns}>
                                <TouchableOpacity
                                    style={[styles.modalBtn, { backgroundColor: Colors.muted }]}
                                    onPress={() => setModalOpen(false)}
                                >
                                    <Text style={styles.modalBtnText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.modalBtn, { backgroundColor: Colors.income }]}
                                    onPress={handleAdd}
                                >
                                    <Text style={styles.modalBtnText}>Commit Ledger</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </ScrollView>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    topBar: {
        flexDirection: 'row',
        padding: 12,
        gap: 8,
        backgroundColor: Colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    search: {
        flex: 1,
        backgroundColor: Colors.bg,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        color: Colors.textPrimary,
        fontSize: 14,
    },
    addBtn: { backgroundColor: Colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, justifyContent: 'center' },
    addBtnText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 14 },
    filterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 8,
        paddingHorizontal: 12,
        backgroundColor: Colors.surface,
        gap: 8,
    },
    filterBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, backgroundColor: Colors.bg },
    filterActive: { backgroundColor: Colors.primary },
    filterText: { color: Colors.textMuted, fontSize: 12 },
    filterTextActive: { color: Colors.textPrimary, fontWeight: 'bold' },
    count: { color: Colors.textMuted, fontSize: 11, marginLeft: 'auto' },
    scroll: { flex: 1 },
    pad: { padding: 12 },
    empty: { color: Colors.textMuted, textAlign: 'center', marginTop: 40, fontSize: 14 },
    txCard: {
        backgroundColor: Colors.surface,
        borderRadius: 8,
        padding: 12,
        marginBottom: 8,
        borderLeftWidth: 3,
    },
    incomeCard: { borderLeftColor: Colors.income },
    expenseCard: { borderLeftColor: Colors.expense },
    txTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    txDesc: { fontSize: 14, color: Colors.textPrimary, flex: 1, marginRight: 8 },
    incomeAmt: { fontSize: 14, fontWeight: 'bold', color: Colors.income },
    expenseAmt: { fontSize: 14, fontWeight: 'bold', color: Colors.expense },
    txMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
    metaText: { fontSize: 11, color: Colors.textMuted },
    deleteText: { fontSize: 11, color: Colors.expense, marginLeft: 'auto' },
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    modal: {
        backgroundColor: Colors.surface,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 24,
        paddingBottom: 40,
    },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary, textAlign: 'center', marginBottom: 20 },
    label: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600', marginBottom: 6, marginTop: 12 },
    input: {
        backgroundColor: Colors.bg,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: Colors.textPrimary,
        fontSize: 14,
    },
    optRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    opt: { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 6 },
    optActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    optText: { color: Colors.textSecondary, fontSize: 12 },
    catScroll: { marginBottom: 4 },
    catChip: { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 16, marginRight: 8 },
    catChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    catText: { color: Colors.textSecondary, fontSize: 12 },
    modalBtns: { flexDirection: 'row', gap: 12, marginTop: 24 },
    modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
    modalBtnText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 14 },
});
