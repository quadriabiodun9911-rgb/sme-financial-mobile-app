/**
 * Shared confirm step for the two IFRS for SMEs Section 11 actions a
 * specific outstanding receivable can go through: raising a (possibly
 * partial) bad-debt provision, or writing the whole thing off. One modal
 * instead of two so AgingReport and ReceivablesReport don't each grow
 * their own copy of the same amount-entry/confirm flow.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Modal, useWindowDimensions, Platform } from 'react-native';
import { Transaction } from '../types';
import { Colors } from '../theme/colors';
import { Radius, Spacing, Shadow } from '../theme/tokens';

export type ReceivableActionMode = 'doubtful' | 'writeoff';

interface Props {
    visible: boolean;
    mode: ReceivableActionMode;
    tx: Transaction | null;
    currency: string;
    onClose: () => void;
    onConfirmDoubtful: (amount: number, note: string) => void;
    onConfirmWriteOff: (note: string) => void;
}

export default function ReceivableActionModal({ visible, mode, tx, currency, onClose, onConfirmDoubtful, onConfirmWriteOff }: Props) {
    const { width: windowWidth } = useWindowDimensions();
    const constrainWidth = Platform.OS === 'web' && windowWidth >= 720;

    const fullAmount = tx?.amount ?? 0;
    const [amountText, setAmountText] = useState(String(fullAmount));
    const [note, setNote] = useState('');

    // Re-seed the amount field to this transaction's full outstanding
    // balance every time the modal is opened for a (possibly different)
    // transaction -- otherwise a stale amount from the previous item could
    // carry over.
    useEffect(() => {
        if (visible) {
            setAmountText(String(fullAmount));
            setNote('');
        }
    }, [visible, tx?.id, fullAmount]);

    if (!visible || !tx) return null;

    const parsedAmount = parseFloat(amountText);
    const amountValid = mode === 'doubtful'
        ? Number.isFinite(parsedAmount) && parsedAmount > 0 && parsedAmount <= fullAmount
        : true; // write-off always uses the full amount, nothing to validate

    const confirm = () => {
        if (mode === 'doubtful') {
            if (!amountValid) return;
            onConfirmDoubtful(parsedAmount, note.trim());
        } else {
            onConfirmWriteOff(note.trim());
        }
        onClose();
    };

    return (
        <Modal visible transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={[styles.card, constrainWidth && styles.cardWide]}>
                    <Text style={styles.title}>{mode === 'doubtful' ? 'Mark as Doubtful' : 'Write Off Receivable'}</Text>
                    <Text style={styles.subject} numberOfLines={2}>{tx.vendorCustomer || tx.description}</Text>
                    <Text style={styles.meta}>Outstanding: {currency}{fullAmount.toLocaleString()}</Text>

                    {mode === 'doubtful' ? (
                        <>
                            <Text style={styles.label}>Amount you believe is at risk</Text>
                            <TextInput
                                style={styles.input}
                                value={amountText}
                                onChangeText={setAmountText}
                                keyboardType="numeric"
                                placeholder="0"
                                placeholderTextColor={Colors.textMuted}
                            />
                            {!amountValid && (
                                <Text style={styles.errorText}>Enter an amount between 1 and {currency}{fullAmount.toLocaleString()}.</Text>
                            )}
                            <Text style={styles.helpText}>
                                Posts Dr Bad Debt Expense / Cr Allowance for Doubtful Debts for this amount. You can reverse this later if the customer pays after all.
                            </Text>
                        </>
                    ) : (
                        <Text style={styles.helpText}>
                            Removes this receivable from Accounts Receivable entirely and consumes any allowance already raised against it. This cannot be undone -- use "Mark as Doubtful" instead if there's still a chance of collecting.
                        </Text>
                    )}

                    <Text style={styles.label}>Note (optional)</Text>
                    <TextInput
                        style={styles.input}
                        value={note}
                        onChangeText={setNote}
                        placeholder={mode === 'doubtful' ? 'e.g. customer disputes part of the invoice' : 'e.g. confirmed insolvent, collection abandoned'}
                        placeholderTextColor={Colors.textMuted}
                    />

                    <View style={styles.btnRow}>
                        <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                            <Text style={styles.cancelBtnText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.confirmBtn, mode === 'writeoff' && styles.confirmBtnDanger, !amountValid && styles.confirmBtnDisabled]}
                            onPress={confirm}
                            disabled={!amountValid}
                        >
                            <Text style={styles.confirmBtnText}>
                                {mode === 'doubtful' ? 'Raise Provision' : `Write Off ${currency}${fullAmount.toLocaleString()}`}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: Spacing.xl },
    card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.xl, ...Shadow.md },
    cardWide: { maxWidth: 440, width: '100%', alignSelf: 'center' },
    title: { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 6 },
    subject: { fontSize: 13.5, fontWeight: '600', color: Colors.textPrimary, marginBottom: 2 },
    meta: { fontSize: 12, color: Colors.textMuted, marginBottom: 14 },
    label: { fontSize: 11.5, fontWeight: '600', color: Colors.textSecondary, marginTop: 10, marginBottom: 6 },
    input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: Colors.textPrimary, backgroundColor: Colors.bg },
    errorText: { fontSize: 11, color: Colors.expense, marginTop: 4 },
    helpText: { fontSize: 11, color: Colors.textMuted, marginTop: 8, lineHeight: 15 },
    btnRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
    cancelBtn: { flex: 1, paddingVertical: 11, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
    cancelBtnText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
    confirmBtn: { flex: 1.4, paddingVertical: 11, borderRadius: Radius.sm, backgroundColor: Colors.primary, alignItems: 'center' },
    confirmBtnDanger: { backgroundColor: Colors.expense },
    confirmBtnDisabled: { opacity: 0.5 },
    confirmBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});
