/**
 * DRAFT placeholder, not a finished legal document. Consent-tracking (see
 * recordConsent in storage.ts, called from LoginScreen's signup checkbox)
 * needs something real to point at, but writing a binding Privacy Policy is
 * a legal-authorship task — data retention windows, third-party processor
 * disclosures, jurisdiction-specific legal basis, GDPR/NDPR-specific
 * language — none of which should be invented here on the business's
 * behalf. This states only what's verifiably true from the app's actual
 * code (what's collected, where it's stored, what controls exist) and
 * flags plainly that it needs a lawyer's review before anyone should rely
 * on it as an actual policy.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, Image } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Radius, Spacing } from '../theme/tokens';
import Icon from '../components/ui/Icon';

const SECTIONS: { title: string; body: string }[] = [
    {
        title: 'What Quad360 Collects',
        body: 'The business and financial information you enter directly — transactions, invoices, assets, loans, budgets, inventory, staff and payroll records, and account details (email, business name, phone). Quad360 does not collect data about you from any other source.',
    },
    {
        title: 'How It\'s Used',
        body: 'To run the features you use — reports, financial health scoring, the funding readiness pack, and (only where you explicitly opt in) sharing a summary of your data with a lender through the Financing Marketplace. Data is not sold, and is not used for advertising.',
    },
    {
        title: 'Where It\'s Stored',
        body: 'In Supabase, with row-level access control so only your own account can read or write your data. Some fields are additionally encrypted at rest. A local copy is also cached on your device for offline use.',
    },
    {
        title: 'Your Controls',
        body: 'Export a full copy of your data at any time from Settings → Data. Delete your account and data from Settings → Delete Account — this removes your business records and your login identity; a small number of webhook/payment log records not linked to your login are also removed as part of that process.',
    },
    {
        title: 'Team Accounts',
        body: 'If you invite an accountant or staff member, they can see the business data your role settings expose to them. Removing them from your team ends that access; it does not delete their own separate login account.',
    },
];

export default function PrivacyPolicyScreen() {
    const { navigate } = useApp();
    const goBack = () => navigate('login', { mode: 'owner-setup' });

    return (
        <SafeAreaView style={s.safe}>
            <ScrollView contentContainerStyle={s.scroll}>
                <View style={s.nav}>
                    <TouchableOpacity onPress={() => navigate('landing')} style={s.brandRow}>
                        <Image source={require('../../assets/icon.png')} style={s.navLogo} />
                        <Text style={s.navBrand}>Quad360</Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity onPress={goBack} style={s.backLink}>
                    <Icon name="arrow-left" size={13} color={Colors.textMuted} />
                    <Text style={s.backLinkText}>Back</Text>
                </TouchableOpacity>

                <View style={s.draftBanner}>
                    <Icon name="alert-triangle" size={15} color={Colors.warning} />
                    <Text style={s.draftBannerText}>
                        DRAFT — this describes what the app actually does today, but has not been reviewed by a lawyer and is not yet a binding policy.
                    </Text>
                </View>

                <Text style={s.heading}>Privacy Policy</Text>

                {SECTIONS.map(section => (
                    <View key={section.title} style={s.section}>
                        <Text style={s.sectionTitle}>{section.title}</Text>
                        <Text style={s.sectionBody}>{section.body}</Text>
                    </View>
                ))}
            </ScrollView>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flexGrow: 1, paddingBottom: 60 },

    nav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing.md },
    brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    navLogo: { width: 32, height: 32, borderRadius: Radius.sm },
    navBrand: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },

    backLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.xl, marginTop: 6, marginBottom: 10 },
    backLinkText: { fontSize: 12.5, color: Colors.textMuted, fontWeight: '600' },

    draftBanner: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginHorizontal: Spacing.xl,
        backgroundColor: Colors.warning + '18', borderWidth: 1, borderColor: Colors.warning + '55',
        borderRadius: Radius.md, padding: 12, marginBottom: 20,
    },
    draftBannerText: { flex: 1, fontSize: 12, color: Colors.textPrimary, lineHeight: 17, fontWeight: '600' },

    heading: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary, paddingHorizontal: Spacing.xl, marginBottom: 16 },

    section: { paddingHorizontal: Spacing.xl, marginBottom: 18 },
    sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
    sectionBody: { fontSize: 13.5, color: Colors.textSecondary, lineHeight: 20 },
});
