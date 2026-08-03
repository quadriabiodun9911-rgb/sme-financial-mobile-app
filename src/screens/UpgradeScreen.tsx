import React from 'react';
import { SafeAreaView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';

const ANALYTICS_FEATURES = [
    'Financial Insights & SWOT',
    'Analysis — Why? and What if? scenario modelling',
    'Business Advisor (CFO Pulse, Forecast, Risk & Growth)',
    'Business Financial DNA & deviation alerts',
    'Future Financial Statements (P&L, Cash Flow, Balance Sheet)',
];

export default function UpgradeScreen() {
    const { setCurrentScreen } = useApp();

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <View style={s.body}>
                <Text style={s.icon}>⭐</Text>
                <Text style={s.title}>Analytics is a Pro feature</Text>
                <Text style={s.text}>
                    Everything else — Dashboard, Clarity, Invoices, Sales, Payroll, Cash Flow, Reports,
                    Inventory, Assets, Loans, Goals and Budgets — stays free. Analytics unlocks:
                </Text>
                <View style={s.list}>
                    {ANALYTICS_FEATURES.map((f, i) => (
                        <Text key={i} style={s.listItem}>• {f}</Text>
                    ))}
                </View>
                <TouchableOpacity style={s.btn} onPress={() => setCurrentScreen('settings')}>
                    <Text style={s.btnText}>See Upgrade Options →</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.secondaryBtn} onPress={() => setCurrentScreen('dashboard')}>
                    <Text style={s.secondaryBtnText}>Back to Home</Text>
                </TouchableOpacity>
            </View>
            <FooterNav />
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    icon: { fontSize: 40, marginBottom: 16 },
    title: { fontSize: 19, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 10, textAlign: 'center' },
    text: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, marginBottom: 14 },
    list: { alignSelf: 'stretch', marginBottom: 24 },
    listItem: { fontSize: 13, color: Colors.textPrimary, lineHeight: 22 },
    btn: { backgroundColor: Colors.primary, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10, marginBottom: 10 },
    btnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
    secondaryBtn: { paddingVertical: 8, paddingHorizontal: 24 },
    secondaryBtnText: { color: Colors.textSecondary, fontSize: 13 },
});
