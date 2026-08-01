import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { computeCashRunway } from '../utils/cashRunway';
import { computeAgingBuckets } from '../utils/finance';
import { computeInventoryValue } from '../utils/stockVelocity';
import { totalMonthlyLoanBurden } from '../utils/loanMath';
import {
    computeFreeCashFlow,
    computeCashConversionCycle,
    computeObligationsWaterfall,
    computeRevenueShockImpact,
    computeFullCapitalCapacity,
} from '../utils/cfoMetrics';
import { CommitmentStatus, CommitmentKPI } from '../types';

function fmt(currency: string, n: number): string {
    return `${currency}${Math.round(n).toLocaleString()}`;
}

const STATUS_COLOR: Record<CommitmentStatus, string> = {
    'on-track': Colors.income,
    'at-risk': Colors.warning,
    'off-track': Colors.expense,
    'not-started': Colors.textMuted,
};
const STATUS_LABEL: Record<CommitmentStatus, string> = {
    'on-track': '🟢 On Track',
    'at-risk': '🟡 At Risk',
    'off-track': '🔴 Off Track',
    'not-started': '⚪ Not Started',
};

// "7 Questions Every CEO Should Ask Their CFO" — each section composes
// numbers Quad360 already tracks (cash, AP aging, loans, invoices,
// inventory) into the specific shape each question asks for, rather than
// inventing a new metric. Where a question genuinely needs a new kind of
// record (Q7 — is an investment delivering what it was approved for),
// this adds one: a Capital Commitment with a few KPIs the owner updates
// themselves, since Quad360 has no way to auto-detect whether spend on
// equipment or marketing is "delivering."
export default function CFOQuestionsTab() {
    const {
        transactions, loans, invoices, inventory, finance, settings, navigate,
        capitalCommitments, addCommitment, updateCommitment, deleteCommitment,
    } = useApp();
    const { currency } = settings;

    const [revenueMissPct, setRevenueMissPct] = useState(15);
    const [showAddCommitment, setShowAddCommitment] = useState(false);
    const EMPTY_COMMITMENT_FORM = { name: '', amountApproved: '', purpose: '', kpiName: '', kpiTarget: '', kpiActual: '' };
    const [form, setForm] = useState(EMPTY_COMMITMENT_FORM);
    const setField = (field: keyof typeof EMPTY_COMMITMENT_FORM) => (value: string) => setForm(f => ({ ...f, [field]: value }));

    const { dailyBurn } = useMemo(() => computeCashRunway(transactions, finance.cashBalance), [transactions, finance.cashBalance]);

    const apBuckets = useMemo(() => computeAgingBuckets(transactions, 'expense'), [transactions]);
    const upcoming30dayAP = apBuckets[0]?.total ?? 0;

    const inventoryValue = useMemo(() => computeInventoryValue(inventory), [inventory]);

    // Same accrual figures AccrualCashFlow.tsx already computes — reused
    // here, not re-derived differently. One pass over transactions instead
    // of four separate filter+reduce scans.
    const { cashIncome, cashExpenses, unpaidExpenses, trailing30Revenue } = useMemo(() => {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        const cutoffStr = cutoff.toISOString().split('T')[0];

        let cashIncome = 0, cashExpenses = 0, unpaidExpenses = 0, trailing30Revenue = 0;
        for (const t of transactions) {
            if (t.type === 'income' && t.status === 'paid') {
                cashIncome += t.amount;
                if (t.date >= cutoffStr) trailing30Revenue += t.amount;
            } else if (t.type === 'expense') {
                if (t.status === 'paid') cashExpenses += t.amount;
                else if (t.status === 'pending' || t.status === 'overdue') unpaidExpenses += t.amount;
            }
        }
        return { cashIncome, cashExpenses, unpaidExpenses, trailing30Revenue };
    }, [transactions]);

    const unpaidInvoicesTotal = useMemo(() => invoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + (i.total ?? 0), 0), [invoices]);
    const accrualRevenue = cashIncome + unpaidInvoicesTotal;
    const accrualExpenses = cashExpenses + unpaidExpenses;

    const reserveTarget = parseFloat(settings.minReserve) || 0;
    const quarterlyTaxEstimate = accrualRevenue * (parseFloat(settings.defaultTaxRate) || 0) / 4;
    const upcoming30dayDebtService = useMemo(() => totalMonthlyLoanBurden(loans), [loans]);

    // Q1
    const freeCashFlow = useMemo(
        () => computeFreeCashFlow(finance.cashBalance, upcoming30dayAP, upcoming30dayDebtService, reserveTarget),
        [finance.cashBalance, upcoming30dayAP, upcoming30dayDebtService, reserveTarget],
    );

    // Q2
    const ccc = useMemo(
        () => computeCashConversionCycle(unpaidInvoicesTotal, accrualRevenue, unpaidExpenses, accrualExpenses, inventoryValue),
        [unpaidInvoicesTotal, accrualRevenue, unpaidExpenses, accrualExpenses, inventoryValue],
    );

    // Q3
    const waterfall = useMemo(
        () => computeObligationsWaterfall(loans, upcoming30dayAP, quarterlyTaxEstimate),
        [loans, upcoming30dayAP, quarterlyTaxEstimate],
    );

    // Q5
    const capitalCapacity = useMemo(
        () => computeFullCapitalCapacity(freeCashFlow.deployableCash, 0, inventoryValue > 0 ? inventoryValue * 0.4 : 0),
        [freeCashFlow.deployableCash, inventoryValue],
    );

    // Q6
    const revenueShock = useMemo(
        () => computeRevenueShockImpact(finance.cashBalance, dailyBurn, trailing30Revenue, revenueMissPct),
        [finance.cashBalance, dailyBurn, trailing30Revenue, revenueMissPct],
    );

    const resetForm = () => {
        setForm(EMPTY_COMMITMENT_FORM);
        setShowAddCommitment(false);
    };

    const saveCommitment = () => {
        if (!form.name.trim() || !(parseFloat(form.amountApproved) > 0)) return;
        const kpis: CommitmentKPI[] = form.kpiName.trim()
            ? [{ id: `kpi-${Date.now()}`, name: form.kpiName.trim(), target: parseFloat(form.kpiTarget) || 0, actual: parseFloat(form.kpiActual) || 0 }]
            : [];
        addCommitment({
            name: form.name.trim(),
            amountApproved: parseFloat(form.amountApproved) || 0,
            purpose: form.purpose.trim(),
            approvedDate: new Date().toISOString().split('T')[0],
            kpis,
            status: 'not-started',
        });
        resetForm();
    };

    return (
        <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
            <Text style={s.pageTitle}>7 Questions Every CEO Should Ask</Text>
            <Text style={s.pageSub}>Answered from your own numbers — not generic advice.</Text>

            {/* Q1 */}
            <View style={s.card}>
                <Text style={s.qLabel}>Q1</Text>
                <Text style={s.qTitle}>How much cash can we actually deploy?</Text>
                <Text style={s.qResult}>{fmt(currency, freeCashFlow.deployableCash)}</Text>
                <Row label="Cash balance" value={fmt(currency, freeCashFlow.cashBalance)} />
                <Row label="Due within 30 days (AP)" value={`− ${fmt(currency, freeCashFlow.upcoming30dayAP)}`} negative />
                <Row label="Reserve target" value={`− ${fmt(currency, freeCashFlow.reserveTarget)}`} negative />
                <Text style={s.qNote}>What's left after upcoming payables and your reserve target — the number that's actually yours to spend.</Text>
            </View>

            {/* Q2 */}
            <View style={s.card}>
                <Text style={s.qLabel}>Q2</Text>
                <Text style={s.qTitle}>How fast do earnings turn into cash?</Text>
                <View style={s.statRow}>
                    <Stat label="DSO" value={`${ccc.dso.toFixed(0)}d`} />
                    <Stat label="DIO" value={`${ccc.dio.toFixed(0)}d`} />
                    <Stat label="DPO" value={`${ccc.dpo.toFixed(0)}d`} />
                    <Stat label="Cash Cycle" value={`${ccc.ccc.toFixed(0)}d`} highlight />
                </View>
                <Text style={s.qNote}>
                    Days Sales + Days Inventory − Days Payables Outstanding. Lower means cash is tied up for fewer days between spending and collecting. DIO/DPO use total costs as a base (no separate COGS category exists across every business type), so treat this as directional, not exact.
                </Text>
            </View>

            {/* Q3 */}
            <View style={s.card}>
                <Text style={s.qLabel}>Q3</Text>
                <Text style={s.qTitle}>What's already spoken for over the next four quarters?</Text>
                {waterfall.quarters.map(q => (
                    <View key={q.label} style={s.quarterRow}>
                        <Text style={s.quarterLabel}>{q.label}</Text>
                        <View style={s.flex}>
                            <Text style={s.quarterBreakdown}>
                                Debt {fmt(currency, q.debtService)} · Tax {fmt(currency, q.taxDue)}{q.payablesDue > 0 ? ` · AP ${fmt(currency, q.payablesDue)}` : ''}
                            </Text>
                        </View>
                        <Text style={s.quarterTotal}>{fmt(currency, q.total)}</Text>
                    </View>
                ))}
                <Row label="Total committed (4Q)" value={fmt(currency, waterfall.totalCommitted)} bold />
                <Text style={s.qNote}>Loan payments count only while each loan is still within its term. Tax is a flat estimate from your default tax rate — not a filing.</Text>
            </View>

            {/* Q4 */}
            <View style={s.card}>
                <Text style={s.qLabel}>Q4</Text>
                <Text style={s.qTitle}>How far ahead can we see our cash position?</Text>
                <Text style={s.qNote}>Quad360 already models this — a rolling 13-week cash timeline, not a guess.</Text>
                <TouchableOpacity style={s.linkBtn} onPress={() => navigate('cashflow')}>
                    <Text style={s.linkBtnText}>Open 13-Week Cash Forecast →</Text>
                </TouchableOpacity>
            </View>

            {/* Q5 */}
            <View style={s.card}>
                <Text style={s.qLabel}>Q5</Text>
                <Text style={s.qTitle}>What's our full capital capacity?</Text>
                <Text style={s.qResult}>{fmt(currency, capitalCapacity.total)}</Text>
                {capitalCapacity.sources.map(src => (
                    <Row key={src.label} label={src.label} value={fmt(currency, src.amount)} />
                ))}
                {capitalCapacity.sources.length === 0 && (
                    <Text style={s.qNote}>No deployable cash or inventory to base this on yet.</Text>
                )}
                <TouchableOpacity style={s.linkBtn} onPress={() => navigate('credit-worthiness')}>
                    <Text style={s.linkBtnText}>See Estimated Lending Capacity →</Text>
                </TouchableOpacity>
                <Text style={s.qNote}>Internal deployable cash and inventory-backed potential are illustrative sums, not offers. Estimated lending capacity (credit-flow-based) isn't included here — see it on Credit-Worthiness.</Text>
            </View>

            {/* Q6 */}
            <View style={s.card}>
                <Text style={s.qLabel}>Q6</Text>
                <Text style={s.qTitle}>What breaks if revenue misses by {revenueMissPct}%?</Text>
                <View style={s.chipRow}>
                    {[10, 15, 25, 50].map(pct => (
                        <TouchableOpacity key={pct} style={[s.chip, revenueMissPct === pct && s.chipSelected]} onPress={() => setRevenueMissPct(pct)}>
                            <Text style={[s.chipText, revenueMissPct === pct && s.chipTextSelected]}>{pct}%</Text>
                        </TouchableOpacity>
                    ))}
                </View>
                <View style={s.statRow}>
                    <Stat label="Current Runway" value={isFinite(revenueShock.baselineRunwayDays) ? `${Math.round(revenueShock.baselineRunwayDays)}d` : '∞'} />
                    <Stat label="Runway After Miss" value={isFinite(revenueShock.stressedRunwayDays) ? `${Math.round(revenueShock.stressedRunwayDays)}d` : '∞'} highlight />
                </View>
                <View style={[s.verdictBox, { borderColor: revenueShock.verdict === 'safe' ? Colors.income : revenueShock.verdict === 'caution' ? Colors.warning : Colors.expense }]}>
                    <Text style={s.verdictText}>{revenueShock.reason}</Text>
                </View>
            </View>

            {/* Q7 */}
            <View style={s.card}>
                <Text style={s.qLabel}>Q7</Text>
                <Text style={s.qTitle}>Is each investment delivering what we approved it for?</Text>
                <Text style={s.qNote}>Track a capital commitment and check its real numbers against what was approved — no auto-detection, this is a record you keep yourself.</Text>

                {capitalCommitments.map(c => (
                    <View key={c.id} style={s.commitmentRow}>
                        <View style={s.commitmentHeader}>
                            <Text style={s.commitmentName}>{c.name}</Text>
                            <TouchableOpacity onPress={() => deleteCommitment(c.id)}>
                                <Text style={s.removeBtn}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={s.commitmentMeta}>{fmt(currency, c.amountApproved)} · {c.purpose || 'No purpose noted'}</Text>
                        {c.kpis.map(k => (
                            <Text key={k.id} style={s.kpiRow}>
                                {k.name}: {k.actual.toLocaleString()} / {k.target.toLocaleString()} target
                            </Text>
                        ))}
                        <View style={s.statusRow}>
                            {(['not-started', 'on-track', 'at-risk', 'off-track'] as CommitmentStatus[]).map(st => (
                                <TouchableOpacity key={st} style={[s.statusChip, c.status === st && { borderColor: STATUS_COLOR[st], backgroundColor: STATUS_COLOR[st] + '18' }]} onPress={() => updateCommitment(c.id, { status: st })}>
                                    <Text style={[s.statusChipText, c.status === st && { color: STATUS_COLOR[st] }]}>{STATUS_LABEL[st]}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                ))}

                {!showAddCommitment ? (
                    <TouchableOpacity style={s.addBtn} onPress={() => setShowAddCommitment(true)}>
                        <Text style={s.addBtnText}>+ Track a Capital Commitment</Text>
                    </TouchableOpacity>
                ) : (
                    <View style={s.form}>
                        <TextInput style={s.input} value={form.name} onChangeText={setField('name')} placeholder="e.g. New delivery van" placeholderTextColor={Colors.textMuted} />
                        <TextInput style={s.input} value={form.amountApproved} onChangeText={setField('amountApproved')} keyboardType="decimal-pad" placeholder={`Amount approved (${currency})`} placeholderTextColor={Colors.textMuted} />
                        <TextInput style={s.input} value={form.purpose} onChangeText={setField('purpose')} placeholder="Purpose" placeholderTextColor={Colors.textMuted} />
                        <Text style={s.formSubLabel}>Optional: one KPI to track</Text>
                        <TextInput style={s.input} value={form.kpiName} onChangeText={setField('kpiName')} placeholder="e.g. Deliveries per week" placeholderTextColor={Colors.textMuted} />
                        <View style={s.row}>
                            <TextInput style={[s.input, s.flex]} value={form.kpiTarget} onChangeText={setField('kpiTarget')} keyboardType="decimal-pad" placeholder="Target" placeholderTextColor={Colors.textMuted} />
                            <TextInput style={[s.input, s.flex]} value={form.kpiActual} onChangeText={setField('kpiActual')} keyboardType="decimal-pad" placeholder="Actual so far" placeholderTextColor={Colors.textMuted} />
                        </View>
                        <View style={s.row}>
                            <TouchableOpacity style={[s.addBtn, s.flex]} onPress={saveCommitment}>
                                <Text style={s.addBtnText}>Save</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[s.cancelBtn, s.flex]} onPress={resetForm}>
                                <Text style={s.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            </View>
        </ScrollView>
    );
}

function Row({ label, value, negative, bold }: { label: string; value: string; negative?: boolean; bold?: boolean }) {
    return (
        <View style={s.simpleRow}>
            <Text style={s.simpleRowLabel}>{label}</Text>
            <Text style={[s.simpleRowValue, negative && { color: Colors.expense }, bold && { fontWeight: '800' }]}>{value}</Text>
        </View>
    );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
    return (
        <View style={s.stat}>
            <Text style={s.statLabel}>{label}</Text>
            <Text style={[s.statVal, highlight && { color: Colors.primary }]}>{value}</Text>
        </View>
    );
}

const s = StyleSheet.create({
    scroll: { flex: 1, backgroundColor: Colors.bg },
    pad: { padding: 16, paddingBottom: 100 },
    pageTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
    pageSub: { fontSize: 12, color: Colors.textMuted, marginBottom: 16 },

    card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 14 },
    qLabel: { fontSize: 11, fontWeight: '800', color: Colors.primary, marginBottom: 4 },
    qTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 },
    qResult: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary, marginBottom: 8 },
    qNote: { fontSize: 11, color: Colors.textMuted, lineHeight: 16, marginTop: 8, fontStyle: 'italic' },

    simpleRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
    simpleRowLabel: { fontSize: 12.5, color: Colors.textSecondary },
    simpleRowValue: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary },

    statRow: { flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 4 },
    stat: { flex: 1, backgroundColor: Colors.bg, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 10, alignItems: 'center' },
    statLabel: { fontSize: 10, color: Colors.textMuted, marginBottom: 4 },
    statVal: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },

    quarterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
    quarterLabel: { fontSize: 12.5, fontWeight: '800', color: Colors.textSecondary, width: 30 },
    quarterBreakdown: { fontSize: 11, color: Colors.textMuted },
    quarterTotal: { fontSize: 12.5, fontWeight: '800', color: Colors.textPrimary },
    flex: { flex: 1 },

    linkBtn: { backgroundColor: Colors.primary + '18', borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginTop: 8 },
    linkBtnText: { color: Colors.primary, fontWeight: '700', fontSize: 12.5 },

    chipRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border },
    chipSelected: { backgroundColor: Colors.primary + '20', borderColor: Colors.primary },
    chipText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
    chipTextSelected: { color: Colors.primary },

    verdictBox: { borderRadius: 10, borderWidth: 1.5, padding: 12, marginTop: 8 },
    verdictText: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },

    commitmentRow: { backgroundColor: Colors.bg, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 12, marginTop: 10 },
    commitmentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    commitmentName: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    commitmentMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2, marginBottom: 6 },
    kpiRow: { fontSize: 11.5, color: Colors.textSecondary, marginBottom: 2 },
    removeBtn: { color: Colors.expense, fontSize: 13, fontWeight: '700' },
    statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    statusChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
    statusChipText: { fontSize: 10.5, color: Colors.textMuted, fontWeight: '600' },

    addBtn: { backgroundColor: Colors.primary, borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginTop: 10 },
    addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
    cancelBtn: { backgroundColor: Colors.bg, borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: Colors.border },
    cancelBtnText: { color: Colors.textSecondary, fontWeight: '700', fontSize: 13 },
    form: { marginTop: 10 },
    formSubLabel: { fontSize: 11, color: Colors.textMuted, marginTop: 4, marginBottom: 4 },
    input: { backgroundColor: Colors.bg, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: Colors.textPrimary, marginBottom: 8 },
    row: { flexDirection: 'row', gap: 8 },
});
