import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';

const MIN_TRANSACTIONS_FOR_RELIABLE_METRICS = 5;

interface Props {
    transactionCount: number;
    label?: string;
}

// Growth/lending/credit metrics extrapolate off whatever transactions exist,
// including very few — with too little history the numbers (0% growth, an
// inflated credit score, etc.) look precise but aren't meaningful yet. This
// tells the user that plainly instead of letting them read a degenerate
// number as a real signal.
export default function LowDataNotice({ transactionCount, label = 'these figures' }: Props) {
    if (transactionCount >= MIN_TRANSACTIONS_FOR_RELIABLE_METRICS) return null;
    return (
        <View style={s.box}>
            <Text style={s.text}>
                ⚠️ Only {transactionCount} transaction{transactionCount === 1 ? '' : 's'} recorded so far — {label} will
                get more accurate as you log more of your business activity.
            </Text>
        </View>
    );
}

const s = StyleSheet.create({
    box: {
        backgroundColor: Colors.warning + '18',
        borderWidth: 1,
        borderColor: Colors.warning + '55',
        borderRadius: 10,
        padding: 12,
        marginBottom: 16,
    },
    text: { color: Colors.textPrimary, fontSize: 12, lineHeight: 18 },
});
