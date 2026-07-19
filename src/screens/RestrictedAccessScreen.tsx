import React from 'react';
import { SafeAreaView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';

export default function RestrictedAccessScreen() {
    const { setCurrentScreen } = useApp();

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <View style={s.body}>
                <Text style={s.icon}>🔒</Text>
                <Text style={s.title}>This is for the business owner</Text>
                <Text style={s.text}>
                    Full financial reports, bank details, and account settings are only visible to the owner and accountant on this account. Ask the owner if you need to see this.
                </Text>
                <TouchableOpacity style={s.btn} onPress={() => setCurrentScreen('dashboard')}>
                    <Text style={s.btnText}>Back to Home</Text>
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
    title: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 10, textAlign: 'center' },
    text: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, marginBottom: 24 },
    btn: { backgroundColor: Colors.primary, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10 },
    btnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
});
