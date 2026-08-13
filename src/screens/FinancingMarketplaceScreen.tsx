import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import Icon, { IconName } from '../components/ui/Icon';
import { computeRiskScore, computeDSCR, RiskScore } from '../utils/finance';
import { buildFinancingFitInput, rankFinancingProducts, FinancingFitResult, FinancingFitVerdict } from '../utils/financingFit';
import { computeLendingCapacityEstimate } from '../utils/lendingCapacity';
import { computeReadinessDelta } from '../utils/readinessHistory';
import { computeDataQuality } from '../utils/dataQuality';
import { computeInventoryValue } from '../utils/stockVelocity';
import { SAMPLE_FINANCING_PRODUCTS } from '../utils/financingProducts';
import { loadActiveFinancingProducts } from '../utils/financingAdmin';
import { bandRevenue, loadMyPipelineListings, publishPipelineListing, revokePipelineListing } from '../utils/financingPipeline';
import { FinancingProduct, FinancingProductType, LenderType, PipelineListing } from '../types';

const INDUSTRY_LABEL: Record<string, string> = {
    general: 'General Business',
    retail: 'Retail',
    'food-service': 'Food Service',
    manufacturing: 'Manufacturing',
    'professional-services': 'Professional Services',
};

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
                            <Text style={s.improveTitle}>What would close the gap</Text>
                            {result.improvementTips.map((t, i) => <Text key={i} style={s.improveTip}>• {t}</Text>)}
                            <Text style={s.improveFootnote}>Fit updates automatically the next time you record transactions — no need to recheck manually.</Text>
                        </View>
                    )}
                    {result.verdict === 'not_eligible' && (
                        <Text style={s.notEligibleNote}>
                            Current income doesn't fully cover existing debt obligations — build repayment headroom before taking on more, regardless of this product's individual criteria.
                        </Text>
                    )}
                    {result.economicNote && (
                        <View style={s.economicBox}>
                            <Text style={s.economicTitle}>📊 Worth weighing</Text>
                            <Text style={s.economicNoteText}>{result.economicNote}</Text>
                        </View>
                    )}
                </View>
            )}
            <Text style={s.tapHint}>{expanded ? 'Tap to collapse ▲' : 'Tap to see why ▼'}</Text>
        </TouchableOpacity>
    );
}

