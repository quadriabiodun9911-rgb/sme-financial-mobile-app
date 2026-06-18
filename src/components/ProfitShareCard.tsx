import React from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, Share, Alert,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';

interface Props {
    visible: boolean;
    onClose: () => void;
}

export default function ProfitShareCard({ visible, onClose }: Props) {
    const { finance, settings, user } = useApp();
    const currency = settings.currency;

    if (!visible) return null;

    const profit  = finance.profit;
    const income  = finance.income;
    const expense = finance.expense;
    const margin  = finance.margin;
    const isProfit = profit >= 0;

    const now       = new Date();
    const monthName = now.toLocaleString('default', { month: 'long' });
    const year      = now.getFullYear();

    const handleShare = async () => {
        const emoji  = isProfit ? '📈' : '📉';
        const message =
`${emoji} ${monthName} ${year} Business Summary

Business: ${user?.businessName ?? 'My Business'}
💰 Revenue:  ${currency}${income.toLocaleString()}
💸 Expenses: ${currency}${expense.toLocaleString()}
${isProfit ? '✅ Profit' : '⚠️ Loss'}:   ${currency}${Math.abs(profit).toLocaleString()}
📊 Margin:   ${margin.toFixed(1)}%

Tracked with Quad360 — Free financial app for small businesses
Try it free: quad360.vercel.app`;

        try {
            await Share.share({ message, title: `${monthName} Business Summary` });
        } catch {
            Alert.alert('Error', 'Could not share.');
        }
        onClose();
    };

    return (
        <View style={styles.overlay}>
            <View style={styles.card}>
                <View style={[styles.cardHeader, { backgroundColor: isProfit ? '#14532d' : '#7f1d1d' }]}>
                    <Text style={styles.cardHeaderEmoji}>{isProfit ? '📈' : '📉'}</Text>
                    <Text style={styles.cardHeaderTitle}>{monthName} {year}</Text>
                    <Text style={styles.cardHeaderBusiness}>{user?.businessName ?? 'My Business'}</Text>
                </View>

                <View style={styles.metricsRow}>
                    <MetricBox label="Revenue"  value={`${currency}${income.toLocaleString()}`}  color={Colors.income} />
                    <MetricBox label="Expenses" value={`${currency}${expense.toLocaleString()}`} color={Colors.expense} />
                </View>

                <View style={[styles.profitBox, { borderColor: isProfit ? Colors.income : Colors.expense }]}>
                    <Text style={styles.profitLabel}>{isProfit ? 'Net Profit' : 'Net Loss'}</Text>
                    <Text style={[styles.profitValue, { color: isProfit ? Colors.income : Colors.expense }]}>
                        {currency}{Math.abs(profit).toLocaleString()}
                    </Text>
                    <Text style={styles.profitMargin}>Margin: {margin.toFixed(1)}%</Text>
                </View>

                <View style={styles.brandRow}>
                    <Text style={styles.brandText}>Tracked with </Text>
                    <Text style={styles.brandName}>Quad360</Text>
                    <Text style={styles.brandText}> · quad360.vercel.app</Text>
                </View>

                <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
                    <Text style={styles.shareBtnText}>📤 Share This Summary</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                    <Text style={styles.closeBtnText}>Close</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

function MetricBox({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>{label}</Text>
            <Text style={[styles.metricValue, { color }]}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    overlay:           { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', zIndex: 100, padding: 20 },
    card:              { backgroundColor: Colors.surface, borderRadius: 20, overflow: 'hidden', width: '100%', maxWidth: 380 },
    cardHeader:        { padding: 24, alignItems: 'center' },
    cardHeaderEmoji:   { fontSize: 40, marginBottom: 4 },
    cardHeaderTitle:   { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 2 },
    cardHeaderBusiness:{ fontSize: 13, color: 'rgba(255,255,255,0.7)' },
    metricsRow:        { flexDirection: 'row', padding: 16, gap: 12 },
    metricBox:         { flex: 1, backgroundColor: Colors.bg, borderRadius: 12, padding: 14, alignItems: 'center' },
    metricLabel:       { fontSize: 11, color: Colors.textMuted, marginBottom: 4 },
    metricValue:       { fontSize: 16, fontWeight: 'bold' },
    profitBox:         { marginHorizontal: 16, padding: 16, borderRadius: 12, borderWidth: 2, alignItems: 'center', marginBottom: 16 },
    profitLabel:       { fontSize: 12, color: Colors.textMuted, marginBottom: 4 },
    profitValue:       { fontSize: 28, fontWeight: 'bold', marginBottom: 2 },
    profitMargin:      { fontSize: 12, color: Colors.textMuted },
    brandRow:          { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingBottom: 16 },
    brandText:         { fontSize: 11, color: Colors.textMuted },
    brandName:         { fontSize: 11, color: Colors.primary, fontWeight: 'bold' },
    shareBtn:          { marginHorizontal: 16, marginBottom: 8, backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    shareBtnText:      { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 15 },
    closeBtn:          { marginHorizontal: 16, marginBottom: 16, paddingVertical: 10, alignItems: 'center' },
    closeBtnText:      { color: Colors.textMuted, fontSize: 14 },
});
