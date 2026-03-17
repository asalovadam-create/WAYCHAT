/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  WayChat Service Worker v8.1.0                              ║
 * ║  Zero-black-screen · Smart caching · Offline fallback       ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * ⚠️  ВАЖНО: меняй CACHE_VERSION при каждом деплое!
 *
 * Стратегии:
 *   HTML          → Network-First   (всегда свежий index.html)
 *   JS/CSS/img    → Cache-First     + фоновое обновление
 *   Шрифты        → Stale-While-Revalidate
 *   API/Socket.IO → Network-Only    (никогда не кэшируем)
 */

const CACHE_VERSION = 'wc-v8.1.0';        // ← МЕНЯТЬ ПРИ КАЖДОМ ДЕПЛОЕ
const STATIC_CACHE  = CACHE_VERSION + '-static';
const FONT_CACHE    = CACHE_VERSION + '-fonts';
const ALL_CACHES    = [STATIC_CACHE, FONT_CACHE];

const PRECACHE = [
    '/static/js/main.js',
    '/static/logo.png',
    '/static/img/icon-192.png',
    '/static/img/icon-512.png',
];

// Паттерны которые ВСЕГДА идут в сеть
const BYPASS = [
    /\/socket\.io\//,
    /\/api\//,
    /\/get_/,   /\/send_/,   /\/upload/,
    /\/mark_/,  /\/delete_/, /\/update_/,
    /\/search/, /\/login/,   /\/register/,
    /\/logout/, /\/moments/, /\/push/,
    /\/chats/,  /\/messages/,
];
const bypass = url => BYPASS.some(r => r.test(url));

// ══ INSTALL ════════════════════════════════════════════════════
self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(STATIC_CACHE).then(cache =>
            Promise.allSettled(
                PRECACHE.map(u => cache.add(u).catch(e => console.warn('[SW] pre-cache fail:', u, e.message)))
            )
        )
    );
});

// ══ ACTIVATE — удаляем старые кэши ════════════════════════════
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => !ALL_CACHES.includes(k)).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
    self.clients.matchAll({ type: 'window' }).then(clients =>
        clients.forEach(c => c.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION }))
    );
});

// ══ FETCH ══════════════════════════════════════════════════════
self.addEventListener('fetch', event => {
    const req = event.request;
    const url = new URL(req.url);
    const sameOrigin = url.origin === self.location.origin;
    const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

    if (!sameOrigin && !isFont) return;
    if (bypass(url.pathname + url.search)) { event.respondWith(fetch(req)); return; }

    if (req.headers.get('accept')?.includes('text/html')) {
        event.respondWith(networkFirst(req)); return;
    }
    if (isFont || /\.(woff2?|ttf|otf|eot)$/i.test(url.pathname)) {
        event.respondWith(staleWhileRevalidate(req, FONT_CACHE)); return;
    }
    if (url.pathname.startsWith('/static/') || /\.(js|css|png|jpg|jpeg|svg|ico|webp|gif)$/i.test(url.pathname)) {
        event.respondWith(cacheFirst(req)); return;
    }
    event.respondWith(netWithFallback(req));
});

async function networkFirst(req) {
    try {
        const res = await fetchTimed(req, 5000);
        if (res.ok) caches.open(STATIC_CACHE).then(c => c.put(req, res.clone())).catch(() => {});
        return res;
    } catch {
        return (await caches.match(req)) || offlinePage();
    }
}

async function cacheFirst(req) {
    const cache = await caches.open(STATIC_CACHE);
    const hit   = await cache.match(req);
    if (hit) {
        fetch(req).then(r => { if (r.ok) cache.put(req, r); }).catch(() => {});
        return hit;
    }
    const res = await fetch(req).catch(() => null);
    if (res?.ok) cache.put(req, res.clone()).catch(() => {});
    return res || new Response('', { status: 503 });
}

async function staleWhileRevalidate(req, cacheName) {
    const cache = await caches.open(cacheName);
    const hit   = await cache.match(req);
    const fresh = fetch(req).then(r => { if (r.ok) cache.put(req, r.clone()); return r; }).catch(() => null);
    return hit || (await fresh) || new Response('', { status: 503 });
}

async function netWithFallback(req) {
    try {
        const res = await fetch(req);
        if (res.ok) caches.open(STATIC_CACHE).then(c => c.put(req, res.clone())).catch(() => {});
        return res;
    } catch {
        return (await caches.match(req)) || new Response('', { status: 503 });
    }
}

function fetchTimed(req, ms) {
    const ctrl = new AbortController();
    const id   = setTimeout(() => ctrl.abort(), ms);
    return fetch(req, { signal: ctrl.signal }).finally(() => clearTimeout(id));
}

function offlinePage() {
    return new Response(
        `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>WayChat — Нет сети</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:#17212b;color:#e8eef4;
  font-family:-apple-system,BlinkMacSystemFont,sans-serif;
  display:flex;align-items:center;justify-content:center}
.c{text-align:center;padding:24px}
.ico{font-size:72px;display:block;margin-bottom:24px}
h1{font-size:24px;font-weight:800;margin-bottom:10px}
p{color:rgba(232,238,244,.45);font-size:15px;line-height:1.6;margin-bottom:28px}
button{padding:14px 36px;background:#10b981;border:none;border-radius:16px;
  color:#000;font-size:16px;font-weight:800;cursor:pointer;font-family:inherit}
button:active{transform:scale(.96)}
</style></head>
<body><div class="c">
  <span class="ico">📡</span>
  <h1>Нет подключения</h1>
  <p>Проверьте интернет и попробуйте снова.<br>Ранее открытые чаты доступны в кэше.</p>
  <button onclick="location.reload()">Попробовать снова</button>
</div></body></html>`,
        { headers: { 'Content-Type': 'text/html;charset=utf-8' } }
    );
}

// ══ PUSH ═══════════════════════════════════════════════════════
self.addEventListener('push', event => {
    if (!event.data) return;
    let d; try { d=event.data.json(); } catch { d={title:'WayChat',body:event.data.text()}; }
    event.waitUntil(self.registration.showNotification(d.title||'WayChat', {
        body:d.body||'',icon:d.icon||'/static/img/icon-192.png',
        badge:'/static/img/icon-192.png',tag:d.tag||'wc-msg',
        data:d.url||'/',vibrate:[200,100,200],renotify:true,
    }));
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const url = event.notification.data || '/';
    event.waitUntil(
        self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs => {
            for (const c of cs) if (c.url.includes(self.location.origin)&&'focus'in c) return c.focus();
            return self.clients.openWindow(url);
        })
    );
});
