// NOTE: despite the name, this screen has nothing to do with the app's
// internal record-based diagnosis (performFinancialDiagnosis / computeRiskScore
// in utils/financialDiagnosisEngine.ts + utils/finance.ts, surfaced on
// FinancialAssessmentScreen and BusinessPassportScreen). This one calls an
// external third party (Pngme) that estimates income from mobile money/bank
// SMS text — a different data source for a different purpose (income
// verification for lending), not a summary of what's recorded in Quad360.
import React, { useState, useCallback } from 'react';
import {
    View, Text, TouchableOpacity, ScrollView,
    StyleSheet, ActivityIndicator,
} from 'react-native';
import { useApp } from '../contexts/OptimizedContexts';
import { Colors } from '../theme/colors';
import { supabase } from '../utils/supabase';
import NextStepLink from '../components/NextStepLink';
import Icon from '../components/ui/Icon';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import { showAlert } from '../utils/webAlert';

interface HealthData {
    income:    any | null;
    features:  any | null;
    errors:    string[];
    fetchedAt: string;
    phone?:    string;
    country?:  string;
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
    const { navigate, goBack, user, settings } = useApp();

    const [loading, setLoading]   = useState(false);
    const [data, setData]         = useState<HealthData | null>(null);

    const currency     = settings.currency || '₦';
    const currencyCode = (settings as any).currencyCode || 'NGN';
    const phone        = user?.phone || '';

