import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import Icon from './ui/Icon';
import Header from './Header';
import FooterNav from './FooterNav';
import { getSubscriptionStatus, isProActive, SubscriptionState } from '../utils/subscription';
import { Config } from '../config';

interface Props {
    feature: string;      // e.g. "Credit-Worthiness"
    description: string;  // one-line pitch for what's behind the gate
    icon?: string;         // Feather icon name shown above the pitch
    children: React.ReactNode;
}

// Wraps an entire Pro-tier screen. Checks status itself (not threaded
// through AppContext -- same lightweight, screen-local pattern
// paymentSecrets.ts's getConnectedProviders already uses via
// PaymentLinkScreen, rather than growing OptimizedContexts.tsx's already
// very large state machine for a value only a handful of screens need).
export default function ProGate({ feature, description, icon = 'lock', children }: Props) {
    const { navigate, isDemoMode } = useApp();
    const [state, setState] = useState<SubscriptionState | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Gate is off app-wide (see config.ts) -- still a testing-phase
        // app with no deployed checkout, so nothing to check. Guest Mode
        // always sees the real thing too, independent of the gate being on
        // or off -- someone evaluating Quad360 needs to actually see what
        // Pro looks like, not hit a paywall before ever seeing real content
        // (matches Guest Mode's existing "sample data, not saved" framing).
        // Skipping the network call in both cases also means neither
        // depends on subscription-manage actually being reachable.
        if (!Config.PRO_GATES_ENABLED || isDemoMode) { setLoading(false); return; }
        let cancelled = false;
        getSubscriptionStatus().then(s => {
            if (!cancelled) { setState(s); setLoading(false); }
        });
        return () => { cancelled = true; };
    }, [isDemoMode]);

    // While the status check is in flight, render nothing rather than
    // either extreme: showing the paywall would flash it at a Pro user on
    // every visit, but showing children would flash paid content at a free
    // user for a moment -- the actual gate, not just a UI glitch, so it has
    // to fail closed here, not open.
    if (loading) return null;

    if (!Config.PRO_GATES_ENABLED || isDemoMode || isProActive(state)) {
        return <>{children}</>;
    }

    return (
        <View style={s.safe}>
            <Header />
            <ScrollView style={s.scroll} contentContainerStyle={s.body}>
                <View style={s.card}>
                    <View style={s.iconWrap}>
                        <Icon name={icon as any} size={26} color={Colors.primary} />
                    </View>
                    <Text style={s.title}>{feature} is a Quad360 Pro feature</Text>
                    <Text style={s.desc}>{description}</Text>
                    <TouchableOpacity style={s.cta} onPress={() => navigate('upgrade')}>
                        <Text style={s.ctaText}>Upgrade to Pro — ₦2,999/mo</Text>
                        <Icon name="arrow-right" size={16} color="#fff" />
                    </TouchableOpacity>
                    <Text style={s.note}>Bookkeeping, quick-capture, invoices, inventory and payroll stay free — always.</Text>
                </View>
            </ScrollView>
            <FooterNav />
        </View>
    );
}

const s = StyleSheet.create({
    safe:   { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    body:   { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg, paddingBottom: 100 },
    card:   {
        backgroundColor: Colors.surface, borderRadius: 16, padding: Spacing.xl,
        alignItems: 'center', maxWidth: 380, width: '100%',
        borderWidth: 1, borderColor: Colors.border, ...Shadow.md,
    },
    iconWrap: {
        width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primary + '18',
        alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md,
    },
    title: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center', marginBottom: Spacing.sm },
    desc:  { fontSize: 13.5, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: Spacing.lg },
    cta:   {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        backgroundColor: Colors.primary, paddingHorizontal: Spacing.lg, paddingVertical: 13,
        borderRadius: Radius.md, ...Shadow.sm,
    },
    ctaText: { color: '#fff', fontWeight: '800', fontSize: 14.5 },
    note:  { fontSize: 11.5, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.lg, lineHeight: 17 },
});
