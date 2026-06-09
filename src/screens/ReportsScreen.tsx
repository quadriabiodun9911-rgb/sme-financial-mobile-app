import React, { useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import AgingReport from '../components/AgingReport';
import TaxSummary from '../components/TaxSummary';
import { ReportTab } from '../types';
import BudgetForecastingDashboard from '../../financial-planning/BudgetForecastingDashboard';
import CashFlowStatement from '../../financial-planning/CashFlowStatement';
import FinancialHealthAssessment from '../../financial-planning/FinancialHealthAssessment';
import CashFlowManagement from '../../components/CashFlowManagement';
import DebtManagement from '../../components/DebtManagement';

const TABS: { key: ReportTab; label: string }[] = [
    { key: 'balancesheet', label: 'Balance Sheet' },
    { key: 'pnl', label: 'P&L' },
    { key: 'aging', label: 'AR / AP Aging' },
    { key: 'tax', label: 'Tax Summary' },
    { key: 'financial_planning', label: 'Budget Forecast' },
    { key: 'cash_flow_statement', label: 'Cash Flow' },
    { key: 'cash_management', label: 'Cash Mgmt' },
    { key: 'debt_management', label: 'Debt' },
    { key: 'financial_health', label: 'Health' },
];

export default function ReportsScreen() {
    const { finance, settings, transactions } = useApp();
    const { currency, minReserve, targetMargin } = settings;
    const [activeTab, setActiveTab] = useState<ReportTab>('balancesheet');

    return (
        <SafeAreaView style={styles.safe}>
            <Header />

            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.tabBar}
                contentContainerStyle={styles.tabContent}
            >
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
            </ScrollView>

            <ScrollView style={styles.scroll}>
                <View style={styles.pad}>

                    {activeTab === 'balancesheet' && (
                        <View style={styles.card}>
                            <Text style={styles.cardTitle}>Balance Sheet</Text>
                            <Row label="Cash Balance" value={`${currency}${finance.cashBalance.toLocaleString()}`} color={Colors.income} />
                            <Row label="Total Assets" value={`${currency}${finance.assets.toLocaleString()}`} color={Colors.asset} />
                            <Row label="Total Liabilities" value={`${currency}${finance.liabilities.toLocaleString()}`} color={Colors.liability} />
                            <Row label="Owner's Equity" value={`${currency}${finance.equity.toLocaleString()}`} color={Colors.equity} />
                            <Text style={styles.note}>
                                Assets = Cash Balance + Opening Assets.{'\n'}
                                Update opening balances in Settings for a complete picture.
                            </Text>
                        </View>
                    )}

                    {activeTab === 'pnl' && (
                        <View style={styles.card}>
                            <Text style={styles.cardTitle}>Profit & Loss Statement</Text>
                            <Row label="Total Revenue" value={`${currency}${finance.income.toLocaleString()}`} color={Colors.income} />
                            <Row label="Total Expenses" value={`${currency}${finance.expense.toLocaleString()}`} color={Colors.expense} />
                            <Row
                                label="Net Profit"
                                value={`${finance.profit >= 0 ? '+' : ''}${currency}${finance.profit.toLocaleString()}`}
                                color={finance.profit >= 0 ? Colors.income : Colors.expense}
                            />
                            <Row
                                label="Profit Margin"
                                value={`${finance.margin.toFixed(2)}%`}
                                color={finance.margin >= parseFloat(targetMargin) ? Colors.income : Colors.expense}
                            />
                            <Row label="Target Margin" value={`${targetMargin}%`} color={Colors.textSecondary} />
                            <Row label="Tax Collected" value={`${currency}${finance.totalTaxCollected.toLocaleString()}`} color={Colors.warning} />
                            <Row label="Tax Paid" value={`${currency}${finance.totalTaxPaid.toLocaleString()}`} color={Colors.warning} />
                        </View>
                    )}

                    {activeTab === 'aging' && <AgingReport />}

                    {activeTab === 'tax' && <TaxSummary />}

                    {activeTab === 'financial_planning' && (
                        <BudgetForecastingDashboard
                            finance={finance}
                            currency={currency}
                            minReserve={minReserve}
                            targetMargin={targetMargin}
                        />
                    )}

                    {activeTab === 'cash_flow_statement' && (
                        <CashFlowStatement
                            transactions={transactions}
                            finance={finance}
                            currency={currency}
                            minReserve={minReserve}
                            targetMargin={targetMargin}
                        />
                    )}

                    {activeTab === 'cash_management' && (
                        <CashFlowManagement
                            finance={finance}
                            currency={currency}
                            minReserve={minReserve}
                            targetMargin={targetMargin}
                        />
                    )}

                    {activeTab === 'debt_management' && (
                        <DebtManagement
                            finance={{
                                assets: finance.assets,
                                liabilities: finance.liabilities,
                                equity: finance.equity,
                            }}
                            currency={currency}
                        />
                    )}

                    {activeTab === 'financial_health' && (
                        <FinancialHealthAssessment
                            finance={finance}
                            currency={currency}
                            minReserve={minReserve}
                            targetMargin={targetMargin}
                        />
                    )}
                </View>
            </ScrollView>
            <FooterNav />
        </SafeAreaView>
    );
}

function Row({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <View style={rowStyles.row}>
            <Text style={rowStyles.label}>{label}</Text>
            <Text style={[rowStyles.value, { color }]}>{value}</Text>
        </View>
    );
}

const rowStyles = StyleSheet.create({
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
    label: { fontSize: 14, color: Colors.textSecondary, fontWeight: '500' },
    value: { fontSize: 14, fontWeight: '600' },
});

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    tabBar: { maxHeight: 56, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
    tabContent: { paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center' },
    tab: { paddingHorizontal: 14, paddingVertical: 6, marginRight: 8, backgroundColor: Colors.bg, borderRadius: 20 },
    tabActive: { backgroundColor: Colors.primary },
    tabText: { color: Colors.textMuted, fontSize: 12, fontWeight: '500' },
    tabTextActive: { color: Colors.textPrimary, fontWeight: 'bold' },
    scroll: { flex: 1 },
    pad: { padding: 16 },
    card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 16 },
    cardTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 12 },
    note: { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic', marginTop: 10, lineHeight: 16 },
});
