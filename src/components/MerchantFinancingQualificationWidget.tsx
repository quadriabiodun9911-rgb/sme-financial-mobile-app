import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, LinearGradient } from 'react-native';
import { Colors } from '../theme/colors';

interface QualificationWidgetProps {
    daysActive: number;
    monthlyRevenue: number;
    healthScore: number;
    currency: string;
    isQualified: boolean;
    hasActiveLoan: boolean;
    onPress: () => void;
}

export default function MerchantFinancingQualificationWidget({
    daysActive,
    monthlyRevenue,
    healthScore,
    currency,
    isQualified,
    hasActiveLoan,
    onPress,
}: QualificationWidgetProps) {
    // Calculate metrics
    const daysRemaining = Math.max(0, 90 - daysActive);
    const revenueRemaining = Math.max(0, 200000 - monthlyRevenue);
    const scoreRemaining = Math.max(0, 50 - healthScore);

    const requirementsProgress = useMemo(() => {
        const requirements = [
            { met: daysActive >= 90, label: 'Days Active', progress: Math.min(100, (daysActive / 90) * 100) },
            { met: monthlyRevenue >= 200000, label: 'Revenue', progress: Math.min(100, (monthlyRevenue / 200000) * 100) },
            { met: healthScore >= 50, label: 'Health Score', progress: Math.min(100, (healthScore / 50) * 100) },
        ];
        return requirements;
    }, [daysActive, monthlyRevenue, healthScore]);

    const completedRequirements = requirementsProgress.filter(r => r.met).length;
    const totalRequirements = requirementsProgress.length;
    const qualificationPercentage = (completedRequirements / totalRequirements) * 100;

    // Determine next milestone
    const nextMilestone = useMemo(() => {
        const milestones = [
            { value: daysRemaining, label: 'days until Account Age qualified', type: 'days', daysRemaining },
            { value: revenueRemaining, label: `${currency}${revenueRemaining.toLocaleString()} more revenue needed`, type: 'revenue', amount: revenueRemaining },
            { value: scoreRemaining, label: `${scoreRemaining} points to Financial Health qualification`, type: 'score', points: scoreRemaining },
        ].filter(m => m.value > 0);

        return milestones.length > 0 ? milestones[0] : null;
    }, [daysRemaining, revenueRemaining, scoreRemaining, currency]);

    // If already qualified or has active loan, show minimal widget
    if (isQualified && hasActiveLoan) {
        return null; // Don't show if they have an active loan
    }

    if (isQualified && !hasActiveLoan) {
        return (
            <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
                <LinearGradient
                    colors={[Colors.primary, '#2563eb']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={s.container}
                >
                    <View style={s.header}>
                        <Text style={s.icon}>✨</Text>
                        <View style={{ flex: 1 }}>
                            <Text style={s.title}>You're Pre-Qualified!</Text>
                            <Text style={s.subtitle}>Ready for merchant financing</Text>
                        </View>
                        <Text style={s.arrowIcon}>→</Text>
                    </View>
                    <TouchableOpacity style={s.ctaButton} onPress={onPress}>
                        <Text style={s.ctaText}>Apply Now</Text>
                    </TouchableOpacity>
                </LinearGradient>
            </TouchableOpacity>
        );
    }

    // Show progress for unqualified users
    return (
        <TouchableOpacity onPress={onPress} activeOpacity={0.9} style={s.container}>
            <View style={s.header}>
                <Text style={s.icon}>🎯</Text>
                <View style={{ flex: 1 }}>
                    <Text style={s.title}>Financing Qualification</Text>
                    <Text style={s.progressText}>
                        {completedRequirements}/{totalRequirements} requirements met
                    </Text>
                </View>
            </View>

            {/* Overall progress bar */}
            <View style={s.progressBarContainer}>
                <View
                    style={[
                        s.progressBar,
                        {
                            width: `${qualificationPercentage}%`,
                            backgroundColor: qualificationPercentage >= 100 ? Colors.income : Colors.primary,
                        },
                    ]}
                />
            </View>

            {/* Individual requirements */}
            <View style={s.requirementsGrid}>
                {requirementsProgress.map((req, idx) => (
                    <View key={idx} style={s.requirementItem}>
                        <View style={s.requirementHeader}>
                            <Text style={[s.requirementLabel, { color: req.met ? Colors.income : Colors.textSecondary }]}>
                                {req.met ? '✅' : '○'}
                            </Text>
                            <Text style={[s.requirementName, { color: req.met ? Colors.income : Colors.textSecondary }]}>
                                {req.label}
                            </Text>
                        </View>
                        <View style={s.requirementBar}>
                            <View
                                style={[
                                    s.requirementFill,
                                    {
                                        width: `${req.progress}%`,
                                        backgroundColor: req.met ? Colors.income : Colors.primary,
                                    },
                                ]}
                            />
                        </View>
                        <Text style={s.requirementPercent}>{Math.round(req.progress)}%</Text>
                    </View>
                ))}
            </View>

            {/* Next milestone */}
            {nextMilestone && (
                <View style={s.milestoneBox}>
                    <Text style={s.milestoneLabel}>Next milestone:</Text>
                    <Text style={s.milestoneValue}>{nextMilestone.label}</Text>
                </View>
            )}

            {/* Learn more link */}
            <Text style={s.learnMore}>Tap to see how to qualify →</Text>
        </TouchableOpacity>
    );
}

const s = StyleSheet.create({
    container: {
        backgroundColor: Colors.surface,
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        borderLeftWidth: 4,
        borderLeftColor: Colors.primary,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        gap: 12,
    },
    icon: {
        fontSize: 28,
    },
    arrowIcon: {
        fontSize: 20,
        color: Colors.textSecondary,
    },
    title: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.textPrimary,
        marginBottom: 2,
    },
    subtitle: {
        fontSize: 12,
        color: Colors.textSecondary,
    },
    progressText: {
        fontSize: 12,
        color: Colors.textSecondary,
    },
    progressBarContainer: {
        height: 6,
        backgroundColor: Colors.muted,
        borderRadius: 3,
        overflow: 'hidden',
        marginBottom: 12,
    },
    progressBar: {
        height: 6,
        borderRadius: 3,
        transition: 'width 0.3s ease',
    },
    requirementsGrid: {
        gap: 10,
        marginBottom: 12,
    },
    requirementItem: {
        marginBottom: 8,
    },
    requirementHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 4,
    },
    requirementLabel: {
        fontSize: 12,
    },
    requirementName: {
        fontSize: 12,
        fontWeight: '500',
        flex: 1,
    },
    requirementBar: {
        height: 4,
        backgroundColor: Colors.muted,
        borderRadius: 2,
        overflow: 'hidden',
    },
    requirementFill: {
        height: 4,
        borderRadius: 2,
    },
    requirementPercent: {
        fontSize: 10,
        color: Colors.textMuted,
        marginTop: 2,
    },
    milestoneBox: {
        backgroundColor: Colors.muted + '40',
        padding: 10,
        borderRadius: 8,
        borderLeftWidth: 3,
        borderLeftColor: Colors.primary,
        marginBottom: 12,
    },
    milestoneLabel: {
        fontSize: 11,
        color: Colors.textSecondary,
        marginBottom: 2,
    },
    milestoneValue: {
        fontSize: 13,
        fontWeight: '600',
        color: Colors.textPrimary,
    },
    learnMore: {
        fontSize: 11,
        color: Colors.primary,
        fontWeight: '500',
    },
    ctaButton: {
        backgroundColor: Colors.textPrimary,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 12,
    },
    ctaText: {
        color: Colors.primary,
        fontWeight: '600',
        fontSize: 14,
    },
});
