// Bumped from v1: the old fetch handler served index.html cache-first, which
// permanently pinned browsers to whatever JS bundle hash was cached at first
// visit — new deploys were invisible until the cache was manually cleared.
// Bumped again from v2: that version's fetch handler had no origin check at
// all, so it also cache-first-served cross-origin GETs -- including calls
// to Supabase's REST API -- meaning a browser that had ever cached one of
// those kept getting that frozen snapshot back forever, never actually
// asking Supabase again. Bumping the cache name forces the activate
// handler's cleanup to discard whatever got wrongly cached under v2
// instead of carrying it forward.
const CACHE = 'quad360-v3';
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

    // Cross-origin requests (Supabase REST/auth calls, any other API) must
    // never be touched by this service worker -- everything below this
    // point exists to cache THIS APP's own files, keyed by request, with no
    // per-origin check. A GET to Supabase (e.g. loading transactions) that
    // fell into the "everything else: cache-first" bucket below got served
    // from whatever was cached on the FIRST load, forever, even as the
    // real data in Supabase kept changing -- the app looked like it had
    // stopped syncing when it had actually just stopped ever asking the
    // network again for that exact request. A non-GET cross-origin request
    // (POST/PATCH/DELETE -- every actual save) hit the same bucket's
    // `cache.put()` call, which throws for any non-GET method and was
    // surfacing as a harmless-looking but very real "Failed to execute
    // 'put' on 'Cache'" console error on every single write. Letting every
    // cross-origin request pass straight through to the network, untouched,
    // fixes both at once.
    if (url.origin !== self.location.origin) {
        return;
    }

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
