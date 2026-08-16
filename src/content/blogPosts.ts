/**
 * Blog content — plain data, no CMS, database, or markdown dependency. To
 * publish an article: add an object to BLOG_POSTS below, commit, and push
 * — it goes live on the next deploy at /blog/<slug>.
 *
 * `slug` becomes the URL and must be unique and URL-safe (lowercase,
 * hyphens, no spaces). `body` is a list of paragraphs rendered as plain
 * text, one array entry per paragraph — there's no markdown/HTML parsing,
 * so don't put formatting syntax in there, it'll show up literally.
 */
export interface BlogPost {
    slug: string;
    title: string;
    excerpt: string;
    /** ISO date, e.g. '2026-08-16' */
    publishedDate: string;
    author: string;
    body: string[];
}

// Empty until real articles are written — no placeholder/fabricated posts.
export const BLOG_POSTS: BlogPost[] = [];
