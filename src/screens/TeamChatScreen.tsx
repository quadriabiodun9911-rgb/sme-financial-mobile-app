import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    SafeAreaView, View, Text, StyleSheet, FlatList,
    TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import Header from '../components/Header';
import FooterNav from '../components/FooterNav';
import Icon from '../components/ui/Icon';
import { showAlert } from '../utils/webAlert';
import { ROLE_DISPLAY_LABEL } from '../utils/rolePermissions';
import { loadTeamChatMessages, sendTeamChatMessage, getAuthUserId } from '../utils/storage';
import { TeamChatMessage } from '../types';

// Polling, not a realtime subscription -- this app has no supabase.channel()
// usage anywhere else, and 12s is fast enough for "leave a note for
// whoever's next in the app" without introducing a new, unverified
// real-time dependency for one screen.
const POLL_INTERVAL_MS = 12000;

function timeLabel(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (sameDay) return time;
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${time}`;
}

export default function TeamChatScreen() {
    const { user, userRole, teamMembers } = useApp();
    const [messages, setMessages] = useState<TeamChatMessage[]>([]);
    const [myUserId, setMyUserId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [draft, setDraft] = useState('');
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const senderName = (user?.email?.split('@')[0] || 'Team member').trim();

    const refresh = useCallback(async (showSpinner: boolean) => {
        if (showSpinner) setLoading(true);
        try {
            const rows = await loadTeamChatMessages();
            setMessages(rows);
        } finally {
            if (showSpinner) setLoading(false);
        }
    }, []);

    useEffect(() => {
        getAuthUserId().then(setMyUserId);
        refresh(true);
        pollRef.current = setInterval(() => refresh(false), POLL_INTERVAL_MS);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [refresh]);

    const handleSend = async () => {
        const body = draft.trim();
        if (!body || sending) return;
        setSending(true);
        setDraft('');
        try {
            await sendTeamChatMessage(body, senderName, userRole);
            await refresh(false);
        } catch (e: any) {
            setDraft(body);
            showAlert('Message not sent', e?.message || 'Something went wrong. Check your connection and try again.');
        } finally {
            setSending(false);
        }
    };

    const renderItem = ({ item }: { item: TeamChatMessage }) => {
        const isMine = item.senderUserId === myUserId;
        return (
            <View style={[styles.bubbleRow, isMine && styles.bubbleRowMine]}>
                <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    {!isMine && (
                        <View style={styles.bubbleMetaRow}>
                            <Text style={styles.bubbleSender}>{item.senderName}</Text>
                            <View style={styles.roleBadge}>
                                <Text style={styles.roleBadgeText}>{ROLE_DISPLAY_LABEL[item.senderRole] || item.senderRole}</Text>
                            </View>
                        </View>
                    )}
                    <Text style={[styles.bubbleBody, isMine && styles.bubbleBodyMine]}>{item.body}</Text>
                    <Text style={[styles.bubbleTime, isMine && styles.bubbleTimeMine]}>{timeLabel(item.createdAt)}</Text>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.safe}>
            <Header />
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
            >
                <View style={styles.titleRow}>
                    <Icon name="message-circle" size={20} color={Colors.textPrimary} />
                    <Text style={styles.title}>Team Chat</Text>
                </View>
                <Text style={styles.subtitle}>
                    One shared conversation for everyone on this business's team — leave a note for whoever's next in the app.
                </Text>

                {loading ? (
                    <View style={styles.centerFill}><ActivityIndicator color={Colors.primary} /></View>
                ) : messages.length === 0 ? (
                    <View style={styles.centerFill}>
                        <Icon name="message-square" size={28} color={Colors.textMuted} />
                        <Text style={styles.emptyTitle}>No messages yet</Text>
                        <Text style={styles.emptyText}>
                            {teamMembers.length === 0 && userRole === 'owner'
                                ? 'Invite a team member from Settings, then start the conversation here.'
                                : 'Send the first message — your team will see it next time they open the app.'}
                        </Text>
                    </View>
                ) : (
                    <FlatList
                        data={[...messages].reverse()}
                        keyExtractor={(m) => m.id}
                        renderItem={renderItem}
                        inverted
                        style={styles.list}
                        contentContainerStyle={styles.listContent}
                    />
                )}

                <View style={styles.inputBar}>
                    <TextInput
                        style={styles.input}
                        value={draft}
                        onChangeText={setDraft}
                        placeholder="Message your team…"
                        placeholderTextColor={Colors.textMuted}
                        multiline
                        maxLength={2000}
                        editable={!sending}
                    />
                    <TouchableOpacity
                        style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnDisabled]}
                        onPress={handleSend}
                        disabled={!draft.trim() || sending}
                    >
                        {sending ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="send" size={16} color="#fff" />}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
            <FooterNav />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    flex: { flex: 1 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, marginBottom: Spacing.xs },
    title: { fontSize: 24, fontWeight: '700', color: Colors.textPrimary },
    subtitle: { fontSize: 13, color: Colors.textMuted, paddingHorizontal: Spacing.lg, marginBottom: Spacing.md },

    centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xxl, gap: Spacing.xs },
    emptyTitle: { color: Colors.textPrimary, fontSize: 15, fontWeight: '700', marginTop: Spacing.sm },
    emptyText: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 18 },

    list: { flex: 1 },
    listContent: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.sm },

    bubbleRow: { flexDirection: 'row', marginBottom: Spacing.sm },
    bubbleRowMine: { justifyContent: 'flex-end' },
    bubble: { maxWidth: '80%', borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, ...Shadow.sm },
    bubbleTheirs: { backgroundColor: Colors.surfaceVariant, borderBottomLeftRadius: Radius.sm },
    bubbleMine: { backgroundColor: Colors.primary, borderBottomRightRadius: Radius.sm },
    bubbleMetaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: 3 },
    bubbleSender: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700' },
    roleBadge: { backgroundColor: Colors.bg, borderRadius: Radius.pill, paddingHorizontal: 6, paddingVertical: 1 },
    roleBadgeText: { color: Colors.textMuted, fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },
    bubbleBody: { color: Colors.textPrimary, fontSize: 14, lineHeight: 19 },
    bubbleBodyMine: { color: '#fff' },
    bubbleTime: { color: Colors.textMuted, fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
    bubbleTimeMine: { color: 'rgba(255,255,255,0.75)' },

    inputBar: {
        flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm,
        paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border,
        backgroundColor: Colors.bg,
    },
    input: {
        flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.lg,
        paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
        color: Colors.textPrimary, fontSize: 14, maxHeight: 110,
        borderWidth: 1, borderColor: Colors.border,
    },
    sendBtn: {
        width: 40, height: 40, borderRadius: Radius.pill,
        backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    },
    sendBtnDisabled: { opacity: 0.5 },
});
