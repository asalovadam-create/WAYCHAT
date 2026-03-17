/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  WayChat Service Worker v8.0.0                              ║
 * ║  Zero-black-screen · Cache versioning · Offline fallback    ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Стратегии:
 *   HTML страницы     → Network-First  (всегда свежий index.html)
 *   JS / CSS / img    → Cache-First    + фоновое обновление
 *   Шрифты Google     → Stale-While-Revalidate
 *   API / Socket.IO   → Network-Only   (никогда не кэшируем!)
 *
 * Защита от чёрного экрана:
 *   1. CACHE_VERSION → меняй при каждом деплое
 *   2. skipWaiting() → новый SW активируется немедленно
 *   3. clients.claim() → все вкладки подхватывают новый SW
 *   4. Все старые кэши удаляются в activate
 *   5. updateViaCache:'none' в регистрации → SW-скрипт не кэшируется браузером
 *   6. reg.update() сразу после регистрации + каждые 30 мин
 */

// ── ВЕРСИЯ — МЕНЯТЬ ПРИ КАЖДОМ ДЕПЛОЕ ─────────────────────────────────────
const CACHE_VERSION = 'wc-v8.0.0';
const STATIC_CACHE  = CACHE_VERSION + '-static';
const FONT_CACHE    = CACHE_VERSION + '-fonts';
const ALL_CACHES    = [STATIC_CACHE, FONT_CACHE];

// ── Ассеты для pre-cache при установке ─────────────────────────────────────
const PRECACHE_ASSETS = [
    '/static/js/main.js',
    '/static/logo.png',
    '/static/img/icon-192.png',
    '/static/img/icon-512.png',
];

// ── URL-паттерны которые НИКОГДА не кэшируем ───────────────────────────────
const BYPASS_PATTERNS = [
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

const shouldBypass = url => BYPASS_PATTERNS.some(r => r.test(url));

// ════════════════════════════════════════════════════════════
//  INSTALL — pre-cache статика, skip waiting
// ════════════════════════════════════════════════════════════
self.addEventListener('install', event => {
    self.skipWaiting(); // Новый SW активируется без ожидания закрытия вкладок

    event.waitUntil(
        caches.open(STATIC_CACHE).then(cache =>
            Promise.allSettled(
                PRECACHE_ASSETS.map(url =>
                    cache.add(url).catch(err =>
                        console.warn('[SW] pre-cache failed:', url, err.message)
                    )
                )
            )
        )
    );
});

// ════════════════════════════════════════════════════════════
//  ACTIVATE — удаляем все старые кэши, захватываем клиентов
// ════════════════════════════════════════════════════════════
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys =>
                Promise.all(
                    keys
                        .filter(k => !ALL_CACHES.includes(k))
                        .map(k => {
                            console.log('[SW] Deleting old cache:', k);
                            return caches.delete(k);
                        })
                )
            )
            .then(() => self.clients.claim()) // Все открытые вкладки — под новый SW
    );

    // Уведомляем все вкладки — они перезагрузятся или покажут баннер
    self.clients.matchAll({ type: 'window' }).then(clients =>
        clients.forEach(c =>
            c.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION })
        )
    );
});

// ════════════════════════════════════════════════════════════
//  FETCH — маршрутизация запросов по стратегиям
// ════════════════════════════════════════════════════════════
self.addEventListener('fetch', event => {
    const req = event.request;
    const url = new URL(req.url);

    const sameOrigin   = url.origin === self.location.origin;
    const isGoogleFont = url.hostname === 'fonts.googleapis.com' ||
                         url.hostname === 'fonts.gstatic.com';

    // Только same-origin + Google Fonts
    if (!sameOrigin && !isGoogleFont) return;

    // API/Socket — всегда через сеть, без кэша
    if (shouldBypass(url.pathname + url.search)) {
        event.respondWith(fetch(req));
        return;
    }

    // HTML страницы → Network-First
    if (req.headers.get('accept')?.includes('text/html')) {
        event.respondWith(networkFirst(req));
        return;
    }

    // Шрифты → Stale-While-Revalidate
    if (isGoogleFont || /\.(woff2?|ttf|otf|eot)$/i.test(url.pathname)) {
        event.respondWith(staleWhileRevalidate(req, FONT_CACHE));
        return;
    }

    // Статика (JS/CSS/img) → Cache-First
    if (
        url.pathname.startsWith('/static/') ||
        /\.(js|css|png|jpg|jpeg|svg|ico|webp|gif)$/i.test(url.pathname)
    ) {
        event.respondWith(cacheFirst(req));
        return;
    }

    // Остальное → сеть с кэш-фолбэком
    event.respondWith(networkWithFallback(req));
});

