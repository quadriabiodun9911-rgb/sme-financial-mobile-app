import React, { useState } from 'react';
import { Platform, TextInput, StyleSheet, TouchableOpacity, View, Text, Modal } from 'react-native';
import { Colors } from '../theme/colors';

interface Props {
    value: string;           // ISO date string YYYY-MM-DD
    onChange: (v: string) => void;
    style?: object;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function friendlyDate(iso: string): string {
    if (!iso || !iso.match(/^\d{4}-\d{2}-\d{2}$/)) return '';
    const [y, m, d] = iso.split('-');
    return `${parseInt(d, 10)} ${MONTHS[parseInt(m, 10) - 1]} ${y}`;
}

function clamp(val: number, min: number, max: number) {
    return Math.min(Math.max(val, min), max);
}

function daysInMonth(year: number, month: number) {
    return new Date(year, month, 0).getDate();
}

export default function DateInput({ value, onChange, style }: Props) {
    const [pickerOpen, setPickerOpen] = useState(false);

    const today = new Date();
    const parsed = value && value.match(/^\d{4}-\d{2}-\d{2}$/)
        ? { y: parseInt(value.slice(0,4)), m: parseInt(value.slice(5,7)), d: parseInt(value.slice(8,10)) }
        : { y: today.getFullYear(), m: today.getMonth() + 1, d: today.getDate() };

    const [pickerY, setPickerY] = useState(parsed.y);
    const [pickerM, setPickerM] = useState(parsed.m);
    const [pickerD, setPickerD] = useState(parsed.d);

    const openPicker = () => {
        const p = value && value.match(/^\d{4}-\d{2}-\d{2}$/)
            ? { y: parseInt(value.slice(0,4)), m: parseInt(value.slice(5,7)), d: parseInt(value.slice(8,10)) }
            : { y: today.getFullYear(), m: today.getMonth() + 1, d: today.getDate() };
        setPickerY(p.y); setPickerM(p.m); setPickerD(p.d);
        setPickerOpen(true);
    };

    const confirmPicker = () => {
        const maxD = daysInMonth(pickerY, pickerM);
        const safeD = clamp(pickerD, 1, maxD);
        const iso = `${pickerY}-${String(pickerM).padStart(2,'0')}-${String(safeD).padStart(2,'0')}`;
        onChange(iso);
        setPickerOpen(false);
    };

    if (Platform.OS === 'web') {
        // Native HTML date picker on web
        return (
            <input
                type="date"
                value={value}
                onChange={e => onChange(e.target.value)}
                style={{
                    backgroundColor: Colors.bg,
                    border: `1px solid ${Colors.border}`,
                    borderRadius: 8,
                    padding: '10px 12px',
                    color: Colors.textPrimary,
                    fontSize: 14,
                    width: '100%',
                    boxSizing: 'border-box',
                    colorScheme: 'dark',
                    ...(style as any),
                }}
            />
        );
    }

    // Native: tappable field + simple +/- picker modal
    const maxD = daysInMonth(pickerY, pickerM);

    return (
        <>
            <TouchableOpacity style={[styles.input, style as any]} onPress={openPicker}>
                <Text style={value ? styles.valueText : styles.placeholder}>
                    {value ? friendlyDate(value) : 'Tap to pick a date'}
                </Text>
                <Text style={styles.calIcon}>📅</Text>
            </TouchableOpacity>

            <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
                <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setPickerOpen(false)} />
                <View style={styles.pickerCard}>
                    <Text style={styles.pickerTitle}>Pick a Date</Text>

                    <View style={styles.pickerRow}>
                        <View style={styles.spinnerCol}>
                            <Text style={styles.spinnerLabel}>Day</Text>
                            <TouchableOpacity onPress={() => setPickerD(d => clamp(d - 1, 1, maxD))}><Text style={styles.spinnerBtn}>▲</Text></TouchableOpacity>
                            <Text style={styles.spinnerVal}>{pickerD}</Text>
                            <TouchableOpacity onPress={() => setPickerD(d => clamp(d + 1, 1, maxD))}><Text style={styles.spinnerBtn}>▼</Text></TouchableOpacity>
                        </View>

                        <View style={styles.spinnerCol}>
                            <Text style={styles.spinnerLabel}>Month</Text>
                            <TouchableOpacity onPress={() => setPickerM(m => m <= 1 ? 12 : m - 1)}><Text style={styles.spinnerBtn}>▲</Text></TouchableOpacity>
                            <Text style={styles.spinnerVal}>{MONTHS[pickerM - 1]}</Text>
                            <TouchableOpacity onPress={() => setPickerM(m => m >= 12 ? 1 : m + 1)}><Text style={styles.spinnerBtn}>▼</Text></TouchableOpacity>
                        </View>

                        <View style={styles.spinnerCol}>
                            <Text style={styles.spinnerLabel}>Year</Text>
                            <TouchableOpacity onPress={() => setPickerY(y => y - 1)}><Text style={styles.spinnerBtn}>▲</Text></TouchableOpacity>
                            <Text style={styles.spinnerVal}>{pickerY}</Text>
                            <TouchableOpacity onPress={() => setPickerY(y => y + 1)}><Text style={styles.spinnerBtn}>▼</Text></TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.pickerBtns}>
                        <TouchableOpacity style={styles.cancelBtn} onPress={() => setPickerOpen(false)}>
                            <Text style={styles.cancelText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.confirmBtn} onPress={confirmPicker}>
                            <Text style={styles.confirmText}>Confirm</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    input: {
        backgroundColor: Colors.bg,
        borderColor: Colors.border,
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    valueText:   { color: Colors.textPrimary, fontSize: 14 },
    placeholder: { color: Colors.muted ?? Colors.textMuted, fontSize: 14 },
    calIcon:     { fontSize: 16 },

    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    pickerCard: {
        backgroundColor: Colors.surface,
        marginHorizontal: 24,
        borderRadius: 16,
        padding: 24,
        position: 'absolute',
        top: '30%',
        left: 24,
        right: 24,
    },
    pickerTitle: { fontSize: 17, fontWeight: 'bold', color: Colors.textPrimary, textAlign: 'center', marginBottom: 20 },
    pickerRow:   { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 24 },
    spinnerCol:  { alignItems: 'center', gap: 8 },
    spinnerLabel:{ fontSize: 11, color: Colors.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
    spinnerBtn:  { fontSize: 20, color: Colors.primary, paddingHorizontal: 10 },
    spinnerVal:  { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary, minWidth: 50, textAlign: 'center' },
    pickerBtns:  { flexDirection: 'row', gap: 12 },
    cancelBtn:   { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
    cancelText:  { color: Colors.textMuted, fontWeight: '600' },
    confirmBtn:  { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', backgroundColor: Colors.primary },
    confirmText: { color: Colors.textPrimary, fontWeight: 'bold' },
});
