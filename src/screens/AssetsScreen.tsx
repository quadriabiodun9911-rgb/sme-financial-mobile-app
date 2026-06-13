import React, { useState, useMemo } from 'react';
import {
    SafeAreaView, ScrollView, View, Text, TextInput,
    TouchableOpacity, StyleSheet, Modal, Alert,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { t } from '../utils/i18n';
import { Asset, AssetCategory } from '../types';
import { computeAssetCurrentValue, computeAssetAnnualDepreciation } from '../utils/finance';

const CATEGORIES: AssetCategory[] = ['equipment', 'vehicle', 'furniture', 'property', 'intangible', 'other'];

function categoryLabel(cat: AssetCategory, lang: Parameters<typeof t>[0]): string {
    const map: Record<AssetCategory, Parameters<typeof t>[1]> = {
        equipment: 'categoryEquipment', vehicle: 'categoryVehicle',
        furniture: 'categoryFurniture', property: 'categoryProperty',
        intangible: 'categoryIntangible', other: 'categoryOther',
    };
    return t(lang, map[cat]);
}

type FilterTab = 'active' | 'disposed' | 'all';

export default function AssetsScreen() {
    const { assets, addAsset, updateAsset, deleteAsset, disposeAsset, settings, language, setCurrentScreen } = useApp();
    const { currency } = settings;

    const [filter, setFilter] = useState<FilterTab>('active');
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showDispose, setShowDispose] = useState<string | null>(null);

    // Form state
    const [name, setName]             = useState('');
    const [category, setCategory]     = useState<AssetCategory>('equipment');
    const [description, setDesc]      = useState('');
    const [purchaseDate, setPDate]    = useState('');
    const [purchaseCost, setPCost]    = useState('');
    const [usefulLife, setLife]       = useState('');
    const [residualValue, setResidual]= useState('0');

    // Disposal form state
    const [disposalDate, setDispDate] = useState('');
    const [disposalValue, setDispVal] = useState('0');

    const resetForm = () => {
        setName(''); setCategory('equipment'); setDesc('');
        setPDate(new Date().toISOString().split('T')[0]);
        setPCost(''); setLife('5'); setResidual('0');
        setEditingId(null);
    };

    const openAdd = () => { resetForm(); setShowForm(true); };

    const openEdit = (a: Asset) => {
        setName(a.name); setCategory(a.category); setDesc(a.description);
        setPDate(a.purchaseDate); setPCost(String(a.purchaseCost));
        setLife(String(a.usefulLifeYears)); setResidual(String(a.residualValue));
        setEditingId(a.id); setShowForm(true);
    };

    const handleSave = () => {
        if (!name.trim()) { Alert.alert(t(language, 'error'), t(language, 'missingFields')); return; }
        const cost = parseFloat(purchaseCost);
        const life = parseFloat(usefulLife);
        const resid = parseFloat(residualValue) || 0;
        if (isNaN(cost) || cost <= 0) { Alert.alert(t(language, 'error'), t(language, 'missingFields')); return; }
        if (isNaN(life) || life <= 0) { Alert.alert(t(language, 'error'), t(language, 'missingFields')); return; }

        const payload = {
            name: name.trim(), category, description: description.trim(),
            purchaseDate: purchaseDate || new Date().toISOString().split('T')[0],
            purchaseCost: cost, usefulLifeYears: life, residualValue: resid,
            status: 'active' as const,
        };

        if (editingId) {
            updateAsset(editingId, payload);
        } else {
            addAsset(payload);
        }
        setShowForm(false);
        resetForm();
    };

    const handleDispose = (id: string) => {
        const dVal = parseFloat(disposalValue) || 0;
        const dDate = disposalDate || new Date().toISOString().split('T')[0];
        disposeAsset(id, dDate, dVal);
        setShowDispose(null);
        setDispDate(''); setDispVal('0');
    };

    const confirmDelete = (id: string) => {
        Alert.alert(t(language, 'delete'), t(language, 'confirm'), [
            { text: t(language, 'cancel'), style: 'cancel' },
            { text: t(language, 'delete'), style: 'destructive', onPress: () => deleteAsset(id) },
        ]);
    };

    const filtered = useMemo(() => {
        if (filter === 'all') return assets;
        return assets.filter(a => a.status === filter);
    }, [assets, filter]);

    const totalActiveValue = useMemo(
        () => assets.filter(a => a.status === 'active').reduce((sum, a) => sum + computeAssetCurrentValue(a), 0),
        [assets],
    );

    const grouped = useMemo(() => {
        const map = new Map<AssetCategory, Asset[]>();
        for (const a of filtered) {
            if (!map.has(a.category)) map.set(a.category, []);
            map.get(a.category)!.push(a);
        }
        return map;
    }, [filtered]);

    const TABS: FilterTab[] = ['active', 'disposed', 'all'];

    return (
        <SafeAreaView style={s.safe}>
            <Header />
            <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                    <Text style={[s.title, { flex: 1, marginBottom: 0 }]}>{t(language, 'assetRegister')}</Text>
                    <TouchableOpacity
                        style={{ backgroundColor: Colors.surface, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: Colors.border }}
                        onPress={() => setCurrentScreen('loans')}>
                        <Text style={{ fontSize: 12, color: Colors.primary, fontWeight: '600' }}>🏦 Loan Register →</Text>
                    </TouchableOpacity>
                </View>

                {/* Summary */}
                <View style={s.summaryCard}>
                    <Text style={s.summaryLabel}>{t(language, 'totalActiveValue')}</Text>
                    <Text style={s.summaryValue}>{currency}{totalActiveValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                    <Text style={s.summaryMeta}>{assets.filter(a => a.status === 'active').length} active · {assets.filter(a => a.status === 'disposed').length} disposed</Text>
                </View>

                {/* Replacement alerts */}
                {assets.filter(a => a.status === 'active' && computeAssetCurrentValue(a) <= a.purchaseCost * 0.2 && a.purchaseCost > 0).map(a => (
                    <View key={a.id} style={s.replaceAlert}>
                        <Text style={s.replaceAlertText}>
                            🔔 <Text style={{ fontWeight: '700' }}>{a.name}</Text> is nearly fully depreciated ({Math.round((computeAssetCurrentValue(a) / a.purchaseCost) * 100)}% remaining value) — plan for replacement.
                        </Text>
                    </View>
                ))}

                {/* Filter tabs */}
                <View style={s.tabRow}>
                    {TABS.map(tab => (
                        <TouchableOpacity key={tab} style={[s.tab, filter === tab && s.tabActive]} onPress={() => setFilter(tab)}>
                            <Text style={[s.tabText, filter === tab && s.tabTextActive]}>
                                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {filtered.length === 0 ? (
                    <Text style={s.empty}>{t(language, 'noAssetsYet')}</Text>
                ) : (
                    Array.from(grouped.entries()).map(([cat, items]) => (
                        <View key={cat}>
                            <Text style={s.groupHeader}>{categoryLabel(cat, language)}</Text>
                            {items.map(a => <AssetCard key={a.id} asset={a} currency={currency} language={language}
                                onEdit={() => openEdit(a)}
                                onDispose={() => { setShowDispose(a.id); setDispDate(new Date().toISOString().split('T')[0]); }}
                                onDelete={() => confirmDelete(a.id)}
                            />)}
                        </View>
                    ))
                )}
            </ScrollView>

            <TouchableOpacity style={s.fab} onPress={openAdd}>
                <Text style={s.fabText}>+</Text>
            </TouchableOpacity>

            {/* Add / Edit Modal */}
            <Modal visible={showForm} animationType="slide" transparent>
                <View style={s.overlay}>
                    <View style={s.sheet}>
                        <ScrollView keyboardShouldPersistTaps="handled">
                            <Text style={s.modalTitle}>{editingId ? t(language, 'edit') : t(language, 'addAsset')}</Text>

                            <Label text={t(language, 'assetName')} />
                            <TextInput style={s.input} value={name} onChangeText={setName} placeholderTextColor={Colors.muted} placeholder="e.g. Dell Laptop" />

                            <Label text={t(language, 'assetCategory')} />
                            <View style={s.chipRow}>
                                {CATEGORIES.map(c => (
                                    <TouchableOpacity key={c} style={[s.chip, category === c && s.chipActive]} onPress={() => setCategory(c)}>
                                        <Text style={[s.chipText, category === c && s.chipTextActive]}>{categoryLabel(c, language)}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <Label text={t(language, 'assetDescription')} />
                            <TextInput style={s.input} value={description} onChangeText={setDesc} placeholderTextColor={Colors.muted} placeholder="optional" />

                            <Label text={t(language, 'purchaseDate')} />
                            <TextInput style={s.input} value={purchaseDate} onChangeText={setPDate} placeholderTextColor={Colors.muted} placeholder="2024-01-15" />

                            <Label text={`${t(language, 'purchaseCost')} (${currency})`} />
                            <TextInput style={s.input} value={purchaseCost} onChangeText={setPCost} placeholderTextColor={Colors.muted} keyboardType="decimal-pad" placeholder="0" />

                            <Label text={t(language, 'usefulLife')} />
                            <TextInput style={s.input} value={usefulLife} onChangeText={setLife} placeholderTextColor={Colors.muted} keyboardType="decimal-pad" placeholder="5" />

                            <Label text={`${t(language, 'residualValue')} (${currency})`} />
                            <TextInput style={s.input} value={residualValue} onChangeText={setResidual} placeholderTextColor={Colors.muted} keyboardType="decimal-pad" placeholder="0" />

                            <View style={s.btnRow}>
                                <TouchableOpacity style={[s.btn, s.btnSecondary]} onPress={() => { setShowForm(false); resetForm(); }}>
                                    <Text style={s.btnSecText}>{t(language, 'cancel')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={s.btn} onPress={handleSave}>
                                    <Text style={s.btnText}>{t(language, 'save')}</Text>
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Dispose Modal */}
            {showDispose && (
                <Modal visible animationType="slide" transparent>
                    <View style={s.overlay}>
                        <View style={[s.sheet, { maxHeight: 320 }]}>
                            <Text style={s.modalTitle}>{t(language, 'disposeAsset')}</Text>

                            <Label text={t(language, 'disposalDate')} />
                            <TextInput style={s.input} value={disposalDate} onChangeText={setDispDate} placeholderTextColor={Colors.muted} />

                            <Label text={`${t(language, 'disposalValue')} (${currency})`} />
                            <TextInput style={s.input} value={disposalValue} onChangeText={setDispVal} keyboardType="decimal-pad" placeholderTextColor={Colors.muted} />

                            <View style={s.btnRow}>
                                <TouchableOpacity style={[s.btn, s.btnSecondary]} onPress={() => setShowDispose(null)}>
                                    <Text style={s.btnSecText}>{t(language, 'cancel')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[s.btn, { backgroundColor: Colors.warning }]} onPress={() => handleDispose(showDispose)}>
                                    <Text style={s.btnText}>{t(language, 'confirmDispose')}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>
            )}

            <FooterNav />
        </SafeAreaView>
    );
}

function AssetCard({ asset, currency, language, onEdit, onDispose, onDelete }: {
    asset: Asset; currency: string; language: Parameters<typeof t>[0];
    onEdit: () => void; onDispose: () => void; onDelete: () => void;
}) {
    const currentVal  = computeAssetCurrentValue(asset);
    const annualDep   = computeAssetAnnualDepreciation(asset);
    const accumulated = asset.purchaseCost - currentVal;
    const disposed    = asset.status === 'disposed';
    const valueRetained = asset.purchaseCost > 0 ? (currentVal / asset.purchaseCost) * 100 : 0;
    const healthColor = valueRetained > 60 ? Colors.income : valueRetained > 25 ? Colors.warning : Colors.expense;

    return (
        <View style={[s.card, disposed && s.cardDisposed]}>
            <View style={s.cardHeader}>
                <View style={{ flex: 1 }}>
                    <Text style={s.assetName}>{asset.name}</Text>
                    {asset.description ? <Text style={s.assetDesc}>{asset.description}</Text> : null}
                </View>
                {disposed && <View style={s.disposedBadge}><Text style={s.disposedBadgeText}>{t(language, 'assetDisposed')}</Text></View>}
            </View>

            <View style={s.metricsRow}>
                <Metric label={t(language, 'purchaseCost')} value={`${currency}${asset.purchaseCost.toLocaleString()}`} />
                <Metric label={t(language, 'currentValue')} value={`${currency}${currentVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} color={Colors.income} />
                <Metric label={t(language, 'accumulated')} value={`${currency}${accumulated.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} color={Colors.expense} />
            </View>

            {!disposed && (
                <>
                    {/* Value health bar */}
                    <View style={s.healthBarBg}>
                        <View style={[s.healthBarFill, { width: `${Math.max(2, valueRetained)}%` as any, backgroundColor: healthColor }]} />
                    </View>
                    <Text style={[s.healthLabel, { color: healthColor }]}>
                        {valueRetained.toFixed(0)}% value retained · {t(language, 'annualDepreciation')}: {currency}{annualDep.toLocaleString(undefined, { maximumFractionDigits: 0 })}/yr
                    </Text>
                </>
            )}

            {disposed && asset.disposalValue !== undefined && (
                <Text style={s.depLine}>Disposed {asset.disposalDate} · Sale: {currency}{asset.disposalValue.toLocaleString()}</Text>
            )}

            <Text style={s.dateLine}>Purchased {asset.purchaseDate}</Text>

            {!disposed && (
                <View style={s.actionRow}>
                    <TouchableOpacity style={s.actionBtn} onPress={onEdit}>
                        <Text style={s.actionBtnText}>{t(language, 'edit')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.actionBtn, { borderColor: Colors.warning }]} onPress={onDispose}>
                        <Text style={[s.actionBtnText, { color: Colors.warning }]}>{t(language, 'disposeAsset')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.actionBtn, { borderColor: Colors.expense }]} onPress={onDelete}>
                        <Text style={[s.actionBtnText, { color: Colors.expense }]}>{t(language, 'delete')}</Text>
                    </TouchableOpacity>
                </View>
            )}
            {disposed && (
                <TouchableOpacity style={[s.actionBtn, { borderColor: Colors.expense }]} onPress={onDelete}>
                    <Text style={[s.actionBtnText, { color: Colors.expense }]}>{t(language, 'delete')}</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
    return (
        <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={s.metricLabel}>{label}</Text>
            <Text style={[s.metricValue, color ? { color } : {}]}>{value}</Text>
        </View>
    );
}

function Label({ text }: { text: string }) {
    return <Text style={s.label}>{text}</Text>;
}

const s = StyleSheet.create({
    safe:  { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad:   { padding: 16, paddingBottom: 100 },
    title: { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 14 },

    summaryCard: {
        backgroundColor: Colors.surface, borderRadius: 12, padding: 16,
        marginBottom: 14, alignItems: 'center',
    },
    summaryLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 4 },
    summaryValue: { fontSize: 28, fontWeight: 'bold', color: Colors.income },
    summaryMeta:  { fontSize: 11, color: Colors.textMuted, marginTop: 4 },

    tabRow: { flexDirection: 'row', marginBottom: 14, gap: 8 },
    tab:        { flex: 1, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
    tabActive:  { backgroundColor: Colors.primary, borderColor: Colors.primary },
    tabText:    { fontSize: 12, color: Colors.textMuted },
    tabTextActive: { color: Colors.textPrimary, fontWeight: '600' },

    empty: { color: Colors.textMuted, textAlign: 'center', marginTop: 40, fontSize: 13 },

    groupHeader: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, marginBottom: 8, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.8 },

    card: {
        backgroundColor: Colors.surface, borderRadius: 12, padding: 14,
        marginBottom: 12, borderWidth: 1, borderColor: Colors.border,
    },
    cardDisposed: { opacity: 0.65 },
    cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
    assetName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
    assetDesc: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
    disposedBadge: { backgroundColor: 'rgba(156,163,175,0.2)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    disposedBadgeText: { fontSize: 10, color: Colors.textMuted, fontWeight: '600' },

    metricsRow: { flexDirection: 'row', marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
    metricLabel: { fontSize: 9, color: Colors.textMuted, textAlign: 'center', marginBottom: 2 },
    metricValue: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },

    depLine:  { fontSize: 11, color: Colors.textSecondary, marginBottom: 2 },
    dateLine: { fontSize: 11, color: Colors.textMuted, marginBottom: 8 },
    healthBarBg:   { height: 5, backgroundColor: Colors.border, borderRadius: 3, marginBottom: 3 },
    healthBarFill: { height: 5, borderRadius: 3 },
    healthLabel:   { fontSize: 10, fontWeight: '600', marginBottom: 4 },
    replaceAlert:  { backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: Colors.warning, borderRadius: 10, padding: 12, marginBottom: 10 },
    replaceAlertText: { fontSize: 12, color: Colors.warning, lineHeight: 18 },

    actionRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
    actionBtn: { flex: 1, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
    actionBtnText: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },

    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheet: {
        backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
        padding: 20, maxHeight: '90%',
    },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 16 },

    label: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 5, marginTop: 10 },
    input: {
        backgroundColor: Colors.bg, borderColor: Colors.border, borderWidth: 1,
        borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
        color: Colors.textPrimary, fontSize: 14,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
    chip:         { paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: Colors.border, borderRadius: 16, backgroundColor: Colors.bg },
    chipActive:   { borderColor: Colors.primary, backgroundColor: Colors.primary + '22' },
    chipText:     { fontSize: 11, color: Colors.textMuted },
    chipTextActive: { color: Colors.primary, fontWeight: '600' },

    btnRow: { flexDirection: 'row', gap: 10, marginTop: 20, marginBottom: 10 },
    btn:        { flex: 1, backgroundColor: Colors.primary, paddingVertical: 13, borderRadius: 8, alignItems: 'center' },
    btnSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.border },
    btnText:    { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 14 },
    btnSecText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 14 },

    fab: {
        position: 'absolute', right: 20, bottom: 80,
        width: 54, height: 54, borderRadius: 27,
        backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.3, shadowRadius: 6, elevation: 8,
    },
    fabText: { fontSize: 28, color: Colors.textPrimary, lineHeight: 32 },
});
