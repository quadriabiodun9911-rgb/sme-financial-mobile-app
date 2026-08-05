import { Alert, Platform } from 'react-native';

// Alert.alert is a silent no-op on react-native-web. Centralized here so
// every screen falls back the same way instead of each reimplementing (and
// subtly diverging on) the same Platform.OS branch — six screens had done
// exactly that independently before this was extracted.
export function showAlert(title: string, message?: string): void {
    if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && typeof window.alert === 'function') {
            window.alert(message ? `${title}\n\n${message}` : title);
        }
    } else {
        Alert.alert(title, message);
    }
}

// A two-button confirm/cancel dialog. confirmLabel's action always performs
// onConfirm on both platforms, and Cancel always aborts on both — unlike a
// bare Alert.alert(title, message, [{text:'OK'},{text:label}]), where
// nothing stops "OK" from silently ending up wired as the cancel button on
// native while a web fallback's "OK" confirms, flipping the meaning of the
// same word between platforms.
export function confirmAction(
    title: string,
    message: string,
    confirmLabel: string,
    onConfirm: () => void,
    destructive: boolean = true,
): void {
    if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && typeof window.confirm === 'function' && window.confirm(`${title}\n\n${message}`)) {
            onConfirm();
        }
    } else {
        Alert.alert(title, message, [
            { text: 'Cancel', style: 'cancel' },
            { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
        ]);
    }
}
