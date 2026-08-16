/**
 * Public blog index, reached via the "Blog" nav link on LandingScreen (and
 * its footer), same placement pattern as ContactScreen. Content comes from
 * src/content/blogPosts.ts — a plain array, no CMS.
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, Image, Platform } from 'react-native';
import { useApp } from '../contexts/AppContext';
import { Colors } from '../theme/colors';
import { Radius, Shadow, Spacing } from '../theme/tokens';
import Icon from '../components/ui/Icon';
import { BLOG_POSTS } from '../content/blogPosts';

const formatDate = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('default', { year: 'numeric', month: 'long', day: 'numeric' });
};

export default function BlogScreen() {
    const { navigate } = useApp();

    useEffect(() => {
        if (Platform.OS === 'web' && typeof document !== 'undefined') document.title = 'Blog — Quad360';
    }, []);

    const goLanding = () => navigate('landing');
    const goLogin = () => navigate('login', { mode: 'owner-login' });
    const goSignup = () => navigate('login', { mode: 'owner-setup' });

    const posts = [...BLOG_POSTS].sort((a, b) => b.publishedDate.localeCompare(a.publishedDate));

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

                <TouchableOpacity onPress={goLanding} style={s.backLink}>
                    <Icon name="arrow-left" size={13} color={Colors.textMuted} />
                    <Text style={s.backLinkText}>Back to home</Text>
                </TouchableOpacity>

                <View style={s.hero}>
                    <Text style={s.heading}>Blog</Text>
                    <Text style={s.subtext}>Notes on SME finance, lending, and building Quad360.</Text>
                    <Text style={s.northStar}>
                        Quad360 helps businesses save time, save money, gain clarity, and turn that recovered capacity into profitable growth.
                    </Text>
                </View>

                {posts.length === 0 ? (
                    <View style={s.emptyCard}>
                        <Icon name="file-text" size={22} color={Colors.textMuted} />
                        <Text style={s.emptyTitle}>No articles yet</Text>
                        <Text style={s.emptyText}>Check back soon — new posts land here first.</Text>
                    </View>
                ) : (
                    <View style={s.list}>
                        {posts.map(post => (
                            <TouchableOpacity
                                key={post.slug}
                                style={s.postCard}
                                onPress={() => navigate('blog-post', { slug: post.slug })}
                                activeOpacity={0.8}
                            >
                                <Text style={s.postMeta}>{formatDate(post.publishedDate)} · {post.author}</Text>
                                <Text style={s.postTitle}>{post.title}</Text>
                                <Text style={s.postExcerpt}>{post.excerpt}</Text>
                                <Text style={s.postReadMore}>Read article →</Text>
                            </TouchableOpacity>
                        ))}
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

    hero: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, paddingBottom: Spacing.xl },
    heading: { fontSize: 28, fontWeight: '800', color: Colors.textPrimary, marginBottom: 6 },
    subtext: { fontSize: 14, color: Colors.textMuted, marginBottom: 10 },
    northStar: { fontSize: 13.5, fontWeight: '700', color: Colors.textPrimary, lineHeight: 20, maxWidth: 520 },

    emptyCard: {
        marginHorizontal: Spacing.xl, backgroundColor: Colors.surface, borderRadius: Radius.lg,
        borderWidth: 1, borderColor: Colors.border, padding: 32, alignItems: 'center', gap: 8,
    },
    emptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginTop: 4 },
    emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },

    list: { paddingHorizontal: Spacing.xl, gap: 14 },
    postCard: {
        backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
        padding: 20, ...Shadow.sm,
    },
    postMeta: { fontSize: 11.5, color: Colors.textMuted, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 },
    postTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, marginBottom: 8 },
    postExcerpt: { fontSize: 13.5, color: Colors.textSecondary, lineHeight: 20, marginBottom: 12 },
    postReadMore: { fontSize: 13, color: Colors.primary, fontWeight: '700' },
});
