// WayChat Service Worker v4 — push notifications + caching
const CACHE_NAME = 'waychat-v4';
const STATIC_CACHE = 'waychat-static-v4';
const MEDIA_CACHE  = 'waychat-media-v4';

// Файлы которые кешируем при установке
const PRECACHE = [
  '/static/js/main.js',
  '/static/css/main.css',
];

// ── Install ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      return Promise.allSettled(PRECACHE.map(url => cache.add(url).catch(() => {})));
    }).then(() => self.skipWaiting())
  );
});

// ── Activate ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => ![CACHE_NAME, STATIC_CACHE, MEDIA_CACHE].includes(k) && k.startsWith('waychat-'))
          .map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// ── Fetch ──
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // 1. Cloudinary медиа — cache-first, храним долго
  if (url.hostname.includes('cloudinary.com') || url.hostname.includes('res.cloudinary')) {
    e.respondWith(cacheFirst(e.request, MEDIA_CACHE, 7 * 24 * 60 * 60));
    return;
  }

  // 2. Статика (/static/) — cache-first
  if (url.pathname.startsWith('/static/')) {
    e.respondWith(cacheFirst(e.request, STATIC_CACHE, 24 * 60 * 60));
    return;
  }

  // 3. API запросы — network-first, с быстрым fallback из кеша
  if (url.pathname.startsWith('/get_my_chats') ||
      url.pathname.startsWith('/get_moments') ||
      url.pathname.startsWith('/get_user_profile')) {
    e.respondWith(networkFirstWithCache(e.request, CACHE_NAME, 30));
    return;
  }

  // 4. Аватарки и другие изображения — cache-first
  if (url.pathname.match(/\.(jpg|jpeg|png|webp|gif|svg)(\?|$)/i)) {
    e.respondWith(cacheFirst(e.request, MEDIA_CACHE, 24 * 60 * 60));
    return;
  }

  // 5. Остальное — обычный fetch
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});

// Cache-first: сначала кеш, если нет — сеть
async function cacheFirst(request, cacheName, maxAgeSeconds) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    const date = cached.headers.get('sw-cached-at');
    if (!date || (Date.now() - parseInt(date)) < maxAgeSeconds * 1000) {
      return cached;
    }
  }
  try {
    const resp = await fetch(request);
    if (resp.ok) {
      const clone = resp.clone();
      // Добавляем заголовок с временем кеширования
      const headers = new Headers(clone.headers);
      headers.set('sw-cached-at', Date.now().toString());
      const cachedResp = new Response(await clone.blob(), { status: clone.status, headers });
      cache.put(request, cachedResp);
    }
    return resp;
  } catch(e) {
    return cached || new Response('', {status: 503});
  }
}

// Network-first: сначала сеть (быстро), fallback из кеша
async function networkFirstWithCache(request, cacheName, maxAgeSeconds) {
  const cache = await caches.open(cacheName);
  try {
    const resp = await Promise.race([
      fetch(request),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000))
    ]);
    if (resp.ok) {
      const headers = new Headers(resp.headers);
      headers.set('sw-cached-at', Date.now().toString());
      const cachedResp = new Response(await resp.clone().blob(), { status: resp.status, headers });
      cache.put(request, cachedResp);
    }
    return resp;
  } catch(e) {
    const cached = await cache.match(request);
    return cached || new Response(JSON.stringify([]), {
      status: 200, headers: {'Content-Type': 'application/json'}
    });
  }
}

// ══════════════════════════════════════════════════════════
//  PUSH УВЕДОМЛЕНИЯ — iOS 16.4+ PWA + Android Chrome
// ══════════════════════════════════════════════════════════
self.addEventListener('push', e => {
    let data = {};
    try {
        data = e.data ? e.data.json() : {};
    } catch(err) {
        data = { title: 'WayChat', body: e.data ? e.data.text() : 'Новое сообщение' };
    }

    const title   = data.title   || 'WayChat';
    const body    = data.body    || 'Новое сообщение';
    const icon    = data.icon    || '/static/img/icon-192.png';
    const badge   = data.badge   || '/static/img/badge-96.png';
    const tag     = data.tag     || 'waychat-msg';
    const chatId  = data.chat_id || null;
    const url     = data.url     || '/';

    const options = {
        body,
        icon,
        badge,
        tag,
        // renotify: true — новый звук даже если tag совпадает
        renotify: true,
        // requireInteraction: false — уведомление исчезает само
        requireInteraction: false,
        // vibrate — только Android, iOS игнорирует
        vibrate: [200, 100, 200],
        data: { url, chat_id: chatId },
        // actions — только Android Chrome, iOS игнорирует но не ломает
        actions: [
            { action: 'open', title: 'Открыть' },
            { action: 'dismiss', title: 'Закрыть' }
        ]
    };

    // iOS требует showNotification из waitUntil — иначе не показывает
    e.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// ══════════════════════════════════════════════════════════
//  КЛИК ПО УВЕДОМЛЕНИЮ
// ══════════════════════════════════════════════════════════
self.addEventListener('notificationclick', e => {
    e.notification.close();

    if (e.action === 'dismiss') return;

    const chatId = e.notification.data?.chat_id;
    const url    = e.notification.data?.url || '/';

    e.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            // Ищем уже открытую вкладку WayChat
            for (const client of clientList) {
                const clientUrl = new URL(client.url);
                if (clientUrl.pathname === '/' || clientUrl.pathname.startsWith('/chat')) {
                    // Фокусируем и сообщаем открыть конкретный чат
                    client.focus();
                    if (chatId) client.postMessage({ type: 'open_chat', chat_id: chatId });
                    return;
                }
            }
            // Открываем новую вкладку
            const targetUrl = chatId ? `/?open_chat=${chatId}` : url;
            return clients.openWindow(targetUrl);
        })
    );
});

// ══════════════════════════════════════════════════════════
//  ОБНОВЛЕНИЕ ПОДПИСКИ (iOS пересоздаёт ключи)
// ══════════════════════════════════════════════════════════
self.addEventListener('pushsubscriptionchange', e => {
    e.waitUntil(
        self.registration.pushManager.subscribe({
            userVisibleOnly:      true,
            applicationServerKey: e.oldSubscription?.options?.applicationServerKey
        }).then(sub => {
            const subJson = sub.toJSON();
            return fetch('/push-subscribe', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    endpoint: subJson.endpoint,
                    p256dh:   subJson.keys?.p256dh || '',
                    auth:     subJson.keys?.auth   || '',
                })
            });
        }).catch(() => {})
    );
});
