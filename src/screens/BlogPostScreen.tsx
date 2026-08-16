/**
 * Single article view, reached from BlogScreen (or a direct /blog/<slug>
 * link — see getInitialScreenFromUrl in OptimizedContexts.tsx). Content
 * comes from src/content/blogPosts.ts — a plain array, no CMS.
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, Image, Platform } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Radius, Spacing } from '../theme/tokens';
import Icon from '../components/ui/Icon';
import { BLOG_POSTS } from '../content/blogPosts';

const formatDate = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('default', { year: 'numeric', month: 'long', day: 'numeric' });
};

export default function BlogPostScreen() {
    const { navigate, navParams } = useApp();
    const slug = navParams?.slug as string | undefined;
    const post = BLOG_POSTS.find(p => p.slug === slug);

    useEffect(() => {
        if (Platform.OS !== 'web' || typeof document === 'undefined') return;
        document.title = post ? `${post.title} — Quad360 Blog` : 'Article not found — Quad360';
    }, [post]);

    const goLanding = () => navigate('landing');
    const goBlog = () => navigate('blog');
    const goLogin = () => navigate('login', { mode: 'owner-login' });
    const goSignup = () => navigate('login', { mode: 'owner-setup' });

    return (
        <SafeAreaView style={s.safe}>
            <ScrollView contentContainerStyle={s.scroll}>
                <View style={s.nav}>
                    <TouchableOpacity onPress={goLanding} style={s.brandRow}>
                        <Image source={require('../../assets/icon.png')} style={s.navLogo} />
                        <Text style={s.navBrand}>Quad360</Text>
                    </TouchableOpacity>
                    <View style={s.navActions}>
                        <TouchableOpacity onPress={goLogin} style={s.navLoginBtn}>
                            <Text style={s.navLoginText}>Log In</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={goSignup} style={s.navSignupBtn}>
                            <Text style={s.navSignupText}>Sign Up</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <TouchableOpacity onPress={goBlog} style={s.backLink}>
                    <Icon name="arrow-left" size={13} color={Colors.textMuted} />
                    <Text style={s.backLinkText}>Back to Blog</Text>
                </TouchableOpacity>

                {post ? (
                    <View style={s.article}>
                        <Text style={s.title}>{post.title}</Text>
                        <Text style={s.meta}>{formatDate(post.publishedDate)} · {post.author}</Text>
                        {post.body.map((para, i) => (
                            <Text key={i} style={s.paragraph}>{para}</Text>
                        ))}
                    </View>
                ) : (
                    <View style={s.emptyCard}>
                        <Icon name="alert-circle" size={22} color={Colors.textMuted} />
                        <Text style={s.emptyTitle}>Article not found</Text>
                        <Text style={s.emptyText}>This link may be out of date.</Text>
                        <TouchableOpacity onPress={goBlog} style={s.emptyBtn}>
                            <Text style={s.emptyBtnText}>Back to Blog</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flexGrow: 1, paddingBottom: 60 },

    nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing.md },
    brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    navLogo: { width: 32, height: 32, borderRadius: Radius.sm },
    navBrand: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
    navActions: { flexDirection: 'row', gap: 10 },
    navLoginBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.border },
    navLoginText: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
    navSignupBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: Radius.pill, backgroundColor: Colors.primary },
    navSignupText: { fontSize: 13, fontWeight: '700', color: '#fff' },

    backLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.xl, marginTop: 6, marginBottom: 10 },
    backLinkText: { fontSize: 12.5, color: Colors.textMuted, fontWeight: '600' },

    article: { paddingHorizontal: Spacing.xl, maxWidth: 640, alignSelf: 'center', width: '100%' },
    title: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary, marginBottom: 8, lineHeight: 33 },
    meta: { fontSize: 12.5, color: Colors.textMuted, fontWeight: '600', marginBottom: 22, textTransform: 'uppercase', letterSpacing: 0.3 },
    paragraph: { fontSize: 15.5, color: Colors.textSecondary, lineHeight: 25, marginBottom: 16 },

    emptyCard: {
        marginHorizontal: Spacing.xl, backgroundColor: Colors.surface, borderRadius: Radius.lg,
        borderWidth: 1, borderColor: Colors.border, padding: 32, alignItems: 'center', gap: 8,
    },
    emptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginTop: 4 },
    emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', marginBottom: 8 },
    emptyBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: Radius.pill, backgroundColor: Colors.primary, marginTop: 6 },
    emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
