import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, TouchableOpacity, StyleSheet, TextInput, Animated, Easing } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Spacing, Radius, Shadow } from '../theme/tokens';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import Icon, { IconName } from '../components/ui/Icon';
import { ChipGroup } from '../components/ui/ChipGroup';
import { ExpandableCard } from '../components/ui/ExpandableCard';
import { computeRiskScore, computeDSCR, computeFinancingReadinessScore, RiskScore } from '../utils/finance';
import { buildFinancingFitInput, rankFinancingProducts, FinancingFitResult, FinancingFitVerdict } from '../utils/financingFit';
import { computeLendingCapacityEstimate } from '../utils/lendingCapacity';
import { assessCapitalNeed, CAPITAL_PURPOSE_PRODUCT_TYPES } from '../utils/capitalNeedAssessment';
import { computeReadinessDelta } from '../utils/readinessHistory';
import { recommendFinancingTypes, FinancingRecommendation, buildFinancingProfileNarrative } from '../utils/financingRecommendation';
import { computeCashFlowHealth } from '../utils/cashFlowHealth';
import { buildFinancialBehaviour } from '../utils/businessFinancialDNA';
import { analyzeTrend } from '../utils/trendAnalysis';
import { canPublishToLenders as computeCanPublishToLenders } from '../utils/rolePermissions';
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

// ─── "Find Financing" categories (entry step) ───────────────────────────────
// SME-facing browsing categories, deliberately broader than
// FinancingProductType (the schema's financing-mechanism enum) -- these are
// how a business owner actually thinks about their need ("I'm buying
// equipment", "I need working capital"), not how a lender's product is
// structured internally. Most map cleanly onto one or two product types;
// a handful (marked `specialized`) don't have a dedicated product type or
// eligibility signal in the schema yet -- picking one of those still works,
// it just shows the closest general-purpose listings with an honest note
// rather than pretending there's a differentiated result set. An empty
// `productTypes` array means "no type filter" (Women & Youth Business cuts
// across every financing type, not one particular structure).
interface FinancingCategory {
    id: string;
    label: string;
    icon: IconName;
    productTypes: FinancingProductType[];
    specialized?: boolean;
}

const CATEGORIES: FinancingCategory[] = [
    { id: 'working_capital',      label: 'Working Capital',        icon: 'repeat',        productTypes: ['working_capital'] },
    { id: 'asset_equipment',      label: 'Asset & Equipment',      icon: 'tool',          productTypes: ['asset_financing'] },
    { id: 'invoice_finance',      label: 'Invoice Finance',        icon: 'file-text',     productTypes: ['invoice_financing'] },
    { id: 'trade_export',         label: 'Trade & Export',         icon: 'globe',         productTypes: ['trade_finance'] },
    { id: 'agriculture',          label: 'Agriculture',            icon: 'package',       productTypes: ['working_capital', 'asset_financing'], specialized: true },
    { id: 'manufacturing',        label: 'Manufacturing',          icon: 'settings',      productTypes: ['asset_financing', 'working_capital', 'term_loan'] },
    { id: 'expansion',            label: 'Expansion',              icon: 'trending-up',   productTypes: ['term_loan', 'working_capital'] },
    { id: 'energy_solar',         label: 'Energy & Solar',         icon: 'sun',           productTypes: ['asset_financing', 'term_loan'], specialized: true },
    { id: 'purchase_order',       label: 'Purchase Order',         icon: 'shopping-cart', productTypes: ['trade_finance', 'invoice_financing'], specialized: true },
    { id: 'women_youth',          label: 'Women & Youth Business', icon: 'users',         productTypes: [], specialized: true },
    { id: 'startup_innovation',   label: 'Startup / Innovation',   icon: 'zap',           productTypes: ['term_loan', 'working_capital'], specialized: true },
    { id: 'green_climate',        label: 'Green / Climate Finance', icon: 'wind',         productTypes: ['asset_financing', 'term_loan'], specialized: true },
    // "Refinancing existing debt" and "emergency liquidity" are real
    // reasons a business needs capital that don't fit any category above
    // (those are mostly industry verticals or a specific asset/structure) --
    // added so "why do you need this money" has an honest answer for both.
    { id: 'refinancing',          label: 'Refinancing',            icon: 'refresh-cw',    productTypes: CAPITAL_PURPOSE_PRODUCT_TYPES.refinancing },
    { id: 'emergency_liquidity',  label: 'Emergency Liquidity',     icon: 'alert-circle',  productTypes: CAPITAL_PURPOSE_PRODUCT_TYPES.emergency },
];

