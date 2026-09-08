/**
 * "Revenue: X, based on 127 transactions, period Y, last updated Z" -- a
 * headline figure made traceable back to the actual records behind it,
 * instead of asking the user to just trust it. Deliberately self-contained
 * (re-states the amount/label itself rather than assuming the caller
 * already shows them nearby) so it drops onto any statement line as-is.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { Radius, Spacing } from '../theme/tokens';
import { Transaction } from '../types';
import { summarizeSourceOfTruth } from '../utils/sourceOfTruth';

interface Props {
    label: string;        // e.g. "Total Revenue"
    amount: number;
    currency: string;
    transactions: Transaction[]; // exactly the transactions that sum to `amount`
    periodLabel: string;  // e.g. "For the period Jan 1 - Aug 15, 2026"
}

const MAX_ROWS_SHOWN = 25;

export default function SourceOfTruthPanel({ label, amount, currency, transactions, periodLabel }: Props) {
    const [open, setOpen] = useState(false);
    const summary = summarizeSourceOfTruth(transactions, periodLabel);
    const sorted = [...transactions].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const shown = sorted.slice(0, MAX_ROWS_SHOWN);
    const hiddenCount = sorted.length - shown.length;

    return (
        <View style={s.wrap}>
            <TouchableOpacity style={s.toggle} onPress={() => setOpen(o => !o)} activeOpacity={0.7}>
                <Text style={s.toggleText}>🔍 Where did this come from?</Text>
                <Text style={s.toggleText}>{open ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {open && (
                <View style={s.body}>
                    <Text style={s.headline}>{label}: {currency}{Math.round(amount).toLocaleString()}</Text>
                    <Text style={s.summaryLine}>
                        Based on {summary.count} transaction{summary.count === 1 ? '' : 's'}, {summary.periodLabel}
                    </Text>
                    <Text style={s.summaryLine}>{summary.lastUpdatedText}</Text>

                    {shown.length === 0 && <Text style={s.emptyText}>No transactions behind this figure.</Text>}
                    {shown.map(t => (
                        <View key={t.id} style={s.row}>
                            <View style={{ flex: 1 }}>
                                <Text style={s.rowDesc} numberOfLines={1}>{t.description || 'Untitled'}</Text>
                                <Text style={s.rowDate}>{t.date || 'No date'}</Text>
                            </View>
                            <Text style={s.rowAmount}>{currency}{Math.round(t.amount ?? 0).toLocaleString()}</Text>
                        </View>
                    ))}
                    {hiddenCount > 0 && (
                        <Text style={s.moreText}>+ {hiddenCount} more transaction{hiddenCount === 1 ? '' : 's'} not shown</Text>
                    )}
                </View>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    wrap: { marginTop: 4, marginBottom: Spacing.sm },
    toggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
    toggleText: { fontSize: 11.5, fontWeight: '600', color: Colors.primary },
    body: { backgroundColor: Colors.bg, borderRadius: Radius.md, padding: Spacing.md, marginTop: 4 },
    headline: { fontSize: 12.5, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
    summaryLine: { fontSize: 11.5, color: Colors.textSecondary, marginBottom: 2 },
    emptyText: { fontSize: 11.5, color: Colors.textMuted, fontStyle: 'italic', marginTop: 4 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, borderTopWidth: 1, borderTopColor: Colors.border },
    rowDesc: { fontSize: 12, color: Colors.textPrimary, fontWeight: '600' },
    rowDate: { fontSize: 10.5, color: Colors.textMuted, marginTop: 1 },
    rowAmount: { fontSize: 12, color: Colors.income, fontWeight: '700' },
    moreText: { fontSize: 10.5, color: Colors.textMuted, marginTop: 6, textAlign: 'center' },
});
