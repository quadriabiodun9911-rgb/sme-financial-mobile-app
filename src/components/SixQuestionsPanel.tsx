import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { buildSixQuestions, QuestionStatus } from '../utils/sixQuestions';

const STATUS_COLOR: Record<QuestionStatus, string> = {
    good: Colors.income, warning: Colors.warning, danger: Colors.expense, unknown: Colors.textSecondary,
};

// The app's organizing framework, made ambient instead of something a user
// has to go find: six questions every owner actually asks themselves,
// each answered live from real data, right where they land every time
// they open the app.
export default function SixQuestionsPanel() {
    const { transactions, loans, assets, invoices, inventory, finance, settings, user, setCurrentScreen } = useApp();
    const { currency } = settings;

    const { questions } = useMemo(
        () => buildSixQuestions(transactions, loans, assets, invoices, inventory, finance, user, currency),
        [transactions, loans, assets, invoices, inventory, finance, user, currency],
    );

    return (
        <View style={s.wrap}>
            <Text style={s.title}>How's the business doing?</Text>
            {questions.map(q => (
                <TouchableOpacity
                    key={q.id}
                    style={[s.card, { borderLeftColor: STATUS_COLOR[q.status] }]}
                    onPress={() => setCurrentScreen(q.screen)}
                    activeOpacity={0.75}
                >
                    <Text style={s.emoji}>{q.emoji}</Text>
                    <View style={{ flex: 1 }}>
                        <Text style={s.question}>{q.question}</Text>
                        <Text style={[s.answer, { color: STATUS_COLOR[q.status] }]}>{q.answer}</Text>
                    </View>
                    <Text style={s.arrow}>→</Text>
                </TouchableOpacity>
            ))}
        </View>
    );
}

const s = StyleSheet.create({
    wrap: { marginBottom: 14 },
    title: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 },
    card: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface,
        borderRadius: 12, padding: 12, marginBottom: 8, borderLeftWidth: 3, borderWidth: 1, borderColor: Colors.border,
    },
    emoji: { fontSize: 20, marginRight: 10 },
    question: { fontSize: 12.5, color: Colors.textSecondary, marginBottom: 2 },
    answer: { fontSize: 13.5, fontWeight: '700' },
    arrow: { fontSize: 16, color: Colors.textSecondary, marginLeft: 6 },
});
