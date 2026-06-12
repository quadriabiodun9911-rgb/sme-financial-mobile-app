import React, { useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import ProfitWaterfall from '../components/ProfitWaterfall';
import ProfitByDimension from '../components/ProfitByDimension';
import BreakevenAnalysis from '../components/BreakevenAnalysis';
import ProfitDriversInsights from '../components/ProfitDriversInsights';
import {
    computeProfitWaterfall,
    computeProfitByCategory,
    computeProfitByVendorCustomer,
    computeBreakeven,
    identifyProfitDrivers,
} from '../utils/profitability';

type Tab = 'drivers' | 'dimension' | 'breakeven';

const TABS: { key: Tab; label: string }[] = [
    { key: 'drivers',   label: 'Profit Drivers' },
    { key: 'dimension', label: 'By Dimension'   },
    { key: 'breakeven', label: 'Breakeven'       },
];

export default function GrowthIntelligenceScreen() {
    const { transactions, settings } = useApp();
    const [activeTab, setActiveTab] = useState<Tab>('drivers');

    const currency = settings.currency;

    const waterfall   = useMemo(() => computeProfitWaterfall(transactions), [transactions]);
    const byCategory  = useMemo(() => computeProfitByCategory(transactions), [transactions]);
    const byVendor    = useMemo(() => computeProfitByVendorCustomer(transactions), [transactions]);
    const breakeven   = useMemo(() => computeBreakeven(transactions, settings), [transactions, settings]);
    const drivers     = useMemo(() => identifyProfitDrivers(transactions), [transactions]);

    return (
        <SafeAreaView style={styles.safe}>
            <Header />

            <View style={styles.headerRow}>
                <Text style={styles.screenTitle}>Growth Intelligence</Text>
            </View>

            {/* Tab bar */}
            <View style={styles.tabBar}>
                {TABS.map(tab => (
                    <TouchableOpacity
                        key={tab.key}
                        style={[styles.tab, activeTab === tab.key && styles.tabActive]}
                        onPress={() => setActiveTab(tab.key)}
                    >
                        <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                            {tab.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                {activeTab === 'drivers' && (
                    <>
                        <ProfitWaterfall items={waterfall} currency={currency} />
                        <View style={styles.gap} />
                        <ProfitDriversInsights drivers={drivers} currency={currency} />
                    </>
                )}

                {activeTab === 'dimension' && (
                    <ProfitByDimension
                        byCategory={byCategory}
                        byVendor={byVendor}
                        currency={currency}
                    />
                )}

                {activeTab === 'breakeven' && (
                    <BreakevenAnalysis result={breakeven} currency={currency} />
                )}
            </ScrollView>

            <FooterNav />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: {
        flex: 1,
        backgroundColor: Colors.bg,
    },
    headerRow: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 4,
    },
    screenTitle: {
        color: Colors.textPrimary,
        fontSize: 20,
        fontWeight: '700',
    },
    tabBar: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 8,
        gap: 6,
    },
    tab: {
        flex: 1,
        paddingVertical: 7,
        alignItems: 'center',
        borderRadius: 8,
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    tabActive: {
        backgroundColor: Colors.primary,
        borderColor: Colors.primary,
    },
    tabText: {
        color: Colors.textMuted,
        fontSize: 11,
        fontWeight: '600',
    },
    tabTextActive: {
        color: Colors.textPrimary,
    },
    scroll: {
        flex: 1,
    },
    content: {
        padding: 16,
        paddingBottom: 24,
    },
    gap: {
        height: 12,
    },
});
