import React, { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    Modal, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Colors } from '../theme/colors';
import { useApp } from '../contexts/AppContext';

interface Props {
    visible: boolean;
    onDone: () => void;
}

const WHAT_I_SELL = [
    'Food & drinks', 'Clothes & fashion', 'Electronics', 'Hair & beauty',
    'Transport', 'Building & repairs', 'Farming', 'Retail shop',
    'Phone & airtime', 'Education', 'Health & pharmacy', 'Other',
];

export default function FirstRunWizard({ visible, onDone }: Props) {
    const { addTransaction, settings } = useApp();
    const currency = settings.currency;

    const [step, setStep]         = useState(0);
    const [whatISell, setWhatISell] = useState('');
    const [income, setIncome]     = useState('');
    const [expense, setExpense]   = useState('');
    const [done, setDone]         = useState(false);

    const profit = (parseFloat(income) || 0) - (parseFloat(expense) || 0);
    const isProfit = profit >= 0;

    const handleFinish = () => {
        const today = new Date().toISOString().split('T')[0];
        const inc = parseFloat(income) || 0;
        const exp = parseFloat(expense) || 0;
        if (inc > 0) {
            addTransaction({
                type: 'income',
                amount: inc,
                description: `Money earned — ${whatISell || 'my business'}`,
                category: 'Sales',
                status: 'paid',
                date: today,
            } as any);
        }
        if (exp > 0) {
            addTransaction({
                type: 'expense',
                amount: exp,
                description: `Money spent — ${whatISell || 'my business'}`,
                category: 'Other',
                status: 'paid',
                date: today,
            } as any);
        }
        setDone(true);
    };

    const handleClose = () => {
        setStep(0);
        setWhatISell('');
        setIncome('');
        setExpense('');
        setDone(false);
        onDone();
    };

    return (
        <Modal visible={visible} animationType="slide" statusBarTranslucent>
            <KeyboardAvoidingView
                style={styles.root}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

                    {/* ── Done / celebration screen ─────────────────────────── */}
                    {done ? (
                        <View style={styles.celebrationBox}>
                            <Text style={styles.celebEmoji}>{isProfit ? '🎉' : '📋'}</Text>
                            <Text style={styles.celebTitle}>
                                {isProfit
                                    ? `You made ${currency}${profit.toLocaleString()} profit!`
                                    : `You spent ${currency}${Math.abs(profit).toLocaleString()} more than you earned`}
                            </Text>
                            <Text style={styles.celebSub}>
                                {isProfit
                                    ? "That's your starting point. Every day you log, this picture gets clearer."
                                    : "That's okay — now you know. Use the app every day to spot where to cut costs."}
                            </Text>
                            <View style={styles.celebStats}>
                                <View style={styles.celebStat}>
                                    <Text style={styles.celebStatLabel}>Money In</Text>
                                    <Text style={[styles.celebStatVal, { color: Colors.income }]}>{currency}{(parseFloat(income)||0).toLocaleString()}</Text>
                                </View>
                                <View style={styles.celebStatDiv} />
                                <View style={styles.celebStat}>
                                    <Text style={styles.celebStatLabel}>Money Out</Text>
                                    <Text style={[styles.celebStatVal, { color: Colors.expense }]}>{currency}{(parseFloat(expense)||0).toLocaleString()}</Text>
                                </View>
                                <View style={styles.celebStatDiv} />
                                <View style={styles.celebStat}>
                                    <Text style={styles.celebStatLabel}>{isProfit ? 'Profit' : 'Loss'}</Text>
                                    <Text style={[styles.celebStatVal, { color: isProfit ? Colors.income : Colors.expense }]}>
                                        {isProfit ? '+' : '-'}{currency}{Math.abs(profit).toLocaleString()}
                                    </Text>
                                </View>
                            </View>
                            <TouchableOpacity style={styles.primaryBtn} onPress={handleClose}>
                                <Text style={styles.primaryBtnText}>Go to my dashboard →</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <>
                            {/* ── Progress dots ─────────────────────────────── */}
                            <View style={styles.dots}>
                                {[0, 1, 2].map(i => (
                                    <View key={i} style={[styles.dot, step === i && styles.dotActive]} />
                                ))}
                            </View>

                            {/* ── Step 0: What do you sell? ─────────────────── */}
                            {step === 0 && (
                                <View style={styles.stepBox}>
                                    <Text style={styles.stepEmoji}>👋</Text>
                                    <Text style={styles.stepTitle}>Welcome! What does your business sell or do?</Text>
                                    <Text style={styles.stepSub}>Tap the one that fits you best</Text>
                                    <View style={styles.grid}>
                                        {WHAT_I_SELL.map(opt => (
                                            <TouchableOpacity
                                                key={opt}
                                                style={[styles.gridBtn, whatISell === opt && styles.gridBtnActive]}
                                                onPress={() => setWhatISell(opt)}
                                            >
                                                <Text style={[styles.gridBtnText, whatISell === opt && styles.gridBtnTextActive]}>{opt}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                    {whatISell === 'Other' && (
                                        <TextInput
                                            style={styles.input}
                                            placeholder="Tell us what you do..."
                                            placeholderTextColor={Colors.textMuted}
                                            onChangeText={v => setWhatISell(v || 'Other')}
                                        />
                                    )}
                                    <TouchableOpacity
                                        style={[styles.primaryBtn, !whatISell && styles.primaryBtnDisabled]}
                                        onPress={() => whatISell && setStep(1)}
                                    >
                                        <Text style={styles.primaryBtnText}>Next →</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.skipBtn} onPress={() => setStep(1)}>
                                        <Text style={styles.skipText}>Skip this</Text>
                                    </TouchableOpacity>
                                </View>
                            )}

                            {/* ── Step 1: Money IN this week ────────────────── */}
                            {step === 1 && (
                                <View style={styles.stepBox}>
                                    <Text style={styles.stepEmoji}>💰</Text>
                                    <Text style={styles.stepTitle}>How much money came IN this week?</Text>
                                    <Text style={styles.stepSub}>
                                        Everything you received — sales, payments, transfers from customers
                                    </Text>
                                    <TextInput
                                        style={[styles.input, styles.bigInput]}
                                        placeholder={`0`}
                                        placeholderTextColor={Colors.textMuted}
                                        keyboardType="decimal-pad"
                                        value={income}
                                        onChangeText={setIncome}
                                        autoFocus
                                    />
                                    <Text style={styles.currencyHint}>{currency} — enter numbers only, e.g. 5000</Text>
                                    <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep(2)}>
                                        <Text style={styles.primaryBtnText}>Next →</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.skipBtn} onPress={() => setStep(2)}>
                                        <Text style={styles.skipText}>Skip — I'll add it later</Text>
                                    </TouchableOpacity>
                                </View>
                            )}

                            {/* ── Step 2: Money OUT this week ───────────────── */}
                            {step === 2 && (
                                <View style={styles.stepBox}>
                                    <Text style={styles.stepEmoji}>💸</Text>
                                    <Text style={styles.stepTitle}>How much did you SPEND this week?</Text>
                                    <Text style={styles.stepSub}>
                                        Everything you paid out — rent, stock, transport, food for the business
                                    </Text>
                                    <TextInput
                                        style={[styles.input, styles.bigInput]}
                                        placeholder={`0`}
                                        placeholderTextColor={Colors.textMuted}
                                        keyboardType="decimal-pad"
                                        value={expense}
                                        onChangeText={setExpense}
                                        autoFocus
                                    />
                                    <Text style={styles.currencyHint}>{currency} — enter numbers only, e.g. 3000</Text>
                                    <TouchableOpacity style={styles.primaryBtn} onPress={handleFinish}>
                                        <Text style={styles.primaryBtnText}>Show me my profit →</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.skipBtn} onPress={handleFinish}>
                                        <Text style={styles.skipText}>Skip — nothing spent this week</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    root:   { flex: 1, backgroundColor: Colors.bg },
    scroll: { flexGrow: 1, padding: 24, paddingTop: 60, justifyContent: 'center' },

    dots:      { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 32 },
    dot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.border },
    dotActive: { backgroundColor: Colors.primary, width: 24 },

    stepBox:   { alignItems: 'center' },
    stepEmoji: { fontSize: 52, marginBottom: 16 },
    stepTitle: { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary, textAlign: 'center', marginBottom: 8, lineHeight: 30 },
    stepSub:   { fontSize: 14, color: Colors.textMuted, textAlign: 'center', marginBottom: 24, lineHeight: 20 },

    grid:           { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginBottom: 20, width: '100%' },
    gridBtn:        { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface },
    gridBtnActive:  { borderColor: Colors.primary, backgroundColor: 'rgba(0,102,204,0.12)' },
    gridBtnText:    { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
    gridBtnTextActive: { color: Colors.primary, fontWeight: '700' },

    input:        { width: '100%', backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, color: Colors.textPrimary, fontSize: 16, marginBottom: 8 },
    bigInput:     { fontSize: 32, fontWeight: 'bold', textAlign: 'center', paddingVertical: 20 },
    currencyHint: { fontSize: 12, color: Colors.textMuted, marginBottom: 24 },

    primaryBtn:         { width: '100%', backgroundColor: Colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12 },
    primaryBtnDisabled: { opacity: 0.4 },
    primaryBtnText:     { color: '#fff', fontWeight: 'bold', fontSize: 16 },
    skipBtn:            { paddingVertical: 10 },
    skipText:           { color: Colors.textMuted, fontSize: 13 },

    celebrationBox: { alignItems: 'center', paddingTop: 20 },
    celebEmoji:     { fontSize: 72, marginBottom: 20 },
    celebTitle:     { fontSize: 26, fontWeight: 'bold', color: Colors.textPrimary, textAlign: 'center', marginBottom: 10, lineHeight: 34 },
    celebSub:       { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 21, marginBottom: 30 },
    celebStats:     { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: 14, padding: 18, width: '100%', marginBottom: 30 },
    celebStat:      { flex: 1, alignItems: 'center' },
    celebStatDiv:   { width: 1, backgroundColor: Colors.border },
    celebStatLabel: { fontSize: 11, color: Colors.textMuted, marginBottom: 4 },
    celebStatVal:   { fontSize: 16, fontWeight: 'bold' },
});
