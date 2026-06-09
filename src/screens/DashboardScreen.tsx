import React from 'react';
import {
    SafeAreaView, ScrollView, View, Text,
    TouchableOpacity, StyleSheet, Share,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';

export default function DashboardScreen() {
    const { finance, insight, settings, setCurrentScreen } = useApp();
    const { currency } = settings;

    const handleShare = async () => {
        try {
            await Share.share({ message: `${insight.title}\n\n${insight.action}` });
        } catch (_) {}
    };

    const insightBorderColor =
        insight.severity === 'critical' ? Colors.criticalBorder
        : insight.severity === 'warning' ? Colors.warningBorder
        : Colors.healthyBorder;

    const tagBg =
        insight.severity === 'critical' ? Colors.criticalBorder
        : insight.severity === 'warning' ? Colors.warningBorder
        : Colors.healthyBorder;

    const tagTextColor =
        insight.severity === 'warning' ? Colors.bg : Colors.textPrimary;

    return (
        <SafeAreaView style={styles.safe}>
            <Header />
            <ScrollView style={styles.scroll}>
                <View style={styles.pad}>
                    <Text style={styles.title}>Dashboard</Text>

                    {/* One-Thing Insight Card */}
                    <View style={[styles.insightCard, { borderLeftColor: insightBorderColor }]}>
                        <View style={styles.insightHeader}>
                            <Text style={[styles.tag, { backgroundColor: tagBg, color: tagTextColor }]}>
                                {insight.tag}
                            </Text>
                            <TouchableOpacity onPress={handleShare}>
                                <Text style={styles.shareText}>Share</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.insightTitle}>{insight.title}</Text>
                        <Text style={styles.insightAction}>{insight.action}</Text>
                    </View>

                    {/* Income / Expenses Row */}
                    <View style={styles.row}>
                        <View style={[styles.card, styles.flex]}>
                            <Text style={styles.cardLabel}>Income</Text>
                            <Text style={styles.income}>{currency}{finance.income.toLocaleString()}</Text>
                        </View>
                        <View style={styles.spacer} />
                        <View style={[styles.card, styles.flex]}>
                            <Text style={styles.cardLabel}>Expenses</Text>
                            <Text style={styles.expense}>{currency}{finance.expense.toLocaleString()}</Text>
                        </View>
                    </View>

                    {/* Net Profit */}
                    <View style={styles.card}>
                        <Text style={styles.cardLabel}>Net Profit</Text>
                        <Text style={finance.profit >= 0 ? styles.income : styles.expense}>
                            {finance.profit >= 0 ? '+' : ''}{currency}{finance.profit.toLocaleString()}
                        </Text>
                        <Text style={finance.margin >= parseFloat(settings.targetMargin) ? styles.positive : styles.negative}>
                            {finance.margin.toFixed(2)}% margin
                        </Text>
                    </View>

                    {/* Cash Balance */}
                    <View style={styles.card}>
                        <Text style={styles.cardLabel}>Cash Balance</Text>
                        <Text style={[styles.income, { fontSize: 22 }]}>
                            {currency}{finance.cashBalance.toLocaleString()}
                        </Text>
                        <Text style={styles.hint}>
                            Min. reserve: {currency}{settings.minReserve}
                        </Text>
                    </View>

                    {/* Assets / Liabilities Row */}
                    <View style={styles.row}>
                        <View style={[styles.card, styles.flex]}>
                            <Text style={styles.cardLabel}>Total Assets</Text>
                            <Text style={styles.asset}>{currency}{finance.assets.toLocaleString()}</Text>
                        </View>
                        <View style={styles.spacer} />
                        <View style={[styles.card, styles.flex]}>
                            <Text style={styles.cardLabel}>Total Liabilities</Text>
                            <Text style={styles.liability}>{currency}{finance.liabilities.toLocaleString()}</Text>
                        </View>
                    </View>

                    {/* Equity */}
                    <View style={styles.card}>
                        <Text style={styles.cardLabel}>Owner's Equity</Text>
                        <Text style={styles.equity}>{currency}{finance.equity.toLocaleString()}</Text>
                        <Text style={styles.hint}>Assets − Liabilities</Text>
                    </View>

                    <TouchableOpacity style={styles.btn} onPress={() => setCurrentScreen('reports')}>
                        <Text style={styles.btnText}>View Detailed Reports</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
            <FooterNav />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1, backgroundColor: Colors.bg },
    pad: { padding: 16 },
    title: { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 16 },
    row: { flexDirection: 'row', marginBottom: 16 },
    flex: { flex: 1 },
    spacer: { width: 12 },
    card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 16 },
    cardLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 8 },
    income: { fontSize: 20, fontWeight: 'bold', color: Colors.income },
    expense: { fontSize: 20, fontWeight: 'bold', color: Colors.expense },
    asset: { fontSize: 20, fontWeight: 'bold', color: Colors.asset },
    liability: { fontSize: 20, fontWeight: 'bold', color: Colors.liability },
    equity: { fontSize: 20, fontWeight: 'bold', color: Colors.equity },
    positive: { color: Colors.income, fontWeight: '500', marginTop: 4 },
    negative: { color: Colors.expense, fontWeight: '500', marginTop: 4 },
    hint: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
    insightCard: {
        backgroundColor: Colors.surface,
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        borderLeftWidth: 4,
    },
    insightHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    tag: { fontSize: 10, fontWeight: 'bold', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12 },
    shareText: { color: Colors.textMuted, fontSize: 12 },
    insightTitle: { fontSize: 14, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
    insightAction: { fontSize: 12, color: Colors.textSecondary, lineHeight: 16 },
    btn: { backgroundColor: Colors.primary, paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 4 },
    btnText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 14 },
});