    const fetchHealth = useCallback(async () => {
        if (!phone) {
            showAlert('Phone Number Required', 'Please add your phone number in Settings to use Financial Health scoring.');
            return;
        }

        setLoading(true);
        try {
            const { data: result, error } = await supabase.functions.invoke('financial-health', {
                body: { phone, currencyCode },
            });
            if (error) {
                // See aiAdvisor.ts's askAdvisor for why .context is checked this
                // way -- the edge function always replies with { error }, so
                // surface that instead of a generic non-2xx message.
                const errResponse = (error as { context?: Response }).context;
                const body = errResponse && typeof errResponse.json === 'function'
                    ? await errResponse.json().catch(() => null)
                    : null;
                throw new Error(body?.error || error.message || 'The scoring service is temporarily unavailable.');
            }

            setData({ ...result, fetchedAt: new Date().toISOString() });

            if (result.errors?.length) {
                console.warn('Pngme partial errors:', result.errors);
            }
        } catch (err: any) {
            showAlert('Could Not Load Data', err?.message || 'We couldn\'t reach the Financial Health scoring service right now. Please try again shortly.');
            console.error('[FinancialHealthScreen] fetch failed:', err);
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
                <TouchableOpacity onPress={() => { if (!goBack()) navigate('dashboard'); }}>
                    <Text style={styles.backBtn}>← Back</Text>
                </TouchableOpacity>
                <View>
                    <View style={styles.titleRow}>
                        <Icon name="bar-chart-2" size={16} color={Colors.textPrimary} />
                        <Text style={styles.title}>Financial Health</Text>
                    </View>
                    <Text style={styles.subtitle}>Powered by Pngme · {currencyCode}</Text>
                </View>
            </View>

            {/* Phone warning */}
            {!phone && (
                <View style={styles.warnCard}>
                    <View style={styles.warnTextRow}>
                        <Icon name="alert-triangle" size={14} color="#f59e0b" />
                        <Text style={styles.warnText}>
                            No phone number on your account. Go to Settings → My Business to add one and unlock your financial health score.
                        </Text>
                    </View>
                    <TouchableOpacity onPress={() => navigate('settings')}>
                        <Text style={styles.warnLink}>Go to Settings →</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Fetch button */}
            {!data && (
                <View style={styles.heroCard}>
                    <View style={styles.heroIcon}>
                        <Icon name="home" size={48} color={Colors.primary} />
                    </View>
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
                            : (
                                <View style={styles.badgeRow}>
                                    <Icon name="search" size={15} color="#fff" />
                                    <Text style={styles.primaryBtnText}>Fetch My Financial Score</Text>
                                </View>
                            )
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
                                {(data.errors ?? []).length > 0
                                    ? 'Income data unavailable — ' + (data.errors ?? [])[0]
                                    : 'No income data yet. Connect your bank SMS first.'}
                            </Text>
                        )}
                    </View>

                    {/* Features breakdown */}
                    <View style={styles.infoCard}>
                        <Text style={styles.sectionTitle}>Account Details</Text>
                        <DataRow label="Phone" value={data.phone ?? '—'} />
                        <DataRow label="Country" value={data.country?.toUpperCase() ?? currencyCode} />
                        {activeAccounts > 0 && <DataRow label="Active Accounts" value={String(activeAccounts)} />}
                        <View style={styles.dataRow}>
                            <Text style={styles.dataLabel}>Mobile Money Active</Text>
                            <View style={styles.dataValueRow}>
                                <Icon name={mobileMoneyActive ? 'check-circle' : 'x-circle'} size={13} color={mobileMoneyActive ? Colors.income : Colors.textMuted} />
                                <Text style={styles.dataValue}>{mobileMoneyActive ? 'Yes' : 'No'}</Text>
                            </View>
                        </View>
                        <View style={styles.dataRow}>
                            <Text style={styles.dataLabel}>Active Loan</Text>
                            <View style={styles.dataValueRow}>
                                <Icon name={loanFlag ? 'alert-triangle' : 'check-circle'} size={13} color={loanFlag ? Colors.warning : Colors.income} />
                                <Text style={styles.dataValue}>{loanFlag ? 'Yes' : 'No'}</Text>
                            </View>
                        </View>
                        <DataRow label="Last Updated" value={new Date(data.fetchedAt).toLocaleString()} />
                        {loanFlag && (
                            <NextStepLink text="Make sure this loan is recorded in your app" onPress={() => navigate('loans')} />
                        )}
                    </View>

                    {/* Partial errors */}
                    {(data.errors ?? []).length > 0 && (
                        <View style={styles.errorCard}>
                            <View style={[styles.badgeRow, { marginBottom: Spacing.sm }]}>
                                <Icon name="alert-triangle" size={13} color="#ef4444" />
                                <Text style={styles.errorTitle}>Some data unavailable</Text>
                            </View>
                            {(data.errors ?? []).map((e, i) => (
                                <Text key={i} style={styles.errorText}>• {e}</Text>
                            ))}
                            <Text style={styles.errorHint}>
                                This may mean your Pngme plan doesn't include this data, or SMS data hasn't been processed yet.
                            </Text>
                        </View>
                    )}

                    {/* Refresh */}
                    <TouchableOpacity style={styles.refreshBtn} onPress={fetchHealth} disabled={loading}>
                        <View style={styles.badgeRow}>
                            <Icon name="refresh-cw" size={14} color={Colors.primary} />
                            <Text style={styles.refreshBtnText}>Refresh Score</Text>
                        </View>
                    </TouchableOpacity>
                </>
            )}

            {/* What this data means */}
            <View style={styles.tipCard}>
                <View style={styles.badgeRow}>
                    <Icon name="info" size={13} color={Colors.primary} />
                    <Text style={styles.tipTitle}>How to use this</Text>
                </View>
                <Text style={styles.tipBody}>
                    Your financial health score is based on Pngme's analysis of your bank and mobile money SMS history. Use it to:
                    {'\n'}• Support loan applications with income evidence
                    {'\n'}• Monitor your business cash flow health
                    {'\n'}• Track financial activity over time
                </Text>
            </View>

            {/* Feature Cards - Navigation to coaching and credit tools */}
            <TouchableOpacity onPress={() => navigate('credit-worthiness')} style={styles.featureCardContainer}>
                <View style={styles.featureCard}>
                    <Icon name="trending-up" size={28} color={Colors.primary} />
                    <View style={styles.featureContent}>
                        <Text style={styles.featureTitle}>Credit Worthiness</Text>
                        <Text style={styles.featureDesc}>Understand lender requirements & improve your profile</Text>
                    </View>
                    <Text style={styles.featureArrow}>→</Text>
                </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => navigate('financial-assessment')} style={styles.featureCardContainer}>
                <View style={styles.featureCard}>
                    <Icon name="target" size={28} color={Colors.primary} />
                    <View style={styles.featureContent}>
                        <Text style={styles.featureTitle}>Financial Health Coach</Text>
                        <Text style={styles.featureDesc}>Get personalized recommendations & track milestones</Text>
                    </View>
                    <Text style={styles.featureArrow}>→</Text>
                </View>
            </TouchableOpacity>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg },
    content:   { padding: Spacing.lg, paddingBottom: 60 },

