import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Colors } from '../theme/colors';

interface Pillar {
  id: string;
  emoji: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}

interface Props {
  pillars: Pillar[];
}

export default function PillarsNavigation({ pillars }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Business Pillars</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        contentContainerStyle={styles.scrollContent}>
        {pillars.map(pillar => (
          <TouchableOpacity
            key={pillar.id}
            style={styles.pillarCard}
            onPress={pillar.onPress}
            activeOpacity={0.7}>
            <Text style={styles.pillarEmoji}>{pillar.emoji}</Text>
            <Text style={styles.pillarTitle}>{pillar.title}</Text>
            <Text style={styles.pillarSubtitle}>{pillar.subtitle}</Text>
            <Text style={styles.pillarArrow}>→</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 16,
    backgroundColor: Colors.bg,
  },

  header: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },

  title: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },

  scrollContent: {
    paddingHorizontal: 16,
    gap: 10,
  },

  pillarCard: {
    width: 140,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.border,
  },

  pillarEmoji: {
    fontSize: 28,
    marginBottom: 8,
  },

  pillarTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 2,
  },

  pillarSubtitle: {
    fontSize: 9,
    color: Colors.textMuted,
    marginBottom: 8,
    lineHeight: 12,
  },

  pillarArrow: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '700',
  },
});
