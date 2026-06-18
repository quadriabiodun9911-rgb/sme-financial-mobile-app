import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Screen } from '../types';

const MORE_ITEMS: { label: string; icon: string; screen: Screen }[] = [
    { label: 'Growth',        icon: '📈', screen: 'growth'    },
    { label: 'Goals',         icon: '🎯', screen: 'goals'     },
    { label: 'Insights',      icon: '💡', screen: 'insights'  },
    { label: 'Inventory',     icon: '📦', screen: 'inventory' },
    { label: 'Budget',        icon: '💰', screen: 'budget'    },
    { label: 'Loans',         icon: '🏦', screen: 'loans'     },
    { label: 'Assets',        icon: '🏢', screen: 'assets'    },
    { label: 'Analysis',      icon: '📊', screen: 'analysis'  },
    { label: 'CFO Assistant', icon: '🤖', screen: 'cfo'       },
    { label: 'Settings',      icon: '⚙️', screen: 'settings'  },
];

export default function FooterNav() {
    const { currentScreen, setCurrentScreen } = useApp();
    const [moreOpen, setMoreOpen] = useState(false);

    const TABS: { label: string; screen: Screen; icon: string }[] = [
        { label: 'Home',      screen: 'dashboard',    icon: '⬛' },
        { label: 'Sales Log', screen: 'transactions', icon: '📋' },
        { label: 'Invoices',  screen: 'invoices',     icon: '🧾' },
        { label: 'Reports',   screen: 'reports',      icon: '📊' },
    ];

    return (
        <>
            <View style={styles.footer}>
                {TABS.map(tab => {
                    const active = currentScreen === tab.screen;
                    return (
                        <TouchableOpacity
                            key={tab.screen}
                            style={styles.item}
                            onPress={() => setCurrentScreen(tab.screen)}
                        >
                            <Text style={styles.icon}>{tab.icon}</Text>
                            <Text style={[styles.text, active && styles.active]}>{tab.label}</Text>
                            {active && <View style={styles.indicator} />}
                        </TouchableOpacity>
                    );
                })}
                <TouchableOpacity style={styles.item} onPress={() => setMoreOpen(true)}>
                    <Text style={styles.icon}>☰</Text>
                    <Text style={styles.text}>More</Text>
                </TouchableOpacity>
            </View>

            <Modal visible={moreOpen} transparent animationType="slide" onRequestClose={() => setMoreOpen(false)}>
                <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setMoreOpen(false)} />
                <View style={styles.sheet}>
                    <View style={styles.handle} />
                    <Text style={styles.sheetTitle}>More</Text>
                    <ScrollView>
                        {MORE_ITEMS.map(item => (
                            <TouchableOpacity
                                key={item.screen}
                                style={styles.moreRow}
                                onPress={() => { setCurrentScreen(item.screen); setMoreOpen(false); }}
                            >
                                <Text style={styles.moreIcon}>{item.icon}</Text>
                                <Text style={styles.moreLabel}>{item.label}</Text>
                                <Text style={styles.moreArrow}>›</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingVertical: 10,
        paddingBottom: 14,
        backgroundColor: Colors.surface,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
    },
    item: { alignItems: 'center', flex: 1 },
    icon: { fontSize: 14, marginBottom: 2 },
    text: { color: Colors.textMuted, fontSize: 10 },
    active: { color: Colors.primary, fontWeight: 'bold' },
    indicator: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: Colors.primary,
        marginTop: 3,
    },

    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet: {
        backgroundColor: Colors.surface,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingHorizontal: 20,
        paddingBottom: 40,
        maxHeight: '70%',
    },
    handle: {
        width: 40, height: 4,
        backgroundColor: Colors.border,
        borderRadius: 2,
        alignSelf: 'center',
        marginTop: 12,
        marginBottom: 12,
    },
    sheetTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: Colors.textPrimary,
        marginBottom: 12,
    },
    moreRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
        gap: 14,
    },
    moreIcon:  { fontSize: 22, width: 30, textAlign: 'center' },
    moreLabel: { flex: 1, fontSize: 15, color: Colors.textPrimary, fontWeight: '600' },
    moreArrow: { fontSize: 20, color: Colors.textMuted },
});
