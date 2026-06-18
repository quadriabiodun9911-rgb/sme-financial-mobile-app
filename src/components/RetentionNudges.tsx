import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, Modal, Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../theme/colors';
import { Transaction } from '../types';

const KEYS = {
    lastSeen:        '@quad360/retention_last_seen',
    milestonesSeen:  '@quad360/milestones_seen',
    streakDate:      '@quad360/streak_date',
    streakCount:     '@quad360/streak_count',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr() { return new Date().toISOString().split('T')[0]; }

function daysBetween(a: string, b: string): number {
    return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

function getWeekRange(weeksAgo: number): { from: string; to: string } {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun
    const startOfThisWeek = new Date(now);
    startOfThisWeek.setDate(now.getDate() - dayOfWeek);
    const from = new Date(startOfThisWeek);
    from.setDate(from.getDate() - weeksAgo * 7);
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    return {
        from: from.toISOString().split('T')[0],
        to:   to.toISOString().split('T')[0],
    };
}

function sumIncome(txs: Transaction[], from: string, to: string): number {
    return txs
        .filter(t => t.type === 'income' && t.date >= from && t.date <= to)
        .reduce((s, t) => s + (Number(t.amount) || 0), 0);
}

function formatAmount(n: number, currency: string): string {
    if (n >= 1_000_000) return `${currency}${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `${currency}${(n / 1_000).toFixed(0)}k`;
    return `${currency}${n.toLocaleString()}`;
}

// ─── Streak logic ─────────────────────────────────────────────────────────────

export async function updateStreak(transactions: Transaction[]): Promise<{ count: number; loggedToday: boolean }> {
    const today = todayStr();
    const loggedToday = transactions.some(t => t.date === today);

    const [storedDate, storedCount] = await Promise.all([
        AsyncStorage.getItem(KEYS.streakDate),
        AsyncStorage.getItem(KEYS.streakCount),
    ]);

    const prevDate  = storedDate ?? '';
    const prevCount = parseInt(storedCount ?? '0', 10) || 0;

    if (loggedToday && prevDate === today) {
        return { count: prevCount, loggedToday };
    }

    let newCount = 0;
    if (loggedToday) {
        const gap = prevDate ? daysBetween(prevDate, today) : 999;
        newCount = gap === 1 ? prevCount + 1 : 1;
        await AsyncStorage.setItem(KEYS.streakDate, today);
        await AsyncStorage.setItem(KEYS.streakCount, String(newCount));
    } else {
        // Streak broken if last log was 2+ days ago
        if (prevDate && daysBetween(prevDate, today) >= 2) {
            await AsyncStorage.setItem(KEYS.streakCount, '0');
        }
        newCount = prevDate && daysBetween(prevDate, today) < 2 ? prevCount : 0;
    }

    return { count: newCount, loggedToday };
}

// ─── Milestone detection ──────────────────────────────────────────────────────

type Milestone = {
    id: string;
    emoji: string;
    title: string;
    body: string;
};

async function detectMilestones(
    transactions: Transaction[],
    currency: string,
    profit: number,
): Promise<Milestone | null> {
    const seenRaw = await AsyncStorage.getItem(KEYS.milestonesSeen);
    const seen: string[] = seenRaw ? JSON.parse(seenRaw) : [];

    const totalIncome  = transactions.filter(t => t.type === 'income').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const totalTx      = transactions.length;

    const thisMonth    = new Date().toISOString().slice(0, 7); // YYYY-MM
    const monthIncome  = transactions
        .filter(t => t.type === 'income' && t.date.startsWith(thisMonth))
        .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const monthExpense = transactions
        .filter(t => t.type === 'expense' && t.date.startsWith(thisMonth))
        .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const monthProfit  = monthIncome - monthExpense;

    const candidates: Milestone[] = [
        totalTx === 1   && { id: 'first_tx',       emoji: '🎯', title: 'First transaction logged!',     body: 'You\'ve taken the first step. Keep it up — consistency is everything.' },
        totalTx === 10  && { id: 'ten_tx',          emoji: '✅', title: '10 transactions recorded!',    body: 'You\'re building a habit. Your financial picture is getting clearer.' },
        totalTx === 50  && { id: 'fifty_tx',        emoji: '🏆', title: '50 transactions tracked!',     body: 'Impressive discipline. You now have a real financial history to work with.' },
        totalTx === 100 && { id: 'hundred_tx',      emoji: '💯', title: '100 transactions recorded!',   body: 'You\'re a power user. Your reports are now highly accurate.' },
        monthProfit > 0 && thisMonth && { id: `profitable_${thisMonth}`, emoji: '📈', title: 'Profitable month!', body: `You made more than you spent in ${new Date().toLocaleString('default', { month: 'long' })}. That's what it's about.` },
        totalIncome >= 100000  && { id: 'income_100k',  emoji: '💰', title: `${formatAmount(100000, currency)} revenue milestone!`,  body: 'Your business is generating serious money. Keep the momentum going.' },
        totalIncome >= 500000  && { id: 'income_500k',  emoji: '🚀', title: `${formatAmount(500000, currency)} revenue milestone!`,  body: 'Half a million in revenue. You\'re running a real business.' },
        totalIncome >= 1000000 && { id: 'income_1M',    emoji: '🦁', title: `${formatAmount(1000000, currency)} revenue milestone!`, body: 'You\'ve hit 7 figures. Outstanding work — share this win!' },
    ].filter(Boolean) as Milestone[];

    const unseen = candidates.find(m => !seen.includes(m.id));
    if (!unseen) return null;

    await AsyncStorage.setItem(KEYS.milestonesSeen, JSON.stringify([...seen, unseen.id]));
    return unseen;
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
    transactions: Transaction[];
    currency: string;
    profit: number;
    onAddTransaction: () => void;
}

export default function RetentionNudges({ transactions, currency, profit, onAddTransaction }: Props) {
    const [inactivityDays, setInactivityDays]   = useState<number | null>(null);
    const [weekSummary, setWeekSummary]         = useState<{ thisWeek: number; lastWeek: number } | null>(null);
    const [milestone, setMilestone]             = useState<Milestone | null>(null);
    const [showMilestone, setShowMilestone]     = useState(false);
    const [streak, setStreak]                   = useState(0);
    const [loggedToday, setLoggedToday]         = useState(false);
    const scaleAnim                             = useRef(new Animated.Value(0.8)).current;

    useEffect(() => {
        if (transactions.length === 0) return;

        const today = todayStr();

        // ── Update last-seen timestamp ──────────────────────────────────────
        AsyncStorage.setItem(KEYS.lastSeen, today);

        // ── Streak ─────────────────────────────────────────────────────────
        updateStreak(transactions).then(({ count, loggedToday: lt }) => {
            setStreak(count);
            setLoggedToday(lt);
        });

        // ── Inactivity: find last transaction date ──────────────────────────
        const dates = transactions.map(t => t.date).sort().reverse();
        const lastDate = dates[0];
        const gap = daysBetween(lastDate, today);
        if (gap >= 3) setInactivityDays(gap);

        // ── Weekly summary — show on Mon/Tue, comparing this week to last ──
        const dow = new Date().getDay();
        if (dow <= 2) { // Mon=1, Tue=2
            const thisWeekRange = getWeekRange(0);
            const lastWeekRange = getWeekRange(1);
            const thisWeek = sumIncome(transactions, thisWeekRange.from, thisWeekRange.to);
            const lastWeek = sumIncome(transactions, lastWeekRange.from, lastWeekRange.to);
            if (lastWeek > 0) setWeekSummary({ thisWeek, lastWeek });
        }

        // ── Milestones ─────────────────────────────────────────────────────
        detectMilestones(transactions, currency, profit).then(m => {
            if (m) {
                setMilestone(m);
                setShowMilestone(true);
                Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 7 }).start();
            }
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transactions.length]);

    const weekChange = weekSummary
        ? weekSummary.lastWeek > 0
            ? ((weekSummary.thisWeek - weekSummary.lastWeek) / weekSummary.lastWeek) * 100
            : null
        : null;

    return (
        <>
            {/* ── Streak badge ─────────────────────────────────────────── */}
            {streak >= 1 && (
                <View style={styles.streakBanner}>
                    <Text style={styles.streakFire}>🔥</Text>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.streakText}>
                            {streak === 1 ? 'Day 1 — streak started!' : `${streak}-day logging streak!`}
                        </Text>
                        <Text style={styles.streakSub}>
                            {loggedToday
                                ? streak === 1 ? 'Great start — come back tomorrow to keep it going' : 'Logged today — keep it going tomorrow'
                                : 'Log a transaction today to keep your streak alive'}
                        </Text>
                    </View>
                    {!loggedToday && (
                        <TouchableOpacity style={styles.streakBtn} onPress={onAddTransaction}>
                            <Text style={styles.streakBtnText}>Log now</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}

            {/* ── Inactivity nudge ─────────────────────────────────────── */}
            {inactivityDays !== null && inactivityDays >= 3 && (
                <TouchableOpacity style={styles.inactivityBanner} onPress={onAddTransaction}>
                    <Text style={styles.inactivityIcon}>📋</Text>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.inactivityTitle}>
                            {inactivityDays} days since your last transaction
                        </Text>
                        <Text style={styles.inactivitySub}>
                            Tap to log what's happened — your numbers may be out of date
                        </Text>
                    </View>
                    <Text style={styles.inactivityArrow}>→</Text>
                </TouchableOpacity>
            )}

            {/* ── Weekly summary ───────────────────────────────────────── */}
            {weekSummary !== null && weekChange !== null && (
                <View style={[styles.weekCard, { borderColor: weekChange >= 0 ? Colors.income : Colors.expense }]}>
                    <Text style={styles.weekTitle}>Last week's revenue</Text>
                    <Text style={[styles.weekAmount, { color: weekChange >= 0 ? Colors.income : Colors.expense }]}>
                        {formatAmount(weekSummary.lastWeek, currency)}
                    </Text>
                    <View style={styles.weekRow}>
                        <Text style={styles.weekLabel}>vs week before</Text>
                        <View style={[styles.weekBadge, { backgroundColor: weekChange >= 0 ? Colors.income + '22' : Colors.expense + '22' }]}>
                            <Text style={[styles.weekBadgeText, { color: weekChange >= 0 ? Colors.income : Colors.expense }]}>
                                {weekChange >= 0 ? '▲' : '▼'} {Math.abs(isNaN(weekChange) ? 0 : weekChange).toFixed(0)}%
                            </Text>
                        </View>
                    </View>
                </View>
            )}

            {/* ── Milestone celebration modal ───────────────────────────── */}
            <Modal visible={showMilestone && milestone !== null} transparent animationType="fade">
                <View style={styles.milestoneOverlay}>
                    <Animated.View style={[styles.milestoneCard, { transform: [{ scale: scaleAnim }] }]}>
                        <Text style={styles.milestoneEmoji}>{milestone?.emoji}</Text>
                        <Text style={styles.milestoneTitle}>{milestone?.title}</Text>
                        <Text style={styles.milestoneBody}>{milestone?.body}</Text>
                        <TouchableOpacity style={styles.milestoneDismiss} onPress={() => setShowMilestone(false)}>
                            <Text style={styles.milestoneDismissText}>Keep it up!</Text>
                        </TouchableOpacity>
                    </Animated.View>
                </View>
            </Modal>
        </>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    streakBanner: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 1,
        borderColor: Colors.warning, borderRadius: 10,
        paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10,
    },
    streakFire:    { fontSize: 22 },
    streakText:    { fontSize: 13, fontWeight: '700', color: Colors.warning },
    streakSub:     { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
    streakBtn:     { backgroundColor: Colors.warning, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
    streakBtnText: { fontSize: 11, fontWeight: '700', color: '#fff' },

    inactivityBanner: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: Colors.surface, borderWidth: 1,
        borderColor: Colors.border, borderRadius: 10,
        paddingHorizontal: 12, paddingVertical: 12, marginBottom: 10,
    },
    inactivityIcon:  { fontSize: 20 },
    inactivityTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    inactivitySub:   { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
    inactivityArrow: { fontSize: 18, color: Colors.primary },

    weekCard: {
        backgroundColor: Colors.surface, borderRadius: 10,
        borderWidth: 1, padding: 14, marginBottom: 10,
    },
    weekTitle:     { fontSize: 11, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
    weekAmount:    { fontSize: 24, fontWeight: 'bold', marginBottom: 6 },
    weekRow:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
    weekLabel:     { fontSize: 12, color: Colors.textMuted },
    weekBadge:     { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
    weekBadgeText: { fontSize: 12, fontWeight: '700' },

    milestoneOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
        justifyContent: 'center', alignItems: 'center', padding: 32,
    },
    milestoneCard: {
        backgroundColor: Colors.surface, borderRadius: 20,
        padding: 28, alignItems: 'center', width: '100%', maxWidth: 340,
    },
    milestoneEmoji:       { fontSize: 56, marginBottom: 12 },
    milestoneTitle:       { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary, textAlign: 'center', marginBottom: 10 },
    milestoneBody:        { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
    milestoneDismiss:     { backgroundColor: Colors.primary, paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, width: '100%', alignItems: 'center' },
    milestoneDismissText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 15 },
});
