import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';

interface PillarSectionProps {
    icon?: string;
    title: string;
    children: React.ReactNode;
    actionLabel?: string;
    onAction?: () => void;
}

export default function PillarSection({ icon, title, children, actionLabel, onAction }: PillarSectionProps) {
    return (
        <View style={styles.wrap}>
            <View style={styles.header}>
                <Text style={styles.title}>{icon ? `${icon} ` : ''}{title}</Text>
                {actionLabel && onAction ? (
                    <TouchableOpacity onPress={onAction}>
                        <Text style={styles.action}>{actionLabel} ›</Text>
                    </TouchableOpacity>
                ) : null}
            </View>
            <View style={styles.grid}>
                {children}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        marginBottom: 20,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    title: {
        fontSize: 13,
        fontWeight: '800',
        color: Colors.textPrimary,
        letterSpacing: 0.5,
    },
    action: {
        fontSize: 12,
        fontWeight: '600',
        color: Colors.primary,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
});
