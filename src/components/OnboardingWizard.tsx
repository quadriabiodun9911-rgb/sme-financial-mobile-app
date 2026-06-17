import React, { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity,
    StyleSheet, Modal, ScrollView,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';

interface Props {
    visible: boolean;
    onDone: () => void;
}

export default function OnboardingWizard({ visible, onDone }: Props) {
    const { addTransaction, settings, user } = useApp();
    const [step, setStep] = useState(0);
    const [txType, setTxType] = useState<'income' | 'expense'>('income');
    const [amount, setAmount] = useState('');
    const [desc, setDesc] = useState('');
    const currency = settings.currency;

    const handleAddTransaction = () => {
        const amt = parseFloat(amount);
        if (!amt || amt <= 0 || !desc.trim()) return;
        addTransaction({
            type: txType,
            amount: amt,
            description: desc.trim(),
            category: txType === 'income' ? 'Sales' : 'General',
            status: 'paid',
        });
        setStep(2);
    };

    const steps = [
        {
            emoji: '👋',
            title: `Welcome, ${user?.businessName ?? 'there'}!`,
            subtitle: 'Quad360 gives you a complete picture of your business finances. Let\'s set up your first transaction in 60 seconds.',
            cta: 'Get Started →',
            onCta: () => setStep(1),
            skip: true,
        },
        {
            emoji: '💰',
            title: 'Add your first transaction',
            subtitle: 'Record any recent sale or expense to see your dashboard come alive with real numbers.',
            cta: 'Add Transaction',
            onCta: handleAddTransaction,
            skip: true,
        },
        {
            emoji: '🎉',
            title: 'Your dashboard is live!',
            subtitle: 'You can now see your cash flow and profit updating in real time. Keep recording every transaction to get the full picture.',
            cta: 'Go to Dashboard →',
            onCta: onDone,
            skip: false,
        },
    ];

    const current = steps[step];

    return (
        <Modal visible={visible} animationType="fade" transparent>
            <View style={styles.overlay}>
                <View style={styles.card}>
                    {/* Progress dots */}
                    <View style={styles.dots}>
                        {steps.map((_, i) => (
                            <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
                        ))}
                    </View>

                    <Text style={styles.emoji}>{current.emoji}</Text>
                    <Text style={styles.title}>{current.title}</Text>
                    <Text style={styles.subtitle}>{current.subtitle}</Text>

                    {/* Step 1 — transaction form */}
                    {step === 1 && (
                        <View style={styles.form}>
                            <View style={styles.typeRow}>
                                {(['income', 'expense'] as const).map(t => (
                                    <TouchableOpacity
                                        key={t}
                                        style={[styles.typeBtn, txType === t && (t === 'income' ? styles.typeBtnIncome : styles.typeBtnExpense)]}
                                        onPress={() => setTxType(t)}
                                    >
                                        <Text style={[styles.typeBtnText, txType === t && styles.typeBtnTextActive]}>
                                            {t === 'income' ? '💚 Income' : '🔴 Expense'}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <TextInput
                                style={styles.input}
                                placeholder={`Amount (${currency})`}
                                placeholderTextColor={Colors.textMuted}
                                keyboardType="numeric"
                                value={amount}
                                onChangeText={setAmount}
                            />
                            <TextInput
                                style={styles.input}
                                placeholder="Description (e.g. Product sale, Rent)"
                                placeholderTextColor={Colors.textMuted}
                                value={desc}
                                onChangeText={setDesc}
                            />
                        </View>
                    )}

                    <TouchableOpacity
                        style={[styles.cta, step === 1 && (!amount || !desc.trim()) && styles.ctaDisabled]}
                        onPress={current.onCta}
                        disabled={step === 1 && (!amount || !desc.trim())}
                    >
                        <Text style={styles.ctaText}>{current.cta}</Text>
                    </TouchableOpacity>

                    {current.skip && (
                        <TouchableOpacity onPress={onDone} style={styles.skip}>
                            <Text style={styles.skipText}>Skip for now</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    card: { backgroundColor: Colors.surface, borderRadius: 20, padding: 28, width: '100%', maxWidth: 400, alignItems: 'center' },
    dots: { flexDirection: 'row', gap: 6, marginBottom: 20 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.border },
    dotActive: { backgroundColor: Colors.primary, width: 24 },
    emoji: { fontSize: 48, marginBottom: 12 },
    title: { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary, textAlign: 'center', marginBottom: 8 },
    subtitle: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
    form: { width: '100%', marginBottom: 8 },
    typeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    typeBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
    typeBtnIncome: { backgroundColor: '#14532d', borderColor: Colors.income },
    typeBtnExpense: { backgroundColor: '#7f1d1d', borderColor: Colors.expense },
    typeBtnText: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
    typeBtnTextActive: { color: Colors.textPrimary },
    input: {
        backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border,
        borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
        color: Colors.textPrimary, fontSize: 14, marginBottom: 10, width: '100%',
    },
    cta: { backgroundColor: Colors.primary, paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, width: '100%', alignItems: 'center', marginTop: 8 },
    ctaDisabled: { opacity: 0.4 },
    ctaText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 15 },
    skip: { marginTop: 12, padding: 8 },
    skipText: { color: Colors.textMuted, fontSize: 13 },
});
