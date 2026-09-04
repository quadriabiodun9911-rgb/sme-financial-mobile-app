import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Colors } from '../theme/colors';
import { Shadow } from '../theme/tokens';
import { Invoice, Transaction } from '../types';
import BarList from './BarList';
import { computeMarginPct } from '../utils/priceHistory';

interface Props {
    invoices: Invoice[];
    transactions: Transaction[];
    currency: string;
}

interface CustomerData {
    name: string;
    invoiceCount: number;
    totalRevenue: number;
    totalExpenses: number;
    netProfit: number;
    margin: number;
    avgInvoiceValue: number;
    paymentRate: number;
    daysToPayAvg: number;
}

export default function CustomerProfitability({ invoices, transactions, currency }: Props) {
    const [sortBy, setSortBy] = useState<'revenue' | 'profit' | 'margin'>('profit');

    const customerMetrics = useMemo(() => {
        // Group invoices by customer
        const customerMap = new Map<string, {
            invoices: Invoice[];
            expenses: Transaction[];
        }>();

        for (const inv of invoices) {
            const customerName = inv.clientName || 'Unknown';
            if (!customerMap.has(customerName)) {
                customerMap.set(customerName, { invoices: [], expenses: [] });
            }
            customerMap.get(customerName)!.invoices.push(inv);
        }

        // Match expenses to customers via the explicit vendorCustomer link
        // only -- falling back to tx.category here used to misattribute
        // ordinary overhead (an expense categorized "Marketing" or "Rent")
        // to any customer whose name happened to match that category
        // string, which has no real connection to that customer at all.
        for (const tx of transactions.filter(t => t.type === 'expense')) {
            const customerRef = tx.vendorCustomer;
            if (customerRef && customerMap.has(customerRef)) {
                customerMap.get(customerRef)!.expenses.push(tx);
            }
        }

        // Calculate metrics for each customer
        const metrics: CustomerData[] = Array.from(customerMap.entries()).map(([name, { invoices: custInvoices, expenses }]) => {
            const revenue = custInvoices.reduce((sum, inv) => sum + inv.total, 0);
            const expensesTotal = expenses.reduce((sum, exp) => sum + (exp.amount ?? 0), 0);
            const profit = revenue - expensesTotal;
            const margin = computeMarginPct(revenue, expensesTotal);
            const paid = custInvoices.filter(inv => inv.status === 'paid').length;
            const paymentRate = custInvoices.length > 0 ? (paid / custInvoices.length) * 100 : 0;

            // Real turnaround time (issueDate -> paidDate) when a paidDate
            // was actually recorded -- see Invoice.paidDate. Older invoices
            // paid before that field existed have no real payment timestamp
            // to measure from, so those fall back to the invoice's payment
            // term (dueDate - issueDate) as a rough estimate; this used to
            // be the ONLY thing computed here, which measured the term
            // given, not how long the customer actually took to pay.
            const paidInvoices = custInvoices.filter(inv => inv.status === 'paid');
            const daysToPayAvg = paidInvoices.length > 0
                ? paidInvoices.reduce((sum, inv) => {
                    const issued = new Date(inv.issueDate).getTime();
                    const end = new Date(inv.paidDate || inv.dueDate).getTime();
                    return sum + Math.max(0, (end - issued) / (1000 * 60 * 60 * 24));
                }, 0) / paidInvoices.length
                : 0;

            return {
                name,
                invoiceCount: custInvoices.length,
                totalRevenue: revenue,
                totalExpenses: expensesTotal,
                netProfit: profit,
                margin,
                avgInvoiceValue: custInvoices.length > 0 ? revenue / custInvoices.length : 0,
                paymentRate,
                daysToPayAvg,
            };
        });

        // Sort by selected metric
        return metrics.sort((a, b) => {
            if (sortBy === 'revenue') return b.totalRevenue - a.totalRevenue;
            if (sortBy === 'profit') return b.netProfit - a.netProfit;
            return b.margin - a.margin;
        });
    }, [invoices, transactions, sortBy]);

    const totals = useMemo(() => ({
        revenue: customerMetrics.reduce((sum, c) => sum + c.totalRevenue, 0),
        expenses: customerMetrics.reduce((sum, c) => sum + c.totalExpenses, 0),
        profit: customerMetrics.reduce((sum, c) => sum + c.netProfit, 0),
        avgMargin: customerMetrics.length > 0
            ? customerMetrics.reduce((sum, c) => sum + c.margin, 0) / customerMetrics.length
            : 0,
    }), [customerMetrics]);

    if (customerMetrics.length === 0) {
        return (
            <View style={styles.empty}>
                <Text style={styles.emptyText}>No customer data yet. Add invoices to see profitability analysis.</Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.scroll}>
            {/* Summary Cards */}
            <View style={styles.summaryRow}>
                <SummaryCard
                    label="Total Revenue"
                    value={`${currency}${totals.revenue.toLocaleString()}`}
                    color={Colors.income}
                />
                <SummaryCard
                    label="Avg Margin"
                    value={`${totals.avgMargin.toFixed(1)}%`}
                    color={totals.avgMargin > 30 ? Colors.income : totals.avgMargin > 20 ? Colors.warning : Colors.expense}
                />
            </View>

            {/* Sort buttons */}
            <View style={styles.sortRow}>
                <TouchableOpacity
                    style={[styles.sortBtn, sortBy === 'profit' && styles.sortBtnActive]}
                    onPress={() => setSortBy('profit')}
                >
                    <Text style={[styles.sortText, sortBy === 'profit' && styles.sortTextActive]}>By Profit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.sortBtn, sortBy === 'revenue' && styles.sortBtnActive]}
                    onPress={() => setSortBy('revenue')}
                >
                    <Text style={[styles.sortText, sortBy === 'revenue' && styles.sortTextActive]}>By Revenue</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.sortBtn, sortBy === 'margin' && styles.sortBtnActive]}
                    onPress={() => setSortBy('margin')}
                >
                    <Text style={[styles.sortText, sortBy === 'margin' && styles.sortTextActive]}>By Margin</Text>
                </TouchableOpacity>
            </View>

            {/* Best Customers -- ranked by the active sort metric */}
            <View style={styles.bestCard}>
                <Text style={styles.summaryLabel}>
                    Best Customers by {sortBy === 'profit' ? 'Profit' : sortBy === 'revenue' ? 'Revenue' : 'Margin'}
                </Text>
                <View style={{ marginTop: 8 }}>
                    <BarList
                        items={customerMetrics.slice(0, 8).map(c => {
                            const metricValue = sortBy === 'revenue' ? c.totalRevenue : sortBy === 'margin' ? c.margin : c.netProfit;
                            const displayValue = sortBy === 'margin'
                                ? `${metricValue.toFixed(1)}%`
                                : `${currency}${Math.round(metricValue).toLocaleString()}`;
                            return { label: c.name, value: metricValue, displayValue };
                        })}
                    />
                </View>
            </View>

            {/* Customer List */}
            <View>
                {customerMetrics.map((customer, idx) => (
                    <View key={idx} style={styles.customerCard}>
                        <View style={styles.customerHeader}>
                            <Text style={styles.customerName} numberOfLines={1}>{customer.name}</Text>
                            <Text style={[styles.profit, { color: customer.netProfit >= 0 ? Colors.income : Colors.expense }]}>
                                {customer.netProfit >= 0 ? '+' : ''}{currency}{customer.netProfit.toLocaleString()}
                            </Text>
                        </View>

                        <View style={styles.metricsGrid}>
                            <Metric label="Invoices" value={String(customer.invoiceCount)} />
                            <Metric label="Avg Invoice" value={`${currency}${customer.avgInvoiceValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
                            <Metric label="Margin" value={`${customer.margin.toFixed(1)}%`} color={customer.margin > 30 ? Colors.income : Colors.warning} />
                            <Metric label="Paid Rate" value={`${customer.paymentRate.toFixed(0)}%`} />
                        </View>

                        {customer.daysToPayAvg > 0 && (
                            <Text style={styles.paymentDays}>
                                ⏱ Avg {customer.daysToPayAvg.toFixed(0)} days to get paid
                            </Text>
                        )}

                        {/* Margin here is invoice revenue minus ONLY the
                            expense transactions explicitly tagged to this
                            same customer name (vendorCustomer) -- never
                            guessed from category. Zero tagged expenses
                            reads as a perfect 100% margin, which is a real
                            computation, not an error, but it almost always
                            means the real cost of serving this customer
                            just isn't tagged yet, not that it was free. */}
                        {customer.totalExpenses === 0 && customer.totalRevenue > 0 && (
                            <Text style={styles.untaggedNote}>
                                No expenses are tagged to "{customer.name}" yet, so this margin only reflects revenue — tag costs to this customer (or an invoice client name) for a true figure.
                            </Text>
                        )}
                    </View>
                ))}
            </View>

            {/* Growth Insights */}
            <View style={styles.insightCard}>
                <Text style={styles.insightTitle}>💡 Growth Opportunities</Text>

                {(() => {
                    const profitableCustomers = customerMetrics.filter(c => c.netProfit > 0);
                    const lowMarginCustomers = customerMetrics.filter(c => c.margin < 20);
                    const slowPayingCustomers = customerMetrics.filter(c => c.daysToPayAvg > 30);

                    const insights: string[] = [];

                    if (profitableCustomers.length > 0) {
                        const top = profitableCustomers[0];
                        insights.push(`🎯 Top customer: ${top.name} (${currency}${top.netProfit.toLocaleString()} profit). Consider expanding relationship.`);
                    }

                    if (lowMarginCustomers.length > 0) {
                        const lowMarginRevenue = lowMarginCustomers.reduce((sum, c) => sum + c.totalRevenue, 0);
                        insights.push(`⚠️ ${lowMarginCustomers.length} customer(s) have <20% margin, covering ${currency}${lowMarginRevenue.toLocaleString()} in revenue. Review pricing or costs.`);
                    }

                    if (slowPayingCustomers.length > 0) {
                        const slowPayingRevenue = slowPayingCustomers.reduce((sum, c) => sum + c.totalRevenue, 0);
                        insights.push(`💰 ${slowPayingCustomers.length} customer(s) take >30 days to pay, tying up ${currency}${slowPayingRevenue.toLocaleString()} in revenue. Implement payment terms.`);
                    }

                    if (insights.length === 0) {
                        insights.push('✅ Healthy customer portfolio. Focus on scaling top customers.');
                    }

                    return insights.map((insight, i) => (
                        <Text key={i} style={styles.insight}>{insight}</Text>
                    ));
                })()}
            </View>
        </ScrollView>
    );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>{label}</Text>
            <Text style={[styles.summaryValue, { color }]}>{value}</Text>
        </View>
    );
}

function Metric({ label, value, color = Colors.textSecondary }: { label: string; value: string; color?: string }) {
    return (
        <View style={styles.metric}>
            <Text style={styles.metricLabel}>{label}</Text>
            <Text style={[styles.metricValue, { color }]}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    scroll: {
        flex: 1,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    empty: {
        padding: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyText: {
        fontSize: 14,
        color: Colors.textMuted,
        textAlign: 'center',
    },
    summaryRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    summaryCard: {
        flex: 1,
        backgroundColor: Colors.surface,
        borderRadius: 10,
        padding: 12,
    },
    summaryLabel: {
        fontSize: 12,
        color: Colors.textSecondary,
        marginBottom: 6,
    },
    summaryValue: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    bestCard: {
        backgroundColor: Colors.surface,
        borderRadius: 10,
        padding: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: Colors.border,
        ...Shadow.sm,
    },
    sortRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 16,
    },
    sortBtn: {
        flex: 1,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 6,
        backgroundColor: Colors.border,
        alignItems: 'center',
    },
    sortBtnActive: {
        backgroundColor: Colors.primary,
    },
    sortText: {
        fontSize: 11,
        color: Colors.textSecondary,
        fontWeight: '600',
    },
    sortTextActive: {
        color: '#fff',
    },
    customerCard: {
        backgroundColor: Colors.surface,
        borderRadius: 10,
        padding: 12,
        marginBottom: 10,
        borderLeftWidth: 4,
        borderLeftColor: Colors.primary,
        ...Shadow.sm,
    },
    customerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    customerName: {
        fontSize: 14,
        fontWeight: 'bold',
        color: Colors.textPrimary,
        flex: 1,
    },
    profit: {
        fontSize: 16,
        fontWeight: 'bold',
        marginLeft: 8,
    },
    metricsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 8,
    },
    metric: {
        flex: 1,
        minWidth: '45%',
        backgroundColor: Colors.bg,
        borderRadius: 6,
        padding: 8,
        alignItems: 'center',
    },
    metricLabel: {
        fontSize: 10,
        color: Colors.textMuted,
        marginBottom: 4,
    },
    metricValue: {
        fontSize: 13,
        fontWeight: '600',
        color: Colors.textPrimary,
    },
    paymentDays: {
        fontSize: 11,
        color: Colors.textSecondary,
        marginTop: 6,
    },
    untaggedNote: {
        fontSize: 10.5,
        color: Colors.textMuted,
        fontStyle: 'italic',
        marginTop: 6,
        lineHeight: 14,
    },
    insightCard: {
        backgroundColor: Colors.surface,
        borderRadius: 10,
        padding: 14,
        marginTop: 16,
        marginBottom: 20,
        borderLeftWidth: 4,
        borderLeftColor: Colors.warning,
        ...Shadow.sm,
    },
    insightTitle: {
        fontSize: 13,
        fontWeight: 'bold',
        color: Colors.textPrimary,
        marginBottom: 8,
    },
    insight: {
        fontSize: 12,
        color: Colors.textSecondary,
        lineHeight: 18,
        marginBottom: 6,
    },
});