export default function FinancingMarketplaceScreen() {
    const { user, finance, transactions, loans, inventory, settings, navigate, readinessHistory, userRole } = useApp();
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

    // Right-sizing: what the business could realistically support, computed
    // the same way Credit-Worthiness's Estimated Lending Capacity is, so a
    // requested amount is checked against actual repayment capacity -- not
    // just whether some lender's range happens to cover it. A marketplace
    // has no incentive to volunteer this; Quad360 does.
    const dataQuality = useMemo(() => computeDataQuality(transactions), [transactions]);
    const inventoryValue = useMemo(() => computeInventoryValue(inventory), [inventory]);
    const lendingCapacity = useMemo(() => computeLendingCapacityEstimate({
        overallCreditScore: risk.score,
        avgMonthlyRevenue: fitInput.avgMonthlyRevenue,
        dscr: dscr.dscr,
        hasReliableData: dataQuality.confidence !== 'none' && dataQuality.confidence !== 'limited',
        inventoryValue,
    }), [risk.score, fitInput.avgMonthlyRevenue, dscr.dscr, dataQuality.confidence, inventoryValue]);

    // A single-point score tells a lender nothing about direction -- this is
    // the same trend Credit-Worthiness shows in full, condensed to one line
    // for the context lenders actually care about: is this business getting
    // more or less financeable.
    const readinessDelta = useMemo(() => computeReadinessDelta(readinessHistory), [readinessHistory]);

    // Real, admin-managed listings replace the illustrative sample list the
    // moment there's at least one -- this is the switch from "demo" to a
    // genuine marketplace. Falls back to the sample list on any failure
    // (offline, table not yet created) rather than showing a blank screen.
    const [liveProducts, setLiveProducts] = useState<FinancingProduct[] | null>(null);
    useEffect(() => {
        let cancelled = false;
        loadActiveFinancingProducts().then(products => {
            if (!cancelled) setLiveProducts(products);
        });
        return () => { cancelled = true; };
    }, []);
    const usingLiveProducts = !!liveProducts && liveProducts.length > 0;
    const productSource = usingLiveProducts ? liveProducts! : SAMPLE_FINANCING_PRODUCTS;

    const results = useMemo(
        () => rankFinancingProducts(productSource, fitInput, currency),
        [productSource, fitInput, currency],
    );

    // ─── Be Visible to Lenders (Phase 1 of the Lender Auth &
    // Financing-Visibility Flow) ──────────────────────────────────────────
    // Publishing is owner-only -- see financingPipeline.ts's header note on
    // why it keys rows off the signed-in session directly rather than the
    // shared-workspace owner id every other per-business table uses.
    const canPublishToLenders = userRole === 'owner';

    const revenueBand = useMemo(() => bandRevenue(fitInput.annualRevenue, currency), [fitInput.annualRevenue, currency]);

    const [pipelineListings, setPipelineListings] = useState<PipelineListing[]>([]);
    const [selectedTypes, setSelectedTypes] = useState<Set<FinancingProductType>>(new Set());
    const [purposeText, setPurposeText] = useState('');
    const [publishing, setPublishing] = useState(false);
    const [publishMsg, setPublishMsg] = useState<string | null>(null);

    const refreshListings = () => {
        loadMyPipelineListings().then(setPipelineListings).catch(() => {});
    };
    useEffect(() => {
        if (canPublishToLenders) refreshListings();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canPublishToLenders]);

    // Default the picker to whichever types this business currently has a
    // real (strong/moderate) fit for, rather than an empty selection --
    // matches the "capital suitability" idea directly: don't ask the owner
    // to guess which financing type fits their situation, suggest it.
    useEffect(() => {
        const suggested = new Set<FinancingProductType>();
        for (const r of results) {
            if (r.verdict === 'strong' || r.verdict === 'moderate') suggested.add(r.product.productType);
        }
        setSelectedTypes(suggested);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [productSource]);

    const activeListingTypes = new Set(pipelineListings.filter(l => l.status !== 'inactive').map(l => l.financingType));

    const toggleType = (t: FinancingProductType) => {
        setSelectedTypes(prev => {
            const next = new Set(prev);
            if (next.has(t)) next.delete(t); else next.add(t);
            return next;
        });
    };

    const handlePublish = async () => {
        setPublishing(true);
        setPublishMsg(null);
        try {
            const types = Array.from(selectedTypes);
            if (types.length === 0) {
                setPublishMsg('Select at least one financing type first.');
                return;
            }
            let failed = 0;
            for (const financingType of types) {
                const res = await publishPipelineListing({
                    financingType,
                    grade: risk.grade,
                    band: risk.band,
                    score: risk.score,
                    dscr: dscr.dscr,
                    dscrStatus: dscr.status,
                    sector: INDUSTRY_LABEL[settings.industry ?? 'general'],
                    revenueBand,
                    requestedAmount,
                    purpose: purposeText.trim() || undefined,
                });
                if (!res.ok) failed++;
            }
            setPublishMsg(failed === 0
                ? `You're now visible to lenders for ${types.length} financing type${types.length > 1 ? 's' : ''}.`
                : `${types.length - failed} of ${types.length} published — the rest failed, try again.`);
            refreshListings();
        } finally {
            setPublishing(false);
        }
    };

    const handleRevoke = async (id: string) => {
        await revokePipelineListing(id);
        refreshListings();
    };

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
                        {usingLiveProducts
                            ? "These are real financing products published by Quad360's lending partners. Fit scores are estimates based on each lender's published criteria and your recorded data — Quad360 does not make lending decisions. Each lender independently evaluates and approves any application."
                            : "Sample marketplace — Quad360 doesn't have live lending partners yet. These are illustrative example listings that show how the fit-matching engine works once real lenders are onboarded. Fit scores are estimates based on published criteria and your recorded data — Quad360 does not make lending decisions, and no lender here is a real, currently-applyable offer."}
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
                    {readinessDelta && readinessDelta.trend !== 'stable' && (
                        <Text style={[s.readinessTrend, { color: readinessDelta.trend === 'improving' ? Colors.income : Colors.expense }]}>
                            {readinessDelta.trend === 'improving' ? `↑ Improved from ${readinessDelta.fromScore} over ${readinessDelta.periodLabel}` : `↓ Down from ${readinessDelta.fromScore} over ${readinessDelta.periodLabel}`}
                        </Text>
                    )}
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

                    {lendingCapacity.maxAmount > 0 && (
                        <View style={s.capacityNote}>
                            <Text style={s.capacityNoteLabel}>Based on your current numbers</Text>
                            <Text style={s.capacityNoteRange}>
                                You could realistically support {fmtAmt(currency, lendingCapacity.minAmount)}–{fmtAmt(currency, lendingCapacity.maxAmount)}
                            </Text>
                            {requestedAmount !== undefined && requestedAmount > lendingCapacity.maxAmount && (
                                <Text style={s.capacityNoteWarn}>
                                    Your {fmtAmt(currency, requestedAmount)} ask is above that range — lenders may see this as more debt than your current cash flow comfortably supports.
                                </Text>
                            )}
                            <TouchableOpacity onPress={() => navigate('credit-worthiness')}>
                                <Text style={s.capacityNoteLink}>See the full breakdown on Credit-Worthiness →</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                    {lendingCapacity.maxAmount === 0 && (
                        <Text style={s.capacityNoteMuted}>
                            Not enough reliable history yet to estimate what you could realistically support based on your own numbers.
                        </Text>
                    )}
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

                {canPublishToLenders && (
                    <View style={s.visibilityBox}>
                        <Text style={s.visibilityTitle}>Be Visible to Lenders</Text>
                        <Text style={s.visibilitySubtitle}>
                            Publish a summary of your readiness — not your raw financial data — so Quad360's
                            lending partners can find businesses that fit their financing criteria.
                        </Text>

                        <View style={s.shareGrid}>
                            <View style={s.shareCol}>
                                <Text style={s.shareColTitle}>✓ Shared</Text>
                                <Text style={s.shareColItem}>Grade, band &amp; score</Text>
                                <Text style={s.shareColItem}>Debt-service capacity</Text>
                                <Text style={s.shareColItem}>Sector &amp; revenue range</Text>
                                <Text style={s.shareColItem}>Amount &amp; purpose you enter below</Text>
                            </View>
                            <View style={s.shareCol}>
                                <Text style={[s.shareColTitle, { color: Colors.expense }]}>✕ Never shared</Text>
                                <Text style={s.shareColItem}>Any individual transaction</Text>
                                <Text style={s.shareColItem}>Exact revenue or cash balance</Text>
                                <Text style={s.shareColItem}>Customer/supplier names</Text>
                                <Text style={s.shareColItem}>Anything you haven't opted into</Text>
                            </View>
                        </View>

                        <View style={s.factorSummaryBox}>
                            <Text style={s.factorSummaryTitle}>What lenders would see — {risk.grade} · {risk.band} ({Math.round(risk.score)}/100)</Text>
                            {risk.factors.map(f => (
                                <View key={f.name} style={s.factorRow}>
                                    <Text style={s.factorRowName}>{f.name}</Text>
                                    <View style={s.factorRowTrack}>
                                        <View style={[s.factorRowFill, {
                                            width: `${f.score}%` as any,
                                            backgroundColor: f.status === 'good' ? Colors.income : f.status === 'warning' ? Colors.warning : Colors.expense,
                                        }]} />
                                    </View>
                                    <Text style={s.factorRowScore}>{f.score}</Text>
                                </View>
                            ))}
                            <Text style={s.revenueBandNote}>Revenue shown to lenders as: {revenueBand} · Sector: {INDUSTRY_LABEL[settings.industry ?? 'general']}</Text>
                        </View>

                        <Text style={s.typesLabel}>Which financing types should you be visible for?</Text>
                        <View style={s.typeChipRow}>
                            {(Object.keys(PRODUCT_TYPE_LABEL) as FinancingProductType[]).map(t => {
                                const active = activeListingTypes.has(t);
                                const selected = selectedTypes.has(t);
                                return (
                                    <TouchableOpacity
                                        key={t}
                                        style={[s.typeChip, selected && s.typeChipSelected, active && s.typeChipActive]}
                                        onPress={() => toggleType(t)}
                                    >
                                        <Text style={[s.typeChipText, selected && s.typeChipTextSelected]}>
                                            {active ? '● ' : ''}{PRODUCT_TYPE_LABEL[t]}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        <Text style={s.purposeLabel}>What's this financing for? (optional, shared with lenders)</Text>
                        <TextInput
                            style={s.purposeInput}
                            placeholder="e.g. Stock replenishment ahead of festive season"
                            placeholderTextColor={Colors.textMuted}
                            value={purposeText}
                            onChangeText={setPurposeText}
                        />

                        <TouchableOpacity style={s.publishBtn} onPress={handlePublish} disabled={publishing}>
                            <Text style={s.publishBtnText}>{publishing ? 'Publishing…' : 'Publish to Lenders'}</Text>
                        </TouchableOpacity>
                        {publishMsg && <Text style={s.publishMsg}>{publishMsg}</Text>}

                        {pipelineListings.filter(l => l.status !== 'inactive').length > 0 && (
                            <View style={s.activeListingsBox}>
                                <Text style={s.activeListingsTitle}>Currently visible for</Text>
                                {pipelineListings.filter(l => l.status !== 'inactive').map(l => (
                                    <View key={l.id} style={s.activeListingRow}>
                                        <Text style={s.activeListingType}>
                                            {PRODUCT_TYPE_LABEL[l.financingType]}
                                            {l.status === 'matched' ? ' · Matched' : ''}
                                        </Text>
                                        <TouchableOpacity onPress={() => handleRevoke(l.id)}>
                                            <Text style={s.revokeLink}>Stop sharing</Text>
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        )}

                        <Text style={s.visibilityFootnote}>
                            No lending partners are live on the pipeline yet — this publishes your readiness
                            summary so it's ready the moment they are. Listings expire automatically after 90 days;
                            republish any time your numbers change.
                        </Text>
                    </View>
                )}

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
    readinessTrend: { fontSize: 11.5, fontWeight: '700', marginTop: 6 },

    amountBox: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 20 },
    amountLabel: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 },
    amountInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.textPrimary, backgroundColor: Colors.bg },
    amountHint: { fontSize: 11.5, color: Colors.textMuted, marginTop: 6, lineHeight: 16 },
    capacityNote: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border },
    capacityNoteLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
    capacityNoteRange: { fontSize: 14.5, fontWeight: '700', color: Colors.textPrimary, marginTop: 3 },
    capacityNoteWarn: { fontSize: 12, color: Colors.warning, marginTop: 6, lineHeight: 16 },
    capacityNoteLink: { fontSize: 12, color: Colors.primary, marginTop: 8, fontWeight: '600' },
    capacityNoteMuted: { fontSize: 11.5, color: Colors.textMuted, marginTop: 10, fontStyle: 'italic', lineHeight: 16 },

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
    improveFootnote: { fontSize: 10.5, color: Colors.textMuted, fontStyle: 'italic', marginTop: 4, lineHeight: 14 },

    notEligibleNote: { fontSize: 11.5, color: Colors.expense, marginTop: 6, lineHeight: 16 },

    economicBox: { marginTop: 10, backgroundColor: Colors.warning + '15', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: Colors.warning + '40' },
    economicTitle: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
    economicNoteText: { fontSize: 11.5, color: Colors.textSecondary, lineHeight: 16 },

    footerNote: { marginTop: 8, marginBottom: 20 },
    footerNoteText: { fontSize: 11, color: Colors.textMuted, lineHeight: 16, textAlign: 'center' },

    visibilityBox: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginTop: 8, marginBottom: 20, borderWidth: 1, borderColor: Colors.equity + '40' },
    visibilityTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
    visibilitySubtitle: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 17, marginBottom: 14 },

    shareGrid: { flexDirection: 'row', gap: 12, marginBottom: 14 },
    shareCol: { flex: 1, backgroundColor: Colors.bg, borderRadius: 8, padding: 10 },
    shareColTitle: { fontSize: 11.5, fontWeight: '800', color: Colors.income, marginBottom: 6 },
    shareColItem: { fontSize: 11, color: Colors.textSecondary, lineHeight: 16, marginBottom: 2 },

    factorSummaryBox: { backgroundColor: Colors.bg, borderRadius: 8, padding: 12, marginBottom: 14 },
    factorSummaryTitle: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary, marginBottom: 10 },
    factorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 7, gap: 8 },
    factorRowName: { fontSize: 11, color: Colors.textSecondary, width: 100 },
    factorRowTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: Colors.border, overflow: 'hidden' },
    factorRowFill: { height: '100%', borderRadius: 3 },
    factorRowScore: { fontSize: 10.5, color: Colors.textMuted, width: 26, textAlign: 'right' },
    revenueBandNote: { fontSize: 11, color: Colors.textMuted, marginTop: 6, fontStyle: 'italic' },

    typesLabel: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 },
    typeChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
    typeChip: { borderWidth: 1, borderColor: Colors.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: Colors.bg },
    typeChipSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + '18' },
    typeChipActive: { borderColor: Colors.income },
    typeChipText: { fontSize: 11.5, color: Colors.textSecondary, fontWeight: '600' },
    typeChipTextSelected: { color: Colors.primary },

    purposeLabel: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 },
    purposeInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: Colors.textPrimary, backgroundColor: Colors.bg, marginBottom: 14 },

    publishBtn: { backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
    publishBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    publishMsg: { fontSize: 12, color: Colors.income, marginTop: 8, textAlign: 'center' },

    activeListingsBox: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: Colors.border },
    activeListingsTitle: { fontSize: 11.5, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 8 },
    activeListingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    activeListingType: { fontSize: 12.5, color: Colors.textPrimary, fontWeight: '600' },
    revokeLink: { fontSize: 12, color: Colors.expense, fontWeight: '600' },

    visibilityFootnote: { fontSize: 10.5, color: Colors.textMuted, fontStyle: 'italic', marginTop: 14, lineHeight: 15 },
});
