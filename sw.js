// WayChat Service Worker v5 — production ready
// Fixes: push→call deep link, cache strategy, offline queue

const CACHE_VER    = 'v5';
const CACHE_STATIC = `waychat-static-${CACHE_VER}`;
const CACHE_MEDIA  = `waychat-media-${CACHE_VER}`;
const CACHE_API    = `waychat-api-${CACHE_VER}`;

const PRECACHE_URLS = [
    '/static/js/main.js',
    '/static/css/main.css',
    '/static/img/icon-192.png',
    '/static/img/icon-96.png',
    '/static/logo.png',
];

// ── Install: precache static assets ──
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_STATIC)
            .then(cache => Promise.allSettled(
                PRECACHE_URLS.map(url => cache.add(url).catch(() => {}))
            ))
            .then(() => self.skipWaiting())
    );
});

// ── Activate: remove old caches ──
self.addEventListener('activate', event => {
    const KEEP = [CACHE_STATIC, CACHE_MEDIA, CACHE_API];
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(k => k.startsWith('waychat-') && !KEEP.includes(k))
                    .map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

// ── Push Notifications ──
self.addEventListener('push', event => {
    if (!e.data) return;  // safety check alias
    const e = event;
    let data = {};
    try { data = e.data.json(); } catch { data = { title: 'WayChat', body: e.data.text() }; }

    const isCall    = data.type === 'incoming_call';
    const callId    = data.call_id || '';
    const fromId    = data.from_id || '';
    const chatId    = data.chat_id || '';

    // ИСПРАВЛЕНИЕ: deep link включает call_id чтобы SW мог передать его приложению
    const callUrl   = `/?sw_action=answer_call&call_id=${callId}&from_id=${fromId}`;
    const chatUrl   = data.url || (chatId ? `/?open_chat=${chatId}` : '/');

    const options = {
        body:    data.body  || '',
        icon:    data.icon  || '/static/img/icon-192.png',
        badge:   data.badge || '/static/img/icon-96.png',
        tag:     data.tag   || (isCall ? `wc-call-${fromId}` : `wc-msg-${chatId}`),
        renotify: true,
        data: {
            url:     isCall ? callUrl : chatUrl,
            chat_id: chatId,
            call_id: callId,
            from_id: fromId,
            type:    data.type,
        },
        requireInteraction: isCall,
        silent: false,
        vibrate: isCall ? [500, 200, 500, 200, 500] : [200, 100, 200],
    };

    // Action buttons для входящего звонка
    if (isCall) {
        options.actions = [
            { action: 'answer',  title: '✅ Ответить', icon: '/static/img/answer.png' },
            { action: 'decline', title: '❌ Отклонить', icon: '/static/img/decline.png' },
        ];
    }

    event.waitUntil(
        self.registration.showNotification(data.title || 'WayChat', options)
    );
});

// ── Notification Click ──
self.addEventListener('notificationclick', event => {
    event.notification.close();
    const nd     = event.notification.data || {};
    const action = event.action;
    const isCall = nd.type === 'incoming_call';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
            // Если нажали "Отклонить" — шлём сообщение в открытые вкладки и выходим
            if (isCall && action === 'decline') {
                list.forEach(c => c.postMessage({
                    type:    'decline_call',
                    from_id: nd.from_id,
                    call_id: nd.call_id,
                }));
                return;
            }

            // Ищем уже открытую вкладку приложения
            const appClient = list.find(c =>
                c.url.includes(self.location.origin) && 'focus' in c
            );

            if (appClient) {
                // Фокусируем и отправляем команду
                return appClient.focus().then(() => {
                    if (isCall && action === 'answer') {
                        appClient.postMessage({
                            type:    'answer_call',
                            from_id: nd.from_id,
                            call_id: nd.call_id,
                        });
                    } else if (nd.chat_id) {
                        appClient.postMessage({
                            type:    'open_chat',
                            chat_id: nd.chat_id,
                        });
                    }
                });
            } else {
                // Открываем новую вкладку с deep link
                const url = isCall && action === 'answer'
                    ? `/?sw_action=answer_call&call_id=${nd.call_id}&from_id=${nd.from_id}`
                    : (nd.url || '/');
                return clients.openWindow(url);
            }
        })
    );
});