    header:   { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: Spacing.xxl },
    backBtn:  { color: Colors.primary, fontSize: 14, fontWeight: '600' },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    title:    { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
    subtitle: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

    // Small icon + label row shared by titles, badges and buttons throughout
    // this screen.
    badgeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },

    warnCard: { backgroundColor: 'rgba(251,191,36,0.12)', borderRadius: Radius.md, padding: 14, marginBottom: Spacing.lg, borderLeftWidth: 3, borderLeftColor: '#f59e0b' },
    warnTextRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.sm },
    warnText: { flex: 1, fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
    warnLink: { fontSize: 13, color: Colors.primary, fontWeight: '700' },

    heroCard:  { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.xxl, marginBottom: Spacing.lg, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    heroIcon:  { marginBottom: Spacing.md },
    heroTitle: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center', marginBottom: 10 },
    heroBody:  { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: Spacing.xl },

    primaryBtn:     { backgroundColor: Colors.primary, paddingVertical: 14, paddingHorizontal: Spacing.xxl, borderRadius: Radius.md, alignItems: 'center', width: '100%' },
    primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    btnDisabled:    { opacity: 0.5 },

    loadingCard:  { alignItems: 'center', padding: 40, gap: 16 },
    loadingText:  { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },

    scoreCard: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.xl, marginBottom: 14 },
    scoreRow:  { flexDirection: 'row', justifyContent: 'space-around', marginTop: Spacing.md },
    noScore:   { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },

    sectionTitle: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.xs },

    infoCard: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: 14 },
    bigNumber:      { fontSize: 38, fontWeight: '900', color: Colors.primary, marginTop: 10 },
    bigNumberLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600', marginTop: 2 },
    bigNumberNote:  { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
    noDataText:     { fontSize: 13, color: Colors.textMuted, lineHeight: 20, marginTop: Spacing.sm },

    dataRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
    dataLabel:    { fontSize: 13, color: Colors.textMuted },
    dataValue:    { fontSize: 13, color: Colors.textPrimary, fontWeight: '600' },
    dataValueRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },

    errorCard:  { backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: Radius.md, padding: 14, marginBottom: 14, borderLeftWidth: 3, borderLeftColor: '#ef4444' },
    errorTitle: { fontSize: 13, fontWeight: '700', color: '#ef4444' },
    errorText:  { fontSize: 12, color: Colors.textSecondary, marginBottom: Spacing.xs },
    errorHint:  { fontSize: 11, color: Colors.textMuted, marginTop: 6, lineHeight: 17 },

    refreshBtn:     { backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.primary, paddingVertical: 13, borderRadius: Radius.md, alignItems: 'center', marginBottom: Spacing.lg },
    refreshBtnText: { color: Colors.primary, fontWeight: '700', fontSize: 14 },

    tipCard:  { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 14, borderLeftWidth: 3, borderLeftColor: Colors.primary },
    tipTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    tipBody:  { fontSize: 12, color: Colors.textMuted, lineHeight: 20, marginTop: Spacing.xs },

    featureCardContainer: { marginBottom: Spacing.md },
    featureCard: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.lg, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '40', ...Shadow.sm },
    featureIcon: { fontSize: 28 },
    featureContent: { flex: 1 },
    featureTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
    featureDesc: { fontSize: 12, color: Colors.textMuted },
    featureArrow: { fontSize: 16, color: Colors.primary, fontWeight: 'bold' },
});
