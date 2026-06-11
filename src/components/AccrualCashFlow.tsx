import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Transaction, Invoice, FinanceData } from '../types';
import { Colors } from '../theme/colors';

interface Props {
    transactions: Transaction[];
    invoices: Invoice[];
    finance: FinanceData;
    currency: string;
}

export default function AccrualCashFlow({ transactions, invoices, finance, currency }: Props) {
    // ── Section 1 — Accrual Revenue ───────────────────────────────────────────
    const cashIncome = transactions
        .filter(t => t.type === 'income' && t.status === 'paid')
        .reduce((s, t) => s + t.amount, 0);

    const unpaidInvoicesTotal = invoices
        .filter(inv => inv.status === 'sent' || inv.status === 'overdue')
        .reduce((s, inv) => s + inv.total, 0);

    const accrualRevenue = cashIncome + unpaidInvoicesTotal;

    // ── Section 2 — Accrual Expenses ─────────────────────────────────────────
    const cashExpenses = transactions
        .filter(t => t.type === 'expense' && t.status === 'paid')
        .reduce((s, t) => s + t.amount, 0);

    const unpaidExpenses = transactions
        .filter(t => t.type === 'expense' && (t.status === 'pending' || t.status === 'overdue'))
        .reduce((s, t) => s + t.amount, 0);

    const accrualExpenses = cashExpenses + unpaidExpenses;

    // ── Section 3 — Accrual Profit ────────────────────────────────────────────
    const accrualNetProfit = accrualRevenue - accrualExpenses;
    const cashNetProfit = finance.profit;
    const difference = accrualNetProfit - cashNetProfit;

    // ── Section 4 — Working Capital ───────────────────────────────────────────
    const receivables = unpaidInvoicesTotal;
    const payables = unpaidExpenses;
    const netWorkingCapital = receivables - payables;
    const dso = accrualRevenue > 0 ? (receivables / accrualRevenue) * 30 : 0;

    return (
        <View>
            {/* Section 1 */}
            <SectionCard title="Accrual Revenue">
                <CFRow label="Cash income received" value={cashIncome} currency={currency} />
                <CFRow label="  Add: Invoices sent but unpaid" value={unpaidInvoicesTotal} currency={currency} indent />
                <CFRow label="Total Accrual Revenue" value={accrualRevenue} currency={currency} total />
            </SectionCard>

            {/* Section 2 */}
            <SectionCard title="Accrual Expenses">
                <CFRow label="Cash expenses paid" value={cashExpenses} currency={currency} />
                <CFRow label="  Add: Expenses incurred but unpaid" value={unpaidExpenses} currency={currency} indent />
                <CFRow label="Total Accrual Expenses" value={accrualExpenses} currency={currency} total />
            </SectionCard>

            {/* Section 3 */}
            <SectionCard title="Accrual Profit">
                <CFRow label="Accrual Net Profit" value={accrualNetProfit} currency={currency} total />
                <CFRow label="Cash Net Profit (for comparison)" value={cashNetProfit} currency={currency} />
                <View style={s.diffRow}>
                    <Text style={s.diffLabel}>
                        {difference >= 0
                            ? `You have earned ${currency}${Math.abs(difference).toLocaleString()} more than received in cash`
                            : `You have ${currency}${Math.abs(difference).toLocaleString()} in unpaid obligations`
                        }
                    </Text>
                    <Text style={[s.diffValue, { color: difference >= 0 ? Colors.income : Colors.expense }]}>
                        {difference >= 0 ? '+' : ''}{currency}{difference.toLocaleString()}
                    </Text>
                </View>
            </SectionCard>

            {/* Section 4 */}
            <SectionCard title="Working Capital">
                <CFRow label="Receivables (unpaid invoices)" value={receivables} currency={currency} />
                <CFRow label="Payables (unpaid expense transactions)" value={payables} currency={currency} />
                <CFRow label="Net Working Capital" value={netWorkingCapital} currency={currency} total />
                <View style={s.cfRow}>
                    <Text style={s.cfLabel}>Days Sales Outstanding</Text>
                    <Text style={[s.cfValue, { color: dso <= 30 ? Colors.income : dso <= 60 ? Colors.warning : Colors.expense }]}>
                        {dso.toFixed(0)} days
                    </Text>
                </View>
            </SectionCard>
        </View>
    );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <View style={s.card}>
            <Text style={s.cardTitle}>{title}</Text>
            {children}
        </View>
    );
}

function CFRow({ label, value, currency, total = false, indent = false }: {
    label: string; value: number; currency: string; total?: boolean; indent?: boolean;
}) {
    const color = value >= 0 ? Colors.income : Colors.expense;
    return (
        <View style={[s.cfRow, total && s.cfTotal]}>
            <Text style={[s.cfLabel, total && s.cfTotalLabel, indent && s.cfIndent]}>{label}</Text>
            <Text style={[s.cfValue, { color }, total && s.cfTotalValue]}>
                {value >= 0 ? '+' : ''}{currency}{Math.abs(value).toLocaleString()}
            </Text>
        </View>
    );
}

const s = StyleSheet.create({
    card:         { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12 },
    cardTitle:    { fontSize: 14, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 10 },

    cfRow:        { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: Colors.border },
    cfTotal:      { borderBottomWidth: 0, borderTopWidth: 1, borderTopColor: Colors.textMuted, marginTop: 4, paddingTop: 10 },
    cfLabel:      { fontSize: 13, color: Colors.textSecondary, flex: 1, marginRight: 8 },
    cfTotalLabel: { fontWeight: '700', color: Colors.textPrimary },
    cfIndent:     { paddingLeft: 12, color: Colors.textMuted },
    cfValue:      { fontSize: 13, fontWeight: '600' },
    cfTotalValue: { fontSize: 15, fontWeight: 'bold' },

    diffRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, marginTop: 4 },
    diffLabel: { fontSize: 12, color: Colors.textMuted, flex: 1, marginRight: 8, fontStyle: 'italic' },
    diffValue: { fontSize: 13, fontWeight: '700' },
});
