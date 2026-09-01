/**
 * The landing page's 60-second, no-signup teaser -- three numbers a
 * business owner already knows by heart, in exchange for an instant,
 * honest preliminary read (see quickHealthCheck.ts for exactly what that
 * is and isn't). Entirely self-contained: no navigation, no network call,
 * nothing persisted -- the numbers never leave this component, so "your
 * data stays private" is literally true here, not just marketing copy.
 *
 * Deliberately doesn't show a 0-100 score of any kind -- the real
 * Business Health Score and Financing Readiness Score both need 8
 * weighted factors from real transaction history, which three numbers
 * typed into a landing page can't honestly support. What it shows instead
 * is exactly what those three numbers alone can prove: a cash runway, a
 * risk band, and a plainly-caveated financing preview -- then hands off
 * to the real product for anything deeper.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import Icon from './ui/Icon';
import { computeQuickHealthCheck, QuickHealthCheckResult, QuickRiskStatus } from '../utils/quickHealthCheck';

const RISK_COLOR: Record<QuickRiskStatus, string> = {
    green: Colors.income,
    yellow: Colors.warning,
    red: Colors.expense,
};

interface Props {
    onWantFullPicture: () => void;
    onTryDemo: () => void;
    // Wide-viewport layout -- the card grows and the 3 fields sit in a row
    // instead of stacking, so the widget actually uses the extra hero
    // width on desktop/laptop instead of leaving it empty beside a narrow
    // fixed-width card. Passed down from LandingScreen's own `isWide`
    // (width >= 900), the same breakpoint the rest of the hero already
    // keys off, rather than a second independently-tuned breakpoint here.
    isWide?: boolean;
}

function parseAmount(text: string): number | null {
    if (text.trim() === '') return null;
    const n = Number(text.replace(/,/g, ''));
    return Number.isFinite(n) && n >= 0 ? n : null;
}

export default function QuickHealthCheckWidget({ onWantFullPicture, onTryDemo, isWide }: Props) {
    const [revenueText, setRevenueText] = useState('');
    const [expensesText, setExpensesText] = useState('');
    const [cashText, setCashText] = useState('');
    const [result, setResult] = useState<QuickHealthCheckResult | null>(null);

    const revenue = parseAmount(revenueText);
    const expenses = parseAmount(expensesText);
    const cash = parseAmount(cashText);
    const canGenerate = revenue !== null && expenses !== null && cash !== null;

    const handleGenerate = () => {
        if (!canGenerate) return;
        setResult(computeQuickHealthCheck({ lastMonthRevenue: revenue!, monthlyExpenses: expenses!, cashInBank: cash! }));
    };

    const handleReset = () => {
        setResult(null);
    };

    if (result) {
        return (
            <View style={[s.card, isWide && s.cardWide]}>
                <Text style={s.resultEyebrow}>YOUR 60-SECOND SNAPSHOT</Text>

                <View style={s.resultRow}>
                    <Text style={s.resultIcon}>💰</Text>
                    <View style={[s.resultRowBody, isWide && s.wideTextCap]}>
                        <Text style={s.resultLabel}>Your True Cash Runway</Text>
                        <Text style={s.resultValue}>
                            {Number.isFinite(result.runwayMonths)
                                ? `${result.runwayMonths.toFixed(1)} month${result.runwayMonths === 1 ? '' : 's'}`
                                : 'No burn right now'}
                        </Text>
                        <Text style={s.resultSub}>
                            {Number.isFinite(result.runwayMonths)
                                ? 'How long your business could operate if revenue stopped today.'
                                : 'Revenue currently covers expenses, so there\'s no active burn to project against.'}
                        </Text>
                    </View>
                </View>

                <View style={s.resultRow}>
                    <Text style={s.resultIcon}>🚦</Text>
                    <View style={[s.resultRowBody, isWide && s.wideTextCap]}>
                        <Text style={s.resultLabel}>Cash Risk Status</Text>
                        <View style={[s.riskPill, { borderColor: RISK_COLOR[result.riskStatus] }]}>
                            <View style={[s.riskDot, { backgroundColor: RISK_COLOR[result.riskStatus] }]} />
                            <Text style={[s.riskPillText, { color: RISK_COLOR[result.riskStatus] }]}>{result.riskLabel}</Text>
                        </View>
                    </View>
                </View>

                <View style={s.resultRow}>
                    <Text style={s.resultIcon}>📊</Text>
                    <View style={[s.resultRowBody, isWide && s.wideTextCap]}>
                        <Text style={s.resultLabel}>What's Driving This</Text>
                        <Text style={s.resultSub}>{result.diagnosis}</Text>
                    </View>
                </View>

                <View style={s.resultRow}>
                    <Text style={s.resultIcon}>🏦</Text>
                    <View style={[s.resultRowBody, isWide && s.wideTextCap]}>
                        <Text style={s.resultLabel}>Financing Readiness Preview</Text>
                        <Text style={s.resultSub}>{result.financingPreview}</Text>
                        <Text style={s.disclaimer}>Not a loan approval. Not a credit decision — a starting point for understanding what you may need to improve.</Text>
                    </View>
                </View>

                <View style={s.upsellBox}>
                    <Text style={s.upsellTitle}>Want the full picture?</Text>
                    <Text style={[s.upsellText, isWide && s.wideTextCap]}>
                        This snapshot is built from three numbers. Quad360's real Business Health and Financing
                        Readiness scores connect your actual transaction history for a full diagnosis — what's
                        driving it, and exactly what to do next.
                    </Text>
                    <View style={s.upsellBtnRow}>
                        <TouchableOpacity onPress={onWantFullPicture} style={s.upsellPrimaryBtn}>
                            <Text style={s.upsellPrimaryText}>Get My Full Health Score →</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={onTryDemo} style={s.upsellSecondaryBtn}>
                            <Text style={s.upsellSecondaryText}>Try Guest Demo</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <TouchableOpacity onPress={handleReset} style={s.tryAgainBtn}>
                    <Text style={s.tryAgainText}>← Check different numbers</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={[s.card, isWide && s.cardWide]}>
            <View style={s.cardHeader}>
                <Icon name="activity" size={18} color={Colors.primary} />
                <Text style={s.cardTitle}>Check Your Business Health — Free</Text>
            </View>
            <Text style={s.cardSub}>Get an instant snapshot using just three numbers you already know.</Text>

            <View style={[s.fieldsWrap, isWide && s.fieldsWrapWide]}>
                <View style={[s.field, isWide && s.fieldWide]}>
                    <Text style={s.fieldLabel}>Last Month's Revenue</Text>
                    <TextInput
                        style={s.input}
                        value={revenueText}
                        onChangeText={setRevenueText}
                        placeholder="e.g. 45,000"
                        placeholderTextColor={Colors.textMuted}
                        keyboardType="decimal-pad"
                    />
                </View>
                <View style={[s.field, isWide && s.fieldWide]}>
                    <Text style={s.fieldLabel}>Monthly Expenses</Text>
                    <TextInput
                        style={s.input}
                        value={expensesText}
                        onChangeText={setExpensesText}
                        placeholder="e.g. 38,000"
                        placeholderTextColor={Colors.textMuted}
                        keyboardType="decimal-pad"
                    />
                </View>
                <View style={[s.field, isWide && s.fieldWide]}>
                    <Text style={s.fieldLabel}>Cash Currently in Bank</Text>
                    <TextInput
                        style={s.input}
                        value={cashText}
                        onChangeText={setCashText}
                        placeholder="e.g. 120,000"
                        placeholderTextColor={Colors.textMuted}
                        keyboardType="decimal-pad"
                    />
                </View>
            </View>

            <TouchableOpacity
                onPress={handleGenerate}
                disabled={!canGenerate}
                style={[s.generateBtn, !canGenerate && s.generateBtnDisabled]}
            >
                <Text style={s.generateBtnText}>Generate My Health Score →</Text>
            </TouchableOpacity>

            <Text style={s.reassurance}>No bank connection required  •  Takes less than 60 seconds  •  Your data stays private</Text>
        </View>
    );
}

const s = StyleSheet.create({
    card: {
        backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
        padding: Spacing.lg, width: '100%', maxWidth: 460, ...Shadow.lg,
    },
    // Grows the card and (via fieldsWrapWide/fieldWide below) lays the 3
    // fields out in a row instead of stacking -- so the extra width is
    // actually used by the form, not just a wider empty box. Capped at
    // 720, not the hero's full ~1180 max, so the card still reads as a
    // form and not an oddly sparse full-width panel.
    cardWide: { maxWidth: 720 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    cardTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
    cardSub: { fontSize: 12.5, color: Colors.textMuted, marginBottom: Spacing.md, lineHeight: 18 },

    fieldsWrap: { width: '100%' },
    fieldsWrapWide: { flexDirection: 'row', gap: Spacing.md },
    field: { marginBottom: Spacing.sm },
    fieldWide: { flex: 1, marginBottom: 0 },
    fieldLabel: { fontSize: 11.5, fontWeight: '700', color: Colors.textSecondary, marginBottom: 5 },
    input: {
        borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 11,
        fontSize: 14, color: Colors.textPrimary, backgroundColor: Colors.bg,
    },

    generateBtn: { backgroundColor: Colors.primary, borderRadius: Radius.pill, paddingVertical: 14, alignItems: 'center', marginTop: Spacing.sm, ...Shadow.sm },
    generateBtnDisabled: { opacity: 0.45 },
    generateBtnText: { color: '#fff', fontWeight: '800', fontSize: 14.5 },

    reassurance: { fontSize: 10.5, color: Colors.textMuted, textAlign: 'center', marginTop: 10 },

    resultEyebrow: { fontSize: 10.5, fontWeight: '700', color: Colors.primary, letterSpacing: 0.6, marginBottom: 14 },
    resultRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
    resultIcon: { fontSize: 20, lineHeight: 24 },
    resultRowBody: { flex: 1 },
    // Caps paragraph line length on the widened wide-viewport card --
    // without this, a 720px-wide card would stretch these sentences to an
    // uncomfortable reading width instead of just filling the frame.
    wideTextCap: { maxWidth: 560 },
    resultLabel: { fontSize: 11.5, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 },
    resultValue: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, marginBottom: 3 },
    resultSub: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },

    riskPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
    riskDot: { width: 7, height: 7, borderRadius: 4 },
    riskPillText: { fontSize: 12.5, fontWeight: '800' },

    disclaimer: { fontSize: 10.5, color: Colors.textMuted, fontStyle: 'italic', marginTop: 5, lineHeight: 15 },

    upsellBox: { backgroundColor: Colors.bg, borderRadius: Radius.md, padding: Spacing.md, marginTop: 4, marginBottom: Spacing.sm },
    upsellTitle: { fontSize: 13.5, fontWeight: '800', color: Colors.textPrimary, marginBottom: 5 },
    upsellText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginBottom: 12 },
    upsellBtnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    upsellPrimaryBtn: { backgroundColor: Colors.primary, borderRadius: Radius.pill, paddingHorizontal: 18, paddingVertical: 11 },
    upsellPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 12.5 },
    upsellSecondaryBtn: { borderRadius: Radius.pill, paddingHorizontal: 18, paddingVertical: 11, borderWidth: 1, borderColor: Colors.border },
    upsellSecondaryText: { color: Colors.textPrimary, fontWeight: '700', fontSize: 12.5 },

    tryAgainBtn: { alignItems: 'center', paddingVertical: 6 },
    tryAgainText: { color: Colors.primary, fontWeight: '700', fontSize: 12 },
});
