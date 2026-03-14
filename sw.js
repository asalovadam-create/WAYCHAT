// WayChat Service Worker v5 — optimized for speed + offline
const CACHE_NAME   = 'waychat-v5';
const STATIC_CACHE = 'waychat-static-v5';
const MEDIA_CACHE  = 'waychat-media-v5';
const MAX_MEDIA    = 150;

const PRECACHE = ['/static/js/main.js'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(STATIC_CACHE)
      .then(c => Promise.allSettled(PRECACHE.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('waychat-') && ![CACHE_NAME, STATIC_CACHE, MEDIA_CACHE].includes(k))
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('push', e => {
  if (!e.data) return;
  let data = {};
  try { data = e.data.json(); } catch { data = { title: 'WayChat', body: e.data.text() }; }
  const options = {
    body:  data.body  || '',
    icon:  data.icon  || '/static/img/icon-192.png',
    tag:   data.tag   || 'waychat-msg',
    data:  { url: data.url || '/', chat_id: data.chat_id },
    requireInteraction: false,
    silent: false,
  };
  e.waitUntil(self.registration.showNotification(data.title || 'WayChat', options));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const wc = list.find(c => c.url.includes(self.location.origin));
      if (wc) { wc.focus(); wc.postMessage({ type: 'open_chat', chat_id: e.notification.data?.chat_id }); }
      else clients.openWindow(url);
    })
  );
});

self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil(
    self.registration.pushManager.subscribe(e.oldSubscription.options)
      .then(sub => fetch('/push-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          p256dh:   btoa(String.fromCharCode(...new Uint8Array(sub.getKey('p256dh')))),
          auth:     btoa(String.fromCharCode(...new Uint8Array(sub.getKey('auth')))),
        })
      }))
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.pathname.includes('/socket.io')) return;
  if (url.pathname.startsWith('/admin')) return;

  // Cloudinary — 7 дней
  if (url.hostname.includes('cloudinary.com') || url.hostname.includes('res.cloudinary.com')) {
    e.respondWith(cacheFirst(e.request, MEDIA_CACHE, 7 * 86400));
    return;
  }
  // stream_track аудио — 24ч
  if (url.pathname.startsWith('/stream_track/')) {
    e.respondWith(cacheFirst(e.request, MEDIA_CACHE, 86400));
    return;
  }
  // Медиа загрузки — 24ч
  if (url.pathname.startsWith('/static/uploads/')) {
    e.respondWith(cacheFirst(e.request, MEDIA_CACHE, 86400));
    return;
  }
  // JS/CSS/статика — 24ч
  if (url.pathname.startsWith('/static/')) {
    e.respondWith(cacheFirst(e.request, STATIC_CACHE, 86400));
    return;
  }
  // API — network-first 30с
  if (['/get_my_chats', '/get_moments', '/get_user_profile', '/api/channels'].some(p => url.pathname.startsWith(p))) {
    e.respondWith(networkFirst(e.request, CACHE_NAME, 30));
    return;
  }
  // Изображения — 24ч
  if (/\.(jpg|jpeg|png|webp|gif|svg)(\?|$)/i.test(url.pathname)) {
    e.respondWith(cacheFirst(e.request, MEDIA_CACHE, 86400));
    return;
  }
  // Остальное
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});

async function cacheFirst(req, cacheName, maxAge) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) {
    const ts = cached.headers.get('sw-ts');
    if (!ts || Date.now() - +ts < maxAge * 1000) {
      // Stale-while-revalidate: обновляем в фоне после 75% TTL
      if (ts && Date.now() - +ts > maxAge * 750) {
        fetch(req).then(r => { if (r && r.ok) _putWithTs(cache, req, r); }).catch(() => {});
      }
      return cached;
    }
  }
  try {
    const resp = await fetch(req);
    if (resp && resp.ok) {
      if (cacheName === MEDIA_CACHE) {
        cache.keys().then(keys => { if (keys.length >= MAX_MEDIA) cache.delete(keys[0]); });
      }
      _putWithTs(cache, req, resp.clone());
    }
    return resp;
  } catch { return cached || new Response('', { status: 503 }); }
}

async function networkFirst(req, cacheName, timeoutSec) {
  const cache = await caches.open(cacheName);
  try {
    const resp = await Promise.race([
      fetch(req),
      new Promise((_, r) => setTimeout(() => r(new Error('timeout')), timeoutSec * 1000))
    ]);
    if (resp && resp.ok) _putWithTs(cache, req, resp.clone());
    return resp;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
}

async function _putWithTs(cache, req, resp) {
  try {
    const h = new Headers(resp.headers);
    h.set('sw-ts', Date.now().toString());
    const body = await resp.blob();
    cache.put(req, new Response(body, { status: resp.status, statusText: resp.statusText, headers: h }));
  } catch {}
}
