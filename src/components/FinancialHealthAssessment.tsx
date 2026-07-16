import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { FinanceData, Transaction, Invoice } from '../types';
import { performFinancialDiagnosis } from '../utils/financialDiagnosisEngine';

interface Props {
    finance:      FinanceData;
    transactions: Transaction[];
    invoices:     Invoice[];
    assets?:      any[];
    currency:     string;
    minReserve?:  number | string;
    targetMargin?: number | string;
}

function ScoreBar({ label, score, color }: { label: string; score: number; color: string }) {
    return (
        <View style={s.barRow}>
            <Text style={s.barLabel}>{label}</Text>
            <View style={s.barTrack}>
                <View style={[s.barFill, { width: `${Math.min(100, Math.max(0, score))}%`, backgroundColor: color }]} />
            </View>
            <Text style={[s.barScore, { color }]}>{Math.round(score)}</Text>
        </View>
    );
}

export default function FinancialHealthAssessment({ finance, transactions, invoices, currency, minReserve, targetMargin }: Props) {
    const profit      = finance.profit ?? 0;
    const income      = finance.income ?? 0;
    const margin      = isFinite(finance.margin) ? finance.margin : 0;
    const target      = parseFloat(String(targetMargin ?? 20)) || 20;

    // Reuses the exact same root-cause diagnosis engine as Clarity, the AI
    // Advisor, and Financial Assessment — this screen used to compute its
    // own local score from profit/margin/revenue/activity with no cash or
    // runway factor at all, so it could (and did) show "80/100 Strong"
    // for an account the rest of the app correctly flagged as critical
    // (negative cash runway). One health score definition, not two that
    // can contradict each other on the same data.
    const diagnosis = useMemo(
        () => performFinancialDiagnosis(transactions, invoices, finance.cashBalance, finance.expense || 1, currency),
        [transactions, invoices, finance.cashBalance, finance.expense, currency]
    );
    const overall = diagnosis.overallHealth;
    const runwayDays = diagnosis.metrics.runwayDays;

    // Sub-scores shown as bars — Cash Position (runway) replaces the old
    // "Revenue Strength" bar, since cash survival is the metric this card
    // was previously blind to.
    const profitScore = Math.min(100, Math.max(0, (diagnosis.metrics.profitMargin / 20) * 100));
    const marginScore  = Math.min(100, Math.max(0, (margin / Math.max(target, 1)) * 100));
    const cashScore    = runwayDays === null ? 0 : Math.min(100, Math.max(0, (runwayDays / 60) * 100));
    const txCount      = transactions.filter(t => {
        const d = new Date(t.date); const now = new Date();
        return now.getTime() - d.getTime() < 30 * 24 * 60 * 60 * 1000;
    }).length;
    const activityScore = Math.min(100, txCount * 5);

    const color = diagnosis.healthStatus === 'healthy' ? Colors.income : diagnosis.healthStatus === 'warning' ? Colors.warning : Colors.expense;
    const verdict = diagnosis.healthStatus === 'healthy' ? 'Strong' : diagnosis.healthStatus === 'warning' ? 'Needs Attention' : 'Critical';

    return (
        <View style={s.container}>
            <View style={s.scoreRow}>
                <View style={[s.ring, { borderColor: color }]}>
                    <Text style={[s.ringNum, { color }]}>{overall}</Text>
                    <Text style={s.ringSub}>/ 100</Text>
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[s.verdict, { color }]}>{verdict}</Text>
                    <Text style={s.subText}>Financial health score based on profit, margin, cash runway and activity</Text>
                </View>
            </View>

            <ScoreBar label="Profitability"  score={profitScore}   color={profitScore  >= 60 ? Colors.income : Colors.expense} />
            <ScoreBar label="Margin vs Target" score={marginScore} color={marginScore  >= 60 ? Colors.income : Colors.warning} />
            <ScoreBar label="Cash Position" score={cashScore} color={cashScore >= 60 ? Colors.income : cashScore > 0 ? Colors.warning : Colors.expense} />
            <ScoreBar label="30-Day Activity"  score={activityScore} color={activityScore >= 40 ? Colors.income : Colors.textMuted} />

            {runwayDays !== null && runwayDays < 30 && (
                <View style={s.cashWarning}>
                    <Text style={s.cashWarningText}>
                        ⚠ {runwayDays <= 0 ? `Cash is already ${Math.abs(runwayDays)} day${Math.abs(runwayDays) === 1 ? '' : 's'} past zero` : `Only ${runwayDays} day${runwayDays === 1 ? '' : 's'} of cash runway left`} — this is weighing the score down even though profit and margin look strong.
                    </Text>
                </View>
            )}

            <View style={s.summaryRow}>
                <View style={s.summaryCell}>
                    <Text style={s.summaryVal}>{currency}{income.toLocaleString('en', { maximumFractionDigits: 0 })}</Text>
                    <Text style={s.summaryKey}>Income</Text>
                </View>
                <View style={s.summaryCell}>
                    <Text style={[s.summaryVal, { color: profit >= 0 ? Colors.income : Colors.expense }]}>
                        {profit >= 0 ? '+' : ''}{currency}{profit.toLocaleString('en', { maximumFractionDigits: 0 })}
                    </Text>
                    <Text style={s.summaryKey}>Profit</Text>
                </View>
                <View style={s.summaryCell}>
                    <Text style={[s.summaryVal, { color: margin >= target ? Colors.income : Colors.warning }]}>{margin.toFixed(1)}%</Text>
                    <Text style={s.summaryKey}>Margin</Text>
                </View>
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    container:   { backgroundColor: Colors.surface, borderRadius: 16, padding: 20, gap: 14 },
    scoreRow:    { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 4 },
    ring:        { width: 80, height: 80, borderRadius: 40, borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
    ringNum:     { fontSize: 24, fontWeight: '900' },
    ringSub:     { fontSize: 10, color: Colors.textMuted },
    verdict:     { fontSize: 18, fontWeight: '800', marginBottom: 4 },
    subText:     { fontSize: 12, color: Colors.textMuted, lineHeight: 16 },
    cashWarning:     { backgroundColor: Colors.expense + '15', borderRadius: 8, padding: 10, marginTop: 4 },
    cashWarningText: { fontSize: 12, color: Colors.expense, fontWeight: '600', lineHeight: 17 },
    barRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
    barLabel:    { width: 110, fontSize: 12, color: Colors.textMuted },
    barTrack:    { flex: 1, height: 6, backgroundColor: Colors.border ?? '#1e293b', borderRadius: 3, overflow: 'hidden' },
    barFill:     { height: 6, borderRadius: 3 },
    barScore:    { width: 30, fontSize: 12, fontWeight: '700', textAlign: 'right' },
    summaryRow:  { flexDirection: 'row', marginTop: 4 },
    summaryCell: { flex: 1, alignItems: 'center' },
    summaryVal:  { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
    summaryKey:  { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
});
