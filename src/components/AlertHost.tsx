import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';

export type WebAlertButton = { text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' };
export type WebAlertRequest = { title: string; message?: string; buttons: WebAlertButton[] };

// window.alert()/window.confirm() are silently ignored in a standalone
// (home-screen-installed) PWA on iOS and in several in-app webview
// wrappers — the underlying action still runs, but the user never sees
// the outcome, which reads as "nothing happened." This in-app modal
// replaces those browser dialogs for the web platform so success/failure
// feedback is never lost to the host's dialog policy. One module-level
// slot mirrors Alert.alert's own one-dialog-at-a-time behavior.
let setRequest: ((req: WebAlertRequest | null) => void) | null = null;

export function pushWebAlert(req: WebAlertRequest): void {
    setRequest?.(req);
}

export default function AlertHost() {
    const [request, setRequestState] = useState<WebAlertRequest | null>(null);

    useEffect(() => {
        setRequest = setRequestState;
        return () => { setRequest = null; };
    }, []);

    if (!request) return null;

    const handlePress = (btn: WebAlertButton) => {
        setRequestState(null);
        btn.onPress?.();
    };

    return (
        <Modal visible transparent animationType="fade" onRequestClose={() => setRequestState(null)}>
            <View style={styles.backdrop}>
                <View style={styles.card}>
                    <Text style={styles.title}>{request.title}</Text>
                    {!!request.message && <Text style={styles.message}>{request.message}</Text>}
                    <View style={styles.buttonRow}>
                        {request.buttons.map((btn, i) => (
                            <TouchableOpacity
                                key={i}
                                style={[styles.button, i > 0 && styles.buttonGap]}
                                onPress={() => handlePress(btn)}
                            >
                                <Text style={[
                                    styles.buttonText,
                                    btn.style === 'destructive' && styles.destructiveText,
                                    btn.style === 'cancel' && styles.cancelText,
                                ]}>
                                    {btn.text}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    card: { backgroundColor: Colors.card, borderRadius: 14, padding: 20, width: '100%', maxWidth: 360, borderWidth: 1, borderColor: Colors.border },
    title: { fontSize: 17, fontWeight: '700', color: Colors.text, marginBottom: 8 },
    message: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20, marginBottom: 20 },
    buttonRow: { flexDirection: 'row', justifyContent: 'flex-end' },
    button: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
    buttonGap: { marginLeft: 4 },
    buttonText: { fontSize: 15, fontWeight: '600', color: Colors.primary },
    destructiveText: { color: Colors.danger },
    cancelText: { color: Colors.textSecondary },
});
