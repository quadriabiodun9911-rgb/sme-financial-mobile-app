import React from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { colors, bandColor, pillarColorForScore } from '../theme/colors';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';
import ProgressBar from '../components/ProgressBar';
import { DocumentChecklist } from '../services/creditScore';

const DOC_LABELS: Record<keyof DocumentChecklist, string> = {
    hasTaxFilings: 'Tax filings',
    hasBankStatements: 'Bank statements',
    hasBusinessRegistration: 'Business registration (CAC)',
    hasFinancialStatements: 'Financial statements',
};

export default function CreditScoreScreen() {
    const { creditResult, documentChecklist, toggleDocument } = useApp();

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scroll}>
                <Text style={styles.title}>Credit Readiness Score</Text>
                <Text style={styles.subtitle}>What lenders would see if you shared your report today</Text>

                <Card style={styles.scoreCard}>
                    <Text style={[styles.scoreValue, { color: bandColor(creditResult.band) }]}>{creditResult.overallScore}</Text>
                    <Text style={[styles.scoreBand, { color: bandColor(creditResult.band) }]}>{creditResult.band}</Text>
                    <ProgressBar value={creditResult.overallScore} color={bandColor(creditResult.band)} />
                </Card>

                <Text style={styles.sectionTitle}>The 5 pillars</Text>
                {creditResult.pillars.map((pillar) => (
                    <Card key={pillar.key} style={styles.pillarCard}>
                        <View style={styles.pillarHeader}>
                            <Text style={styles.pillarLabel}>{pillar.label}</Text>
                            <Text style={[styles.pillarScore, { color: pillarColorForScore(pillar.score) }]}>{pillar.score}</Text>
                        </View>
                        <ProgressBar value={pillar.score} color={pillarColorForScore(pillar.score)} />
                        {pillar.issues.length > 0 && (
                            <View style={styles.issueList}>
                                {pillar.recommendations.map((rec, i) => (
                                    <Text key={i} style={styles.issueText}>• {rec}</Text>
                                ))}
                            </View>
                        )}
                    </Card>
                ))}

                <Text style={styles.sectionTitle}>Document checklist</Text>
                <Card>
                    {(Object.keys(DOC_LABELS) as Array<keyof DocumentChecklist>).map((key, idx) => (
                        <View key={key} style={[styles.docRow, idx > 0 ? styles.docRowBorder : null]}>
                            <Text style={styles.docLabel}>{DOC_LABELS[key]}</Text>
                            <Switch
                                value={documentChecklist[key]}
                                onValueChange={() => toggleDocument(key)}
                                trackColor={{ true: colors.primary, false: colors.surfaceAlt }}
                                thumbColor={colors.white}
                            />
                        </View>
                    ))}
                </Card>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { padding: 20, paddingBottom: 40, gap: 14 },
    title: { color: colors.text, fontSize: 22, fontWeight: '700' },
    subtitle: { color: colors.textMuted, fontSize: 12, marginBottom: 4 },
    scoreCard: { alignItems: 'center', gap: 10, paddingVertical: 24 },
    scoreValue: { fontSize: 48, fontWeight: '800' },
    scoreBand: { fontSize: 14, fontWeight: '700', marginBottom: 6 },
    sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 8 },
    pillarCard: { gap: 10 },
    pillarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    pillarLabel: { color: colors.text, fontSize: 14, fontWeight: '600' },
    pillarScore: { fontSize: 16, fontWeight: '700' },
    issueList: { gap: 4 },
    issueText: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
    docRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
    docRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
    docLabel: { color: colors.text, fontSize: 13 },
});
