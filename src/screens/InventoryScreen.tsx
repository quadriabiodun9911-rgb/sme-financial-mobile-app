import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
    SafeAreaView, ScrollView, View, Text,
    TouchableOpacity, StyleSheet, Modal,
    TextInput, KeyboardAvoidingView, Platform, useWindowDimensions,
    Animated, Easing,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import Icon, { IconName } from '../components/ui/Icon';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import RadialGauge from '../components/RadialGauge';
import NextStepLink from '../components/NextStepLink';
import PeriodComparisonTable from '../components/PeriodComparisonTable';
import { suggestSolution } from '../utils/impactChain';
import { computeStockVelocity, computeInventoryValue } from '../utils/stockVelocity';
import { applyStockIn } from '../utils/inventoryCosting';
import { computeDiscountAmount, DiscountType } from '../utils/saleDiscount';
import { computeDiscountSummary } from '../utils/inventorySalesTrend';
import { appendPriceChange, computeMarginPct } from '../utils/priceHistory';
import { appendStockCount, describeStockCount } from '../utils/stockCount';
import { computeInventoryPace, computeSlowMovingValue } from '../utils/inventoryIntelligence';
import { computeInventoryHealth } from '../utils/inventoryHealth';
import { computeWorkingCapitalMetrics } from '../utils/finance';
import { computeStockReconciliation } from '../utils/stockReconciliation';
import RecipeCostCalculator from '../components/RecipeCostCalculator';
import ProductionCostCalculator from '../components/ProductionCostCalculator';
import DateInput from '../components/DateInput';
import { InventoryItem } from '../types';
import { showAlert, confirmAction } from '../utils/webAlert';
import InventoryPricingTab from '../components/InventoryPricingTab';
import { localDateStr } from '../utils/localDate';
import { computeExpiringStock } from '../utils/foodExpiry';

type InventoryTab = 'stock' | 'analytics' | 'pricing';

type FormState = {
    name: string;
    sku: string;
    category: string;
    quantity: string;
    unit: string;
    costPrice: string;
    sellingPrice: string;
    lowStockThreshold: string;
    supplier: string;
    expiryDate: string;
    itemType: '' | 'raw_material' | 'finished_good';
};

const EMPTY_FORM: FormState = {
    name: '',
    sku: '',
    category: '',
    quantity: '',
    unit: '',
    costPrice: '',
    expiryDate: '',
    itemType: '',
    sellingPrice: '',
    lowStockThreshold: '5',
    supplier: '',
};

type StockInForm = {
    quantityAdded: string;
    costPerUnit: string;
    supplier: string;
    purchaseDate: string;
    recordCashPurchase: boolean;
};

const emptyStockInForm = (item: InventoryItem): StockInForm => ({
    quantityAdded: '',
    costPerUnit: item.costPrice != null ? String(item.costPrice) : '',
    supplier: item.supplier ?? '',
    purchaseDate: localDateStr(),
    recordCashPurchase: true,
});

type PriceChangeForm = {
    newPrice: string;
    effectiveDate: string;
    reason: string;
};

const emptyPriceChangeForm = (item: InventoryItem): PriceChangeForm => ({
    newPrice: item.sellingPrice != null ? String(item.sellingPrice) : '',
    effectiveDate: localDateStr(),
    reason: '',
});

type InventoryInsightTier = 'good' | 'warning' | 'critical';
interface InventoryInsight { tier: InventoryInsightTier; icon: string; title: string; detail: string; }

const PRICE_CHANGE_REASONS = [
    'Supplier cost increased',
    'Market price changed',
    'Promotional pricing',
    'Business decision',
    'Other',
];

// A stock-level fill bar for one item card. "Full" is set at 3x the item's
// own low-stock threshold -- comfortably above the 1.2x point stockColor()
// already treats as a warning -- so the bar reads as "how much runway above
// the reorder line" rather than an arbitrary absolute scale. Owns its own
// Animated.Value so it grows in independently, same pattern as GoalsScreen.
function StockBar({ quantity, threshold, color }: { quantity: number; threshold: number; color: string }) {
    const full = Math.max(threshold * 3, 1);
    const pct = Math.min(quantity / full, 1) * 100;
    const anim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.timing(anim, {
            toValue: pct,
            duration: 600,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
    }, [pct]);
    return (
        <View style={styles.stockBarTrack}>
            <Animated.View style={[styles.stockBarFill, {
                backgroundColor: color,
                width: anim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
            }]} />
        </View>
    );
}