// ════════════════════════════════════════════════════════════
//  СТРАТЕГИИ
// ════════════════════════════════════════════════════════════

/** Network-First: сеть → кэш → оффлайн страница */
async function networkFirst(req) {
    try {
        const res = await fetchWithTimeout(req, 5000);
        if (res.ok) {
            // Обновляем кэш в фоне
            caches.open(STATIC_CACHE)
                .then(c => c.put(req, res.clone()))
                .catch(() => {});
        }
        return res;
    } catch (_) {
        const cached = await caches.match(req);
        if (cached) return cached;
        return offlinePage();
    }
}

/**
 * Cache-First: кэш → сеть → кэш обновляется в фоне.
 * КРИТИЧНО для main.js: фоновое обновление гарантирует что следующий
 * визит получит свежий файл даже при отсутствии сети сейчас.
 */
async function cacheFirst(req) {
    const cache  = await caches.open(STATIC_CACHE);
    const cached = await cache.match(req);
    if (cached) {
        // Всегда обновляем в фоне — чтобы main.js не устарел
        fetch(req)
            .then(r => { if (r.ok) cache.put(req, r); })
            .catch(() => {});
        return cached;
    }
    try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone()).catch(() => {});
        return res;
    } catch (_) {
        return new Response('', { status: 503, statusText: 'Offline' });
    }
}

/** Stale-While-Revalidate: отдаём кэш немедленно, обновляем в фоне */
async function staleWhileRevalidate(req, cacheName) {
    const cache  = await caches.open(cacheName);
    const cached = await cache.match(req);
    const fresh  = fetch(req)
        .then(r => { if (r.ok) cache.put(req, r.clone()); return r; })
        .catch(() => null);
    return cached || (await fresh);
}

/** Network с кэш-фолбэком */
async function networkWithFallback(req) {
    try {
        const res = await fetch(req);
        if (res.ok) {
            caches.open(STATIC_CACHE)
                .then(c => c.put(req, res.clone()))
                .catch(() => {});
        }
        return res;
    } catch (_) {
        const cached = await caches.match(req);
        return cached || new Response('', { status: 503 });
    }
}

/** fetch с таймаутом */
function fetchWithTimeout(req, ms) {
    const ctrl = new AbortController();
    const id   = setTimeout(() => ctrl.abort(), ms);
    return fetch(req, { signal: ctrl.signal }).finally(() => clearTimeout(id));
}

/** Оффлайн страница */
function offlinePage() {
    return new Response(
        `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>WayChat — Нет сети</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{height:100%;background:#111113;color:#fff;
      font-family:-apple-system,BlinkMacSystemFont,sans-serif;
      display:flex;align-items:center;justify-content:center}
    .c{text-align:center;padding:20px}
    .ico{font-size:72px;margin-bottom:24px;display:block}
    h1{font-size:24px;font-weight:800;margin-bottom:10px}
    p{color:rgba(255,255,255,.45);font-size:15px;line-height:1.6;margin-bottom:28px}
    button{padding:14px 32px;background:#10b981;border:none;border-radius:16px;
      color:#000;font-size:16px;font-weight:800;cursor:pointer;font-family:inherit}
    button:active{transform:scale(.96)}
  </style>
</head>
<body>
  <div class="c">
    <span class="ico">📡</span>
    <h1>Нет подключения</h1>
    <p>Проверьте интернет и попробуйте снова.<br>Ранее открытые чаты доступны в кэше.</p>
    <button onclick="location.reload()">Попробовать снова</button>
  </div>
</body>
</html>`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
}

// ════════════════════════════════════════════════════════════
//  PUSH УВЕДОМЛЕНИЯ
// ════════════════════════════════════════════════════════════
self.addEventListener('push', event => {
    if (!event.data) return;
    let d;
    try { d = event.data.json(); }
    catch  { d = { title: 'WayChat', body: event.data.text() }; }

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
        self.clients
            .matchAll({ type: 'window', includeUncontrolled: true })
            .then(clients => {
                for (const c of clients) {
                    if (c.url.includes(self.location.origin) && 'focus' in c)
                        return c.focus();
                }
                return self.clients.openWindow(url);
            })
    );
});

// ════════════════════════════════════════════════════════════
//  BACKGROUND SYNC
// ════════════════════════════════════════════════════════════
self.addEventListener('sync', event => {
    if (event.tag === 'wc-msg-queue') {
        console.log('[SW] Background sync: msg queue');
    }
});
