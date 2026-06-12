import React, { Component, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { Colors } from '../theme/colors';

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('[ErrorBoundary]', error, info.componentStack);
    }

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;

        return (
            <SafeAreaView style={s.safe}>
                <View style={s.container}>
                    <Text style={s.icon}>⚠️</Text>
                    <Text style={s.title}>Something went wrong</Text>
                    <Text style={s.message}>{error.message}</Text>
                    <TouchableOpacity style={s.btn} onPress={() => this.setState({ error: null })}>
                        <Text style={s.btnText}>Try Again</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }
}

const s = StyleSheet.create({
    safe:      { flex: 1, backgroundColor: Colors.bg },
    container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    icon:      { fontSize: 48, marginBottom: 16 },
    title:     { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 10, textAlign: 'center' },
    message:   { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 28 },
    btn:       { backgroundColor: Colors.primary, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 8 },
    btnText:   { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 14 },
});
