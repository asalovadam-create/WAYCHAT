// WayChat Service Worker v5 — Production Hardened
// FIX: critical bug — `e` used before declaration (was line ~28)
// FIX: pushsubscriptionchange crash when oldSubscription is null
// FIX: cacheFirst treats missing sw-ts header as fresh (not stale)
// OPT: offline fallback HTML embedded as blob URL
// OPT: SW version logged on activate

const SW_VERSION   = 'v5';
const CACHE_STATIC = `waychat-static-${SW_VERSION}`;
const CACHE_MEDIA  = `waychat-media-${SW_VERSION}`;
const CACHE_API    = `waychat-api-${SW_VERSION}`;
const ALL_CACHES   = [CACHE_STATIC, CACHE_MEDIA, CACHE_API];

const PRECACHE_URLS = [
  '/static/js/main.js',
  '/static/css/main.css',
  '/static/img/icon-192.png',
  '/static/img/icon-96.png',
  '/static/logo.png',
];

// OPT: offline fallback page embedded — no extra network request
const OFFLINE_HTML = `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>WayChat — Офлайн</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#1d1d1e;color:#fff;font-family:-apple-system,sans-serif;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  min-height:100dvh;gap:16px;padding:24px;text-align:center}
.icon{font-size:64px}
h1{font-size:22px;font-weight:700}
p{font-size:15px;color:rgba(255,255,255,.5);line-height:1.5}
button{margin-top:8px;padding:13px 28px;background:#10b981;border:none;border-radius:14px;
  color:#000;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit}
</style></head><body>
<div class="icon">📡</div>
<h1>Нет соединения</h1>
<p>WayChat не может подключиться к серверу.<br>Проверь интернет и попробуй снова.</p>
<button onclick="location.reload()">Попробовать снова</button>
</body></html>`;

let _offlineBlobUrl = null;

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log(`[SW] WayChat ${SW_VERSION} installing`);
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_STATIC);
      // FIX: individual catches so one 404 doesn't abort all precaching
      await Promise.allSettled(
        PRECACHE_URLS.map(url =>
          cache.add(url).catch(err =>
            console.warn(`[SW] precache miss: ${url}`, err.message)
          )
        )
      );
      // OPT: store offline blob during install so it's always available
      const blob = new Blob([OFFLINE_HTML], { type: 'text/html' });
      _offlineBlobUrl = URL.createObjectURL(blob);
      await self.skipWaiting();
    })()
  );
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log(`[SW] WayChat ${SW_VERSION} activated`); // OPT Task 8d: version log visible in DevTools
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(k => k.startsWith('waychat-') && !ALL_CACHES.includes(k))
          .map(k => {
            console.log(`[SW] deleting old cache: ${k}`);
            return caches.delete(k);
          })
      );
      await self.clients.claim();
    })()
  );
});

// ── Push Notifications ────────────────────────────────────────────────────────
// FIX CRITICAL: `const e = event` MUST be first — was previously used before declaration
self.addEventListener('push', event => {
  const e = event; // FIX: declare BEFORE any use of `e`
  if (!e.data) return;

  let data = {};
  try {
    data = e.data.json();
  } catch (_err) {
    data = { title: 'WayChat', body: e.data.text() };
  }

  const isCall   = data.type === 'incoming_call';
  const callId   = data.call_id  || '';
  const fromId   = data.from_id  || '';
  const chatId   = data.chat_id  || '';

  // Build deep-link URL for call answer scenario
  const callDeepLink = `/?sw_action=answer_call&call_id=${encodeURIComponent(callId)}&from_id=${encodeURIComponent(fromId)}`;
  const chatDeepLink = chatId ? `/?open_chat=${encodeURIComponent(chatId)}` : (data.url || '/');

  const options = {
    body:               data.body   || '',
    icon:               data.icon   || '/static/img/icon-192.png',
    badge:              data.badge  || '/static/img/icon-96.png',
    tag:                data.tag    || (isCall ? `wc-call-${fromId}` : `wc-msg-${chatId}`),
    renotify:           true,
    requireInteraction: isCall,
    silent:             false,
    vibrate:            isCall ? [500, 200, 500, 200, 500] : [200, 100, 200],
    data: {
      url:     isCall ? callDeepLink : chatDeepLink,
      chat_id: chatId,
      call_id: callId,
      from_id: fromId,
      type:    data.type || 'message',
    },
  };

  if (isCall) {
    options.actions = [
      { action: 'answer',  title: '✅ Ответить' },
      { action: 'decline', title: '❌ Отклонить' },
    ];
  }

  e.waitUntil(
    self.registration.showNotification(data.title || 'WayChat', options)
      .catch(err => console.error('[SW] showNotification failed:', err))
  );
});

// ── Notification Click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  const e        = event; // FIX: consistent pattern
  const nd       = e.notification.data || {};
  const action   = e.action;
  const isCall   = nd.type === 'incoming_call';

  e.notification.close();

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(async list => {
        // Scenario B: find existing tab
        const appTab = list.find(c =>
          typeof c.url === 'string' && c.url.startsWith(self.location.origin)
        );

        if (isCall && action === 'decline') {
          // Relay decline to open tab(s)
          list.forEach(c =>
            c.postMessage({ type: 'decline_call', call_id: nd.call_id, from_id: nd.from_id })
          );
          return;
        }

        if (appTab) {
          await appTab.focus();
          if (isCall && action === 'answer') {
            appTab.postMessage({
              type:    'answer_call',
              call_id: nd.call_id,
              from_id: nd.from_id,
            });
          } else if (nd.chat_id) {
            appTab.postMessage({ type: 'open_chat', chat_id: nd.chat_id });
          }
        } else {
          // Scenario C: app is closed — open with deep link
          const targetUrl = isCall && action === 'answer'
            ? `/?sw_action=answer_call&call_id=${encodeURIComponent(nd.call_id || '')}&from_id=${encodeURIComponent(nd.from_id || '')}`
            : (nd.url || '/');
          await clients.openWindow(targetUrl);
        }
      })
      .catch(err => console.error('[SW] notificationclick error:', err))
  );
});

