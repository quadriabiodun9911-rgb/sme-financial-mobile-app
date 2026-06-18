import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, ScrollView, Alert } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';

interface Props { visible: boolean; onClose: () => void; }

export default function CashPocketsModal({ visible, onClose }: Props) {
    const { cashPockets, addCashPocket, updateCashPocket, deleteCashPocket, settings } = useApp();
    const { currency } = settings;
    const [newName, setNewName] = useState('');
    const [newAmount, setNewAmount] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editAmount, setEditAmount] = useState('');

    const total = cashPockets.reduce((s, p) => s + p.amount, 0);

    const handleAdd = () => {
        if (!newName.trim()) { Alert.alert('Name required', 'Enter a name for this cash pocket.'); return; }
        const amt = parseFloat(newAmount);
        if (isNaN(amt) || amt < 0) { Alert.alert('Invalid amount', 'Enter a valid amount.'); return; }
        addCashPocket(newName.trim(), amt);
        setNewName(''); setNewAmount('');
    };

    const handleUpdate = (id: string) => {
        const amt = parseFloat(editAmount);
        if (isNaN(amt) || amt < 0) { Alert.alert('Invalid amount', 'Enter a valid amount.'); return; }
        updateCashPocket(id, amt);
        setEditingId(null);
    };

    const handleDelete = (id: string, name: string) => {
        Alert.alert('Remove pocket', `Remove "${name}"?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: () => deleteCashPocket(id) },
        ]);
    };

    const DEFAULT_POCKETS = ['In my pocket', 'Mobile money', 'Bank account', 'Susu / savings group', 'Shop drawer'];

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={s.overlay}>
                <View style={s.sheet}>
                    <View style={s.header}>
                        <Text style={s.title}>💵 My Cash Pockets</Text>
                        <TouchableOpacity onPress={onClose}><Text style={s.close}>✕</Text></TouchableOpacity>
                    </View>
                    <Text style={s.subtitle}>Track cash across all your accounts and physical locations</Text>

                    {/* Total */}
                    <View style={s.totalBox}>
                        <Text style={s.totalLabel}>Total Cash</Text>
                        <Text style={s.totalValue}>{currency}{total.toLocaleString()}</Text>
                    </View>

                    <ScrollView style={{ maxHeight: 300 }}>
                        {cashPockets.length === 0 && (
                            <Text style={s.empty}>No pockets yet. Add your first one below.</Text>
                        )}
                        {cashPockets.map(pocket => (
                            <View key={pocket.id} style={s.pocketRow}>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.pocketName}>{pocket.name}</Text>
                                    {editingId === pocket.id ? (
                                        <View style={s.editRow}>
                                            <TextInput style={s.editInput} value={editAmount} onChangeText={setEditAmount} keyboardType="numeric" placeholder="0" placeholderTextColor={Colors.textMuted} autoFocus />
                                            <TouchableOpacity style={s.saveBtn} onPress={() => handleUpdate(pocket.id)}><Text style={s.saveBtnText}>Save</Text></TouchableOpacity>
                                            <TouchableOpacity style={s.cancelBtn} onPress={() => setEditingId(null)}><Text style={s.cancelBtnText}>Cancel</Text></TouchableOpacity>
                                        </View>
                                    ) : (
                                        <Text style={s.pocketAmount}>{currency}{pocket.amount.toLocaleString()}</Text>
                                    )}
                                </View>
                                <View style={s.pocketActions}>
                                    {editingId !== pocket.id && (
                                        <TouchableOpacity onPress={() => { setEditingId(pocket.id); setEditAmount(String(pocket.amount)); }}>
                                            <Text style={s.editIcon}>✏️</Text>
                                        </TouchableOpacity>
                                    )}
                                    <TouchableOpacity onPress={() => handleDelete(pocket.id, pocket.name)}>
                                        <Text style={s.deleteIcon}>🗑</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))}
                    </ScrollView>

                    {/* Add new pocket */}
                    <View style={s.addSection}>
                        <Text style={s.addTitle}>Add a pocket</Text>
                        {/* Quick suggestions */}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                            {DEFAULT_POCKETS.filter(d => !cashPockets.find(p => p.name === d)).map(d => (
                                <TouchableOpacity key={d} style={s.suggestion} onPress={() => setNewName(d)}>
                                    <Text style={s.suggestionText}>{d}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        <TextInput style={s.input} value={newName} onChangeText={setNewName} placeholder="Pocket name (e.g. Mobile money)" placeholderTextColor={Colors.textMuted} />
                        <TextInput style={s.input} value={newAmount} onChangeText={setNewAmount} placeholder="Current amount" placeholderTextColor={Colors.textMuted} keyboardType="numeric" />
                        <TouchableOpacity style={s.addBtn} onPress={handleAdd}>
                            <Text style={s.addBtnText}>+ Add Pocket</Text>
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
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    title: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary },
    close: { fontSize: 18, color: Colors.textMuted, padding: 4 },
    subtitle: { fontSize: 12, color: Colors.textMuted, marginBottom: 16 },
    totalBox: { backgroundColor: Colors.bg, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
    totalLabel: { fontSize: 11, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    totalValue: { fontSize: 32, fontWeight: 'bold', color: Colors.income, marginTop: 4 },
    empty: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 16 },
    pocketRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
    pocketName: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
    pocketAmount: { fontSize: 15, color: Colors.income, fontWeight: 'bold', marginTop: 2 },
    editRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    editInput: { flex: 1, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, color: Colors.textPrimary, fontSize: 14 },
    saveBtn: { backgroundColor: Colors.primary, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
    saveBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
    cancelBtn: { paddingHorizontal: 8, paddingVertical: 5 },
    cancelBtnText: { color: Colors.textMuted, fontSize: 12 },
    pocketActions: { flexDirection: 'row', gap: 12 },
    editIcon: { fontSize: 16 },
    deleteIcon: { fontSize: 16 },
    addSection: { marginTop: 16 },
    addTitle: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, marginBottom: 8 },
    suggestion: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8 },
    suggestionText: { fontSize: 12, color: Colors.textSecondary },
    input: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: Colors.textPrimary, fontSize: 14, marginBottom: 10 },
    addBtn: { backgroundColor: Colors.primary, paddingVertical: 13, borderRadius: 10, alignItems: 'center' },
    addBtnText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 15 },
});
