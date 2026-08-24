import React, { useState, useMemo } from 'react';
import {
    SafeAreaView, ScrollView, View, Text, TextInput,
    TouchableOpacity, Modal, StyleSheet, Share, Linking, FlatList, Platform, useWindowDimensions,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import DateInput from '../components/DateInput';
import { Transaction, TransactionStatus, RecurringFrequency } from '../types';
import { transactionsToCSV } from '../utils/finance';
import RecurringTransactionManager from '../components/RecurringTransactionManager';
import NextStepLink from '../components/NextStepLink';
import { showAlert, confirmAction } from '../utils/webAlert';
import Icon from '../components/ui/Icon';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import { t } from '../utils/i18n';
import { trackDataExported } from '../utils/analytics';
import { isOverdueIncomeTransaction, getOverdueIncomeTransactions } from '../utils/overdueTransactions';
import CostExposureTab from '../components/CostExposureTab';

type FilterType   = 'all' | 'income' | 'expense' | 'collect';
type StatusFilter = 'all' | 'paid' | 'pending' | 'overdue';

const CATEGORIES: string[] = [
    'Software sales', 'Consulting', 'Personnel expenses', 'Marketing',
    'Office & Admin', 'Equipment', 'Travel', 'Utilities', 'Tax', 'Other',
];

const STATUSES: TransactionStatus[]   = ['paid', 'pending', 'overdue'];
const FREQUENCIES: RecurringFrequency[] = ['weekly', 'monthly', 'quarterly', 'yearly'];

type FormState = {
    description: string;
    amount: string;
    type: 'income' | 'expense';
    category: string;
    reference: string;
    vendorCustomer: string;
    phone: string;
    taxRate: string;
    status: TransactionStatus;
    dueDate: string;
    date: string;
    isRecurring: boolean;
    recurringFrequency: RecurringFrequency;
};

// Parse vendorCustomer "Name | phone" → { name, phone }
function parseVendorCustomer(raw: string | undefined): { name: string; phone: string } {
    if (!raw) return { name: '', phone: '' };
    const idx = raw.indexOf(' | ');
    if (idx === -1) return { name: raw, phone: '' };
    return { name: raw.slice(0, idx), phone: raw.slice(idx + 3) };
}

function joinVendorCustomer(name: string, phone: string): string {
    const n = name.trim();
    const p = phone.trim();
    if (!n && !p) return '';
    if (!p) return n;
    return `${n} | ${p}`;
}

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
    phone: '',
    taxRate: '',
    status: 'paid',
    dueDate: '',
    date: todayStr(),
    isRecurring: false,
    recurringFrequency: 'monthly',
};

