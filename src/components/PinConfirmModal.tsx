import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, StyleSheet, Platform, KeyboardAvoidingView } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import Icon from './ui/Icon';

interface Props {
    visible: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    destructive?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

// Step-up re-authentication before a high-risk action (deleting business
// data, removing a team member, sharing loan status with a lender) --
// requires re-entering the device PIN even though the session is already
// signed in, so a device left unlocked in the wrong hands can't take these
// actions without also knowing the PIN. See verifyPin in storage.ts for
// why this checks the PIN directly rather than re-running login().
export default function PinConfirmModal({ visible, title, message, confirmLabel = 'Confirm', destructive = false, onConfirm, onCancel }: Props) {
    const { verifyPin } = useApp();
    const [pin, setPin] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [checking, setChecking] = useState(false);

    const reset = () => { setPin(''); setError(null); setChecking(false); };
    const close = () => { reset(); onCancel(); };

    const handleConfirm = async () => {
        if (!/^\d{4,6}$/.test(pin)) { setError('Enter your PIN.'); return; }
        setChecking(true);
        const ok = await verifyPin(pin);
        setChecking(false);
        if (!ok) { setError('Incorrect PIN.'); setPin(''); return; }
        reset();
        onConfirm();
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
            <View style={s.overlay}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.sheetWrap}>
                    <View style={s.sheet}>
                        <View style={[s.iconWrap, { backgroundColor: (destructive ? Colors.expense : Colors.primary) + '22' }]}>
                            <Icon name={destructive ? 'alert-triangle' : 'lock'} size={20} color={destructive ? Colors.expense : Colors.primary} />
                        </View>
                        <Text style={s.title}>{title}</Text>
                        <Text style={s.message}>{message}</Text>

                        <TextInput
                            style={s.input}
                            placeholder="Enter your PIN"
                            placeholderTextColor={Colors.textMuted}
                            value={pin}
                            onChangeText={t => { setPin(t.replace(/\D/g, '').slice(0, 6)); setError(null); }}
                            keyboardType="number-pad"
                            secureTextEntry
                            maxLength={6}
                            autoFocus
                        />
                        {error && <Text style={s.error}>{error}</Text>}

                        <View style={s.btnRow}>
                            <TouchableOpacity style={s.cancelBtn} onPress={close}>
                                <Text style={s.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[s.confirmBtn, { backgroundColor: destructive ? Colors.expense : Colors.primary }, checking && { opacity: 0.7 }]}
                                onPress={handleConfirm}
                                disabled={checking}
                            >
                                <Text style={s.confirmBtnText}>{checking ? 'Checking…' : confirmLabel}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
    sheetWrap: { width: '100%', maxWidth: 380 },
    sheet: {
        backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.xl,
        alignItems: 'center', borderWidth: 1, borderColor: Colors.border, ...Shadow.md,
    },
    iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md },
    title: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary, marginBottom: 6, textAlign: 'center' },
    message: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, marginBottom: Spacing.lg },
    input: {
        width: '100%', backgroundColor: Colors.bg, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border,
        padding: Spacing.md, color: Colors.textPrimary, fontSize: 18, letterSpacing: 6, textAlign: 'center',
    },
    error: { fontSize: 12, color: Colors.expense, marginTop: 8, fontWeight: '600' },
    btnRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg, width: '100%' },
    cancelBtn: { flex: 1, paddingVertical: Spacing.md, borderRadius: Radius.sm, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
    cancelBtnText: { color: Colors.textSecondary, fontWeight: '700', fontSize: 14 },
    confirmBtn: { flex: 1, paddingVertical: Spacing.md, borderRadius: Radius.sm, alignItems: 'center' },
    confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
