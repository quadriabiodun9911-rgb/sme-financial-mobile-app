import React, { useState, useMemo } from 'react';
import {
    ScrollView, View, Text, TouchableOpacity,
    StyleSheet, TextInput, Alert, Modal, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { Transaction } from '../types';

// Bank transaction as imported from a statement or manual entry
interface BankTx {
    id: string;
    date: string;
    description: string;
    amount: number;
    type: 'credit' | 'debit';
}

type Tab = 'import' | 'matched' | 'unmatched';

// Match: bank tx to app tx if amount within 2% AND date within 5 days
function matchTransactions(bankTxs: BankTx[], appTxs: Transaction[]) {
    const matched: { bank: BankTx; app: Transaction }[] = [];
    const unmatchedBank: BankTx[] = [];
    const usedAppIds = new Set<string>();

    for (const b of bankTxs) {
        const bDate = new Date(b.date).getTime();
        const bAmt = b.amount;
        const bType = b.type === 'credit' ? 'income' : 'expense';

        const candidate = appTxs.find(a => {
            if (usedAppIds.has(a.id)) return false;
            if (a.type !== bType) return false;
            const diff = Math.abs(a.amount - bAmt) / Math.max(bAmt, 1);
            if (diff > 0.02) return false;
            const daysDiff = Math.abs(new Date(a.date).getTime() - bDate) / 86400000;
            return daysDiff <= 5;
        });

        if (candidate) {
            matched.push({ bank: b, app: candidate });
            usedAppIds.add(candidate.id);
        } else {
            unmatchedBank.push(b);
        }
    }

    const unmatchedApp = appTxs.filter(a => !usedAppIds.has(a.id));
    return { matched, unmatchedBank, unmatchedApp };
}

const SAMPLE_CSV = `date,description,amount,type
2024-01-15,CUSTOMER PAYMENT - ACME CORP,150000,credit
2024-01-16,SUPPLIER PAYMENT - QUICK GOODS,45000,debit
2024-01-18,BANK CHARGES,1500,debit
2024-01-20,TRANSFER FROM CLIENT,75000,credit`;

export default function ReconciliationScreen() {
    const { transactions, addTransaction, settings } = useApp();
    const [tab, setTab] = useState<Tab>('import');
    const [bankTxs, setBankTxs] = useState<BankTx[]>([]);
    const [csvText, setCsvText] = useState('');
    const [manualForm, setManualForm] = useState({ date: new Date().toISOString().split('T')[0], description: '', amount: '', type: 'credit' as 'credit' | 'debit' });
    const [addManualModal, setAddManualModal] = useState(false);

    const sym = settings.currency || '₦';
    const fmt = (n: number) => `${sym}${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

    const { matched, unmatchedBank, unmatchedApp } = useMemo(() => {
        if (bankTxs.length === 0) return { matched: [], unmatchedBank: [], unmatchedApp: [] };
        return matchTransactions(bankTxs, transactions);
    }, [bankTxs, transactions]);

    const parseCSV = () => {
        if (!csvText.trim()) { Alert.alert('Paste your CSV first'); return; }
        try {
            const lines = csvText.trim().split('\n');
            const header = lines[0].toLowerCase().split(',').map(h => h.trim());
            const dateIdx = header.indexOf('date');
            const descIdx = header.findIndex(h => h.includes('desc') || h.includes('narr') || h.includes('ref'));
            const amtIdx = header.findIndex(h => h.includes('amount') || h.includes('amt') || h.includes('debit') || h.includes('credit'));
            const typeIdx = header.findIndex(h => h === 'type' || h === 'cr/dr' || h === 'dc');

            if (dateIdx === -1 || amtIdx === -1) {
                Alert.alert('CSV Error', 'CSV must have at least "date" and "amount" columns');
                return;
            }

            const parsed: BankTx[] = [];
            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''));
                if (cols.length < 2) continue;
                const amount = parseFloat(cols[amtIdx]?.replace(/[^0-9.]/g, '') || '0');
                if (!amount) continue;
                const type: 'credit' | 'debit' = typeIdx >= 0
                    ? (cols[typeIdx]?.toLowerCase().startsWith('c') ? 'credit' : 'debit')
                    : 'credit';
                parsed.push({
                    id: `bank-${Date.now()}-${i}`,
                    date: cols[dateIdx] || new Date().toISOString().split('T')[0],
                    description: descIdx >= 0 ? (cols[descIdx] || 'Bank Transaction') : 'Bank Transaction',
                    amount,
                    type,
                });
            }
            if (parsed.length === 0) { Alert.alert('No valid rows found'); return; }
            let addedCount = 0;
            setBankTxs(prev => {
                const existingIds = new Set(prev.map(b => `${b.date}-${b.amount}-${b.description}`));
                const newOnes = parsed.filter(p => !existingIds.has(`${p.date}-${p.amount}-${p.description}`));
                addedCount = newOnes.length;
                return [...prev, ...newOnes];
            });
            setCsvText('');
            setTab('matched');
            Alert.alert('Imported', `${parsed.length} rows parsed, ${addedCount} new bank transactions added.`);
        } catch {
            Alert.alert('Parse Error', 'Could not parse the CSV. Check format.');
        }
    };

    const addManualBankTx = () => {
        if (!manualForm.description.trim()) { Alert.alert('Description required'); return; }
        const amt = parseFloat(manualForm.amount);
        if (!amt || amt <= 0) { Alert.alert('Valid amount required'); return; }
        const tx: BankTx = {
            id: `bank-manual-${Date.now()}`,
            date: manualForm.date,
            description: manualForm.description,
            amount: amt,
            type: manualForm.type,
        };
        setBankTxs(prev => [...prev, tx]);
        setManualForm({ date: new Date().toISOString().split('T')[0], description: '', amount: '', type: 'credit' });
        setAddManualModal(false);
    };

    const importUnmatchedBankTx = (b: BankTx) => {
        Alert.alert('Import as Transaction', `Add "${b.description}" (${fmt(b.amount)}) to your app transactions?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Import',
                onPress: () => {
                    addTransaction({
                        date: b.date,
                        description: b.description,
                        type: b.type === 'credit' ? 'income' : 'expense',
                        category: b.type === 'credit' ? 'Sales' : 'Operating Expense',
                        amount: b.amount,
                        status: 'paid',
                    });
                },
            },
        ]);
    };

    const clearBankData = () => {
        Alert.alert('Clear Bank Data', 'Remove all imported bank transactions?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Clear', style: 'destructive', onPress: () => setBankTxs([]) },
        ]);
    };

    return (
        <SafeAreaView style={styles.safe}>
            <Header />

            {/* Summary banner */}
            {bankTxs.length > 0 && (
                <View style={styles.banner}>
                    <View style={styles.bannerStat}>
                        <Text style={[styles.bannerValue, { color: Colors.income }]}>{matched.length}</Text>
                        <Text style={styles.bannerLabel}>Matched</Text>
                    </View>
                    <View style={styles.bannerStat}>
                        <Text style={[styles.bannerValue, { color: Colors.warning }]}>{unmatchedBank.length}</Text>
                        <Text style={styles.bannerLabel}>Bank Only</Text>
                    </View>
                    <View style={styles.bannerStat}>
                        <Text style={[styles.bannerValue, { color: Colors.expense }]}>{unmatchedApp.length}</Text>
                        <Text style={styles.bannerLabel}>App Only</Text>
                    </View>
                    <TouchableOpacity onPress={clearBankData} style={styles.clearBtn} activeOpacity={0.7}>
                        <Text style={styles.clearBtnText}>Clear</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Tab bar */}
            <View style={styles.tabs}>
                {(['import', 'matched', 'unmatched'] as Tab[]).map(t => (
                    <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)} activeOpacity={0.75}>
                        <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                            {t === 'import' ? 'Import' : t === 'matched' ? `Matched (${matched.length})` : `Unmatched (${unmatchedBank.length + unmatchedApp.length})`}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                {/* ── Import Tab ──────────────────────────────────────────── */}
                {tab === 'import' && (
                    <>
                        <View style={styles.card}>
                            <Text style={styles.cardTitle}>Paste Bank Statement CSV</Text>
                            <Text style={styles.cardSubtitle}>Export from your bank and paste here. Needs columns: date, description/narration, amount, type (credit/debit)</Text>
                            <TextInput
                                style={styles.csvInput}
                                value={csvText}
                                onChangeText={setCsvText}
                                placeholder={SAMPLE_CSV}
                                placeholderTextColor={Colors.textMuted}
                                multiline
                                numberOfLines={6}
                            />
                            <TouchableOpacity style={styles.primaryBtn} onPress={parseCSV} activeOpacity={0.8}>
                                <Text style={styles.primaryBtnText}>Parse & Import CSV</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.dividerRow}>
                            <View style={styles.dividerLine} />
                            <Text style={styles.dividerText}>or</Text>
                            <View style={styles.dividerLine} />
                        </View>

                        <TouchableOpacity style={styles.secondaryBtn} onPress={() => setAddManualModal(true)} activeOpacity={0.8}>
                            <Text style={styles.secondaryBtnText}>+ Add Bank Transaction Manually</Text>
                        </TouchableOpacity>

                        {bankTxs.length > 0 && (
                            <View style={[styles.card, { marginTop: 16 }]}>
                                <Text style={styles.cardTitle}>{bankTxs.length} Bank Transactions Loaded</Text>
                                {bankTxs.slice(0, 5).map(b => (
                                    <View key={b.id} style={styles.miniRow}>
                                        <Text style={styles.miniDate}>{b.date}</Text>
                                        <Text style={styles.miniDesc} numberOfLines={1}>{b.description}</Text>
                                        <Text style={[styles.miniAmt, { color: b.type === 'credit' ? Colors.income : Colors.expense }]}>
                                            {b.type === 'credit' ? '+' : '-'}{fmt(b.amount)}
                                        </Text>
                                    </View>
                                ))}
                                {bankTxs.length > 5 && <Text style={styles.moreNote}>+{bankTxs.length - 5} more… switch to Matched/Unmatched tabs</Text>}
                            </View>
                        )}
                    </>
                )}

                {/* ── Matched Tab ─────────────────────────────────────────── */}
                {tab === 'matched' && (
                    <>
                        {matched.length === 0 && (
                            <View style={styles.empty}>
                                <Text style={styles.emptyIcon}>🔗</Text>
                                <Text style={styles.emptyText}>No matched transactions yet</Text>
                                <Text style={styles.emptySubtext}>Import bank data from the Import tab</Text>
                            </View>
                        )}
                        {matched.map(({ bank, app }) => (
                            <View key={bank.id} style={styles.matchCard}>
                                <View style={styles.matchSide}>
                                    <Text style={styles.matchLabel}>BANK</Text>
                                    <Text style={styles.matchDate}>{bank.date}</Text>
                                    <Text style={styles.matchDesc} numberOfLines={2}>{bank.description}</Text>
                                    <Text style={[styles.matchAmt, { color: bank.type === 'credit' ? Colors.income : Colors.expense }]}>
                                        {bank.type === 'credit' ? '+' : '-'}{fmt(bank.amount)}
                                    </Text>
                                </View>
                                <View style={styles.matchDivider}>
                                    <Text style={styles.matchLink}>✓</Text>
                                </View>
                                <View style={styles.matchSide}>
                                    <Text style={styles.matchLabel}>APP</Text>
                                    <Text style={styles.matchDate}>{app.date}</Text>
                                    <Text style={styles.matchDesc} numberOfLines={2}>{app.description}</Text>
                                    <Text style={[styles.matchAmt, { color: app.type === 'income' ? Colors.income : Colors.expense }]}>
                                        {app.type === 'income' ? '+' : '-'}{fmt(app.amount)}
                                    </Text>
                                </View>
                            </View>
                        ))}
                    </>
                )}

                {/* ── Unmatched Tab ─────────────────────────────────────── */}
                {tab === 'unmatched' && (
                    <>
                        {unmatchedBank.length === 0 && unmatchedApp.length === 0 && (
                            <View style={styles.empty}>
                                <Text style={styles.emptyIcon}>🎉</Text>
                                <Text style={styles.emptyText}>All transactions matched!</Text>
                                <Text style={styles.emptySubtext}>Your books are reconciled</Text>
                            </View>
                        )}

                        {unmatchedBank.length > 0 && (
                            <>
                                <Text style={styles.sectionTitle}>In Bank — Not in App ({unmatchedBank.length})</Text>
                                {unmatchedBank.map(b => (
                                    <View key={b.id} style={styles.unmatchCard}>
                                        <View style={styles.unmatchInfo}>
                                            <Text style={styles.unmatchDate}>{b.date}</Text>
                                            <Text style={styles.unmatchDesc} numberOfLines={2}>{b.description}</Text>
                                            <Text style={[styles.unmatchAmt, { color: b.type === 'credit' ? Colors.income : Colors.expense }]}>
                                                {b.type === 'credit' ? '+' : '-'}{fmt(b.amount)}
                                            </Text>
                                        </View>
                                        <TouchableOpacity style={styles.importBtn} onPress={() => importUnmatchedBankTx(b)} activeOpacity={0.8}>
                                            <Text style={styles.importBtnText}>Import</Text>
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </>
                        )}

                        {unmatchedApp.length > 0 && (
                            <>
                                <Text style={[styles.sectionTitle, { marginTop: 20 }]}>In App — Not in Bank ({unmatchedApp.length})</Text>
                                <Text style={styles.sectionNote}>These may be cash transactions, pending clearances, or entry errors</Text>
                                {unmatchedApp.map(a => (
                                    <View key={a.id} style={[styles.unmatchCard, { borderLeftColor: Colors.warning }]}>
                                        <View style={styles.unmatchInfo}>
                                            <Text style={styles.unmatchDate}>{a.date}</Text>
                                            <Text style={styles.unmatchDesc} numberOfLines={2}>{a.description}</Text>
                                            <Text style={[styles.unmatchAmt, { color: a.type === 'income' ? Colors.income : Colors.expense }]}>
                                                {a.type === 'income' ? '+' : '-'}{fmt(a.amount)}
                                            </Text>
                                        </View>
                                        <View style={[styles.importBtn, { backgroundColor: Colors.warning + '22' }]}>
                                            <Text style={[styles.importBtnText, { color: Colors.warning }]}>Review</Text>
                                        </View>
                                    </View>
                                ))}
                            </>
                        )}
                    </>
                )}

            </ScrollView>

            {/* ── Manual Bank TX Modal ───────────────────────────────────── */}
            <Modal visible={addManualModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAddManualModal(false)}>
                <SafeAreaView style={styles.modalSafe}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Add Bank Transaction</Text>
                        <TouchableOpacity onPress={() => setAddManualModal(false)} activeOpacity={0.7}>
                            <Text style={styles.modalClose}>✕</Text>
                        </TouchableOpacity>
                    </View>
                    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
                        <Text style={styles.fieldLabel}>Date</Text>
                        <TextInput style={styles.input} value={manualForm.date} onChangeText={v => setManualForm(p => ({ ...p, date: v }))} placeholder="YYYY-MM-DD" placeholderTextColor={Colors.textMuted} />

                        <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Description</Text>
                        <TextInput style={styles.input} value={manualForm.description} onChangeText={v => setManualForm(p => ({ ...p, description: v }))} placeholder="e.g. Customer payment" placeholderTextColor={Colors.textMuted} />

                        <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Amount</Text>
                        <TextInput style={styles.input} value={manualForm.amount} onChangeText={v => setManualForm(p => ({ ...p, amount: v }))} placeholder="e.g. 50000" placeholderTextColor={Colors.textMuted} keyboardType="decimal-pad" />

                        <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Type</Text>
                        <View style={styles.segmentRow}>
                            {(['credit', 'debit'] as const).map(t => (
                                <TouchableOpacity key={t} style={[styles.segment, manualForm.type === t && styles.segmentActive]} onPress={() => setManualForm(p => ({ ...p, type: t }))} activeOpacity={0.75}>
                                    <Text style={[styles.segmentText, manualForm.type === t && styles.segmentTextActive]}>{t === 'credit' ? 'Credit (Money In)' : 'Debit (Money Out)'}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <TouchableOpacity style={[styles.primaryBtn, { marginTop: 24 }]} onPress={addManualBankTx} activeOpacity={0.8}>
                            <Text style={styles.primaryBtnText}>Add Transaction</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </SafeAreaView>
            </Modal>

            <FooterNav />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe:    { flex: 1, backgroundColor: Colors.bg },
    scroll:  { flex: 1 },
    content: { padding: 16, paddingBottom: 24 },

    banner: { flexDirection: 'row', backgroundColor: Colors.surface, padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.border, alignItems: 'center' },
    bannerStat: { flex: 1, alignItems: 'center' },
    bannerValue: { fontSize: 20, fontWeight: '800' },
    bannerLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
    clearBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.expense + '22' },
    clearBtnText: { fontSize: 12, color: Colors.expense, fontWeight: '700' },

    tabs: { flexDirection: 'row', backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
    tab:  { flex: 1, paddingVertical: 12, alignItems: 'center' },
    tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.primary },
    tabText:   { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
    tabTextActive: { color: Colors.primary, fontWeight: '800' },

    card: { backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 16, marginBottom: 14 },
    cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
    cardSubtitle: { fontSize: 12, color: Colors.textMuted, marginBottom: 12, lineHeight: 17 },

    csvInput: { backgroundColor: Colors.bg, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 12, paddingTop: 10, fontSize: 12, color: Colors.textPrimary, height: 140, textAlignVertical: 'top', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', marginBottom: 12 },
    input: { backgroundColor: Colors.bg, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.textPrimary },
    primaryBtn: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
    primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
    secondaryBtn: { borderWidth: 1.5, borderColor: Colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
    secondaryBtnText: { color: Colors.primary, fontWeight: '700', fontSize: 14 },

    dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 14, gap: 10 },
    dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
    dividerText: { fontSize: 12, color: Colors.textMuted },

    miniRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderTopWidth: 1, borderTopColor: Colors.border, gap: 8 },
    miniDate: { fontSize: 11, color: Colors.textMuted, width: 72 },
    miniDesc: { flex: 1, fontSize: 12, color: Colors.textSecondary },
    miniAmt:  { fontSize: 12, fontWeight: '700', minWidth: 70, textAlign: 'right' },
    moreNote: { fontSize: 11, color: Colors.textMuted, marginTop: 8, textAlign: 'center' },

    empty: { alignItems: 'center', paddingVertical: 48 },
    emptyIcon: { fontSize: 40, marginBottom: 12 },
    emptyText: { fontSize: 16, fontWeight: '700', color: Colors.textSecondary },
    emptySubtext: { fontSize: 13, color: Colors.textMuted, marginTop: 4 },

    matchCard: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.income + '44', marginBottom: 10, overflow: 'hidden' },
    matchSide: { flex: 1, padding: 12 },
    matchLabel: { fontSize: 10, fontWeight: '800', color: Colors.textMuted, letterSpacing: 1, marginBottom: 4 },
    matchDate:  { fontSize: 11, color: Colors.textMuted, marginBottom: 3 },
    matchDesc:  { fontSize: 12, color: Colors.textSecondary, marginBottom: 5 },
    matchAmt:   { fontSize: 14, fontWeight: '800' },
    matchDivider: { width: 30, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.income + '22' },
    matchLink: { fontSize: 16, color: Colors.income, fontWeight: '800' },

    sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, marginBottom: 8 },
    sectionNote: { fontSize: 12, color: Colors.textMuted, marginBottom: 10 },

    unmatchCard: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3, borderLeftColor: Colors.expense, padding: 14, marginBottom: 10, alignItems: 'center', gap: 12 },
    unmatchInfo: { flex: 1 },
    unmatchDate: { fontSize: 11, color: Colors.textMuted, marginBottom: 3 },
    unmatchDesc: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600', marginBottom: 5 },
    unmatchAmt:  { fontSize: 15, fontWeight: '800' },
    importBtn: { backgroundColor: Colors.primary + '22', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
    importBtnText: { color: Colors.primary, fontWeight: '700', fontSize: 12 },

    modalSafe:    { flex: 1, backgroundColor: Colors.bg },
    modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
    modalTitle:   { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
    modalClose:   { fontSize: 18, color: Colors.textMuted, fontWeight: '700' },
    fieldLabel:   { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
    segmentRow:   { flexDirection: 'row', gap: 8 },
    segment:      { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', backgroundColor: Colors.surface },
    segmentActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '15' },
    segmentText:   { fontSize: 12, color: Colors.textMuted, fontWeight: '600', textAlign: 'center' },
    segmentTextActive: { color: Colors.primary, fontWeight: '800' },

});