function formFromTx(tx: Transaction): FormState {
    const { name, phone } = parseVendorCustomer(tx.vendorCustomer);
    return {
        description:        tx.description ?? '',
        amount:             tx.amount != null ? String(tx.amount) : '',
        type:               tx.type,
        category:           tx.category ?? '',
        reference:          tx.reference ?? '',
        vendorCustomer:     name,
        phone:              phone,
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
    const { transactions, addTransaction, deleteTransaction, updateTransaction, settings, setCurrentScreen, navParams, invoices, markInvoiceStatus, navigate, language, isDemoMode } = useApp();

    // Cost Exposure moved here from Inventory & Stock: it's fundamentally
    // about sales/revenue erosion (a category eating a bigger share of
    // every naira of revenue), so it lives alongside the transactions it's
    // computed from rather than on the inventory side.
    const [screenTab, setScreenTab] = useState<'list' | 'exposure'>(navParams?.tab === 'exposure' ? 'exposure' : 'list');
    const { currency, defaultTaxRate } = settings;

    // Modal renders via a portal on web, outside App.tsx's width constraint --
    // see FooterNav.tsx for the reference fix. Applied here to the bottom
    // sheets so they don't stretch full-bleed on desktop.
    const { width: windowWidth } = useWindowDimensions();
    const constrainSheetWidth = Platform.OS === 'web' && windowWidth >= 720;

    const [modalOpen, setModalOpen]   = useState(false);
    const [editingId, setEditingId]   = useState<string | null>(null);
    const [search, setSearch]         = useState('');
    const [typeFilter, setTypeFilter] = useState<FilterType>(navParams?.filter === 'collect' ? 'collect' : 'all');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [page, setPage]             = useState(1);
    const PAGE_SIZE = 50;
    const [form, setForm]             = useState<FormState>({ ...EMPTY_FORM, taxRate: defaultTaxRate });
    const [csvModalOpen, setCsvModalOpen] = useState(false);
    const [csvText, setCsvText]           = useState('');

    // ── Filtering ────────────────────────────────────────────────────────────
    const filtered = useMemo(() => {
        return transactions.filter(tx => {
            if (typeFilter === 'collect') {
                // Collections: income that is overdue or pending with past due date
                if (!isOverdueIncomeTransaction(tx)) return false;
            } else {
                if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
                if (statusFilter !== 'all' && (tx.status ?? 'paid') !== statusFilter) return false;
            }
            const q = search.toLowerCase();
            if (q && !(
                (tx.description ?? '').toLowerCase().includes(q) ||
                (tx.category ?? '').toLowerCase().includes(q) ||
                (tx.vendorCustomer?.toLowerCase().includes(q) ?? false) ||
                (tx.reference?.toLowerCase().includes(q) ?? false) ||
                (tx.amount != null && String(tx.amount).includes(q))
            )) return false;
            return true;
        });
    }, [transactions, typeFilter, statusFilter, search]);

    // Collections sorted by days overdue DESC, then amount DESC
    const collectionsFiltered = useMemo(() => {
        if (typeFilter !== 'collect') return filtered;
        return [...filtered].sort((a, b) => {
            const daysA = Math.floor((Date.now() - new Date((a.dueDate || a.date) + 'T00:00:00').getTime()) / 86400000);
            const daysB = Math.floor((Date.now() - new Date((b.dueDate || b.date) + 'T00:00:00').getTime()) / 86400000);
            if (daysB !== daysA) return daysB - daysA;
            return (b.amount ?? 0) - (a.amount ?? 0);
        });
    }, [filtered, typeFilter]);

    const overdueCollections = useMemo(() => getOverdueIncomeTransactions(transactions), [transactions]);

    const baseTxs = typeFilter === 'collect' ? collectionsFiltered : filtered;
    const visibleTxs = useMemo(() => baseTxs.slice(0, page * PAGE_SIZE), [baseTxs, page, PAGE_SIZE]);
    const grouped = useMemo(() => groupByDate(visibleTxs), [visibleTxs]);

    const totals = useMemo(() => {
        let income = 0, expense = 0;
        for (const t of filtered) {
            if (t.type === 'income') income += (t.amount ?? 0);
            else expense += (t.amount ?? 0);
        }
        return { income, expense, net: income - expense };
    }, [filtered]);

    // ── Category breakdown — single pass ────────────────────────────────────
    const categoryBreakdown = useMemo(() => {
        const incomeMap = new Map<string, number>();
        const expenseMap = new Map<string, number>();
        let totalIncome = 0, totalExpense = 0;
        for (const t of filtered) {
            const category = t.category ?? 'Uncategorized';
            const amount = t.amount ?? 0;
            if (t.type === 'income') {
                incomeMap.set(category, (incomeMap.get(category) ?? 0) + amount);
                totalIncome += amount;
            } else {
                expenseMap.set(category, (expenseMap.get(category) ?? 0) + amount);
                totalExpense += amount;
            }
        }
        return { incomeMap, expenseMap, totalIncome, totalExpense };
    }, [filtered]);
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
            showAlert('Almost done', 'Add a description and a valid amount to save this transaction.');
            return;
        }

        // taxRate alone was being saved with no corresponding taxAmount --
        // the "= ₦X tax on ₦Y" preview shown just above this form promised
        // the figure would be tracked, but nothing ever persisted it, so
        // totalTaxCollected/totalTaxPaid (finance.ts) stayed 0 for every
        // transaction added through this form regardless of tax rate,
        // silently breaking the Tax Filing Readiness "ability to pay" check
        // and its alert-bell/Dashboard/notification counterpart for every
        // real user. Same formula as taxPreview above.
        const taxRateNum = form.taxRate ? parseFloat(form.taxRate) : undefined;
        const payload = {
            description:        form.description.trim(),
            amount:             amt,
            type:               form.type,
            category:           form.category,
            reference:          form.reference || undefined,
            vendorCustomer:     joinVendorCustomer(form.vendorCustomer, form.phone) || undefined,
            taxRate:            taxRateNum,
            taxAmount:          taxRateNum ? amt * (taxRateNum / 100) : undefined,
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
        confirmAction('Delete Transaction', `Remove "${desc}"?`, 'Delete', () => deleteTransaction(id));
    };

    // If this transaction is linked to an invoice (reference = invoiceNumber),
    // mark the invoice paid too — otherwise this button silently desyncs the
    // two: the transaction shows paid here while Invoices keeps showing it
    // as outstanding forever.
    const handleMarkPaid = (id: string) => {
        const tx = transactions.find(t => t.id === id);
        const linkedInvoice = tx?.reference ? invoices.find(i => i.invoiceNumber === tx.reference) : undefined;
        if (linkedInvoice) {
            markInvoiceStatus(linkedInvoice.id, 'paid');
        } else {
            updateTransaction(id, { status: 'paid' });
        }
    };

    const handleExportCSV = async () => {
        const csv = transactionsToCSV(filtered);
        if (!isDemoMode) trackDataExported();
        try {
            if (Platform.OS === 'web') {
                const blob = new Blob([csv], { type: 'text/csv' });
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement('a');
                a.href = url; a.download = 'quad360-transactions.csv'; a.click();
                URL.revokeObjectURL(url);
            } else {
                await Share.share({ message: csv, title: 'Quad360 Export' });
            }
        } catch (_) {}
    };

    const handleImportCSV = () => {
        const rows = parseCSV(csvText);
        if (rows.length === 0) {
            showAlert('No valid rows', 'Could not parse any valid transactions from the CSV. Check the format and try again.');
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
        showAlert('Import Complete', `Imported ${imported} transaction${imported !== 1 ? 's' : ''}${skipped > 0 ? `, skipped ${skipped} row${skipped !== 1 ? 's' : ''}` : ''}.`);
    };

    const statusColor = (s?: TransactionStatus) =>
        s === 'overdue' ? Colors.expense : s === 'pending' ? Colors.warning : Colors.income;

    const taxPreview = form.amount && form.taxRate
        ? (parseFloat(form.amount || '0') * (parseFloat(form.taxRate) / 100)).toFixed(2)
        : null;

    return (
        <SafeAreaView style={styles.safe}>
            <Header />

            {/* ── Screen tab bar ───────────────────────────────────────── */}
            <View style={styles.screenTabBar}>
                <TouchableOpacity style={[styles.screenTab, screenTab === 'list' && styles.screenTabActive]} onPress={() => setScreenTab('list')}>
                    <Icon name="list" size={13} color={screenTab === 'list' ? Colors.primary : Colors.muted} />
                    <Text style={[styles.screenTabText, screenTab === 'list' && styles.screenTabTextActive]}>Transactions</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.screenTab, screenTab === 'exposure' && styles.screenTabActive]} onPress={() => setScreenTab('exposure')}>
                    <Icon name="alert-triangle" size={13} color={screenTab === 'exposure' ? Colors.primary : Colors.muted} />
                    <Text style={[styles.screenTabText, screenTab === 'exposure' && styles.screenTabTextActive]}>Cost Exposure</Text>
                </TouchableOpacity>
            </View>

            {screenTab === 'exposure' ? (
                <ScrollView style={styles.scroll} contentContainerStyle={styles.pad}>
                    <CostExposureTab />
                </ScrollView>
            ) : (
            <>
            {/* ── Search + action bar ──────────────────────────────────── */}
            <View style={styles.topBar}>
                <TextInput
                    style={styles.search}
                    placeholder={t(language, 'searchPlaceholder')}
                    placeholderTextColor={Colors.muted}
                    value={search}
                    onChangeText={v => { setSearch(v); setPage(1); }}
                />
                <TouchableOpacity style={styles.csvBtn} onPress={handleExportCSV}>
                    <Text style={styles.csvBtnText}>{t(language, 'export')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.importBtn} onPress={() => { setCsvText(''); setCsvModalOpen(true); }}>
                    <Text style={styles.csvBtnText}>{t(language, 'importCsv')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.addBtn} onPress={openNew}>
                    <Text style={styles.addBtnText}>{t(language, 'newEntry')}</Text>
                </TouchableOpacity>
            </View>

            {/* ── Filter row ───────────────────────────────────────────── */}
            <View style={styles.filterBar}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
                    <Text style={styles.filterLabel}>{t(language, 'typeColon')}</Text>
                    {(['all', 'income', 'expense', 'collect'] as FilterType[]).map(f => (
                        <TouchableOpacity
                            key={f}
                            style={[styles.chip, typeFilter === f && (f === 'collect' ? styles.chipCollect : styles.chipActive)]}
                            onPress={() => { setTypeFilter(f); setPage(1); }}
                        >
                            {f === 'collect' && <Icon name="phone" size={11} color={typeFilter === f ? '#fff' : Colors.textMuted} />}
                            <Text style={[styles.chipText, typeFilter === f && styles.chipTextActive]}>
                                {f === 'all' ? t(language, 'all') : f === 'collect' ? t(language, 'collect') : t(language, f as 'income' | 'expense')}
                            </Text>
                        </TouchableOpacity>
                    ))}
                    <View style={styles.sep} />
                    <Text style={styles.filterLabel}>{t(language, 'statusColon')}</Text>
                    {(['all', 'paid', 'pending', 'overdue'] as StatusFilter[]).map(f => (
                        <TouchableOpacity
                            key={f}
                            style={[styles.chip, statusFilter === f && styles.chipActive]}
                            onPress={() => { setStatusFilter(f); setPage(1); }}
                        >
                            <Text style={[styles.chipText, statusFilter === f && styles.chipTextActive]}>
                                {f === 'all' ? t(language, 'all') : t(language, f as 'paid' | 'pending' | 'overdue')}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
                <Text style={styles.countBadge}>{filtered.length}</Text>
            </View>

            {/* ── Totals strip ─────────────────────────────────────────── */}
            <View style={styles.totalsRow}>
                <TotalPill label={t(language, 'income')}  value={`+${currency}${totals.income.toLocaleString()}`}  color={Colors.income} />
                <TotalPill label={t(language, 'expense')} value={`-${currency}${totals.expense.toLocaleString()}`} color={Colors.expense} />
                <TotalPill
                    label={t(language, 'net')}
                    value={`${totals.net >= 0 ? '+' : ''}${currency}${totals.net.toLocaleString()}`}
                    color={totals.net >= 0 ? Colors.income : Colors.expense}
                    bold
                />
            </View>

            {/* ── Category breakdown chart ─────────────────────────────── */}
            {filtered.length > 0 && (
                <>
                    <CategoryChart
                        incomeMap={categoryBreakdown.incomeMap}
                        expenseMap={categoryBreakdown.expenseMap}
                        totalIncome={categoryBreakdown.totalIncome}
                        totalExpense={categoryBreakdown.totalExpense}
                        currency={currency}
                        typeFilter={typeFilter}
                        language={language}
                    />
                    {(() => {
                        const { expenseMap, totalExpense } = categoryBreakdown;
                        if (totalExpense <= 0 || expenseMap.size === 0) return null;
                        const [topCategory, topAmount] = [...expenseMap.entries()].sort((a, b) => b[1] - a[1])[0];
                        if (topAmount / totalExpense <= 0.4) return null;
                        return (
                            <NextStepLink
                                text={`"${topCategory}" is over 40% of your spending — set a budget limit for it`}
                                onPress={() => setCurrentScreen('budget')}
                            />
                        );
                    })()}
                </>
            )}

            {typeFilter !== 'collect' && overdueCollections.length > 0 && (
                <NextStepLink
                    text={`${overdueCollections.length} payment${overdueCollections.length > 1 ? 's' : ''} overdue — ${currency}${overdueCollections.reduce((s, o) => s + (o.transaction.amount ?? 0), 0).toLocaleString()} to collect`}
                    onPress={() => { setTypeFilter('collect'); setPage(1); }}
                    emphasis="button"
                />
            )}

            {/* Daily/weekly/monthly pace already lives on Profit & Loss's
                Period Comparison table — link there instead of showing the
                same table twice. */}
            {typeFilter === 'all' && transactions.length > 0 && (
                <NextStepLink
                    text="Compare daily, weekly and monthly performance"
                    onPress={() => navigate('reports', { reportSection: 'statements', reportTab: 'pnl' })}
                />
            )}

            {/* ── Recurring Transactions Section ──────────────────────── */}
            {transactions.filter(t => t.isRecurring).length > 0 && (
                <View style={styles.recurringSection}>
                    <RecurringTransactionManager
                        recurringTransactions={transactions.filter(t => t.isRecurring) as any[]}
                        currency={currency}
                        onEdit={openEdit}
                        onDelete={id => deleteTransaction(id)}
                    />
                </View>
            )}

            {/* ── Transaction list ─────────────────────────────────────── */}
            <FlatList
                style={styles.scroll}
                data={grouped}
                keyExtractor={item => item.date}
                contentContainerStyle={styles.pad}
                onEndReached={() => {
                    if (visibleTxs.length < baseTxs.length) setPage(p => p + 1);
                }}
                onEndReachedThreshold={0.3}
                ListEmptyComponent={
                    <View style={styles.emptyBox}>
                        <Text style={styles.emptyTitle}>{t(language, 'noTransactions')}</Text>
                        <Text style={styles.emptyHint}>
                            {search || typeFilter !== 'all' || statusFilter !== 'all'
                                ? t(language, 'tryClearingFilters')
                                : t(language, 'tapNewToLog')}
                        </Text>
                    </View>
                }
                renderItem={({ item: { date, items } }) => (
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
                                        {tx.type === 'income' ? '+' : '-'}{currency}{(tx.amount ?? 0).toLocaleString()}
                                    </Text>
                                </View>

                                {/* Second row: category + vendor */}
                                <View style={styles.txRow2}>
                                    <Text style={styles.catChip}>{tx.category}</Text>
                                    {tx.vendorCustomer ? (
                                        <Text style={styles.metaText} numberOfLines={1}>{parseVendorCustomer(tx.vendorCustomer).name || tx.vendorCustomer}</Text>
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
                                            {t(language, (tx.status ?? 'paid') as 'paid' | 'pending' | 'overdue')}
                                        </Text>
                                    </View>
                                    {tx.status === 'pending' && tx.dueDate && new Date(tx.dueDate + 'T00:00:00') < new Date() ? (
                                        <Text style={[styles.dueBadge, { color: Colors.expense, backgroundColor: 'rgba(239,68,68,0.12)' }]}>
                                            {Math.ceil((Date.now() - new Date(tx.dueDate + 'T00:00:00').getTime()) / 86400000)} days overdue
                                        </Text>
                                    ) : tx.dueDate ? (
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
                                    <Text style={styles.editHint}>{t(language, 'tapToEdit')}</Text>
                                    <View
                                        style={styles.actionBtns}
                                        onStartShouldSetResponder={() => true}
                                    >
                                        {(tx.status === 'pending' || tx.status === 'overdue') && (
                                            <TouchableOpacity
                                                style={styles.paidBtn}
                                                onPress={() => handleMarkPaid(tx.id)}
                                            >
                                                <Text style={styles.paidBtnText}>{t(language, 'markPaid')}</Text>
                                            </TouchableOpacity>
                                        )}
                                        {(() => {
                                            const { phone } = parseVendorCustomer(tx.vendorCustomer);
                                            if (phone && (tx.status === 'overdue' || tx.status === 'pending')) {
                                                return (
                                                    <TouchableOpacity
                                                        style={styles.callBtn}
                                                        onPress={() => Linking.openURL('tel:' + phone)}
                                                    >
                                                        <Icon name="phone" size={11} color="#fff" />
                                                        <Text style={styles.callBtnText}>{t(language, 'callLabel')}</Text>
                                                    </TouchableOpacity>
                                                );
                                            }
                                            return null;
                                        })()}
                                        <TouchableOpacity
                                            style={styles.deleteBtn}
                                            onPress={() => handleDelete(tx.id, tx.description || 'this transaction')}
                                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                        >
                                            <Icon name="trash-2" size={11} color={Colors.expense} />
                                            <Text style={styles.deleteText}>{t(language, 'delete')}</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
            />
            </>
            )}

            <FooterNav />

            {/* ── CSV Import Modal ─────────────────────────────────────── */}
            <Modal
                visible={csvModalOpen}
                animationType="slide"
                transparent
                onRequestClose={() => setCsvModalOpen(false)}
            >
                <View style={styles.overlay}>
                    <View style={[styles.modalSheet, constrainSheetWidth && styles.modalSheetWide]}>
                        <View style={styles.handle} />
                        <Text style={styles.modalTitle}>{t(language, 'importTransactionsTitle')}</Text>
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
                                onPress={() => showAlert(
                                    'CSV Template',
                                    'date,description,type,amount,category\n2024-01-15,Client Payment,income,5000,Sales\n2024-01-16,Office Rent,expense,1200,Rent',
                                )}
                            >
                                <Text style={{ fontSize: 12, color: Colors.primary, fontWeight: '600' }}>{t(language, 'downloadTemplate')}</Text>
                            </TouchableOpacity>
                            <TextInput
                                style={[styles.input, { height: 200, textAlignVertical: 'top', fontFamily: 'monospace', fontSize: 12 }]}
                                multiline
                                value={csvText}
                                onChangeText={setCsvText}
                                placeholder={t(language, 'pasteCsvPlaceholder')}
                                placeholderTextColor={Colors.muted}
                            />
                            <View style={styles.modalBtns}>
                                <TouchableOpacity
                                    style={[styles.modalBtn, styles.cancelBtn]}
                                    onPress={() => setCsvModalOpen(false)}
                                >
                                    <Text style={styles.cancelBtnText}>{t(language, 'cancel')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.modalBtn, styles.saveBtn]}
                                    onPress={handleImportCSV}
                                >
                                    <Text style={styles.saveBtnText}>{t(language, 'importBtn')}</Text>
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
                    <View style={[styles.modalSheet, constrainSheetWidth && styles.modalSheetWide]}>
                        {/* Handle */}
                        <View style={styles.handle} />

                        <Text style={styles.modalTitle}>
                            {editingId ? t(language, 'editTransaction') : t(language, 'newTransaction')}
                        </Text>

                        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                            {/* ── Core fields ───────────────────────────── */}
                            <Section label={t(language, 'coreDetails')}>
                                <Field label={t(language, 'descriptionLabel')}>
                                    <TextInput
                                        style={styles.input}
                                        placeholder={t(language, 'descriptionPlaceholder')}
                                        placeholderTextColor={Colors.muted}
                                        value={form.description}
                                        onChangeText={v => setForm(f => ({ ...f, description: v }))}
                                    />
                                </Field>

                                <Field label={`${t(language, 'amountLabel')} (${currency}) *`}>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="0.00"
                                        placeholderTextColor={Colors.muted}
                                        keyboardType="numeric"
                                        value={form.amount}
                                        onChangeText={v => setForm(f => ({ ...f, amount: v }))}
                                    />
                                </Field>

                                <Field label={t(language, 'dateLabel')}>
                                    <DateInput
                                        value={form.date}
                                        onChange={v => setForm(f => ({ ...f, date: v }))}
                                    />
                                </Field>

                                <Field label={t(language, 'typeFieldLabel')}>
                                    <OptionRow
                                        options={[
                                            { key: 'income',  label: t(language, 'income') },
                                            { key: 'expense', label: t(language, 'expense') },
                                        ]}
                                        value={form.type}
                                        onChange={v => setForm(f => ({ ...f, type: v as 'income' | 'expense' }))}
                                        activeColor={form.type === 'income' ? Colors.income : Colors.expense}
                                    />
                                </Field>
                            </Section>

                            {/* ── Status ────────────────────────────────── */}
                            <Section label={t(language, 'statusPaymentSection')}>
                                <Field label={t(language, 'paymentStatusLabel')}>
                                    <OptionRow
                                        options={STATUSES.map(s => ({ key: s, label: t(language, s) }))}
                                        value={form.status}
                                        onChange={v => setForm(f => ({ ...f, status: v as TransactionStatus }))}
                                    />
                                </Field>

                                {form.status !== 'paid' && (
                                    <Field label={t(language, 'dueDate')}>
                                        <DateInput
                                            value={form.dueDate}
                                            onChange={v => setForm(f => ({ ...f, dueDate: v }))}
                                        />
                                    </Field>
                                )}
                            </Section>

                            {/* ── Category ──────────────────────────────── */}
                            <Section label={t(language, 'categoryLabel')}>
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
                            <Section label={t(language, 'taxSectionLabel')}>
                                <Field label={t(language, 'taxRateLabel')}>
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
                            <Section label={t(language, 'optionalDetails')}>
                                <Field label={t(language, 'referenceLabel')}>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="INV-001"
                                        placeholderTextColor={Colors.muted}
                                        value={form.reference}
                                        onChangeText={v => setForm(f => ({ ...f, reference: v }))}
                                    />
                                </Field>
                                <Field label={t(language, 'vendorCustomerLabel')}>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Name"
                                        placeholderTextColor={Colors.muted}
                                        value={form.vendorCustomer}
                                        onChangeText={v => setForm(f => ({ ...f, vendorCustomer: v }))}
                                    />
                                </Field>
                                <Field label={t(language, 'phoneOptionalLabel')}>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="e.g. 08012345678"
                                        placeholderTextColor={Colors.muted}
                                        keyboardType="phone-pad"
                                        value={form.phone}
                                        onChangeText={v => setForm(f => ({ ...f, phone: v }))}
                                    />
                                </Field>
                            </Section>

                            {/* ── Recurring ─────────────────────────────── */}
                            <Section label={t(language, 'recurringSectionLabel')}>
                                <View style={styles.recurringRow}>
                                    <Text style={styles.recurringLabel}>{t(language, 'repeatTransactionLabel')}</Text>
                                    <TouchableOpacity
                                        style={[styles.toggleBtn, form.isRecurring && styles.toggleBtnOn]}
                                        onPress={() => setForm(f => ({ ...f, isRecurring: !f.isRecurring }))}
                                    >
                                        <Text style={[styles.toggleBtnText, form.isRecurring && styles.toggleBtnTextOn]}>{form.isRecurring ? t(language, 'onLabel') : t(language, 'offLabel')}</Text>
                                    </TouchableOpacity>
                                </View>
                                {form.isRecurring && (
                                    <Field label={t(language, 'frequencyLabel')}>
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
                                    <Text style={styles.cancelBtnText}>{t(language, 'cancel')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.modalBtn, styles.saveBtn]}
                                    onPress={handleSave}
                                >
                                    <Text style={styles.saveBtnText}>
                                        {editingId ? t(language, 'saveChanges') : t(language, 'addTransactionBtn')}
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

// ─── Category breakdown chart ─────────────────────────────────────────────────

const CHART_COLORS = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
    '#06B6D4', '#F97316', '#84CC16', '#EC4899', '#6366F1',
];

function CategoryChart({
    incomeMap, expenseMap, totalIncome, totalExpense, currency, typeFilter, language,
}: {
    incomeMap: Map<string, number>;
    expenseMap: Map<string, number>;
    totalIncome: number;
    totalExpense: number;
    currency: string;
    typeFilter: FilterType;
    language: import('../utils/i18n').Language;
}) {
    const [activeTab, setActiveTab] = useState<'income' | 'expense'>(
        typeFilter === 'expense' ? 'expense' : 'income'
    );
    const [expanded, setExpanded] = useState(false);
    const [sectionOpen, setSectionOpen] = useState(false);

    const showIncome  = typeFilter === 'all' || typeFilter === 'income' || typeFilter === 'collect';
    const showExpense = typeFilter === 'all' || typeFilter === 'expense';

    const tab = (!showIncome && showExpense) ? 'expense' : (!showExpense && showIncome) ? 'income' : activeTab;

    const map   = tab === 'income' ? incomeMap : expenseMap;
    const total = tab === 'income' ? totalIncome : totalExpense;
    const color = tab === 'income' ? Colors.income : Colors.expense;

    const entries = [...map.entries()]
        .sort((a, b) => b[1] - a[1]);
    const shown = expanded ? entries : entries.slice(0, 5);

    if (entries.length === 0) return null;

    return (
        <View style={chartStyles.container}>
            {/* Compact header — always visible, tap to reveal the full breakdown */}
            <TouchableOpacity style={chartStyles.summaryRow} onPress={() => setSectionOpen(v => !v)}>
                <View style={{ flex: 1 }}>
                    <Text style={chartStyles.title}>
                        {tab === 'income' ? t(language, 'whereMoneyComesFrom') : t(language, 'whereMoneyGoingTo')}
                    </Text>
                    <Text style={chartStyles.totalLabel}>
                        {t(language, 'totalColon')} {currency}{total.toLocaleString()}
                    </Text>
                </View>
                <Icon name={sectionOpen ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
            </TouchableOpacity>

            {sectionOpen && (
                <>
                    {/* Tab toggle — only show if both types are present */}
                    {showIncome && showExpense && (
                        <View style={chartStyles.tabRow}>
                            {(['income', 'expense'] as const).map(kind => (
                                <TouchableOpacity
                                    key={kind}
                                    style={[chartStyles.tabBtn, activeTab === kind && { backgroundColor: kind === 'income' ? Colors.income : Colors.expense }]}
                                    onPress={() => setActiveTab(kind)}
                                >
                                    <Text style={[chartStyles.tabBtnText, activeTab === kind && { color: '#fff' }]}>
                                        {kind === 'income' ? t(language, 'income') : t(language, 'expense')}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    {/* Stacked percentage bar */}
                    <View style={chartStyles.stackBar}>
                        {entries.map(([cat, amt], i) => {
                            const pct = total > 0 ? (amt / total) * 100 : 0;
                            return (
                                <View
                                    key={cat}
                                    style={{ width: `${pct}%` as any, height: 12, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                                />
                            );
                        })}
                    </View>

                    {/* Rows */}
                    {shown.map(([cat, amt], i) => {
                        const pct = total > 0 ? (amt / total) * 100 : 0;
                        return (
                            <View key={cat} style={chartStyles.row}>
                                <View style={[chartStyles.dot, { backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }]} />
                                <Text style={chartStyles.catName} numberOfLines={1}>{cat}</Text>
                                <View style={chartStyles.barTrack}>
                                    <View style={[chartStyles.barFill, { width: `${pct}%` as any, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }]} />
                                </View>
                                <Text style={chartStyles.pctLabel}>{Math.round(pct)}%</Text>
                                <Text style={chartStyles.amtLabel}>{currency}{amt.toLocaleString()}</Text>
                            </View>
                        );
                    })}

                    {entries.length > 5 && (
                        <TouchableOpacity onPress={() => setExpanded(v => !v)} style={chartStyles.showMore}>
                            <Text style={chartStyles.showMoreText}>
                                {expanded ? t(language, 'showLess') : `${t(language, 'showMorePrefix')} ${entries.length - 5} ${t(language, 'moreCategories')}`}
                            </Text>
                        </TouchableOpacity>
                    )}
                </>
            )}
        </View>
    );
}

const chartStyles = StyleSheet.create({
    container:   { backgroundColor: Colors.surface, marginHorizontal: 0, paddingHorizontal: 14, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
    summaryRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    tabRow:      { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md, marginBottom: 10 },
    tabBtn:      { flex: 1, paddingVertical: 6, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', backgroundColor: Colors.bg },
    tabBtnText:  { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
    title:       { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, marginBottom: 2 },
    totalLabel:  { fontSize: 10, color: Colors.textMuted },
    stackBar:    { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', marginTop: Spacing.md, marginBottom: Spacing.md, backgroundColor: Colors.bg },
    row:         { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm, gap: 6 },
    dot:         { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
    catName:     { fontSize: 11, color: Colors.textSecondary, width: 90, flexShrink: 0 },
    barTrack:    { flex: 1, height: 8, backgroundColor: Colors.bg, borderRadius: 4, overflow: 'hidden' },
    barFill:     { height: 8, borderRadius: 4 },
    pctLabel:    { fontSize: 10, color: Colors.textMuted, width: 30, textAlign: 'right', flexShrink: 0 },
    amtLabel:    { fontSize: 11, color: Colors.textPrimary, fontWeight: '600', width: 70, textAlign: 'right', flexShrink: 0 },
    showMore:    { alignItems: 'center', paddingTop: 6 },
    showMoreText:{ fontSize: 11, color: Colors.primary, fontWeight: '600' },
});

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
    pad:     { padding: Spacing.md },
    recurringSection: { marginTop: Spacing.lg, marginBottom: Spacing.sm },

    screenTabBar: { flexDirection: 'row', backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
    screenTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
    screenTabActive: { borderBottomWidth: 2, borderBottomColor: Colors.primary },
    screenTabText: { fontSize: 13, color: Colors.muted, fontWeight: '600' },
    screenTabTextActive: { color: Colors.primary },

    // flexWrap is the safety net: search (flex:1) + Export + Import CSV +
    // New Entry don't all fit one row on a phone-width screen -- confirmed
    // "Import CSV" clipped and "New Entry" pushed fully off-screen at
    // 320-375px CSS width. Wrapping lets search take its own row instead of
    // being crushed to near-zero width, with the buttons flowing below it.
    topBar:  { flexDirection: 'row', flexWrap: 'wrap', padding: 10, gap: Spacing.sm, rowGap: Spacing.sm, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
    search:  { flex: 1, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, color: Colors.textPrimary, fontSize: 14 },
    csvBtn:    { backgroundColor: Colors.muted, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.sm, justifyContent: 'center' },
    importBtn: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.sm, justifyContent: 'center' },
    csvBtnText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 12 },
    addBtn:  { backgroundColor: Colors.primary, paddingHorizontal: 14, paddingVertical: Spacing.sm, borderRadius: Radius.sm, justifyContent: 'center' },
    addBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },

    filterBar:    { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border, flexDirection: 'row', alignItems: 'center' },
    filterScroll: { paddingHorizontal: 10, paddingVertical: Spacing.sm, gap: 6, alignItems: 'center' },
    filterLabel:  { fontSize: 11, color: Colors.textMuted, marginRight: 2 },
    chip:         { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: 10, paddingVertical: Spacing.xs, borderRadius: 14, backgroundColor: Colors.bg },
    chipActive:   { backgroundColor: Colors.primary },
    chipCollect:  { backgroundColor: '#25D366' },
    chipText:     { color: Colors.textMuted, fontSize: 11 },
    chipTextActive:{ color: '#fff', fontWeight: 'bold' },
    sep:          { width: 1, height: 18, backgroundColor: Colors.border, marginHorizontal: Spacing.xs },
    countBadge:   { paddingHorizontal: 10, fontSize: 11, color: Colors.textMuted, fontWeight: '600' },

    totalsRow: { flexDirection: 'row', backgroundColor: Colors.surface, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },

    // Date group
    dateHeader:     { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm, marginTop: Spacing.xs },
    dateHeaderText: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, marginRight: Spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
    dateHeaderLine: { flex: 1, height: 1, backgroundColor: Colors.border },

    // Transaction card
    txCard:    { backgroundColor: Colors.surface, borderRadius: 10, padding: Spacing.md, marginBottom: Spacing.sm, borderLeftWidth: 3, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    incomeCard:  { borderLeftColor: Colors.income },
    expenseCard: { borderLeftColor: Colors.expense },
    overdueCard: { backgroundColor: 'rgba(239,68,68,0.07)', borderLeftColor: Colors.expense },
    txTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xs },
    txDesc:    { fontSize: 14, color: Colors.textPrimary, fontWeight: '600', flex: 1, marginRight: 8 },
    incAmt:    { fontSize: 14, fontWeight: 'bold', color: Colors.income },
    expAmt:    { fontSize: 14, fontWeight: 'bold', color: Colors.expense },
    txRow2:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 6 },
    catChip:   { fontSize: 11, color: Colors.primary, backgroundColor: 'rgba(37,99,235,0.15)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: Radius.sm },
    metaText:  { fontSize: 11, color: Colors.textMuted },
    txBadges:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: 7, paddingVertical: 2, borderRadius: Radius.sm },
    statusDot:   { width: 6, height: 6, borderRadius: 3 },
    statusText:  { fontSize: 11, fontWeight: '600' },
    dueBadge:  { fontSize: 10, color: Colors.warning, paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.sm, backgroundColor: 'rgba(245,158,11,0.12)' },
    taxBadge:  { fontSize: 10, color: Colors.warning, paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.sm, backgroundColor: 'rgba(245,158,11,0.12)' },
    recurBadge:{ fontSize: 10, color: Colors.primary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.sm, backgroundColor: 'rgba(37,99,235,0.12)' },
    txActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    editHint:  { fontSize: 10, color: Colors.textMuted, fontStyle: 'italic' },
    actionBtns:{ flexDirection: 'row', gap: 14, alignItems: 'center' },
    paidBtn:   { paddingHorizontal: Spacing.sm, paddingVertical: 3, backgroundColor: 'rgba(16,185,129,0.15)', borderRadius: 6 },
    paidBtnText: { fontSize: 11, color: Colors.income, fontWeight: '600' },
    callBtn:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.sm, paddingVertical: 3, backgroundColor: '#25D366', borderRadius: 6 },
    callBtnText: { fontSize: 11, color: '#fff', fontWeight: '600' },
    deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    deleteText:  { fontSize: 11, color: Colors.expense },

    emptyBox:   { alignItems: 'center', marginTop: 60 },
    emptyTitle: { fontSize: 16, color: Colors.textMuted, fontWeight: '600', marginBottom: 6 },
    emptyHint:  { fontSize: 13, color: Colors.muted, textAlign: 'center' },

    // Modal
    overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
    modalSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, paddingHorizontal: Spacing.xl, paddingBottom: 44, maxHeight: '92%' },
    modalSheetWide: { maxWidth: 560, width: '100%', alignSelf: 'center' },
    handle:     { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 14 },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary, textAlign: 'center', marginBottom: Spacing.xs },

    input:      { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: Spacing.md, paddingVertical: 10, color: Colors.textPrimary, fontSize: 14 },
    taxPreview: { fontSize: 11, color: Colors.warning, marginTop: Spacing.xs },

    optRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    categoryGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    opt:       { paddingHorizontal: Spacing.md, paddingVertical: 7, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 6 },
    optActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    optText:   { color: Colors.textMuted, fontSize: 12 },
    optTextActive: { color: '#fff', fontWeight: '600' },

    recurringRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
    recurringLabel: { fontSize: 14, color: Colors.textSecondary },
    toggleBtn:     { paddingHorizontal: 14, paddingVertical: 6, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.xl },
    toggleBtnOn:   { backgroundColor: Colors.primary, borderColor: Colors.primary },
    toggleBtnText: { color: Colors.textPrimary, fontSize: 12, fontWeight: 'bold' },
    toggleBtnTextOn: { color: '#fff' },

    modalBtns:   { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.xxl, marginBottom: Spacing.sm },
    modalBtn:    { flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: 'center' },
    cancelBtn:   { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border },
    cancelBtnText: { color: Colors.textMuted, fontWeight: '600' },
    saveBtn:     { backgroundColor: Colors.primary },
    saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});

const pillStyles = StyleSheet.create({
    pill:  { flex: 1, backgroundColor: Colors.bg, borderRadius: Radius.sm, padding: Spacing.sm, alignItems: 'center' },
    label: { fontSize: 10, color: Colors.textMuted, marginBottom: 2 },
    value: { fontSize: 13, fontWeight: '600' },
});

const sectionStyles = StyleSheet.create({
    container: { marginTop: Spacing.lg, marginBottom: Spacing.xs },
    label:     { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingBottom: 6 },
});

const fieldStyles = StyleSheet.create({
    container: { marginBottom: Spacing.md },
    label:     { fontSize: 12, color: Colors.textSecondary, fontWeight: '600', marginBottom: 6 },
});