export default function InventoryScreen() {
    const { inventory, addInventoryItem, updateInventoryItem, deleteInventoryItem, stockInInventory, settings, navigate, addTransaction, transactions, finance, navParams } = useApp();
    const { currency } = settings;

    // Modal renders via a portal on web, outside App.tsx's width constraint --
    // see FooterNav.tsx for the reference fix. Applied here to the bottom
    // sheets so they don't stretch full-bleed on desktop.
    const { width: windowWidth } = useWindowDimensions();
    const constrainSheetWidth = Platform.OS === 'web' && windowWidth >= 720;

    const [activeTab, setActiveTab] = useState<InventoryTab>(
        (['stock', 'analytics', 'pricing'] as InventoryTab[]).includes(navParams?.tab as InventoryTab) ? (navParams!.tab as InventoryTab) : 'stock'
    );
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [sellModal, setSellModal] = useState<{ item: InventoryItem } | null>(null);
    const [sellQty, setSellQty] = useState('');
    const [discountType, setDiscountType] = useState<DiscountType>('percentage');
    const [discountValue, setDiscountValue] = useState('');
    const [stockInModal, setStockInModal] = useState<{ item: InventoryItem } | null>(null);
    const [stockInForm, setStockInForm] = useState<StockInForm | null>(null);
    const [priceModal, setPriceModal] = useState<{ item: InventoryItem } | null>(null);
    const [priceForm, setPriceForm] = useState<PriceChangeForm | null>(null);
    const [countModal, setCountModal] = useState<{ item: InventoryItem } | null>(null);
    const [countQty, setCountQty] = useState('');
    const [countNote, setCountNote] = useState('');

    // ── Summary calculations ──────────────────────────────────────────────────
    // computeInventoryValue and the category breakdown both scan the full
    // inventory array -- memoized so a re-render triggered by unrelated
    // state (a modal opening, a form keystroke) doesn't redo those scans.
    const totalStockValue = useMemo(() => computeInventoryValue(inventory), [inventory]);
    const totalItems = inventory.length;
    const lowStockItems = useMemo(() => inventory.filter(item => item.quantity <= item.lowStockThreshold), [inventory]);
    const stockReconciliation = useMemo(
        () => computeStockReconciliation(transactions, inventory.length > 0, currency),
        [transactions, inventory.length, currency]
    );

    // ── Analytics calculations ────────────────────────────────────────────────
    const { totalPotentialRevenue, grossProfitIfAllSold, overallMargin } = useMemo(() => {
        const revenue = inventory.reduce((sum, item) => sum + item.quantity * (item.sellingPrice ?? 0), 0);
        const profit = revenue - totalStockValue;
        return { totalPotentialRevenue: revenue, grossProfitIfAllSold: profit, overallMargin: computeMarginPct(revenue, totalStockValue) };
    }, [inventory, totalStockValue]);

    // Category breakdown
    const categories = useMemo(() => {
        const categoryMap = new Map<string, { items: InventoryItem[] }>();
        for (const item of inventory) {
            const cat = item.category || 'General';
            if (!categoryMap.has(cat)) categoryMap.set(cat, { items: [] });
            categoryMap.get(cat)!.items.push(item);
        }
        return Array.from(categoryMap.entries()).map(([cat, { items }]) => {
            const stockVal = computeInventoryValue(items);
            const avgMargin = items.length > 0
                ? items.reduce((s, i) => s + computeMarginPct(i.sellingPrice ?? 0, i.costPrice ?? 0), 0) / items.length
                : 0;
            return { cat, count: items.length, stockVal, avgMargin };
        });
    }, [inventory]);

    // Per-item stock velocity — computed once per inventory/transactions
    // change rather than inline in the render loop (computeStockVelocity
    // itself scans transactions per item, so leaving it unmemoized redid
    // that scan for every item on every render).
    const velocityByItemId = useMemo(
        () => new Map(inventory.map(item => [item.id, computeStockVelocity(item, transactions)])),
        [inventory, transactions],
    );

    // All-time discount impact across every sale recorded through the Sell
    // button (same "Sell-only" scope as the rest of this screen's sales
    // analytics -- see inventorySalesTrend.ts).
    const discountSummary = useMemo(() => computeDiscountSummary(transactions), [transactions]);

    // Inventory Intelligence: how much cash is tied up, and whether it's
    // becoming a problem (slow-moving stock, purchases outpacing sales).
    const inventoryPace = useMemo(() => computeInventoryPace(transactions), [transactions]);
    const slowMovingValue = useMemo(() => computeSlowMovingValue(inventory, transactions), [inventory, transactions]);
    const inventoryHealth = useMemo(
        () => computeInventoryHealth(inventory, transactions, finance?.cashBalance ?? 0, currency),
        [inventory, transactions, finance?.cashBalance, currency],
    );
    // Food Service only -- see foodExpiry.ts's own comment for why
    // perishability needs a separate signal from Inventory Health's
    // cash-tied-up framing above.
    const expiringStock = useMemo(() => computeExpiringStock(inventory), [inventory]);
    const workingCapital = useMemo(() => computeWorkingCapitalMetrics(transactions), [transactions]);
    const totalWorkingCapitalTiedUp = (finance?.cashBalance ?? 0) + totalStockValue + workingCapital.accountsReceivable;

    const inventoryInsights: InventoryInsight[] = useMemo(() => {
        const list: InventoryInsight[] = [];
        const riskyCount = inventory.filter(i => i.quantity <= i.lowStockThreshold).length;
        if (riskyCount > 0) {
            list.push({
                tier: 'critical', icon: '🔴', title: 'Low-stock risk',
                detail: `${riskyCount} product${riskyCount !== 1 ? 's are' : ' is'} approaching or at stock-out.`,
            });
        }
        if (slowMovingValue > 0) {
            list.push({
                tier: 'warning', icon: '🟠', title: 'Cash tied up in slow-moving stock',
                detail: `${currency}${slowMovingValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} of inventory has had limited movement over the last 30 days.`,
            });
        }
        const { purchaseGrowthPct, salesGrowthPct } = inventoryPace;
        if (purchaseGrowthPct !== null && salesGrowthPct !== null && purchaseGrowthPct > salesGrowthPct) {
            list.push({
                tier: 'warning', icon: '⚠️', title: 'Inventory growing faster than sales',
                detail: `Stock purchases ${purchaseGrowthPct >= 0 ? 'rose' : 'fell'} ${Math.abs(purchaseGrowthPct).toFixed(0)}% this month, while sales ${salesGrowthPct >= 0 ? 'grew' : 'fell'} ${Math.abs(salesGrowthPct).toFixed(0)}%.`,
            });
        }
        if (list.length === 0) {
            list.push({ tier: 'good', icon: '🟢', title: 'Healthy Stock', detail: 'Your inventory level is within a healthy range, and nothing is moving unusually slowly.' });
        }
        return list;
    }, [inventory, slowMovingValue, inventoryPace, currency]);
    const insightColor = (tier: InventoryInsightTier) => tier === 'good' ? Colors.income : tier === 'critical' ? Colors.expense : Colors.warning;
    const inventoryHealthColor = (status: typeof inventoryHealth.status) =>
        status === 'good' ? Colors.income : status === 'warning' ? Colors.warning : Colors.expense;

    // Best margin items (top 3)
    const itemsWithMargin = inventory.map(item => ({
        ...item,
        margin: computeMarginPct(item.sellingPrice ?? 0, item.costPrice ?? 0),
    }));
    const bestMarginItems = [...itemsWithMargin].sort((a, b) => b.margin - a.margin).slice(0, 3);
    const lowMarginItems  = itemsWithMargin.filter(i => i.margin < 10);

    // Stock health score
    const outOfStockCount = inventory.filter(i => i.quantity === 0).length;
    const lowStockCount   = inventory.filter(i => i.quantity > 0 && i.quantity <= i.lowStockThreshold).length;
    let stockHealth = 100 - (outOfStockCount > 0 ? 20 : 0) - lowStockCount * 10;
    stockHealth = Math.max(0, Math.min(100, stockHealth));
    const healthColor = stockHealth >= 80 ? Colors.income : stockHealth >= 50 ? Colors.warning : Colors.expense;

    const stockHealthAnim = useRef(new Animated.Value(0)).current;
    const [animatedStockHealth, setAnimatedStockHealth] = useState(0);
    useEffect(() => {
        const id = stockHealthAnim.addListener(({ value }) => setAnimatedStockHealth(value));
        Animated.timing(stockHealthAnim, { toValue: stockHealth, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
        return () => stockHealthAnim.removeListener(id);
    }, [stockHealth]);

    // ── Modal helpers ─────────────────────────────────────────────────────────
    const openAdd = () => {
        setEditingId(null);
        setForm(EMPTY_FORM);
        setModalOpen(true);
    };

    const openEdit = (item: InventoryItem) => {
        setEditingId(item.id);
        setForm({
            name: item.name,
            sku: item.sku ?? '',
            category: item.category,
            quantity: String(item.quantity),
            unit: item.unit,
            costPrice: item.costPrice != null ? String(item.costPrice) : '',
            sellingPrice: item.sellingPrice != null ? String(item.sellingPrice) : '',
            lowStockThreshold: String(item.lowStockThreshold),
            supplier: item.supplier ?? '',
            expiryDate: item.expiryDate ?? '',
            itemType: item.itemType ?? '',
        });
        setModalOpen(true);
    };

    const closeModal = () => {
        setModalOpen(false);
        setEditingId(null);
        setForm(EMPTY_FORM);
    };

    const submitForm = () => {
        const qty = parseFloat(form.quantity);
        const cost = parseFloat(form.costPrice);
        const sell = parseFloat(form.sellingPrice);
        const threshold = parseFloat(form.lowStockThreshold) || 5;

        if (!form.name.trim()) { showAlert('Validation', 'Item name is required.'); return; }
        if (isNaN(qty) || qty < 0) { showAlert('Validation', 'Enter a valid quantity.'); return; }
        if (isNaN(cost) || cost < 0) { showAlert('Validation', 'Enter a valid cost price.'); return; }
        if (isNaN(sell) || sell < 0) { showAlert('Validation', 'Enter a valid selling price.'); return; }

        const payload = {
            name: form.name.trim(),
            sku: form.sku.trim() || undefined,
            category: form.category.trim() || 'General',
            quantity: qty,
            unit: form.unit.trim() || 'pcs',
            costPrice: cost,
            sellingPrice: sell,
            lowStockThreshold: threshold,
            supplier: form.supplier.trim() || undefined,
            expiryDate: form.expiryDate.trim() || undefined,
            itemType: form.itemType || undefined,
        };

        if (editingId) {
            updateInventoryItem(editingId, payload);
        } else {
            addInventoryItem(payload);
        }
        closeModal();
    };

    const confirmDelete = (item: InventoryItem) => {
        confirmAction('Delete Item', `Remove "${item.name}" from inventory?`, 'Delete', () => deleteInventoryItem(item.id));
    };

    const openSell = (item: InventoryItem) => {
        setSellModal({ item });
        setSellQty('');
        setDiscountType('percentage');
        setDiscountValue('');
    };

    const closeSellModal = () => {
        setSellModal(null);
        setSellQty('');
        setDiscountValue('');
    };

    const confirmSell = () => {
        if (!sellModal) return;
        const { item } = sellModal;
        const qty = parseFloat(sellQty);
        if (isNaN(qty) || qty <= 0) { showAlert('Validation', 'Enter a valid quantity.'); return; }
        if (qty > item.quantity) { showAlert('Validation', `Only ${item.quantity} ${item.unit} in stock.`); return; }
        const subtotal = qty * (item.sellingPrice ?? 0);
        const discAmount = computeDiscountAmount(subtotal, discountType, parseFloat(discountValue) || 0);
        updateInventoryItem(item.id, { quantity: item.quantity - qty });
        addTransaction({
            type: 'income',
            amount: subtotal - discAmount,
            description: `Sale: ${item.name}`,
            category: 'Sales',
            date: localDateStr(),
            status: 'paid',
            transactionCategory: 'sale',
            costOfGoodsSold: qty * (item.costPrice ?? 0),
            inventoryItemId: item.id,
            unitsSold: qty,
            discountAmount: discAmount > 0 ? discAmount : undefined,
        });
        closeSellModal();
        showAlert('Recorded', `${qty} ${item.unit} of ${item.name} sold.`);
    };

    const openStockIn = (item: InventoryItem) => {
        setStockInModal({ item });
        setStockInForm(emptyStockInForm(item));
    };

    const confirmStockIn = () => {
        if (!stockInModal || !stockInForm) return;
        const { item } = stockInModal;
        const qtyAdded = parseFloat(stockInForm.quantityAdded);
        const cost = parseFloat(stockInForm.costPerUnit);
        if (isNaN(qtyAdded) || qtyAdded <= 0) { showAlert('Validation', 'Enter a valid quantity received.'); return; }
        if (isNaN(cost) || cost < 0) { showAlert('Validation', 'Enter a valid cost per unit.'); return; }
        stockInInventory(item.id, {
            quantityAdded: qtyAdded,
            costPerUnit: cost,
            supplier: stockInForm.supplier.trim() || undefined,
            purchaseDate: stockInForm.purchaseDate || localDateStr(),
            recordCashPurchase: stockInForm.recordCashPurchase,
        });
        setStockInModal(null);
        setStockInForm(null);
        showAlert('Stock In Recorded', `${qtyAdded} ${item.unit} added to ${item.name}.`);
    };

    const openPriceChange = (item: InventoryItem) => {
        setPriceModal({ item });
        setPriceForm(emptyPriceChangeForm(item));
    };

    const confirmPriceChange = () => {
        if (!priceModal || !priceForm) return;
        const { item } = priceModal;
        const newPrice = parseFloat(priceForm.newPrice);
        if (isNaN(newPrice) || newPrice < 0) { showAlert('Validation', 'Enter a valid selling price.'); return; }
        if (newPrice === item.sellingPrice) { showAlert('Validation', 'Enter a price different from the current one.'); return; }
        const priceHistory = appendPriceChange(item, newPrice, priceForm.effectiveDate || localDateStr(), priceForm.reason || undefined);
        updateInventoryItem(item.id, { sellingPrice: newPrice, priceHistory });
        setPriceModal(null);
        setPriceForm(null);
        showAlert('Price Updated', `${item.name} is now ${currency}${newPrice.toLocaleString()}/unit.`);
    };

    const openCount = (item: InventoryItem) => {
        setCountModal({ item });
        setCountQty(String(item.quantity));
        setCountNote('');
    };

    const confirmCount = () => {
        if (!countModal) return;
        const { item } = countModal;
        const actual = parseFloat(countQty);
        if (isNaN(actual) || actual < 0) { showAlert('Validation', 'Enter what you actually counted.'); return; }
        const entry = appendStockCount(item, actual, localDateStr(), countNote.trim() || undefined);
        updateInventoryItem(item.id, {
            quantity: actual,
            stockCountHistory: [...(item.stockCountHistory ?? []), entry],
        });
        setCountModal(null);
        setCountQty('');
        setCountNote('');
        showAlert(entry.differenceUnits === 0 ? 'Count Matches' : 'Count Recorded', describeStockCount(entry, item.unit));
    };

    // ── Stock colour helper ───────────────────────────────────────────────────
    const stockColor = (item: InventoryItem): string => {
        if (item.quantity <= item.lowStockThreshold) return Colors.expense;
        if (item.quantity <= item.lowStockThreshold * 1.2) return Colors.warning;
        return Colors.textPrimary;
    };

    // ── Margin colour helper ──────────────────────────────────────────────────
    const marginColor = (pct: number): string => {
        if (pct >= 20) return Colors.income;
        if (pct >= 10) return Colors.warning;
        return Colors.expense;
    };

    // ── Stock velocity helpers ────────────────────────────────────────────────
    const velocityColor = (tier: ReturnType<typeof computeStockVelocity>['tier']): string => {
        if (tier === 'fast') return Colors.warning;
        if (tier === 'moderate') return Colors.income;
        if (tier === 'slow') return Colors.expense;
        return Colors.textMuted;
    };
    const velocityIcon = (tier: ReturnType<typeof computeStockVelocity>['tier']): IconName => {
        if (tier === 'fast') return 'zap';
        if (tier === 'moderate') return 'activity';
        if (tier === 'slow') return 'trending-down';
        return 'info';
    };

    return (
        <SafeAreaView style={styles.safe}>
            <Header />

            {/* ── Tab bar ─────────────────────────────────────────────────── */}
            <View style={styles.tabBar}>
                <TouchableOpacity
                    style={[styles.tabBtn, activeTab === 'stock' && styles.tabBtnActive]}
                    onPress={() => setActiveTab('stock')}
                >
                    <Text style={[styles.tabText, activeTab === 'stock' && styles.tabTextActive]}>Stock</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tabBtn, activeTab === 'analytics' && styles.tabBtnActive]}
                    onPress={() => setActiveTab('analytics')}
                >
                    <Text style={[styles.tabText, activeTab === 'analytics' && styles.tabTextActive]}>Analytics</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tabBtn, activeTab === 'pricing' && styles.tabBtnActive]}
                    onPress={() => setActiveTab('pricing')}
                >
                    <Text style={[styles.tabText, activeTab === 'pricing' && styles.tabTextActive]}>Pricing</Text>
                </TouchableOpacity>
            </View>

            <ScrollView style={styles.scroll} contentContainerStyle={styles.pad}>

                {/* ── Title row ──────────────────────────────────────────── */}
                <View style={styles.titleRow}>
                    <Text style={styles.title}>Inventory & Stock</Text>
                    <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
                        <Text style={styles.addBtnText}>+ Add Item</Text>
                    </TouchableOpacity>
                </View>

                {/* ── STOCK TAB ──────────────────────────────────────────── */}
                {activeTab === 'stock' && (
                    <>
                        {/* Summary cards */}
                        <View style={styles.summaryRow}>
                            <View style={[styles.summaryCard, styles.flex]}>
                                <Text style={styles.summaryLabel}>Stock Value</Text>
                                <Text style={[styles.summaryVal, { color: Colors.asset }]}>
                                    {currency}{totalStockValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                </Text>
                            </View>
                            <View style={[styles.summaryCard, styles.flex]}>
                                <Text style={styles.summaryLabel}>Total Items</Text>
                                <Text style={[styles.summaryVal, { color: Colors.textPrimary }]}>{totalItems}</Text>
                            </View>
                            <View style={[styles.summaryCard, styles.flex]}>
                                <Text style={styles.summaryLabel}>Low Stock</Text>
                                <Text style={[styles.summaryVal, { color: lowStockItems.length > 0 ? Colors.expense : Colors.income }]}>
                                    {lowStockItems.length}
                                </Text>
                            </View>
                        </View>

                        {/* Low stock alert */}
                        {lowStockItems.length > 0 && (
                            <View style={styles.lowStockBanner}>
                                <Icon name="alert-triangle" size={14} color={Colors.warning} />
                                <Text style={styles.lowStockBannerText}>
                                    {lowStockItems.length} item{lowStockItems.length > 1 ? 's' : ''} {lowStockItems.length > 1 ? 'are' : 'is'} running low — reorder soon
                                </Text>
                            </View>
                        )}

                        {/* Stock reconciliation -- sales revenue with no matching
                            inventory record, see stockReconciliation.ts */}
                        {stockReconciliation.show && stockReconciliation.summary && (
                            <View style={styles.lowStockBanner}>
                                <Icon name="alert-triangle" size={14} color={Colors.warning} />
                                <Text style={styles.lowStockBannerText}>{stockReconciliation.summary}</Text>
                            </View>
                        )}

                        {/* Empty state */}
                        {inventory.length === 0 && (
                            <View style={styles.emptyState}>
                                <View style={styles.emptyIconWrap}>
                                    <Icon name="package" size={40} color={Colors.textMuted} />
                                </View>
                                <Text style={styles.emptyText}>No inventory items yet.</Text>
                                <Text style={styles.emptySubText}>Tap '+ Add Item' to start tracking your stock.</Text>
                            </View>
                        )}

                        {/* Item list */}
                        {inventory.map(item => {
                            const margin = computeMarginPct(item.sellingPrice ?? 0, item.costPrice ?? 0);
                            const stockVal = item.quantity * (item.costPrice ?? 0);
                            const velocity = velocityByItemId.get(item.id)!;

                            return (
                                <View key={item.id} style={styles.itemCard}>
                                    <View style={styles.itemHeader}>
                                        <View style={styles.flex}>
                                            <Text style={styles.itemName}>{item.name}</Text>
                                            <Text style={styles.itemCategory}>{item.category}{item.sku ? ` · ${item.sku}` : ''}</Text>
                                        </View>
                                        <View style={styles.itemActions}>
                                            <TouchableOpacity style={styles.actionBtn} onPress={() => openStockIn(item)}>
                                                <Icon name="download" size={14} color={Colors.textPrimary} />
                                            </TouchableOpacity>
                                            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.income }]} onPress={() => openSell(item)}>
                                                <Text style={[styles.actionBtnText, { color: '#fff' }]}>Sell</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity style={styles.actionBtn} onPress={() => openPriceChange(item)}>
                                                <Icon name="tag" size={14} color={Colors.textPrimary} />
                                            </TouchableOpacity>
                                            <TouchableOpacity style={styles.actionBtn} onPress={() => openCount(item)}>
                                                <Icon name="clipboard" size={14} color={Colors.textPrimary} />
                                            </TouchableOpacity>
                                            <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(item)}>
                                                <Icon name="edit-2" size={14} color={Colors.textPrimary} />
                                            </TouchableOpacity>
                                            <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={() => confirmDelete(item)}>
                                                <Icon name="trash-2" size={14} color={Colors.expense} />
                                            </TouchableOpacity>
                                        </View>
                                    </View>

                                    <View style={styles.metricsGrid}>
                                        <View style={styles.metricCell}>
                                            <Text style={styles.metricLabel}>Stock</Text>
                                            <Text style={[styles.metricVal, { color: stockColor(item) }]}>
                                                {item.quantity} {item.unit}
                                            </Text>
                                        </View>
                                        <View style={styles.metricCell}>
                                            <Text style={styles.metricLabel}>Cost/unit</Text>
                                            <Text style={styles.metricVal}>{currency}{(item.costPrice ?? 0).toLocaleString()}</Text>
                                        </View>
                                        <View style={styles.metricCell}>
                                            <Text style={styles.metricLabel}>Sell/unit</Text>
                                            <Text style={styles.metricVal}>{currency}{(item.sellingPrice ?? 0).toLocaleString()}</Text>
                                        </View>
                                        <View style={styles.metricCell}>
                                            <Text style={styles.metricLabel}>Margin</Text>
                                            <Text style={[styles.metricVal, { color: marginColor(margin) }]}>
                                                {margin.toFixed(1)}%
                                            </Text>
                                        </View>
                                    </View>

                                    <StockBar quantity={item.quantity} threshold={item.lowStockThreshold} color={stockColor(item)} />

                                    <View style={styles.itemFooter}>
                                        <Text style={styles.stockValLabel}>Stock value: </Text>
                                        <Text style={styles.stockValNum}>{currency}{stockVal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</Text>
                                    </View>

                                    <View style={[styles.velocityRow, { borderColor: velocityColor(velocity.tier) }]}>
                                        <Icon name={velocityIcon(velocity.tier)} size={13} color={velocityColor(velocity.tier)} />
                                        <Text style={[styles.velocityText, { color: velocityColor(velocity.tier) }]}>{velocity.summary}</Text>
                                    </View>

                                    {/* Most recent physical stock count, if it found a
                                        real difference -- see stockCount.ts */}
                                    {(() => {
                                        const lastCount = item.stockCountHistory?.[item.stockCountHistory.length - 1];
                                        if (!lastCount || lastCount.differenceUnits === 0) return null;
                                        return (
                                            <View style={[styles.lowStockBanner, { marginTop: Spacing.sm, marginBottom: 0 }]}>
                                                <Icon name="alert-triangle" size={13} color={Colors.warning} />
                                                <Text style={styles.lowStockBannerText}>{describeStockCount(lastCount, item.unit)}</Text>
                                            </View>
                                        );
                                    })()}
                                </View>
                            );
                        })}
                    </>
                )}

                {/* ── ANALYTICS TAB ──────────────────────────────────────── */}
                {activeTab === 'analytics' && (
                    <>
                        {/* Expiring Stock -- shown purely on whether there's
                            an expiryDate to warn about, not on industry:
                            that field is only ever enterable for Food
                            Service/Retail (see the Add/Edit form below), so
                            this naturally never fires for a business that
                            has no perishable stock to begin with. Placed
                            ahead of Inventory Health: a batch that's about
                            to spoil is more urgent than cash tied up in
                            stock that's merely slow to sell. */}
                        {(expiringStock.itemsExpired.length > 0 || expiringStock.itemsExpiringSoon.length > 0) && (
                            <View style={[styles.analyticsCard, { borderColor: Colors.expense, borderWidth: 1 }]}>
                                <Text style={styles.analyticsCardTitle}>⏰ Expiring Stock</Text>
                                <Text style={styles.cardSubtitle}>
                                    {currency}{Math.round(expiringStock.totalValueAtRisk).toLocaleString()} at risk of becoming a total write-off, not just a slow sale.
                                </Text>
                                {expiringStock.itemsExpired.map(e => (
                                    <View key={e.item.id} style={[styles.insightBanner, { borderColor: Colors.expense }]}>
                                        <Text style={[styles.insightTitle, { color: Colors.expense }]}>
                                            🔴 {e.item.name} — expired {Math.abs(e.daysUntilExpiry)} day{Math.abs(e.daysUntilExpiry) === 1 ? '' : 's'} ago
                                        </Text>
                                        <Text style={styles.insightDetail}>{e.item.quantity} {e.item.unit} · {currency}{Math.round(e.valueAtRisk).toLocaleString()} at cost</Text>
                                    </View>
                                ))}
                                {expiringStock.itemsExpiringSoon.map(e => (
                                    <View key={e.item.id} style={[styles.insightBanner, { borderColor: Colors.warning }]}>
                                        <Text style={[styles.insightTitle, { color: Colors.warning }]}>
                                            🟡 {e.item.name} — expires {e.daysUntilExpiry === 0 ? 'today' : `in ${e.daysUntilExpiry} day${e.daysUntilExpiry === 1 ? '' : 's'}`}
                                        </Text>
                                        <Text style={styles.insightDetail}>{e.item.quantity} {e.item.unit} · {currency}{Math.round(e.valueAtRisk).toLocaleString()} at cost</Text>
                                    </View>
                                ))}
                            </View>
                        )}

                        {/* Inventory Health */}
                        <View style={styles.analyticsCard}>
                            <View style={styles.inventoryHealthHeader}>
                                <Text style={styles.analyticsCardTitle}>Inventory Health</Text>
                                <View style={[styles.inventoryHealthBadge, { backgroundColor: inventoryHealthColor(inventoryHealth.status) }]}>
                                    <Text style={styles.inventoryHealthBadgeText}>{inventoryHealth.score}/100</Text>
                                </View>
                            </View>
                            <Text style={styles.cardSubtitle}>
                                How much of your stock's VALUE is stuck not selling — a cash-flow question, not a running-out-of-stock one (see Stock Health below for that).
                            </Text>
                            <Text style={styles.intelligenceAdvisory}>{inventoryHealth.narrative}</Text>

                            {inventoryHealth.topDecisions.length > 0 && (
                                <>
                                    <Text style={[styles.discountLabel, { marginTop: Spacing.md, marginBottom: 4 }]}>What to do about it</Text>
                                    <Text style={styles.cardSubtitle}>Top items only -- see Inventory Decisions on the Pricing tab for the full list.</Text>
                                    {inventoryHealth.topDecisions.map(decision => (
                                        <View key={decision.itemId} style={[styles.insightBanner, { borderColor: decision.action === 'reorder' ? Colors.income : decision.action === 'reduce' ? Colors.warning : Colors.expense }]}>
                                            <Text style={[styles.insightTitle, { color: decision.action === 'reorder' ? Colors.income : decision.action === 'reduce' ? Colors.warning : Colors.expense }]}>
                                                {decision.action === 'reorder' ? '🔁 Reorder' : decision.action === 'reduce' ? '⏸️ Hold off reordering' : '🛑 Discontinue'} — {decision.itemName}
                                            </Text>
                                            <Text style={styles.insightDetail}>{decision.detail}</Text>
                                        </View>
                                    ))}
                                </>
                            )}
                        </View>

                        {/* Inventory Intelligence */}
                        <View style={styles.analyticsCard}>
                            <Text style={styles.analyticsCardTitle}>Inventory Intelligence</Text>
                            <Text style={styles.intelligenceHeadline}>
                                {currency}{totalStockValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </Text>
                            <Text style={styles.intelligenceSub}>of your business's money is currently tied up in inventory.</Text>

                            <Text style={[styles.discountLabel, { marginTop: Spacing.lg, marginBottom: 4 }]}>Where your money is tied up</Text>
                            <View style={styles.analyticsRow}>
                                <Text style={styles.analyticsLabel}>Cash</Text>
                                <Text style={styles.analyticsVal}>{currency}{(finance?.cashBalance ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                            </View>
                            <View style={styles.analyticsRow}>
                                <Text style={styles.analyticsLabel}>Inventory</Text>
                                <Text style={[styles.analyticsVal, { color: Colors.asset }]}>{currency}{totalStockValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                            </View>
                            <View style={styles.analyticsRow}>
                                <Text style={styles.analyticsLabel}>Receivables</Text>
                                <Text style={styles.analyticsVal}>{currency}{workingCapital.accountsReceivable.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                            </View>
                            <View style={[styles.analyticsRow, styles.analyticsBorderTop]}>
                                <Text style={[styles.analyticsLabel, { fontWeight: '700', color: Colors.textPrimary }]}>Total Working Capital Tied Up</Text>
                                <Text style={[styles.analyticsVal, { fontWeight: 'bold' }]}>{currency}{totalWorkingCapitalTiedUp.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                            </View>

                            <Text style={styles.intelligenceAdvisory}>
                                {currency}{totalStockValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} of your business capital is currently tied up in inventory. Consider your sales velocity and upcoming cash needs before purchasing additional stock.
                            </Text>

                            {inventoryInsights.map((insight, i) => (
                                <View key={i} style={[styles.insightBanner, { borderColor: insightColor(insight.tier) }]}>
                                    <Text style={[styles.insightTitle, { color: insightColor(insight.tier) }]}>{insight.icon} {insight.title}</Text>
                                    <Text style={styles.insightDetail}>{insight.detail}</Text>
                                </View>
                            ))}
                        </View>

                        {/* Cost of Goods Summary */}
                        <View style={styles.analyticsCard}>
                            <Text style={styles.analyticsCardTitle}>Cost of Goods Summary</Text>
                            <View style={styles.analyticsRow}>
                                <Text style={styles.analyticsLabel}>Total Inventory Value</Text>
                                <Text style={[styles.analyticsVal, { color: Colors.asset }]}>
                                    {currency}{totalStockValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </Text>
                            </View>
                            <View style={styles.analyticsRow}>
                                <Text style={styles.analyticsLabel}>Total Potential Revenue</Text>
                                <Text style={[styles.analyticsVal, { color: Colors.income }]}>
                                    {currency}{totalPotentialRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </Text>
                            </View>
                            <View style={[styles.analyticsRow, styles.analyticsBorderTop]}>
                                <Text style={[styles.analyticsLabel, { fontWeight: '700', color: Colors.textPrimary }]}>Gross Profit if All Sold</Text>
                                <Text style={[styles.analyticsVal, { color: grossProfitIfAllSold >= 0 ? Colors.income : Colors.expense, fontWeight: 'bold' }]}>
                                    {currency}{grossProfitIfAllSold.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </Text>
                            </View>
                            <View style={styles.analyticsRow}>
                                <Text style={styles.analyticsLabel}>Overall Margin %</Text>
                                <Text style={[styles.analyticsVal, { color: marginColor(overallMargin) }]}>
                                    {overallMargin.toFixed(1)}%
                                </Text>
                            </View>
                        </View>

                        {/* Discount Impact */}
                        {discountSummary.totalSaleCount > 0 && (
                            <View style={styles.analyticsCard}>
                                <Text style={styles.analyticsCardTitle}>Discount Impact</Text>
                                <View style={styles.analyticsRow}>
                                    <Text style={styles.analyticsLabel}>Gross Sales</Text>
                                    <Text style={styles.analyticsVal}>
                                        {currency}{discountSummary.grossSales.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    </Text>
                                </View>
                                <View style={styles.analyticsRow}>
                                    <Text style={styles.analyticsLabel}>Less: Discounts</Text>
                                    <Text style={[styles.analyticsVal, { color: Colors.warning }]}>
                                        −{currency}{discountSummary.discounts.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    </Text>
                                </View>
                                <View style={[styles.analyticsRow, styles.analyticsBorderTop]}>
                                    <Text style={[styles.analyticsLabel, { fontWeight: '700', color: Colors.textPrimary }]}>Net Sales</Text>
                                    <Text style={[styles.analyticsVal, { fontWeight: 'bold', color: Colors.income }]}>
                                        {currency}{discountSummary.netSales.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    </Text>
                                </View>
                                {discountSummary.discountedSaleCount > 0 ? (
                                    <>
                                        <View style={styles.analyticsRow}>
                                            <Text style={styles.analyticsLabel}>Margin: standard vs. realised</Text>
                                            <Text style={styles.analyticsVal}>
                                                <Text style={{ color: marginColor(discountSummary.normalMarginPct) }}>{discountSummary.normalMarginPct.toFixed(1)}%</Text>
                                                {'  →  '}
                                                <Text style={{ color: marginColor(discountSummary.actualMarginPct) }}>{discountSummary.actualMarginPct.toFixed(1)}%</Text>
                                            </Text>
                                        </View>
                                        <Text style={styles.discountInsight}>
                                            {discountSummary.discountedSaleCount} of {discountSummary.totalSaleCount} sale{discountSummary.totalSaleCount !== 1 ? 's' : ''} included a discount, averaging {discountSummary.avgDiscountPct.toFixed(1)}% off. That's {currency}{discountSummary.discounts.toLocaleString(undefined, { maximumFractionDigits: 0 })} of revenue given up so far.
                                        </Text>
                                    </>
                                ) : (
                                    <Text style={styles.discountInsight}>No discounts given yet — every sale was at standard price.</Text>
                                )}
                            </View>
                        )}

                        {/* Category Breakdown */}
                        <View style={styles.analyticsCard}>
                            <Text style={styles.analyticsCardTitle}>Category Breakdown</Text>
                            <Text style={styles.cardSubtitle}>
                                Margin here is the plain average across a category's items -- it can look very different from "Overall Margin %" above, which weights by each item's actual stock value.
                            </Text>
                            {categories.length === 0 && (
                                <Text style={styles.analyticsEmpty}>No items to analyse yet.</Text>
                            )}
                            {categories.map(({ cat, count, stockVal, avgMargin }) => (
                                <View key={cat} style={styles.categoryRow}>
                                    <View style={styles.flex}>
                                        <Text style={styles.categoryName}>{cat}</Text>
                                        <Text style={styles.categoryMeta}>{count} item{count !== 1 ? 's' : ''}</Text>
                                    </View>
                                    <View style={styles.categoryRight}>
                                        <Text style={[styles.analyticsVal, { color: Colors.asset }]}>
                                            {currency}{stockVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                        </Text>
                                        <Text style={[styles.categoryMeta, { color: marginColor(avgMargin) }]}>
                                            {avgMargin.toFixed(1)}% margin
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </View>

                        {/* Best Margin Items */}
                        {bestMarginItems.length > 0 && (
                            <View style={styles.analyticsCard}>
                                <Text style={styles.analyticsCardTitle}>Best Margin Items</Text>
                                {bestMarginItems.map(item => (
                                    <View key={item.id} style={styles.bestItemRow}>
                                        <View style={styles.flex}>
                                            <Text style={styles.bestItemName}>{item.name}</Text>
                                            <Text style={styles.categoryMeta}>{item.category}</Text>
                                        </View>
                                        <View style={[styles.marginBadge, { backgroundColor: 'rgba(34,197,94,0.15)' }]}>
                                            <Text style={[styles.marginBadgeText, { color: Colors.income }]}>
                                                {item.margin.toFixed(1)}%
                                            </Text>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        )}

                        {/* Low Margin Warning */}
                        {lowMarginItems.length > 0 && (
                            <View style={[styles.analyticsCard, { borderWidth: 1, borderColor: Colors.expense }]}>
                                <Text style={[styles.analyticsCardTitle, { color: Colors.expense }]}>Low Margin Warning (&lt;10%)</Text>
                                {lowMarginItems.map(item => (
                                    <View key={item.id} style={styles.bestItemRow}>
                                        <View style={styles.flex}>
                                            <Text style={styles.bestItemName}>{item.name}</Text>
                                            <Text style={styles.categoryMeta}>{item.category}</Text>
                                        </View>
                                        <View style={[styles.marginBadge, { backgroundColor: 'rgba(239,68,68,0.15)' }]}>
                                            <Text style={[styles.marginBadgeText, { color: Colors.expense }]}>
                                                {item.margin.toFixed(1)}%
                                            </Text>
                                        </View>
                                    </View>
                                ))}
                                <NextStepLink
                                    text="See pricing strategies to fix this"
                                    onPress={() => setActiveTab('pricing')}
                                />
                            </View>
                        )}

                        {/* Stock Health Score */}
                        <View style={styles.analyticsCard}>
                            <Text style={styles.analyticsCardTitle}>Stock Health</Text>
                            <Text style={styles.cardSubtitle}>
                                How close you are to running OUT of things — counts items low or out of stock. A different question from Inventory Health above, which is about cash tied up in stock that isn't selling.
                            </Text>
                            <View style={styles.healthRow}>
                                <RadialGauge
                                    displayValue={`${Math.round(animatedStockHealth)}`}
                                    label="/100"
                                    progress={stockHealth / 100}
                                    color={healthColor}
                                    size={96}
                                    strokeWidth={8}
                                />
                            </View>
                            {outOfStockCount > 0 && (
                                <Text style={styles.healthNote}>• {outOfStockCount} item{outOfStockCount !== 1 ? 's' : ''} out of stock (-20)</Text>
                            )}
                            {lowStockCount > 0 && (
                                <Text style={styles.healthNote}>• {lowStockCount} item{lowStockCount !== 1 ? 's' : ''} at/below threshold (-{lowStockCount * 10})</Text>
                            )}
                            {stockHealth === 100 && (
                                <Text style={[styles.healthNote, { color: Colors.income }]}>All stock levels healthy</Text>
                            )}
                        </View>

                        {/* Daily / weekly sales pace — how fast stock is actually moving */}
                        {transactions.length > 0 && (
                            <PeriodComparisonTable transactions={transactions} currency={currency} defaultGrouping="daily" />
                        )}

                        {/* Recipe / menu item food cost — built on the same ingredient
                            cost-per-unit data as the rest of Inventory. Food Service
                            only: showing this to a retailer or distributor would just
                            be clutter that doesn't apply to how their business works. */}
                        {settings.industry === 'food-service' && (
                            <RecipeCostCalculator inventory={inventory} currency={currency} />
                        )}

                        {/* Production/unit costing — Manufacturing only, same reasoning
                            as Recipe Costing being Food Service only. */}
                        {settings.industry === 'manufacturing' && (
                            <ProductionCostCalculator inventory={inventory} currency={currency} />
                        )}

                        {/* Use in Reports button */}
                        <TouchableOpacity
                            style={styles.reportsBtn}
                            onPress={() => navigate('reports', { reportSection: 'statements', reportTab: 'inventory' })}
                        >
                            <Text style={styles.reportsBtnText}>Use in Reports →</Text>
                        </TouchableOpacity>
                    </>
                )}

                {/* ── COST EXPOSURE TAB ─────────────────────────────────── */}

                {/* ── PRICING TAB ────────────────────────────────────────── */}
                {activeTab === 'pricing' && <InventoryPricingTab />}

            </ScrollView>

            <FooterNav />

            {/* ── Add / Edit Modal ─────────────────────────────────────────────── */}
            <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={closeModal}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={closeModal} />
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.modalSheet, constrainSheetWidth && styles.modalSheetWide]}>
                    <View style={styles.modalHandle} />
                    <Text style={styles.modalTitle}>{editingId ? 'Edit Item' : 'Add Inventory Item'}</Text>

                    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                        <TextInput
                            style={styles.input}
                            placeholder="Item name"
                            placeholderTextColor={Colors.textMuted}
                            value={form.name}
                            onChangeText={v => setForm(f => ({ ...f, name: v }))}
                        />
                        <View style={styles.inputRow}>
                            <TextInput
                                style={[styles.input, styles.flex, { marginRight: 8 }]}
                                placeholder="SKU / product code (optional)"
                                placeholderTextColor={Colors.textMuted}
                                value={form.sku}
                                onChangeText={v => setForm(f => ({ ...f, sku: v }))}
                            />
                            <TextInput
                                style={[styles.input, styles.flex]}
                                placeholder="Category (e.g. Electronics, Food)"
                                placeholderTextColor={Colors.textMuted}
                                value={form.category}
                                onChangeText={v => setForm(f => ({ ...f, category: v }))}
                            />
                        </View>
                        <TextInput
                            style={styles.input}
                            placeholder="Supplier (optional)"
                            placeholderTextColor={Colors.textMuted}
                            value={form.supplier}
                            onChangeText={v => setForm(f => ({ ...f, supplier: v }))}
                        />
                        <View style={styles.inputRow}>
                            <TextInput
                                style={[styles.input, styles.flex, { marginRight: 8 }]}
                                placeholder="Quantity"
                                placeholderTextColor={Colors.textMuted}
                                keyboardType="decimal-pad"
                                value={form.quantity}
                                onChangeText={v => setForm(f => ({ ...f, quantity: v }))}
                            />
                            <TextInput
                                style={[styles.input, styles.flex]}
                                placeholder="Unit (pcs / kg / litres)"
                                placeholderTextColor={Colors.textMuted}
                                value={form.unit}
                                onChangeText={v => setForm(f => ({ ...f, unit: v }))}
                            />
                        </View>
                        <TextInput
                            style={styles.input}
                            placeholder={`Cost price per unit (${currency})`}
                            placeholderTextColor={Colors.textMuted}
                            keyboardType="decimal-pad"
                            value={form.costPrice}
                            onChangeText={v => setForm(f => ({ ...f, costPrice: v }))}
                        />
                        <TextInput
                            style={styles.input}
                            placeholder={`Selling price per unit (${currency})`}
                            placeholderTextColor={Colors.textMuted}
                            keyboardType="decimal-pad"
                            value={form.sellingPrice}
                            onChangeText={v => setForm(f => ({ ...f, sellingPrice: v }))}
                        />
                        <TextInput
                            style={styles.input}
                            placeholder="Reorder level — alert below this (default 5)"
                            placeholderTextColor={Colors.textMuted}
                            keyboardType="number-pad"
                            value={form.lowStockThreshold}
                            onChangeText={v => setForm(f => ({ ...f, lowStockThreshold: v }))}
                        />

                        {/* Expiry Date — Food Service and Retail/Wholesale.
                            Perishability isn't unique to prepared food: it's
                            about the GOODS, not the business category, and
                            a produce farm or fresh-goods wholesaler (which
                            has no better fit than Retail/Wholesale among
                            these five options) carries exactly the same
                            spoilage risk as a restaurant's ingredients --
                            an item can go from asset to write-off on its
                            own, with no sale involved, which
                            inventoryHealth's cash-tied-up framing doesn't
                            capture. See foodExpiry.ts. Manufacturing/
                            Professional Services excluded: durable
                            components and billable time don't spoil. */}
                        {(settings.industry === 'food-service' || settings.industry === 'retail') && (
                            <View style={{ marginBottom: 12 }}>
                                <Text style={styles.discountLabel}>Expiry Date (optional)</Text>
                                <DateInput value={form.expiryDate} onChange={v => setForm(f => ({ ...f, expiryDate: v }))} />
                            </View>
                        )}

                        {/* Raw Material vs. Finished Good — Manufacturing
                            only, so the Production Cost Calculator's
                            material picker doesn't offer a business's own
                            finished product as an input into building
                            itself. Untagged items still show up there --
                            this only starts excluding an item once it's
                            explicitly marked Finished Good. */}
                        {settings.industry === 'manufacturing' && (
                            <View style={{ marginBottom: 12 }}>
                                <Text style={styles.discountLabel}>Item Type (optional)</Text>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    {([
                                        { value: 'raw_material' as const, label: 'Raw Material' },
                                        { value: 'finished_good' as const, label: 'Finished Good' },
                                    ]).map(opt => (
                                        <TouchableOpacity
                                            key={opt.value}
                                            style={[styles.discountTypePill, form.itemType === opt.value && styles.discountTypePillActive]}
                                            onPress={() => setForm(f => ({ ...f, itemType: f.itemType === opt.value ? '' : opt.value }))}
                                        >
                                            <Text style={[styles.discountTypePillText, form.itemType === opt.value && styles.discountTypePillTextActive]}>{opt.label}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        )}

                        {/* Margin preview — same "harmful gets a fix" pattern as the
                            rest of the app, applied to what this item actually earns. */}
                        {(() => {
                            const cost = parseFloat(form.costPrice);
                            const sell = parseFloat(form.sellingPrice);
                            if (isNaN(cost) || isNaN(sell) || sell <= 0) return null;
                            const margin = ((sell - cost) / sell) * 100;
                            const severity = margin < 0 ? 'harmful' : margin < 10 ? 'caution' : 'none';
                            const color = severity === 'harmful' ? Colors.expense : severity === 'caution' ? Colors.warning : Colors.income;
                            return (
                                <View style={[styles.marginPreview, { borderColor: color }]}>
                                    <Text style={styles.marginPreviewLabel}>Margin on this item</Text>
                                    <Text style={[styles.marginPreviewVal, { color }]}>{margin.toFixed(1)}%</Text>
                                    {severity !== 'none' && (
                                        <>
                                            <View style={styles.marginPreviewNoteRow}>
                                                <Icon name="alert-triangle" size={12} color={color} />
                                                <Text style={[styles.marginPreviewNote, { color }]}>
                                                    {severity === 'harmful'
                                                        ? 'Selling below cost — every sale loses money.'
                                                        : 'Thin margin — barely covers overhead.'}
                                                </Text>
                                            </View>
                                            <Text style={styles.marginPreviewSolution}>
                                                💡 {suggestSolution('pricing').title} — {suggestSolution('pricing').detail}
                                            </Text>
                                        </>
                                    )}
                                </View>
                            );
                        })()}

                        <TouchableOpacity style={styles.submitBtn} onPress={submitForm}>
                            <Text style={styles.submitBtnText}>{editingId ? 'Save Changes' : 'Add Item'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.cancelBtn} onPress={closeModal}>
                            <Text style={styles.cancelBtnText}>Cancel</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </KeyboardAvoidingView>
            </Modal>

            {/* ── Sell Stock Modal ──────────────────────────────────────────────── */}
            <Modal visible={!!sellModal} transparent animationType="slide" onRequestClose={closeSellModal}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={closeSellModal} />
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.modalSheet, constrainSheetWidth && styles.modalSheetWide]}>
                    <View style={styles.modalHandle} />
                    <Text style={styles.modalTitle}>Record Sale</Text>
                    {sellModal && (() => {
                        const { item } = sellModal;
                        const qty = parseFloat(sellQty);
                        const hasQty = !isNaN(qty) && qty > 0;
                        const subtotal = hasQty ? qty * (item.sellingPrice ?? 0) : 0;
                        const discAmount = hasQty ? computeDiscountAmount(subtotal, discountType, parseFloat(discountValue) || 0) : 0;
                        const revenue = subtotal - discAmount;
                        const cogs = hasQty ? qty * (item.costPrice ?? 0) : 0;
                        const grossProfit = revenue - cogs;
                        const marginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
                        const normalGrossProfit = subtotal - cogs;
                        const belowCost = hasQty && grossProfit < 0;
                        const exceedsStock = hasQty && qty > item.quantity;

                        return (
                            <>
                                <Text style={{ color: Colors.textSecondary, marginBottom: 8 }}>
                                    {item.name} — {item.quantity} {item.unit} in stock at {currency}{(item.sellingPrice ?? 0).toLocaleString()}/unit
                                </Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder={`Quantity sold (${item.unit})`}
                                    placeholderTextColor={Colors.textMuted}
                                    keyboardType="decimal-pad"
                                    value={sellQty}
                                    onChangeText={setSellQty}
                                />

                                <Text style={styles.discountLabel}>Discount (optional)</Text>
                                <View style={styles.discountTypeRow}>
                                    <TouchableOpacity
                                        style={[styles.discountTypePill, discountType === 'percentage' && styles.discountTypePillActive]}
                                        onPress={() => setDiscountType('percentage')}
                                    >
                                        <Text style={[styles.discountTypePillText, discountType === 'percentage' && styles.discountTypePillTextActive]}>％ Percentage</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.discountTypePill, discountType === 'fixed' && styles.discountTypePillActive]}
                                        onPress={() => setDiscountType('fixed')}
                                    >
                                        <Text style={[styles.discountTypePillText, discountType === 'fixed' && styles.discountTypePillTextActive]}>{currency} Fixed amount</Text>
                                    </TouchableOpacity>
                                </View>
                                <TextInput
                                    style={styles.input}
                                    placeholder={discountType === 'percentage' ? 'Discount %' : `Discount amount (${currency})`}
                                    placeholderTextColor={Colors.textMuted}
                                    keyboardType="decimal-pad"
                                    value={discountValue}
                                    onChangeText={setDiscountValue}
                                />

                                {hasQty && (
                                    <View style={styles.previewCard}>
                                        <View style={styles.previewRow}>
                                            <Text style={styles.previewLabel}>Subtotal</Text>
                                            <Text style={styles.previewVal}>{currency}{subtotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                                        </View>
                                        {discAmount > 0 && (
                                            <View style={styles.previewRow}>
                                                <Text style={styles.previewLabel}>Discount</Text>
                                                <Text style={[styles.previewVal, { color: Colors.warning }]}>−{currency}{discAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                                            </View>
                                        )}
                                        <View style={[styles.previewRow, styles.previewBorderTop]}>
                                            <Text style={[styles.previewLabel, { fontWeight: '700', color: Colors.textPrimary }]}>
                                                {discAmount > 0 ? 'Customer pays' : 'Revenue'}
                                            </Text>
                                            <Text style={[styles.previewVal, { fontWeight: '700', color: Colors.income }]}>{currency}{revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                                        </View>
                                        <View style={styles.previewRow}>
                                            <Text style={styles.previewLabel}>Cost of goods sold</Text>
                                            <Text style={[styles.previewVal, { color: Colors.expense }]}>−{currency}{cogs.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
                                        </View>
                                        <View style={styles.previewRow}>
                                            <Text style={[styles.previewLabel, { fontWeight: '700', color: Colors.textPrimary }]}>Gross profit</Text>
                                            <Text style={[styles.previewVal, { fontWeight: '700', color: grossProfit >= 0 ? Colors.income : Colors.expense }]}>
                                                {currency}{grossProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                            </Text>
                                        </View>
                                        <View style={styles.previewRow}>
                                            <Text style={styles.previewLabel}>Margin</Text>
                                            <Text style={[styles.previewVal, { color: marginColor(marginPct) }]}>{marginPct.toFixed(1)}%</Text>
                                        </View>
                                    </View>
                                )}

                                {discAmount > 0 && normalGrossProfit > 0 && !belowCost && (
                                    <View style={[styles.marginPreview, { borderColor: Colors.warning }]}>
                                        <View style={styles.marginPreviewNoteRow}>
                                            <Icon name="alert-triangle" size={12} color={Colors.warning} />
                                            <Text style={[styles.marginPreviewNote, { color: Colors.warning }]}>
                                                This discount cuts gross profit from {currency}{normalGrossProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })} to {currency}{grossProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })} ({Math.round((discAmount / normalGrossProfit) * 100)}% less).
                                            </Text>
                                        </View>
                                    </View>
                                )}
                                {belowCost && (
                                    <View style={[styles.marginPreview, { borderColor: Colors.expense }]}>
                                        <View style={styles.marginPreviewNoteRow}>
                                            <Icon name="alert-triangle" size={12} color={Colors.expense} />
                                            <Text style={[styles.marginPreviewNote, { color: Colors.expense }]}>
                                                This sale is below cost{discAmount > 0 ? ', after the discount,' : ''} — it loses {currency}{Math.abs(grossProfit).toLocaleString(undefined, { maximumFractionDigits: 0 })}. You can still record it if that's correct.
                                            </Text>
                                        </View>
                                    </View>
                                )}
                                {exceedsStock && (
                                    <Text style={{ color: Colors.expense, fontSize: 12, marginBottom: 8 }}>
                                        Only {item.quantity} {item.unit} in stock.
                                    </Text>
                                )}

                                <TouchableOpacity style={[styles.submitBtn, { backgroundColor: Colors.income }]} onPress={confirmSell}>
                                    <Text style={styles.submitBtnText}>Record Sale</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.cancelBtn} onPress={closeSellModal}>
                                    <Text style={styles.cancelBtnText}>Cancel</Text>
                                </TouchableOpacity>
                            </>
                        );
                    })()}
                </KeyboardAvoidingView>
            </Modal>

            {/* ── Stock In Modal ────────────────────────────────────────────────── */}
            <Modal visible={!!stockInModal} transparent animationType="slide" onRequestClose={() => { setStockInModal(null); setStockInForm(null); }}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => { setStockInModal(null); setStockInForm(null); }} />
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.modalSheet, constrainSheetWidth && styles.modalSheetWide]}>
                    <View style={styles.modalHandle} />
                    <Text style={styles.modalTitle}>Stock In</Text>
                    {stockInModal && stockInForm && (() => {
                        const { item } = stockInModal;
                        const qtyAdded = parseFloat(stockInForm.quantityAdded);
                        const cost = parseFloat(stockInForm.costPerUnit);
                        const preview = !isNaN(qtyAdded) && qtyAdded > 0 && !isNaN(cost) && cost >= 0
                            ? applyStockIn(item, qtyAdded, cost)
                            : null;

                        return (
                            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                                <Text style={{ color: Colors.textSecondary, marginBottom: 8 }}>
                                    {item.name} — {item.quantity} {item.unit} in stock at {currency}{(item.costPrice ?? 0).toLocaleString()}/unit
                                </Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder={`Quantity received (${item.unit})`}
                                    placeholderTextColor={Colors.textMuted}
                                    keyboardType="decimal-pad"
                                    value={stockInForm.quantityAdded}
                                    onChangeText={v => setStockInForm(f => f && ({ ...f, quantityAdded: v }))}
                                />
                                <TextInput
                                    style={styles.input}
                                    placeholder={`Cost per unit (${currency})`}
                                    placeholderTextColor={Colors.textMuted}
                                    keyboardType="decimal-pad"
                                    value={stockInForm.costPerUnit}
                                    onChangeText={v => setStockInForm(f => f && ({ ...f, costPerUnit: v }))}
                                />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Supplier (optional)"
                                    placeholderTextColor={Colors.textMuted}
                                    value={stockInForm.supplier}
                                    onChangeText={v => setStockInForm(f => f && ({ ...f, supplier: v }))}
                                />
                                <DateInput value={stockInForm.purchaseDate} onChange={v => setStockInForm(f => f && ({ ...f, purchaseDate: v }))} />

                                <TouchableOpacity
                                    style={styles.cashPurchaseToggleRow}
                                    onPress={() => setStockInForm(f => f && ({ ...f, recordCashPurchase: !f.recordCashPurchase }))}
                                    activeOpacity={0.7}
                                >
                                    <View style={[styles.checkbox, stockInForm.recordCashPurchase && styles.checkboxChecked]}>
                                        {stockInForm.recordCashPurchase && <Icon name="check" size={13} color="#fff" />}
                                    </View>
                                    <View style={styles.flex}>
                                        <Text style={styles.cashPurchaseToggleLabel}>Record as cash purchase</Text>
                                        <Text style={styles.cashPurchaseToggleHint}>
                                            Logs an expense for this purchase now. Turn off if you already recorded it, or if it's on supplier credit.
                                        </Text>
                                    </View>
                                </TouchableOpacity>

                                {preview && (
                                    <View style={styles.previewCard}>
                                        <View style={styles.previewRow}>
                                            <Text style={styles.previewLabel}>Previous stock</Text>
                                            <Text style={styles.previewVal}>{item.quantity} {item.unit}</Text>
                                        </View>
                                        <View style={styles.previewRow}>
                                            <Text style={styles.previewLabel}>+ Received</Text>
                                            <Text style={styles.previewVal}>{qtyAdded} {item.unit}</Text>
                                        </View>
                                        <View style={[styles.previewRow, styles.previewBorderTop]}>
                                            <Text style={[styles.previewLabel, { fontWeight: '700', color: Colors.textPrimary }]}>New stock</Text>
                                            <Text style={[styles.previewVal, { fontWeight: '700' }]}>{preview.quantity} {item.unit}</Text>
                                        </View>
                                        <View style={styles.previewRow}>
                                            <Text style={styles.previewLabel}>New avg. cost/unit</Text>
                                            <Text style={styles.previewVal}>{currency}{preview.costPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</Text>
                                        </View>
                                        <View style={styles.previewRow}>
                                            <Text style={styles.previewLabel}>New stock value</Text>
                                            <Text style={[styles.previewVal, { color: Colors.asset }]}>
                                                {currency}{(preview.quantity * preview.costPrice).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                            </Text>
                                        </View>
                                    </View>
                                )}

                                <TouchableOpacity style={styles.submitBtn} onPress={confirmStockIn}>
                                    <Text style={styles.submitBtnText}>Confirm Stock In</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.cancelBtn} onPress={() => { setStockInModal(null); setStockInForm(null); }}>
                                    <Text style={styles.cancelBtnText}>Cancel</Text>
                                </TouchableOpacity>
                            </ScrollView>
                        );
                    })()}
                </KeyboardAvoidingView>
            </Modal>

            {/* ── Change Price Modal ────────────────────────────────────────────── */}
            <Modal visible={!!priceModal} transparent animationType="slide" onRequestClose={() => { setPriceModal(null); setPriceForm(null); }}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => { setPriceModal(null); setPriceForm(null); }} />
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.modalSheet, constrainSheetWidth && styles.modalSheetWide]}>
                    <View style={styles.modalHandle} />
                    <Text style={styles.modalTitle}>Change Price</Text>
                    {priceModal && priceForm && (() => {
                        const { item } = priceModal;
                        const newPrice = parseFloat(priceForm.newPrice);
                        const hasNewPrice = !isNaN(newPrice) && newPrice >= 0;
                        const currentMargin = computeMarginPct(item.sellingPrice, item.costPrice);
                        const newMargin = hasNewPrice ? computeMarginPct(newPrice, item.costPrice) : currentMargin;
                        const belowCost = hasNewPrice && newPrice < item.costPrice;
                        const history = [...(item.priceHistory ?? [])].reverse();

                        return (
                            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                                <Text style={{ color: Colors.textSecondary, marginBottom: 8 }}>
                                    {item.name} — current price {currency}{item.sellingPrice.toLocaleString()}/unit
                                </Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder={`New selling price (${currency})`}
                                    placeholderTextColor={Colors.textMuted}
                                    keyboardType="decimal-pad"
                                    value={priceForm.newPrice}
                                    onChangeText={v => setPriceForm(f => f && ({ ...f, newPrice: v }))}
                                />
                                <DateInput value={priceForm.effectiveDate} onChange={v => setPriceForm(f => f && ({ ...f, effectiveDate: v }))} />

                                <Text style={[styles.discountLabel, { marginTop: Spacing.md }]}>Reason (optional)</Text>
                                <View style={styles.reasonWrap}>
                                    {PRICE_CHANGE_REASONS.map(r => (
                                        <TouchableOpacity
                                            key={r}
                                            style={[styles.reasonPill, priceForm.reason === r && styles.reasonPillActive]}
                                            onPress={() => setPriceForm(f => f && ({ ...f, reason: f.reason === r ? '' : r }))}
                                        >
                                            <Text style={[styles.reasonPillText, priceForm.reason === r && styles.reasonPillTextActive]}>{r}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                {hasNewPrice && (
                                    <View style={styles.previewCard}>
                                        <View style={styles.previewRow}>
                                            <Text style={styles.previewLabel}>Current margin</Text>
                                            <Text style={[styles.previewVal, { color: marginColor(currentMargin) }]}>{currentMargin.toFixed(1)}%</Text>
                                        </View>
                                        <View style={[styles.previewRow, styles.previewBorderTop]}>
                                            <Text style={[styles.previewLabel, { fontWeight: '700', color: Colors.textPrimary }]}>New margin</Text>
                                            <Text style={[styles.previewVal, { fontWeight: '700', color: marginColor(newMargin) }]}>{newMargin.toFixed(1)}%</Text>
                                        </View>
                                    </View>
                                )}

                                {belowCost && (
                                    <View style={[styles.marginPreview, { borderColor: Colors.expense }]}>
                                        <View style={styles.marginPreviewNoteRow}>
                                            <Icon name="alert-triangle" size={12} color={Colors.expense} />
                                            <Text style={[styles.marginPreviewNote, { color: Colors.expense }]}>
                                                This price is below cost ({currency}{item.costPrice.toLocaleString()}/unit) — every sale at this price loses money. You can still set it if that's correct.
                                            </Text>
                                        </View>
                                    </View>
                                )}

                                {history.length > 0 && (
                                    <View style={styles.previewCard}>
                                        <Text style={[styles.discountLabel, { marginBottom: 8 }]}>Price History</Text>
                                        <View style={styles.historyHeaderRow}>
                                            <Text style={[styles.historyCell, styles.historyHeaderText, { flex: 1.2 }]}>Date</Text>
                                            <Text style={[styles.historyCell, styles.historyHeaderText]}>Price</Text>
                                            <Text style={[styles.historyCell, styles.historyHeaderText]}>Cost</Text>
                                            <Text style={[styles.historyCell, styles.historyHeaderText]}>Margin</Text>
                                        </View>
                                        {history.map((h, i) => (
                                            <View key={`${h.date}-${i}`} style={styles.historyRow}>
                                                <Text style={[styles.historyCell, { flex: 1.2, color: Colors.textSecondary }]}>{h.date}</Text>
                                                <Text style={styles.historyCell}>{currency}{h.sellingPrice.toLocaleString()}</Text>
                                                <Text style={styles.historyCell}>{currency}{h.costPrice.toLocaleString()}</Text>
                                                <Text style={[styles.historyCell, { color: marginColor(computeMarginPct(h.sellingPrice, h.costPrice)) }]}>
                                                    {computeMarginPct(h.sellingPrice, h.costPrice).toFixed(1)}%
                                                </Text>
                                            </View>
                                        ))}
                                    </View>
                                )}

                                <TouchableOpacity style={styles.submitBtn} onPress={confirmPriceChange}>
                                    <Text style={styles.submitBtnText}>Confirm Price Change</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.cancelBtn} onPress={() => { setPriceModal(null); setPriceForm(null); }}>
                                    <Text style={styles.cancelBtnText}>Cancel</Text>
                                </TouchableOpacity>
                            </ScrollView>
                        );
                    })()}
                </KeyboardAvoidingView>
            </Modal>

            <Modal visible={!!countModal} transparent animationType="slide" onRequestClose={() => setCountModal(null)}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setCountModal(null)} />
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.modalSheet, constrainSheetWidth && styles.modalSheetWide]}>
                    <View style={styles.modalHandle} />
                    <Text style={styles.modalTitle}>Physical Stock Count</Text>
                    {countModal && (() => {
                        const { item } = countModal;
                        const actual = parseFloat(countQty);
                        const hasActual = !isNaN(actual) && actual >= 0;
                        const diff = hasActual ? actual - item.quantity : null;
                        return (
                            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                                <Text style={{ color: Colors.textSecondary, marginBottom: 8 }}>
                                    {item.name} — your records currently show {item.quantity} {item.unit}. Count what's actually on the shelf.
                                </Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder={`Actual count (${item.unit})`}
                                    placeholderTextColor={Colors.textMuted}
                                    keyboardType="decimal-pad"
                                    value={countQty}
                                    onChangeText={setCountQty}
                                />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Note (optional) — e.g. where the count was taken"
                                    placeholderTextColor={Colors.textMuted}
                                    value={countNote}
                                    onChangeText={setCountNote}
                                />

                                {diff !== null && diff !== 0 && (
                                    <View style={[styles.marginPreview, { borderColor: Colors.warning }]}>
                                        <View style={styles.marginPreviewNoteRow}>
                                            <Icon name="alert-triangle" size={12} color={Colors.warning} />
                                            <Text style={[styles.marginPreviewNote, { color: Colors.warning }]}>
                                                Difference: {Math.abs(diff)} {item.unit} {diff < 0 ? 'fewer' : 'more'} than your records suggest.
                                            </Text>
                                        </View>
                                    </View>
                                )}

                                {(item.stockCountHistory && item.stockCountHistory.length > 0) && (
                                    <View style={styles.previewCard}>
                                        <Text style={[styles.discountLabel, { marginBottom: 8 }]}>Count History</Text>
                                        <View style={styles.historyHeaderRow}>
                                            <Text style={[styles.historyCell, styles.historyHeaderText, { flex: 1.2 }]}>Date</Text>
                                            <Text style={[styles.historyCell, styles.historyHeaderText]}>Expected</Text>
                                            <Text style={[styles.historyCell, styles.historyHeaderText]}>Actual</Text>
                                            <Text style={[styles.historyCell, styles.historyHeaderText]}>Diff</Text>
                                        </View>
                                        {[...item.stockCountHistory].reverse().map((h, i) => (
                                            <View key={`${h.date}-${i}`} style={styles.historyRow}>
                                                <Text style={[styles.historyCell, { flex: 1.2, color: Colors.textSecondary }]}>{h.date}</Text>
                                                <Text style={styles.historyCell}>{h.expectedQuantity}</Text>
                                                <Text style={styles.historyCell}>{h.actualQuantity}</Text>
                                                <Text style={[styles.historyCell, { color: h.differenceUnits === 0 ? Colors.income : Colors.warning }]}>
                                                    {h.differenceUnits > 0 ? '+' : ''}{h.differenceUnits}
                                                </Text>
                                            </View>
                                        ))}
                                    </View>
                                )}

                                <TouchableOpacity style={styles.submitBtn} onPress={confirmCount}>
                                    <Text style={styles.submitBtnText}>Confirm Count</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.cancelBtn} onPress={() => setCountModal(null)}>
                                    <Text style={styles.cancelBtnText}>Cancel</Text>
                                </TouchableOpacity>
                            </ScrollView>
                        );
                    })()}
                </KeyboardAvoidingView>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe:   { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1, backgroundColor: Colors.bg },
    pad:    { padding: Spacing.lg, paddingBottom: 100 },
    flex:   { flex: 1 },

    // Tab bar
    tabBar:         { flexDirection: 'row', backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
    tabBtn:         { flex: 1, paddingVertical: Spacing.md, alignItems: 'center' },
    tabBtnActive:   { borderBottomWidth: 2, borderBottomColor: Colors.primary },
    tabText:        { fontSize: 13, color: Colors.textMuted, fontWeight: '500' },
    tabTextActive:  { color: Colors.primary, fontWeight: '700' },

    titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    title:    { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary },
    addBtn:   { backgroundColor: Colors.primary, paddingHorizontal: 14, paddingVertical: Spacing.sm, borderRadius: Radius.sm, ...Shadow.sm },
    addBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },

    summaryRow:  { flexDirection: 'row', gap: 10, marginBottom: Spacing.md },
    summaryCard: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center' },
    summaryLabel:{ fontSize: 10, color: Colors.textMuted, marginBottom: Spacing.xs },
    summaryVal:  { fontSize: 16, fontWeight: 'bold' },

    lowStockBanner: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1,
        borderColor: Colors.warning, borderRadius: 10, padding: Spacing.md, marginBottom: Spacing.md,
    },
    lowStockBannerText: { flex: 1, color: Colors.warning, fontWeight: '600', fontSize: 13 },

    emptyState:    { alignItems: 'center', paddingVertical: 60 },
    emptyIconWrap: { marginBottom: Spacing.lg },
    emptyText:     { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 6 },
    emptySubText:  { fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: 32 },

    itemCard: {
        backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 14,
        marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
    },
    itemHeader:   { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.md },
    itemName:     { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 2 },
    itemCategory: { fontSize: 11, color: Colors.textMuted },
    itemActions:  { flexDirection: 'row', gap: 6 },
    actionBtn:    { backgroundColor: Colors.muted, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', justifyContent: 'center' },
    deleteBtn:    { backgroundColor: 'rgba(239,68,68,0.2)' },
    actionBtnText:{ fontSize: 14 },

    metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: 10 },
    metricCell:  { minWidth: '45%', flex: 1 },
    metricLabel: { fontSize: 10, color: Colors.textMuted, marginBottom: 2 },
    metricVal:   { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },

    itemFooter:    { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.sm },
    stockValLabel: { fontSize: 11, color: Colors.textMuted },
    stockValNum:   { fontSize: 12, fontWeight: 'bold', color: Colors.asset },
    velocityRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: Spacing.sm, borderWidth: 1, borderRadius: Radius.sm, padding: Spacing.sm },
    velocityText:  { flex: 1, fontSize: 11, lineHeight: 15 },

    // Analytics
    analyticsCard:      { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 14, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    analyticsCardTitle: { fontSize: 14, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 10 },
    // Distinguishes Inventory Health from Stock Health -- two separately
    // computed scores that otherwise sit right next to each other on this
    // tab with near-identical names, easy to mistake for duplicates.
    cardSubtitle: { fontSize: 11.5, color: Colors.textMuted, marginTop: -6, marginBottom: 8, lineHeight: 15, fontStyle: 'italic' },
    inventoryHealthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
    inventoryHealthBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
    inventoryHealthBadgeText: { fontSize: 12, fontWeight: '800', color: '#fff' },
    analyticsRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: Colors.border },
    analyticsBorderTop: { borderTopWidth: 1, borderTopColor: Colors.textMuted, marginTop: 4, paddingTop: 10, borderBottomWidth: 0 },
    analyticsLabel:     { fontSize: 13, color: Colors.textSecondary, flex: 1 },
    analyticsVal:       { fontSize: 13, fontWeight: '600' },
    analyticsEmpty:     { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic' },
    discountInsight:    { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginTop: 6 },

    intelligenceHeadline: { fontSize: 32, fontWeight: '800', color: Colors.asset, marginTop: 6 },
    intelligenceSub:      { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
    intelligenceAdvisory: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginTop: Spacing.md },
    insightBanner: { borderWidth: 1, borderRadius: 10, padding: Spacing.md, marginTop: Spacing.sm },
    insightTitle:  { fontSize: 13, fontWeight: '700', marginBottom: 3 },
    insightDetail: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },

    categoryRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.border },
    categoryName: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
    categoryMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
    categoryRight:{ alignItems: 'flex-end' },

    bestItemRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
    bestItemName:    { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
    marginBadge:     { paddingHorizontal: 10, paddingVertical: Spacing.xs, borderRadius: Radius.md },
    marginBadgeText: { fontSize: 12, fontWeight: 'bold' },

    healthRow:  { alignItems: 'center', marginVertical: Spacing.sm },
    healthNote: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },

    stockBarTrack: { height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden', marginBottom: 10 },
    stockBarFill:  { height: '100%', borderRadius: 3 },

    reportsBtn:     { backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 4, marginBottom: Spacing.sm, ...Shadow.sm },
    reportsBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
    modalSheet: {
        backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
        padding: Spacing.xxl, paddingBottom: Spacing.huge, maxHeight: '90%',
    },
    modalSheetWide: { maxWidth: 560, width: '100%', alignSelf: 'center' },
    modalHandle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.lg },
    modalTitle:  { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: Spacing.lg },
    inputRow:    { flexDirection: 'row' },
    input: {
        backgroundColor: Colors.bg, borderColor: Colors.border, borderWidth: 1,
        borderRadius: Radius.sm, paddingHorizontal: Spacing.md, paddingVertical: 11,
        color: Colors.textPrimary, fontSize: 14, marginBottom: Spacing.md,
    },
    submitBtn:     { backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 4, ...Shadow.sm },
    submitBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
    marginPreview:      { borderWidth: 1, borderRadius: 10, padding: Spacing.md, marginBottom: Spacing.md },
    marginPreviewLabel: { fontSize: 11, color: Colors.textMuted, marginBottom: 3 },
    marginPreviewVal:   { fontSize: 18, fontWeight: '800', marginBottom: Spacing.xs },
    marginPreviewNoteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 6 },
    marginPreviewNote:  { flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 17 },
    marginPreviewSolution: { fontSize: 11, color: Colors.textSecondary, lineHeight: 16 },
    cancelBtn:     { paddingVertical: Spacing.md, borderRadius: 10, alignItems: 'center', marginTop: Spacing.sm },
    cancelBtnText: { color: Colors.textMuted, fontSize: 14 },

    checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
    checkboxChecked: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    cashPurchaseToggleRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: Spacing.sm, marginBottom: Spacing.md },
    cashPurchaseToggleLabel: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, marginBottom: 2 },
    cashPurchaseToggleHint: { fontSize: 11, color: Colors.textMuted, lineHeight: 15 },

    discountLabel:      { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
    discountTypeRow:    { flexDirection: 'row', gap: 8, marginBottom: Spacing.md },
    discountTypePill:       { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingVertical: 9, alignItems: 'center' },
    discountTypePillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    discountTypePillText:       { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
    discountTypePillTextActive: { color: '#fff' },

    reasonWrap:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.md },
    reasonPill:          { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 7 },
    reasonPillActive:    { backgroundColor: Colors.primary, borderColor: Colors.primary },
    reasonPillText:      { fontSize: 12, color: Colors.textSecondary },
    reasonPillTextActive:{ color: '#fff', fontWeight: '600' },

    historyHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border, paddingBottom: 6, marginBottom: 4 },
    historyHeaderText:{ fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase' as const, fontSize: 10 },
    historyRow:       { flexDirection: 'row', paddingVertical: 5 },
    historyCell:      { flex: 1, fontSize: 12, color: Colors.textPrimary },

    previewCard:        { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: Spacing.md, marginBottom: Spacing.md },
    previewRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
    previewLabel:    { fontSize: 12, color: Colors.textSecondary },
    previewVal:      { fontSize: 12, color: Colors.textPrimary },
    previewBorderTop:{ borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 2, paddingTop: 7 },
});
