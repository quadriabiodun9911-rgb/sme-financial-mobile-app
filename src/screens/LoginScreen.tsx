import React, { useState } from 'react';
import {
    SafeAreaView, ScrollView, View, Text, TextInput,
    TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';

export default function LoginScreen() {
    const { login } = useApp();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [business, setBusiness] = useState('');

    const handleLogin = () => {
        if (!email || !password) {
            Alert.alert('Missing fields', 'Please enter your email and password.');
            return;
        }
        login(email, password, business);
    };

    return (
        <SafeAreaView style={styles.safe}>
            <ScrollView contentContainerStyle={styles.scroll}>
                <View style={styles.card}>
                    <Text style={styles.title}>FinanceBook</Text>
                    <Text style={styles.subtitle}>Business Financial Management Suite</Text>

                    <View style={styles.group}>
                        <Text style={styles.label}>Email</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="admin@example.com"
                            placeholderTextColor={Colors.muted}
                            value={email}
                            onChangeText={setEmail}
                            autoCapitalize="none"
                            keyboardType="email-address"
                        />
                    </View>

                    <View style={styles.group}>
                        <Text style={styles.label}>Password</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="••••••••"
                            placeholderTextColor={Colors.muted}
                            secureTextEntry
                            value={password}
                            onChangeText={setPassword}
                        />
                    </View>

                    <View style={styles.group}>
                        <Text style={styles.label}>Business Name</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Acme Corp"
                            placeholderTextColor={Colors.muted}
                            value={business}
                            onChangeText={setBusiness}
                        />
                    </View>

                    <TouchableOpacity style={styles.btn} onPress={handleLogin}>
                        <Text style={styles.btnText}>Access Dashboard</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
    card: {
        backgroundColor: Colors.surface,
        borderRadius: 16,
        padding: 24,
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 5,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: Colors.textPrimary,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 14,
        color: Colors.textMuted,
        textAlign: 'center',
        marginBottom: 20,
    },
    group: { marginBottom: 16 },
    label: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
    input: {
        backgroundColor: Colors.bg,
        borderColor: Colors.border,
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: Colors.textPrimary,
        fontSize: 14,
    },
    btn: {
        backgroundColor: Colors.primary,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 8,
    },
    btnText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 14 },
});
