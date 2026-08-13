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
import { Radius, Shadow, Spacing } from '../theme/tokens';
import { loadPipelineListingsForLender, PipelineListingFilters } from '../utils/financingPipeline';
import { FinancingProductType, PipelineListing } from '../types';

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

                <View style={s.filterBox}>
                    <Text style={s.filterLabel}>Financing type</Text>
                    <View style={s.chipRow}>
                        <TouchableOpacity style={[s.chip, !typeFilter && s.chipSelected]} onPress={() => setTypeFilter(null)}>
                            <Text style={[s.chipText, !typeFilter && s.chipTextSelected]}>All</Text>
                        </TouchableOpacity>
                        {(Object.keys(TYPE_LABEL) as FinancingProductType[]).map(t => (
                            <TouchableOpacity key={t} style={[s.chip, typeFilter === t && s.chipSelected]} onPress={() => setTypeFilter(typeFilter === t ? null : t)}>
                                <Text style={[s.chipText, typeFilter === t && s.chipTextSelected]}>{TYPE_LABEL[t]}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <Text style={[s.filterLabel, { marginTop: 12 }]}>Debt-service capacity</Text>
                    <View style={s.chipRow}>
                        <TouchableOpacity style={[s.chip, !dscrFilter && s.chipSelected]} onPress={() => setDscrFilter(null)}>
                            <Text style={[s.chipText, !dscrFilter && s.chipTextSelected]}>Any</Text>
                        </TouchableOpacity>
                        {(['healthy', 'warning', 'danger'] as const).map(d => (
                            <TouchableOpacity key={d} style={[s.chip, dscrFilter === d && s.chipSelected]} onPress={() => setDscrFilter(dscrFilter === d ? null : d)}>
                                <Text style={[s.chipText, dscrFilter === d && s.chipTextSelected]}>{DSCR_LABEL[d]}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

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

                {listings.map(l => {
                    const expanded = expandedId === l.id;
                    return (
                        <TouchableOpacity key={l.id} style={s.row} onPress={() => setExpandedId(expanded ? null : l.id)} activeOpacity={0.8}>
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
                            {expanded && (
                                <View style={s.detailBox}>
                                    <Text style={s.detailLine}>Band: {l.band || '—'} · Score: {Math.round(l.score)}/100</Text>
                                    {l.purpose && <Text style={s.detailLine}>Purpose: {l.purpose}</Text>}
                                    <Text style={s.consentNote}>
                                        Shown here because this business opted in — Quad360 shares this readiness summary only, never underlying transactions.
                                    </Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    );
                })}
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

    filterBox: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
    filterLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 8 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { borderWidth: 1, borderColor: Colors.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: Colors.bg },
    chipSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + '18' },
    chipText: { fontSize: 11.5, color: Colors.textSecondary, fontWeight: '600' },
    chipTextSelected: { color: Colors.primary },
    amountRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    amountInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12.5, color: Colors.textPrimary, backgroundColor: Colors.bg },

    resultCount: { fontSize: 12, color: Colors.textMuted, marginBottom: 10 },

    emptyState: { alignItems: 'center', paddingVertical: 40, gap: 8 },
    emptyText: { fontSize: 12.5, color: Colors.textMuted },

    row: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    rowType: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
    rowMeta: { fontSize: 11.5, color: Colors.textMuted, marginTop: 2 },
    gradeBadge: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    gradeBadgeText: { fontSize: 14, fontWeight: '800' },
    rowMetrics: { flexDirection: 'row', gap: 14, marginTop: 10, flexWrap: 'wrap' },
    rowMetric: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary },

    detailBox: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border },
    detailLine: { fontSize: 12, color: Colors.textSecondary, marginBottom: 4 },
    consentNote: { fontSize: 10.5, color: Colors.textMuted, fontStyle: 'italic', marginTop: 6, lineHeight: 14 },
});
