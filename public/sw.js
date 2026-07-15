// Bumped from v1: the old fetch handler served index.html cache-first, which
// permanently pinned browsers to whatever JS bundle hash was cached at first
// visit — new deploys were invisible until the cache was manually cleared.
// Bumping the cache name forces the activate handler's cleanup to actually
// delete the old (stale-html-containing) cache instead of reusing it.
const CACHE = 'quad360-v2';
const ASSETS = [
    '/',
    '/index.html',
    '/favicon.ico',
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);

    // NETWORK-FIRST for navigation/HTML documents. index.html is what
    // references the current hashed JS bundle filename — if it's served
    // stale from cache, the browser keeps loading an old bundle forever,
    // even across new deployments, since the cache-first strategy never
    // re-checks the network. This was causing users to see stale app
    // versions indefinitely after redeploys.
    const isNavigation = e.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html');
    if (isNavigation) {
        e.respondWith(
            fetch(e.request)
                .then(res => {
                    const clone = res.clone();
                    caches.open(CACHE).then(c => c.put(e.request, clone));
                    return res;
                })
                .catch(() => caches.match(e.request))
        );
        return;
    }

    // Hashed static assets (filename changes when content changes) are safe
    // to serve network-first too — cheap staleness check, always correct.
    if (url.pathname.startsWith('/_expo/static/js/')) {
        e.respondWith(
            fetch(e.request)
                .then(res => {
                    const clone = res.clone();
                    caches.open(CACHE).then(c => c.put(e.request, clone));
                    return res;
                })
                .catch(() => caches.match(e.request))
        );
        return;
    }

    // Everything else (images, fonts, etc.): cache-first is fine.
    e.respondWith(
        caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
            if (res.status === 200) {
                const clone = res.clone();
                caches.open(CACHE).then(c => c.put(e.request, clone));
            }
            return res;
        }))
    );
});
