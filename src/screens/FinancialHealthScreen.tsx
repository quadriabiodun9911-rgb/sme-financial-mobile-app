import React, { useState, useCallback } from 'react';
import {
    View, Text, TouchableOpacity, ScrollView,
    StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';

const BACKEND_URL = 'https://quad360-backend.onrender.com';

interface HealthData {
    income:   any | null;
    features: any | null;
    errors:   string[];
    fetchedAt: string;
}

function ScoreRing({ score, max = 100, label, color }: { score: number; max?: number; label: string; color: string }) {
    const pct = Math.min(100, Math.round((score / max) * 100));
    return (
        <View style={ring.wrap}>
            <View style={[ring.outer, { borderColor: color }]}>
                <Text style={[ring.num, { color }]}>{pct}</Text>
                <Text style={ring.pct}>/ {max}</Text>
            </View>
            <Text style={ring.label}>{label}</Text>
        </View>
    );
}

const ring = StyleSheet.create({
    wrap:  { alignItems: 'center', gap: 6 },
    outer: { width: 84, height: 84, borderRadius: 42, borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
    num:   { fontSize: 22, fontWeight: '900' },
    pct:   { fontSize: 10, color: Colors.textMuted, marginTop: -2 },
    label: { fontSize: 11, color: Colors.textMuted, fontWeight: '600', textAlign: 'center' },
});

function DataRow({ label, value }: { label: string; value: string }) {
    return (
        <View style={styles.dataRow}>
            <Text style={styles.dataLabel}>{label}</Text>
            <Text style={styles.dataValue}>{value}</Text>
        </View>
    );
}

export default function FinancialHealthScreen() {
    const { navigate, user, settings } = useApp();

    const [loading, setLoading]   = useState(false);
    const [data, setData]         = useState<HealthData | null>(null);

    const currency     = settings.currency || '₦';
    const currencyCode = (settings as any).currencyCode || 'NGN';
    const phone        = user?.phone || '';

    const fetchHealth = useCallback(async () => {
        if (!phone) {
            Alert.alert(
                'Phone number required',
                'Please add your phone number in Settings to use Financial Health scoring.',
                [{ text: 'OK' }]
            );
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(
                `${BACKEND_URL}/api/financial-health/${encodeURIComponent(phone)}?currencyCode=${currencyCode}`
            );

            if (!res.ok) throw new Error(`Server error ${res.status}. Is the backend deployed?`);

            const json = await res.json();
            setData({ ...json, fetchedAt: new Date().toISOString() });

            if (json.errors?.length) {
                console.warn('Pngme partial errors:', json.errors);
            }
        } catch (err: any) {
            Alert.alert('Could not load data', err.message);
        } finally {
            setLoading(false);
        }
    }, [phone, currencyCode]);

    // Parse Pngme income response
    const incomeMonthly: number | null = data?.income?.estimatedMonthlyIncome
        ?? data?.income?.monthly_income
        ?? data?.income?.income?.monthly
        ?? null;

    const incomeConfidence: number | null = data?.income?.confidence
        ?? data?.income?.score
        ?? null;

    // Parse Pngme features response
    const features = data?.features;
    const activeAccounts: number  = features?.activeAccounts ?? features?.active_accounts ?? 0;
    const loanFlag: boolean       = !!(features?.hasActiveLoan ?? features?.has_active_loan);
    const mobileMoneyActive: boolean = !!(features?.mobileMoneyActive ?? features?.mobile_money_active ?? true);

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigate('cfo')}>
                    <Text style={styles.backBtn}>← Back</Text>
                </TouchableOpacity>
                <View>
                    <Text style={styles.title}>📊 Financial Health</Text>
                    <Text style={styles.subtitle}>Powered by Pngme · {currencyCode}</Text>
                </View>
            </View>

            {/* Phone warning */}
            {!phone && (
                <View style={styles.warnCard}>
                    <Text style={styles.warnText}>
                        ⚠️ No phone number on your account. Go to Settings → My Business to add one and unlock your financial health score.
                    </Text>
                    <TouchableOpacity onPress={() => navigate('settings')}>
                        <Text style={styles.warnLink}>Go to Settings →</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Fetch button */}
            {!data && (
                <View style={styles.heroCard}>
                    <Text style={styles.heroIcon}>🏦</Text>
                    <Text style={styles.heroTitle}>Get Your Financial Health Score</Text>
                    <Text style={styles.heroBody}>
                        Pngme analyses your mobile money and bank SMS data to generate an income estimate and financial profile — useful for loan applications and business planning.
                    </Text>
                    <TouchableOpacity
                        style={[styles.primaryBtn, (!phone || loading) && styles.btnDisabled]}
                        onPress={fetchHealth}
                        disabled={!phone || loading}
                    >
                        {loading
                            ? <ActivityIndicator color="#fff" />
                            : <Text style={styles.primaryBtnText}>🔍  Fetch My Financial Score</Text>
                        }
                    </TouchableOpacity>
                </View>
            )}

            {/* Loading */}
            {loading && (
                <View style={styles.loadingCard}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                    <Text style={styles.loadingText}>Fetching your financial data from Pngme…</Text>
                </View>
            )}

            {/* Results */}
            {data && !loading && (
                <>
                    {/* Score rings */}
                    <View style={styles.scoreCard}>
                        <Text style={styles.sectionTitle}>Financial Profile</Text>
                        <View style={styles.scoreRow}>
                            {incomeConfidence !== null && (
                                <ScoreRing
                                    score={Math.round(incomeConfidence * 100)}
                                    max={100}
                                    label="Income Confidence"
                                    color="#22c55e"
                                />
                            )}
                            {activeAccounts > 0 && (
                                <ScoreRing
                                    score={activeAccounts}
                                    max={10}
                                    label="Active Accounts"
                                    color={Colors.primary}
                                />
                            )}
                            {incomeConfidence === null && activeAccounts === 0 && (
                                <Text style={styles.noScore}>
                                    Score data not yet available.{'\n'}Make sure you've connected your bank SMS via the Connect Bank screen.
                                </Text>
                            )}
                        </View>
                    </View>

                    {/* Income card */}
                    <View style={styles.infoCard}>
                        <Text style={styles.sectionTitle}>Income Estimate</Text>
                        {incomeMonthly !== null ? (
                            <>
                                <Text style={styles.bigNumber}>{currency}{incomeMonthly.toLocaleString()}</Text>
                                <Text style={styles.bigNumberLabel}>Estimated Monthly Income</Text>
                                <Text style={styles.bigNumberNote}>Based on SMS data analysis by Pngme</Text>
                            </>
                        ) : (
                            <Text style={styles.noDataText}>
                                {data.errors.length > 0
                                    ? 'Income data unavailable — ' + data.errors[0]
                                    : 'No income data yet. Connect your bank SMS first.'}
                            </Text>
                        )}
                    </View>

                    {/* Features breakdown */}
                    <View style={styles.infoCard}>
                        <Text style={styles.sectionTitle}>Account Details</Text>
                        <DataRow label="Phone" value={data.phone} />
                        <DataRow label="Country" value={data.country?.toUpperCase() ?? currencyCode} />
                        {activeAccounts > 0 && <DataRow label="Active Accounts" value={String(activeAccounts)} />}
                        <DataRow label="Mobile Money Active" value={mobileMoneyActive ? '✓ Yes' : '✗ No'} />
                        <DataRow label="Active Loan" value={loanFlag ? '⚠️ Yes' : '✓ No'} />
                        <DataRow label="Last Updated" value={new Date(data.fetchedAt).toLocaleString()} />
                    </View>

                    {/* Partial errors */}
                    {data.errors.length > 0 && (
                        <View style={styles.errorCard}>
                            <Text style={styles.errorTitle}>⚠️ Some data unavailable</Text>
                            {data.errors.map((e, i) => (
                                <Text key={i} style={styles.errorText}>• {e}</Text>
                            ))}
                            <Text style={styles.errorHint}>
                                This may mean your Pngme plan doesn't include this data, or SMS data hasn't been processed yet.
                            </Text>
                        </View>
                    )}

                    {/* Refresh */}
                    <TouchableOpacity style={styles.refreshBtn} onPress={fetchHealth} disabled={loading}>
                        <Text style={styles.refreshBtnText}>🔄  Refresh Score</Text>
                    </TouchableOpacity>
                </>
            )}

            {/* What this data means */}
            <View style={styles.tipCard}>
                <Text style={styles.tipTitle}>💡 How to use this</Text>
                <Text style={styles.tipBody}>
                    Your financial health score is based on Pngme's analysis of your bank and mobile money SMS history. Use it to:
                    {'\n'}• Support loan applications with income evidence
                    {'\n'}• Monitor your business cash flow health
                    {'\n'}• Track financial activity over time
                </Text>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg },
    content:   { padding: 16, paddingBottom: 60 },

    header:   { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
    backBtn:  { color: Colors.primary, fontSize: 14, fontWeight: '600' },
    title:    { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
    subtitle: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

    warnCard: { backgroundColor: 'rgba(251,191,36,0.12)', borderRadius: 12, padding: 14, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: '#f59e0b' },
    warnText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19, marginBottom: 8 },
    warnLink: { fontSize: 13, color: Colors.primary, fontWeight: '700' },

    heroCard:  { backgroundColor: Colors.surface, borderRadius: 16, padding: 24, marginBottom: 16, alignItems: 'center' },
    heroIcon:  { fontSize: 48, marginBottom: 12 },
    heroTitle: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center', marginBottom: 10 },
    heroBody:  { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 20 },

    primaryBtn:     { backgroundColor: Colors.primary, paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12, alignItems: 'center', width: '100%' },
    primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    btnDisabled:    { opacity: 0.5 },

    loadingCard:  { alignItems: 'center', padding: 40, gap: 16 },
    loadingText:  { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },

    scoreCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 20, marginBottom: 14 },
    scoreRow:  { flexDirection: 'row', justifyContent: 'space-around', marginTop: 12 },
    noScore:   { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },

    sectionTitle: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },

    infoCard: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 14 },
    bigNumber:      { fontSize: 38, fontWeight: '900', color: Colors.primary, marginTop: 10 },
    bigNumberLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600', marginTop: 2 },
    bigNumberNote:  { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
    noDataText:     { fontSize: 13, color: Colors.textMuted, lineHeight: 20, marginTop: 8 },

    dataRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
    dataLabel: { fontSize: 13, color: Colors.textMuted },
    dataValue: { fontSize: 13, color: Colors.textPrimary, fontWeight: '600' },

    errorCard:  { backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: 12, padding: 14, marginBottom: 14, borderLeftWidth: 3, borderLeftColor: '#ef4444' },
    errorTitle: { fontSize: 13, fontWeight: '700', color: '#ef4444', marginBottom: 8 },
    errorText:  { fontSize: 12, color: Colors.textSecondary, marginBottom: 4 },
    errorHint:  { fontSize: 11, color: Colors.textMuted, marginTop: 6, lineHeight: 17 },

    refreshBtn:     { backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.primary, paddingVertical: 13, borderRadius: 12, alignItems: 'center', marginBottom: 16 },
    refreshBtnText: { color: Colors.primary, fontWeight: '700', fontSize: 14 },

    tipCard:  { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, borderLeftWidth: 3, borderLeftColor: Colors.primary },
    tipTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
    tipBody:  { fontSize: 12, color: Colors.textMuted, lineHeight: 20 },
});
