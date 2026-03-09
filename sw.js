// WayChat Service Worker v4 — optimized for speed
const CACHE_NAME   = 'waychat-v4';
const STATIC_CACHE = 'waychat-static-v4';
const MEDIA_CACHE  = 'waychat-media-v4';

const PRECACHE = ['/static/js/main.js', '/static/css/main.css'];

// ── Install ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(STATIC_CACHE)
      .then(c => Promise.allSettled(PRECACHE.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

// ── Activate ──
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

// ── Push уведомления ──
self.addEventListener('push', e => {
  if (!e.data) return;
  let data = {};
  try { data = e.data.json(); } catch { data = { title: 'WayChat', body: e.data.text() }; }

  const isCall = data.type === 'incoming_call';

  const options = {
    body:    data.body  || '',
    icon:    data.icon  || '/static/img/icon-192.png',
    badge:   data.badge || '/static/img/icon-96.png',
    tag:     data.tag   || (isCall ? 'wc-incoming-call' : 'waychat-msg'),
    data:    { url: data.url || '/', chat_id: data.chat_id, type: data.type, from_id: data.from_id },
    requireInteraction: isCall,
    silent: false,
    vibrate: isCall ? [500, 200, 500, 200, 500] : [200],
  };

  // Кнопки для звонка (Android Chrome поддерживает actions в SW)
  if (isCall) {
    options.actions = [
      { action: 'answer',  title: '✅ Ответить' },
      { action: 'decline', title: '❌ Отклонить' },
    ];
  }

  e.waitUntil(self.registration.showNotification(data.title || 'WayChat', options));
});

// ── Клик по уведомлению ──
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const notifData = e.notification.data || {};
  const action    = e.action;
  const isCall    = notifData.type === 'incoming_call';

  // Если нажали "Отклонить" на звонке — просто закрываем
  if (isCall && action === 'decline') {
    // Отправляем сообщение в открытые вкладки чтобы отклонили
    e.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
        list.forEach(c => c.postMessage({ type: 'decline_call', from_id: notifData.from_id }));
      })
    );
    return;
  }

  const url = notifData.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const wc = list.find(c => c.url.includes(self.location.origin));
      if (wc) {
        wc.focus();
        if (isCall && action === 'answer') {
          wc.postMessage({ type: 'answer_call' });
        } else if (notifData.chat_id) {
          wc.postMessage({ type: 'open_chat', chat_id: notifData.chat_id });
        }
      } else {
        // Открываем приложение
        clients.openWindow(isCall ? '/?action=answer_call' : url);
      }
    })
  );
});

// ── Обновление подписки ──
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

// ── Fetch ──
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // Cloudinary — cache-first 7 дней
  if (url.hostname.includes('cloudinary.com')) {
    e.respondWith(cacheFirst(e.request, MEDIA_CACHE, 7 * 86400));
    return;
  }
  // Статика — cache-first 24ч
  if (url.pathname.startsWith('/static/')) {
    e.respondWith(cacheFirst(e.request, STATIC_CACHE, 86400));
    return;
  }
  // API чатов/моментов — network-first 30с timeout
  if (['/get_my_chats', '/get_moments', '/get_user_profile'].some(p => url.pathname.startsWith(p))) {
    e.respondWith(networkFirst(e.request, CACHE_NAME, 30));
    return;
  }
  // Изображения — cache-first 24ч
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
    if (!ts || Date.now() - +ts < maxAge * 1000) return cached;
  }
  try {
    const resp = await fetch(req);
    if (resp.ok) {
      const h = new Headers(resp.headers);
      h.set('sw-ts', Date.now().toString());
      cache.put(req, new Response(await resp.clone().blob(), { status: resp.status, headers: h }));
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
    if (resp.ok) {
      const h = new Headers(resp.headers);
      h.set('sw-ts', Date.now().toString());
      cache.put(req, new Response(await resp.clone().blob(), { status: resp.status, headers: h }));
    }
    return resp;
  } catch {
    return (await cache.match(req))
      || new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
}