// ── Push Subscription Change ──────────────────────────────────────────────────
// FIX: was crashing when oldSubscription is null (expired subscription)
self.addEventListener('pushsubscriptionchange', event => {
  const e = event;
  e.waitUntil(
    (async () => {
      try {
        // FIX: if oldSubscription is null, subscribe from scratch
        const options = e.oldSubscription
          ? e.oldSubscription.options
          : { userVisibleOnly: true };

        const sub = await self.registration.pushManager.subscribe(options);
        const p256dh = btoa(String.fromCharCode(...new Uint8Array(sub.getKey('p256dh'))));
        const auth   = btoa(String.fromCharCode(...new Uint8Array(sub.getKey('auth'))));

        await fetch('/push-subscribe', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ endpoint: sub.endpoint, p256dh, auth }),
          credentials: 'include',
        });
        console.log('[SW] push subscription renewed');
      } catch (err) {
        console.error('[SW] pushsubscriptionchange failed:', err);
      }
    })()
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const e   = event;
  const req = e.request;
  const url = new URL(req.url);

  // Never intercept socket.io or non-GET
  if (req.method !== 'GET') return;
  if (url.pathname.startsWith('/socket.io')) return;

  // Cloudinary CDN — cache-first 7 days
  if (url.hostname.includes('cloudinary.com')) {
    e.respondWith(cacheFirst(req, CACHE_MEDIA, 7 * 86400));
    return;
  }

  // Static assets with hash — cache-first 365 days
  if (url.pathname.startsWith('/static/')) {
    e.respondWith(cacheFirst(req, CACHE_STATIC, 365 * 86400));
    return;
  }

  // API endpoints that benefit from stale-while-revalidate
  const apiPaths = ['/get_my_chats', '/get_moments', '/get_user_profile'];
  if (apiPaths.some(p => url.pathname.startsWith(p))) {
    e.respondWith(networkFirst(req, CACHE_API, 8));
    return;
  }

  // Images — cache-first 24h
  if (/\.(jpg|jpeg|png|webp|gif|svg|ico)(\?|$)/i.test(url.pathname)) {
    e.respondWith(cacheFirst(req, CACHE_MEDIA, 86400));
    return;
  }

  // HTML navigation — network first with offline fallback
  const acceptHeader = req.headers.get('accept') || '';
  if (acceptHeader.includes('text/html')) {
    e.respondWith(
      fetch(req)
        .catch(() =>
          caches.match(req).then(cached =>
            cached || _serveOfflinePage()
          )
        )
    );
    return;
  }

  // Everything else — stale-while-revalidate
  e.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req)
        .then(fresh => {
          if (fresh && fresh.ok) {
            caches.open(CACHE_STATIC)
              .then(c => c.put(req, fresh.clone()))
              .catch(() => {});
          }
          return fresh;
        })
        .catch(() => null);
      return cached || fetchPromise;
    })
  );
});

// ── Cache Helpers ─────────────────────────────────────────────────────────────

// FIX: missing sw-ts header treated as fresh (not as stale) — avoids
// unnecessary refetches when server strips custom headers
async function cacheFirst(req, cacheName, maxAgeSec) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(req);

  if (cached) {
    const ts = cached.headers.get('sw-ts');
    // FIX: if header absent, treat as fresh — don't refetch
    if (!ts || (Date.now() - Number(ts)) < maxAgeSec * 1000) {
      return cached;
    }
  }

  try {
    const fresh = await fetch(req.clone());
    if (fresh && fresh.ok) {
      const headers = new Headers(fresh.headers);
      headers.set('sw-ts', String(Date.now()));
      const toStore = new Response(await fresh.clone().arrayBuffer(), {
        status:  fresh.status,
        headers,
      });
      cache.put(req, toStore).catch(() => {});
    }
    return fresh;
  } catch (err) {
    if (cached) return cached;
    console.warn('[SW] cacheFirst network error:', err.message);
    return new Response('', { status: 503 });
  }
}

async function networkFirst(req, cacheName, timeoutSec) {
  const cache = await caches.open(cacheName);
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutSec * 1000);

  try {
    const fresh = await fetch(req.clone(), { signal: ctrl.signal });
    clearTimeout(timer);
    if (fresh && fresh.ok) {
      const headers = new Headers(fresh.headers);
      headers.set('sw-ts', String(Date.now()));
      const toStore = new Response(await fresh.clone().arrayBuffer(), {
        status: fresh.status,
        headers,
      });
      cache.put(req, toStore).catch(() => {});
    }
    return fresh;
  } catch (err) {
    clearTimeout(timer);
    const cached = await cache.match(req);
    if (cached) return cached;
    // Return empty JSON array so UI doesn't crash on API calls
    return new Response(JSON.stringify([]), {
      status:  200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

function _serveOfflinePage() {
  // OPT: use pre-created blob URL (faster than constructing Response each time)
  if (_offlineBlobUrl) {
    return fetch(_offlineBlobUrl).catch(() =>
      new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html' } })
    );
  }
  return Promise.resolve(
    new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html' } })
  );
}