// Where a recommended FinancingProductType lands if the owner taps it —
// the single-purpose category that best represents that product type,
// not just any category whose productTypes[] happens to include it.
const RECOMMENDATION_CATEGORY: Record<FinancingProductType, string> = {
    working_capital: 'working_capital',
    asset_financing: 'asset_equipment',
    invoice_financing: 'invoice_finance',
    term_loan: 'expansion',
    trade_finance: 'trade_export',
    overdraft: 'working_capital',
};

function fmtAmt(currency: string, n: number): string {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `${currency}${(n / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${currency}${(n / 1_000).toFixed(0)}K`;
    return `${currency}${Math.round(n).toLocaleString()}`;
}

function CriterionRow({ label, status, businessValue, required, note }: { label: string; status: 'met' | 'unmet' | 'unknown'; businessValue: string; required: string; note?: string }) {
    const iconName = status === 'met' ? 'check' : status === 'unmet' ? 'alert-triangle' : 'help-circle';
    const color = status === 'met' ? Colors.income : status === 'unmet' ? Colors.expense : Colors.textMuted;
    return (
        <View style={s.criterionRow}>
            <View style={s.criterionIcon}>
                <Icon name={iconName} size={14} color={color} />
            </View>
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
        <ExpandableCard
            expanded={expanded}
            onToggle={onToggle}
            accentColor={verdict.color}
            expandedHint="Tap to collapse ▲"
            collapsedHint="Tap to see why ▼"
            header={
                <>
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
                </>
            }
        >
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
        </ExpandableCard>
    );
}

// One factor's fill bar in the "What lenders would see" breakdown -- owns
// its own Animated.Value so it grows in independently, matching the motion
// language used for the equivalent factor bars on Credit-Worthiness.
function FactorBar({ pct, color }: { pct: number; color: string }) {
    const anim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.timing(anim, {
            toValue: Math.min(Math.max(pct, 0), 100),
            duration: 500,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
    }, [pct]);
    return (
        <View style={s.factorRowTrack}>
            <Animated.View style={[s.factorRowFill, {
                backgroundColor: color,
                width: anim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
            }]} />
        </View>
    );
}

