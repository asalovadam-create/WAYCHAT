/**
 * WayChat Service Worker v8.0.0
 * ═══════════════════════════════════════════════════════
 * Стратегии:
 *   HTML           → Network-First  (всегда свежий index.html)
 *   JS/CSS/img     → Cache-First    (+ фоновое обновление)
 *   Шрифты         → Stale-While-Revalidate
 *   API / Socket   → Network-Only   (никогда не кэшируем)
 *
 * Защита от чёрного экрана:
 *   1. skipWaiting() в install — новый SW активируется немедленно
 *   2. clients.claim() в activate — все вкладки получают новый SW
 *   3. Старые кэши удаляются при каждом новом CACHE_VERSION
 *   4. updateViaCache:'none' в index.html — SW-скрипт никогда не кэшируется
 *   5. Таймер reg.update() каждые 30 мин
 */

const CACHE_VERSION = 'wc-v8.0.0';   // ← менять при каждом деплое
const STATIC_CACHE  = CACHE_VERSION + '-static';
const FONT_CACHE    = CACHE_VERSION + '-fonts';
const ALL_CACHES    = [STATIC_CACHE, FONT_CACHE];

// Статичные ассеты для pre-cache
const PRECACHE = [
    '/static/js/main.js',
    '/static/logo.png',
    '/static/img/icon-192.png',
    '/static/img/icon-512.png',
];

// URL-паттерны, которые НИКОГДА не кэшируем
const NEVER_CACHE_RE = [
    /\/socket\.io\//,
    /\/api\//,
    /\/get_/,
    /\/send_/,
    /\/upload/,
    /\/mark_/,
    /\/delete_/,
    /\/update_/,
    /\/search/,
    /\/login/,
    /\/register/,
    /\/logout/,
    /\/moments/,
    /\/push/,
    /\/chats/,
    /\/messages/,
];

function neverCache(url) {
    return NEVER_CACHE_RE.some(re => re.test(url));
}

// ── Install ──────────────────────────────────────────────
self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(STATIC_CACHE).then(cache =>
            Promise.allSettled(
                PRECACHE.map(url => cache.add(url).catch(e => console.warn('[SW] precache fail:', url, e.message)))
            )
        )
    );
});

// ── Activate: удаляем все старые кэши ────────────────────
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => !ALL_CACHES.includes(k)).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
    // Уведомляем все вкладки — они решат: тихо перезагрузиться или показать баннер
    self.clients.matchAll({ type: 'window' }).then(clients =>
        clients.forEach(c => c.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION }))
    );
});

// ── Fetch ────────────────────────────────────────────────
self.addEventListener('fetch', event => {
    const req = event.request;
    const url = new URL(req.url);

    const sameOrigin   = url.origin === self.location.origin;
    const isGoogleFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

    if (!sameOrigin && !isGoogleFont) return;  // внешние CDN — не трогаем
    if (neverCache(url.pathname + url.search)) {
        event.respondWith(fetch(req));
        return;
    }

    // HTML — Network-First
    if (req.headers.get('accept')?.includes('text/html')) {
        event.respondWith(networkFirst(req));
        return;
    }
    // Шрифты — Stale-While-Revalidate
    if (isGoogleFont || /\.(woff2?|ttf|otf|eot)$/i.test(url.pathname)) {
        event.respondWith(staleWhileRevalidate(req, FONT_CACHE));
        return;
    }
    // Статика — Cache-First
    if (/\.(js|css|png|jpg|jpeg|svg|ico|webp|gif)$/i.test(url.pathname) || url.pathname.startsWith('/static/')) {
        event.respondWith(cacheFirst(req));
        return;
    }
    // Всё остальное — сеть с кэш-фолбэком
    event.respondWith(networkWithFallback(req));
});

async function networkFirst(req) {
    try {
        const res = await fetchTimeout(req, 5000);
        if (res.ok) caches.open(STATIC_CACHE).then(c => c.put(req, res.clone()));
        return res;
    } catch (_) {
        const cached = await caches.match(req);
        return cached || offlinePage();
    }
}

async function cacheFirst(req) {
    const cache  = await caches.open(STATIC_CACHE);
    const cached = await cache.match(req);
    if (cached) {
        // Фоновое обновление — важно для main.js
        fetch(req).then(r => { if (r.ok) cache.put(req, r); }).catch(() => {});
        return cached;
    }
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
}

async function staleWhileRevalidate(req, cacheName) {
    const cache  = await caches.open(cacheName);
    const cached = await cache.match(req);
    const fresh  = fetch(req).then(r => { if (r.ok) cache.put(req, r.clone()); return r; }).catch(() => null);
    return cached || await fresh;
}

async function networkWithFallback(req) {
    try {
        const res = await fetch(req);
        if (res.ok) caches.open(STATIC_CACHE).then(c => c.put(req, res.clone()));
        return res;
    } catch (_) {
        return await caches.match(req) || new Response('', { status: 503 });
    }
}

function fetchTimeout(req, ms) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), ms);
    return fetch(req, { signal: ctrl.signal }).finally(() => clearTimeout(id));
}

function offlinePage() {
    return new Response(
        `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
        body{background:#111113;color:#fff;font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
        .c{text-align:center} .ico{font-size:64px;margin-bottom:20px} h1{font-size:22px;font-weight:800;margin:0 0 8px} p{color:rgba(255,255,255,.45);font-size:15px;margin:0}
        </style></head><body><div class="c"><div class="ico">📡</div><h1>Нет соединения</h1><p>Проверьте интернет и попробуйте снова</p></div></body></html>`,
        { headers: { 'Content-Type': 'text/html' } }
    );
}

// ── Push уведомления ────────────────────────────────────
self.addEventListener('push', event => {
    if (!event.data) return;
    let d;
    try { d = event.data.json(); } catch { d = { title: 'WayChat', body: event.data.text() }; }
    event.waitUntil(
        self.registration.showNotification(d.title || 'WayChat', {
            body:     d.body   || '',
            icon:     d.icon   || '/static/img/icon-192.png',
            badge:    '/static/img/icon-192.png',
            tag:      d.tag    || 'wc-msg',
            data:     d.url    || '/',
            vibrate:  [200, 100, 200],
            renotify: true,
        })
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const url = event.notification.data || '/';
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
            for (const c of clients) {
                if (c.url.includes(self.location.origin) && 'focus' in c) return c.focus();
            }
            return self.clients.openWindow(url);
        })
    );
});
