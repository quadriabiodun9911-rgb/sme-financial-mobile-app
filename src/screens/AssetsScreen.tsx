import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
    SafeAreaView, ScrollView, View, Text, TextInput,
    TouchableOpacity, StyleSheet, Modal, Platform, useWindowDimensions,
    Animated, Easing,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { t } from '../utils/i18n';
import { Asset, AssetCategory } from '../types';
import { computeAssetCurrentValue, computeAssetAnnualDepreciation, computeAssetsNearingReplacement, computeAssetPaybackSummary, countActiveMonths, computeUnregisteredAssetPurchases } from '../utils/finance';
import { analyzeAcquisition } from '../utils/assetAcquisitionEngine';
import AssetProductivityAnalysis from '../components/AssetProductivityAnalysis';
import { monthlyPayment } from '../utils/loanMath';
import DateInput from '../components/DateInput';
import NextStepLink from '../components/NextStepLink';
import ProfitCashImpactCard from '../components/ProfitCashImpactCard';
import { computeProfitCashImpact } from '../utils/impactChain';
import { showAlert, confirmAction } from '../utils/webAlert';
import Icon from '../components/ui/Icon';
import { Radius, Shadow, Spacing } from '../theme/tokens';

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
    const { assets, addAsset, updateAsset, deleteAsset, disposeAsset, settings, language, setCurrentScreen, navigate, finance, addLoan, addTransaction, transactions } = useApp();
    const { currency } = settings;

    // Modal renders via a portal on web, outside App.tsx's width constraint --
    // see FooterNav.tsx for the reference fix. Applied here to the bottom
    // sheets so they don't stretch full-bleed on desktop.
    const { width: windowWidth } = useWindowDimensions();
    const constrainSheetWidth = Platform.OS === 'web' && windowWidth >= 720;

    // Financing terms for the acquisition strategy comparison
    const [acqTerm, setAcqTerm] = useState('24');
    const [acqRate, setAcqRate] = useState('20');
    // Chosen acquisition method — drives what records get created on save
    const [acqMethod, setAcqMethod] = useState<'cash' | 'credit' | 'lease'>('cash');

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
        setAcqMethod('cash'); setAcqTerm('24'); setAcqRate('20');
        setEditingId(null);
    };

    const openAdd = () => { resetForm(); setShowForm(true); };

    // Prefills the same Add Asset form with what the bank statement already
    // told us for real (name, cost, date) -- useful life/category/residual
    // still need a person's judgment, so those stay at resetForm()'s
    // defaults for the user to set rather than being guessed.
    const openAddFromTransaction = (name: string, cost: number, date: string) => {
        resetForm();
        setName(name);
        setPCost(String(cost));
        setPDate(date);
        setShowForm(true);
    };

    const unregisteredPurchases = useMemo(
        () => computeUnregisteredAssetPurchases(transactions, assets),
        [transactions, assets],
    );

    const openEdit = useCallback((a: Asset) => {
        setName(a.name); setCategory(a.category); setDesc(a.description ?? '');
        setPDate(a.purchaseDate); setPCost(String(a.purchaseCost));
        setLife(String(a.usefulLifeYears)); setResidual(String(a.residualValue));
        setEditingId(a.id); setShowForm(true);
    }, []);

    const handleSave = () => {
        if (!name.trim()) { showAlert(t(language, 'error'), t(language, 'missingFields')); return; }
        const cost = parseFloat(purchaseCost);
        const life = parseFloat(usefulLife);
        const resid = parseFloat(residualValue) || 0;
        if (isNaN(cost) || cost <= 0) { showAlert(t(language, 'error'), t(language, 'missingFields')); return; }
        if (isNaN(life) || life <= 0) { showAlert(t(language, 'error'), t(language, 'missingFields')); return; }

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

            // Wire the chosen acquisition method into the rest of the app.
            const startDate = payload.purchaseDate;
            const term = parseInt(acqTerm) || 24;
            const rate = parseFloat(acqRate) || 0;
            if (acqMethod === 'credit') {
                // Owned asset financed by a loan — create the matching loan record.
                addLoan({
                    lenderName: `Financing: ${payload.name}`,
                    purpose: 'asset',
                    principal: cost,
                    interestRate: rate,
                    termMonths: term,
                    startDate,
                    status: 'active',
                    payments: [],
                } as any);
                confirmAction(
                    'Recorded',
                    `Asset added and a loan (${currency}${Math.round(monthlyPayment(cost, rate, term)).toLocaleString()}/mo for ${term} months) was created under Loans.`,
                    'View in Loans',
                    () => setCurrentScreen('loans'),
                    false,
                );
            } else if (acqMethod === 'lease') {
                // Leased — record the first monthly lease payment as an expense.
                const leaseMonthly = monthlyPayment(cost, rate + 6, term);
                addTransaction({
                    date: startDate,
                    description: `Lease payment: ${payload.name}`,
                    type: 'expense',
                    category: 'Lease/Rental',
                    amount: Math.round(leaseMonthly),
                    status: 'paid',
                } as any);
                showAlert('Recorded', `Asset added and a lease expense (${currency}${Math.round(leaseMonthly).toLocaleString()}/mo) was logged. Add each month's payment under Transactions as it recurs.`);
            }
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

    const confirmDelete = useCallback((id: string) => {
        confirmAction(t(language, 'delete'), t(language, 'confirm'), t(language, 'delete'), () => deleteAsset(id));
    }, [language, deleteAsset]);

    const handleOpenDispose = useCallback((id: string) => {
        setShowDispose(id);
        setDispDate(new Date().toISOString().split('T')[0]);
    }, []);

    const filtered = useMemo(() => {
        if (filter === 'all') return assets;
        return assets.filter(a => a.status === filter);
    }, [assets, filter]);

    // activeAssets/disposedCount/replacementAlerts were each their own
    // unmemoized `assets.filter(...)` pass run directly in JSX (three
    // separate O(n) scans -- one of them also calling computeAssetCurrentValue,
    // a depreciation calculation, per asset) on every render. Memoized once
    // here and reused everywhere they're read below.
    const activeAssets = useMemo(() => assets.filter(a => a.status === 'active'), [assets]);
    const disposedCount = useMemo(() => assets.filter(a => a.status === 'disposed').length, [assets]);
    const replacementAlerts = useMemo(
        () => computeAssetsNearingReplacement(activeAssets),
        [activeAssets],
    );

    const totalActiveValue = useMemo(
        () => activeAssets.reduce((sum, a) => sum + computeAssetCurrentValue(a), 0),
        [activeAssets],
    );

    const totalValueAnim = useRef(new Animated.Value(0)).current;
    const [animatedTotalValue, setAnimatedTotalValue] = useState(0);
    useEffect(() => {
        const id = totalValueAnim.addListener(({ value }) => setAnimatedTotalValue(value));
        Animated.timing(totalValueAnim, { toValue: totalActiveValue, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
        return () => totalValueAnim.removeListener(id);
    }, [totalActiveValue]);

    // "How long before this purchase pays for itself" -- how many months of
    // the business's own real average monthly profit this asset's cost
    // represents, and whether that many months have already passed since
    // it was bought. Business-wide profit, not a claim about what this one
    // asset specifically earned (the app has no way to attribute revenue to
    // one piece of equipment) -- the UI is explicit about that.
    const averageMonthlyProfit = useMemo(
        () => finance.profit / countActiveMonths(transactions),
        [finance.profit, transactions],
    );
    const paybackSummary = useMemo(
        () => computeAssetPaybackSummary(activeAssets, averageMonthlyProfit),
        [activeAssets, averageMonthlyProfit],
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
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
                <TouchableOpacity onPress={() => navigate('dashboard')}>
                    <Text style={{ color: Colors.primary, fontSize: 14 }}>← Dashboard</Text>
                </TouchableOpacity>
            </View>
            <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                    <Text style={[s.title, { flex: 1, marginBottom: 0 }]}>{t(language, 'assetRegister')}</Text>
                    <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, backgroundColor: Colors.surface, borderRadius: Radius.sm, paddingHorizontal: Spacing.md, paddingVertical: 7, borderWidth: 1, borderColor: Colors.border }}
                        onPress={() => setCurrentScreen('loans')}>
                        <Icon name="briefcase" size={13} color={Colors.primary} />
                        <Text style={{ fontSize: 12, color: Colors.primary, fontWeight: '600' }}>Loan Register →</Text>
                    </TouchableOpacity>
                </View>

                {/* Summary */}
                <View style={s.summaryCard}>
                    <Text style={s.summaryLabel}>{t(language, 'totalActiveValue')}</Text>
                    <Text style={s.summaryValue}>{currency}{Math.round(animatedTotalValue).toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                    <Text style={s.summaryMeta}>{activeAssets.length} active · {disposedCount} disposed</Text>
                </View>

                {/* Asset productivity: are these assets actually earning their
                    keep — ROA, turnover, efficiency — not just their book value. */}
                {activeAssets.length > 0 && (
                    <AssetProductivityAnalysis finance={finance} assets={assets} currency={currency} />
                )}

                {/* Payback / break-even: how long before each purchase has
                    paid for itself, at the business's own real profit rate. */}
                {paybackSummary.available && (
                    <View style={s.summaryCard}>
                        <Text style={s.summaryLabel}>Asset Payback (Estimated)</Text>
                        <Text style={s.paybackCaveat}>
                            {averageMonthlyProfit > 0
                                ? `Based on your business's average profit of ${currency}${Math.round(averageMonthlyProfit).toLocaleString()}/month — an aggregate estimate, not a claim about what any one asset itself earned.`
                                : "Your business hasn't been profitable on average, so a payback estimate can't be calculated yet."}
                        </Text>
                        {paybackSummary.items.map(item => (
                            <View key={item.id} style={s.paybackRow}>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.paybackName}>{item.name}</Text>
                                    <Text style={s.paybackDetail}>
                                        {item.paybackMonths === null
                                            ? `${currency}${item.purchaseCost.toLocaleString()} — no payback estimate available`
                                            : item.recovered
                                            ? item.paybackMonths === 0
                                                ? `Recovered — pays for itself in under a month at this rate`
                                                : `Recovered — ${item.monthsElapsed} months since purchase covers the ${item.paybackMonths}-month estimate`
                                            : `~${item.monthsRemaining} month${item.monthsRemaining === 1 ? '' : 's'} left of an estimated ${item.paybackMonths}-month payback`}
                                    </Text>
                                </View>
                                {item.paybackMonths !== null && (
                                    <View style={[s.paybackBadge, { backgroundColor: (item.recovered ? Colors.income : Colors.warning) + '20' }]}>
                                        <Text style={[s.paybackBadgeText, { color: item.recovered ? Colors.income : Colors.warning }]}>
                                            {item.recovered ? 'Paid Back' : `${item.paybackMonths}mo est.`}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        ))}
                    </View>
                )}

                {/* Asset purchases the import classifier already flagged
                    ("Asset Purchase" category) that never became a real
                    Asset record -- the real cost/date is filled in, only
                    category/useful life need a person's input. */}
                {unregisteredPurchases.length > 0 && (
                    <View style={s.detectedAlert}>
                        <View style={s.replaceAlertRow}>
                            <Icon name="upload" size={14} color={Colors.primary} />
                            <Text style={[s.replaceAlertText, { color: Colors.primary }]}>
                                {unregisteredPurchases.length} asset purchase{unregisteredPurchases.length > 1 ? 's' : ''} found in your transaction history {unregisteredPurchases.length > 1 ? "aren't" : "isn't"} in this Register yet.
                            </Text>
                        </View>
                        {unregisteredPurchases.slice(0, 3).map(p => (
                            <View key={p.transactionId} style={s.unregisteredRow}>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.unregisteredName} numberOfLines={1}>{p.description}</Text>
                                    <Text style={s.unregisteredMeta}>{p.date} · {currency}{p.amount.toLocaleString()}</Text>
                                </View>
                                <TouchableOpacity onPress={() => openAddFromTransaction(p.description, p.amount, p.date)}>
                                    <Text style={s.unregisteredAdd}>Add to Register →</Text>
                                </TouchableOpacity>
                            </View>
                        ))}
                    </View>
                )}

                {/* Replacement alerts */}
                {replacementAlerts.map(a => (
                    <View key={a.id} style={s.replaceAlert}>
                        <View style={s.replaceAlertRow}>
                            <Icon name="bell" size={14} color={Colors.warning} />
                            <Text style={s.replaceAlertText}>
                                <Text style={{ fontWeight: '700' }}>{a.name}</Text> is nearly fully depreciated ({Math.round((computeAssetCurrentValue(a) / a.purchaseCost) * 100)}% remaining value) — plan for replacement.
                            </Text>
                        </View>
                        <NextStepLink text="Set a replacement-fund goal" onPress={() => navigate('goals')} />
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
                                onEdit={openEdit}
                                onDispose={handleOpenDispose}
                                onDelete={confirmDelete}
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
                    <View style={[s.sheet, constrainSheetWidth && s.sheetWide]}>
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
                            <DateInput value={purchaseDate} onChange={setPDate} />

                            <Label text={`${t(language, 'purchaseCost')} (${currency})`} />
                            <TextInput style={s.input} value={purchaseCost} onChangeText={setPCost} placeholderTextColor={Colors.muted} keyboardType="decimal-pad" placeholder="0" />

                            <Label text={t(language, 'usefulLife')} />
                            <TextInput style={s.input} value={usefulLife} onChangeText={setLife} placeholderTextColor={Colors.muted} keyboardType="decimal-pad" placeholder="5" />

                            <Label text={`${t(language, 'residualValue')} (${currency})`} />
                            <TextInput style={s.input} value={residualValue} onChangeText={setResidual} placeholderTextColor={Colors.muted} keyboardType="decimal-pad" placeholder="0" />

                            {/* Acquisition Strategy: cash vs credit vs lease */}
                            {(() => {
                                const cost = parseFloat(purchaseCost);
                                if (isNaN(cost) || cost <= 0) return null;
                                const analysis = analyzeAcquisition({
                                    cost,
                                    usefulLifeYears: parseFloat(usefulLife) || 5,
                                    residualValue: parseFloat(residualValue) || 0,
                                    termMonths: parseInt(acqTerm) || 24,
                                    aprPercent: parseFloat(acqRate) || 0,
                                    cashBalance: finance?.cashBalance ?? 0,
                                    monthlyProfit: finance?.profit ?? 0,
                                    minReserve: parseFloat(settings.minReserve || '0') || 0,
                                    currency,
                                });
                                const recColor = Colors.primary;
                                return (
                                    <View style={s.acqCard}>
                                        <View style={s.acqTitleRow}>
                                            <Icon name="zap" size={14} color={Colors.text} />
                                            <Text style={s.acqTitle}>How should you acquire this?</Text>
                                        </View>
                                        <View style={s.acqTermRow}>
                                            <View style={{ flex: 1 }}>
                                                <Label text="Finance term (months)" />
                                                <TextInput style={s.input} value={acqTerm} onChangeText={setAcqTerm} keyboardType="number-pad" placeholder="24" placeholderTextColor={Colors.muted} />
                                            </View>
                                            <View style={{ width: 12 }} />
                                            <View style={{ flex: 1 }}>
                                                <Label text="Interest rate (% APR)" />
                                                <TextInput style={s.input} value={acqRate} onChangeText={setAcqRate} keyboardType="decimal-pad" placeholder="20" placeholderTextColor={Colors.muted} />
                                            </View>
                                        </View>

                                        <Text style={s.acqHint}>Tap a method to record the asset that way when you save:</Text>
                                        {analysis.options.map(opt => {
                                            const isRec = opt.method === analysis.recommended;
                                            const isSelected = opt.method === acqMethod;
                                            return (
                                                <TouchableOpacity
                                                    key={opt.method}
                                                    activeOpacity={0.8}
                                                    onPress={() => setAcqMethod(opt.method)}
                                                    style={[s.acqOption, isSelected && { borderColor: recColor, borderWidth: 2, backgroundColor: recColor + '10' }]}
                                                >
                                                    <View style={s.acqOptHeader}>
                                                        <Text style={s.acqOptLabel}>{isSelected ? '● ' : '○ '}{opt.label}{isRec ? '  ⭐' : ''}</Text>
                                                        <Text style={s.acqOptOwns}>{opt.ownsAsset ? 'You own it' : 'Rented'}</Text>
                                                    </View>
                                                    <Text style={s.acqLine}>Upfront cash: <Text style={s.acqVal}>{currency}{Math.round(opt.upfront).toLocaleString()}</Text>{opt.monthly > 0 ? <Text> · Monthly: <Text style={s.acqVal}>{currency}{Math.round(opt.monthly).toLocaleString()}</Text> × {opt.termMonths}</Text> : null}</Text>
                                                    <Text style={s.acqLine}>Total paid: <Text style={s.acqVal}>{currency}{Math.round(opt.totalCashPaid).toLocaleString()}</Text>{opt.extraVsCash > 0 ? <Text style={{ color: Colors.expense }}>  (+{currency}{Math.round(opt.extraVsCash).toLocaleString()} vs cash)</Text> : null}</Text>
                                                    <Text style={s.acqLine}>Monthly profit impact: <Text style={[s.acqVal, { color: Colors.expense }]}>-{currency}{Math.round(opt.monthlyProfitImpact).toLocaleString()}</Text></Text>
                                                    {opt.method === 'cash' && (
                                                        <Text style={[s.acqFlag, { color: opt.keepsReserve ? Colors.income : Colors.expense }]}>
                                                            {opt.affordableNow
                                                                ? (opt.keepsReserve
                                                                    ? `✓ Cash after: ${currency}${Math.round(opt.cashAfterUpfront).toLocaleString()} (reserve kept)`
                                                                    : `⚠ Cash after: ${currency}${Math.round(opt.cashAfterUpfront).toLocaleString()} — below your minimum reserve`)
                                                                : `⚠ Not enough cash (short by ${currency}${Math.round(cost - (finance?.cashBalance ?? 0)).toLocaleString()})`}
                                                        </Text>
                                                    )}
                                                    {opt.method !== 'cash' && (
                                                        <Text style={[s.acqFlag, { color: opt.serviceable ? Colors.income : Colors.expense }]}>
                                                            {opt.serviceable
                                                                ? `✓ ${currency}${Math.round(opt.monthly).toLocaleString()}/mo is covered by profit`
                                                                : `⚠ ${currency}${Math.round(opt.monthly).toLocaleString()}/mo exceeds current monthly profit`}
                                                        </Text>
                                                    )}
                                                </TouchableOpacity>
                                            );
                                        })}

                                        <View style={[s.acqVerdict, { borderColor: recColor }]}>
                                            <Text style={[s.acqVerdictText, { color: recColor }]}>{analysis.rationale}</Text>
                                        </View>

                                        {(() => {
                                            const selected = analysis.options.find(o => o.method === acqMethod);
                                            if (!selected) return null;
                                            return (
                                                <ProfitCashImpactCard
                                                    impact={computeProfitCashImpact(finance?.profit ?? 0, (finance?.cashBalance ?? 0) - selected.upfront, -selected.monthlyProfitImpact)}
                                                    source="asset"
                                                    currency={currency}
                                                    onSeeFullPicture={() => navigate('business-passport')}
                                                />
                                            );
                                        })()}
                                    </View>
                                );
                            })()}

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
                        <View style={[s.sheet, { maxHeight: 320 }, constrainSheetWidth && s.sheetWide]}>
                            <Text style={s.modalTitle}>{t(language, 'disposeAsset')}</Text>

                            <Label text={t(language, 'disposalDate')} />
                            <DateInput value={disposalDate} onChange={setDispDate} />

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

// React.memo + stable (useCallback'd) handlers from the parent -- see the
// matching note on LoanCard in LoansScreen.tsx for why both halves matter.
const AssetCard = React.memo(function AssetCard({ asset, currency, language, onEdit, onDispose, onDelete }: {
    asset: Asset; currency: string; language: Parameters<typeof t>[0];
    onEdit: (asset: Asset) => void; onDispose: (id: string) => void; onDelete: (id: string) => void;
}) {
    const currentVal  = computeAssetCurrentValue(asset);
    const annualDep   = computeAssetAnnualDepreciation(asset);
    const accumulated = asset.purchaseCost - currentVal;
    const disposed    = asset.status === 'disposed';
    const valueRetained = asset.purchaseCost > 0 ? (currentVal / asset.purchaseCost) * 100 : 0;
    const healthColor = valueRetained > 60 ? Colors.income : valueRetained > 25 ? Colors.warning : Colors.expense;

    const barAnim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.timing(barAnim, {
            toValue: Math.max(2, Math.min(valueRetained, 100)),
            duration: 700,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
    }, [valueRetained]);

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
                        <Animated.View style={[s.healthBarFill, {
                            backgroundColor: healthColor,
                            width: barAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
                        }]} />
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
                    <TouchableOpacity style={s.actionBtn} onPress={() => onEdit(asset)}>
                        <Text style={s.actionBtnText}>{t(language, 'edit')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.actionBtn, { borderColor: Colors.warning }]} onPress={() => onDispose(asset.id)}>
                        <Text style={[s.actionBtnText, { color: Colors.warning }]}>{t(language, 'disposeAsset')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.actionBtn, { borderColor: Colors.expense }]} onPress={() => onDelete(asset.id)}>
                        <Text style={[s.actionBtnText, { color: Colors.expense }]}>{t(language, 'delete')}</Text>
                    </TouchableOpacity>
                </View>
            )}
            {disposed && (
                <TouchableOpacity style={[s.actionBtn, { borderColor: Colors.expense }]} onPress={() => onDelete(asset.id)}>
                    <Text style={[s.actionBtnText, { color: Colors.expense }]}>{t(language, 'delete')}</Text>
                </TouchableOpacity>
            )}
        </View>
    );
});

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
    pad:   { padding: Spacing.lg, paddingBottom: 100 },
    title: { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 14 },

    summaryCard: {
        backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.lg,
        marginBottom: 14, alignItems: 'center',
        borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
    },
    summaryLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: Spacing.xs },
    summaryValue: { fontSize: 28, fontWeight: 'bold', color: Colors.income },
    summaryMeta:  { fontSize: 11, color: Colors.textMuted, marginTop: Spacing.xs },

    paybackCaveat: { fontSize: 11, color: Colors.textMuted, lineHeight: 15, marginTop: Spacing.xs, marginBottom: Spacing.md },
    paybackRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border, gap: Spacing.sm },
    paybackName: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    paybackDetail: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 2, lineHeight: 15 },
    paybackBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.pill },
    paybackBadgeText: { fontSize: 10.5, fontWeight: '800' },

    tabRow: { flexDirection: 'row', marginBottom: 14, gap: Spacing.sm },
    tab:        { flex: 1, paddingVertical: 7, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
    tabActive:  { backgroundColor: Colors.primary, borderColor: Colors.primary },
    tabText:    { fontSize: 12, color: Colors.textMuted },
    tabTextActive: { color: '#fff', fontWeight: '600' },

    empty: { color: Colors.textMuted, textAlign: 'center', marginTop: 40, fontSize: 13 },

    groupHeader: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, marginBottom: Spacing.sm, marginTop: Spacing.xs, textTransform: 'uppercase', letterSpacing: 0.8 },

    card: {
        backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 14,
        marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border,
        ...Shadow.sm,
    },
    cardDisposed: { opacity: 0.65 },
    cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
    assetName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
    assetDesc: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
    disposedBadge: { backgroundColor: 'rgba(156,163,175,0.2)', borderRadius: 6, paddingHorizontal: Spacing.sm, paddingVertical: 3 },
    disposedBadgeText: { fontSize: 10, color: Colors.textMuted, fontWeight: '600' },

    metricsRow: { flexDirection: 'row', marginBottom: Spacing.sm, paddingBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
    metricLabel: { fontSize: 9, color: Colors.textMuted, textAlign: 'center', marginBottom: 2 },
    metricValue: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },

    depLine:  { fontSize: 11, color: Colors.textSecondary, marginBottom: 2 },
    dateLine: { fontSize: 11, color: Colors.textMuted, marginBottom: Spacing.sm },
    healthBarBg:   { height: 5, backgroundColor: Colors.border, borderRadius: 3, marginBottom: 3 },
    healthBarFill: { height: 5, borderRadius: 3 },
    healthLabel:   { fontSize: 10, fontWeight: '600', marginBottom: 4 },
    replaceAlert:  { backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: Colors.warning, borderRadius: 10, padding: Spacing.md, marginBottom: 10 },
    replaceAlertRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
    replaceAlertText: { flex: 1, fontSize: 12, color: Colors.warning, lineHeight: 18 },

    detectedAlert: { backgroundColor: Colors.primary + '12', borderWidth: 1, borderColor: Colors.primary, borderRadius: 10, padding: Spacing.md, marginBottom: 10 },
    unregisteredRow: { flexDirection: 'row', alignItems: 'center', paddingTop: Spacing.sm, marginTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.primary + '30', gap: Spacing.sm },
    unregisteredName: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary },
    unregisteredMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
    unregisteredAdd: { fontSize: 11.5, color: Colors.primary, fontWeight: '700' },

    actionRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
    actionBtn: { flex: 1, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
    actionBtnText: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },

    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheet: {
        backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
        padding: Spacing.xxl, maxHeight: '90%',
    },
    sheetWide: { maxWidth: 640, width: '100%', alignSelf: 'center' },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 16 },

    label: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 5, marginTop: 10 },
    input: {
        backgroundColor: Colors.bg, borderColor: Colors.border, borderWidth: 1,
        borderRadius: Radius.sm, paddingHorizontal: Spacing.md, paddingVertical: 10,
        color: Colors.textPrimary, fontSize: 14,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: Spacing.xs },
    chip:         { paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg, backgroundColor: Colors.bg },
    chipActive:   { borderColor: Colors.primary, backgroundColor: Colors.primary + '22' },
    chipText:     { fontSize: 11, color: Colors.textMuted },
    chipTextActive: { color: Colors.primary, fontWeight: '600' },

    btnRow: { flexDirection: 'row', gap: 10, marginTop: Spacing.xxl, marginBottom: 10 },

    acqCard:     { backgroundColor: Colors.primary + '0D', borderRadius: Radius.md, padding: Spacing.md, marginTop: Spacing.lg, borderLeftWidth: 3, borderLeftColor: Colors.primary },
    acqTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: 10 },
    acqTitle:    { fontSize: 13, fontWeight: '800', color: Colors.text },
    acqTermRow:  { flexDirection: 'row', marginBottom: Spacing.sm },
    acqHint:     { fontSize: 10, color: Colors.muted, fontStyle: 'italic', marginBottom: 2 },
    acqOption:   { backgroundColor: Colors.card, borderRadius: 10, padding: 10, marginTop: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
    acqOptHeader:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    acqOptLabel: { fontSize: 12, fontWeight: '800', color: Colors.text },
    acqOptOwns:  { fontSize: 10, color: Colors.muted, fontWeight: '600' },
    acqLine:     { fontSize: 11, color: Colors.textSecondary, marginBottom: 3, lineHeight: 16 },
    acqVal:      { fontWeight: '700', color: Colors.text },
    acqFlag:     { fontSize: 11, fontWeight: '700', marginTop: 4 },
    acqVerdict:  { borderRadius: Radius.sm, borderWidth: 1, padding: 10, marginTop: Spacing.md, backgroundColor: Colors.primary + '12' },
    acqVerdictText: { fontSize: 11, fontWeight: '600', lineHeight: 16 },
    btn:        { flex: 1, backgroundColor: Colors.primary, paddingVertical: 13, borderRadius: Radius.sm, alignItems: 'center' },
    btnSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.border },
    btnText:    { color: '#fff', fontWeight: 'bold', fontSize: 14 },
    btnSecText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 14 },

    fab: {
        position: 'absolute', right: 20, bottom: 80,
        width: 54, height: 54, borderRadius: 27,
        backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
        ...Shadow.md,
    },
    fabText: { fontSize: 28, color: '#fff', lineHeight: 32 },
});
