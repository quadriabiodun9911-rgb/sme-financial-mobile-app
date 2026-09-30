import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, ScrollView, Platform, useWindowDimensions } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { showAlert, confirmAction } from '../utils/webAlert';
import { FOREIGN_CURRENCY_CODES, computeCurrencyAccountsTotal } from '../utils/foreignCurrency';

interface Props { visible: boolean; onClose: () => void; }

// "What do I actually hold, across currencies" -- a standalone tracker,
// same shape as CashPocketsModal but for balances genuinely held in a
// different currency (a USD domiciliary account, a GBP escrow). See
// CurrencyAccount (types/index.ts): deliberately never fed into
// finance.cashBalance, runway, DSCR, or any other engine that assumes
// one base currency -- the converted total shown here is informational
// only, this account's own record.
export default function CurrencyAccountsModal({ visible, onClose }: Props) {
    const { currencyAccounts, addCurrencyAccount, updateCurrencyAccount, deleteCurrencyAccount, settings } = useApp();
    const { currency } = settings;

    const { width: windowWidth } = useWindowDimensions();
    const constrainSheetWidth = Platform.OS === 'web' && windowWidth >= 720;

    const [newLabel, setNewLabel] = useState('');
    const [newCurrencyCode, setNewCurrencyCode] = useState(FOREIGN_CURRENCY_CODES[0]);
    const [newBalance, setNewBalance] = useState('');
    const [newRate, setNewRate] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editBalance, setEditBalance] = useState('');
    const [editRate, setEditRate] = useState('');

    const total = computeCurrencyAccountsTotal(currencyAccounts);

    const handleAdd = () => {
        if (!newLabel.trim()) { showAlert('Name required', 'Enter a name for this account (e.g. "USD Domiciliary").'); return; }
        const balance = parseFloat(newBalance);
        if (!Number.isFinite(balance) || balance < 0) { showAlert('Invalid balance', 'Enter a valid balance.'); return; }
        const rate = parseFloat(newRate);
        if (!Number.isFinite(rate) || rate <= 0) { showAlert('Invalid exchange rate', `Enter how many ${currency} one ${newCurrencyCode} is worth.`); return; }
        addCurrencyAccount(newLabel.trim(), newCurrencyCode, balance, rate);
        setNewLabel(''); setNewBalance(''); setNewRate('');
    };

    const startEdit = (id: string, balance: number, rate: number) => {
        setEditingId(id); setEditBalance(String(balance)); setEditRate(String(rate));
    };

    const handleUpdate = (id: string) => {
        const balance = parseFloat(editBalance);
        const rate = parseFloat(editRate);
        if (!Number.isFinite(balance) || balance < 0) { showAlert('Invalid balance', 'Enter a valid balance.'); return; }
        if (!Number.isFinite(rate) || rate <= 0) { showAlert('Invalid exchange rate', 'Enter a valid exchange rate.'); return; }
        updateCurrencyAccount(id, { balance, exchangeRateToBase: rate });
        setEditingId(null);
    };

    const handleDelete = (id: string, label: string) => {
        confirmAction('Remove account', `Remove "${label}"?`, 'Remove', () => deleteCurrencyAccount(id));
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={s.overlay}>
                <View style={[s.sheet, constrainSheetWidth && s.sheetWide]}>
                    <View style={s.header}>
                        <Text style={s.title}>🌍 Currency Accounts</Text>
                        <TouchableOpacity onPress={onClose}><Text style={s.close}>✕</Text></TouchableOpacity>
                    </View>
                    <Text style={s.subtitle}>Track balances you hold in other currencies -- a USD account, a GBP escrow. Converted here only; your reports and cash figures stay in {currency}.</Text>

                    <View style={s.totalBox}>
                        <Text style={s.totalLabel}>Total (converted to {currency})</Text>
                        <Text style={s.totalValue}>{currency}{total.toLocaleString()}</Text>
                    </View>

                    <ScrollView style={{ maxHeight: 300 }}>
                        {currencyAccounts.length === 0 && (
                            <Text style={s.empty}>No currency accounts yet. Add your first one below.</Text>
                        )}
                        {currencyAccounts.map(acct => (
                            <View key={acct.id} style={s.row}>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.label}>{acct.label} <Text style={s.code}>({acct.currencyCode})</Text></Text>
                                    {editingId === acct.id ? (
                                        <View style={s.editBlock}>
                                            <TextInput style={s.editInput} value={editBalance} onChangeText={setEditBalance} keyboardType="numeric" placeholder="Balance" placeholderTextColor={Colors.textMuted} autoFocus />
                                            <TextInput style={s.editInput} value={editRate} onChangeText={setEditRate} keyboardType="numeric" placeholder={`1 ${acct.currencyCode} = ? ${currency}`} placeholderTextColor={Colors.textMuted} />
                                            <View style={s.editRow}>
                                                <TouchableOpacity style={s.saveBtn} onPress={() => handleUpdate(acct.id)}><Text style={s.saveBtnText}>Save</Text></TouchableOpacity>
                                                <TouchableOpacity style={s.cancelBtn} onPress={() => setEditingId(null)}><Text style={s.cancelBtnText}>Cancel</Text></TouchableOpacity>
                                            </View>
                                        </View>
                                    ) : (
                                        <>
                                            <Text style={s.amount}>{acct.currencyCode} {acct.balance.toLocaleString()}</Text>
                                            <Text style={s.converted}>≈ {currency}{(acct.balance * acct.exchangeRateToBase).toLocaleString()} at 1 {acct.currencyCode} = {currency}{acct.exchangeRateToBase}</Text>
                                        </>
                                    )}
                                </View>
                                <View style={s.actions}>
                                    {editingId !== acct.id && (
                                        <TouchableOpacity onPress={() => startEdit(acct.id, acct.balance, acct.exchangeRateToBase)}>
                                            <Text style={s.icon}>✏️</Text>
                                        </TouchableOpacity>
                                    )}
                                    <TouchableOpacity onPress={() => handleDelete(acct.id, acct.label)}>
                                        <Text style={s.icon}>🗑</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))}
                    </ScrollView>

                    <View style={s.addSection}>
                        <Text style={s.addTitle}>Add a currency account</Text>
                        <TextInput style={s.input} value={newLabel} onChangeText={setNewLabel} placeholder="Account name (e.g. USD Domiciliary)" placeholderTextColor={Colors.textMuted} />

                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                            {FOREIGN_CURRENCY_CODES.map(code => (
                                <TouchableOpacity key={code} style={[s.codeChip, newCurrencyCode === code && s.codeChipActive]} onPress={() => setNewCurrencyCode(code)}>
                                    <Text style={[s.codeChipText, newCurrencyCode === code && s.codeChipTextActive]}>{code}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <TextInput style={s.input} value={newBalance} onChangeText={setNewBalance} placeholder={`Balance in ${newCurrencyCode}`} placeholderTextColor={Colors.textMuted} keyboardType="numeric" />
                        <TextInput style={s.input} value={newRate} onChangeText={setNewRate} placeholder={`1 ${newCurrencyCode} = ? ${currency}`} placeholderTextColor={Colors.textMuted} keyboardType="numeric" />
                        {newBalance && newRate && !isNaN(parseFloat(newBalance)) && !isNaN(parseFloat(newRate)) && (
                            <Text style={s.preview}>≈ {currency}{(parseFloat(newBalance) * parseFloat(newRate)).toLocaleString()}</Text>
                        )}
                        <TouchableOpacity style={s.addBtn} onPress={handleAdd}>
                            <Text style={s.addBtnText}>+ Add Currency Account</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
    sheetWide: { maxWidth: 480, width: '100%', alignSelf: 'center' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    title: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary },
    close: { fontSize: 18, color: Colors.textMuted, padding: 4 },
    subtitle: { fontSize: 12, color: Colors.textMuted, marginBottom: 16 },
    totalBox: { backgroundColor: Colors.bg, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
    totalLabel: { fontSize: 11, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    totalValue: { fontSize: 32, fontWeight: 'bold', color: Colors.income, marginTop: 4 },
    empty: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 16 },
    row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
    label: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
    code: { fontSize: 11, fontWeight: '400', color: Colors.textMuted },
    amount: { fontSize: 15, color: Colors.income, fontWeight: 'bold', marginTop: 2 },
    converted: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
    editBlock: { marginTop: 4, gap: 6 },
    editInput: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, color: Colors.textPrimary, fontSize: 13 },
    editRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    saveBtn: { backgroundColor: Colors.primary, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
    saveBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
    cancelBtn: { paddingHorizontal: 8, paddingVertical: 5 },
    cancelBtnText: { color: Colors.textMuted, fontSize: 12 },
    actions: { flexDirection: 'row', gap: 12, paddingTop: 2 },
    icon: { fontSize: 16 },
    addSection: { marginTop: 16 },
    addTitle: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, marginBottom: 8 },
    codeChip: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8 },
    codeChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    codeChipText: { fontSize: 12, color: Colors.textSecondary },
    codeChipTextActive: { color: '#fff', fontWeight: '600' },
    input: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: Colors.textPrimary, fontSize: 14, marginBottom: 10 },
    preview: { fontSize: 12, color: Colors.textMuted, marginBottom: 10, marginTop: -4 },
    addBtn: { backgroundColor: Colors.primary, paddingVertical: 13, borderRadius: 10, alignItems: 'center' },
    addBtnText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 15 },
});
