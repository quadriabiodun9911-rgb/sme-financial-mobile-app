import { Alert, Platform } from 'react-native';
import { pushWebAlert } from '../components/AlertHost';

// Alert.alert is a silent no-op on react-native-web. Centralized here so
// every screen falls back the same way instead of each reimplementing (and
// subtly diverging on) the same Platform.OS branch — six screens had done
// exactly that independently before this was extracted.
//
// The web fallback renders through AlertHost rather than window.alert/
// window.confirm: those browser dialogs are silently suppressed in a
// standalone (home-screen-installed) PWA on iOS and in several in-app
// webview wrappers — the action underneath still runs, but the user never
// sees whether it succeeded or failed, which is indistinguishable from the
// feature being broken.
//
// onAcknowledge covers the "single-button alert that also does something
// on dismiss" shape (e.g. a save confirmation that navigates away once the
// user taps OK) — without it, callers were reaching for their own
// Platform.OS branch again just for that one case.
export function showAlert(title: string, message?: string, onAcknowledge?: () => void): void {
    if (Platform.OS === 'web') {
        pushWebAlert({ title, message, buttons: [{ text: 'OK', onPress: onAcknowledge }] });
    } else if (onAcknowledge) {
        Alert.alert(title, message, [{ text: 'OK', onPress: onAcknowledge }]);
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
        pushWebAlert({
            title,
            message,
            buttons: [
                { text: 'Cancel', style: 'cancel' },
                { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
            ],
        });
    } else {
        Alert.alert(title, message, [
            { text: 'Cancel', style: 'cancel' },
            { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
        ]);
    }
}
