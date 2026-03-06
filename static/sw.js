// WayChat Service Worker v2.0
// Web Push для iOS Safari 16.4+ (только если установлено как PWA)

const CACHE = 'waychat-v2';
const PRECACHE = ['/static/img/icon-192.png', '/static/img/badge-96.png'];

// ── Установка — кэшируем иконки ──
self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// ── Fetch — иконки из кэша ──
self.addEventListener('fetch', e => {
    if (PRECACHE.some(p => e.request.url.endsWith(p))) {
        e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
    }
});

// ── Push уведомление ──
self.addEventListener('push', e => {
    if (!e.data) return;

    let data = {};
    try { data = e.data.json(); } catch(_) { data = { title: 'WayChat', body: e.data.text() }; }

    const title  = data.title  || 'WayChat';
    const body   = data.body   || 'Новое сообщение';
    const icon   = data.icon   || '/static/img/icon-192.png';
    const badge  = data.badge  || '/static/img/badge-96.png';
    const tag    = data.tag    || 'waychat-msg';
    const chatId = data.chat_id || null;

    e.waitUntil(
        self.registration.showNotification(title, {
            body,
            icon,
            badge,
            tag,
            data:             { chat_id: chatId, url: data.url || '/' },
            silent:           false,
            renotify:         true,
            requireInteraction: false,
            // iOS: vibrate не поддерживается, но добавляем для Android
            vibrate:          [200, 100, 200],
        })
    );
});

// ── Клик по уведомлению → открыть чат ──
self.addEventListener('notificationclick', e => {
    e.notification.close();
    const chatId = e.notification.data?.chat_id;
    const url    = e.notification.data?.url || '/';

    e.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
            // Если приложение открыто — фокус и переходим в чат
            for (const client of clients) {
                if (client.url.startsWith(self.location.origin)) {
                    client.focus();
                    if (chatId) client.postMessage({ type: 'open_chat', chat_id: chatId });
                    return;
                }
            }
            // Иначе открываем
            return self.clients.openWindow(chatId ? `/?chat=${chatId}` : url);
        })
    );
});