export default function FinancingMarketplaceScreen() {
    const { user, finance, transactions, loans, inventory, invoices, assets, settings, navigate, navParams, readinessHistory, userRole } = useApp();
    const { currency } = settings;
    const [amountText, setAmountText] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // ─── Find Financing entry step ──────────────────────────────────────────
    // Starts at the category picker every visit rather than remembering the
    // last choice -- "what are you financing?" is meant to be asked fresh
    // each time, and "Browse all financing options" is one tap away for
    // anyone who'd rather skip straight to the full ranked list.
    const [screenStep, setScreenStep] = useState<'categories' | 'results'>('categories');
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
    const selectedCategory = CATEGORIES.find(c => c.id === selectedCategoryId) ?? null;

    // A caller (e.g. Reports' Asset Replacement Forecast card) can jump
    // straight to a sized, categorized result instead of the "what are you
    // financing?" picker -- the same one-time-consumed prefill pattern
    // MacroAssumptionsScreen uses, so re-rendering this screen doesn't
    // re-trigger it and stomp on manual edits the user makes afterward.
    const consumedPrefill = useRef(false);
    useEffect(() => {
        if (consumedPrefill.current || !navParams?.prefill) return;
        consumedPrefill.current = true;
        const { category, amount } = navParams.prefill as { category?: string; amount?: number };
        if (category && CATEGORIES.some(c => c.id === category)) setSelectedCategoryId(category);
        if (typeof amount === 'number' && amount > 0) setAmountText(String(Math.round(amount)));
        setScreenStep('results');
    }, [navParams]);

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
    const dataQuality = useMemo(() => computeDataQuality(transactions, settings.industry), [transactions, settings.industry]);
    const inventoryValue = useMemo(() => computeInventoryValue(inventory), [inventory]);
    // Reweighted toward debt-service coverage and liquidity -- what actually
    // predicts repayment ability -- rather than the general risk score,
    // same as Credit-Worthiness's own Estimated Lending Capacity.
    const financingReadiness = useMemo(() => computeFinancingReadinessScore(risk.factors), [risk.factors]);
    const lendingCapacity = useMemo(() => computeLendingCapacityEstimate({
        overallCreditScore: financingReadiness.score,
        avgMonthlyRevenue: fitInput.avgMonthlyRevenue,
        dscr: dscr.dscr,
        hasReliableData: dataQuality.confidence !== 'none' && dataQuality.confidence !== 'limited',
        inventoryValue,
    }), [financingReadiness.score, fitInput.avgMonthlyRevenue, dscr.dscr, dataQuality.confidence, inventoryValue]);

    // What the ask actually compares to -- a specific suggested amount when
    // the request exceeds sustainable capacity, not just a warning that it
    // does. See capitalNeedAssessment.ts.
    const capitalNeed = useMemo(
        () => assessCapitalNeed(requestedAmount, lendingCapacity.minAmount, lendingCapacity.maxAmount, currency),
        [requestedAmount, lendingCapacity.minAmount, lendingCapacity.maxAmount, currency],
    );

    // A single-point score tells a lender nothing about direction -- this is
    // the same trend Credit-Worthiness shows in full, condensed to one line
    // for the context lenders actually care about: is this business getting
    // more or less financeable.
    const readinessDelta = useMemo(() => computeReadinessDelta(readinessHistory), [readinessHistory]);

    // "I'm not sure what kind of financing I need" -- computed unconditionally
    // (not gated behind a button tap) so the categories screen can lead with
    // it rather than making the owner dig for it. Always resolves to at
    // least one recommendation (see financingRecommendation.ts's Working
    // Capital fallback), so this is never an empty state.
    const recommendations = useMemo(
        () => recommendFinancingTypes({ fitInput, invoices, assets, readinessTrend: readinessDelta?.trend ?? null, transactions, inventory }, currency),
        [fitInput, invoices, assets, readinessDelta, currency, transactions, inventory],
    );

    // "Your business currently demonstrates X, but Y has increased" -- then
    // "you may be better suited to A than B" -- see
    // buildFinancingProfileNarrative's own doc comment for why this is
    // assembled from real signals (Cash Flow Health + the recommendations
    // above + revenue volatility) rather than a bare "you qualify for ₦Xm".
    const cashFlowHealth = useMemo(
        () => computeCashFlowHealth(transactions, assets, inventory, currency, loans),
        [transactions, assets, inventory, currency, loans],
    );
    const revenueVolatility = useMemo(
        () => buildFinancialBehaviour(transactions, loans, analyzeTrend(transactions)).revenueVolatility,
        [transactions, loans],
    );
    const financingProfileNarrative = useMemo(
        () => buildFinancingProfileNarrative(cashFlowHealth, recommendations, revenueVolatility),
        [cashFlowHealth, recommendations, revenueVolatility],
    );

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

    // Ranked against every listing regardless of category -- used only to
    // suggest which types to publish visibility for below (Be Visible to
    // Lenders shouldn't be narrowed by whatever category the owner happened
    // to browse in on this visit).
    const allResults = useMemo(
        () => rankFinancingProducts(productSource, fitInput, currency),
        [productSource, fitInput, currency],
    );

    // Category-filtered listings for the results step. An empty
    // productTypes array (Women & Youth Business) means no filter at all.
    // If a category's mapped types happen to match nothing in the current
    // listing set, fall back to the full list rather than showing "0
    // results" -- categoryHadNoDirectMatches drives the honest disclosure
    // instead.
    const categoryProducts = useMemo(() => {
        if (!selectedCategory || selectedCategory.productTypes.length === 0) return productSource;
        const filtered = productSource.filter(p => selectedCategory.productTypes.includes(p.productType));
        return filtered.length > 0 ? filtered : productSource;
    }, [selectedCategory, productSource]);

    const categoryHadNoDirectMatches = !!selectedCategory
        && selectedCategory.productTypes.length > 0
        && !productSource.some(p => selectedCategory.productTypes.includes(p.productType));

    const results = useMemo(
        () => rankFinancingProducts(categoryProducts, fitInput, currency),
        [categoryProducts, fitInput, currency],
    );
    const topMatch = results[0];

    // ─── Be Visible to Lenders (Phase 1 of the Lender Auth &
    // Financing-Visibility Flow) ──────────────────────────────────────────
    // Publishing is owner-only -- see financingPipeline.ts's header note on
    // why it keys rows off the signed-in session directly rather than the
    // shared-workspace owner id every other per-business table uses.
    const canPublishToLenders = computeCanPublishToLenders(userRole);

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
        for (const r of allResults) {
            if (r.verdict === 'strong' || r.verdict === 'moderate') suggested.add(r.product.productType);
        }
        setSelectedTypes(suggested);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [productSource]);

    const activeListingTypes = new Set(pipelineListings.filter(l => l.status !== 'inactive').map(l => l.financingType));

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

    // ── Step 1: "Find Financing" — what are you financing? ──────────────────
    if (screenStep === 'categories') {
        return (
            <SafeAreaView style={s.safe}>
                <Header />
                <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
                    <TouchableOpacity onPress={() => navigate('dashboard')}>
                        <Text style={{ color: Colors.primary, fontSize: 14, marginBottom: 12 }}>← Dashboard</Text>
                    </TouchableOpacity>

                    <Text style={s.title}>🤝 Find Financing</Text>
                    <Text style={s.subtitle}>What are you financing?</Text>

                    {recommendations.length > 0 && (
                        <View style={s.recommendBox}>
                            <Text style={s.recommendTitle}>Not sure? Here's what fits your business right now</Text>
                            {!!financingProfileNarrative && (
                                <Text style={s.profileNarrative}>{financingProfileNarrative}</Text>
                            )}
                            {recommendations.map(r => (
                                <TouchableOpacity
                                    key={r.productType}
                                    style={s.recommendCard}
                                    onPress={() => { setSelectedCategoryId(RECOMMENDATION_CATEGORY[r.productType]); setScreenStep('results'); }}
                                >
                                    <View style={s.recommendCardHeader}>
                                        <Text style={s.recommendCardLabel}>{r.label}</Text>
                                        <View style={[s.recommendConfidenceBadge, r.confidence === 'strong' && s.recommendConfidenceStrong]}>
                                            <Text style={[s.recommendConfidenceText, r.confidence === 'strong' && s.recommendConfidenceTextStrong]}>
                                                {r.confidence === 'strong' ? 'Strong match' : 'Worth a look'}
                                            </Text>
                                        </View>
                                    </View>
                                    {r.reasons.map((reason, i) => (
                                        <Text key={i} style={s.recommendReason}>{reason}</Text>
                                    ))}
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    <Text style={s.orBrowseLabel}>Or browse by category</Text>
                    <View style={s.categoryGrid}>
                        {CATEGORIES.map(cat => (
                            <TouchableOpacity
                                key={cat.id}
                                style={s.categoryCard}
                                onPress={() => { setSelectedCategoryId(cat.id); setScreenStep('results'); }}
                            >
                                <Icon name={cat.icon} size={20} color={Colors.primary} />
                                <Text style={s.categoryLabel}>{cat.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <TouchableOpacity
                        style={s.browseAllBtn}
                        onPress={() => { setSelectedCategoryId(null); setScreenStep('results'); }}
                    >
                        <Text style={s.browseAllText}>Browse all financing options →</Text>
                    </TouchableOpacity>
                </ScrollView>
                <FooterNav />
            </SafeAreaView>
        );
    }

    // ── Step 2: assessment + ranked matches ──────────────────────────────────
    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
                <TouchableOpacity onPress={() => setScreenStep('categories')}>
                    <Text style={{ color: Colors.primary, fontSize: 14, marginBottom: 12 }}>← What are you financing?</Text>
                </TouchableOpacity>

                <Text style={s.title}>{selectedCategory ? `🤝 ${selectedCategory.label}` : '🤝 All Financing Options'}</Text>
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

                {selectedCategory?.specialized && (
                    <View style={s.specializedBox}>
                        <Text style={s.specializedText}>
                            {categoryHadNoDirectMatches
                                ? `Quad360 doesn't yet have lenders with dedicated ${selectedCategory.label.toLowerCase()} criteria — showing the closest general-purpose financing options below instead.`
                                : `Quad360 doesn't yet track ${selectedCategory.label.toLowerCase()}-specific eligibility (like targeted eligibility criteria) — the listings below are the closest general-purpose match, not a differentiated ${selectedCategory.label.toLowerCase()} product set.`}
                        </Text>
                    </View>
                )}

                <View style={s.assessmentBox}>
                    <Text style={s.assessmentTitle}>Your financing assessment</Text>

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

                    <Text style={[s.amountLabel, { marginTop: 14 }]}>What's this financing for? (optional, shared with lenders if you publish below)</Text>
                    <TextInput
                        style={s.purposeInput}
                        placeholder="e.g. Stock replenishment ahead of festive season"
                        placeholderTextColor={Colors.textMuted}
                        value={purposeText}
                        onChangeText={setPurposeText}
                    />

                    <View style={s.assessmentDivider} />

                    <View style={s.assessmentRow}>
                        <Text style={s.assessmentLabel}>Requested</Text>
                        <Text style={s.assessmentValue}>{requestedAmount !== undefined ? fmtAmt(currency, requestedAmount) : 'Not specified'}</Text>
                    </View>
                    <View style={s.assessmentRow}>
                        <Text style={s.assessmentLabel}>Estimated sustainable capacity</Text>
                        <Text style={s.assessmentValue}>
                            {lendingCapacity.maxAmount > 0
                                ? `${fmtAmt(currency, lendingCapacity.minAmount)}–${fmtAmt(currency, lendingCapacity.maxAmount)}`
                                : 'Not enough history yet'}
                        </Text>
                    </View>
                    <View style={s.assessmentRow}>
                        <Text style={s.assessmentLabel}>Purpose</Text>
                        <Text style={s.assessmentValue}>{purposeText.trim() || '—'}</Text>
                    </View>
                    <View style={s.assessmentRow}>
                        <Text style={s.assessmentLabel}>Recommended structure</Text>
                        <Text style={s.assessmentValue}>{topMatch ? PRODUCT_TYPE_LABEL[topMatch.product.productType] : '—'}</Text>
                    </View>
                    <View style={s.assessmentRow}>
                        <Text style={s.assessmentLabel}>Readiness</Text>
                        <Text style={[s.assessmentValue, { color: readyStyle.color }]}>{Math.round(risk.score)}% · {readyStyle.label}</Text>
                    </View>
                    {dscr.dscr < 1 && (
                        <Text style={s.assessmentWarn}>
                            Debt-service coverage is below 1x — existing income doesn't cover current debt payments yet.
                        </Text>
                    )}
                    {capitalNeed.withinCapacity === false && (
                        <Text style={s.assessmentWarn}>{capitalNeed.message}</Text>
                    )}
                    {readinessDelta && readinessDelta.trend !== 'stable' && (
                        <Text style={[s.readinessTrend, { color: readinessDelta.trend === 'improving' ? Colors.income : Colors.expense }]}>
                            {readinessDelta.trend === 'improving' ? `↑ Improved from ${readinessDelta.fromScore} over ${readinessDelta.periodLabel}` : `↓ Down from ${readinessDelta.fromScore} over ${readinessDelta.periodLabel}`}
                        </Text>
                    )}
                    <TouchableOpacity onPress={() => navigate('credit-worthiness')}>
                        <Text style={s.capacityNoteLink}>See the full breakdown on Credit-Worthiness →</Text>
                    </TouchableOpacity>
                </View>

                {topMatch && (
                    <View style={s.beforeApplyingBox}>
                        <Text style={s.beforeApplyingTitle}>Before applying</Text>
                        <Text style={s.beforeApplyingSubtitle}>Against your strongest match — {topMatch.product.lenderName}, {topMatch.product.productName}</Text>
                        {topMatch.criteria.map((c, i) => (
                            <View key={i} style={s.beforeApplyingRow}>
                                <View style={s.beforeApplyingIcon}>
                                    <Icon
                                        name={c.status === 'met' ? 'check' : c.status === 'unmet' ? 'alert-triangle' : 'help-circle'}
                                        size={14}
                                        color={c.status === 'met' ? Colors.income : c.status === 'unmet' ? Colors.warning : Colors.textMuted}
                                    />
                                </View>
                                <Text style={s.beforeApplyingLabel}>
                                    {c.label}
                                    {c.status !== 'met' ? ` — you: ${c.businessValue}, needs: ${c.required}` : ''}
                                </Text>
                            </View>
                        ))}
                    </View>
                )}

                <Text style={s.sectionTitle}>Your strongest matches</Text>

                {/* There's no live "Apply" submission anywhere in this
                    marketplace yet -- it's comparison-only -- so this can't
                    be a real "you already applied elsewhere" gate keyed off
                    actual application records. What IS true
                    regardless: a business about to approach several of the
                    lenders below is better served focusing on 1-2 strong
                    matches than applying broadly -- a cluster of recent
                    applications tends to raise questions with lenders rather
                    than improve odds. Shown only when there's genuinely more
                    than one lender to be tempted by. */}
                {results.length > 1 && (
                    <View style={s.multiApplyNotice}>
                        <Icon name="alert-triangle" size={14} color={Colors.warning} />
                        <Text style={s.multiApplyNoticeText}>
                            Apply selectively, not broadly. Lenders can see a cluster of recent applications elsewhere, and it tends to raise questions rather than improve your odds — focus on your top 1-2 matches below before trying more.
                        </Text>
                    </View>
                )}

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
                                <Text style={s.shareColItem}>Amount &amp; purpose you enter above</Text>
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
                                    <FactorBar
                                        pct={f.score}
                                        color={f.status === 'good' ? Colors.income : f.status === 'warning' ? Colors.warning : Colors.expense}
                                    />
                                    <Text style={s.factorRowScore}>{f.score}</Text>
                                </View>
                            ))}
                            <Text style={s.revenueBandNote}>Revenue shown to lenders as: {revenueBand} · Sector: {INDUSTRY_LABEL[settings.industry ?? 'general']}</Text>
                        </View>

                        <ChipGroup<FinancingProductType>
                            multiple
                            label="Which financing types should you be visible for?"
                            style={{ marginBottom: 14 }}
                            options={(Object.keys(PRODUCT_TYPE_LABEL) as FinancingProductType[]).map(t => ({
                                value: t,
                                label: PRODUCT_TYPE_LABEL[t],
                                indicator: activeListingTypes.has(t),
                            }))}
                            value={Array.from(selectedTypes)}
                            onChange={next => setSelectedTypes(new Set(next))}
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
    pad: { padding: Spacing.lg, paddingBottom: 80, width: '100%', maxWidth: 640, alignSelf: 'center' },
    title: { fontSize: 28, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
    subtitle: { fontSize: 14, color: Colors.textSecondary, marginBottom: 14, lineHeight: 19 },

    disclosureBox: { backgroundColor: Colors.warning + '15', borderRadius: Radius.sm, padding: Spacing.md, marginBottom: 18, borderWidth: 1, borderColor: Colors.warning + '40', ...Shadow.sm },
    disclosureText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },

    readinessTrend: { fontSize: 11.5, fontWeight: '700', marginTop: 6 },

    recommendBox: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.lg, marginBottom: 18, borderWidth: 1, borderColor: Colors.primary + '40', ...Shadow.sm },
    recommendTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.md },
    profileNarrative: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18, marginBottom: Spacing.md },
    recommendCard: { backgroundColor: Colors.bg, borderRadius: Radius.sm, padding: Spacing.md, marginBottom: Spacing.sm },
    recommendCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    recommendCardLabel: { fontSize: 13.5, fontWeight: '700', color: Colors.textPrimary },
    recommendConfidenceBadge: { borderRadius: Radius.pill, paddingHorizontal: Spacing.sm, paddingVertical: 3, backgroundColor: Colors.textMuted + '22' },
    recommendConfidenceStrong: { backgroundColor: Colors.income + '22' },
    recommendConfidenceText: { fontSize: 10, fontWeight: '700', color: Colors.textMuted },
    recommendConfidenceTextStrong: { color: Colors.income },
    recommendReason: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginBottom: 3 },

    orBrowseLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 10 },
    categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4, marginBottom: 20 },
    categoryCard: {
        width: '47%', backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
        paddingVertical: 18, paddingHorizontal: Spacing.md, alignItems: 'center', gap: Spacing.sm, ...Shadow.sm,
    },
    categoryLabel: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
    browseAllBtn: { alignItems: 'center', paddingVertical: Spacing.md, marginBottom: 20 },
    browseAllText: { fontSize: 13, fontWeight: '700', color: Colors.primary },

    specializedBox: { backgroundColor: Colors.surface, borderRadius: Radius.sm, padding: Spacing.md, marginBottom: 18, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    specializedText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, fontStyle: 'italic' },

    assessmentBox: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.lg, marginBottom: 18, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    assessmentTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary, marginBottom: 14 },
    assessmentDivider: { height: 1, backgroundColor: Colors.border, marginTop: 14, marginBottom: 4 },
    assessmentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: Colors.border },
    assessmentLabel: { fontSize: 12.5, color: Colors.textSecondary, flex: 1 },
    assessmentValue: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, textAlign: 'right' },
    assessmentWarn: { fontSize: 12, color: Colors.warning, marginTop: 10, lineHeight: 16 },

    amountLabel: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
    amountInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: Spacing.md, paddingVertical: 10, fontSize: 14, color: Colors.textPrimary, backgroundColor: Colors.bg },
    amountHint: { fontSize: 11.5, color: Colors.textMuted, marginTop: 6, lineHeight: 16 },
    capacityNoteLink: { fontSize: 12, color: Colors.primary, marginTop: 10, fontWeight: '600' },

    beforeApplyingBox: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.lg, marginBottom: 18, borderWidth: 1, borderColor: Colors.equity + '40', ...Shadow.sm },
    beforeApplyingTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, marginBottom: 2 },
    beforeApplyingSubtitle: { fontSize: 11.5, color: Colors.textMuted, marginBottom: Spacing.md },
    beforeApplyingRow: { flexDirection: 'row', marginBottom: Spacing.sm },
    beforeApplyingIcon: { width: 20, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 1 },
    beforeApplyingLabel: { fontSize: 12.5, color: Colors.textSecondary, flex: 1, lineHeight: 17 },

    sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 10 },
    multiApplyNotice: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 8,
        backgroundColor: Colors.warning + '15', borderWidth: 1, borderColor: Colors.warning + '40',
        borderRadius: Radius.md, padding: Spacing.md, marginBottom: 14, ...Shadow.sm,
    },
    multiApplyNoticeText: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },

    productHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.sm },
    productHeaderLeft: { flexDirection: 'row', alignItems: 'flex-start', flex: 1, marginRight: Spacing.sm },
    productName: { fontSize: 14.5, fontWeight: '700', color: Colors.textPrimary },
    productLender: { fontSize: 11.5, color: Colors.textMuted, marginTop: 2 },
    fitBadge: { borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', minWidth: 76 },
    fitBadgeScore: { fontSize: 16, fontWeight: '800' },
    fitBadgeLabel: { fontSize: 9.5, fontWeight: '700', marginTop: 1 },
    productDesc: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginBottom: Spacing.sm },
    productMetaRow: { flexDirection: 'row', gap: 14, marginBottom: 4 },
    productMeta: { fontSize: 11.5, color: Colors.textMuted, fontWeight: '600' },

    criteriaTitle: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
    criterionRow: { flexDirection: 'row', marginBottom: 9 },
    criterionIcon: { width: 20, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 1 },
    criterionLabel: { fontSize: 12.5, fontWeight: '600', color: Colors.textPrimary },
    criterionDetail: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 1 },
    criterionNote: { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic', marginTop: 2, lineHeight: 15 },

    improveBox: { marginTop: 4, backgroundColor: Colors.bg, borderRadius: Radius.sm, padding: 10 },
    improveTitle: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, marginBottom: 5 },
    improveTip: { fontSize: 11.5, color: Colors.textSecondary, lineHeight: 16, marginBottom: 3 },
    improveFootnote: { fontSize: 10.5, color: Colors.textMuted, fontStyle: 'italic', marginTop: 4, lineHeight: 14 },

    notEligibleNote: { fontSize: 11.5, color: Colors.expense, marginTop: 6, lineHeight: 16 },

    economicBox: { marginTop: 10, backgroundColor: Colors.warning + '15', borderRadius: Radius.sm, padding: 10, borderWidth: 1, borderColor: Colors.warning + '40' },
    economicTitle: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
    economicNoteText: { fontSize: 11.5, color: Colors.textSecondary, lineHeight: 16 },

    footerNote: { marginTop: Spacing.sm, marginBottom: 20 },
    footerNoteText: { fontSize: 11, color: Colors.textMuted, lineHeight: 16, textAlign: 'center' },

    visibilityBox: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.lg, marginTop: Spacing.sm, marginBottom: 20, borderWidth: 1, borderColor: Colors.equity + '40', ...Shadow.sm },
    visibilityTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
    visibilitySubtitle: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 17, marginBottom: 14 },

    shareGrid: { flexDirection: 'row', gap: Spacing.md, marginBottom: 14 },
    shareCol: { flex: 1, backgroundColor: Colors.bg, borderRadius: Radius.sm, padding: 10 },
    shareColTitle: { fontSize: 11.5, fontWeight: '800', color: Colors.income, marginBottom: 6 },
    shareColItem: { fontSize: 11, color: Colors.textSecondary, lineHeight: 16, marginBottom: 2 },

    factorSummaryBox: { backgroundColor: Colors.bg, borderRadius: Radius.sm, padding: Spacing.md, marginBottom: 14 },
    factorSummaryTitle: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary, marginBottom: 10 },
    factorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 7, gap: Spacing.sm },
    factorRowName: { fontSize: 11, color: Colors.textSecondary, width: 100 },
    factorRowTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: Colors.border, overflow: 'hidden' },
    factorRowFill: { height: '100%', borderRadius: 3 },
    factorRowScore: { fontSize: 10.5, color: Colors.textMuted, width: 26, textAlign: 'right' },
    revenueBandNote: { fontSize: 11, color: Colors.textMuted, marginTop: 6, fontStyle: 'italic' },

    purposeInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: Spacing.md, paddingVertical: 10, fontSize: 13, color: Colors.textPrimary, backgroundColor: Colors.bg, marginBottom: 14 },

    publishBtn: { backgroundColor: Colors.primary, borderRadius: Radius.sm, paddingVertical: Spacing.md, alignItems: 'center' },
    publishBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    publishMsg: { fontSize: 12, color: Colors.income, marginTop: Spacing.sm, textAlign: 'center' },

    activeListingsBox: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: Colors.border },
    activeListingsTitle: { fontSize: 11.5, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: Spacing.sm },
    activeListingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    activeListingType: { fontSize: 12.5, color: Colors.textPrimary, fontWeight: '600' },
    revokeLink: { fontSize: 12, color: Colors.expense, fontWeight: '600' },

    visibilityFootnote: { fontSize: 10.5, color: Colors.textMuted, fontStyle: 'italic', marginTop: 14, lineHeight: 15 },
});
