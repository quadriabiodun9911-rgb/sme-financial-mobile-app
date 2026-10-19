/**
 * DRAFT placeholder, not a finished legal document. Consent-tracking (see
 * recordConsent in storage.ts, called from LoginScreen's signup checkbox)
 * needs something real to point at, but writing a binding Privacy Policy is
 * a legal-authorship task — data retention windows, third-party processor
 * disclosures, and the business's formal lawful-basis-for-processing
 * analysis under the Nigeria Data Protection Act 2023 (NDPA) are legal
 * determinations, not something to invent here on the business's behalf.
 * This states only what's verifiably true from the app's actual code (what's
 * collected, where it's stored, what controls exist) and maps the NDPA's
 * named data-subject rights to the real in-app mechanism that exercises
 * each one (export, delete account, Data Permission Centre) -- but flags
 * plainly that it still needs a lawyer's review before anyone relies on it
 * as a binding policy. Reachable both pre-login (signup consent link,
 * LandingScreen's trust chip) and post-login (Settings -> Privacy Policy &
 * Data Rights) -- see goBack below for why that matters.
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
        body: 'If you invite a team member, they can see the business data their role exposes to them (see Settings → Team for exactly what each role can see). Removing them from your team ends that access; it does not delete their own separate login account.',
    },
    {
        title: 'Will Lenders See My Data?',
        body: 'Only if you explicitly choose to share it. Nothing is visible to a lender by default. You share data with a specific lender in one of two ways: listing your business on the Financing Marketplace, or granting a lender loan-monitoring access after taking a loan through Quad360. Both are opt-in actions you take yourself, and both can be revoked at any time from Settings → Data Permission Centre — revoking immediately stops that lender from seeing anything further.',
    },
    {
        title: 'Third-Party AI Processing',
        body: 'The AI Advisor feature sends a summary of your business figures (health score, cash position, top risks, goals, and similar already-computed numbers — never your raw transaction list) to Anthropic, the maker of the Claude model that powers it, in order to generate a response to your question. This only happens when you actively use the AI Advisor; it does not run in the background. Anthropic processes this data under its own privacy terms, which govern how long it retains API data and how it may be used — see Anthropic\'s own privacy policy for those specifics, since Quad360 cannot speak on Anthropic\'s behalf.',
    },
    {
        title: 'Data Retention',
        body: 'Your business data is kept for as long as your account exists — there is no automatic deletion or archiving after a fixed period. It is removed when you delete your account (Settings → Delete Account), or sooner for specific records if you use a feature\'s own delete action (e.g. removing a single transaction). A formal, jurisdiction-specific retention schedule has not yet been defined — this describes actual current behavior, not a finalized policy.',
    },
    {
        title: 'Your Rights Under Nigerian Data Protection Law',
        body: 'The Nigeria Data Protection Act 2023 (NDPA) gives you specific rights over your personal data, and Quad360 already has a real, working way to exercise each one — not just a promise:\n\n' +
            '• Access & portability — get a full copy of everything Quad360 holds about your business from Settings → Data & Export → Export All Data.\n' +
            '• Erasure — delete your account and the records tied to it from Settings → Delete Account. This removes your business data and login identity, not just a local cache.\n' +
            '• Withdraw consent / object to sharing — revoke a lender\'s or team member\'s access at any time from Settings → Data Permission Centre; it takes effect immediately.\n' +
            '• Rectification — correct any record directly in the app (transactions, settings, business profile) the same way you entered it.\n\n' +
            'This section states which of your NDPA rights map to which real control. It does not itself establish the business\'s lawful basis for processing or its full NDPA compliance program — that remains the "not yet reviewed by a lawyer" caveat above.',
    },
    {
        title: 'Data Controller & Contact',
        body: 'The data controller for the information described in this policy is QuadView Technologies Ltd (RC No. 9935143), No. 1, Alani Salawu Street, Off Ajilo Bus Stop, Isawo, Agric, Lagos State, Nigeria. For any question about your data, or to exercise a right this policy describes that isn\'t yet self-service in the app, contact hello@quad360financial.com.',
    },
];

export default function PrivacyPolicyScreen() {
    const { navigate, user } = useApp();
    // Reachable two ways now: pre-login (landing/signup consent link) and
    // post-login (Settings -> Privacy Policy & Data Rights, added
    // alongside the NDPA section above) -- `user` tells which one got us
    // here, so Back actually returns to where the owner came from instead
    // of always bouncing a signed-in user out to the login screen.
    const goBack = () => (user ? navigate('settings') : navigate('login', { mode: 'owner-setup' }));

    return (
        <SafeAreaView style={s.safe}>
            <ScrollView contentContainerStyle={s.scroll}>
                <View style={s.nav}>
                    <TouchableOpacity onPress={goBack} style={s.brandRow}>
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
                        DRAFT — this describes what the app actually does today, including how it maps to rights under Nigeria's Data Protection Act 2023, but has not been reviewed by a lawyer and is not yet a binding policy.
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
