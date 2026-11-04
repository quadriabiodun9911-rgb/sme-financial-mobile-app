import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { Shadow } from '../theme/tokens';
import { FinanceData } from '../types';
import Icon, { IconName } from './ui/Icon';

interface Props {
  finance: FinanceData;
  currency: string;
}

// Beyond this, the exact year count reads as spurious precision, not good
// news -- a business genuinely doesn't have meaningfully-verified visibility
// into "14.2 years" of runway. In practice a number this large almost always
// means recorded expenses are incomplete (not that burn is really near
// zero), so it's capped and flagged rather than printed at face value.
const PLAUSIBLE_RUNWAY_YEARS_CEILING = 10;

export default function StickyMetricsHeader({ finance, currency }: Props) {
  const runwayYears = (finance.runway || 0) / 365;
  const runwayImplausible = Number.isFinite(finance.runway || 0) && runwayYears > PLAUSIBLE_RUNWAY_YEARS_CEILING;

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
                ? (!Number.isFinite(metric.value)
                    ? (finance.cashBalance > 0 ? '5+yrs' : '—')
                    : runwayImplausible
                        ? `${PLAUSIBLE_RUNWAY_YEARS_CEILING}+yrs`
                        : metric.value >= 365
                            ? `${(metric.value / 365).toFixed(1)}yrs`
                            : `${Math.floor(metric.value)}d`)
                : `${currency}${Math.abs(metric.value).toLocaleString()}`}
            </Text>
            {metric.label === 'Runway' && runwayImplausible && (
              <Text style={styles.flagText}>Check expenses — this looks too good</Text>
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
