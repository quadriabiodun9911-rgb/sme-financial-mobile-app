import React, { useState, useMemo } from 'react';
import {
    SafeAreaView, ScrollView, View, Text, TextInput,
    TouchableOpacity, Modal, StyleSheet, Alert, Share,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { Transaction, TransactionStatus, RecurringFrequency } from '../types';
import { transactionsToCSV } from '../utils/finance';

type FilterType = 'all' | 'income' | 'expense';
type StatusFilter = 'all' | 'paid' | 'pending' | 'overdue';

const CATEGORIES = [
    'Software sales', 'Consulting', 'Personnel expenses', 'Marketing',
    'Office & Admin', 'Equipment', 'Travel', 'Utilities', 'Tax', 'Other',
];

const TX_CATEGORIES: Transaction['transactionCategory'][] = [
    'purchase', 'sale', 'expense', 'cost', 'other',
];

const STATUSES: TransactionStatus[] = ['paid', 'pending', 'overdue'];
const FREQUENCIES: RecurringFrequency[] = ['weekly', 'monthly', 'quarterly'];

type FormState = {
    description: string;
    amount: string;
    type: 'income' | 'expense';
    category: string;
    transactionCategory: Transaction['transactionCategory'];
    reference: string;
    vendorCustomer: string;
    taxRate: string;
    status: TransactionStatus;
    dueDate: string;
    isRecurring: boolean;
    recurringFrequency: RecurringFrequency;
};

const EMPTY_FORM: FormState = {
    description: '',
    amount: '',
    type: 'expense',
    category: 'Personnel expenses',
    transactionCategory: 'expense',
    reference: '',
    vendorCustomer: '',
    taxRate: '',
    status: 'paid',
    dueDate: '',
    isRecurring: false,
    recurringFrequency: 'monthly',
};

export default function TransactionsScreen() {
    const { transactions, addTransaction, deleteTransaction, updateTransaction, settings } = useApp();
    const { currency, defaultTaxRate } = settings;

    const [modalOpen, setModalOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<FilterType>('all');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

    const [form, setForm] = useState<FormState>({ ...EMPTY_FORM, taxRate: defaultTaxRate });

    const filtered = useMemo(() => {
        return transactions.filter(tx => {
            const matchType = typeFilter === 'all' || tx.type === typeFilter;
            const txStatus = tx.status ?? 'paid';
            const matchStatus = statusFilter === 'all' || txStatus === statusFilter;
            const q = search.toLowerCase();
            const matchSearch =
                !q ||
                tx.description.toLowerCase().includes(q) ||
                tx.category.toLowerCase().includes(q) ||
                (tx.vendorCustomer?.toLowerCase().includes(q) ?? false) ||
                (tx.reference?.toLowerCase().includes(q) ?? false);
            return matchType && matchStatus && matchSearch;
        });
    }, [transactions, typeFilter, statusFilter, search]);

    const openModal = () => {
        setForm({ ...EMPTY_FORM, taxRate: defaultTaxRate });
        setModalOpen(true);
    };

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
            taxRate: form.taxRate ? parseFloat(form.taxRate) : undefined,
            status: form.status,
            dueDate: form.dueDate || undefined,
            isRecurring: form.isRecurring,
            recurringFrequency: form.isRecurring ? form.recurringFrequency : undefined,
        });
        setModalOpen(false);
    };

    const handleDelete = (id: string, desc: string) => {
        Alert.alert('Delete Transaction', `Remove "${desc}"?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteTransaction(id) },
        ]);
    };

    const handleMarkPaid = (id: string) => {
        updateTransaction(id, { status: 'paid' });
    };

    const handleExportCSV = async () => {
        const csv = transactionsToCSV(filtered);
        try {
            await Share.share({
                message: csv,
                title: 'FinanceBook Transactions Export',
            });
        } catch (_) {}
    };

    const statusColor = (status?: TransactionStatus) => {
        if (status === 'overdue') return Colors.expense;
        if (status === 'pending') return Colors.warning;
        return Colors.income;
    };

    return (
        <SafeAreaView style={styles.safe}>
            <Header />

            {/* Search + action bar */}
            <View style={styles.topBar}>
                <TextInput
                    style={styles.search}
                    placeholder="Search..."
                    placeholderTextColor={Colors.muted}
                    value={search}
                    onChangeText={setSearch}
                />
                <TouchableOpacity style={styles.exportBtn} onPress={handleExportCSV}>
                    <Text style={styles.exportBtnText}>CSV</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.addBtn} onPress={openModal}>
                    <Text style={styles.addBtnText}>+ New</Text>
                </TouchableOpacity>
            </View>

            {/* Filters */}
            <View style={styles.filterRow}>
                {(['all', 'income', 'expense'] as FilterType[]).map(f => (
                    <TouchableOpacity
                        key={f}
                        style={[styles.filterChip, typeFilter === f && styles.filterChipActive]}
                        onPress={() => setTypeFilter(f)}
                    >
                        <Text style={[styles.filterChipText, typeFilter === f && styles.filterChipTextActive]}>
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                        </Text>
                    </TouchableOpacity>
                ))}
                <View style={styles.divider} />
                {(['all', 'paid', 'pending', 'overdue'] as StatusFilter[]).map(f => (
                    <TouchableOpacity
                        key={f}
                        style={[styles.filterChip, statusFilter === f && styles.filterChipActive]}
                        onPress={() => setStatusFilter(f)}
                    >
                        <Text style={[styles.filterChipText, statusFilter === f && styles.filterChipTextActive]}>
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                        </Text>
                    </TouchableOpacity>
                ))}
                <Text style={styles.count}>{filtered.length}</Text>
            </View>

            <ScrollView style={styles.scroll}>
                <View style={styles.pad}>
                    {filtered.length === 0 && (
                        <Text style={styles.empty}>No transactions match your filters.</Text>
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
                                {tx.taxAmount ? (
                                    <Text style={styles.taxBadge}>Tax: {currency}{tx.taxAmount.toLocaleString()}</Text>
                                ) : null}
                                {tx.isRecurring ? (
                                    <Text style={styles.recurringBadge}>↻ {tx.recurringFrequency}</Text>
                                ) : null}
                                <View style={[styles.statusDot, { backgroundColor: statusColor(tx.status) }]} />
                                <Text style={[styles.statusText, { color: statusColor(tx.status) }]}>
                                    {tx.status ?? 'paid'}
                                </Text>
                                {tx.dueDate ? <Text style={styles.metaText}>Due: {tx.dueDate}</Text> : null}
                            </View>
                            <View style={styles.txActions}>
                                {(tx.status === 'pending' || tx.status === 'overdue') && (
                                    <TouchableOpacity
                                        style={styles.markPaidBtn}
                                        onPress={() => handleMarkPaid(tx.id)}
                                    >
                                        <Text style={styles.markPaidText}>Mark Paid</Text>
                                    </TouchableOpacity>
                                )}
                                <TouchableOpacity onPress={() => handleDelete(tx.id, tx.description)}>
                                    <Text style={styles.deleteText}>Delete</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))}
                </View>
            </ScrollView>
            <FooterNav />

            {/* New Transaction Modal */}
            <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
                <View style={styles.overlay}>
                    <ScrollView keyboardShouldPersistTaps="handled">
                        <View style={styles.modal}>
                            <Text style={styles.modalTitle}>Log New Transaction</Text>

                            <FieldLabel>Description *</FieldLabel>
                            <TextInput
                                style={styles.input}
                                placeholder="Enter description"
                                placeholderTextColor={Colors.muted}
                                value={form.description}
                                onChangeText={v => setForm(f => ({ ...f, description: v }))}
                            />

                            <FieldLabel>Amount ({currency}) *</FieldLabel>
                            <TextInput
                                style={styles.input}
                                placeholder="0.00"
                                placeholderTextColor={Colors.muted}
                                keyboardType="numeric"
                                value={form.amount}
                                onChangeText={v => setForm(f => ({ ...f, amount: v }))}
                            />

                            <FieldLabel>Type</FieldLabel>
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

                            <FieldLabel>Status</FieldLabel>
                            <View style={styles.optRow}>
                                {STATUSES.map(s => (
                                    <TouchableOpacity
                                        key={s}
                                        style={[styles.opt, form.status === s && styles.optActive]}
                                        onPress={() => setForm(f => ({ ...f, status: s }))}
                                    >
                                        <Text style={styles.optText}>{s.charAt(0).toUpperCase() + s.slice(1)}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {form.status !== 'paid' && (
                                <>
                                    <FieldLabel>Due Date (YYYY-MM-DD)</FieldLabel>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="2026-07-01"
                                        placeholderTextColor={Colors.muted}
                                        value={form.dueDate}
                                        onChangeText={v => setForm(f => ({ ...f, dueDate: v }))}
                                    />
                                </>
                            )}

                            <FieldLabel>Category</FieldLabel>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                <View style={styles.optRow}>
                                    {CATEGORIES.map(c => (
                                        <TouchableOpacity
                                            key={c}
                                            style={[styles.opt, form.category === c && styles.optActive]}
                                            onPress={() => setForm(f => ({ ...f, category: c }))}
                                        >
                                            <Text style={styles.optText}>{c}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </ScrollView>

                            <FieldLabel>Transaction Category</FieldLabel>
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

                            <FieldLabel>Tax Rate (%)</FieldLabel>
                            <TextInput
                                style={styles.input}
                                placeholder="0"
                                placeholderTextColor={Colors.muted}
                                keyboardType="numeric"
                                value={form.taxRate}
                                onChangeText={v => setForm(f => ({ ...f, taxRate: v }))}
                            />
                            {form.taxRate && form.amount ? (
                                <Text style={styles.taxPreview}>
                                    Tax amount: {currency}{(parseFloat(form.amount || '0') * (parseFloat(form.taxRate) / 100)).toFixed(2)}
                                </Text>
                            ) : null}

                            <FieldLabel>Reference (optional)</FieldLabel>
                            <TextInput
                                style={styles.input}
                                placeholder="Invoice number, etc."
                                placeholderTextColor={Colors.muted}
                                value={form.reference}
                                onChangeText={v => setForm(f => ({ ...f, reference: v }))}
                            />

                            <FieldLabel>Vendor / Customer (optional)</FieldLabel>
                            <TextInput
                                style={styles.input}
                                placeholder="Name"
                                placeholderTextColor={Colors.muted}
                                value={form.vendorCustomer}
                                onChangeText={v => setForm(f => ({ ...f, vendorCustomer: v }))}
                            />

                            {/* Recurring */}
                            <View style={styles.recurringRow}>
                                <Text style={styles.label}>Recurring Transaction</Text>
                                <TouchableOpacity
                                    style={[styles.toggle, form.isRecurring && styles.toggleActive]}
                                    onPress={() => setForm(f => ({ ...f, isRecurring: !f.isRecurring }))}
                                >
                                    <Text style={styles.toggleText}>{form.isRecurring ? 'ON' : 'OFF'}</Text>
                                </TouchableOpacity>
                            </View>

                            {form.isRecurring && (
                                <>
                                    <FieldLabel>Frequency</FieldLabel>
                                    <View style={styles.optRow}>
                                        {FREQUENCIES.map(fr => (
                                            <TouchableOpacity
                                                key={fr}
                                                style={[styles.opt, form.recurringFrequency === fr && styles.optActive]}
                                                onPress={() => setForm(f => ({ ...f, recurringFrequency: fr }))}
                                            >
                                                <Text style={styles.optText}>{fr.charAt(0).toUpperCase() + fr.slice(1)}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </>
                            )}

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

function FieldLabel({ children }: { children: React.ReactNode }) {
    return <Text style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    topBar: {
        flexDirection: 'row',
        padding: 10,
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
    exportBtn: {
        backgroundColor: Colors.muted,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        justifyContent: 'center',
    },
    exportBtnText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 12 },
    addBtn: {
        backgroundColor: Colors.primary,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 8,
        justifyContent: 'center',
    },
    addBtnText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 14 },
    filterRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        padding: 8,
        paddingHorizontal: 10,
        backgroundColor: Colors.surface,
        gap: 6,
    },
    filterChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, backgroundColor: Colors.bg },
    filterChipActive: { backgroundColor: Colors.primary },
    filterChipText: { color: Colors.textMuted, fontSize: 11 },
    filterChipTextActive: { color: Colors.textPrimary, fontWeight: 'bold' },
    divider: { width: 1, height: 18, backgroundColor: Colors.border, marginHorizontal: 2 },
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
    txMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 6 },
    metaText: { fontSize: 11, color: Colors.textMuted },
    taxBadge: { fontSize: 10, color: Colors.warning, fontWeight: '600', backgroundColor: 'rgba(245,158,11,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
    recurringBadge: { fontSize: 10, color: Colors.primary, fontWeight: '600', backgroundColor: 'rgba(37,99,235,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
    statusDot: { width: 7, height: 7, borderRadius: 4 },
    statusText: { fontSize: 11, fontWeight: '600' },
    txActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
    markPaidBtn: { paddingHorizontal: 8, paddingVertical: 3, backgroundColor: 'rgba(16,185,129,0.15)', borderRadius: 6 },
    markPaidText: { fontSize: 11, color: Colors.income, fontWeight: '600' },
    deleteText: { fontSize: 11, color: Colors.expense },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modal: {
        backgroundColor: Colors.surface,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 24,
        paddingBottom: 44,
    },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary, textAlign: 'center', marginBottom: 16 },
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
    taxPreview: { fontSize: 11, color: Colors.warning, marginTop: 4 },
    optRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    opt: { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 6 },
    optActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    optText: { color: Colors.textSecondary, fontSize: 12 },
    recurringRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
    toggle: { paddingHorizontal: 14, paddingVertical: 6, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 20 },
    toggleActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    toggleText: { color: Colors.textPrimary, fontSize: 12, fontWeight: 'bold' },
    modalBtns: { flexDirection: 'row', gap: 12, marginTop: 24 },
    modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
    modalBtnText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 14 },
});
