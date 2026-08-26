import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import { trackAhaMomentFeedback } from '../utils/analytics';

interface Props {
    // Identifies which analysis-reveal moment is asking, so responses from
    // different points in the app (import completion, a first Dashboard
    // visit, etc.) stay distinguishable in the underlying event stream --
    // see trackAhaMomentFeedback.
    source: string;
}

type Stage = 'ask' | 'discovery-prompt' | 'done';

// "Did Quad360 show you something you didn't know about your business?" --
// the single measurement this product should care about more than signup
// count, since the whole pitch is understanding, not just recording. Answers
// go straight to analytics (trackAhaMomentFeedback); nothing is stored
// locally, and there is no wrong answer -- both paths end the same way, a
// quiet thank-you, not a nag to keep answering.
export default function AhaMomentFeedback({ source }: Props) {
    const [stage, setStage] = useState<Stage>('ask');
    const [discovery, setDiscovery] = useState('');

    const answer = (discoveredSomething: boolean) => {
        if (discoveredSomething) {
            setStage('discovery-prompt');
            return;
        }
        trackAhaMomentFeedback(source, false);
        setStage('done');
    };

    const submitDiscovery = () => {
        trackAhaMomentFeedback(source, true, discovery.trim() || undefined);
        setStage('done');
    };

    if (stage === 'done') {
        return (
            <View style={styles.card}>
                <Text style={styles.thanks}>Thanks — that helps us improve what Quad360 shows you.</Text>
            </View>
        );
    }

    if (stage === 'discovery-prompt') {
        return (
            <View style={styles.card}>
                <Text style={styles.question}>What did you discover?</Text>
                <TextInput
                    style={styles.input}
                    value={discovery}
                    onChangeText={setDiscovery}
                    placeholder="e.g. My costs are growing faster than my sales"
                    placeholderTextColor={Colors.textMuted}
                    multiline
                />
                <TouchableOpacity style={styles.submitBtn} onPress={submitDiscovery}>
                    <Text style={styles.submitBtnText}>Send</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={submitDiscovery}>
                    <Text style={styles.skipLink}>Skip</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.card}>
            <Text style={styles.question}>Did Quad360 show you something you didn't know about your business?</Text>
            <View style={styles.answerRow}>
                <TouchableOpacity style={[styles.answerBtn, styles.yesBtn]} onPress={() => answer(true)}>
                    <Text style={styles.answerBtnText}>Yes</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.answerBtn, styles.noBtn]} onPress={() => answer(false)}>
                    <Text style={[styles.answerBtnText, { color: Colors.textSecondary }]}>Not really</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1,
        borderColor: Colors.border, padding: Spacing.md, marginTop: Spacing.lg,
        width: '100%', maxWidth: 340, ...Shadow.sm,
    },
    question: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center', marginBottom: Spacing.sm },
    answerRow: { flexDirection: 'row', gap: Spacing.sm },
    answerBtn: { flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.md, alignItems: 'center', borderWidth: 1 },
    yesBtn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    noBtn: { backgroundColor: 'transparent', borderColor: Colors.border },
    answerBtnText: { fontWeight: '700', fontSize: 13, color: '#fff' },
    input: {
        borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
        padding: Spacing.sm, color: Colors.textPrimary, fontSize: 13,
        minHeight: 60, textAlignVertical: 'top', marginBottom: Spacing.sm,
    },
    submitBtn: { backgroundColor: Colors.primary, paddingVertical: Spacing.sm, borderRadius: Radius.md, alignItems: 'center' },
    submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
    skipLink: { color: Colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: Spacing.sm },
    thanks: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center' },
});
