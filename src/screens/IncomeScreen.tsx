import React, { useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import Icon, { IconName } from '../components/ui/Icon';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import { generateId } from '../utils/uuid';
import { canWriteBusinessData } from '../utils/rolePermissions';
import { showAlert } from '../utils/webAlert';
import { computeIncomeIntelligence, IncomeTier } from '../utils/incomeIntelligence';
import { computeIncomeAllocation, DEFAULT_ALLOCATION_BUCKETS, totalAllocationPct } from '../utils/incomeAllocation';
import { IncomeAllocationBucket } from '../types';

const TIER_META: Record<IncomeTier, { label: string; color: string; icon: IconName }> = {
    core:     { label: 'Core',     color: Colors.primary, icon: 'anchor' },
    growing:  { label: 'Growing',  color: Colors.income,  icon: 'trending-up' },
    'at-risk': { label: 'At Risk', color: Colors.expense, icon: 'alert-triangle' },
    emerging: { label: 'Emerging', color: Colors.textMuted, icon: 'sunrise' },
};

export default function IncomeScreen() {
    const { transactions, settings, updateSettings, cashPockets, userRole, setCurrentScreen } = useApp();
    const currency = settings.currency;
    const canEdit = canWriteBusinessData(userRole);

    const intelligence = useMemo(() => computeIncomeIntelligence(transactions, currency), [transactions, currency]);

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' });

    const savedBuckets = settings.incomeAllocationTargets ?? DEFAULT_ALLOCATION_BUCKETS;
    const [buckets, setBuckets] = useState<IncomeAllocationBucket[]>(savedBuckets);
    const [dirty, setDirty] = useState(false);

    const allocation = useMemo(
        () => computeIncomeAllocation(transactions, currentMonth, buckets, cashPockets),
        [transactions, currentMonth, buckets, cashPockets],
    );
    const totalPct = totalAllocationPct(buckets);

    const updateBucket = (id: string, patch: Partial<IncomeAllocationBucket>) => {
        setBuckets(prev => prev.map(b => (b.id === id ? { ...b, ...patch } : b)));
        setDirty(true);
    };
    const removeBucket = (id: string) => {
        setBuckets(prev => prev.filter(b => b.id !== id));
        setDirty(true);
    };
    const addBucket = () => {
        setBuckets(prev => [...prev, { id: generateId(), label: 'New Category', targetPct: 0 }]);
        setDirty(true);
    };
    const resetToDefaults = () => {
        setBuckets(DEFAULT_ALLOCATION_BUCKETS);
        setDirty(true);
    };
    const handleSaveAllocation = () => {
        if (buckets.some(b => !b.label.trim())) {
            showAlert('Missing label', 'Every allocation category needs a name.'); return;
        }
        updateSettings({ incomeAllocationTargets: buckets });
        setDirty(false);
        showAlert('Saved', 'Your income allocation plan has been updated.');
    };

    return (
        <SafeAreaView style={styles.safe}>
            <Header />
            <ScrollView style={styles.scroll} contentContainerStyle={styles.pad}>
                <View style={styles.titleRow}>
                    <Icon name="inbox" size={20} color={Colors.textPrimary} />
                    <Text style={styles.title}>Income</Text>
                </View>
                <Text style={styles.subtitle}>Where your revenue comes from, how it's trending, and where it should go</Text>

                {/* ── Income Intelligence ───────────────────────────────────── */}
                <View style={styles.sectionHeaderRow}>
                    <Icon name="activity" size={15} color={Colors.textSecondary} />
                    <Text style={styles.sectionHeader}>INCOME INTELLIGENCE</Text>
                </View>

                {!intelligence.available ? (
                    <View style={styles.card}>
                        <Text style={styles.emptyText}>{intelligence.reason}</Text>
                    </View>
                ) : (
                    <>
                        <View style={styles.card}>
                            <Text style={styles.narrative}>{intelligence.narrative}</Text>
                            <View style={styles.statRow}>
                                <View>
                                    <Text style={styles.statLabel}>Monthly income (avg)</Text>
                                    <Text style={styles.statValue}>{currency}{Math.round(intelligence.totalMonthlyRate).toLocaleString()}</Text>
                                </View>
                                {intelligence.overallGrowthPct !== null && (
                                    <View>
                                        <Text style={styles.statLabel}>vs prior {intelligence.windowMonths}mo</Text>
                                        <Text style={[styles.statValue, { color: intelligence.overallGrowthPct >= 0 ? Colors.income : Colors.expense }]}>
                                            {intelligence.overallGrowthPct >= 0 ? '+' : ''}{intelligence.overallGrowthPct.toFixed(0)}%
                                        </Text>
                                    </View>
                                )}
                            </View>
                        </View>

                        {intelligence.categories.map(c => {
                            const meta = TIER_META[c.tier];
                            return (
                                <View key={c.category} style={styles.card}>
                                    <View style={styles.categoryHeaderRow}>
                                        <Text style={styles.categoryName}>{c.category}</Text>
                                        <View style={[styles.tierBadge, { backgroundColor: meta.color + '22' }]}>
                                            <Icon name={meta.icon} size={11} color={meta.color} />
                                            <Text style={[styles.tierBadgeText, { color: meta.color }]}>{meta.label}</Text>
                                        </View>
                                    </View>
                                    <View style={styles.statRow}>
                                        <Text style={styles.categoryStat}>{currency}{Math.round(c.monthlyRate).toLocaleString()}/mo</Text>
                                        <Text style={styles.categoryStat}>{c.shareOfIncomePct.toFixed(0)}% of income</Text>
                                        {c.growthPct !== null && (
                                            <Text style={[styles.categoryStat, { color: c.growthPct >= 0 ? Colors.income : Colors.expense }]}>
                                                {c.growthPct >= 0 ? '+' : ''}{c.growthPct.toFixed(0)}%
                                            </Text>
                                        )}
                                    </View>
                                    <Text style={styles.categoryNarrative}>{c.narrative}</Text>
                                </View>
                            );
                        })}
                    </>
                )}

                {/* ── Income Allocation ─────────────────────────────────────── */}
                <View style={[styles.sectionHeaderRow, { marginTop: Spacing.xl }]}>
                    <Icon name="pie-chart" size={15} color={Colors.textSecondary} />
                    <Text style={styles.sectionHeader}>INCOME ALLOCATION</Text>
                </View>
                <Text style={styles.hint}>
                    Set what share of each period's income is meant for each purpose. Amounts below are calculated from {monthLabel}'s actual income{allocation.periodIncome === 0 ? ' (none recorded yet this month).' : '.'}
                </Text>

                <View style={styles.card}>
                    <View style={styles.statRow}>
                        <View>
                            <Text style={styles.statLabel}>{monthLabel} income</Text>
                            <Text style={styles.statValue}>{currency}{Math.round(allocation.periodIncome).toLocaleString()}</Text>
                        </View>
                        <View>
                            <Text style={styles.statLabel}>Allocated</Text>
                            <Text style={[styles.statValue, { color: allocation.balanced ? Colors.income : Colors.warning }]}>
                                {totalPct.toFixed(0)}%
                            </Text>
                        </View>
                    </View>
                    {!allocation.balanced && (
                        <Text style={styles.warningText}>
                            {totalPct > 100
                                ? `This adds up to ${totalPct.toFixed(0)}% — reduce some categories by ${(totalPct - 100).toFixed(0)} points so the plan doesn't over-commit income that isn't there.`
                                : `This only adds up to ${totalPct.toFixed(0)}% — ${(100 - totalPct).toFixed(0)}% of income has nowhere assigned yet.`}
                        </Text>
                    )}
                </View>

                {allocation.lines.map(line => (
                    <View key={line.id} style={styles.allocationRow}>
                        {canEdit ? (
                            <TextInput
                                style={styles.allocationLabelInput}
                                value={buckets.find(b => b.id === line.id)?.label ?? line.label}
                                onChangeText={(v) => updateBucket(line.id, { label: v })}
                                placeholder="Category"
                                placeholderTextColor={Colors.muted}
                            />
                        ) : (
                            <Text style={styles.allocationLabelText}>{line.label}</Text>
                        )}
                        <View style={styles.allocationPctWrap}>
                            {canEdit ? (
                                <TextInput
                                    style={styles.allocationPctInput}
                                    value={String(buckets.find(b => b.id === line.id)?.targetPct ?? line.targetPct)}
                                    onChangeText={(v) => updateBucket(line.id, { targetPct: Math.max(0, Math.min(100, parseInt(v, 10) || 0)) })}
                                    keyboardType="numeric"
                                />
                            ) : (
                                <Text style={styles.allocationPctText}>{line.targetPct}</Text>
                            )}
                            <Text style={styles.allocationPctSign}>%</Text>
                        </View>
                        <Text style={styles.allocationAmount}>{currency}{line.targetAmount.toLocaleString()}</Text>
                        {line.pocketBalance !== null && (
                            <Text style={styles.allocationPocket}>{currency}{Math.round(line.pocketBalance).toLocaleString()} in pocket</Text>
                        )}
                        {canEdit && (
                            <TouchableOpacity onPress={() => removeBucket(line.id)} style={styles.removeBtn} hitSlop={8}>
                                <Icon name="x" size={16} color={Colors.textMuted} />
                            </TouchableOpacity>
                        )}
                    </View>
                ))}

                {canEdit && (
                    <>
                        <TouchableOpacity style={styles.addBtn} onPress={addBucket}>
                            <Icon name="plus" size={14} color={Colors.primary} />
                            <Text style={styles.addBtnText}>Add category</Text>
                        </TouchableOpacity>

                        <View style={styles.saveRow}>
                            <TouchableOpacity style={styles.resetBtn} onPress={resetToDefaults}>
                                <Text style={styles.resetBtnText}>Reset to suggested split</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.saveBtn, !dirty && styles.saveBtnDisabled]} onPress={handleSaveAllocation} disabled={!dirty}>
                                <Text style={styles.saveBtnText}>Save Allocation Plan</Text>
                            </TouchableOpacity>
                        </View>
                    </>
                )}
            </ScrollView>
            <FooterNav />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: Spacing.lg, paddingBottom: 100 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xs },
    title: { fontSize: 24, fontWeight: '700', color: Colors.textPrimary },
    subtitle: { fontSize: 13, color: Colors.textMuted, marginBottom: Spacing.lg },

    sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.sm },
    sectionHeader: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 0.6 },
    hint: { fontSize: 12, color: Colors.textMuted, lineHeight: 18, marginBottom: Spacing.md },

    card: {
        backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md,
        marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
    },
    emptyText: { color: Colors.textMuted, fontSize: 13, lineHeight: 18 },
    narrative: { color: Colors.textPrimary, fontSize: 13, lineHeight: 19, marginBottom: Spacing.sm },

    statRow: { flexDirection: 'row', gap: Spacing.xl, flexWrap: 'wrap' },
    statLabel: { color: Colors.textMuted, fontSize: 11, marginBottom: 2 },
    statValue: { color: Colors.textPrimary, fontSize: 18, fontWeight: '700' },

    categoryHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.xs },
    categoryName: { color: Colors.textPrimary, fontSize: 14, fontWeight: '700' },
    tierBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.pill },
    tierBadgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
    categoryStat: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },
    categoryNarrative: { color: Colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: Spacing.xs },

    warningText: { color: Colors.warning, fontSize: 12, lineHeight: 17, marginTop: Spacing.sm },

    allocationRow: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        backgroundColor: Colors.surface, borderRadius: Radius.sm, padding: Spacing.sm,
        marginBottom: Spacing.xs, borderWidth: 1, borderColor: Colors.border, flexWrap: 'wrap',
    },
    allocationLabelInput: { flex: 1, minWidth: 100, color: Colors.textPrimary, fontSize: 13, fontWeight: '600' },
    allocationLabelText: { flex: 1, minWidth: 100, color: Colors.textPrimary, fontSize: 13, fontWeight: '600' },
    allocationPctWrap: { flexDirection: 'row', alignItems: 'center' },
    allocationPctInput: { width: 36, color: Colors.textPrimary, fontSize: 13, textAlign: 'right', padding: 0 },
    allocationPctText: { color: Colors.textPrimary, fontSize: 13 },
    allocationPctSign: { color: Colors.textMuted, fontSize: 13, marginLeft: 1 },
    allocationAmount: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', minWidth: 90, textAlign: 'right' },
    allocationPocket: { color: Colors.textMuted, fontSize: 11 },
    removeBtn: { padding: 2 },

    addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: Spacing.sm, marginBottom: Spacing.md },
    addBtnText: { color: Colors.primary, fontSize: 13, fontWeight: '600' },

    saveRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
    resetBtn: { flex: 1, paddingVertical: 14, borderRadius: Radius.sm, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
    resetBtnText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
    saveBtn: { flex: 1, backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: Radius.sm, alignItems: 'center' },
    saveBtnDisabled: { opacity: 0.5 },
    saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
});
