import React, { useState, useMemo } from 'react';
import {
    SafeAreaView, ScrollView, View, Text, TextInput,
    TouchableOpacity, Modal, StyleSheet, Alert, Share,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import DateInput from '../components/DateInput';
import { Transaction, TransactionStatus, RecurringFrequency } from '../types';
import { transactionsToCSV } from '../utils/finance';

type FilterType   = 'all' | 'income' | 'expense';
type StatusFilter = 'all' | 'paid' | 'pending' | 'overdue';

const CATEGORIES: string[] = [
    'Software sales', 'Consulting', 'Personnel expenses', 'Marketing',
    'Office & Admin', 'Equipment', 'Travel', 'Utilities', 'Tax', 'Other',
];

const STATUSES: TransactionStatus[]   = ['paid', 'pending', 'overdue'];
const FREQUENCIES: RecurringFrequency[] = ['weekly', 'monthly', 'quarterly'];

type FormState = {
    description: string;
    amount: string;
    type: 'income' | 'expense';
    category: string;
    reference: string;
    vendorCustomer: string;
    taxRate: string;
    status: TransactionStatus;
    dueDate: string;
    date: string;
    isRecurring: boolean;
    recurringFrequency: RecurringFrequency;
};

function todayStr() {
    return new Date().toISOString().split('T')[0];
}

const EMPTY_FORM: FormState = {
    description: '',
    amount: '',
    type: 'expense',
    category: 'Other',
    reference: '',
    vendorCustomer: '',
    taxRate: '',
    status: 'paid',
    dueDate: '',
    date: todayStr(),
    isRecurring: false,
    recurringFrequency: 'monthly',
};

function formFromTx(tx: Transaction): FormState {
    return {
        description:        tx.description,
        amount:             String(tx.amount),
        type:               tx.type,
        category:           tx.category,
        reference:          tx.reference ?? '',
        vendorCustomer:     tx.vendorCustomer ?? '',
        taxRate:            tx.taxRate != null ? String(tx.taxRate) : '',
        status:             tx.status ?? 'paid',
        dueDate:            tx.dueDate ?? '',
        date:               tx.date,
        isRecurring:        tx.isRecurring ?? false,
        recurringFrequency: tx.recurringFrequency ?? 'monthly',
    };
}

// ─── Group transactions by date ───────────────────────────────────────────────
function groupByDate(txs: Transaction[]): Array<{ date: string; items: Transaction[] }> {
    const map = new Map<string, Transaction[]>();
    for (const tx of txs) {
        const group = map.get(tx.date) ?? [];
        group.push(tx);
        map.set(tx.date, group);
    }
    return Array.from(map.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([date, items]) => ({ date, items }));
}

function formatDateHeader(iso: string): string {
    const d = new Date(iso + 'T00:00:00');
    const today    = todayStr();
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    if (iso === today)     return 'Today';
    if (iso === yesterday) return 'Yesterday';
    return d.toLocaleDateString('default', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export default function TransactionsScreen() {
    const { transactions, addTransaction, deleteTransaction, updateTransaction, settings } = useApp();
    const { currency, defaultTaxRate } = settings;

    const [modalOpen, setModalOpen]   = useState(false);
    const [editingId, setEditingId]   = useState<string | null>(null);
    const [search, setSearch]         = useState('');
    const [typeFilter, setTypeFilter] = useState<FilterType>('all');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [form, setForm]             = useState<FormState>({ ...EMPTY_FORM, taxRate: defaultTaxRate });
    const [csvModalOpen, setCsvModalOpen] = useState(false);
    const [csvText, setCsvText]           = useState('');

    // ── Filtering ────────────────────────────────────────────────────────────
    const filtered = useMemo(() => {
        return transactions.filter(tx => {
            if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
            if (statusFilter !== 'all' && (tx.status ?? 'paid') !== statusFilter) return false;
            const q = search.toLowerCase();
            if (q && !(
                tx.description.toLowerCase().includes(q) ||
                tx.category.toLowerCase().includes(q) ||
                (tx.vendorCustomer?.toLowerCase().includes(q) ?? false) ||
                (tx.reference?.toLowerCase().includes(q) ?? false) ||
                String(tx.amount).includes(q)
            )) return false;
            return true;
        });
    }, [transactions, typeFilter, statusFilter, search]);

    const grouped = useMemo(() => groupByDate(filtered), [filtered]);

    const totals = useMemo(() => {
        const income  = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const expense = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        return { income, expense, net: income - expense };
    }, [filtered]);

    // ── Modal helpers ────────────────────────────────────────────────────────
    const openNew = () => {
        setEditingId(null);
        setForm({ ...EMPTY_FORM, taxRate: defaultTaxRate, date: todayStr() });
        setModalOpen(true);
    };

    const openEdit = (tx: Transaction) => {
        setEditingId(tx.id);
        setForm(formFromTx(tx));
        setModalOpen(true);
    };

    const handleSave = () => {
        const amt = parseFloat(form.amount);
        if (!form.description.trim() || isNaN(amt) || amt <= 0) {
            Alert.alert('Invalid entry', 'Please enter a description and a valid amount.');
            return;
        }

        const payload = {
            description:        form.description.trim(),
            amount:             amt,
            type:               form.type,
            category:           form.category,
            reference:          form.reference || undefined,
            vendorCustomer:     form.vendorCustomer || undefined,
            taxRate:            form.taxRate ? parseFloat(form.taxRate) : undefined,
            status:             form.status,
            dueDate:            form.dueDate || undefined,
            date:               form.date || todayStr(),
            isRecurring:        form.isRecurring,
            recurringFrequency: form.isRecurring ? form.recurringFrequency : undefined,
        };

        if (editingId) {
            updateTransaction(editingId, payload);
        } else {
            addTransaction(payload);
        }
        setModalOpen(false);
    };

    const handleDelete = (id: string, desc: string) => {
        Alert.alert('Delete Transaction', `Remove "${desc}"?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteTransaction(id) },
        ]);
    };

    const handleMarkPaid = (id: string) => updateTransaction(id, { status: 'paid' });

    const handleExportCSV = async () => {
        try {
            await Share.share({ message: transactionsToCSV(filtered), title: 'Quad360 Export' });
        } catch (_) {}
    };

    const handleImportCSV = () => {
        const rows = parseCSV(csvText);
        if (rows.length === 0) {
            Alert.alert('No valid rows', 'Could not parse any valid transactions from the CSV. Check the format and try again.');
            return;
        }
        let imported = 0;
        let skipped = 0;
        const total = csvText.trim().split('\n').filter(l => l.trim()).length - 1;
        for (const row of rows) {
            try {
                addTransaction({
                    description: row.description,
                    amount: row.amount,
                    type: row.type,
                    category: row.category,
                    date: row.date,
                    status: 'paid',
                });
                imported++;
            } catch {
                skipped++;
            }
        }
        skipped += Math.max(0, total - rows.length);
        setCsvModalOpen(false);
        setCsvText('');
        Alert.alert('Import Complete', `Imported ${imported} transaction${imported !== 1 ? 's' : ''}${skipped > 0 ? `, skipped ${skipped} row${skipped !== 1 ? 's' : ''}` : ''}.`);
    };

    const statusColor = (s?: TransactionStatus) =>
        s === 'overdue' ? Colors.expense : s === 'pending' ? Colors.warning : Colors.income;

    const taxPreview = form.amount && form.taxRate
        ? (parseFloat(form.amount || '0') * (parseFloat(form.taxRate) / 100)).toFixed(2)
        : null;

    return (
        <SafeAreaView style={styles.safe}>
            <Header />

            {/* ── Search + action bar ──────────────────────────────────── */}
            <View style={styles.topBar}>
                <TextInput
                    style={styles.search}
                    placeholder="Search..."
                    placeholderTextColor={Colors.muted}
                    value={search}
                    onChangeText={setSearch}
                />
                <TouchableOpacity style={styles.csvBtn} onPress={handleExportCSV}>
                    <Text style={styles.csvBtnText}>Export</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.importBtn} onPress={() => { setCsvText(''); setCsvModalOpen(true); }}>
                    <Text style={styles.csvBtnText}>Import CSV</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.addBtn} onPress={openNew}>
                    <Text style={styles.addBtnText}>+ New</Text>
                </TouchableOpacity>
            </View>

            {/* ── Filter row ───────────────────────────────────────────── */}
            <View style={styles.filterBar}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
                    <Text style={styles.filterLabel}>Type:</Text>
                    {(['all', 'income', 'expense'] as FilterType[]).map(f => (
                        <TouchableOpacity
                            key={f}
                            style={[styles.chip, typeFilter === f && styles.chipActive]}
                            onPress={() => setTypeFilter(f)}
                        >
                            <Text style={[styles.chipText, typeFilter === f && styles.chipTextActive]}>
                                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                            </Text>
                        </TouchableOpacity>
                    ))}
                    <View style={styles.sep} />
                    <Text style={styles.filterLabel}>Status:</Text>
                    {(['all', 'paid', 'pending', 'overdue'] as StatusFilter[]).map(f => (
                        <TouchableOpacity
                            key={f}
                            style={[styles.chip, statusFilter === f && styles.chipActive]}
                            onPress={() => setStatusFilter(f)}
                        >
                            <Text style={[styles.chipText, statusFilter === f && styles.chipTextActive]}>
                                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
                <Text style={styles.countBadge}>{filtered.length}</Text>
            </View>

            {/* ── Totals strip ─────────────────────────────────────────── */}
            <View style={styles.totalsRow}>
                <TotalPill label="Income"  value={`+${currency}${totals.income.toLocaleString()}`}  color={Colors.income} />
                <TotalPill label="Expense" value={`-${currency}${totals.expense.toLocaleString()}`} color={Colors.expense} />
                <TotalPill
                    label="Net"
                    value={`${totals.net >= 0 ? '+' : ''}${currency}${totals.net.toLocaleString()}`}
                    color={totals.net >= 0 ? Colors.income : Colors.expense}
                    bold
                />
            </View>

            {/* ── Transaction list ─────────────────────────────────────── */}
            <ScrollView style={styles.scroll}>
                <View style={styles.pad}>
                    {filtered.length === 0 && (
                        <View style={styles.emptyBox}>
                            <Text style={styles.emptyTitle}>No transactions</Text>
                            <Text style={styles.emptyHint}>
                                {search || typeFilter !== 'all' || statusFilter !== 'all'
                                    ? 'Try clearing your filters.'
                                    : 'Tap "+ New" to log your first entry.'}
                            </Text>
                        </View>
                    )}

                    {grouped.map(({ date, items }) => (
                        <View key={date}>
                            {/* Date header */}
                            <View style={styles.dateHeader}>
                                <Text style={styles.dateHeaderText}>{formatDateHeader(date)}</Text>
                                <View style={styles.dateHeaderLine} />
                            </View>

                            {items.map(tx => (
                                <TouchableOpacity
                                    key={tx.id}
                                    style={[styles.txCard, tx.type === 'income' ? styles.incomeCard : styles.expenseCard, tx.status === 'overdue' && styles.overdueCard]}
                                    onPress={() => openEdit(tx)}
                                    activeOpacity={0.8}
                                >
                                    {/* Top row */}
                                    <View style={styles.txTop}>
                                        <Text style={styles.txDesc} numberOfLines={1}>{tx.description}</Text>
                                        <Text style={tx.type === 'income' ? styles.incAmt : styles.expAmt}>
                                            {tx.type === 'income' ? '+' : '-'}{currency}{tx.amount.toLocaleString()}
                                        </Text>
                                    </View>

                                    {/* Second row: category + vendor */}
                                    <View style={styles.txRow2}>
                                        <Text style={styles.catChip}>{tx.category}</Text>
                                        {tx.vendorCustomer ? (
                                            <Text style={styles.metaText} numberOfLines={1}>{tx.vendorCustomer}</Text>
                                        ) : null}
                                        {tx.reference ? (
                                            <Text style={styles.metaText}>#{tx.reference}</Text>
                                        ) : null}
                                    </View>

                                    {/* Third row: badges */}
                                    <View style={styles.txBadges}>
                                        <View style={[styles.statusBadge, { backgroundColor: statusColor(tx.status) + '22' }]}>
                                            <View style={[styles.statusDot, { backgroundColor: statusColor(tx.status) }]} />
                                            <Text style={[styles.statusText, { color: statusColor(tx.status) }]}>
                                                {tx.status ?? 'paid'}
                                            </Text>
                                        </View>
                                        {tx.dueDate ? (
                                            <Text style={styles.dueBadge}>Due {tx.dueDate}</Text>
                                        ) : null}
                                        {tx.taxAmount ? (
                                            <Text style={styles.taxBadge}>Tax {currency}{tx.taxAmount.toLocaleString()}</Text>
                                        ) : null}
                                        {tx.isRecurring ? (
                                            <Text style={styles.recurBadge}>↻ {tx.recurringFrequency}</Text>
                                        ) : null}
                                    </View>

                                    {/* Action row */}
                                    <View style={styles.txActions}>
                                        <Text style={styles.editHint}>Tap to edit</Text>
                                        <View style={styles.actionBtns}>
                                            {(tx.status === 'pending' || tx.status === 'overdue') && (
                                                <TouchableOpacity
                                                    style={styles.paidBtn}
                                                    onPress={() => handleMarkPaid(tx.id)}
                                                >
                                                    <Text style={styles.paidBtnText}>Mark Paid</Text>
                                                </TouchableOpacity>
                                            )}
                                            <TouchableOpacity onPress={() => handleDelete(tx.id, tx.description)}>
                                                <Text style={styles.deleteText}>Delete</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </View>
                    ))}
                </View>
            </ScrollView>

            <FooterNav />

            {/* ── CSV Import Modal ─────────────────────────────────────── */}
            <Modal
                visible={csvModalOpen}
                animationType="slide"
                transparent
                onRequestClose={() => setCsvModalOpen(false)}
            >
                <View style={styles.overlay}>
                    <View style={styles.modalSheet}>
                        <View style={styles.handle} />
                        <Text style={styles.modalTitle}>Import Transactions from CSV</Text>
                        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                            <Text style={{ fontSize: 11, color: Colors.textMuted, marginBottom: 8, lineHeight: 16 }}>
                                Paste CSV text below. Expected format:{'\n'}
                                <Text style={{ color: Colors.textSecondary, fontFamily: 'monospace' }}>
                                    date,description,type,amount,category{'\n'}
                                    2024-01-15,Client Payment,income,5000,Sales{'\n'}
                                    2024-01-16,Office Rent,expense,1200,Rent
                                </Text>
                            </Text>
                            <TouchableOpacity
                                style={{ marginBottom: 12 }}
                                onPress={() => Alert.alert(
                                    'CSV Template',
                                    'date,description,type,amount,category\n2024-01-15,Client Payment,income,5000,Sales\n2024-01-16,Office Rent,expense,1200,Rent',
                                )}
                            >
                                <Text style={{ fontSize: 12, color: Colors.primary, fontWeight: '600' }}>Download Template (view format)</Text>
                            </TouchableOpacity>
                            <TextInput
                                style={[styles.input, { height: 200, textAlignVertical: 'top', fontFamily: 'monospace', fontSize: 12 }]}
                                multiline
                                value={csvText}
                                onChangeText={setCsvText}
                                placeholder="Paste your CSV here..."
                                placeholderTextColor={Colors.muted}
                            />
                            <View style={styles.modalBtns}>
                                <TouchableOpacity
                                    style={[styles.modalBtn, styles.cancelBtn]}
                                    onPress={() => setCsvModalOpen(false)}
                                >
                                    <Text style={styles.cancelBtnText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.modalBtn, styles.saveBtn]}
                                    onPress={handleImportCSV}
                                >
                                    <Text style={styles.saveBtnText}>Import</Text>
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* ── Add / Edit Modal ─────────────────────────────────────── */}
            <Modal
                visible={modalOpen}
                animationType="slide"
                transparent
                onRequestClose={() => setModalOpen(false)}
            >
                <View style={styles.overlay}>
                    <View style={styles.modalSheet}>
                        {/* Handle */}
                        <View style={styles.handle} />

                        <Text style={styles.modalTitle}>
                            {editingId ? 'Edit Transaction' : 'New Transaction'}
                        </Text>

                        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                            {/* ── Core fields ───────────────────────────── */}
                            <Section label="Core Details">
                                <Field label="Description *">
                                    <TextInput
                                        style={styles.input}
                                        placeholder="e.g. Client invoice, Rent payment"
                                        placeholderTextColor={Colors.muted}
                                        value={form.description}
                                        onChangeText={v => setForm(f => ({ ...f, description: v }))}
                                    />
                                </Field>

                                <Field label={`Amount (${currency}) *`}>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="0.00"
                                        placeholderTextColor={Colors.muted}
                                        keyboardType="numeric"
                                        value={form.amount}
                                        onChangeText={v => setForm(f => ({ ...f, amount: v }))}
                                    />
                                </Field>

                                <Field label="Date">
                                    <DateInput
                                        value={form.date}
                                        onChange={v => setForm(f => ({ ...f, date: v }))}
                                    />
                                </Field>

                                <Field label="Type">
                                    <OptionRow
                                        options={[
                                            { key: 'income',  label: 'Income' },
                                            { key: 'expense', label: 'Expense' },
                                        ]}
                                        value={form.type}
                                        onChange={v => setForm(f => ({ ...f, type: v as 'income' | 'expense' }))}
                                        activeColor={form.type === 'income' ? Colors.income : Colors.expense}
                                    />
                                </Field>
                            </Section>

                            {/* ── Status ────────────────────────────────── */}
                            <Section label="Status & Payment">
                                <Field label="Payment Status">
                                    <OptionRow
                                        options={STATUSES.map(s => ({ key: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))}
                                        value={form.status}
                                        onChange={v => setForm(f => ({ ...f, status: v as TransactionStatus }))}
                                    />
                                </Field>

                                {form.status !== 'paid' && (
                                    <Field label="Due Date">
                                        <DateInput
                                            value={form.dueDate}
                                            onChange={v => setForm(f => ({ ...f, dueDate: v }))}
                                        />
                                    </Field>
                                )}
                            </Section>

                            {/* ── Category ──────────────────────────────── */}
                            <Section label="Category">
                                <View style={styles.categoryGrid}>
                                    {CATEGORIES.map(c => (
                                        <TouchableOpacity
                                            key={c}
                                            style={[styles.opt, form.category === c && styles.optActive]}
                                            onPress={() => setForm(f => ({ ...f, category: c }))}
                                        >
                                            <Text style={[styles.optText, form.category === c && styles.optTextActive]}>{c}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </Section>

                            {/* ── Tax ───────────────────────────────────── */}
                            <Section label="Tax">
                                <Field label="Tax Rate (%)">
                                    <TextInput
                                        style={styles.input}
                                        placeholder="0"
                                        placeholderTextColor={Colors.muted}
                                        keyboardType="numeric"
                                        value={form.taxRate}
                                        onChangeText={v => setForm(f => ({ ...f, taxRate: v }))}
                                    />
                                    {taxPreview && (
                                        <Text style={styles.taxPreview}>
                                            = {currency}{taxPreview} tax on {currency}{form.amount}
                                        </Text>
                                    )}
                                </Field>
                            </Section>

                            {/* ── Optional details ──────────────────────── */}
                            <Section label="Optional Details">
                                <Field label="Reference / Invoice No.">
                                    <TextInput
                                        style={styles.input}
                                        placeholder="INV-001"
                                        placeholderTextColor={Colors.muted}
                                        value={form.reference}
                                        onChangeText={v => setForm(f => ({ ...f, reference: v }))}
                                    />
                                </Field>
                                <Field label="Vendor / Customer">
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Name"
                                        placeholderTextColor={Colors.muted}
                                        value={form.vendorCustomer}
                                        onChangeText={v => setForm(f => ({ ...f, vendorCustomer: v }))}
                                    />
                                </Field>
                            </Section>

                            {/* ── Recurring ─────────────────────────────── */}
                            <Section label="Recurring">
                                <View style={styles.recurringRow}>
                                    <Text style={styles.recurringLabel}>Repeat this transaction</Text>
                                    <TouchableOpacity
                                        style={[styles.toggleBtn, form.isRecurring && styles.toggleBtnOn]}
                                        onPress={() => setForm(f => ({ ...f, isRecurring: !f.isRecurring }))}
                                    >
                                        <Text style={styles.toggleBtnText}>{form.isRecurring ? 'ON' : 'OFF'}</Text>
                                    </TouchableOpacity>
                                </View>
                                {form.isRecurring && (
                                    <Field label="Frequency">
                                        <OptionRow
                                            options={FREQUENCIES.map(fr => ({ key: fr, label: fr.charAt(0).toUpperCase() + fr.slice(1) }))}
                                            value={form.recurringFrequency}
                                            onChange={v => setForm(f => ({ ...f, recurringFrequency: v as RecurringFrequency }))}
                                        />
                                    </Field>
                                )}
                            </Section>

                            {/* ── Action buttons ─────────────────────────── */}
                            <View style={styles.modalBtns}>
                                <TouchableOpacity
                                    style={[styles.modalBtn, styles.cancelBtn]}
                                    onPress={() => setModalOpen(false)}
                                >
                                    <Text style={styles.cancelBtnText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.modalBtn, styles.saveBtn]}
                                    onPress={handleSave}
                                >
                                    <Text style={styles.saveBtnText}>
                                        {editingId ? 'Save Changes' : 'Add Transaction'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

// ─── CSV parsing ──────────────────────────────────────────────────────────────

function parseCSV(text: string): Array<{date: string, description: string, type: 'income'|'expense', amount: number, category: string}> {
    const lines = text.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];
    // Skip header row
    const rows = lines.slice(1);
    const results = [];
    for (const line of rows) {
        const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        if (cols.length < 4) continue;
        const [date, description, type, amountStr, category = 'General'] = cols;
        if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) continue;
        if (type !== 'income' && type !== 'expense') continue;
        const amount = parseFloat(amountStr);
        if (isNaN(amount) || amount <= 0) continue;
        results.push({ date, description, type: type as 'income'|'expense', amount, category });
    }
    return results;
}

// ─── Small helper components ───────────────────────────────────────────────────

function TotalPill({ label, value, color, bold }: { label: string; value: string; color: string; bold?: boolean }) {
    return (
        <View style={pillStyles.pill}>
            <Text style={pillStyles.label}>{label}</Text>
            <Text style={[pillStyles.value, { color }, bold && { fontSize: 14, fontWeight: 'bold' } as any]}>{value}</Text>
        </View>
    );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <View style={sectionStyles.container}>
            <Text style={sectionStyles.label}>{label}</Text>
            {children}
        </View>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <View style={fieldStyles.container}>
            <Text style={fieldStyles.label}>{label}</Text>
            {children}
        </View>
    );
}

function OptionRow({
    options, value, onChange, activeColor,
}: {
    options: { key: string; label: string }[];
    value: string;
    onChange: (v: string) => void;
    activeColor?: string;
}) {
    return (
        <View style={styles.optRow}>
            {options.map(o => (
                <TouchableOpacity
                    key={o.key}
                    style={[styles.opt, value === o.key && { ...styles.optActive, backgroundColor: activeColor ?? Colors.primary, borderColor: activeColor ?? Colors.primary }]}
                    onPress={() => onChange(o.key)}
                >
                    <Text style={[styles.optText, value === o.key && styles.optTextActive]}>{o.label}</Text>
                </TouchableOpacity>
            ))}
        </View>
    );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    safe:    { flex: 1, backgroundColor: Colors.bg },
    scroll:  { flex: 1 },
    pad:     { padding: 12 },

    topBar:  { flexDirection: 'row', padding: 10, gap: 8, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
    search:  { flex: 1, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: Colors.textPrimary, fontSize: 14 },
    csvBtn:    { backgroundColor: Colors.muted, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, justifyContent: 'center' },
    importBtn: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, justifyContent: 'center' },
    csvBtnText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 12 },
    addBtn:  { backgroundColor: Colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, justifyContent: 'center' },
    addBtnText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 14 },

    filterBar:    { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border, flexDirection: 'row', alignItems: 'center' },
    filterScroll: { paddingHorizontal: 10, paddingVertical: 8, gap: 6, alignItems: 'center' },
    filterLabel:  { fontSize: 11, color: Colors.textMuted, marginRight: 2 },
    chip:         { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, backgroundColor: Colors.bg },
    chipActive:   { backgroundColor: Colors.primary },
    chipText:     { color: Colors.textMuted, fontSize: 11 },
    chipTextActive:{ color: Colors.textPrimary, fontWeight: 'bold' },
    sep:          { width: 1, height: 18, backgroundColor: Colors.border, marginHorizontal: 4 },
    countBadge:   { paddingHorizontal: 10, fontSize: 11, color: Colors.textMuted, fontWeight: '600' },

    totalsRow: { flexDirection: 'row', backgroundColor: Colors.surface, paddingHorizontal: 12, paddingVertical: 8, gap: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },

    // Date group
    dateHeader:     { flexDirection: 'row', alignItems: 'center', marginBottom: 8, marginTop: 4 },
    dateHeaderText: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, marginRight: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
    dateHeaderLine: { flex: 1, height: 1, backgroundColor: Colors.border },

    // Transaction card
    txCard:    { backgroundColor: Colors.surface, borderRadius: 10, padding: 12, marginBottom: 8, borderLeftWidth: 3 },
    incomeCard:  { borderLeftColor: Colors.income },
    expenseCard: { borderLeftColor: Colors.expense },
    overdueCard: { backgroundColor: 'rgba(239,68,68,0.07)', borderLeftColor: Colors.expense },
    txTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    txDesc:    { fontSize: 14, color: Colors.textPrimary, fontWeight: '600', flex: 1, marginRight: 8 },
    incAmt:    { fontSize: 14, fontWeight: 'bold', color: Colors.income },
    expAmt:    { fontSize: 14, fontWeight: 'bold', color: Colors.expense },
    txRow2:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    catChip:   { fontSize: 11, color: Colors.primary, backgroundColor: 'rgba(37,99,235,0.15)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
    metaText:  { fontSize: 11, color: Colors.textMuted },
    txBadges:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
    statusDot:   { width: 6, height: 6, borderRadius: 3 },
    statusText:  { fontSize: 11, fontWeight: '600' },
    dueBadge:  { fontSize: 10, color: Colors.warning, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: 'rgba(245,158,11,0.12)' },
    taxBadge:  { fontSize: 10, color: Colors.warning, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: 'rgba(245,158,11,0.12)' },
    recurBadge:{ fontSize: 10, color: Colors.primary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: 'rgba(37,99,235,0.12)' },
    txActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    editHint:  { fontSize: 10, color: Colors.textMuted, fontStyle: 'italic' },
    actionBtns:{ flexDirection: 'row', gap: 14, alignItems: 'center' },
    paidBtn:   { paddingHorizontal: 8, paddingVertical: 3, backgroundColor: 'rgba(16,185,129,0.15)', borderRadius: 6 },
    paidBtnText: { fontSize: 11, color: Colors.income, fontWeight: '600' },
    deleteText:  { fontSize: 11, color: Colors.expense },

    emptyBox:   { alignItems: 'center', marginTop: 60 },
    emptyTitle: { fontSize: 16, color: Colors.textMuted, fontWeight: '600', marginBottom: 6 },
    emptyHint:  { fontSize: 13, color: Colors.muted, textAlign: 'center' },

    // Modal
    overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
    modalSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingBottom: 44, maxHeight: '92%' },
    handle:     { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 14 },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary, textAlign: 'center', marginBottom: 4 },

    input:      { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: Colors.textPrimary, fontSize: 14 },
    taxPreview: { fontSize: 11, color: Colors.warning, marginTop: 4 },

    optRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    categoryGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    opt:       { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 6 },
    optActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    optText:   { color: Colors.textMuted, fontSize: 12 },
    optTextActive: { color: Colors.textPrimary, fontWeight: '600' },

    recurringRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    recurringLabel: { fontSize: 14, color: Colors.textSecondary },
    toggleBtn:     { paddingHorizontal: 14, paddingVertical: 6, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 20 },
    toggleBtnOn:   { backgroundColor: Colors.primary, borderColor: Colors.primary },
    toggleBtnText: { color: Colors.textPrimary, fontSize: 12, fontWeight: 'bold' },

    modalBtns:   { flexDirection: 'row', gap: 12, marginTop: 24, marginBottom: 8 },
    modalBtn:    { flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: 'center' },
    cancelBtn:   { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border },
    cancelBtnText: { color: Colors.textMuted, fontWeight: '600' },
    saveBtn:     { backgroundColor: Colors.primary },
    saveBtnText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 15 },
});

const pillStyles = StyleSheet.create({
    pill:  { flex: 1, backgroundColor: Colors.bg, borderRadius: 8, padding: 8, alignItems: 'center' },
    label: { fontSize: 10, color: Colors.textMuted, marginBottom: 2 },
    value: { fontSize: 13, fontWeight: '600' },
});

const sectionStyles = StyleSheet.create({
    container: { marginTop: 16, marginBottom: 4 },
    label:     { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingBottom: 6 },
});

const fieldStyles = StyleSheet.create({
    container: { marginBottom: 12 },
    label:     { fontSize: 12, color: Colors.textSecondary, fontWeight: '600', marginBottom: 6 },
});
