import React, { useRef } from 'react';
import { Animated, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';

interface Props {
    children: React.ReactNode;
    onPress?: (e?: any) => void;
    disabled?: boolean;
    style?: StyleProp<ViewStyle>;
    activeOpacity?: number;
}

// A pressable that gives real tactile feedback -- a slight scale-down on
// press, springing back on release -- instead of TouchableOpacity's flat
// opacity dim. Built on RN's core Animated API (same one
// SkeletonLoader.tsx/RetentionNudges.tsx already use elsewhere in this
// app), not a new dependency. Originated in QuickHealthCheckWidget.tsx's
// landing-page redesign; pulled out here once a second screen needed the
// same micro-interaction, matching this app's existing pattern of shared
// UI primitives (Icon, RadialGauge, TrendSparkline all live in
// src/components/).
export default function PressScale({ children, onPress, disabled, style, activeOpacity = 0.9 }: Props) {
    const scale = useRef(new Animated.Value(1)).current;
    const animateTo = (v: number) => Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
    return (
        <Animated.View style={{ transform: [{ scale }] }}>
            <TouchableOpacity
                activeOpacity={activeOpacity}
                onPress={onPress}
                disabled={disabled}
                onPressIn={() => !disabled && animateTo(0.97)}
                onPressOut={() => animateTo(1)}
                style={style}
            >
                {children}
            </TouchableOpacity>
        </Animated.View>
    );
}
