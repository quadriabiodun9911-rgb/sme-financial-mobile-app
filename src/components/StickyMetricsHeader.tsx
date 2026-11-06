import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { Shadow } from '../theme/tokens';
import { FinanceData } from '../types';
import { describeRunwayForDisplay } from '../utils/cashRunway';
import Icon, { IconName } from './ui/Icon';

interface Props {
  finance: FinanceData;
  currency: string;
  // True when financialDiagnosisEngine's diagnoseRecordKeeping found a real
  // record-keeping gap (months with income but no expenses logged at all,
  // or an implausibly high margin for the industry) -- the same signal
  // already shown as a diagnosis card elsewhere, surfaced here too since
  // Profit is the single most load-bearing number on this screen and the
  // one a gap like this most directly overstates. Never a second,
  // independently-computed completeness check.
  profitMayBeIncomplete?: boolean;
}

export default function StickyMetricsHeader({ finance, currency, profitMayBeIncomplete }: Props) {
  // Same shared cap/format DashboardScreen's own Vital Signs gauge uses
  // (cashRunway.ts) -- a long runway reads the same way everywhere it's
  // shown, capped at 10 years and flagged rather than printed as spurious
  // precision like "261.0yrs", which almost always means recorded expenses
  // are incomplete, not that burn is really near zero.
  const runwayDisplay = describeRunwayForDisplay(finance.runway ?? null, finance.cashBalance > 0);
  const runwayImplausible = runwayDisplay.implausible;

  const metrics: { label: string; value: number; color: string; icon: IconName }[] = [
    {
      label: 'Profit',
      value: finance.profit,
      color: finance.profit >= 0 ? Colors.income : Colors.expense,
      icon: 'bar-chart-2',
    },
    {
      label: 'Cash',
      value: finance.cashBalance,
      color: finance.cashBalance >= 0 ? Colors.asset : Colors.expense,
      icon: 'dollar-sign',
    },
    {
      label: 'Runway',
      value: finance.runway || 0,
      // Infinite runway (no burn recorded) only reads as good news when
      // there's actual cash it's protecting -- at ₦0 cash there's nothing
      // to be reassured about, just no data yet, so it's shown muted
      // rather than the same green as a real long runway. An implausible
      // but finite runway gets the same muted, "check this" treatment --
      // it isn't confidently good news either.
      color: !Number.isFinite(finance.runway || 0) || runwayImplausible
        ? (finance.cashBalance > 0 ? Colors.income : Colors.textMuted)
        : (finance.runway || 0) > 30 ? Colors.income : (finance.runway || 0) > 7 ? Colors.warning : Colors.expense,
      icon: 'calendar',
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.metricsRow}>
        {metrics.map((metric, idx) => (
          <View key={idx} style={styles.metricCard}>
            <View style={styles.icon}><Icon name={metric.icon} size={18} color={Colors.textMuted} /></View>
            <Text style={styles.metricLabel}>{metric.label}</Text>
            <Text style={[styles.metricValue, { color: metric.color }]}>
              {metric.label === 'Runway'
                ? `${runwayDisplay.value}${runwayDisplay.unit === 'days' ? 'd' : runwayDisplay.unit}`
                : `${currency}${Math.abs(metric.value).toLocaleString()}`}
            </Text>
            {metric.label === 'Runway' && runwayImplausible && (
              <Text style={styles.flagText}>Check expenses — this looks too good</Text>
            )}
            {metric.label === 'Profit' && profitMayBeIncomplete && (
              <Text style={styles.flagText}>Some expenses may be missing</Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.card,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  metricCard: {
    flex: 1,
    backgroundColor: Colors.bg,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  icon: {
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '500',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  flagText: {
    fontSize: 8.5,
    color: Colors.textMuted,
    marginTop: 3,
    textAlign: 'center',
  },
});
