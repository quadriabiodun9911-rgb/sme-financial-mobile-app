import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, TextInput, Platform } from 'react-native';
import { Camera, CameraType } from 'expo-camera';
import { Colors } from '../theme/colors';
import { Radius, Spacing } from '../theme/tokens';
import Icon from './ui/Icon';

interface Props {
    visible: boolean;
    onClose: () => void;
    // Fires once per scan -- the caller owns closing the modal (or not,
    // e.g. to show an inline "no item found" state on top of it).
    onScanned: (code: string) => void;
    title?: string;
    hint?: string;
}

// Covers the barcode formats an SME's actual stock is printed with (EAN/UPC
// on manufactured goods, Code128/Code39 on printed shelf labels) plus QR for
// flexibility -- not an exhaustive list of every format expo-camera can
// decode, just the ones a retail product is realistically carrying.
const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'];

// expo-camera's web fallback only ever decodes QR codes (it shells out to a
// small in-browser QR reader, not a general barcode decoder) -- so a real
// product's EAN/UPC barcode would sit in front of a live camera on web and
// simply never fire a scan, with no feedback to the user. Rather than ship
// that silent dead end, web skips the camera entirely and goes straight to
// manual entry; native gets the real camera. Both paths converge on the
// same onScanned(code) callback either way.
const CAMERA_SCANNING_SUPPORTED = Platform.OS !== 'web';

export default function BarcodeScannerModal({ visible, onClose, onScanned, title = 'Scan Barcode', hint }: Props) {
    const [permission, requestPermission] = Camera.useCameraPermissions();
    const [locked, setLocked] = useState(false);
    const [manualCode, setManualCode] = useState('');
    const [manualOnly, setManualOnly] = useState(!CAMERA_SCANNING_SUPPORTED);

    useEffect(() => {
        if (visible) {
            setLocked(false);
            setManualCode('');
            setManualOnly(!CAMERA_SCANNING_SUPPORTED);
        }
    }, [visible]);

    const submitManual = () => {
        const code = manualCode.trim();
        if (!code) return;
        onScanned(code);
        setManualCode('');
    };

    const handleBarCodeScanned = ({ data }: { data: string }) => {
        if (locked || !data) return;
        setLocked(true);
        onScanned(data);
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
            <View style={styles.sheet}>
                <View style={styles.handle} />
                <View style={styles.headerRow}>
                    <Text style={styles.title}>{title}</Text>
                    <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Icon name="x" size={20} color={Colors.textMuted} />
                    </TouchableOpacity>
                </View>
                {!!hint && <Text style={styles.hint}>{hint}</Text>}

                {!manualOnly && CAMERA_SCANNING_SUPPORTED ? (
                    !permission ? (
                        <View style={styles.centerBox}><Text style={styles.centerText}>Checking camera access…</Text></View>
                    ) : !permission.granted ? (
                        <View style={styles.centerBox}>
                            <Icon name="camera-off" size={28} color={Colors.textMuted} />
                            <Text style={styles.centerText}>
                                {permission.canAskAgain
                                    ? 'Camera access is needed to scan a barcode.'
                                    : 'Camera access was denied. Enable it in your device Settings, or enter the code by hand below.'}
                            </Text>
                            {permission.canAskAgain && (
                                <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission}>
                                    <Text style={styles.primaryBtnText}>Grant Camera Access</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    ) : (
                        <View style={styles.cameraBox}>
                            <Camera
                                style={StyleSheet.absoluteFill}
                                type={CameraType.back}
                                barCodeScannerSettings={{ barCodeTypes: BARCODE_TYPES }}
                                onBarCodeScanned={locked ? undefined : handleBarCodeScanned}
                            />
                            <View pointerEvents="none" style={styles.scanFrame} />
                            <Text style={styles.scanCaption}>Point the camera at a barcode</Text>
                        </View>
                    )
                ) : null}

                {!manualOnly && CAMERA_SCANNING_SUPPORTED && (
                    <TouchableOpacity onPress={() => setManualOnly(true)} style={styles.manualToggle}>
                        <Text style={styles.manualToggleText}>Can't scan it? Enter the code manually →</Text>
                    </TouchableOpacity>
                )}

                {(manualOnly || !CAMERA_SCANNING_SUPPORTED) && (
                    <View style={styles.manualBox}>
                        {!CAMERA_SCANNING_SUPPORTED && (
                            <Text style={styles.hint}>
                                Barcode scanning needs a phone camera — open Quad360 on your phone to scan, or type the code printed under the barcode here.
                            </Text>
                        )}
                        <TextInput
                            style={styles.input}
                            value={manualCode}
                            onChangeText={setManualCode}
                            placeholder="e.g. 6154000123457"
                            placeholderTextColor={Colors.textMuted}
                            keyboardType={Platform.OS === 'web' ? 'default' : 'numeric'}
                            autoFocus={!CAMERA_SCANNING_SUPPORTED}
                            onSubmitEditing={submitManual}
                        />
                        <TouchableOpacity style={[styles.primaryBtn, !manualCode.trim() && styles.primaryBtnDisabled]} onPress={submitManual} disabled={!manualCode.trim()}>
                            <Text style={styles.primaryBtnText}>Use This Code</Text>
                        </TouchableOpacity>
                        {CAMERA_SCANNING_SUPPORTED && (
                            <TouchableOpacity onPress={() => setManualOnly(false)} style={styles.manualToggle}>
                                <Text style={styles.manualToggleText}>← Back to camera</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet: {
        backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
        padding: Spacing.lg, paddingBottom: Spacing.xl,
    },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: Spacing.md },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    title: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary },
    hint: { fontSize: 12.5, color: Colors.textMuted, marginBottom: Spacing.md, lineHeight: 18 },

    cameraBox: { height: 260, borderRadius: Radius.lg, overflow: 'hidden', backgroundColor: '#000', marginBottom: Spacing.sm },
    scanFrame: {
        position: 'absolute', top: '25%', left: '15%', right: '15%', bottom: '25%',
        borderWidth: 2, borderColor: '#ffffffcc', borderRadius: Radius.md,
    },
    scanCaption: {
        position: 'absolute', bottom: 12, left: 0, right: 0, textAlign: 'center',
        color: '#fff', fontSize: 12, fontWeight: '600',
    },

    centerBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm },
    centerText: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', paddingHorizontal: Spacing.lg },

    manualToggle: { alignSelf: 'center', paddingVertical: Spacing.sm },
    manualToggleText: { fontSize: 12.5, color: Colors.primary, fontWeight: '700' },

    manualBox: { gap: Spacing.sm },
    input: {
        backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm,
        paddingHorizontal: Spacing.md, paddingVertical: 12, color: Colors.textPrimary, fontSize: 15,
    },

    primaryBtn: { backgroundColor: Colors.primary, paddingVertical: 13, borderRadius: Radius.md, alignItems: 'center', marginTop: 4 },
    primaryBtnDisabled: { opacity: 0.5 },
    primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
