import React, { useState, useMemo } from 'react';
import {
    Modal, View, Text, TextInput, TouchableOpacity,
    StyleSheet, ScrollView, SafeAreaView,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';

interface Props {
    visible: boolean;
    onClose: () => void;
}

export default function GlobalSearch({ visible, onClose }: Props) {
    const { transactions, invoices, assets, settings, setCurrentScreen } = useApp();
    const [query, setQuery] = useState('');
    const currency = settings.currency;

    const q = query.toLowerCase().trim();

    const results = useMemo(() => {
        if (q.length < 2) return { transactions: [], invoices: [], assets: [] };
        return {
            transactions: transactions.filter(t =>
                t.description.toLowerCase().includes(q) ||
                t.category.toLowerCase().includes(q) ||
                (t.vendorCustomer ?? '').toLowerCase().includes(q)
            ).slice(0, 8),
            invoices: invoices.filter(inv =>
                inv.clientName.toLowerCase().includes(q) ||
                inv.invoiceNumber.toLowerCase().includes(q)
            ).slice(0, 5),
            assets: assets.filter(a =>
                a.name.toLowerCase().includes(q) ||
                a.category.toLowerCase().includes(q)
            ).slice(0, 4),
        };
    }, [q, transactions, invoices, assets]);

    const totalResults = results.transactions.length + results.invoices.length + results.assets.length;

    const handleClose = () => { setQuery(''); onClose(); };

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
            <SafeAreaView style={styles.root}>
                <View style={styles.searchBar}>
                    <Text style={styles.searchIcon}>🔍</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Search transactions, invoices, assets..."
                        placeholderTextColor={Colors.textMuted}
                        value={query}
                        onChangeText={setQuery}
                        autoFocus
                        returnKeyType="search"
                    />
                    <TouchableOpacity onPress={handleClose} style={styles.cancelBtn}>
                        <Text style={styles.cancelText}>Cancel</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView style={styles.results} keyboardShouldPersistTaps="handled">
                    {q.length < 2 && (
                        <View style={styles.emptyHint}>
                            <Text style={styles.emptyHintText}>Type at least 2 characters to search</Text>
                            <Text style={styles.emptyHintSub}>Searches transactions, invoices & assets</Text>
                        </View>
                    )}

                    {q.length >= 2 && totalResults === 0 && (
                        <View style={styles.emptyHint}>
                            <Text style={styles.emptyHintText}>No results for "{query}"</Text>
                            <Text style={styles.emptyHintSub}>Try a different word or check spelling</Text>
                        </View>
                    )}

                    {results.transactions.length > 0 && (
                        <>
                            <Text style={styles.sectionHeader}>Transactions</Text>
                            {results.transactions.map(t => (
                                <TouchableOpacity key={t.id} style={styles.resultRow} onPress={() => { handleClose(); setCurrentScreen('transactions'); }}>
                                    <View style={[styles.resultDot, { backgroundColor: t.type === 'income' ? Colors.income : Colors.expense }]} />
                                    <View style={styles.resultInfo}>
                                        <Text style={styles.resultTitle}>{t.description}</Text>
                                        <Text style={styles.resultSub}>{t.date} · {t.category}</Text>
                                    </View>
                                    <Text style={[styles.resultAmount, { color: t.type === 'income' ? Colors.income : Colors.expense }]}>
                                        {t.type === 'income' ? '+' : '-'}{currency}{Number(t.amount).toLocaleString()}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </>
                    )}

                    {results.invoices.length > 0 && (
                        <>
                            <Text style={styles.sectionHeader}>Invoices</Text>
                            {results.invoices.map(inv => (
                                <TouchableOpacity key={inv.id} style={styles.resultRow} onPress={() => { handleClose(); setCurrentScreen('invoices'); }}>
                                    <Text style={styles.resultIcon}>🧾</Text>
                                    <View style={styles.resultInfo}>
                                        <Text style={styles.resultTitle}>{inv.clientName}</Text>
                                        <Text style={styles.resultSub}>{inv.invoiceNumber} · {inv.status}</Text>
                                    </View>
                                    <Text style={styles.resultAmount}>{currency}{inv.total.toLocaleString()}</Text>
                                </TouchableOpacity>
                            ))}
                        </>
                    )}

                    {results.assets.length > 0 && (
                        <>
                            <Text style={styles.sectionHeader}>Assets</Text>
                            {results.assets.map(a => (
                                <TouchableOpacity key={a.id} style={styles.resultRow} onPress={() => { handleClose(); setCurrentScreen('assets'); }}>
                                    <Text style={styles.resultIcon}>🏗️</Text>
                                    <View style={styles.resultInfo}>
                                        <Text style={styles.resultTitle}>{a.name}</Text>
                                        <Text style={styles.resultSub}>{a.category} · {a.status}</Text>
                                    </View>
                                    <Text style={styles.resultAmount}>{currency}{a.purchaseCost.toLocaleString()}</Text>
                                </TouchableOpacity>
                            ))}
                        </>
                    )}
                </ScrollView>
            </SafeAreaView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    root:        { flex: 1, backgroundColor: Colors.bg },
    searchBar:   { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.surface },
    searchIcon:  { fontSize: 16 },
    input:       { flex: 1, fontSize: 16, color: Colors.textPrimary, paddingVertical: 8 },
    cancelBtn:   { paddingHorizontal: 8, paddingVertical: 6 },
    cancelText:  { color: Colors.primary, fontSize: 14, fontWeight: '600' },
    results:     { flex: 1 },
    sectionHeader: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 },
    resultRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 12 },
    resultDot:   { width: 10, height: 10, borderRadius: 5 },
    resultIcon:  { fontSize: 18 },
    resultInfo:  { flex: 1 },
    resultTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, marginBottom: 2 },
    resultSub:   { fontSize: 11, color: Colors.textMuted },
    resultAmount:{ fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    emptyHint:   { padding: 40, alignItems: 'center' },
    emptyHintText: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary, marginBottom: 6 },
    emptyHintSub:  { fontSize: 13, color: Colors.textMuted },
});
