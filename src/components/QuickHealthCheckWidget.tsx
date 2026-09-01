/**
 * The landing page's 60-second, no-signup teaser -- three numbers a
 * business owner already knows by heart, in exchange for an instant,
 * genuine PARTIAL Business Health Score (see quickHealthCheck.ts: the
 * same Profitability/Liquidity scoring functions and weights the real
 * 8-factor score uses, just renormalized over those 2 alone). Entirely
 * self-contained: no navigation, no network call, nothing persisted --
 * the numbers never leave this component, so "your data stays private"
 * is literally true here, not just marketing copy.
 *
 * Always labeled as partial -- 2 of 8 real factors -- and always tells the
 * visitor what closes the gap: uploading a bank statement or connecting
 * real transaction history inside the product, which is what the other 6
 * factors (Working Capital, Debt, Efficiency, Inventory, Concentration,
 * Operating Cash Flow) genuinely require.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import Icon from './ui/Icon';
import { RiskScore } from '../utils/finance';
import { computeQuickHealthCheck, QuickHealthCheckResult } from '../utils/quickHealthCheck';

// Same band->color convention every other score-band screen in the app
// defines locally (Colors are theme-dependent, so this isn't shared from
// finance.ts -- see RISK_BAND_STYLE's own doc comment there).
const BAND_COLOR: Record<RiskScore['band'], string> = {
    Excellent: Colors.income,
    Strong: '#10b981',
    Moderate: Colors.warning,
    Weak: '#fb923c',
    Critical: Colors.expense,
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

function formatMonths(months: number): string {
    return Number.isFinite(months) ? `${months.toFixed(1)} mo` : 'No burn';
}

export default function QuickHealthCheckWidget({ onWantFullPicture, onTryDemo, isWide }: Props) {
    const [revenueText, setRevenueText] = useState('');
    const [expensesText, setExpensesText] = useState('');
    const [cashText, setCashText] = useState('');
    const [result, setResult] = useState<QuickHealthCheckResult | null>(null);
    const [stressOpen, setStressOpen] = useState(false);

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
        setStressOpen(false);
    };

    if (result) {
        return (
            <View style={[s.card, isWide && s.cardWide]}>
                <Text style={s.resultEyebrow}>YOUR 60-SECOND SNAPSHOT</Text>

                <View style={s.resultRow}>
                    <Text style={s.resultIcon}>📈</Text>
                    <View style={[s.resultRowBody, isWide && s.wideTextCap]}>
                        <Text style={s.resultLabel}>Partial Business Health Score</Text>
                        <View style={s.scoreLine}>
                            <Text style={[s.resultValue, { color: BAND_COLOR[result.partialBand] }]}>{result.partialScore}/100</Text>
                            <View style={[s.riskPill, { borderColor: BAND_COLOR[result.partialBand] }]}>
                                <Text style={[s.riskPillText, { color: BAND_COLOR[result.partialBand] }]}>{result.partialBand}</Text>
                            </View>
                        </View>
                        <Text style={s.resultSub}>
                            Built from 2 of the 8 real factors — Profitability and Liquidity. The other 6
                            (Working Capital, Debt, Efficiency, Inventory, Concentration, Operating Cash Flow)
                            need real transaction history to score.
                        </Text>
                    </View>
                </View>

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

                        <Text style={s.detailLabel}>Full details</Text>
                        <Text style={[s.resultSub, isWide && s.wideTextCap]}>{result.fullDetail}</Text>

                        <TouchableOpacity style={s.stressToggleBtn} onPress={() => setStressOpen(o => !o)}>
                            <Text style={s.stressToggleText}>🧪 Stress-test this</Text>
                            <Text style={s.stressToggleText}>{stressOpen ? '▲' : '▼'}</Text>
                        </TouchableOpacity>
                        {stressOpen && (
                            <View style={s.stressBox}>
                                <Text style={s.stressBoxTitle}>How long would your cash last under pressure?</Text>
                                {result.stressScenarios.map(sc => (
                                    <View key={sc.key} style={s.scenarioRow}>
                                        <Text style={s.scenarioLabel}>{sc.label}</Text>
                                        <Text style={s.scenarioValue}>{formatMonths(sc.runwayMonths)}</Text>
                                    </View>
                                ))}
                                <Text style={[s.resultSub, { marginTop: 8 }]}>{result.stressNarrative}</Text>

                                <Text style={[s.stressBoxTitle, { marginTop: 14 }]}>What would improve your runway?</Text>
                                {result.runwayLevers.map((lever, i) => (
                                    <View key={i} style={s.scenarioRow}>
                                        <Text style={s.scenarioLabel}>{lever.label}</Text>
                                        <Text style={[s.scenarioValue, { color: Colors.income }]}>→ {formatMonths(lever.runwayMonths)}</Text>
                                    </View>
                                ))}
                            </View>
                        )}
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
                    <Text style={s.upsellTitle}>Get your full Business Health Score</Text>
                    <Text style={[s.upsellText, isWide && s.wideTextCap]}>
                        This is a partial score from just two numbers. Upload your bank statement or connect your
                        transactions inside Quad360 to score all 8 factors — including the ones that need real
                        history, like debt coverage and inventory turnover — for a full diagnosis and exactly what
                        to do next.
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

    detailLabel: { fontSize: 10.5, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 8, marginBottom: 3 },
    stressToggleBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.border },
    stressToggleText: { fontSize: 11.5, fontWeight: '700', color: Colors.primary },
    stressBox: { backgroundColor: Colors.bg, borderRadius: Radius.md, padding: Spacing.sm, marginTop: 8 },
    stressBoxTitle: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6 },
    scenarioRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: Colors.border },
    scenarioLabel: { fontSize: 12, color: Colors.textSecondary },
    scenarioValue: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary },

    scoreLine: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 3 },
    riskPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
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