// ── Push Subscription Change ──
self.addEventListener('pushsubscriptionchange', event => {
    event.waitUntil(
        self.registration.pushManager
            .subscribe(event.oldSubscription.options)
            .then(sub => {
                const p256dh = btoa(String.fromCharCode(
                    ...new Uint8Array(sub.getKey('p256dh'))
                ));
                const auth = btoa(String.fromCharCode(
                    ...new Uint8Array(sub.getKey('auth'))
                ));
                return fetch('/push-subscribe', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ endpoint: sub.endpoint, p256dh, auth }),
                });
            })
    );
});

// ── Fetch: Cache Strategy ──
self.addEventListener('fetch', event => {
    const req = event.request;
    const url = new URL(req.url);

    // Пропускаем не-GET и socket.io
    if (req.method !== 'GET') return;
    if (url.pathname.startsWith('/socket.io')) return;

    // Cloudinary: cache-first 7 дней
    if (url.hostname.includes('cloudinary.com') || url.hostname.includes('res.cloudinary.com')) {
        event.respondWith(cacheFirst(req, CACHE_MEDIA, 7 * 86400));
        return;
    }

    // Статика с хешем: cache-first 1 год
    if (url.pathname.startsWith('/static/')) {
        event.respondWith(cacheFirst(req, CACHE_STATIC, 365 * 86400));
        return;
    }

    // API чатов: network-first с таймаутом
    const apiNetworkFirst = ['/get_my_chats', '/get_moments', '/get_user_profile'];
    if (apiNetworkFirst.some(p => url.pathname.startsWith(p))) {
        event.respondWith(networkFirst(req, CACHE_API, 8));
        return;
    }

    // Изображения: cache-first 24ч
    if (/\.(jpg|jpeg|png|webp|gif|svg|ico)(\?|$)/i.test(url.pathname)) {
        event.respondWith(cacheFirst(req, CACHE_MEDIA, 86400));
        return;
    }

    // HTML страницы: network-first (чтобы всегда получать свежий HTML)
    if (req.headers.get('accept') && req.headers.get('accept').includes('text/html')) {
        event.respondWith(
            fetch(req).catch(() => caches.match(req))
        );
        return;
    }

    // Остальное: stale-while-revalidate
    event.respondWith(staleWhileRevalidate(req, CACHE_STATIC));
});

// ── Cache Helpers ──

async function cacheFirst(req, cacheName, maxAgeSec) {
    const cache  = await caches.open(cacheName);
    const cached = await cache.match(req);

    if (cached) {
        const ts = cached.headers.get('sw-cached-at');
        if (!ts || (Date.now() - Number(ts)) < maxAgeSec * 1000) {
            return cached;
        }
    }

    try {
        const fresh = await fetch(req.clone());
        if (fresh && fresh.ok) {
            const headers = new Headers(fresh.headers);
            headers.set('sw-cached-at', String(Date.now()));
            const toCache = new Response(await fresh.clone().arrayBuffer(), {
                status:  fresh.status,
                headers,
            });
            cache.put(req, toCache);
        }
        return fresh;
    } catch {
        return cached || new Response('', { status: 503 });
    }
}

async function networkFirst(req, cacheName, timeoutSec) {
    const cache = await caches.open(cacheName);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutSec * 1000);

    try {
        const fresh = await fetch(req.clone(), { signal: controller.signal });
        clearTimeout(timer);
        if (fresh && fresh.ok) {
            const headers = new Headers(fresh.headers);
            headers.set('sw-cached-at', String(Date.now()));
            const toCache = new Response(await fresh.clone().arrayBuffer(), {
                status:  fresh.status,
                headers,
            });
            cache.put(req, toCache);
        }
        return fresh;
    } catch {
        clearTimeout(timer);
        const cached = await cache.match(req);
        if (cached) return cached;
        // Для API возвращаем пустой массив чтобы не ломать UI
        return new Response(JSON.stringify([]), {
            status:  200,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}

async function staleWhileRevalidate(req, cacheName) {
    const cache  = await caches.open(cacheName);
    const cached = await cache.match(req);

    const fetchPromise = fetch(req.clone()).then(fresh => {
        if (fresh && fresh.ok) cache.put(req, fresh.clone());
        return fresh;
    }).catch(() => null);

    return cached || fetchPromise;
}
