import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Modal, ScrollView } from 'react-native';
import { Colors } from '../theme/colors';
import { ForecastAlert } from '../types/forecast';

interface Props {
  alerts: ForecastAlert[];
  currency?: string;
  onAlertPress?: (alert: ForecastAlert) => void;
  onDismiss?: (alertId: string) => void;
}

export default function AlertsWidget({ alerts, currency = '₦', onAlertPress, onDismiss }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<ForecastAlert | null>(null);

  const criticalCount = alerts.filter(a => a.priority === 'high').length;
  const warningCount = alerts.filter(a => a.priority === 'medium').length;

  const getAlertBgColor = (priority: string): string => {
    switch (priority) {
      case 'high':
        return 'rgba(239, 68, 68, 0.1)';
      case 'medium':
        return 'rgba(245, 158, 11, 0.1)';
      case 'low':
        return 'rgba(59, 130, 246, 0.1)';
      default:
        return Colors.card;
    }
  };

  const getAlertBorderColor = (priority: string): string => {
    switch (priority) {
      case 'high':
        return '#ef4444';
      case 'medium':
        return '#f59e0b';
      case 'low':
        return '#3b82f6';
      default:
        return Colors.border;
    }
  };

  const handleDismiss = (alertId: string) => {
    if (onDismiss) {
      onDismiss(alertId);
    }
  };

  return (
    <>
      {/* Bell Icon Header */}
      <TouchableOpacity
        style={styles.bellButton}
        onPress={() => setShowModal(true)}
        activeOpacity={0.7}>
        <Text style={styles.bellIcon}>🔔</Text>
        {alerts.length > 0 && (
          <View style={[styles.badge, criticalCount > 0 && styles.badgeCritical]}>
            <Text style={styles.badgeText}>{alerts.length}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Alerts Modal */}
      <Modal visible={showModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🔔 Alerts</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Alert Stats */}
            {alerts.length > 0 && (
              <View style={styles.statsBar}>
                {criticalCount > 0 && (
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>🔴 Critical</Text>
                    <Text style={[styles.statValue, { color: '#ef4444' }]}>{criticalCount}</Text>
                  </View>
                )}
                {warningCount > 0 && (
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>🟡 Warning</Text>
                    <Text style={[styles.statValue, { color: '#f59e0b' }]}>{warningCount}</Text>
                  </View>
                )}
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>📊 Total</Text>
                  <Text style={styles.statValue}>{alerts.length}</Text>
                </View>
              </View>
            )}

            {/* Alerts List */}
            {alerts.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>✅</Text>
                <Text style={styles.emptyText}>All Clear!</Text>
                <Text style={styles.emptySubtext}>No active alerts. Your finances look good.</Text>
              </View>
            ) : (
              <FlatList
                data={alerts}
                keyExtractor={item => item.id}
                scrollEnabled={false}
                renderItem={({ item: alert }) => (
                  <TouchableOpacity
                    style={[
                      styles.alertItem,
                      {
                        backgroundColor: getAlertBgColor(alert.priority),
                        borderLeftColor: getAlertBorderColor(alert.priority),
                      },
                    ]}
                    onPress={() => {
                      setSelectedAlert(alert);
                      if (onAlertPress) onAlertPress(alert);
                    }}
                    activeOpacity={0.6}>
                    <View style={styles.alertContent}>
                      <Text style={styles.alertTitle}>{alert.title}</Text>
                      <Text style={styles.alertDescription}>{alert.description}</Text>

                      {alert.affectedDate && (
                        <Text style={styles.alertDate}>📅 {alert.affectedDate}</Text>
                      )}

                      {alert.amount !== undefined && (
                        <Text style={styles.alertAmount}>
                          Amount: {currency}{Math.round(alert.amount).toLocaleString()}
                        </Text>
                      )}

                      {alert.recommendations && alert.recommendations.length > 0 && (
                        <View style={styles.recommendationsBox}>
                          <Text style={styles.recommendationsTitle}>Actions:</Text>
                          {alert.recommendations.slice(0, 2).map((rec, idx) => (
                            <Text key={idx} style={styles.recommendation}>
                              • {rec}
                            </Text>
                          ))}
                        </View>
                      )}
                    </View>

                    <TouchableOpacity
                      style={styles.dismissBtn}
                      onPress={() => handleDismiss(alert.id)}>
                      <Text style={styles.dismissBtnText}>✕</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                )}
              />
            )}

            {/* Footer */}
            <TouchableOpacity
              style={styles.closeFullButton}
              onPress={() => setShowModal(false)}>
              <Text style={styles.closeFullButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Alert Detail Modal */}
      {selectedAlert && (
        <Modal visible={selectedAlert !== null} animationType="slide" transparent={true}>
          <View style={styles.detailOverlay}>
            <View style={styles.detailContent}>
              <TouchableOpacity
                style={styles.detailCloseBtn}
                onPress={() => setSelectedAlert(null)}>
                <Text style={styles.detailCloseText}>← Back</Text>
              </TouchableOpacity>

              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.detailHeader}>
                  <Text style={styles.detailTitle}>{selectedAlert.title}</Text>
                  <View
                    style={[
                      styles.priorityBadge,
                      {
                        backgroundColor: getAlertBgColor(selectedAlert.priority),
                        borderColor: getAlertBorderColor(selectedAlert.priority),
                      },
                    ]}>
                    <Text style={styles.priorityText}>{selectedAlert.priority.toUpperCase()}</Text>
                  </View>
                </View>

                <Text style={styles.detailDescription}>{selectedAlert.description}</Text>

                {selectedAlert.amount !== undefined && (
                  <View style={styles.detailField}>
                    <Text style={styles.detailLabel}>Amount</Text>
                    <Text style={styles.detailValue}>
                      {currency}{Math.round(selectedAlert.amount).toLocaleString()}
                    </Text>
                  </View>
                )}

                {selectedAlert.affectedDate && (
                  <View style={styles.detailField}>
                    <Text style={styles.detailLabel}>Affected Date</Text>
                    <Text style={styles.detailValue}>{selectedAlert.affectedDate}</Text>
                  </View>
                )}

                {selectedAlert.recommendations && selectedAlert.recommendations.length > 0 && (
                  <View style={styles.detailRecommendations}>
                    <Text style={styles.detailRecommendationTitle}>Recommended Actions</Text>
                    {selectedAlert.recommendations.map((rec, idx) => (
                      <View key={idx} style={styles.recommendationItem}>
                        <Text style={styles.recommendationNumber}>{idx + 1}</Text>
                        <Text style={styles.recommendationText}>{rec}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <Text style={styles.detailTimestamp}>
                  Created: {new Date(selectedAlert.createdAt).toLocaleString()}
                </Text>
              </ScrollView>

              <TouchableOpacity
                style={styles.detailDismissBtn}
                onPress={() => {
                  handleDismiss(selectedAlert.id);
                  setSelectedAlert(null);
                }}>
                <Text style={styles.detailDismissBtnText}>Dismiss Alert</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  bellButton: {
    position: 'relative',
    padding: 8,
  },
  bellIcon: {
    fontSize: 24,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#f59e0b',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeCritical: {
    backgroundColor: '#ef4444',
  },
  badgeText: {
    color: Colors.textPrimary,
    fontSize: 10,
    fontWeight: '700',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    flex: 1,
    backgroundColor: Colors.bg,
    marginTop: 40,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
  },

  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  closeButton: {
    fontSize: 24,
    color: Colors.textMuted,
  },

  statsBar: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  statItem: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },

  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
  },

  alertItem: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderLeftWidth: 4,
    alignItems: 'flex-start',
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  alertDescription: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
    marginBottom: 6,
  },
  alertDate: {
    fontSize: 10,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  alertAmount: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 6,
  },

  recommendationsBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginTop: 6,
  },
  recommendationsTitle: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textMuted,
    marginBottom: 4,
  },
  recommendation: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginBottom: 2,
  },

  dismissBtn: {
    padding: 4,
  },
  dismissBtnText: {
    fontSize: 16,
    color: Colors.textMuted,
  },

  closeFullButton: {
    marginHorizontal: 16,
    marginVertical: 16,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeFullButtonText: {
    color: Colors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },

  // Detail Modal
  detailOverlay: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  detailContent: {
    flex: 1,
    paddingTop: 16,
  },
  detailCloseBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  detailCloseText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },

  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  detailTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  priorityBadge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textPrimary,
  },

  detailDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
    paddingHorizontal: 16,
    marginBottom: 16,
  },

  detailField: {
    paddingHorizontal: 16,
    marginBottom: 12,
    backgroundColor: Colors.card,
    borderRadius: 8,
    padding: 12,
  },
  detailLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },

  detailRecommendations: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  detailRecommendationTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  recommendationItem: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  recommendationNumber: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
    marginRight: 8,
    width: 20,
  },
  recommendationText: {
    flex: 1,
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
  },

  detailTimestamp: {
    fontSize: 10,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },

  detailDismissBtn: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: '#ef4444',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  detailDismissBtnText: {
    color: Colors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
});
