import React from 'react';
import { Feather } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';

// A thin wrapper, not an abstraction over icon libraries in general — this
// app uses exactly one (Feather, chosen for its thin-line "modern SaaS"
// look, matching Linear/Stripe/Mercury rather than the bundled emoji this
// app used everywhere before). Centralizing the default size/color here
// means every call site doesn't have to repeat them, and swapping the
// underlying set later is a one-file change.
export type IconName = React.ComponentProps<typeof Feather>['name'];

interface IconProps {
    name: IconName;
    size?: number;
    color?: string;
}

export default function Icon({ name, size = 18, color = Colors.textPrimary }: IconProps) {
    return <Feather name={name} size={size} color={color} />;
}
