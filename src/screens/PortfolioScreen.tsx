/**
 * Portfolio -- combined cash/revenue/expense/profit across every business
 * one login OWNS (your own primary business + any shadow businesses
 * created via "+ Add a Business" in the Header switcher). Phase 2a: reads
 * every owned business's data directly (bypassing the active-workspace
 * pointer -- see loadTransactionsForOwner's comment in storage.ts) and
 * reuses the exact same computeFinance() call the single-business
 * Dashboard already uses per business, so these figures always match what
 * that business's own Dashboard shows. Same-currency only for now: mixed
 * currencies show a per-business breakdown with no misleading combined
 * sum, rather than adding incompatible currencies together. Converting to
 * one reporting currency is a deliberate later phase, not bundled here.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import Icon from '../components/ui/Icon';
import { getAuthUserId, loadAssetsForOwner, loadMyTeamMemberships, loadSettingsForOwner, loadTransactionsForOwner } from '../utils/storage';
import { computePortfolioSummary, PortfolioSummary } from '../utils/portfolio';

function fmt(currency: string, value: number): string {
    const sign = value < 0 ? '-' : '';
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${sign}${currency}${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}${currency}${(abs / 1_000).toFixed(1)}K`;
    return `${sign}${currency}${Math.round(abs).toLocaleString()}`;
}

function SectionCard({ icon, title, subtitle, children }: { icon: string; title: string; subtitle: string; children: React.ReactNode }) {
    return (
        <View style={s.card}>
            <View style={s.cardHead}>
                <View style={s.cardIconWrap}><Icon name={icon as any} size={16} color={Colors.primary} /></View>
                <View style={{ flex: 1 }}>
                    <Text style={s.cardTitle}>{title}</Text>
                    <Text style={s.cardSubtitle}>{subtitle}</Text>
                </View>
            </View>
            {children}
        </View>
    );
}

export default function PortfolioScreen() {
    const { workspaceVersion } = useApp();
    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState<PortfolioSummary | null>(null);
    // Distinct from "no data yet" -- a business whose settings genuinely
    // failed to load (network blip, not a missing row) must NOT silently
    // fall through to currencyCode: '', which would never equal another
    // business's real code and get misreported as "these businesses use
    // different currencies" when the real problem is just a failed fetch.
    const [loadError, setLoadError] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(false);
        try {
            // Fetched directly rather than via the shared teamMemberships
            // context state -- reading that state right after calling its
            // own refresh function would race a stale closure (the exact
            // bug fixed earlier in switchBusiness's businessName patch):
            // setTeamMemberships() updates asynchronously, and this
            // function's own closure over the old context value wouldn't
            // see it until a later render. A direct call has no such gap.
            const [myId, memberships] = await Promise.all([getAuthUserId(), loadMyTeamMemberships()]);
            if (!myId) { setSummary(null); return; }

            // Own primary business + every second/third business this same
            // login owns outright (role === 'owner' memberships -- see
            // createBusiness() in storage.ts and migration 040). Deliberately
            // excludes businesses this login was merely INVITED into: a
            // portfolio view combining someone else's numbers into your own
            // isn't what "the businesses you own" means here, and those
            // businesses were encrypted with a different login's key anyway
            // (see portfolio.ts's header comment).
            const ownedIds = [myId, ...memberships.filter(m => m.role === 'owner').map(m => m.ownerUserId)];

            const results = await Promise.all(ownedIds.map(async (ownerId) => {
                const [settings, transactions, assets] = await Promise.all([
                    loadSettingsForOwner(ownerId),
                    loadTransactionsForOwner(ownerId),
                    loadAssetsForOwner(ownerId),
                ]);
                return { ownerId, settings, transactions, assets };
            }));

            if (results.some(r => !r.settings)) { setLoadError(true); setSummary(null); return; }

            const inputs = results.map(({ ownerId, settings, transactions, assets }) => ({
                ownerId,
                businessName: settings!.businessName || 'Business',
                currency: settings!.currency || '',
                currencyCode: settings!.currencyCode || '',
                transactions,
                assets,
                settings: {
                    openingAssets: settings!.openingAssets ?? '0',
                    openingLiabilities: settings!.openingLiabilities ?? '0',
                    openingLoans: settings!.openingLoans ?? '0',
                    openingOtherAssets: settings!.openingOtherAssets ?? '0',
                },
            }));

            setSummary(computePortfolioSummary(inputs));
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workspaceVersion]);

    useEffect(() => { load(); }, [load]);

    const businesses = summary?.businesses ?? [];
    const hasMultiple = businesses.length > 1;

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 48 }}>
                <View style={s.pad}>
                    <Text style={s.title}>Portfolio</Text>
                    <Text style={s.subtitle}>
                        Combined cash, revenue & profit across every business you own.
                    </Text>

                    {loading ? (
                        <View style={s.loadingBox}>
                            <ActivityIndicator size="small" color={Colors.primary} />
                        </View>
                    ) : loadError ? (
                        <View style={s.warnBox}>
                            <Icon name="alert-triangle" size={16} color={Colors.warning} />
                            <View style={{ flex: 1 }}>
                                <Text style={s.warnText}>Couldn't load one of your businesses just now — try again.</Text>
                                <TouchableOpacity onPress={load} style={s.retryBtn}>
                                    <Text style={s.retryBtnText}>Retry</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ) : !hasMultiple ? (
                        <View style={s.emptyBox}>
                            <Icon name="briefcase" size={18} color={Colors.textMuted} />
                            <Text style={s.emptyText}>
                                You only own one business right now. Create a second one from the business switcher (next to your email, top right) to see a combined view here.
                            </Text>
                        </View>
                    ) : (
                        <>
                            {summary!.sameCurrency ? (
                                <SectionCard icon="pie-chart" title="Combined" subtitle={`All ${businesses.length} businesses you own, in ${summary!.combinedCurrency}`}>
                                    <View style={s.tileRow}>
                                        <View style={s.tile}>
                                            <Text style={s.tileLabel}>Cash</Text>
                                            <Text style={s.tileValue}>{fmt(summary!.combinedCurrency!, summary!.combinedCashBalance!)}</Text>
                                        </View>
                                        <View style={s.tile}>
                                            <Text style={s.tileLabel}>Profit</Text>
                                            <Text style={[s.tileValue, summary!.combinedProfit! < 0 && s.tileValueNegative]}>
                                                {fmt(summary!.combinedCurrency!, summary!.combinedProfit!)}
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={s.tileRow}>
                                        <View style={s.tile}>
                                            <Text style={s.tileLabel}>Revenue</Text>
                                            <Text style={s.tileValue}>{fmt(summary!.combinedCurrency!, summary!.combinedIncome!)}</Text>
                                        </View>
                                        <View style={s.tile}>
                                            <Text style={s.tileLabel}>Expenses</Text>
                                            <Text style={s.tileValue}>{fmt(summary!.combinedCurrency!, summary!.combinedExpense!)}</Text>
                                        </View>
                                    </View>
                                </SectionCard>
                            ) : (
                                <View style={s.warnBox}>
                                    <Icon name="alert-triangle" size={16} color={Colors.warning} />
                                    <Text style={s.warnText}>
                                        These businesses use different currencies, so combined totals aren't shown here yet — see each business's own figures below.
                                    </Text>
                                </View>
                            )}

                            <SectionCard icon="list" title="By Business" subtitle="Each business's own figures, same as its own Dashboard">
                                {businesses.map(b => (
                                    <View key={b.ownerId} style={s.bizRow}>
                                        <Text style={s.bizName} numberOfLines={1}>{b.businessName}</Text>
                                        <View style={s.bizFigRow}>
                                            <View style={s.bizFig}>
                                                <Text style={s.bizFigLabel}>Cash</Text>
                                                <Text style={s.bizFigValue}>{fmt(b.currency, b.cashBalance)}</Text>
                                            </View>
                                            <View style={s.bizFig}>
                                                <Text style={s.bizFigLabel}>Profit</Text>
                                                <Text style={[s.bizFigValue, b.profit < 0 && s.tileValueNegative]}>{fmt(b.currency, b.profit)}</Text>
                                            </View>
                                            <View style={s.bizFig}>
                                                <Text style={s.bizFigLabel}>Margin</Text>
                                                <Text style={s.bizFigValue}>{b.margin.toFixed(0)}%</Text>
                                            </View>
                                        </View>
                                    </View>
                                ))}
                            </SectionCard>
                        </>
                    )}
                </View>
            </ScrollView>
            <FooterNav />
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: Spacing.lg },
    title: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
    subtitle: { fontSize: 13, color: Colors.textMuted, marginTop: 4, marginBottom: Spacing.lg, lineHeight: 18 },
    loadingBox: { paddingVertical: Spacing.xl, alignItems: 'center' },
    card: {
        backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
        padding: Spacing.md, marginBottom: Spacing.md, ...Shadow.sm,
    },
    cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.md },
    cardIconWrap: {
        width: 30, height: 30, borderRadius: Radius.md, backgroundColor: Colors.primary + '15',
        alignItems: 'center', justifyContent: 'center',
    },
    cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
    cardSubtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 2, lineHeight: 16 },
    emptyBox: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start', backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md },
    emptyText: { flex: 1, fontSize: 12.5, color: Colors.textMuted, lineHeight: 17 },
    warnBox: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start', backgroundColor: Colors.warning + '15', borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.warning + '33', padding: Spacing.md, marginBottom: Spacing.md },
    warnText: { flex: 1, fontSize: 12.5, color: Colors.textPrimary, lineHeight: 17 },
    retryBtn: { marginTop: 8, alignSelf: 'flex-start' },
    retryBtnText: { fontSize: 12.5, fontWeight: '700', color: Colors.primary },
    tileRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
    tile: { flex: 1, backgroundColor: Colors.bg, borderRadius: Radius.md, padding: Spacing.md },
    tileLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
    tileValue: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, marginTop: 4 },
    tileValueNegative: { color: Colors.danger },
    bizRow: { paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
    bizName: { fontSize: 13.5, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
    bizFigRow: { flexDirection: 'row', gap: Spacing.lg },
    bizFig: {},
    bizFigLabel: { fontSize: 10.5, color: Colors.textMuted, fontWeight: '600' },
    bizFigValue: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginTop: 1 },
});
