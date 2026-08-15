/**
 * Shared building blocks for rendering a statement in the classic printed-
 * accounting-document layout (business name / statement title / period,
 * indented line items, ruled subtotals, double-ruled grand total) instead
 * of the app's usual rounded-card style — used by the formal Profit & Loss
 * and Balance Sheet views so a business owner has something that reads like
 * a real financial statement to hand to a lender or accountant.
 *
 * Every number rendered through StatementLine comes from the same
 * computation functions the rest of Reports already uses (computeEnhancedPnL,
 * computeBalanceSheetTrend) -- this is a presentation layer only, not a
 * second set of figures. A line with no real data behind it is omitted
 * entirely rather than shown as a fabricated $0.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { Radius, Spacing, Shadow } from '../theme/tokens';

export function StatementCard({ businessName, title, subtitle, children }: {
    businessName: string; title: string; subtitle: string; children: React.ReactNode;
}) {
    return (
        <View style={s.card}>
            <View style={s.header}>
                <Text style={s.businessName}>{businessName}</Text>
                <Text style={s.title}>{title}</Text>
                <Text style={s.subtitle}>{subtitle}</Text>
            </View>
            <View style={s.headerRule} />
            {children}
        </View>
    );
}

export function StatementSection({ label }: { label: string }) {
    return <Text style={s.section}>{label}</Text>;
}

export function StatementLine({ label, amount, currency, indent = 0, bold, subtotal, total, muted, deduction }: {
    label: string; amount: number; currency: string;
    indent?: number; bold?: boolean; subtotal?: boolean; total?: boolean; muted?: boolean; deduction?: boolean;
}) {
    const rounded = Math.round(Math.abs(amount));
    const formatted = deduction
        ? `(${currency}${rounded.toLocaleString()})`
        : `${currency}${rounded.toLocaleString()}`;
    const emphasized = bold || subtotal || total;
    return (
        <View style={[s.line, subtotal && s.subtotalLine, total && s.totalLine]}>
            <Text
                style={[s.label, indent > 0 && { marginLeft: indent * 14 }, emphasized && s.emphasized, muted && s.muted]}
                numberOfLines={2}
            >
                {label}
            </Text>
            <Text style={[s.value, emphasized && s.emphasized, muted && s.muted, total && s.totalValue]}>
                {formatted}
            </Text>
        </View>
    );
}

export function StatementNote({ text }: { text: string }) {
    return <Text style={s.note}>{text}</Text>;
}

export function StatementSpacer() {
    return <View style={{ height: Spacing.md }} />;
}

const s = StyleSheet.create({
    card: {
        backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
        padding: Spacing.lg, marginBottom: Spacing.lg, ...Shadow.sm,
    },
    header: { alignItems: 'center', marginBottom: Spacing.md },
    businessName: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, marginBottom: 2, textAlign: 'center' },
    title: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, textTransform: 'uppercase', letterSpacing: 0.6, textAlign: 'center' },
    subtitle: { fontSize: 11.5, color: Colors.textMuted, marginTop: 2, textAlign: 'center' },
    headerRule: { height: 2, backgroundColor: Colors.textPrimary, opacity: 0.15, marginBottom: Spacing.md },

    section: {
        fontSize: 10.5, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase',
        letterSpacing: 0.5, marginTop: Spacing.md, marginBottom: 4,
    },

    line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 4 },
    subtotalLine: { borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 4, paddingTop: 8 },
    totalLine: { borderTopWidth: 2, borderTopColor: Colors.textPrimary, marginTop: 8, paddingTop: 10 },

    label: { flex: 1, fontSize: 12.5, color: Colors.textSecondary, marginRight: 10 },
    value: {
        fontSize: 12.5, color: Colors.textPrimary, fontVariant: ['tabular-nums'],
        minWidth: 90, textAlign: 'right',
    },
    emphasized: { fontWeight: '800', color: Colors.textPrimary, fontSize: 13.5 },
    muted: { color: Colors.textMuted, fontStyle: 'italic', fontSize: 11.5 },
    totalValue: { fontSize: 15 },

    note: { fontSize: 10.5, color: Colors.textMuted, fontStyle: 'italic', marginTop: Spacing.sm, lineHeight: 15 },
});
