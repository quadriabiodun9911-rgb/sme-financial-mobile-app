import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ScrollView, Platform, useWindowDimensions } from 'react-native';
import { Colors } from '../theme/colors';
import { Shadow } from '../theme/tokens';
import Icon from './ui/Icon';
import { WinbackCustomer } from '../utils/customerWinback';
import { sendPromotionalMessageViaWhatsApp } from '../utils/whatsappIntegration';

interface Props {
    visible: boolean;
    onClose: () => void;
    customers: WinbackCustomer[];
    businessName: string;
}

const DEFAULT_MESSAGE = (businessName: string) =>
    `Hi! It's been a while since your last order with ${businessName} — we'd love to have you back. Let us know if there's anything we can help with!`;

// wa.me only ever opens ONE conversation at a time -- there is no bulk-send
// API behind WhatsApp's own deep link, and pretending otherwise would be
// dishonest about what this button actually does (see
// sendPromotionalMessageViaWhatsApp's own comment). This composes the
// message once, then steps through the selected customers one at a time,
// opening WhatsApp pre-filled for each -- still real time saved (no
// retyping the message per customer, no hunting for each phone number),
// just not a silent background send.
export default function CustomerBroadcastModal({ visible, onClose, customers, businessName }: Props) {
    const { width: windowWidth } = useWindowDimensions();
    const constrainSheetWidth = Platform.OS === 'web' && windowWidth >= 720;

    const [step, setStep] = useState<'compose' | 'send'>('compose');
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
    const [message, setMessage] = useState(DEFAULT_MESSAGE(businessName || 'us'));
    const [queueIndex, setQueueIndex] = useState(0);
    const [sentKeys, setSentKeys] = useState<Set<string>>(new Set());

    const reachable = useMemo(() => customers.filter(c => !!c.phone), [customers]);
    const unreachableCount = customers.length - reachable.length;

    const toggle = (key: string) => {
        setSelectedKeys(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    const queue = useMemo(() => reachable.filter(c => selectedKeys.has(c.key)), [reachable, selectedKeys]);
    const current = queue[queueIndex];

    const reset = () => {
        setStep('compose');
        setSelectedKeys(new Set());
        setQueueIndex(0);
        setSentKeys(new Set());
    };

    const handleClose = () => { reset(); onClose(); };

    const startSending = () => {
        if (queue.length === 0 || !message.trim()) return;
        setQueueIndex(0);
        setStep('send');
    };

    const sendToCurrent = () => {
        if (!current) return;
        sendPromotionalMessageViaWhatsApp(current.phone!, message);
        setSentKeys(prev => new Set(prev).add(current.key));
        advance();
    };

    const advance = () => {
        if (queueIndex < queue.length - 1) setQueueIndex(i => i + 1);
        else setQueueIndex(i => i + 1); // moves past the end -> "done" screen
    };

    const isDone = step === 'send' && queueIndex >= queue.length;

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
            <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={handleClose} />
            <View style={[s.sheet, constrainSheetWidth && s.sheetWide]}>
                <View style={s.handle} />
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    {step === 'compose' && (
                        <>
                            <Text style={s.title}>📣 Message Lapsed Customers</Text>
                            <Text style={s.subtitle}>
                                WhatsApp opens one conversation at a time — write your message once, then tap Send for each customer in turn.
                            </Text>

                            <Text style={s.label}>Message</Text>
                            <TextInput
                                style={s.messageInput}
                                value={message}
                                onChangeText={setMessage}
                                multiline
                                numberOfLines={4}
                                placeholder="Type your message..."
                                placeholderTextColor={Colors.textMuted}
                            />

                            <Text style={s.label}>Select customers ({selectedKeys.size} of {reachable.length})</Text>
                            {reachable.length === 0 ? (
                                <Text style={s.emptyHint}>None of your lapsed customers have a phone number on file yet — add one via a sale's customer field ("Name | phone") to message them here.</Text>
                            ) : (
                                reachable.map(c => (
                                    <TouchableOpacity key={c.key} style={s.custRow} onPress={() => toggle(c.key)} activeOpacity={0.7}>
                                        <View style={[s.checkbox, selectedKeys.has(c.key) && s.checkboxChecked]}>
                                            {selectedKeys.has(c.key) && <Icon name="check" size={13} color="#fff" />}
                                        </View>
                                        <View style={s.flex1}>
                                            <Text style={s.custName}>{c.name}</Text>
                                            <Text style={s.custSub}>{c.daysSinceLastPurchase} days since last order · {c.phone}</Text>
                                        </View>
                                    </TouchableOpacity>
                                ))
                            )}
                            {unreachableCount > 0 && (
                                <Text style={s.emptyHint}>{unreachableCount} more lapsed customer{unreachableCount > 1 ? 's have' : ' has'} no phone number on file, so {unreachableCount > 1 ? "they aren't" : "it isn't"} listed above.</Text>
                            )}

                            <TouchableOpacity
                                style={[s.primaryBtn, (selectedKeys.size === 0 || !message.trim()) && s.primaryBtnDisabled]}
                                disabled={selectedKeys.size === 0 || !message.trim()}
                                onPress={startSending}
                            >
                                <Text style={s.primaryBtnText}>Start Sending ({selectedKeys.size}) →</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={s.cancelBtn} onPress={handleClose}>
                                <Text style={s.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                        </>
                    )}

                    {step === 'send' && !isDone && current && (
                        <>
                            <Text style={s.title}>Sending {queueIndex + 1} of {queue.length}</Text>
                            <View style={s.previewCard}>
                                <Text style={s.custName}>{current.name}</Text>
                                <Text style={s.custSub}>{current.phone}</Text>
                                <View style={s.divider} />
                                <Text style={s.messagePreview}>{message}</Text>
                            </View>
                            <TouchableOpacity style={s.primaryBtn} onPress={sendToCurrent}>
                                <Text style={s.primaryBtnText}>Send via WhatsApp →</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={s.cancelBtn} onPress={advance}>
                                <Text style={s.cancelBtnText}>Skip this customer</Text>
                            </TouchableOpacity>
                        </>
                    )}

                    {isDone && (
                        <>
                            <Text style={s.title}>✅ Done</Text>
                            <Text style={s.subtitle}>
                                Sent to {sentKeys.size} of {queue.length} customer{queue.length === 1 ? '' : 's'}{queue.length - sentKeys.size > 0 ? ` (${queue.length - sentKeys.size} skipped)` : ''}.
                            </Text>
                            <TouchableOpacity style={s.primaryBtn} onPress={handleClose}>
                                <Text style={s.primaryBtnText}>Close</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </ScrollView>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet: {
        backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
        padding: 20, maxHeight: '85%', position: 'absolute', left: 0, right: 0, bottom: 0, ...Shadow.lg,
    },
    sheetWide: { left: undefined, right: undefined, width: 480, maxWidth: 480, alignSelf: 'center', borderRadius: 20 },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 14 },

    title: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary, marginBottom: 6 },
    subtitle: { fontSize: 12.5, color: Colors.textMuted, marginBottom: 14, lineHeight: 18 },
    label: { fontSize: 12.5, fontWeight: '700', color: Colors.textSecondary, marginTop: 10, marginBottom: 8 },

    messageInput: {
        backgroundColor: Colors.bg, borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
        padding: 12, fontSize: 13.5, color: Colors.textPrimary, minHeight: 90, textAlignVertical: 'top',
    },

    custRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
    flex1: { flex: 1 },
    checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
    checkboxChecked: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    custName: { fontSize: 13.5, fontWeight: '700', color: Colors.textPrimary },
    custSub: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

    emptyHint: { fontSize: 11.5, color: Colors.textMuted, fontStyle: 'italic', marginTop: 4, marginBottom: 8, lineHeight: 16 },

    primaryBtn: { backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 16 },
    primaryBtnDisabled: { opacity: 0.4 },
    primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    cancelBtn: { paddingVertical: 12, alignItems: 'center' },
    cancelBtnText: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },

    previewCard: { backgroundColor: Colors.bg, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 14, marginTop: 8 },
    divider: { height: 1, backgroundColor: Colors.border, marginVertical: 10 },
    messagePreview: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
});
