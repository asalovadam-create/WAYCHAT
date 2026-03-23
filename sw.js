/**
 * WayChat Service Worker v6
 * FIX: URL.createObjectURL is NOT available in SW scope — removed
 */

const CACHE_NAME = 'waychat-v6';
const STATIC_ASSETS = [
    '/',
    '/static/js/main.js',
    '/static/logo.png',
    '/static/img/icon-192.png',
];

// Install — cache static assets
self.addEventListener('install', (event) => {
    console.log('[SW] WayChat v6 installing');
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(STATIC_ASSETS).catch(err => {
                console.warn('[SW] Some assets failed to cache:', err);
            });
        })
    );
    self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] WayChat v6 activating');
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch — network first for API, cache first for static
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET and socket.io
    if (event.request.method !== 'GET') return;
    if (url.pathname.includes('/socket.io')) return;

    // API calls — network only
    if (url.pathname.startsWith('/get_') ||
        url.pathname.startsWith('/api/') ||
        url.pathname.startsWith('/search') ||
        url.pathname.startsWith('/create_') ||
        url.pathname.startsWith('/send_') ||
        url.pathname.startsWith('/upload')) {
        return;
    }

    // Static assets — stale-while-revalidate
    event.respondWith(
        caches.match(event.request).then(cached => {
            const fetchPromise = fetch(event.request).then(response => {
                if (response && response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, clone);
                    });
                }
                return response;
            }).catch(() => cached);

            return cached || fetchPromise;
        })
    );
});

// Push notifications
self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (e) {
        data = { title: 'WayChat', body: event.data ? event.data.text() : '' };
    }

    const title = data.title || 'WayChat';
    const options = {
        body: data.body || '',
        icon: data.icon || '/static/img/icon-192.png',
        badge: '/static/img/icon-192.png',
        tag: data.tag || 'waychat-msg',
        renotify: true,
        vibrate: [100, 50, 100],
        data: data.data || {},
        actions: []
    };

    // Call notifications with answer/decline actions
    if (data.type === 'call') {
        options.tag = 'waychat-call';
        options.requireInteraction = true;
        options.actions = [
            { action: 'answer', title: '📞 Ответить' },
            { action: 'decline', title: '❌ Отклонить' }
        ];
        options.vibrate = [200, 100, 200, 100, 200];
    }

    // Message notifications with reply action
    if (data.type === 'message') {
        options.actions = [
            { action: 'reply', title: '💬 Ответить' },
            { action: 'read', title: '✓ Прочитано' }
        ];
    }

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// Notification click
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const data = event.notification.data || {};
    const action = event.action;

    if (action === 'answer' && data.call_id) {
        event.waitUntil(
            self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
                if (clients.length > 0) {
                    clients[0].postMessage({
                        type: 'answer_call',
                        call_id: data.call_id,
                        from_id: data.from_id
                    });
                    return clients[0].focus();
                } else {
                    return self.clients.openWindow(
                        '/?sw_action=answer_call&call_id=' + (data.call_id || '') + '&from_id=' + (data.from_id || '')
                    );
                }
            })
        );
        return;
    }

    if (action === 'decline' && data.call_id) {
        event.waitUntil(
            self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
                if (clients.length > 0) {
                    clients[0].postMessage({
                        type: 'decline_call',
                        call_id: data.call_id,
                        from_id: data.from_id
                    });
                }
            })
        );
        return;
    }

    // Open chat on message click
    if (data.chat_id) {
        event.waitUntil(
            self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
                if (clients.length > 0) {
                    clients[0].postMessage({
                        type: 'open_chat',
                        chat_id: data.chat_id
                    });
                    return clients[0].focus();
                } else {
                    return self.clients.openWindow('/?open_chat=' + data.chat_id);
                }
            })
        );
        return;
    }

    // Default — open app
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
            if (clients.length > 0) return clients[0].focus();
            return self.clients.openWindow('/');
        })
    );
});

// Skip waiting on message
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
