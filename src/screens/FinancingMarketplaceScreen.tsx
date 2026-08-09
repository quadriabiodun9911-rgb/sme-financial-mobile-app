import React, { useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import Icon, { IconName } from '../components/ui/Icon';
import { computeRiskScore, computeDSCR, RiskScore } from '../utils/finance';
import { buildFinancingFitInput, rankFinancingProducts, FinancingFitResult, FinancingFitVerdict } from '../utils/financingFit';
import { SAMPLE_FINANCING_PRODUCTS } from '../utils/financingProducts';
import { FinancingProductType, LenderType } from '../types';

const VERDICT_STYLE: Record<FinancingFitVerdict, { label: string; color: string }> = {
    strong: { label: 'Strong fit', color: Colors.income },
    moderate: { label: 'Moderate fit', color: Colors.warning },
    weak: { label: 'Weak fit', color: '#fb923c' },
    not_eligible: { label: 'Not eligible yet', color: Colors.expense },
};

const PRODUCT_TYPE_LABEL: Record<FinancingProductType, string> = {
    asset_financing: 'Asset Financing',
    working_capital: 'Working Capital',
    invoice_financing: 'Invoice Financing',
    trade_finance: 'Trade Finance',
    term_loan: 'Term Loan',
    overdraft: 'Overdraft Facility',
};

const LENDER_TYPE_ICON: Record<LenderType, IconName> = {
    bank: 'credit-card',
    fintech: 'zap',
    dfi: 'globe',
    microfinance: 'users',
};

const LENDER_TYPE_LABEL: Record<LenderType, string> = {
    bank: 'Bank',
    fintech: 'Fintech Lender',
    dfi: 'Development Finance Institution',
    microfinance: 'Microfinance Bank',
};

function fmtAmt(currency: string, n: number): string {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `${currency}${(n / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${currency}${(n / 1_000).toFixed(0)}K`;
    return `${currency}${Math.round(n).toLocaleString()}`;
}

function CriterionRow({ label, status, businessValue, required, note }: { label: string; status: 'met' | 'unmet' | 'unknown'; businessValue: string; required: string; note?: string }) {
    const icon = status === 'met' ? '✓' : status === 'unmet' ? '⚠' : '?';
    const color = status === 'met' ? Colors.income : status === 'unmet' ? Colors.expense : Colors.textMuted;
    return (
        <View style={s.criterionRow}>
            <Text style={[s.criterionIcon, { color }]}>{icon}</Text>
            <View style={{ flex: 1 }}>
                <Text style={s.criterionLabel}>{label}</Text>
                <Text style={s.criterionDetail}>
                    You: <Text style={{ fontWeight: '700', color: Colors.textPrimary }}>{businessValue}</Text>  ·  Needs: {required}
                </Text>
                {note && <Text style={s.criterionNote}>{note}</Text>}
            </View>
        </View>
    );
}

function ProductCard({ result, currency, expanded, onToggle }: { result: FinancingFitResult; currency: string; expanded: boolean; onToggle: () => void }) {
    const { product } = result;
    const verdict = VERDICT_STYLE[result.verdict];
    return (
        <TouchableOpacity style={[s.productCard, { borderLeftColor: verdict.color }]} onPress={onToggle} activeOpacity={0.8}>
            <View style={s.productHeader}>
                <View style={s.productHeaderLeft}>
                    <Icon name={LENDER_TYPE_ICON[product.lenderType]} size={16} color={Colors.textMuted} />
                    <View style={{ marginLeft: 8, flex: 1 }}>
                        <Text style={s.productName}>{product.productName}</Text>
                        <Text style={s.productLender}>{product.lenderName} · {PRODUCT_TYPE_LABEL[product.productType]}</Text>
                    </View>
                </View>
                <View style={[s.fitBadge, { backgroundColor: verdict.color + '22' }]}>
                    <Text style={[s.fitBadgeScore, { color: verdict.color }]}>{result.verdict === 'not_eligible' ? '—' : `${result.fitScore}%`}</Text>
                    <Text style={[s.fitBadgeLabel, { color: verdict.color }]}>{verdict.label}</Text>
                </View>
            </View>

            <Text style={s.productDesc}>{product.description}</Text>
            <View style={s.productMetaRow}>
                <Text style={s.productMeta}>{fmtAmt(currency, product.minAmount)}–{fmtAmt(currency, product.maxAmount)}</Text>
                <Text style={s.productMeta}>{product.minTermMonths}–{product.maxTermMonths} mo</Text>
                <Text style={s.productMeta}>{product.interestRateMinPct}–{product.interestRateMaxPct}% p.a.</Text>
            </View>

            {expanded && (
                <View style={s.criteriaBox}>
                    <Text style={s.criteriaTitle}>Why this fit score</Text>
                    {result.criteria.map((c, i) => <CriterionRow key={i} {...c} />)}
                    {result.improvementTips.length > 0 && (
                        <View style={s.improveBox}>
                            <Text style={s.improveTitle}>To improve your fit</Text>
                            {result.improvementTips.map((t, i) => <Text key={i} style={s.improveTip}>• {t}</Text>)}
                        </View>
                    )}
                    {result.verdict === 'not_eligible' && (
                        <Text style={s.notEligibleNote}>
                            Current income doesn't fully cover existing debt obligations — build repayment headroom before taking on more, regardless of this product's individual criteria.
                        </Text>
                    )}
                </View>
            )}
            <Text style={s.tapHint}>{expanded ? 'Tap to collapse ▲' : 'Tap to see why ▼'}</Text>
        </TouchableOpacity>
    );
}

export default function FinancingMarketplaceScreen() {
    const { user, finance, transactions, loans, inventory, settings, navigate } = useApp();
    const { currency } = settings;
    const [amountText, setAmountText] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const risk: RiskScore = useMemo(() => computeRiskScore(finance, loans, transactions, inventory), [finance, loans, transactions, inventory]);
    const dscr = useMemo(() => computeDSCR(transactions, loans), [transactions, loans]);

    const requestedAmount = useMemo(() => {
        const n = parseFloat(amountText.replace(/[^0-9.]/g, ''));
        return isNaN(n) || n <= 0 ? undefined : n;
    }, [amountText]);

    const fitInput = useMemo(
        () => buildFinancingFitInput(transactions, loans, settings, user, requestedAmount),
        [transactions, loans, settings, user, requestedAmount],
    );

    const results = useMemo(
        () => rankFinancingProducts(SAMPLE_FINANCING_PRODUCTS, fitInput, currency),
        [fitInput, currency],
    );

    const READY_BAND: Record<RiskScore['band'], { label: string; color: string }> = {
        Excellent: { label: 'Excellent', color: Colors.income },
        Strong: { label: 'Strong', color: '#10b981' },
        Moderate: { label: 'Moderate', color: Colors.warning },
        Weak: { label: 'Weak', color: '#fb923c' },
        Critical: { label: 'Critical', color: Colors.expense },
    };
    const readyStyle = READY_BAND[risk.band];

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
                <TouchableOpacity onPress={() => navigate('dashboard')}>
                    <Text style={{ color: Colors.primary, fontSize: 14, marginBottom: 12 }}>← Dashboard</Text>
                </TouchableOpacity>

                <Text style={s.title}>🤝 Financing Marketplace</Text>
                <Text style={s.subtitle}>
                    See what financing your business is realistically suited for, and how it compares against what each lender is looking for.
                </Text>

                <View style={s.disclosureBox}>
                    <Text style={s.disclosureText}>
                        Sample marketplace — Quad360 doesn't have live lending partners yet. These are illustrative example listings that show how the fit-matching engine works once real lenders are onboarded. Fit scores are estimates based on published criteria and your recorded data — Quad360 does not make lending decisions, and no lender here is a real, currently-applyable offer.
                    </Text>
                </View>

                <View style={[s.readinessCard, { borderTopColor: readyStyle.color, borderTopWidth: 4 }]}>
                    <Text style={s.readinessLabel}>Financing Readiness</Text>
                    <Text style={[s.readinessScore, { color: readyStyle.color }]}>{Math.round(risk.score)}<Text style={s.readinessScoreOf}>/100</Text></Text>
                    <Text style={[s.readinessBand, { color: readyStyle.color }]}>{readyStyle.label}</Text>
                    <Text style={s.readinessDetail}>
                        Debt-service coverage: {dscr.dscr >= 900 ? 'No existing debt' : `${dscr.dscr.toFixed(2)}x`}
                        {dscr.dscr < 1 && ' — below 1x, existing income doesn\'t cover current debt payments yet.'}
                    </Text>
                </View>

                <View style={s.amountBox}>
                    <Text style={s.amountLabel}>How much financing do you need? (optional)</Text>
                    <TextInput
                        style={s.amountInput}
                        keyboardType="numeric"
                        placeholder={`e.g. 5000000`}
                        placeholderTextColor={Colors.textMuted}
                        value={amountText}
                        onChangeText={setAmountText}
                    />
                    <Text style={s.amountHint}>Narrows the fit score to also check whether each lender's amount range covers what you're asking for.</Text>
                </View>

                <Text style={s.sectionTitle}>{results.length} financing products ranked by fit</Text>

                {results.map(r => (
                    <ProductCard
                        key={r.product.id}
                        result={r}
                        currency={currency}
                        expanded={expandedId === r.product.id}
                        onToggle={() => setExpandedId(expandedId === r.product.id ? null : r.product.id)}
                    />
                ))}

                <View style={s.footerNote}>
                    <Text style={s.footerNoteText}>
                        Quad360 helps you understand what financing you're realistically suited for — it does not lend, guarantee approval, or make the lending decision. Each financial institution independently evaluates and approves any application.
                    </Text>
                </View>
            </ScrollView>
            <FooterNav />
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: 16, paddingBottom: 80 },
    title: { fontSize: 28, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
    subtitle: { fontSize: 14, color: Colors.textSecondary, marginBottom: 14, lineHeight: 19 },

    disclosureBox: { backgroundColor: Colors.warning + '15', borderRadius: 10, padding: 12, marginBottom: 18, borderWidth: 1, borderColor: Colors.warning + '40' },
    disclosureText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },

    readinessCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 16, alignItems: 'center' },
    readinessLabel: { fontSize: 13, color: Colors.textMuted, fontWeight: '700', marginBottom: 4 },
    readinessScore: { fontSize: 40, fontWeight: '800' },
    readinessScoreOf: { fontSize: 16, color: Colors.textMuted, fontWeight: '600' },
    readinessBand: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
    readinessDetail: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', lineHeight: 17 },

    amountBox: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 20 },
    amountLabel: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 },
    amountInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.textPrimary, backgroundColor: Colors.bg },
    amountHint: { fontSize: 11.5, color: Colors.textMuted, marginTop: 6, lineHeight: 16 },

    sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 10 },

    productCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 12, borderLeftWidth: 4 },
    productHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
    productHeaderLeft: { flexDirection: 'row', alignItems: 'flex-start', flex: 1, marginRight: 8 },
    productName: { fontSize: 14.5, fontWeight: '700', color: Colors.textPrimary },
    productLender: { fontSize: 11.5, color: Colors.textMuted, marginTop: 2 },
    fitBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', minWidth: 76 },
    fitBadgeScore: { fontSize: 16, fontWeight: '800' },
    fitBadgeLabel: { fontSize: 9.5, fontWeight: '700', marginTop: 1 },
    productDesc: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginBottom: 8 },
    productMetaRow: { flexDirection: 'row', gap: 14, marginBottom: 4 },
    productMeta: { fontSize: 11.5, color: Colors.textMuted, fontWeight: '600' },
    tapHint: { fontSize: 11, color: Colors.primary, marginTop: 6, textAlign: 'right' },

    criteriaBox: { marginTop: 10, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 },
    criteriaTitle: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 },
    criterionRow: { flexDirection: 'row', marginBottom: 9 },
    criterionIcon: { fontSize: 14, fontWeight: '800', width: 20 },
    criterionLabel: { fontSize: 12.5, fontWeight: '600', color: Colors.textPrimary },
    criterionDetail: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 1 },
    criterionNote: { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic', marginTop: 2, lineHeight: 15 },

    improveBox: { marginTop: 4, backgroundColor: Colors.bg, borderRadius: 8, padding: 10 },
    improveTitle: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, marginBottom: 5 },
    improveTip: { fontSize: 11.5, color: Colors.textSecondary, lineHeight: 16, marginBottom: 3 },

    notEligibleNote: { fontSize: 11.5, color: Colors.expense, marginTop: 6, lineHeight: 16 },

    footerNote: { marginTop: 8, marginBottom: 20 },
    footerNoteText: { fontSize: 11, color: Colors.textMuted, lineHeight: 16, textAlign: 'center' },
});
