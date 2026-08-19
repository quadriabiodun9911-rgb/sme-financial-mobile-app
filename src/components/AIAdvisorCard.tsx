import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing, Type } from '../theme/tokens';
import Icon from './ui/Icon';
import { askAdvisor, AdvisorContext } from '../utils/aiAdvisor';

const SUGGESTIONS = [
    'What should I focus on this week?',
    "Can I afford to hire right now?",
    'Why is my cash position where it is?',
];

/**
 * A genuine LLM-backed Q&A box, grounded in the same real, already-computed
 * `context` the caller builds via buildAdvisorContext -- the backend refuses
 * to answer from anything else (see backend/routes/advisor.js). One answer
 * is shown at a time (not a full chat thread) — this is a "grounded lookup"
 * pattern, not a general chatbot.
 */
export default function AIAdvisorCard({ context }: { context: AdvisorContext }) {
    const [question, setQuestion] = useState('');
    const [asked, setAsked] = useState<string | null>(null);
    const [answer, setAnswer] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const submit = async (q: string) => {
        const trimmed = q.trim();
        if (!trimmed || loading) return;
        setLoading(true);
        setError(null);
        setAnswer(null);
        setAsked(trimmed);
        try {
            const res = await askAdvisor(trimmed, context);
            setAnswer(res);
        } catch (err: any) {
            setError(err?.message || 'Could not reach the AI Advisor.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={s.card}>
            <View style={s.titleRow}>
                <Icon name="message-circle" size={16} color={Colors.primary} />
                <Text style={s.title}>Ask Your AI Advisor</Text>
            </View>
            <Text style={s.sub}>Answers from your own real numbers — nothing invented.</Text>

            <View style={s.inputRow}>
                <TextInput
                    style={s.input}
                    value={question}
                    onChangeText={setQuestion}
                    placeholder="e.g. Can I afford to hire right now?"
                    placeholderTextColor={Colors.textMuted}
                    onSubmitEditing={() => submit(question)}
                    returnKeyType="send"
                />
                <TouchableOpacity style={s.sendBtn} onPress={() => submit(question)} disabled={loading || !question.trim()}>
                    {loading ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="arrow-up" size={16} color="#fff" />}
                </TouchableOpacity>
            </View>

            {!asked && (
                <View style={s.suggestionRow}>
                    {SUGGESTIONS.map(sugg => (
                        <TouchableOpacity key={sugg} style={s.chip} onPress={() => { setQuestion(sugg); submit(sugg); }}>
                            <Text style={s.chipText}>{sugg}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            {asked && (
                <View style={s.answerBox}>
                    <Text style={s.askedText}>"{asked}"</Text>
                    {loading && <ActivityIndicator size="small" color={Colors.primary} style={s.loadingSpinner} />}
                    {!loading && error && <Text style={s.errorText}>{error}</Text>}
                    {!loading && answer && <Text style={s.answerText}>{answer}</Text>}
                </View>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md, ...Shadow.sm },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: 2 },
    title: { ...Type.heading, color: Colors.textPrimary },
    sub: { fontSize: 12, color: Colors.textMuted, marginBottom: Spacing.md },

    inputRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
    input: { flex: 1, backgroundColor: Colors.bg, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: 10, fontSize: 13, color: Colors.textPrimary },
    sendBtn: { width: 38, height: 38, borderRadius: Radius.md, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },

    suggestionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
    chip: { paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.pill, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border },
    chipText: { fontSize: 11.5, color: Colors.textSecondary, fontWeight: '600' },

    answerBox: { marginTop: Spacing.md, backgroundColor: Colors.bg, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
    askedText: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic', marginBottom: Spacing.sm },
    loadingSpinner: { marginTop: Spacing.xs, alignSelf: 'flex-start' },
    errorText: { fontSize: 13, color: Colors.expense, lineHeight: 19 },
    answerText: { fontSize: 13.5, color: Colors.textPrimary, lineHeight: 20 },
});
