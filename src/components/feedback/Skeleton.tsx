import React, { useEffect } from 'react';
import { View, Animated, StyleSheet, ViewStyle } from 'react-native';
import { Colors } from '../../theme/colors';

interface SkeletonProps {
  width?: string | number;
  height?: number;
  borderRadius?: number;
  count?: number;
  style?: ViewStyle;
  testID?: string;
  animated?: boolean;
}

export const Skeleton = ({
  width = '100%',
  height = 16,
  borderRadius = 4,
  count = 1,
  style,
  testID,
  animated = true,
}: SkeletonProps) => {
  const opacity = React.useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    if (!animated) return;

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [animated, opacity]);

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      aria-busy="true"
    >
      {Array.from({ length: count }).map((_, idx) => (
        <Animated.View
          key={idx}
          style={[
            styles.skeleton,
            {
              width,
              height,
              borderRadius,
              opacity: animated ? opacity : 1,
            },
            style,
          ]}
        />
      ))}
    </View>
  );
};

Skeleton.displayName = 'Skeleton';

interface SkeletonCardProps {
  lines?: number;
  style?: ViewStyle;
  testID?: string;
}

export const SkeletonCard = ({
  lines = 3,
  style,
  testID,
}: SkeletonCardProps) => {
  return (
    <View style={[styles.card, style]} testID={testID}>
      <Skeleton height={20} borderRadius={8} style={styles.title} />
      {Array.from({ length: lines }).map((_, idx) => (
        <Skeleton
          key={idx}
          height={14}
          borderRadius={4}
          style={[styles.line, { width: idx === lines - 1 ? '70%' : '100%' }]}
        />
      ))}
    </View>
  );
};

SkeletonCard.displayName = 'SkeletonCard';

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: Colors.bg,
    marginBottom: 8,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  title: {
    marginBottom: 12,
    height: 20,
  },
  line: {
    marginBottom: 8,
  },
});
