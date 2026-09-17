/**
 * General Ledger -- the first bookkeeper-visible screen on top of the
 * ledger foundation (journalEntry.ts / chartOfAccounts.ts): a real Trial
 * Balance built from every posted journal entry, a chronological Journal
 * Entries list showing what's been posted and by what (system vs a
 * bookkeeper's own manual entry), and a form to post a new balanced manual
 * entry directly.
 *
 * Read-only for 'viewer' and 'external_accountant' (rolePermissions.ts's
 * EXTERNAL_ACCOUNTANT_ALLOWED_SCREENS admits this screen, but
 * canWriteBusinessData excludes both roles) -- the same "readable by more
 * roles than can write" split DataIntegrityScreen already uses for its own
 * delete action. Posting a manual entry is owner/admin only in this pass.
 */
import React, { useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, StyleSheet, TouchableOpacity, TextInput, Modal, Platform, useWindowDimensions } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import Icon from '../components/ui/Icon';
import { canWriteBusinessData } from '../utils/rolePermissions';
import { computeTrialBalance, isBalanced } from '../utils/journalEntry';
import { Account, AccountType, JournalLine } from '../types';

function fmt(currency: string, value: number): string {
    const sign = value < 0 ? '-' : '';
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${sign}${currency}${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}${currency}${(abs / 1_000).toFixed(1)}K`;
    return `${sign}${currency}${Math.round(abs).toLocaleString()}`;
}

const TYPE_LABELS: Record<AccountType, string> = {
    asset: 'Assets', liability: 'Liabilities', equity: 'Equity', revenue: 'Revenue', expense: 'Expenses',
};
const TYPE_ORDER: AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense'];

const SOURCE_LABELS: Record<string, string> = {
    transaction: 'Transaction', invoice: 'Invoice', bill: 'Bill',
    payroll: 'Payroll', loan_payment: 'Loan Payment', inventory: 'Inventory', manual: 'Manual',
};

interface DraftLine { accountId: string; side: 'debit' | 'credit'; amount: string }

function SectionCard({ icon, title, subtitle, children }: { icon: string; title: string; subtitle: string; children: React.ReactNode }) {
    return (
        <View style={s.card}>
            <View style={s.cardHead}>
                <View style={s.cardIconWrap}><Icon name={icon as any} size={16} color={Colors.primary} /></View>
                <View style={{ flex: 1 }}>
                    <Text style={s.cardTitle}>{title}</Text>
                    <Text style={s.cardSubtitle}>{subtitle}</Text>
                </View>
            </View>
            {children}
        </View>
    );
}

export default function GeneralLedgerScreen() {
    const { accounts, journalEntries, postManualJournalEntry, settings, userRole } = useApp();
    const cur = settings.currency || '';
    const canWrite = canWriteBusinessData(userRole);
    const { width: windowWidth } = useWindowDimensions();
    const constrainSheetWidth = Platform.OS === 'web' && windowWidth >= 720;

    const trialBalance = useMemo(() => computeTrialBalance(accounts, journalEntries), [accounts, journalEntries]);
    const totalDebit = trialBalance.reduce((s, r) => s + r.debitBalance, 0);
    const totalCredit = trialBalance.reduce((s, r) => s + r.creditBalance, 0);
    const rowsByType = useMemo(() => {
        const map = new Map<AccountType, typeof trialBalance>();
        for (const row of trialBalance) {
            if (row.debitBalance === 0 && row.creditBalance === 0) continue;
            const list = map.get(row.type) ?? [];
            list.push(row);
            map.set(row.type, list);
        }
        return map;
    }, [trialBalance]);

    const recentEntries = useMemo(
        () => [...journalEntries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 20),
        [journalEntries]
    );
    const accountName = (id: string) => accounts.find(a => a.id === id)?.name ?? 'Unknown account';

    // --- New Journal Entry form state ---
    const [showForm, setShowForm] = useState(false);
    const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [memo, setMemo] = useState('');
    const [lines, setLines] = useState<DraftLine[]>([{ accountId: '', side: 'debit', amount: '' }, { accountId: '', side: 'credit', amount: '' }]);
    const [pickerForLine, setPickerForLine] = useState<number | null>(null);
    const [postError, setPostError] = useState<string | null>(null);

    const resetForm = () => {
        setDate(new Date().toISOString().slice(0, 10));
        setMemo('');
        setLines([{ accountId: '', side: 'debit', amount: '' }, { accountId: '', side: 'credit', amount: '' }]);
        setPickerForLine(null);
        setPostError(null);
    };

    const draftLines: JournalLine[] = lines
        .filter(l => l.accountId && parseFloat(l.amount) > 0)
        .map(l => {
            const amt = parseFloat(l.amount) || 0;
            return { accountId: l.accountId, debit: l.side === 'debit' ? amt : 0, credit: l.side === 'credit' ? amt : 0 };
        });
    const draftDebitTotal = draftLines.reduce((s, l) => s + l.debit, 0);
    const draftCreditTotal = draftLines.reduce((s, l) => s + l.credit, 0);
    const draftBalanced = draftLines.length >= 2 && isBalanced(draftLines);

    const handlePost = () => {
        if (!memo.trim()) { setPostError('Add a memo describing this entry.'); return; }
        if (!draftBalanced) { setPostError('Debits and credits must be equal before this can be posted.'); return; }
        const result = postManualJournalEntry(date, memo.trim(), draftLines);
        if (!result.ok) { setPostError(result.error ?? 'Could not post this entry.'); return; }
        setShowForm(false);
        resetForm();
    };

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 48 }}>
                <View style={s.pad}>
                    <Text style={s.title}>General Ledger</Text>
                    <Text style={s.subtitle}>
                        Every journal entry posted from your everyday records, and the Trial Balance it rolls up to.
                    </Text>

                    {/* Trial Balance */}
                    <SectionCard icon="bar-chart-2" title="Trial Balance" subtitle="Every account's net position, grouped by type">
                        {trialBalance.every(r => r.debitBalance === 0 && r.creditBalance === 0) ? (
                            <View style={s.emptyBox}>
                                <Icon name="inbox" size={18} color={Colors.textMuted} />
                                <Text style={s.emptyText}>No journal entries posted yet — this fills in as you record transactions, invoices, bills, and payroll.</Text>
                            </View>
                        ) : (
                            <>
                                {TYPE_ORDER.filter(t => rowsByType.has(t)).map(type => (
                                    <View key={type} style={s.tbGroup}>
                                        <Text style={s.tbGroupTitle}>{TYPE_LABELS[type]}</Text>
                                        {rowsByType.get(type)!.map(row => (
                                            <View key={row.accountId} style={s.tbRow}>
                                                <Text style={s.tbAccount} numberOfLines={1}>{row.code} · {row.name}</Text>
                                                <Text style={s.tbDebit}>{row.debitBalance > 0 ? fmt(cur, row.debitBalance) : ''}</Text>
                                                <Text style={s.tbCredit}>{row.creditBalance > 0 ? fmt(cur, row.creditBalance) : ''}</Text>
                                            </View>
                                        ))}
                                    </View>
                                ))}
                                <View style={s.tbTotalRow}>
                                    <Text style={s.tbTotalLabel}>Total</Text>
                                    <Text style={s.tbTotalValue}>{fmt(cur, totalDebit)}</Text>
                                    <Text style={s.tbTotalValue}>{fmt(cur, totalCredit)}</Text>
                                </View>
                                {Math.abs(totalDebit - totalCredit) > 0.01 && (
                                    <View style={s.warnBox}>
                                        <Icon name="alert-triangle" size={16} color={Colors.warning} />
                                        <Text style={s.warnText}>Debits and credits don't match — this shouldn't happen; every entry is checked before posting.</Text>
                                    </View>
                                )}
                            </>
                        )}
                    </SectionCard>

                    {/* Journal Entries */}
                    <SectionCard icon="list" title="Journal Entries" subtitle="Most recent 20, newest first">
                        {recentEntries.length === 0 ? (
                            <View style={s.emptyBox}>
                                <Icon name="inbox" size={18} color={Colors.textMuted} />
                                <Text style={s.emptyText}>Nothing posted yet.</Text>
                            </View>
                        ) : (
                            recentEntries.map(entry => (
                                <View key={entry.id} style={s.jeRow}>
                                    <View style={{ flex: 1 }}>
                                        <View style={s.jeHeadRow}>
                                            <Text style={s.jeMemo} numberOfLines={1}>{entry.memo}</Text>
                                            <View style={[s.jeBadge, entry.postedBy === 'bookkeeper' && s.jeBadgeManual]}>
                                                <Text style={[s.jeBadgeText, entry.postedBy === 'bookkeeper' && s.jeBadgeTextManual]}>
                                                    {SOURCE_LABELS[entry.source] ?? entry.source}
                                                </Text>
                                            </View>
                                            {entry.reversedByEntryId && <View style={s.jeBadgeReversed}><Text style={s.jeBadgeReversedText}>Reversed</Text></View>}
                                        </View>
                                        <Text style={s.jeDate}>{entry.date}</Text>
                                        {entry.lines.map((l, i) => (
                                            <Text key={i} style={s.jeLine}>
                                                {l.debit > 0 ? `Dr ${accountName(l.accountId)} ${fmt(cur, l.debit)}` : `Cr ${accountName(l.accountId)} ${fmt(cur, l.credit)}`}
                                            </Text>
                                        ))}
                                    </View>
                                </View>
                            ))
                        )}
                    </SectionCard>

                    {canWrite && (
                        <TouchableOpacity style={s.newEntryBtn} onPress={() => setShowForm(true)}>
                            <Icon name="plus" size={16} color="#fff" />
                            <Text style={s.newEntryBtnText}>New Journal Entry</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </ScrollView>
            <FooterNav />

            <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}>
                <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowForm(false)} />
                <ScrollView style={[s.sheet, constrainSheetWidth && s.sheetWide]} contentContainerStyle={{ paddingBottom: Spacing.xl }}>
                    <View style={s.sheetHandle} />
                    <Text style={s.sheetTitle}>New Journal Entry</Text>

                    <Text style={s.fieldLabel}>Date</Text>
                    <TextInput style={s.input} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={Colors.textMuted} />

                    <Text style={s.fieldLabel}>Memo</Text>
                    <TextInput style={s.input} value={memo} onChangeText={setMemo} placeholder="What is this entry for?" placeholderTextColor={Colors.textMuted} />

                    <Text style={[s.fieldLabel, { marginTop: Spacing.md }]}>Lines</Text>
                    {lines.map((line, i) => (
                        <View key={i} style={s.lineRow}>
                            <TouchableOpacity
                                style={s.lineAccountSelector}
                                onPress={() => setPickerForLine(pickerForLine === i ? null : i)}
                            >
                                <Text style={[s.lineAccountText, !line.accountId && { color: Colors.textMuted }]} numberOfLines={1}>
                                    {line.accountId ? accountName(line.accountId) : 'Select account...'}
                                </Text>
                                <Icon name={pickerForLine === i ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.textMuted} />
                            </TouchableOpacity>
                            {pickerForLine === i && (
                                <ScrollView style={s.accountList} nestedScrollEnabled>
                                    {accounts.filter(a => !a.archivedAt).map((a: Account) => (
                                        <TouchableOpacity
                                            key={a.id}
                                            style={s.accountOption}
                                            onPress={() => {
                                                setLines(prev => prev.map((l, li) => (li === i ? { ...l, accountId: a.id } : l)));
                                                setPickerForLine(null);
                                            }}
                                        >
                                            <Text style={s.accountOptionText}>{a.code} · {a.name}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            )}
                            <View style={s.lineAmountRow}>
                                <View style={s.sideToggle}>
                                    {(['debit', 'credit'] as const).map(side => (
                                        <TouchableOpacity
                                            key={side}
                                            style={[s.sideBtn, line.side === side && s.sideBtnActive]}
                                            onPress={() => setLines(prev => prev.map((l, li) => (li === i ? { ...l, side } : l)))}
                                        >
                                            <Text style={[s.sideBtnText, line.side === side && s.sideBtnTextActive]}>{side === 'debit' ? 'Dr' : 'Cr'}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                                <TextInput
                                    style={[s.input, { flex: 1 }]}
                                    value={line.amount}
                                    onChangeText={v => setLines(prev => prev.map((l, li) => (li === i ? { ...l, amount: v } : l)))}
                                    keyboardType="numeric"
                                    placeholder="0.00"
                                    placeholderTextColor={Colors.textMuted}
                                />
                                {lines.length > 2 && (
                                    <TouchableOpacity onPress={() => setLines(prev => prev.filter((_, li) => li !== i))}>
                                        <Icon name="x" size={16} color={Colors.textMuted} />
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                    ))}
                    <TouchableOpacity style={s.addLineBtn} onPress={() => setLines(prev => [...prev, { accountId: '', side: 'debit', amount: '' }])}>
                        <Icon name="plus" size={14} color={Colors.primary} />
                        <Text style={s.addLineBtnText}>Add line</Text>
                    </TouchableOpacity>

                    <View style={s.balanceRow}>
                        <Text style={s.balanceLabel}>Debits {fmt(cur, draftDebitTotal)} · Credits {fmt(cur, draftCreditTotal)}</Text>
                        {draftLines.length > 0 && (
                            <Text style={[s.balanceStatus, draftBalanced ? s.balanceOk : s.balanceOff]}>
                                {draftBalanced ? 'Balanced' : 'Not balanced'}
                            </Text>
                        )}
                    </View>

                    {postError && (
                        <View style={s.warnBox}>
                            <Icon name="alert-triangle" size={16} color={Colors.warning} />
                            <Text style={s.warnText}>{postError}</Text>
                        </View>
                    )}

                    <TouchableOpacity style={[s.postBtn, !draftBalanced && s.postBtnDisabled]} onPress={handlePost} disabled={!draftBalanced}>
                        <Text style={s.postBtnText}>Post Entry</Text>
                    </TouchableOpacity>
                </ScrollView>
            </Modal>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: Spacing.lg },
    title: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
    subtitle: { fontSize: 13, color: Colors.textMuted, marginTop: 4, marginBottom: Spacing.lg, lineHeight: 18 },

    card: {
        backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.lg,
        marginBottom: Spacing.md, ...Shadow.sm,
    },
    cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.md },
    cardIconWrap: {
        width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.surfaceVariant,
        alignItems: 'center', justifyContent: 'center',
    },
    cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
    cardSubtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 2, lineHeight: 16 },

    emptyBox: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start', backgroundColor: Colors.bg, borderRadius: Radius.sm, padding: Spacing.md },
    emptyText: { flex: 1, fontSize: 12.5, color: Colors.textMuted, lineHeight: 17 },
    warnBox: { flexDirection: 'row', gap: Spacing.sm, backgroundColor: '#FEF3C7', borderRadius: Radius.sm, padding: Spacing.md, alignItems: 'flex-start', marginTop: Spacing.sm },
    warnText: { flex: 1, fontSize: 12.5, color: '#92400E', lineHeight: 17 },

    tbGroup: { marginBottom: Spacing.sm },
    tbGroupTitle: { fontSize: 11.5, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
    tbRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderTopWidth: 1, borderTopColor: Colors.border },
    tbAccount: { flex: 1, fontSize: 12.5, color: Colors.textPrimary },
    tbDebit: { width: 80, fontSize: 12.5, fontWeight: '600', color: Colors.textPrimary, textAlign: 'right' },
    tbCredit: { width: 80, fontSize: 12.5, fontWeight: '600', color: Colors.textPrimary, textAlign: 'right' },
    tbTotalRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm, borderTopWidth: 2, borderTopColor: Colors.textPrimary, marginTop: 4 },
    tbTotalLabel: { flex: 1, fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    tbTotalValue: { width: 80, fontSize: 13, fontWeight: '800', color: Colors.textPrimary, textAlign: 'right' },

    jeRow: { flexDirection: 'row', paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
    jeHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    jeMemo: { flex: 1, fontSize: 13.5, fontWeight: '600', color: Colors.textPrimary },
    jeDate: { fontSize: 11, color: Colors.textMuted, marginTop: 1, marginBottom: 4 },
    jeLine: { fontSize: 11.5, color: Colors.textSecondary, lineHeight: 16 },
    jeBadge: { backgroundColor: Colors.surfaceVariant, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
    jeBadgeManual: { backgroundColor: 'rgba(37,99,235,0.15)' },
    jeBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.textMuted },
    jeBadgeTextManual: { color: Colors.primary },
    jeBadgeReversed: { backgroundColor: '#FEF3C7', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
    jeBadgeReversedText: { fontSize: 10, fontWeight: '700', color: '#92400E' },

    newEntryBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        backgroundColor: Colors.primary, borderRadius: Radius.pill, paddingVertical: 14, marginTop: Spacing.sm,
    },
    newEntryBtnText: { color: '#fff', fontWeight: '800', fontSize: 14.5 },

    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.xl, maxHeight: '85%' },
    sheetWide: { maxWidth: 560, width: '100%', alignSelf: 'center' },
    sheetHandle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.lg },
    sheetTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.lg },

    fieldLabel: { fontSize: 11.5, fontWeight: '700', color: Colors.textMuted, marginBottom: 6 },
    input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.textPrimary, backgroundColor: Colors.bg, marginBottom: Spacing.sm },

    lineRow: { marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, padding: Spacing.sm, backgroundColor: Colors.bg },
    lineAccountSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
    lineAccountText: { fontSize: 13.5, color: Colors.textPrimary, flex: 1 },
    accountList: { maxHeight: 160, backgroundColor: Colors.surface, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, marginVertical: 6 },
    accountOption: { padding: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
    accountOptionText: { fontSize: 12.5, color: Colors.textSecondary },
    lineAmountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    sideToggle: { flexDirection: 'row', borderRadius: Radius.sm, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
    sideBtn: { paddingHorizontal: 12, paddingVertical: 9, backgroundColor: Colors.surface },
    sideBtnActive: { backgroundColor: Colors.primary },
    sideBtnText: { fontSize: 12.5, fontWeight: '700', color: Colors.textMuted },
    sideBtnTextActive: { color: '#fff' },

    addLineBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginBottom: Spacing.md },
    addLineBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },

    balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
    balanceLabel: { fontSize: 12, color: Colors.textMuted },
    balanceStatus: { fontSize: 12, fontWeight: '700' },
    balanceOk: { color: Colors.income },
    balanceOff: { color: Colors.danger },

    postBtn: { backgroundColor: Colors.primary, borderRadius: Radius.pill, paddingVertical: 14, alignItems: 'center', marginTop: Spacing.sm },
    postBtnDisabled: { backgroundColor: Colors.border },
    postBtnText: { color: '#fff', fontWeight: '800', fontSize: 14.5 },
});
