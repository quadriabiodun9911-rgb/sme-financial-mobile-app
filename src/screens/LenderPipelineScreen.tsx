/**
 * The real (non-mockup) version of the Financing Pipeline concept — Phase 2
 * of the Lender Auth & Financing-Visibility Flow. Reads live, opted-in
 * listings from financing_pipeline_listings via loadPipelineListingsForLender
 * (src/utils/financingPipeline.ts), which relies entirely on that table's
 * RLS ("Active lenders can read active listings") for access control —
 * this screen applies no filtering of its own beyond what the lender picks.
 *
 * Deliberately not built on Header/FooterNav — those are SME-shaped
 * (GlobalSearch reads transactions/invoices/assets a lender never has
 * access to, the settings icon routes to SME account settings). A lender
 * session gets its own minimal top bar instead, and is routed here
 * directly after login rather than sharing a landing screen with the SME
 * dashboard — see OptimizedContexts.tsx's isLenderSession handling.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Icon from '../components/ui/Icon';
import { ChipGroup } from '../components/ui/ChipGroup';
import { ExpandableCard } from '../components/ui/ExpandableCard';
import { Radius, Spacing } from '../theme/tokens';
import { loadPipelineListingsForLender, PipelineListingFilters, describeListingFit } from '../utils/financingPipeline';
import { FinancingProductType, PipelineListing } from '../types';

const TIER_LABEL: Record<'strong' | 'moderate' | 'caution', string> = {
    strong: 'Strong candidate',
    moderate: 'Worth reviewing',
    caution: 'Proceed with caution',
};
const TIER_COLOR: Record<'strong' | 'moderate' | 'caution', string> = {
    strong: Colors.income, moderate: Colors.warning, caution: Colors.expense,
};

const TYPE_LABEL: Record<FinancingProductType, string> = {
    working_capital: 'Working Capital',
    asset_financing: 'Asset Financing',
    invoice_financing: 'Invoice Financing',
    trade_finance: 'Trade Finance',
    term_loan: 'Term Loan',
    overdraft: 'Overdraft',
};

const GRADE_COLOR: Record<string, string> = {
    A: Colors.income, B: Colors.income, C: Colors.warning, D: Colors.expense, F: Colors.expense,
};

const DSCR_LABEL: Record<string, string> = { healthy: 'Healthy', warning: 'Watch', danger: 'Weak' };
const DSCR_COLOR: Record<string, string> = { healthy: Colors.income, warning: Colors.warning, danger: Colors.expense };

const STATUS_LABEL: Record<string, string> = { active: 'Ready to match', matched: 'Matched' };

function fmtAmt(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return Math.round(n).toLocaleString();
}

export default function LenderPipelineScreen() {
    const { logout, lenderOrgName } = useApp();

    const [listings, setListings] = useState<PipelineListing[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const [typeFilter, setTypeFilter] = useState<FinancingProductType | null>(null);
    const [dscrFilter, setDscrFilter] = useState<'healthy' | 'warning' | 'danger' | null>(null);
    const [minAmtText, setMinAmtText] = useState('');
    const [maxAmtText, setMaxAmtText] = useState('');

    const filters: PipelineListingFilters = useMemo(() => {
        const f: PipelineListingFilters = {};
        if (typeFilter) f.financingType = typeFilter;
        if (dscrFilter) f.dscrStatus = dscrFilter;
        const min = parseFloat(minAmtText);
        const max = parseFloat(maxAmtText);
        if (!isNaN(min)) f.minAmount = min;
        if (!isNaN(max)) f.maxAmount = max;
        return f;
    }, [typeFilter, dscrFilter, minAmtText, maxAmtText]);

    const refresh = () => {
        setLoading(true);
        loadPipelineListingsForLender(filters)
            .then(setListings)
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters]);

    const byType = useMemo(() => {
        const map = new Map<FinancingProductType, PipelineListing[]>();
        for (const l of listings) {
            if (!map.has(l.financingType)) map.set(l.financingType, []);
            map.get(l.financingType)!.push(l);
        }
        return map;
    }, [listings]);

    // "What kinds of businesses are actually in this pipeline" — a lender
    // scanning for prospects cares about this alongside financing type;
    // sector is already on every listing, just wasn't summarized anywhere.
    const bySector = useMemo(() => {
        const map = new Map<string, number>();
        for (const l of listings) {
            const key = l.sector || 'Unspecified';
            map.set(key, (map.get(key) ?? 0) + 1);
        }
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    }, [listings]);

    return (
        <SafeAreaView style={s.safe}>
            <View style={s.topbar}>
                <View style={s.brandRow}>
                    <View style={s.brandMark}><Text style={s.brandMarkText}>Q</Text></View>
                    <View>
                        <Text style={s.brandTitle}>Quad360 for Lenders</Text>
                        <Text style={s.brandSubtitle}>{lenderOrgName || 'Financing pipeline'}</Text>
                    </View>
                </View>
                <TouchableOpacity onPress={() => logout()}>
                    <Text style={s.signOut}>Sign Out</Text>
                </TouchableOpacity>
            </View>

            <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
                <Text style={s.title}>Financing Pipeline</Text>
                <Text style={s.subtitle}>
                    Businesses that opted in to being visible to lending partners, grouped by financing type they're
                    seeking. Every field here is an aggregate readiness signal — never a raw transaction.
                </Text>

                {byType.size > 0 && (
                    <View style={s.summaryRow}>
                        {Array.from(byType.entries()).map(([type, items]) => (
                            <View key={type} style={s.summaryCard}>
                                <Text style={s.summaryCount}>{items.length}</Text>
                                <Text style={s.summaryLabel}>{TYPE_LABEL[type]}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {bySector.length > 0 && (
                    <>
                        <Text style={s.sectorHeading}>Types of businesses in this pipeline</Text>
                        <View style={s.sectorRow}>
                            {bySector.map(([sector, count]) => (
                                <View key={sector} style={s.sectorChip}>
                                    <Text style={s.sectorChipText}>{sector} ({count})</Text>
                                </View>
                            ))}
                        </View>
                    </>
                )}

                <View style={s.filterBox}>
                    <ChipGroup
                        label="Financing type"
                        options={[
                            { value: 'all' as const, label: 'All' },
                            ...(Object.keys(TYPE_LABEL) as FinancingProductType[]).map(t => ({ value: t, label: TYPE_LABEL[t] })),
                        ]}
                        value={typeFilter ?? 'all'}
                        onChange={v => setTypeFilter(v === 'all' || v === null ? null : v)}
                        allowDeselect={false}
                    />

                    <ChipGroup
                        label="Debt-service capacity"
                        style={{ marginTop: 12 }}
                        options={[
                            { value: 'any' as const, label: 'Any' },
                            { value: 'healthy' as const, label: DSCR_LABEL.healthy },
                            { value: 'warning' as const, label: DSCR_LABEL.warning },
                            { value: 'danger' as const, label: DSCR_LABEL.danger },
                        ]}
                        value={dscrFilter ?? 'any'}
                        onChange={v => setDscrFilter(v === 'any' || v === null ? null : v)}
                        allowDeselect={false}
                    />

                    <View style={s.amountRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={s.filterLabel}>Requested (min)</Text>
                            <TextInput style={s.amountInput} keyboardType="numeric" placeholder="0" placeholderTextColor={Colors.textMuted} value={minAmtText} onChangeText={setMinAmtText} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.filterLabel}>Requested (max)</Text>
                            <TextInput style={s.amountInput} keyboardType="numeric" placeholder="No max" placeholderTextColor={Colors.textMuted} value={maxAmtText} onChangeText={setMaxAmtText} />
                        </View>
                    </View>
                </View>

                <Text style={s.resultCount}>{loading ? 'Loading…' : `${listings.length} business${listings.length === 1 ? '' : 'es'} match these filters`}</Text>

                {!loading && listings.length === 0 && (
                    <View style={s.emptyState}>
                        <Icon name="search" size={28} color={Colors.textMuted} />
                        <Text style={s.emptyText}>No opted-in businesses match these filters yet.</Text>
                    </View>
                )}

                {listings.map(l => (
                    <ExpandableCard
                        key={l.id}
                        expanded={expandedId === l.id}
                        onToggle={() => setExpandedId(expandedId === l.id ? null : l.id)}
                        showToggleHint={false}
                        header={
                            <>
                                <View style={s.rowHeader}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.rowType}>{TYPE_LABEL[l.financingType]}</Text>
                                        <Text style={s.rowMeta}>{l.sector || 'Sector unknown'}{l.revenueBand ? ` · ${l.revenueBand}` : ''}</Text>
                                    </View>
                                    <View style={[s.gradeBadge, { backgroundColor: (GRADE_COLOR[l.grade] || Colors.textMuted) + '22' }]}>
                                        <Text style={[s.gradeBadgeText, { color: GRADE_COLOR[l.grade] || Colors.textMuted }]}>{l.grade || '—'}</Text>
                                    </View>
                                </View>
                                <View style={s.rowMetrics}>
                                    <Text style={[s.rowMetric, { color: DSCR_COLOR[l.dscrStatus] }]}>{l.dscr.toFixed(1)}x · {DSCR_LABEL[l.dscrStatus]}</Text>
                                    {l.requestedAmount !== undefined && <Text style={s.rowMetric}>Requested {fmtAmt(l.requestedAmount)}</Text>}
                                    <Text style={[s.rowMetric, { color: Colors.textMuted }]}>{STATUS_LABEL[l.status] || l.status}</Text>
                                </View>
                            </>
                        }
                    >
                        {(() => {
                            const fit = describeListingFit(l, '');
                            return (
                                <>
                                    <View style={s.fitHeader}>
                                        <Text style={s.fitTitle}>Why this is a good fit</Text>
                                        <View style={[s.tierBadge, { backgroundColor: TIER_COLOR[fit.tier] + '22' }]}>
                                            <Text style={[s.tierBadgeText, { color: TIER_COLOR[fit.tier] }]}>{TIER_LABEL[fit.tier]}</Text>
                                        </View>
                                    </View>
                                    {fit.reasons.map((reason, i) => (
                                        <Text key={i} style={s.detailLine}>• {reason}</Text>
                                    ))}
                                </>
                            );
                        })()}
                        <Text style={s.consentNote}>
                            Shown here because this business opted in — Quad360 shares this readiness summary only, never underlying transactions.
                        </Text>
                    </ExpandableCard>
                ))}
            </ScrollView>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
    brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    brandMark: { width: 32, height: 32, borderRadius: 8, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
    brandMarkText: { color: '#fff', fontWeight: '800', fontSize: 14 },
    brandTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
    brandSubtitle: { fontSize: 11.5, color: Colors.textMuted },
    signOut: { fontSize: 13, color: Colors.expense, fontWeight: '600' },

    scroll: { flex: 1 },
    pad: { padding: 16, paddingBottom: 60 },
    title: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
    subtitle: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 17, marginBottom: 16 },

    summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
    summaryCard: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 12, minWidth: 100, borderWidth: 1, borderColor: Colors.border },
    summaryCount: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
    summaryLabel: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

    sectorHeading: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 8 },
    sectorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    sectorChip: { backgroundColor: Colors.surface, borderRadius: Radius.pill, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: Colors.border },
    sectorChipText: { fontSize: 11.5, color: Colors.textSecondary, fontWeight: '600' },

    filterBox: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
    filterLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 8 },
    amountRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    amountInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12.5, color: Colors.textPrimary, backgroundColor: Colors.bg },

    resultCount: { fontSize: 12, color: Colors.textMuted, marginBottom: 10 },

    emptyState: { alignItems: 'center', paddingVertical: 40, gap: 8 },
    emptyText: { fontSize: 12.5, color: Colors.textMuted },

    rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    rowType: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
    rowMeta: { fontSize: 11.5, color: Colors.textMuted, marginTop: 2 },
    gradeBadge: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    gradeBadgeText: { fontSize: 14, fontWeight: '800' },
    rowMetrics: { flexDirection: 'row', gap: 14, marginTop: 10, flexWrap: 'wrap' },
    rowMetric: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary },

    fitHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    fitTitle: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary },
    tierBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    tierBadgeText: { fontSize: 10, fontWeight: '700' },
    detailLine: { fontSize: 12, color: Colors.textSecondary, marginBottom: 6, lineHeight: 17 },
    consentNote: { fontSize: 10.5, color: Colors.textMuted, fontStyle: 'italic', marginTop: 6, lineHeight: 14 },
});
