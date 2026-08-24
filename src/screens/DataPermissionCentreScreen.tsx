import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Radius, Spacing, Shadow } from '../theme/tokens';
import Icon from '../components/ui/Icon';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import { confirmAction } from '../utils/webAlert';
import { loadMyActiveLoanMonitoringShares, revokeLoanMonitoringShare } from '../utils/loanMonitoringShare';
import { LoanMonitoringShareRow } from '../utils/loanMonitoringShare';
import { loadMyPipelineListings, revokePipelineListing } from '../utils/financingPipeline';
import { PipelineListing } from '../types';

const ROLE_LABEL: Record<string, string> = { accountant: 'Accountant', manager: 'Manager', staff: 'Staff' };

function formatDate(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// One place to see, and revoke, everyone and everything with an ongoing
// view of this business's data -- team members (internal), lender
// loan-monitoring shares and financing-marketplace listings (external).
// Every row here already has a working revoke path elsewhere in the app
// (Settings > Team, a loan's share toggle, Financing Marketplace); this
// screen doesn't add new revocation logic, it just gathers them into one
// honest "who has access" list instead of leaving each buried in its own
// corner.
export default function DataPermissionCentreScreen() {
    const { teamMembers, removeMember, loans, updateLoan, settings } = useApp();
    const currency = settings?.currency ?? '₦';

    const [loanShares, setLoanShares] = useState<LoanMonitoringShareRow[] | null>(null);
    const [listings, setListings] = useState<PipelineListing[] | null>(null);

    const refreshLoanShares = () => { loadMyActiveLoanMonitoringShares().then(setLoanShares); };
    const refreshListings = () => { loadMyPipelineListings().then(setListings); };

    useEffect(() => { refreshLoanShares(); refreshListings(); }, []);

    const loanById = useMemo(() => new Map(loans.map(l => [l.id, l])), [loans]);

    const handleRemoveTeamMember = (id: string, email: string) => {
        confirmAction(
            'Remove Team Member',
            `${email} will immediately lose access to this business's data.`,
            'Remove',
            () => removeMember(id),
        );
    };

    const handleRevokeLoanShare = (share: LoanMonitoringShareRow) => {
        const loan = loanById.get(share.loanId);
        confirmAction(
            'Revoke Lender Access',
            `${loan?.lenderName ?? 'This lender'} will stop receiving ongoing status updates for this loan. This takes effect immediately.`,
            'Revoke',
            () => {
                revokeLoanMonitoringShare(share.loanId);
                if (loan) updateLoan(loan.id, { shareWithLenderConsent: false, shareConsentUpdatedAt: new Date().toISOString() });
                setLoanShares(prev => prev?.filter(s => s.id !== share.id) ?? null);
            },
        );
    };

    const handleRevokeListing = (listing: PipelineListing) => {
        confirmAction(
            'Remove Marketplace Listing',
            'Lenders browsing the Financing Marketplace will no longer see this listing.',
            'Remove',
            async () => {
                await revokePipelineListing(listing.id);
                setListings(prev => prev?.filter(l => l.id !== listing.id) ?? null);
            },
        );
    };

    const loading = loanShares === null || listings === null;
    const totalAccess = (teamMembers?.length ?? 0) + (loanShares?.length ?? 0) + (listings?.length ?? 0);

    return (
        <SafeAreaView style={styles.safe}>
            <Header />
            <ScrollView style={styles.scroll} contentContainerStyle={styles.pad}>
                <View style={styles.titleRow}>
                    <Icon name="users" size={20} color={Colors.textPrimary} />
                    <Text style={styles.title}>Data Permission Centre</Text>
                </View>
                <Text style={styles.subtitle}>
                    Everyone and everything with an ongoing view of this business's data — revoke access here anytime.
                </Text>

                {loading ? (
                    <View style={styles.emptyCard}><ActivityIndicator color={Colors.primary} /></View>
                ) : totalAccess === 0 ? (
                    <View style={styles.emptyCard}>
                        <Icon name="lock" size={28} color={Colors.textMuted} />
                        <Text style={styles.emptyTitle}>No One Else Has Access</Text>
                        <Text style={styles.emptyText}>No team members, lenders, or marketplace listings currently have a view of this business's data.</Text>
                    </View>
                ) : (
                    <>
                        {/* Team members */}
                        <View style={styles.card}>
                            <View style={styles.cardHeaderRow}>
                                <Icon name="user-check" size={14} color={Colors.textMuted} />
                                <Text style={styles.cardTitle}>Team Members</Text>
                            </View>
                            {(teamMembers?.length ?? 0) === 0 ? (
                                <Text style={styles.cardBodyText}>No team members invited yet.</Text>
                            ) : teamMembers.map(m => (
                                <View key={m.id} style={styles.row}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.rowTitle}>{m.memberEmail}</Text>
                                        <Text style={styles.rowDetail}>
                                            {ROLE_LABEL[m.role] ?? m.role} · {m.status === 'active' ? 'Active' : 'Invite pending'}
                                        </Text>
                                    </View>
                                    <TouchableOpacity style={styles.revokeBtn} onPress={() => handleRemoveTeamMember(m.id, m.memberEmail)}>
                                        <Text style={styles.revokeBtnText}>Remove</Text>
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </View>

                        {/* Lender loan-monitoring shares */}
                        <View style={styles.card}>
                            <View style={styles.cardHeaderRow}>
                                <Icon name="trending-up" size={14} color={Colors.textMuted} />
                                <Text style={styles.cardTitle}>Lender Data Shares</Text>
                            </View>
                            <Text style={styles.cardBodyText}>
                                Ongoing loan-status updates — never your raw transactions, only a summarized status.
                            </Text>
                            {(loanShares?.length ?? 0) === 0 ? (
                                <Text style={[styles.cardBodyText, { marginTop: 6 }]}>No lender currently has an ongoing share.</Text>
                            ) : loanShares!.map(share => {
                                const loan = loanById.get(share.loanId);
                                return (
                                    <View key={share.id} style={styles.row}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.rowTitle}>{loan?.lenderName ?? 'Linked lender'}</Text>
                                            <Text style={styles.rowDetail}>{loan?.purpose ?? share.loanPurpose ?? 'Loan'} · shared since {formatDate(share.fundedAt)}</Text>
                                        </View>
                                        <TouchableOpacity style={styles.revokeBtn} onPress={() => handleRevokeLoanShare(share)}>
                                            <Text style={styles.revokeBtnText}>Revoke</Text>
                                        </TouchableOpacity>
                                    </View>
                                );
                            })}
                        </View>

                        {/* Financing marketplace listings */}
                        <View style={styles.card}>
                            <View style={styles.cardHeaderRow}>
                                <Icon name="briefcase" size={14} color={Colors.textMuted} />
                                <Text style={styles.cardTitle}>Financing Marketplace Listings</Text>
                            </View>
                            <Text style={styles.cardBodyText}>
                                Anonymized listings visible to lenders browsing the Marketplace — never your business name.
                            </Text>
                            {(listings?.length ?? 0) === 0 ? (
                                <Text style={[styles.cardBodyText, { marginTop: 6 }]}>No active marketplace listing.</Text>
                            ) : listings!.map(listing => (
                                <View key={listing.id} style={styles.row}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.rowTitle}>{listing.purpose || listing.financingType.replace(/_/g, ' ')}</Text>
                                        <Text style={styles.rowDetail}>Grade {listing.grade} · listed {formatDate(listing.optedInAt)}</Text>
                                    </View>
                                    <TouchableOpacity style={styles.revokeBtn} onPress={() => handleRevokeListing(listing)}>
                                        <Text style={styles.revokeBtnText}>Remove</Text>
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </View>
                    </>
                )}
            </ScrollView>
            <FooterNav />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flex: 1 },
    pad: { padding: Spacing.lg, paddingBottom: 100, width: '100%', maxWidth: 560, alignSelf: 'center' },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    title: { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary },
    subtitle: { fontSize: 13, color: Colors.textMuted, lineHeight: 19, marginBottom: Spacing.lg },
    emptyCard: { alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.xl, gap: 8 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
    emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },

    card: { backgroundColor: Colors.card, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.lg, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
    cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
    cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
    cardBodyText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },

    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 8 },
    rowTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    rowDetail: { fontSize: 11.5, color: Colors.textMuted, marginTop: 2 },
    revokeBtn: { backgroundColor: Colors.expense + '22', borderRadius: Radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
    revokeBtnText: { fontSize: 11.5, fontWeight: '700', color: Colors.expense },
});
